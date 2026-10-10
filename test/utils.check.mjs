/**
 * renderMarkdown 自检（零依赖，直接运行：npm run check）
 * 覆盖块级语法转换、XSS 转义与卡片摘要截断的自动收口，任一断言失败即非 0 退出。
 */
import assert from 'node:assert';

globalThis.window = {};
await import('../web/js/common/utils.js');
const { renderMarkdown } = globalThis.window.QM.utils;

// 块级语法
assert.equal(renderMarkdown('# 标题'), '<h3>标题</h3>');
assert.equal(renderMarkdown('### 三级'), '<h5>三级</h5>');
assert.equal(renderMarkdown('## 用法\n- 甲\n- 乙'), '<h4>用法</h4><ul><li>甲</li><li>乙</li></ul>');
assert.equal(renderMarkdown('1. 一\n2. 二'), '<ol><li>一</li><li>二</li></ol>');
assert.equal(renderMarkdown('> 引用'), '<blockquote>引用</blockquote>');
assert.equal(renderMarkdown('段落一\n\n段落二'), '<p>段落一</p><p>段落二</p>');
assert.equal(renderMarkdown('```\nlet a = 1;\n```'), '<pre><code>let a = 1;</code></pre>');

// 行内语法与链式关联
assert.equal(
  renderMarkdown('**粗** `码` [[链]]'),
  '<p><strong>粗</strong> <code>码</code> <span class="md-chain">🔗 [[链]]</span></p>'
);

// 信任边界：原始 HTML 必须被转义
assert.ok(!renderMarkdown('<img src=x onerror=alert(1)>').includes('<img'), 'HTML 未转义');
assert.equal(renderMarkdown('```\n<b>x</b>\n```'), '<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>');

// 摘要截断：未闭合代码块/列表必须自动收口，否则会吞掉卡片后续 DOM
assert.equal(renderMarkdown('```\ncode', 400), '<pre><code>code</code></pre>');
assert.equal(renderMarkdown('- 甲\n- 乙', 400), '<ul><li>甲</li><li>乙</li></ul>');

const long = Array.from({ length: 40 }, (_, i) => `第 ${i} 行内容`).join('\n');
const clipped = renderMarkdown(long, 60);
assert.ok(clipped.length < renderMarkdown(long).length, '截断未生效');
assert.ok(clipped.endsWith('…</p>'), '截断需按行边界以省略号收尾');
assert.ok(!clipped.includes('第 39 行'), '截断后不应包含尾部内容');

// 空值兜底
assert.equal(renderMarkdown(''), '');
assert.equal(renderMarkdown(null), '');

console.log('renderMarkdown self-check passed');
