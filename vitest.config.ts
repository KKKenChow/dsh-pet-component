import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// 只跑本包的测试：`source/` 下是参考项目（git submodule）的检出，
// 它们自带的测试依赖各自的构建产物，不属于本包。
const sharedExclude = ['node_modules/**', 'dist/**', 'source/**', 'playground/**', 'docs/**']

export default defineConfig({
  test: {
    projects: [
      {
        // 纯逻辑与 Node 侧工具：`createBubbleTracker` / `createBubble` / jsonc / …
        test: {
          name: 'unit',
          include: ['test/**/*.test.ts'],
          exclude: [...sharedExclude, 'test/browser/**'],
        },
      },
      {
        // 真浏览器（真实 DOM + 真实过渡/定时器）：气泡层观感、动画真的在动、
        // React 副作用顺序（命令面与声明层的交班）。
        test: {
          name: 'browser',
          include: ['test/browser/**/*.test.tsx'],
          exclude: sharedExclude,
          browser: {
            enabled: true,
            headless: true,
            // 用本机已装的 Chrome，避免下载 Chromium（`playwright install` 那一步）。
            // 其他环境可换成 `channel: 'msedge'`，或删掉 `launchOptions` 用 Playwright 自带浏览器。
            provider: playwright({ launchOptions: { channel: 'chrome' } }) as any,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
