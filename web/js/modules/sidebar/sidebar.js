/**
 * Qoder Memory Visualizer - 侧边栏模块 (Sidebar Module)
 * 职责：认知分类体系列表、语义高频标签云的统计、过滤与联动激活
 */
window.QM = window.QM || {};

window.QM.sidebar = (function() {
  /**
   * 获取当前聚焦/选中的星系所包含的有效记忆切片集合
   */
  function getCurrentGalaxyMemories() {
    const state = window.QM.state.state;
    const activeGalaxyId = state.activeGalaxyId;
    if (!activeGalaxyId || activeGalaxyId === 'all') {
      return state.memories || [];
    }
    return (state.memories || []).filter(m => 
      m.projectId === activeGalaxyId || 
      m.galaxyId === activeGalaxyId ||
      (state.galaxies && state.galaxies.find(g => g.id === activeGalaxyId)?.memories?.some(gm => gm.id === m.id))
    );
  }

  function render() {
    const { activeCategory, activeTag } = window.QM.state.state;
    const { CATEGORY_MAP, OFFICIAL_CATEGORIES, mapToOfficialGroup } = window.QM.constants;
    const { escapeHtml } = window.QM.utils;
    const state = window.QM.state.state;

    // 获取当前选中星系的数据集 (全宇宙或特定星系)
    const targetMemories = getCurrentGalaxyMemories();
    const targetGalaxy = (state.galaxies || []).find(g => g.id === state.activeGalaxyId);
    const galaxyName = targetGalaxy ? (targetGalaxy.rawName || targetGalaxy.name) : null;

    // 0. 官方四大分类统计与渲染 (与当前星系联动)
    const groupCounts = { spec: 0, project: 0, experience: 0, task: 0 };
    targetMemories.forEach(m => {
      const gid = (m.officialGroup && m.officialGroup.id) || mapToOfficialGroup(m.category).id;
      groupCounts[gid] = (groupCounts[gid] || 0) + 1;
    });

    const officialListEl = document.getElementById('official-category-list');
    if (officialListEl) {
      const currOfficial = window.QM.state.state.officialCategory || 'all';
      const allLabel = galaxyName ? `🌟 ${escapeHtml(galaxyName)} 全部` : '🌟 全部记忆';
      let officialHtml = `
        <div class="official-cat-item ${currOfficial === 'all' ? 'active' : ''}" data-group="all" title="${allLabel}" onclick="window.QM.sidebar.selectOfficialCategory('all')">
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${allLabel}</span>
          <span class="official-cat-badge">${targetMemories.length}</span>
        </div>
      `;

      for (const [gid, grp] of Object.entries(OFFICIAL_CATEGORIES)) {
        const count = groupCounts[gid] || 0;
        officialHtml += `
          <div class="official-cat-item ${currOfficial === gid ? 'active' : ''}" data-group="${gid}" title="${grp.name}" onclick="window.QM.sidebar.selectOfficialCategory('${gid}')">
            <span>${grp.icon} ${grp.name}</span>
            <span class="official-cat-badge">${count}</span>
          </div>
        `;
      }
      officialListEl.innerHTML = officialHtml;
    }
    const officialTotalEl = document.getElementById('official-cat-total-count');
    if (officialTotalEl) officialTotalEl.innerText = targetMemories.length;

    // 1. 底层子目录细分统计与列表 (与当前星系与官方大类联动过滤)
    const catCounts = {};
    const currOfficial = window.QM.state.state.officialCategory || 'all';
    const targetOfficialGroup = (currOfficial !== 'all' && OFFICIAL_CATEGORIES) ? OFFICIAL_CATEGORIES[currOfficial] : null;
    const allowedSubs = targetOfficialGroup ? new Set(targetOfficialGroup.subs || []) : null;

    targetMemories.forEach(m => {
      const c = m.category || 'other';
      if (allowedSubs && !allowedSubs.has(c)) return;
      catCounts[c] = (catCounts[c] || 0) + 1;
    });

    const catListEl = document.getElementById('category-list');
    if (catListEl) {
      let catHtml = '';
      const catKeys = Object.keys(catCounts).sort();
      if (catKeys.length === 0) {
        catHtml = `<div class="sidebar-empty-tip">(当前星系分类下暂无切片)</div>`;
      } else {
        catKeys.forEach(cat => {
          const label = (CATEGORY_MAP[cat] && CATEGORY_MAP[cat].name) || cat;
          catHtml += `
            <div class="cat-item surface-translucent ${activeCategory === cat ? 'active' : ''}" data-category="${escapeHtml(cat)}" title="${escapeHtml(label)}" onclick="window.QM.sidebar.selectCategory(this.getAttribute('data-category'))">
              <span>${escapeHtml(label)}</span>
              <span class="cat-count">${catCounts[cat]}</span>
            </div>
          `;
        });
      }
      catListEl.innerHTML = catHtml;
    }
    const catTotalEl = document.getElementById('cat-total-count');
    if (catTotalEl) catTotalEl.innerText = Object.keys(catCounts).length;

    // 2. 标签云统计与渲染 (与当前星系联动)
    renderTagCloud();
  }

  function renderTagCloud() {
    const { activeTag } = window.QM.state.state;
    const { escapeHtml } = window.QM.utils;
    const topology = window.QM.topology;

    // 当选中特定星体时展示关联星体标签；未选中单一天体时展示当前选中星系下的标签云
    const focusedMemories = topology?.getFocusedRelatedMemories ? topology.getFocusedRelatedMemories() : null;
    const isFocused = focusedMemories !== null;
    const galaxyMemories = getCurrentGalaxyMemories();
    const targetMemories = isFocused ? focusedMemories : galaxyMemories;

    const tagCounts = {};
    targetMemories.forEach(m => {
      (m.keywords || []).forEach(k => {
        const t = k.trim();
        if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });

    const tagCloudEl = document.getElementById('tag-cloud');
    if (tagCloudEl) {
      const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
      if (sortedTags.length === 0) {
        const emptyTip = isFocused ? '(当前关联星体暂无标签)' : '(当前星系暂无高频标签)';
        tagCloudEl.innerHTML = `<div class="sidebar-empty-tip">${emptyTip}</div>`;
      } else {
        let tagHtml = '';
        sortedTags.slice(0, 30).forEach(tag => {
          tagHtml += `
            <span class="tag-pill ${activeTag === tag ? 'active' : ''}" title="${escapeHtml(tag)} (${tagCounts[tag]})" onclick="window.QM.sidebar.toggleTag('${escapeHtml(tag)}')">
              ${escapeHtml(tag)} <small class="tag-count-num">(${tagCounts[tag]})</small>
            </span>
          `;
        });
        tagCloudEl.innerHTML = tagHtml;
      }
    }
    const tagTotalEl = document.getElementById('tag-total-count');
    if (tagTotalEl) {
      tagTotalEl.innerText = Object.keys(tagCounts).length;
      tagTotalEl.title = isFocused ? '当前所选星体及关联星体包含的独立标签数' : '当前星系高频语义标签总数';
    }
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

  function selectOfficialCategory(groupKey = 'all') {
    const state = window.QM.state.state;
    state.officialCategory = groupKey || 'all';
    state.activeCategory = 'all'; // 选中官方大类时重置细分子类

    // 重新渲染侧边栏（官方分类高亮 + 子目录过滤联动）
    render();

    // 同步卡片流顶部 tabs 高亮
    const tabsBar = document.getElementById('official-tabs-bar');
    if (tabsBar) {
      tabsBar.querySelectorAll('.official-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-group') === state.officialCategory);
      });
    }

    // 刷新卡片列表
    if (window.QM.cards) {
      window.QM.cards.renderUI();
    }

    // 关键联动：在全宇宙拓扑视图下高亮该大类行星群并运镜聚焦！
    if (window.QM.topology?.onOfficialCategoryChanged) {
      window.QM.topology.onOfficialCategoryChanged(state.officialCategory);
    }

    window.QM.state.emit('official-category-changed', state.officialCategory);
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

    renderTagCloud();
    window.QM.cards?.renderUI();

    const hudText = document.getElementById('hud-text');
    const hudIndicator = document.getElementById('hud-indicator');

    if (state.activeTag) {
      const matchedUnits = state.memories.filter(m => (m.keywords || []).includes(state.activeTag));
      if (hudText) hudText.innerText = `⚡ 关键词共振激活：【${state.activeTag}】 · 聚焦 ${matchedUnits.length} 个记忆切片`;
      if (hudIndicator) {
        // 关键词共振聚焦记忆切片，沿用画布卡片数据色 --viz-unit
        hudIndicator.style.background = "var(--viz-unit)";
        hudIndicator.style.boxShadow = "0 0 8px var(--viz-unit)";
      }
      window.QM.utils?.showToast(`⚡ 已激活「${state.activeTag}」语义共振场（${matchedUnits.length} 条切片聚焦）`);
    } else {
      window.QM.topology?.updateFocusRelatedSet();
      window.QM.utils?.showToast(`已重置关键词共振，恢复全域星系`);
    }
  }

  return {
    render,
    renderUI: render,
    renderTagCloud,
    selectOfficialCategory,
    selectCategory,
    highlightCategory,
    toggleTag
  };
})();

// 向下兼容旧调用
window.QM_SIDEBAR = window.QM.sidebar;
