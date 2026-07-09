// 平台 → adapter 的注册表。service 只通过它拿 adapter，永远不认识具体实现类。

import type { Platform } from "@social/shared"
import type { SocialPublisher } from "./ports"

export class PublisherRegistry {
  private readonly map = new Map<Platform, SocialPublisher>()

  register(publisher: SocialPublisher): this {
    this.map.set(publisher.platform, publisher)
    return this
  }

  get(platform: Platform): SocialPublisher | undefined {
    return this.map.get(platform)
  }

  has(platform: Platform): boolean {
    return this.map.has(platform)
  }

  platforms(): Platform[] {
    return [...this.map.keys()]
  }
}
