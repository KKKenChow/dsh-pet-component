# test/fixtures

## `pets/*.webm` —— dsh 渲染器的动作素材

仓库里本来没有媒体文件，演练场用的是远程 URL（测试不能联网），本机也没有系统 ffmpeg。
这 9 个文件（`idle` / `thinking` / `working` / `result` / `success` / `failed` / `error` /
`waiting` / `dragging`）是**同一份字节**：160×90、1 秒、VP8、约 5.4 KB 的 webm。

生成路径（Playwright 自带的极简 ffmpeg）：

1. 本机 Chrome 的 canvas 画出 12 张 **JPEG** 帧（12fps）；
2. 把拼接好的 mjpeg 字节写成临时文件，交给
   `%LOCALAPPDATA%\ms-playwright\ffmpeg-1011\ffmpeg-win64.exe`：

   ```powershell
   ffmpeg -y -c:v mjpeg -f image2pipe -framerate 12 -i frames.mjpeg `
          -c:v libvpx -b:v 120k -an idle.webm
   ```

3. 复制成 9 个动作名 —— 默认扩展名是 `webm`（`PET_DEFAULT_EXT`），所以目录形态的
   `uri`（`/test/fixtures/pets`）正好拼出这些文件名。

这份精简构建的能力边界（决定了上面这条链路）：有 `mjpeg` 解码 / `image2pipe` 解复用 /
`libvpx` 编码 / `webm` 复用；**没有** `lavfi`（造不了合成源）、**没有** PNG 解码、
**没有** `pipe` 协议（`-i -` 会报 `Protocol not found`），`image2` 只能复用不能解复用。

生成脚本是一次性的、放在 `node_modules/.cache` 里，不随仓库提交；测试只依赖已生成的字节。
`test/browser/fixture-media.test.tsx` 守着「能取到、能解码、能播完」这三件事 ——
最后一条是 dsh「一次性动作播完 → `finish()`」链路可测的前提。

## `pets/pet.json` + `pets/sprite.png` —— Codex 图集的「按目录解析」素材

`test/browser/codex-props.test.tsx` 要验 `resolveSpritesheetUrl` 的相对路径分支：配置给的是
**地址**（`/test/fixtures/pets/pet.json`），雪碧图只写在 `spritesheetPath` 里。于是：

- `pet.json`：最小 Codex 清单（v2 / 8 列 / 192×208），`spritesheetPath` 指向同目录的
  `sprite.png`；组件按 `pet.json` 所在目录拼出 `/test/fixtures/pets/sprite.png`。
- `sprite.png`：68 字节的 1×1 PNG（base64 写入）。只要求「能解出一张图」，尺寸无所谓 ——
  Codex 的排版靠 `background-size` 的百分比，与像素尺寸解耦。

其余雪碧图都不落盘：`test/browser/support/fixtures.ts` 的 `makeSpritesheetDataUrl()`
用 canvas 现场画一张 `columns × rows` 的图并转成 data URL（`<img>` 与 `new Image()` 都能加载）。
