/**
 * Qoder Memory Visualizer - 知识卡片流模块 (Cards Module)
 * 职责：知识卡片流网格渲染、记忆过滤与排序控制
 */
window.QM = window.QM || {};

window.QM.cards = (function() {
  function getFilteredMemories() {
    const { memories, activeCategory, activeTag, searchQuery, sortBy } = window.QM.state.state;

    let filtered = memories.filter(m => {
      if (activeCategory !== 'all' && m.category !== activeCategory) return false;
      if (activeTag && !(m.keywords || []).includes(activeTag)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = (m.name || '').toLowerCase().includes(q);
        const matchDesc = (m.description || '').toLowerCase().includes(q);
        const matchBody = (m.body || '').toLowerCase().includes(q);
        const matchKw = (m.keywords || []).some(k => k.toLowerCase().includes(q));
        if (!matchName && !matchDesc && !matchBody && !matchKw) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '');
      if (sortBy === 'source') return (a.source || '').localeCompare(b.source || '');
      return 0;
    });

    return filtered;
  }

  const PAGE_SIZE = 36;
  let currentVisibleLimit = PAGE_SIZE;

  function resetVisibleLimit() {
    currentVisibleLimit = PAGE_SIZE;
  }

  function loadMore() {
    currentVisibleLimit += PAGE_SIZE;
    renderCardsGrid(getFilteredMemories());
  }

  function loadAll() {
    currentVisibleLimit = Infinity;
    renderCardsGrid(getFilteredMemories());
  }

  function renderCardsGrid(filtered) {
    const { isEditMode } = window.QM.state.state;
    const { CATEGORY_MAP, TYPE_MAP } = window.QM.constants;
    const { escapeHtml, renderMarkdown } = window.QM.utils;

    const gridEl = document.getElementById('cards-grid');
    if (!gridEl) return;

    if (filtered.length === 0) {
      gridEl.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 60px 0; color:#64748b;">
          <p style="font-size:16px; margin-bottom:8px;">未找到匹配的记忆条目</p>
          <p style="font-size:12px;">您可以清除搜索或点击右上角「新建记忆」</p>
        </div>
      `;
      return;
    }

    const renderList = filtered.slice(0, currentVisibleLimit);
    const hasMore = filtered.length > renderList.length;

    let html = renderList.map(m => {
      const catLabel = (CATEGORY_MAP[m.category] && CATEGORY_MAP[m.category].name) || m.category;
      const kwHtml = (m.keywords || []).map(k => `<span class="keyword-pill">${escapeHtml(k)}</span>`).join('');
      const chainHtml = (m.chains && m.chains.length > 0)
        ? `<span class="badge-tag badge-chain">🔗 链向: ${escapeHtml(m.chains.join(', '))}</span>`
        : '';

      const typeInfo = (TYPE_MAP && TYPE_MAP[m.type]) || { name: m.type || 'project', icon: '🏛️', badgeClass: 'type-project' };
      const typeHtml = `<span class="badge-tag badge-type ${typeInfo.badgeClass}" title="Qoder 官方规范类型: ${escapeHtml(typeInfo.name)}">${typeInfo.icon} ${escapeHtml(m.type || 'project')}</span>`;

      return `
        <div class="memory-card" id="card-${escapeHtml(m.id)}">
          <div class="card-title" onclick="window.QM.drawer.openDrawer('${escapeHtml(m.id)}')">${escapeHtml(m.name)}</div>
          <div class="card-badges">
            ${typeHtml}
            <span class="badge-tag badge-cat">${escapeHtml(catLabel)}</span>
            <span class="badge-tag badge-source">${escapeHtml(m.source || 'auto')}</span>
            ${chainHtml}
          </div>
          ${m.description ? `
            <div class="card-desc">
              <div class="card-desc-label">💡 适用场景 / 召回条件</div>
              ${escapeHtml(m.description)}
            </div>
          ` : ''}
          <div class="card-content-preview">
            ${renderMarkdown(m.body)}
          </div>
          <div class="card-keywords">${kwHtml}</div>
          <div class="card-footer">
            <div class="card-file" title="${escapeHtml(m.filename)}">📄 ${escapeHtml(m.filename)}</div>
            <div class="card-actions">
              ${isEditMode ? `
                <button class="btn btn-subtle btn-sm" onclick="window.QM.drawer.openDrawer('${escapeHtml(m.id)}')">✏️ 编辑</button>
                <button class="btn btn-danger btn-sm" onclick="window.QM.drawer.deleteCard('${escapeHtml(m.id)}')">🗑️ 删除</button>
              ` : `
                <button class="btn btn-subtle btn-sm" onclick="window.QM.drawer.openDrawer('${escapeHtml(m.id)}')">👁️ 查阅</button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (hasMore) {
      const remainCount = filtered.length - renderList.length;
      html += `
        <div style="grid-column: 1/-1; display:flex; justify-content:center; align-items:center; gap:14px; padding: 24px 0; background:rgba(15,23,42,0.6); border:1px dashed #334155; border-radius:8px;">
          <span style="color:#94a3b8; font-size:13px;">已呈现前 ${renderList.length} 篇 · 还有 ${remainCount} 篇记忆</span>
          <button class="btn btn-subtle btn-sm" onclick="window.QM.cards.loadMore()">⬇️ 继续载入 ${Math.min(PAGE_SIZE, remainCount)} 篇</button>
          <button class="btn btn-subtle btn-sm" onclick="window.QM.cards.loadAll()">⚡ 全部展开 (${filtered.length} 篇)</button>
        </div>
      `;
    }

    gridEl.innerHTML = html;
  }

  function renderUI() {
    const { memories, currentDirName, viewMode } = window.QM.state.state;
    const filtered = getFilteredMemories();

    const statInfoEl = document.getElementById('stat-info');
    if (statInfoEl) statInfoEl.innerText = `${memories.length} 记忆切片`;

    const viewStatsEl = document.getElementById('view-stats');
    if (viewStatsEl) viewStatsEl.innerText = `显示 ${filtered.length} / ${memories.length} 条记忆`;

    // 渲染侧边栏
    window.QM.sidebar?.render();

    // 性能优化：在卡片模式下按需渲染卡片
    if (viewMode === 'cards') {
      renderCardsGrid(filtered);
    }

    window.QM.topology?.buildGalaxyGraph();
  }

  // 监听视图切换事件，若切换到卡片模式则按需渲染卡片，若切换到拓扑模式则联动聚焦
  window.QM.state.on('view-changed', (mode) => {
    if (mode === 'cards') {
      resetVisibleLimit();
      renderCardsGrid(getFilteredMemories());
    } else if (mode === 'galaxy') {
      window.QM.topology?.focusOnCategory(window.QM.state.state.activeCategory);
    }
  });

  return {
    renderUI,
    getFilteredMemories,
    renderCardsGrid,
    resetVisibleLimit,
    loadMore,
    loadAll
  };
})();

// 向下兼容旧调用
window.QM_CARDS = window.QM.cards;
