import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  // `source/` 是只读参考检出（git submodule），`docs/` 与 README 是散文：
  // 里面的代码块是给人看的示例（片段性质、没有完整模块上下文），
  // 按真实文件去套 react-refresh / 一致性规则只会逼着把示例写坏。
  ignores: ['docs', 'source', 'dist', 'coverage', 'README.md'],
})
