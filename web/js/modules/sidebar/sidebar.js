/**
 * Qoder Memory Visualizer - 侧边栏模块 (Sidebar Module)
 * 职责：认知分类体系列表、语义高频标签云的统计、过滤与联动激活
 */
window.QM = window.QM || {};

window.QM.sidebar = (function() {
  function render() {
    const state = (window.QM && window.QM.state) ? window.QM.state.state : window.QM_STATE.state;
    const { memories, activeCategory, activeTag } = state;
    const constants = (window.QM && window.QM.constants) || window.QM_CONSTANTS;
    const utils = (window.QM && window.QM.utils) || window.QM_CONSTANTS;
    const { CATEGORY_MAP } = constants;
    const { escapeHtml } = utils;

    // 1. 分类统计与列表
    const catCounts = {};
    memories.forEach(m => {
      const c = m.category || 'other';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });

    const catListEl = document.getElementById('category-list');
    if (catListEl) {
      let catHtml = `
        <div class="cat-item ${activeCategory === 'all' ? 'active' : ''}" data-category="all" onclick="QM.sidebar.selectCategory('all')">
          <span>🌟 全部记忆集群</span>
          <span class="cat-count">${memories.length}</span>
        </div>
      `;
      Object.keys(catCounts).sort().forEach(cat => {
        const label = (CATEGORY_MAP[cat] && CATEGORY_MAP[cat].name) || cat;
        catHtml += `
          <div class="cat-item ${activeCategory === cat ? 'active' : ''}" data-category="${escapeHtml(cat)}" onclick="QM.sidebar.selectCategory(this.getAttribute('data-category'))">
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
          <span class="tag-pill ${activeTag === tag ? 'active' : ''}" onclick="QM.sidebar.toggleTag('${escapeHtml(tag)}')">
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
    const state = (window.QM && window.QM.state) ? window.QM.state.state : window.QM_STATE.state;
    state.activeCategory = catKey || 'all';

    const catListEl = document.getElementById('category-list');
    if (catListEl) {
      const items = catListEl.querySelectorAll('.cat-item');
      let targetItem = null;
      items.forEach(item => {
        const itemCat = item.getAttribute('data-category');
        if (itemCat === state.activeCategory) {
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

    const cardsModule = (window.QM && window.QM.cards) || window.QM_CARDS;
    if (cardsModule) {
      const filtered = cardsModule.getFilteredMemories();
      const viewStatsEl = document.getElementById('view-stats');
      if (viewStatsEl) {
        viewStatsEl.innerText = `显示 ${filtered.length} / ${state.memories.length} 条记忆`;
      }

      if (state.viewMode === 'cards') {
        cardsModule.renderCardsGrid(filtered);
      }
    }
  }

  function selectCategory(cat) {
    cat = cat || 'all';
    highlightCategory(cat, false);

    // 如果处于银河星系视图，联动聚焦对应的天体与运镜
    const topology = (window.QM && window.QM.topology) || window.QM_GALAXY;
    const state = (window.QM && window.QM.state) ? window.QM.state.state : window.QM_STATE.state;
    if (state.viewMode === 'galaxy' && topology && typeof topology.focusOnCategory === 'function') {
      topology.focusOnCategory(cat);
    }
  }

  function toggleTag(tag) {
    const state = (window.QM && window.QM.state) ? window.QM.state.state : window.QM_STATE.state;
    const utils = (window.QM && window.QM.utils) || window.QM_CONSTANTS;
    const cardsModule = (window.QM && window.QM.cards) || window.QM_CARDS;

    state.activeTag = state.activeTag === tag ? null : tag;

    if (cardsModule && typeof cardsModule.renderUI === 'function') {
      cardsModule.renderUI();
    }

    const hudText = document.getElementById('hud-text');
    const hudIndicator = document.getElementById('hud-indicator');
    const topology = (window.QM && window.QM.topology) || window.QM_GALAXY;

    if (state.activeTag) {
      const matchedUnits = state.memories.filter(m => (m.keywords || []).includes(state.activeTag));
      if (hudText) hudText.innerText = `⚡ 关键词共振激活：【${state.activeTag}】 · 聚焦 ${matchedUnits.length} 个记忆切片`;
      if (hudIndicator) {
        hudIndicator.style.background = "#c084fc";
        hudIndicator.style.boxShadow = "0 0 10px #c084fc";
      }
      if (utils && utils.showToast) {
        utils.showToast(`⚡ 已激活「${state.activeTag}」语义共振场（${matchedUnits.length} 条切片聚焦）`);
      }
    } else {
      if (topology && typeof topology.updateFocusRelatedSet === 'function') {
        topology.updateFocusRelatedSet();
      }
      if (utils && utils.showToast) {
        utils.showToast(`已重置关键词共振，恢复全域星系`);
      }
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
