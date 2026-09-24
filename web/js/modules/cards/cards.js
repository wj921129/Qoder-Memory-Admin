/**
 * Qoder Memory Visualizer - 知识卡片流模块 (Cards Module)
 * 职责：知识卡片流网格渲染、记忆过滤与排序控制
 */
window.QM = window.QM || {};

window.QM.cards = (function() {
  function getFilteredMemories() {
    const state = (window.QM && window.QM.state) ? window.QM.state.state : window.QM_STATE.state;
    const { memories, activeCategory, activeTag, searchQuery, sortBy } = state;

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

  function renderCardsGrid(filtered) {
    const state = (window.QM && window.QM.state) ? window.QM.state.state : window.QM_STATE.state;
    const { isEditMode } = state;
    const constants = (window.QM && window.QM.constants) || window.QM_CONSTANTS;
    const utils = (window.QM && window.QM.utils) || window.QM_CONSTANTS;
    const { CATEGORY_MAP, TYPE_MAP } = constants;
    const { escapeHtml, renderMarkdown } = utils;

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

    gridEl.innerHTML = filtered.map(m => {
      const catLabel = (CATEGORY_MAP[m.category] && CATEGORY_MAP[m.category].name) || m.category;
      const kwHtml = (m.keywords || []).map(k => `<span class="keyword-pill">${escapeHtml(k)}</span>`).join('');
      const chainHtml = (m.chains && m.chains.length > 0)
        ? `<span class="badge-tag badge-chain">🔗 链向: ${escapeHtml(m.chains.join(', '))}</span>`
        : '';

      const typeInfo = (TYPE_MAP && TYPE_MAP[m.type]) || { name: m.type || 'project', icon: '🏛️', badgeClass: 'type-project' };
      const typeHtml = `<span class="badge-tag badge-type ${typeInfo.badgeClass}" title="Qoder 官方规范类型: ${escapeHtml(typeInfo.name)}">${typeInfo.icon} ${escapeHtml(m.type || 'project')}</span>`;

      return `
        <div class="memory-card" id="card-${escapeHtml(m.id)}">
          <div class="card-title" onclick="(window.QM?.drawer?.openDrawer || window.QM_DRAWER?.openDrawer)('${escapeHtml(m.id)}')">${escapeHtml(m.name)}</div>
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
                <button class="btn btn-subtle btn-sm" onclick="(window.QM?.drawer?.openDrawer || window.QM_DRAWER?.openDrawer)('${escapeHtml(m.id)}')">✏️ 编辑</button>
                <button class="btn btn-danger btn-sm" onclick="(window.QM?.drawer?.deleteCard || window.QM_DRAWER?.deleteCard)('${escapeHtml(m.id)}')">🗑️ 删除</button>
              ` : `
                <button class="btn btn-subtle btn-sm" onclick="(window.QM?.drawer?.openDrawer || window.QM_DRAWER?.openDrawer)('${escapeHtml(m.id)}')">👁️ 查阅</button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderUI() {
    const state = (window.QM && window.QM.state) ? window.QM.state.state : window.QM_STATE.state;
    const { memories, currentDirName } = state;
    const filtered = getFilteredMemories();

    const statInfoEl = document.getElementById('stat-info');
    if (statInfoEl) statInfoEl.innerText = `${currentDirName} · ${memories.length} 记忆切片`;

    const viewStatsEl = document.getElementById('view-stats');
    if (viewStatsEl) viewStatsEl.innerText = `显示 ${filtered.length} / ${memories.length} 条记忆`;

    // 渲染侧边栏
    const sidebar = (window.QM && window.QM.sidebar) || window.QM_SIDEBAR;
    if (sidebar && typeof sidebar.render === 'function') {
      sidebar.render();
    }

    // 性能优化：在卡片模式下按需渲染卡片
    if (state.viewMode === 'cards') {
      renderCardsGrid(filtered);
    }

    const topology = (window.QM && window.QM.topology) || window.QM_GALAXY;
    if (topology && typeof topology.buildGalaxyGraph === 'function') {
      topology.buildGalaxyGraph();
    }
  }

  // 监听视图切换事件，若切换到卡片模式则按需渲染卡片，若切换到拓扑模式则联动聚焦
  const stateCenter = (window.QM && window.QM.state) || window.QM_STATE;
  if (stateCenter && typeof stateCenter.on === 'function') {
    stateCenter.on('view-changed', (mode) => {
      if (mode === 'cards') {
        const filtered = getFilteredMemories();
        renderCardsGrid(filtered);
      } else if (mode === 'galaxy') {
        const topology = (window.QM && window.QM.topology) || window.QM_GALAXY;
        const curState = (window.QM && window.QM.state) ? window.QM.state.state : window.QM_STATE.state;
        if (topology && typeof topology.focusOnCategory === 'function') {
          topology.focusOnCategory(curState.activeCategory);
        }
      }
    });
  }

  return {
    renderUI,
    getFilteredMemories,
    renderCardsGrid,
    // 兼容代理侧边栏方法
    selectCategory: (cat) => ((window.QM?.sidebar || window.QM_SIDEBAR)?.selectCategory(cat)),
    highlightCategory: (cat, scroll) => ((window.QM?.sidebar || window.QM_SIDEBAR)?.highlightCategory(cat, scroll)),
    toggleTag: (tag) => ((window.QM?.sidebar || window.QM_SIDEBAR)?.toggleTag(tag))
  };
})();

// 向下兼容旧调用
window.QM_CARDS = window.QM.cards;
