/**
 * Qoder Memory Visualizer - 侧边栏模块 (Sidebar Module)
 * 职责：认知分类体系列表、语义高频标签云的统计、过滤与联动激活
 */
window.QM = window.QM || {};

window.QM.sidebar = (function() {
  function render() {
    const { memories, activeCategory, activeTag } = window.QM.state.state;
    const { CATEGORY_MAP } = window.QM.constants;
    const { escapeHtml } = window.QM.utils;

    // 1. 分类统计与列表
    const catCounts = {};
    memories.forEach(m => {
      const c = m.category || 'other';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });

    const catListEl = document.getElementById('category-list');
    if (catListEl) {
      let catHtml = `
        <div class="cat-item ${activeCategory === 'all' ? 'active' : ''}" data-category="all" onclick="window.QM.sidebar.selectCategory('all')">
          <span>🌟 全部记忆集群</span>
          <span class="cat-count">${memories.length}</span>
        </div>
      `;
      Object.keys(catCounts).sort().forEach(cat => {
        const label = (CATEGORY_MAP[cat] && CATEGORY_MAP[cat].name) || cat;
        catHtml += `
          <div class="cat-item ${activeCategory === cat ? 'active' : ''}" data-category="${escapeHtml(cat)}" onclick="window.QM.sidebar.selectCategory(this.getAttribute('data-category'))">
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
          <span class="tag-pill ${activeTag === tag ? 'active' : ''}" onclick="window.QM.sidebar.toggleTag('${escapeHtml(tag)}')">
            ${escapeHtml(tag)} <small style="opacity:0.7;">(${tagCounts[tag]})</small>
          </span>
        `;
      });
      tagCloudEl.innerHTML = tagHtml;
    }
    const tagTotalEl = document.getElementById('tag-total-count');
    if (tagTotalEl) tagTotalEl.innerText = Object.keys(tagCounts).length;
  }

  function highlightCategory(catKey, shouldScroll = true) {
    const state = window.QM.state.state;
    state.activeCategory = catKey || 'all';

    const catListEl = document.getElementById('category-list');
    if (catListEl) {
      let targetItem = null;
      catListEl.querySelectorAll('.cat-item').forEach(item => {
        const isMatch = item.getAttribute('data-category') === state.activeCategory;
        item.classList.toggle('active', isMatch);
        if (isMatch) targetItem = item;
      });

      if (shouldScroll && targetItem) {
        targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    if (window.QM.cards) {
      const filtered = window.QM.cards.getFilteredMemories();
      const viewStatsEl = document.getElementById('view-stats');
      if (viewStatsEl) {
        viewStatsEl.innerText = `显示 ${filtered.length} / ${state.memories.length} 条记忆`;
      }

      if (state.viewMode === 'cards') {
        window.QM.cards.renderCardsGrid(filtered);
      }
    }
  }

  function selectCategory(cat = 'all') {
    highlightCategory(cat, false);

    // 如果处于银河星系视图，联动聚焦对应的天体与运镜
    if (window.QM.state.state.viewMode === 'galaxy') {
      window.QM.topology?.focusOnCategory(cat);
    }
  }

  function toggleTag(tag) {
    const state = window.QM.state.state;
    state.activeTag = state.activeTag === tag ? null : tag;

    window.QM.cards?.renderUI();

    const hudText = document.getElementById('hud-text');
    const hudIndicator = document.getElementById('hud-indicator');

    if (state.activeTag) {
      const matchedUnits = state.memories.filter(m => (m.keywords || []).includes(state.activeTag));
      if (hudText) hudText.innerText = `⚡ 关键词共振激活：【${state.activeTag}】 · 聚焦 ${matchedUnits.length} 个记忆切片`;
      if (hudIndicator) {
        hudIndicator.style.background = "#c084fc";
        hudIndicator.style.boxShadow = "0 0 10px #c084fc";
      }
      window.QM.utils?.showToast(`⚡ 已激活「${state.activeTag}」语义共振场（${matchedUnits.length} 条切片聚焦）`);
    } else {
      window.QM.topology?.updateFocusRelatedSet();
      window.QM.utils?.showToast(`已重置关键词共振，恢复全域星系`);
    }
  }

  return {
    render,
    selectCategory,
    highlightCategory,
    toggleTag
  };
})();

// 向下兼容旧调用
window.QM_SIDEBAR = window.QM.sidebar;
