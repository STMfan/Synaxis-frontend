import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamingMarkdown } from '../src/ui/stores/stream-markdown.ts';
test('unfinished emphasis and links are readable before the next network delta', () => {
  assert.equal(streamingMarkdown('## 思路\n\n**建立方程'), '## 思路\n\n**建立方程**');
  assert.equal(streamingMarkdown('[参考](https://exa'), '参考');
  assert.equal(streamingMarkdown('**完整**'), '**完整**');
});
test('partial code remains code and complete formulas keep their original source', () => {
  assert.equal(streamingMarkdown('```python\nx=1'), '```python\nx=1\n```');
  assert.equal(streamingMarkdown('```markdown\n# 思路\n说明\n```'), '# 思路\n说明');
  assert.equal(streamingMarkdown('公式 \\(x^2+1\\)'), '公式 \\(x^2+1\\)');
  assert.equal(streamingMarkdown('公式 \\(x^2+'), '公式 `x^2+`');
  assert.equal(streamingMarkdown('\\(x\\) 接着 \\(y+'), '\\(x\\) 接着 `y+`');
  assert.equal(streamingMarkdown('$x^2$ 接着 $y+'), '$x^2$ 接着 `y+`');
  assert.equal(streamingMarkdown('预算 $5'), '预算 $5');
});
