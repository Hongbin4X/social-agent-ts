// 本包 vitest 配置：钉死测试范围到本包 tests/，避免 vitest 往上误用到别处（如 axon/wbj）的配置。
// 对齐 @social/agent / @social/publisher 的写法，保持 workspace 内 vitest 配置一致。
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
})
