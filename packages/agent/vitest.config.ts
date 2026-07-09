// 本包 vitest 配置：钉死测试范围到本包 tests/，避免 vitest 往上误用到别处的配置。
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
})
