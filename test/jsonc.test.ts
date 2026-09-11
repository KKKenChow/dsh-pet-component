import { describe, expect, it } from 'vitest'
import { parseJsonc, stripBom, stripJsonComments, stripJsonTrailingCommas } from '../src/utils/jsonc'

describe('stripBom', () => {
  it('去掉 UTF-8 BOM', () => {
    expect(stripBom('\uFEFF{}')).toBe('{}')
  })

  it('不动没有 BOM 的文本', () => {
    expect(stripBom('{}')).toBe('{}')
  })
})

describe('stripJsonComments', () => {
  it('移除行注释', () => {
    const input = ['{', '  // 这是注释', '  "a": 1 // 行尾注释', '}'].join('\n')
    expect(JSON.parse(stripJsonComments(input))).toEqual({ a: 1 })
  })

  it('移除块注释并保留换行数量（报错行号不漂）', () => {
    const input = ['{', '  /* 多行', '     注释 */', '  "a": 1', '}'].join('\n')
    const stripped = stripJsonComments(input)
    expect(stripped.split('\n')).toHaveLength(5)
    expect(JSON.parse(stripped)).toEqual({ a: 1 })
  })

  it('字符串里的注释符号原样保留', () => {
    const input = '{ "url": "https://example.com/a//b", "c": "/* 不是注释 */" }'
    expect(JSON.parse(stripJsonComments(input))).toEqual({
      url: 'https://example.com/a//b',
      c: '/* 不是注释 */',
    })
  })

  it('字符串里的转义引号不会提前结束字符串', () => {
    const input = '{ "a": "he said \\"// hi\\"", "b": 2 }'
    expect(JSON.parse(stripJsonComments(input))).toEqual({ a: 'he said "// hi"', b: 2 })
  })

  it('带注释的数组与嵌套结构', () => {
    const input = ['[', '  // 第一项', '  1,', '  [2, /* 内联 */ 3]', ']'].join('\n')
    expect(JSON.parse(stripJsonComments(input))).toEqual([1, [2, 3]])
  })

  it('没有注释时逐字不变', () => {
    const input = '{"a":[1,2,{"b":"c"}]}'
    expect(stripJsonComments(input)).toBe(input)
  })
})

describe('stripJsonTrailingCommas', () => {
  it('移除对象与数组的尾逗号', () => {
    expect(JSON.parse(stripJsonTrailingCommas('{"a":1,}'))).toEqual({ a: 1 })
    expect(JSON.parse(stripJsonTrailingCommas('[1,2,]'))).toEqual([1, 2])
  })

  it('保留中间的逗号与字符串里的逗号', () => {
    expect(JSON.parse(stripJsonTrailingCommas('{"a":"x,y","b":2}')))
      .toEqual({ a: 'x,y', b: 2 })
    // 逗号后面还有内容（哪怕隔了空白）就不是尾逗号，原样保留
    expect(stripJsonTrailingCommas('{"a": 1 , "b": 2}')).toBe('{"a": 1 , "b": 2}')
    expect(stripJsonTrailingCommas('{"a":"1,"}')).toBe('{"a":"1,"}')
  })

  it('尾逗号与换行/空白混排', () => {
    expect(JSON.parse(stripJsonTrailingCommas('{\n  "a": 1,\n  \n}'))).toEqual({ a: 1 })
    expect(JSON.parse(stripJsonTrailingCommas('[\n  1,\n]'))).toEqual([1])
  })
})

describe('parseJsonc', () => {
  it('一次搞定注释 + 尾逗号 + BOM', () => {
    const text = [
      '\uFEFF{',
      '  // dsh-pet 配置（JSONC）',
      '  "whisperPrompt": "说人话 // 不提 AI",',
      '  /* 多行',
      '     注释 */',
      '  "pets": [{ "id": "main", "size": 462, },],',
      '}',
    ].join('\n')

    expect(parseJsonc(text)).toEqual({
      whisperPrompt: '说人话 // 不提 AI',
      pets: [{ id: 'main', size: 462 }],
    })
  })

  it('对真实 dsh-pet 配置片段有效', () => {
    const text = [
      '{',
      '  // ===================== 动画链顶层权重 =====================',
      '  "animationWeights": { "idle": 10, "turn": 5, "move": 5 },',
      '  "animations": {',
      '    // 待机动画池（数组，可放多个，等概率抽）',
      '    "idle": ["待机呼吸休闲"],',
      '    "turn": ["东张西望"],',
      '    "events": {',
      '      "workStatus": [',
      '        "工作状态-思考冒泡", // index 0 thinking',
      '        "工作状态-忙碌点按",',
      '      ],',
      '    },',
      '  },',
      '}',
    ].join('\n')

    expect(parseJsonc(text)).toEqual({
      animationWeights: { idle: 10, turn: 5, move: 5 },
      animations: {
        idle: ['待机呼吸休闲'],
        turn: ['东张西望'],
        events: { workStatus: ['工作状态-思考冒泡', '工作状态-忙碌点按'] },
      },
    })
  })

  it('非法 JSON 抛出带原因的可读异常', () => {
    expect(() => parseJsonc('{ "a": }')).toThrowError(/JSONC parse failed/)
  })
})
