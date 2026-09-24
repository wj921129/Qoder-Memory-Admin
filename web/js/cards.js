/**
 * Qoder Memory Visualizer - 知识卡片流与分类标签渲染器
 */
window.QM_CARDS = (function() {
  function getFilteredMemories() {
    const { memories, activeCategory, activeTag, searchQuery, sortBy } = QM_STATE.state;

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

  function renderSidebar() {
    const { memories, activeCategory, activeTag } = QM_STATE.state;
    const { CATEGORY_MAP, escapeHtml } = QM_CONSTANTS;

    // 1. 分类统计与列表
    const catCounts = {};
    memories.forEach(m => {
      const c = m.category || 'other';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });

    const catListEl = document.getElementById('category-list');
    if (catListEl) {
      let catHtml = `
        <div class="cat-item ${activeCategory === 'all' ? 'active' : ''}" data-category="all" onclick="QM_CARDS.selectCategory('all')">
          <span>🌟 全部记忆集群</span>
          <span class="cat-count">${memories.length}</span>
        </div>
      `;
      Object.keys(catCounts).sort().forEach(cat => {
        const label = (CATEGORY_MAP[cat] && CATEGORY_MAP[cat].name) || cat;
        catHtml += `
          <div class="cat-item ${activeCategory === cat ? 'active' : ''}" data-category="${escapeHtml(cat)}" onclick="QM_CARDS.selectCategory(this.getAttribute('data-category'))">
            <span>${escapeHtml(label)}</span>
            <span class="cat-count">${catCounts[cat]}</span>
          </div>
        `;
      });
      catListEl.innerHTML = catHtml;
    }
    const catTotalEl = document.getElementById('cat-total-count');
    if (catTotalEl) catTotalEl.innerText = Object.keys(catCounts).length;

    // 2. 标签云统计
    const tagCounts = {};
    memories.forEach(m => {
      (m.keywords || []).forEach(k => {
        const t = k.trim();
        if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });

    const tagCloudEl = document.getElementById('tag-cloud');
    if (tagCloudEl) {
      let tagHtml = '';
      Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]).slice(0, 30).forEach(tag => {
        tagHtml += `
          <span class="tag-pill ${activeTag === tag ? 'active' : ''}" onclick="QM_CARDS.toggleTag('${escapeHtml(tag)}')">
            ${escapeHtml(tag)} <small style="opacity:0.7;">(${tagCounts[tag]})</small>
          </span>
        `;
      });
      tagCloudEl.innerHTML = tagHtml;
    }
    const tagTotalEl = document.getElementById('tag-total-count');
    if (tagTotalEl) tagTotalEl.innerText = Object.keys(tagCounts).length;
  }

  function renderCardsGrid(filtered) {
    const { isEditMode } = QM_STATE.state;
    const { CATEGORY_MAP, escapeHtml, renderMarkdown } = QM_CONSTANTS;
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

      const typeInfo = (QM_CONSTANTS.TYPE_MAP && QM_CONSTANTS.TYPE_MAP[m.type]) || { name: m.type || 'project', icon: '🏛️', badgeClass: 'type-project' };
      const typeHtml = `<span class="badge-tag badge-type ${typeInfo.badgeClass}" title="Qoder 官方规范类型: ${escapeHtml(typeInfo.name)}">${typeInfo.icon} ${escapeHtml(m.type || 'project')}</span>`;

      return `
        <div class="memory-card" id="card-${escapeHtml(m.id)}">
          <div class="card-title" onclick="QM_DRAWER.openDrawer('${escapeHtml(m.id)}')">${escapeHtml(m.name)}</div>
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
                <button class="btn btn-subtle btn-sm" onclick="QM_DRAWER.openDrawer('${escapeHtml(m.id)}')">✏️ 编辑</button>
                <button class="btn btn-danger btn-sm" onclick="QM_DRAWER.deleteCard('${escapeHtml(m.id)}')">🗑️ 删除</button>
              ` : `
                <button class="btn btn-subtle btn-sm" onclick="QM_DRAWER.openDrawer('${escapeHtml(m.id)}')">👁️ 查阅</button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderUI() {
    const { memories, currentDirName } = QM_STATE.state;
    const filtered = getFilteredMemories();

    const statInfoEl = document.getElementById('stat-info');
    if (statInfoEl) statInfoEl.innerText = `${currentDirName} · ${memories.length} 记忆切片`;

    const viewStatsEl = document.getElementById('view-stats');
    if (viewStatsEl) viewStatsEl.innerText = `显示 ${filtered.length} / ${memories.length} 条记忆`;

    renderSidebar();

    // 性能优化：银河模式下避免耗时的全量 Markdown 解析与 DOM 重排，仅在卡片视图下才按需渲染
    if (QM_STATE.state.viewMode === 'cards') {
      renderCardsGrid(filtered);
    }

    if (window.QM_GALAXY && typeof window.QM_GALAXY.buildGalaxyGraph === 'function') {
      window.QM_GALAXY.buildGalaxyGraph();
    }
  }

  // 监听视图切换事件，若切换到卡片模式则按需渲染卡片，若切换到银河模式则联动聚焦
  if (window.QM_STATE && typeof window.QM_STATE.on === 'function') {
    QM_STATE.on('view-changed', (mode) => {
      if (mode === 'cards') {
        const filtered = getFilteredMemories();
        renderCardsGrid(filtered);
      } else if (mode === 'galaxy') {
        if (window.QM_GALAXY && typeof window.QM_GALAXY.focusOnCategory === 'function') {
          window.QM_GALAXY.focusOnCategory(QM_STATE.state.activeCategory);
        }
      }
    });
  }

  function highlightCategory(catKey, shouldScroll = true) {
    const s = QM_STATE.state;
    s.activeCategory = catKey || 'all';

    const catListEl = document.getElementById('category-list');
    if (catListEl) {
      const items = catListEl.querySelectorAll('.cat-item');
      let targetItem = null;
      items.forEach(item => {
        const itemCat = item.getAttribute('data-category');
        if (itemCat === s.activeCategory) {
          item.classList.add('active');
          targetItem = item;
        } else {
          item.classList.remove('active');
        }
      });

      if (shouldScroll && targetItem) {
        targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    const filtered = getFilteredMemories();
    const viewStatsEl = document.getElementById('view-stats');
    if (viewStatsEl) {
      viewStatsEl.innerText = `显示 ${filtered.length} / ${s.memories.length} 条记忆`;
    }

    if (s.viewMode === 'cards') {
      renderCardsGrid(filtered);
    }
  }

  function selectCategory(cat) {
    cat = cat || 'all';
    highlightCategory(cat, false);

    // 如果处于银河星系视图，联动聚焦对应的天体与运镜
    if (QM_STATE.state.viewMode === 'galaxy' && window.QM_GALAXY && typeof window.QM_GALAXY.focusOnCategory === 'function') {
      window.QM_GALAXY.focusOnCategory(cat);
    }
  }

  function toggleTag(tag) {
    const s = QM_STATE.state;
    s.activeTag = s.activeTag === tag ? null : tag;
    renderUI();

    const hudText = document.getElementById('hud-text');
    const hudIndicator = document.getElementById('hud-indicator');
    if (s.activeTag) {
      const matchedUnits = s.memories.filter(m => (m.keywords || []).includes(s.activeTag));
      if (hudText) hudText.innerText = `⚡ 关键词共振激活：【${s.activeTag}】 · 聚焦 ${matchedUnits.length} 个记忆切片`;
      if (hudIndicator) {
        hudIndicator.style.background = "#c084fc";
        hudIndicator.style.boxShadow = "0 0 10px #c084fc";
      }
      QM_CONSTANTS.showToast(`⚡ 已激活「${s.activeTag}」语义共振场（${matchedUnits.length} 条切片聚焦）`);
    } else {
      if (window.QM_GALAXY && typeof window.QM_GALAXY.updateFocusRelatedSet === 'function') {
        window.QM_GALAXY.updateFocusRelatedSet();
      }
      QM_CONSTANTS.showToast(`已重置关键词共振，恢复全域星系`);
    }
  }

  return {
    renderUI,
    selectCategory,
    highlightCategory,
    toggleTag,
    getFilteredMemories,
    renderCardsGrid
  };
})();
