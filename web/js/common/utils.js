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
   * 全局气泡通知 (Toast)，支持 info / success / warn / error 类型化视觉
   */
  function showToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.dataset.type = type;
    t.style.display = 'flex';
    t.classList.remove('out');
    clearTimeout(t._timer);
    clearTimeout(t._hideTimer);
    t._timer = setTimeout(() => {
      t.classList.add('out');
      t._hideTimer = setTimeout(() => {
        t.style.display = 'none';
        t.classList.remove('out');
      }, 240);
    }, 2200);
  }

  /**
   * 毛玻璃确认弹窗（替代原生 confirm，返回 Promise<boolean>）
   */
  function confirmDialog({ title = '操作确认', message = '', icon = '⚠️', confirmText = '确认', cancelText = '取消', danger = true } = {}) {
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop confirm-backdrop';
      backdrop.innerHTML = `
        <div class="modal-box confirm-modal">
          <div class="confirm-head">
            <div class="confirm-icon">${icon}</div>
            <div class="confirm-body">
              <div class="confirm-title">${escapeHtml(title)}</div>
              <p class="confirm-desc">${escapeHtml(message)}</p>
            </div>
          </div>
          <div class="modal-btn-row">
            <button class="btn btn-subtle" data-act="cancel">${escapeHtml(cancelText)}</button>
            <button class="btn${danger ? ' btn-danger' : ''}" data-act="ok">${escapeHtml(confirmText)}</button>
          </div>
        </div>`;

      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation(); // 捕获阶段拦截 ESC，避免同时触发全局抽屉关闭等快捷键
          close(false);
        }
      };
      const close = (result) => {
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        resolve(result);
      };

      document.addEventListener('keydown', onKey, true);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
      backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
      backdrop.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
      document.body.appendChild(backdrop);
      // 默认焦点落在取消键，防止回车误触危险操作
      backdrop.querySelector('[data-act="cancel"]').focus();
    });
  }

  /**
   * 渲染头部悬浮下拉的选项菜单 (支持分组标题行、尾部规模微标与空列表)
   * items 元素：{ value, label, title?, badge? } 或 { group: '分组标题' }
   */
  function renderNavDropdown(id, items = []) {
    const menu = document.querySelector(`#${id} .nav-dd-menu`);
    if (!menu) return;
    menu.innerHTML = items.map(it => {
      if (it.group) return `<div class="nav-dd-group">${escapeHtml(it.group)}</div>`;
      const titleAttr = it.title ? ` title="${escapeHtml(it.title)}"` : '';
      const badgeHtml = it.badge ? `<span class="nav-dd-count">${escapeHtml(it.badge)}</span>` : '';
      return `<button type="button" class="nav-dd-item" data-value="${escapeHtml(it.value)}" data-label="${escapeHtml(it.label)}"${titleAttr}>${escapeHtml(it.label)}${badgeHtml}</button>`;
    }).join('');
  }

  /**
   * 同步头部悬浮下拉的当前选中项与触发键展示文本
   */
  function syncNavDropdown(id, value, labelText) {
    const dd = document.getElementById(id);
    if (!dd) return;
    let matchedLabel = '';
    dd.querySelectorAll('.nav-dd-item').forEach(item => {
      const isMatch = item.dataset.value === String(value);
      item.classList.toggle('active', isMatch);
      if (isMatch) matchedLabel = item.dataset.label || item.textContent.trim();
    });
    const labelEl = dd.querySelector('.nav-dd-label');
    if (labelEl) labelEl.textContent = (labelText !== undefined) ? labelText : (matchedLabel || value || '');
  }

  /**
   * 绑定头部悬浮下拉：点击选项后先同步当前值展示，再回调业务切换逻辑
   * (展开/收起完全由 CSS :hover 驱动：移入展开、移出自动消失)
   */
  function setupNavDropdown(id, onSelect) {
    const dd = document.getElementById(id);
    if (!dd) return;
    const menu = dd.querySelector('.nav-dd-menu');
    if (!menu) return;
    menu.addEventListener('click', e => {
      const item = e.target.closest('.nav-dd-item');
      if (!item || !menu.contains(item)) return;
      syncNavDropdown(id, item.dataset.value);
      if (onSelect) onSelect(item.dataset.value);
    });
  }

  return {
    escapeHtml,
    renderMarkdown,
    showToast,
    confirmDialog,
    renderNavDropdown,
    syncNavDropdown,
    setupNavDropdown
  };
})();

// 向下兼容：将工具方法合并挂载到 QM_CONSTANTS
if (window.QM_CONSTANTS) {
  Object.assign(window.QM_CONSTANTS, window.QM.utils);
}
window.QM_UTILS = window.QM.utils;
