/**
 * JSONC（带注释的 JSON）解析 —— dsh-pet 的 `assets/config.jsonc` 用的是 JSONC：
 * 允许行注释、块注释，以及对象/数组的尾逗号。
 *
 * 这里只做「剥注释 + 去尾逗号 + 交给 `JSON.parse`」，不引入任何解析器依赖：
 * - 注释识别在字符串字面量内部失效（`"// 不是注释"` 原样保留，`"\\"` 转义正确跳过）；
 * - 注释内容被替换为等价数量的换行，`JSON.parse` 的报错行号仍能对上原文；
 * - 尾逗号只在「后面第一个非空白字符是 `}` 或 `]`」时移除，字符串里的逗号不动。
 */

/** 去掉 UTF-8 BOM（`fetch` 回来的文件常带）。 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

/**
 * 移除行注释与块注释，保留换行数量。
 *
 * @param text 原始 JSONC 文本
 * @returns 无注释的等价文本
 */
export function stripJsonComments(text: string): string {
  let out = ''
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]!

    if (ch === '"') {
      // 字符串字面量：原样搬运并正确处理转义，直到配对的引号
      out += ch
      i += 1
      while (i < n) {
        const inner = text[i]!
        out += inner
        i += 1
        if (inner === '\\') {
          if (i < n) {
            out += text[i]!
            i += 1
          }
          continue
        }
        if (inner === '"')
          break
      }
      continue
    }

    if (ch === '/' && text[i + 1] === '/') {
      // 行注释：吃掉到行尾（换行留给下一轮，保持行结构）
      i += 2
      while (i < n && text[i] !== '\n' && text[i] !== '\r')
        i += 1
      continue
    }

    if (ch === '/' && text[i + 1] === '*') {
      // 块注释：吃掉到 */，其中的换行等量补回，避免行号漂移
      i += 2
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n' || text[i] === '\r')
          out += text[i]
        i += 1
      }
      i = i < n ? i + 2 : i
      continue
    }

    out += ch
    i += 1
  }

  return out
}

/**
 * 移除对象/数组的尾逗号（JSONC 允许，`JSON.parse` 不允许）。
 *
 * @param text 已去注释的文本
 * @returns 去尾逗号后的文本
 */
export function stripJsonTrailingCommas(text: string): string {
  let out = ''
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]!

    if (ch === '"') {
      out += ch
      i += 1
      while (i < n) {
        const inner = text[i]!
        out += inner
        i += 1
        if (inner === '\\') {
          if (i < n) {
            out += text[i]!
            i += 1
          }
          continue
        }
        if (inner === '"')
          break
      }
      continue
    }

    if (ch === ',') {
      let j = i + 1
      while (j < n && /\s/.test(text[j]!))
        j += 1
      const next = text[j]
      if (next === '}' || next === ']') {
        i += 1
        continue
      }
    }

    out += ch
    i += 1
  }

  return out
}

/** JSONC 文本 → 值。解析失败时抛出带原始报错的可读异常。 */
export function parseJsonc<T = unknown>(text: string): T {
  const cleaned = stripJsonTrailingCommas(stripJsonComments(stripBom(text)))
  try {
    return JSON.parse(cleaned) as T
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`JSONC parse failed: ${reason}`)
  }
}
