import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 只跑本包的测试：`source/` 下是参考项目（git submodule）的检出，
    // 它们自带的测试依赖各自的构建产物，不属于本包。
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'source/**', 'playground/**', 'docs/**'],
  },
})
