/**
 * Qoder Memory Visualizer - 宏观宇宙应用主入口与事件中枢 (Application Bootstrap)
 * 职责：宏观全宇宙数据聚合初始化、星系定位穿梭、多星系数据流协调与增量原子落盘
 */
window.QM = window.QM || {};

window.QM.app = (function() {
  async function initApp() {
    // 1. 初始化 3D 宏观宇宙引力拓扑引擎
    if (window.QM.topology?.init) {
      window.QM.topology.init();
    }

    // 2. 初始化应用运行模式 (默认模式 / 专业模式)
    if (window.QM.state?.setAppMode) {
      window.QM.state.setAppMode(window.QM.state.state.appMode || 'default');
    }

    // 3. 初始化特效模式设置 (从持久化缓存静默生效)
    if (window.QM.state?.setEffectsMode) {
      window.QM.state.setEffectsMode(window.QM.state.state.enableEffects, true);
    }

    // 4. 绑定 UI 事件
    bindUIEvents();

    // 5. 连接 Node 本地服务并载入宏观全宇宙
    await connectServer();
  }

  function populateEditionAndAccountSelect(ctx) {
    const edSel = document.getElementById('edition-select');
    const accSel = document.getElementById('account-select');
    const trkSel = document.getElementById('track-select');
    const state = window.QM.state.state;

    if (edSel && ctx.editions) {
      edSel.innerHTML = ctx.editions.map(e => 
        `<option value="${e.id}" ${e.id === state.edition ? 'selected' : ''}>${e.name}</option>`
      ).join('');
    }

    if (accSel) {
      updateAccountOptions(ctx, state.edition, state.account);
    }

    if (trkSel) {
      trkSel.value = state.track || 'ide';
    }
  }

  function updateAccountOptions(ctx, edition, currentAcc) {
    const accSel = document.getElementById('account-select');
    if (!accSel) return;
    const accList = (ctx.accounts && ctx.accounts[edition]) || [];

    if (accList.length === 0) {
      accSel.innerHTML = '<option value="" disabled selected>暂无账号目录</option>';
      window.QM.state.state.account = null;
      return;
    }

    let defaultAcc = currentAcc;
    if (!defaultAcc || !accList.some(a => a.id === defaultAcc)) {
      const activeItem = accList.find(a => a.isActive);
      defaultAcc = activeItem ? activeItem.id : accList[0].id;
    }
    window.QM.state.state.account = defaultAcc;

    accSel.innerHTML = accList.map(a => 
      `<option value="${a.id}" ${a.id === defaultAcc ? 'selected' : ''}>👤 ${a.name}</option>`
    ).join('');
  }

  /**
   * 填充顶部宏观星系导航下拉框 (直观呈现各星系规模)
   */
  function populateGalaxySelect(galaxies, currentVal = 'all') {
    const sel = document.getElementById('project-select');
    if (!sel || !galaxies) return;

    const escapeHtml = window.QM.utils?.escapeHtml || (s => s);
    const totalAllCount = galaxies.reduce((acc, g) => acc + (g.count || 0), 0);

    let html = `<option value="all" ${currentVal === 'all' ? 'selected' : ''}>🌌 宏观全宇宙视角 (全部 ${galaxies.length} 个星系 · 共 ${totalAllCount} 篇切片)</option>`;

    // 区分全局智库星系与工程星系
    const globalGroup = galaxies.filter(p => p.scope === 'global');
    const projectGroup = galaxies.filter(p => p.scope !== 'global');

    if (globalGroup.length > 0) {
      html += '<optgroup label="🌐 全局智库星系 (Global Scope)">';
      globalGroup.forEach(g => {
        const isSel = g.id === currentVal ? 'selected' : '';
        const scaleBadge = `${g.count || 0} 篇切片`;
        html += `<option value="${escapeHtml(g.id)}" ${isSel}>${escapeHtml(g.name)} [${scaleBadge}]</option>`;
      });
      html += '</optgroup>';
    }

    if (projectGroup.length > 0) {
      html += '<optgroup label="🪐 本地工程星系 (Project Scope - 依规模排序)">';
      projectGroup.forEach(g => {
        const isSel = g.id === currentVal ? 'selected' : '';
        const scaleBadge = `${g.count || 0} 篇切片`;
        const titleTip = g.workspacePath ? `源码工程: ${g.workspacePath}` : `物理目录: ${g.realPath}`;
        html += `<option value="${escapeHtml(g.id)}" title="${escapeHtml(titleTip)}" ${isSel}>${escapeHtml(g.name)} [${scaleBadge}]</option>`;
      });
      html += '</optgroup>';
    }

    sel.innerHTML = html;
    if (currentVal && sel.value !== currentVal) {
      sel.value = currentVal;
    }
  }

  function updateScopeBadge(scope, projId) {
    const isGlobal = scope === 'global';
    const isAll = !projId || projId === 'all';

    const drawerScopeSub = document.getElementById('drawer-scope-sub');
    if (drawerScopeSub) {
      drawerScopeSub.innerText = isAll
        ? '作用范围：🌌 宏观全宇宙 (Multi-Galaxy)'
        : `作用范围：${isGlobal ? '🌐 全局星系' : '📁 工程星系'} (${projId})`;
    }
  }

  let serverContextCache = null;

  async function connectServer() {
    const { api, state: stateCenter, utils, cards, topology } = window.QM;
    const state = stateCenter.state;

    const sStatus = await api.checkStatus();

    if (sStatus && sStatus.ok) {
      state.isServerMode = true;

      // 1. 获取国内外版本与账号上下文
      const ctx = await api.getContext();
      if (ctx && ctx.ok) {
        serverContextCache = ctx;
        state.edition = ctx.defaultEdition || 'cn';
        state.account = (ctx.defaultAccounts && ctx.defaultAccounts[state.edition]) || null;
        populateEditionAndAccountSelect(ctx);
      }

      // 2. 载入全宇宙宏观多星系数据
      await loadUniverseData('all');
    } else {
      state.isServerMode = false;
      if (utils?.showToast) {
        utils.showToast('提示：当前为离线模式，双击 start.bat 可启动本地服务实现免软链接物理直读直写');
      }
      if (cards?.renderUI) cards.renderUI();
      if (topology?.fitGalaxyView) topology.fitGalaxyView();
    }
  }

  /**
   * 一次性加载全宇宙所有星系数据 (需求 3 核心)
   */
  async function loadUniverseData(preferredFocus = 'all') {
    const { api, state: stateCenter, cards, topology, utils, sidebar } = window.QM;
    const s = stateCenter.state;

    if (!s.isServerMode) return;

    try {
      const res = await api.getAllMemories({
        edition: s.edition,
        account: s.account,
        track: s.track
      });

      if (res && res.galaxies) {
        s.galaxies = res.galaxies;
        s.availableProjects = res.galaxies;

        // 汇聚全宇宙所有星系的记忆切片
        const allMemories = [];
        const totalGroupCounts = { spec: 0, project: 0, experience: 0, task: 0 };

        res.galaxies.forEach(g => {
          (g.memories || []).forEach(m => {
            allMemories.push(m);
            const gid = m.officialGroup?.id || 'experience';
            totalGroupCounts[gid] = (totalGroupCounts[gid] || 0) + 1;
          });
        });

        s.memories = allMemories;
        s.groupCounts = totalGroupCounts;
        s.currentDirName = '宏观全宇宙';

        // 填充星系导航下拉框
        populateGalaxySelect(res.galaxies, preferredFocus);
        updateScopeBadge('all', preferredFocus);

        // 构建宏观全宇宙多星系网络
        if (topology?.clearCelestialStore) {
          topology.clearCelestialStore();
        }
        if (topology?.buildGalaxyGraph) {
          topology.buildGalaxyGraph();
        }

        // 刷新卡片列表与侧边栏统计
        if (stateCenter?.setDirty) stateCenter.setDirty(false);
        if (cards?.renderUI) cards.renderUI();
        if (sidebar?.renderUI) sidebar.renderUI();

        // 视角对齐
        if (preferredFocus === 'all') {
          if (topology?.fitGalaxyView) topology.fitGalaxyView();
        } else {
          if (topology?.focusOnGalaxy) topology.focusOnGalaxy(preferredFocus);
        }

        if (utils?.showToast) {
          const trackNote = s.track === 'agent' ? '🤖 Agent 任务库' : (s.track === 'all' ? '🌐 全量透视' : '🌟 IDE 官方记忆');
          utils.showToast(`🌌 宏观全宇宙已载入 [${trackNote}]：共 ${res.galaxies.length} 个星系，${allMemories.length} 篇切片`);
        }
      }
    } catch (err) {
      console.error('载入全宇宙多星系数据异常:', err);
      if (utils?.showToast) {
        utils.showToast(`载入宏观宇宙异常: ${err.message}`);
      }
    }
  }

  /**
   * 顶部星系导航器切换：支持全景俯瞰或平滑运镜飞入具体星系
   */
  function switchGalaxy(targetKey) {
    const { state: stateCenter, topology, utils } = window.QM;
    const s = stateCenter.state;

    if (targetKey === 'all') {
      s.activeGalaxyId = null;
      s.currentProject = 'all';
      updateScopeBadge('all', 'all');
      if (topology?.fitGalaxyView) topology.fitGalaxyView();
      if (utils?.showToast) {
        utils.showToast('🌌 摄像机已拉远至宏观全宇宙视野');
      }
    } else {
      s.activeGalaxyId = targetKey;
      s.currentProject = targetKey;
      const targetGalaxy = (s.galaxies || []).find(g => g.id === targetKey);
      updateScopeBadge(targetGalaxy?.scope || 'project', targetKey);
      if (topology?.focusOnGalaxy) topology.focusOnGalaxy(targetKey);
      if (utils?.showToast && targetGalaxy) {
        utils.showToast(`🚀 镜头已穿梭聚焦至星系：【${targetGalaxy.rawName || targetGalaxy.name}】(${targetGalaxy.count || 0} 篇切片)`);
      }
    }
  }

  /**
   * 全宇宙增量安全原子落盘 (自动归类到各自所属星系物理目录)
   */
  async function saveAllToDisk() {
    const { api, state: stateCenter, utils } = window.QM;
    const s = stateCenter.state;

    if (s.appMode !== 'pro') {
      if (utils?.showToast) {
        utils.showToast('当前处于默认模式。请先在顶部导航栏切换至「⚡ 专业模式」后再同步落盘！');
      }
      return;
    }

    if (s.isServerMode) {
      const dirtyItems = s.memories.filter(m => m.dirty);
      if (dirtyItems.length === 0) {
        if (stateCenter?.setDirty) stateCenter.setDirty(false);
        if (utils?.showToast) utils.showToast('本轮无待落盘的修改');
        return;
      }

      // 按所属星系工程分组落盘
      const projMap = new Map();
      dirtyItems.forEach(m => {
        const pId = m.projectId || s.currentProject || 'fmmpay-dev';
        if (!projMap.has(pId)) projMap.set(pId, []);
        projMap.get(pId).push(m);
      });

      let totalWritten = 0;
      let totalUnchanged = 0;

      try {
        for (const [projId, items] of projMap.entries()) {
          const res = await api.saveMemories(projId, items);
          if (res && res.ok) {
            totalWritten += (res.written || 0);
            totalUnchanged += (res.unchanged || 0);
          }
        }

        dirtyItems.forEach(m => { delete m.dirty; });
        if (stateCenter?.setDirty) stateCenter.setDirty(false);

        if (utils?.showToast) {
          const unchangedNote = totalUnchanged > 0 ? `，${totalUnchanged} 篇无差异保持原样` : '';
          utils.showToast(`💾 已成功原子落盘 ${totalWritten} 篇切片至对应星系${unchangedNote}，索引已同步！`);
        }
      } catch (err) {
        if (utils?.showToast) {
          utils.showToast(`落盘失败: ${err.message}`);
        }
      }
    } else {
      if (utils?.showToast) {
        utils.showToast('离线模式无法直接写入磁盘，请运行 start.bat 开启本地微服务！');
      }
    }
  }

  function bindUIEvents() {
    const { state: stateCenter, cards, topology, drawer, api, utils } = window.QM;

    // 0. 版本切换 (国内版 / 国际版)
    const selEdition = document.getElementById('edition-select');
    if (selEdition) {
      selEdition.addEventListener('change', async e => {
        const newEdition = e.target.value;
        stateCenter.state.edition = newEdition;
        if (serverContextCache) {
          updateAccountOptions(serverContextCache, newEdition, null);
        }
        await loadUniverseData('all');
        if (utils?.showToast) {
          utils.showToast(`已切换至版本：${newEdition === 'cn' ? '🇨🇳 国内版 (Qoder CN)' : '🌐 国际版 (Qoder Global)'}`);
        }
      });
    }

    // 0.1 账号切换
    const selAccount = document.getElementById('account-select');
    if (selAccount) {
      selAccount.addEventListener('change', async e => {
        const newAcc = e.target.value;
        stateCenter.state.account = newAcc;
        await loadUniverseData('all');
        if (utils?.showToast) {
          utils.showToast(`已切换至账号：${newAcc}`);
        }
      });
    }

    // 0.2 记忆源轨道切换 (🌟 IDE 官方长期记忆 / 🤖 Agent 任务记忆 / 🌐 全量透视)
    const selTrack = document.getElementById('track-select');
    if (selTrack) {
      selTrack.addEventListener('change', async e => {
        const newTrack = e.target.value;
        stateCenter.state.track = newTrack;
        await loadUniverseData('all');
      });
    }

    // 1. 运行模式切换 (默认模式 vs 专业模式)
    const btnModeDefault = document.getElementById('btn-mode-default');
    const btnModePro = document.getElementById('btn-mode-pro');

    if (btnModeDefault) {
      btnModeDefault.addEventListener('click', async () => {
        if (stateCenter.state.appMode !== 'default') {
          stateCenter.setAppMode('default');
          if (cards?.renderUI) cards.renderUI();
          await loadUniverseData('all');
          if (utils?.showToast) utils.showToast('已切换至【默认模式】：仅显示 IDE 官方记忆');
        }
      });
    }

    if (btnModePro) {
      btnModePro.addEventListener('click', () => {
        if (stateCenter.state.appMode !== 'pro') {
          stateCenter.setAppMode('pro');
          if (cards?.renderUI) cards.renderUI();
          if (utils?.showToast) utils.showToast('已切换至【专业模式】：已解锁全量功能与编辑修改');
        }
      });
    }

    // 2. 视图切换
    const btnModeGalaxy = document.getElementById('btn-mode-galaxy');
    const btnModeCards = document.getElementById('btn-mode-cards');
    if (btnModeGalaxy) {
      btnModeGalaxy.addEventListener('click', () => {
        stateCenter.setViewMode('galaxy');
        if (topology?.resizeCanvas) topology.resizeCanvas();
      });
    }
    if (btnModeCards) {
      btnModeCards.addEventListener('click', () => stateCenter.setViewMode('cards'));
    }

    // 2.1 动态特效与静止节能切换
    const btnEffects = document.getElementById('btn-effects-toggle');
    if (btnEffects) {
      btnEffects.addEventListener('click', () => {
        stateCenter.setEffectsMode(!stateCenter.state.enableEffects);
      });
    }

    const menuToggleEffects = document.getElementById('menu-toggle-effects');
    if (menuToggleEffects) {
      menuToggleEffects.addEventListener('click', () => {
        const moreMenu = document.getElementById('more-menu');
        if (moreMenu) moreMenu.classList.remove('show');
        stateCenter.setEffectsMode(!stateCenter.state.enableEffects);
      });
    }

    // 3. 星系视界导航器
    const selGalaxy = document.getElementById('project-select');
    if (selGalaxy) {
      selGalaxy.addEventListener('change', e => switchGalaxy(e.target.value));
    }

    const btnRescan = document.getElementById('btn-rescan-projects');
    if (btnRescan) {
      btnRescan.addEventListener('click', async () => {
        btnRescan.style.transform = 'rotate(180deg)';
        await loadUniverseData('all');
        setTimeout(() => { btnRescan.style.transform = ''; }, 350);
      });
    }

    const btnOpenFolder = document.getElementById('btn-open-folder');
    if (btnOpenFolder) {
      btnOpenFolder.addEventListener('click', async () => {
        const s = stateCenter.state;
        const targetProj = s.activeGalaxyId || (s.galaxies && s.galaxies[0] ? s.galaxies[0].id : 'fmmpay-dev');
        try {
          const res = await api.openFolder(targetProj, 'memory');
          if (res && res.ok && utils?.showToast) {
            utils.showToast(`已在系统资源管理器打开目录：${res.opened}`);
          }
        } catch (err) {
          if (utils?.showToast) {
            utils.showToast(`打开目录失败: ${err.message}`);
          }
        }
      });
    }

    // 4. 搜索框
    const searchBox = document.getElementById('search-box');
    if (searchBox) {
      searchBox.addEventListener('input', e => {
        stateCenter.state.searchQuery = e.target.value.trim();
        if (cards?.renderUI) cards.renderUI();
        if (topology?.requestRender) topology.requestRender();
      });
    }

    // 5. 排序选择
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', e => {
        stateCenter.state.sortBy = e.target.value;
        if (cards?.renderUI) cards.renderUI();
      });
    }

    // 6. 新建与保存
    const newCardBtn = document.getElementById('new-card-btn');
    if (newCardBtn) {
      newCardBtn.addEventListener('click', () => {
        if (drawer?.openNewCardDrawer) drawer.openNewCardDrawer();
      });
    }

    const saveAllBtn = document.getElementById('save-all-btn');
    if (saveAllBtn) saveAllBtn.addEventListener('click', () => saveAllToDisk());

    // 7. 抽屉内部控制
    const closeDrawerBtn = document.getElementById('close-drawer');
    const cancelDrawerBtn = document.getElementById('drawer-cancel-btn');
    const saveDrawerBtn = document.getElementById('drawer-save-btn');
    if (closeDrawerBtn) {
      closeDrawerBtn.addEventListener('click', () => {
        if (drawer?.closeDrawer) drawer.closeDrawer();
        if (topology?.deselectFocus) topology.deselectFocus();
      });
    }
    if (cancelDrawerBtn) {
      cancelDrawerBtn.addEventListener('click', () => {
        if (drawer?.closeDrawer) drawer.closeDrawer();
        if (topology?.deselectFocus) topology.deselectFocus();
      });
    }
    if (saveDrawerBtn) {
      saveDrawerBtn.addEventListener('click', () => {
        if (drawer?.saveCurrentDrawer) drawer.saveCurrentDrawer();
      });
    }

    // 8. 更多菜单与 MEMORY.md 预览弹窗
    const moreMenuBtn = document.getElementById('more-menu-btn');
    const moreMenu = document.getElementById('more-menu');
    if (moreMenuBtn && moreMenu) {
      moreMenuBtn.addEventListener('click', e => {
        e.stopPropagation();
        moreMenu.classList.toggle('show');
      });
      window.addEventListener('click', e => {
        if (!e.target.closest('#more-dropdown')) moreMenu.classList.remove('show');
      });
    }

    const viewIndexBtn = document.getElementById('view-index-btn');
    const indexModal = document.getElementById('index-modal');
    if (viewIndexBtn && indexModal) {
      viewIndexBtn.addEventListener('click', () => {
        if (moreMenu) moreMenu.classList.remove('show');
        const preview = document.getElementById('index-content-preview');
        if (preview && stateCenter?.generateMemoryIndex) {
          preview.value = stateCenter.generateMemoryIndex();
        }
        indexModal.classList.remove('hidden');
      });
    }

    // 快捷键支持
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveAllToDisk();
      } else if (e.key === 'Escape') {
        if (drawer?.closeDrawer) drawer.closeDrawer();
        if (indexModal) indexModal.classList.add('hidden');
        if (topology?.deselectFocus) topology.deselectFocus();
      }
    });
  }

  return {
    initApp,
    loadUniverseData,
    switchGalaxy,
    saveAllToDisk
  };
})();

// 向下兼容旧调用
window.QM_APP = window.QM.app;

// 页面加载完成后启动应用
window.addEventListener('DOMContentLoaded', () => {
  window.QM.app.initApp();
});
