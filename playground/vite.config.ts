import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * https://vite.dev/config/
 *
 * 不需要给 `dsh-pet-component` 配 alias：`tsdown` 的 `devExports` 把包的
 * `exports["."]` 指向 `./src/index.ts`，workspace 链接让 playground 直接按包名
 * 解析到源码（HMR 同时覆盖库与 playground）。
 */
export default defineConfig({
  plugins: [react()],
})
