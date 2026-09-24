/**
 * Qoder Memory Visualizer - 公共通用工具库 (Utils)
 */
window.QM = window.QM || {};

window.QM.utils = (function() {
  /**
   * HTML 实体安全转义，防止 XSS
   */
  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * 极简 Markdown 转换器 (粗体、行内代码、链式关系与换行)
   */
  function renderMarkdown(md) {
    if (!md) return '';
    let html = escapeHtml(md);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\`([^`]+)\`/g, '<code>$1</code>');
    html = html.replace(/\[\[([^\]]+)\]\]/g, '<span style="color:#34d399; font-weight:600;">🔗 [[$1]]</span>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  /**
   * 全局气泡通知 (Toast)
   */
  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.style.display = 'none';
    }, 2200);
  }

  return {
    escapeHtml,
    renderMarkdown,
    showToast
  };
})();

// 向下兼容：将工具方法合并挂载到 QM_CONSTANTS
if (window.QM_CONSTANTS) {
  Object.assign(window.QM_CONSTANTS, window.QM.utils);
}
window.QM_UTILS = window.QM.utils;
