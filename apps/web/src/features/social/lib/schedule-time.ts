// 排期时间工具 —— 全仓「日历日期字符串」的唯一真源。
//
// 背景（2026-07-15）：这套原型里，日历的日期是【显示字符串】（如 "Wed Jul 8"），不是时间戳。
// 于是曾经散落着三处互相打架的硬编码：
//   · calendar.tsx  WEEK_DAYS 写死 2026-07-06~12 那一周 —— 别的日期的任务【根本不显示在周视图里】
//   · store.addStudioToCalendar 默认 date="Wed Jul 8" time="09:00"
//   · store.schedulePost       默认 date="Wed Jul 8"
// 后果：用户排期永远落在 7 月 8 号，且看不出问题在哪。
//
// 这里把「格式约定」和「默认排期时刻」收成一处。
// ⚠️ 已知欠债：字符串日期无法做「到点了吗」的比较，所以【调度器没法按它查询】。
//    真正做自动发布时，schema 的 date/time varchar 要换成时间戳列（见 ssa_calendar_item）。
//    在那之前，这里的格式必须与 calendar.tsx 的周视图完全一致，否则任务会"消失"。

/** 排期默认提前量：从现在起 +10 分钟（用户 2026-07-15 需求：表单默认填当前时间之后 10 分钟）。 */
export const DEFAULT_SCHEDULE_LEAD_MINUTES = 10

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Date → 日历日期字符串（"Wed Jul 15"）。格式必须与 calendar.tsx 周视图的列头一致。 */
export function formatCalendarDate(d: Date): string {
  return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}`
}

/** Date → "HH:mm"（24 小时制，补零）。 */
export function formatCalendarTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/** 默认排期时刻 = 当前时间 + 10 分钟。表单初值用它，别再写死日期。 */
export function defaultScheduleAt(now: Date = new Date()): { date: string; time: string } {
  const d = new Date(now.getTime() + DEFAULT_SCHEDULE_LEAD_MINUTES * 60_000)
  return { date: formatCalendarDate(d), time: formatCalendarTime(d) }
}

/**
 * 当前周的 7 天（周一 → 周日），供日历周视图做列头。
 * 取代写死的 2026-07-06~12：否则用户今天排的期，在周视图里根本看不到。
 */
export function currentWeekDays(now: Date = new Date()): string[] {
  const monday = new Date(now)
  // getDay(): 0=周日。要回到本周一：周日往前 6 天，其余往前 (day-1) 天。
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return formatCalendarDate(d)
  })
}
