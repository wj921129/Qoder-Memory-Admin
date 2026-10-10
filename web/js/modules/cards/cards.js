/**
 * Qoder Memory Visualizer - 知识卡片流模块 (Cards Module)
 * 职责：知识卡片流网格渲染、记忆过滤与排序控制
 */
window.QM = window.QM || {};

window.QM.cards = (function() {
  let isAllCollapsed = true; // 默认折叠记忆
  const expandedSet = new Set(); // 记录单独点开/折叠的个性化集合

  function toggleCardCollapse(id) {
    const cardEl = document.getElementById(`card-${id}`);
    if (!cardEl) return;
    const isNowCollapsed = cardEl.classList.toggle('collapsed');
    const icon = cardEl.querySelector('.card-expand-btn .expand-icon');
    if (icon) icon.textContent = isNowCollapsed ? '▾' : '▴';
    if (isNowCollapsed) {
      expandedSet.delete(id);
    } else {
      expandedSet.add(id);
    }
  }

  function toggleAllCards() {
    isAllCollapsed = !isAllCollapsed;
    expandedSet.clear();
    const gridEl = document.getElementById('cards-grid');
    if (gridEl) {
      const cards = gridEl.querySelectorAll('.memory-card');
      cards.forEach(card => {
        card.classList.toggle('collapsed', isAllCollapsed);
        const icon = card.querySelector('.card-expand-btn .expand-icon');
        if (icon) icon.textContent = isAllCollapsed ? '▾' : '▴';
      });
    }
    updateToggleAllBtn();
  }

  function updateToggleAllBtn() {
    const textEl = document.getElementById('toggle-all-cards-text');
    if (textEl) {
      textEl.textContent = isAllCollapsed ? '↕️ 全部展开' : '↕️ 全部折叠';
    }
  }

  function getFilteredMemories() {
    const { memories, officialCategory, activeCategory, activeTag, searchQuery, sortBy } = window.QM.state.state;
    const { mapToOfficialGroup } = window.QM.constants;

    let filtered = memories.filter(m => {
      // 1. 官方 4 大分类过滤 (对齐 Qoder 原生)
      if (officialCategory && officialCategory !== 'all') {
        const gid = (m.officialGroup && m.officialGroup.id) || mapToOfficialGroup(m.category).id;
        if (gid !== officialCategory) return false;
      }
      // 2. 底层细分子目录过滤
      if (activeCategory !== 'all' && m.category !== activeCategory) return false;
      // 3. 标签过滤
      if (activeTag && !(m.keywords || []).includes(activeTag)) return false;
      // 4. 搜索框过滤
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

  function updateOfficialTabs() {
    const { memories, officialCategory } = window.QM.state.state;
    const { mapToOfficialGroup } = window.QM.constants;
    const counts = { all: memories.length, spec: 0, project: 0, experience: 0, task: 0 };
    memories.forEach(m => {
      const gid = (m.officialGroup && m.officialGroup.id) || mapToOfficialGroup(m.category).id;
      counts[gid] = (counts[gid] || 0) + 1;
    });

    ['all', 'spec', 'project', 'experience', 'task'].forEach(gid => {
      const badge = document.getElementById(`tab-badge-${gid}`);
      if (badge) badge.innerText = counts[gid] || 0;
    });

    const tabsBar = document.getElementById('official-tabs-bar');
    if (tabsBar) {
      tabsBar.querySelectorAll('.official-tab').forEach(tab => {
        const g = tab.getAttribute('data-group');
        tab.classList.toggle('active', g === (officialCategory || 'all'));
      });
    }
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
    const isPro = window.QM.state.state.appMode === 'pro';
    const { CATEGORY_MAP, TYPE_MAP } = window.QM.constants;
    const { escapeHtml, renderMarkdown } = window.QM.utils;

    const gridEl = document.getElementById('cards-grid');
    if (!gridEl) return;

    if (filtered.length === 0) {
      gridEl.innerHTML = `
        <div class="cards-empty">
          <p>未找到匹配的记忆条目</p>
          <p>您可以清除搜索或点击右上角「新建记忆」</p>
        </div>
      `;
      return;
    }

    const renderList = filtered.slice(0, currentVisibleLimit);
    const hasMore = filtered.length > renderList.length;

    let html = renderList.map(m => {
      const isCollapsed = isAllCollapsed ? !expandedSet.has(m.id) : expandedSet.has(m.id);
      const catLabel = (CATEGORY_MAP[m.category] && CATEGORY_MAP[m.category].name) || m.category;
      const kwHtml = (m.keywords || []).map(k => `<span class="keyword-pill">${escapeHtml(k)}</span>`).join('');
      const chainHtml = (m.chains && m.chains.length > 0)
        ? `<span class="badge-tag badge-chain">🔗 链向: ${escapeHtml(m.chains.join(', '))}</span>`
        : '';

      const typeInfo = (TYPE_MAP && TYPE_MAP[m.type]) || { name: m.type || 'project', icon: '🏛️' };
      const typeHtml = `<span class="badge-tag" title="Qoder 官方规范类型: ${escapeHtml(typeInfo.name)}">${typeInfo.icon} ${escapeHtml(m.type || 'project')}</span>`;

      // 官方四大分类身份色统一交由 CSS .grp-* 接管，严禁在 JS 内联硬编码色值
      const officialGrp = m.officialGroup || window.QM.constants.mapToOfficialGroup(m.category);
      const officialHtml = `<span class="badge-tag grp-${escapeHtml(officialGrp.id)}">${officialGrp.icon} ${escapeHtml(officialGrp.name)}</span>`;
      const trackBadge = m.storeType === 'agent'
        ? `<span class="badge-tag track-agent">🤖 Agent</span>`
        : `<span class="badge-tag track-ide">🌟 IDE</span>`;

      const projBadge = m.projectName ? `<span class="badge-tag badge-proj">🪐 ${escapeHtml(m.projectName)}</span>` : '';

      return `
        <div class="memory-card${isCollapsed ? ' collapsed' : ''}" id="card-${escapeHtml(m.id)}">
          <div class="card-header-row">
            <div class="card-title" onclick="window.QM.drawer.openDrawer('${escapeHtml(m.id)}')">${escapeHtml(m.name)}</div>
            <button type="button" class="card-expand-btn" onclick="event.stopPropagation(); window.QM.cards.toggleCardCollapse('${escapeHtml(m.id)}')" title="展开/收起此篇内容">
              <span class="expand-icon">${isCollapsed ? '▾' : '▴'}</span>
            </button>
          </div>
          <div class="card-badges">
            ${officialHtml}
            <span class="badge-tag">${escapeHtml(catLabel)}</span>
            ${trackBadge}
            ${typeHtml}
            <span class="badge-tag">${escapeHtml(m.source || 'auto')}</span>
            ${projBadge}
            ${chainHtml}
          </div>
          ${m.description ? `
            <div class="card-desc">
              <div class="card-desc-label">💡 适用场景 / 召回条件</div>
              ${escapeHtml(m.description)}
            </div>
          ` : ''}
          <div class="card-content-preview md-body">
            ${renderMarkdown(m.body, 600)}
          </div>
          <div class="card-keywords">${kwHtml}</div>
          <div class="card-footer">
            <div class="card-file" title="${escapeHtml(m.filename)}">📄 ${escapeHtml(m.filename)}</div>
            <div class="card-actions">
              ${isPro ? `
                <button class="btn btn-subtle btn-sm" onclick="window.QM.drawer.openDrawer('${escapeHtml(m.id)}')">✏️ 编辑</button>
              ` : `
                <button class="btn btn-subtle btn-sm" onclick="window.QM.drawer.openDrawer('${escapeHtml(m.id)}')">👁️ 查阅</button>
              `}
              <button class="btn btn-danger btn-sm" onclick="window.QM.drawer.deleteCard('${escapeHtml(m.id)}')">🗑️ 删除</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (hasMore) {
      const remainCount = filtered.length - renderList.length;
      html += `
        <div class="cards-more">
          <span class="cards-more-hint">已呈现前 ${renderList.length} 篇 · 还有 ${remainCount} 篇记忆</span>
          <button class="btn btn-subtle btn-sm" onclick="window.QM.cards.loadMore()">⬇️ 继续载入 ${Math.min(PAGE_SIZE, remainCount)} 篇</button>
          <button class="btn btn-subtle btn-sm" onclick="window.QM.cards.loadAll()">⚡ 一次载入全部 (${filtered.length} 篇)</button>
        </div>
      `;
    }

    gridEl.innerHTML = html;
  }

  function renderUI() {
    const { memories, currentDirName, viewMode, sortBy } = window.QM.state.state;
    const filtered = getFilteredMemories();

    const viewStatsEl = document.getElementById('view-stats');
    if (viewStatsEl) viewStatsEl.innerText = `显示 ${filtered.length} / ${memories.length} 条记忆`;

    // 刷新官方四大分类选项卡计数与高亮
    updateOfficialTabs();

    // 同步卡片流排序统一下拉框
    window.QM.utils?.syncNavDropdown?.('sort-dd', sortBy || 'name');

    // 同步统一折叠/展开按钮状态文本
    updateToggleAllBtn();

    // 渲染侧边栏
    window.QM.sidebar?.render();

    // 性能优化：在卡片模式下按需渲染卡片
    if (viewMode === 'cards') {
      renderCardsGrid(filtered);
    }

    window.QM.topology?.buildGalaxyGraph();
  }

  // 挂载分类过滤与统一折叠按钮点击事件
  document.addEventListener('DOMContentLoaded', () => {
    const tabsBar = document.getElementById('official-tabs-bar');
    if (tabsBar) {
      tabsBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.official-tab');
        if (btn) {
          const group = btn.getAttribute('data-group') || 'all';
          window.QM.sidebar?.selectOfficialCategory(group);
        }
      });
    }

    const btnToggleAll = document.getElementById('btn-toggle-all-cards');
    if (btnToggleAll) {
      btnToggleAll.addEventListener('click', toggleAllCards);
    }
  });

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
    loadAll,
    toggleCardCollapse,
    toggleAllCards
  };
})();

// 向下兼容旧调用
window.QM_CARDS = window.QM.cards;
