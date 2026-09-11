import { fileURLToPath } from 'node:url'
import { guardStaleBuild } from 'tsdown-stale-guard'
import { snapshotApiPerEntry } from 'tsnapi/vitest'
import { beforeAll, describe } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
/**
 * 快照指向 `test/fixtures/api-snapshot/`：那里用同一个包名声明了**发布入口**
 * （`../../dist/index.mjs`）。本包启用了 tsdown 的 `devExports`，开发期
 * `package.json` 的 `exports` 指向 `./src/index.ts`（发布期由 `publishConfig.exports`
 * 覆盖为 dist），而 tsnapi 只认 JS 入口 —— 直接传根目录会解析不到任何入口，
 * 快照就退化成 "no exports" 空跳过。
 */
const fixture = fileURLToPath(new URL('./fixtures/api-snapshot', import.meta.url))

describe('api snapshot', () => {
  beforeAll(async () => {
    await guardStaleBuild({ root })
  })

  snapshotApiPerEntry(fixture)
})
