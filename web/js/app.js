/**
 * Qoder Memory Visualizer - 应用主入口与事件中枢 (Application Bootstrap)
 * 职责：系统初始化、全局事件总线协调、项目切换与磁盘落盘同步
 */
window.QM = window.QM || {};

window.QM.app = (function() {
  async function initApp() {
    // 1. 初始化 3D 引力拓扑引擎
    if (window.QM.topology?.init) {
      window.QM.topology.init();
    }

    // 2. 默认以只读安全模式启动
    if (window.QM.state?.setEditMode) {
      window.QM.state.setEditMode(false);
    }

    // 3. 初始化特效模式设置 (从持久化缓存静默生效)
    if (window.QM.state?.setEffectsMode) {
      window.QM.state.setEffectsMode(window.QM.state.state.enableEffects, true);
    }

    // 4. 绑定 UI 事件
    bindUIEvents();

    // 5. 连接 Node 本地服务
    await connectServer();
  }

  function populateProjectSelect(projects, currentVal) {
    const sel = document.getElementById('project-select');
    if (!sel || !projects) return;

    const escapeHtml = window.QM.utils?.escapeHtml || (s => s);

    const globalGroup = projects.filter(p => p.scope === 'global');
    const projectGroup = projects.filter(p => p.scope !== 'global');

    let html = '';
    if (globalGroup.length > 0) {
      html += '<optgroup label="🌐 全局记忆库 (Global Scope)">';
      globalGroup.forEach(p => {
        const isSel = p.id === currentVal ? 'selected' : '';
        html += `<option value="${escapeHtml(p.id)}" ${isSel}>${escapeHtml(p.name)}</option>`;
      });
      html += '</optgroup>';
    }

    if (projectGroup.length > 0) {
      html += '<optgroup label="📁 本地工程记忆库 (Project Scope - 自动识别)">';
      projectGroup.forEach(p => {
        const isSel = p.id === currentVal ? 'selected' : '';
        const titleTip = p.workspacePath ? `源码工程: ${p.workspacePath}` : `物理目录: ${p.realPath}`;
        html += `<option value="${escapeHtml(p.id)}" title="${escapeHtml(titleTip)}" ${isSel}>${escapeHtml(p.name)}</option>`;
      });
      html += '</optgroup>';
    }

    sel.innerHTML = html;
    if (currentVal && sel.value !== currentVal) {
      sel.value = currentVal;
    }
  }

  function updateScopeBadge(scope, projId, meta) {
    const scopeBadge = document.getElementById('scope-badge');
    const scopeText = document.getElementById('scope-badge-text');
    const isGlobal = scope === 'global';

    if (scopeBadge && scopeText) {
      scopeBadge.className = isGlobal ? 'badge-scope global' : 'badge-scope project';
      scopeText.innerText = isGlobal ? '🌐 全局 Scope' : `📁 工程 Scope (${projId})`;
      scopeBadge.title = isGlobal
        ? '全局作用范围 (Global Scope)：开发者个人习惯与跨工程通用规约 (~/.qoder-cn/memory)'
        : `工程作用范围 (Project Scope)：当前工程专属规约与避坑经验 (${(meta && (meta.workspacePath || meta.realPath)) || ''})`;
    }

    const drawerScopeSub = document.getElementById('drawer-scope-sub');
    if (drawerScopeSub) {
      drawerScopeSub.innerText = isGlobal
        ? '作用范围：🌐 全局 (Global Scope)'
        : `作用范围：📁 当前工程 (${projId})`;
    }
  }

  async function connectServer() {
    const sBadge = document.getElementById('server-badge');
    const { api, state: stateCenter, utils, cards, topology } = window.QM;
    const state = stateCenter.state;

    const sStatus = await api.checkStatus();

    if (sStatus && sStatus.ok) {
      state.isServerMode = true;
      if (sBadge) sBadge.style.display = 'inline-flex';

      const projects = await api.getProjects();
      state.availableProjects = projects;

      const defaultProj = projects.find(p => p.id === 'fmmpay-busi') ? 'fmmpay-busi' : (projects[0] ? projects[0].id : 'global');
      populateProjectSelect(projects, defaultProj);
      await switchProject(defaultProj);
    } else {
      state.isServerMode = false;
      if (sBadge) sBadge.style.display = 'none';
      if (utils?.showToast) {
        utils.showToast('提示：当前为离线模式，双击 start.bat 可启动本地服务实现免软链接物理直读直写');
      }
      if (cards?.renderUI) cards.renderUI();
      if (topology?.fitGalaxyView) topology.fitGalaxyView();
    }
  }

  async function switchProject(projKey) {
    const { api, state: stateCenter, cards, topology, utils } = window.QM;
    const s = stateCenter.state;

    if (s.isServerMode) {
      try {
        const list = await api.getMemories(projKey);
        if (list !== null) {
          s.currentProject = projKey;
          const meta = s.availableProjects.find(p => p.id === projKey) || {};
          s.currentProjectScope = meta.scope || (projKey === 'global' ? 'global' : 'project');
          s.currentProjectRealPath = meta.realPath || '';
          s.currentProjectWorkspacePath = meta.workspacePath || '';
          s.currentDirName = meta.rawName || meta.name || projKey;
          s.memories = list;

          updateScopeBadge(s.currentProjectScope, projKey, meta);

          if (topology?.clearCelestialStore) {
            topology.clearCelestialStore();
          }
          if (stateCenter?.setDirty) {
            stateCenter.setDirty(false);
          }
          if (cards?.renderUI) {
            cards.renderUI();
          }
          if (topology?.fitGalaxyView) {
            topology.fitGalaxyView();
          }
          if (utils?.showToast) {
            utils.showToast(`已实时载入 ${s.currentProjectScope === 'global' ? '全局记忆库' : '工程记忆库'}：${projKey} (${s.memories.length} 篇切片)`);
          }
          return;
        }
      } catch (err) {
        console.error('切换项目异常:', err);
        if (utils?.showToast) {
          utils.showToast(`读取磁盘项目失败: ${err.message}`);
        }
      }
    }
  }

  async function saveAllToDisk() {
    const { api, state: stateCenter, utils } = window.QM;
    const s = stateCenter.state;

    if (!s.isEditMode) {
      if (utils?.showToast) {
        utils.showToast('当前处于只读模式。请先在顶部工具栏切换至「✏️ 编辑模式」后再同步落盘！');
      }
      return;
    }

    if (s.isServerMode) {
      try {
        const res = await api.saveMemories(s.currentProject, s.memories);
        if (res && res.ok) {
          if (stateCenter?.setDirty) {
            stateCenter.setDirty(false);
          }
          if (utils?.showToast) {
            utils.showToast(`已全部保存落盘至 ${s.currentProject}！真实 .md 与 MEMORY.md 索引已同步！`);
          }
          return;
        }
      } catch (err) {
        if (utils?.showToast) {
          utils.showToast(`落盘失败: ${err.message}`);
        }
        return;
      }
    } else {
      if (utils?.showToast) {
        utils.showToast('离线模式无法直接写入磁盘，请运行 start.bat 开启本地微服务！');
      }
    }
  }

  function bindUIEvents() {
    const { state: stateCenter, cards, topology, drawer, api, utils } = window.QM;

    // 1. 运行模式切换
    const btnAppMode = document.getElementById('btn-app-mode');
    if (btnAppMode) {
      btnAppMode.addEventListener('click', () => {
        stateCenter.setEditMode(!stateCenter.state.isEditMode);
        if (cards?.renderUI) cards.renderUI();
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

    // 2.1 动态特效与静止节能切换 (Header 按钮 + 下拉菜单双通道)
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

    // 3. 项目选择器与刷新/定位
    const selProject = document.getElementById('project-select');
    if (selProject) {
      selProject.addEventListener('change', e => switchProject(e.target.value));
    }

    const btnRescan = document.getElementById('btn-rescan-projects');
    if (btnRescan) {
      btnRescan.addEventListener('click', async () => {
        btnRescan.style.transform = 'rotate(180deg)';
        const projects = await api.rescanProjects();
        setTimeout(() => { btnRescan.style.transform = ''; }, 350);
        if (projects && projects.length > 0) {
          stateCenter.state.availableProjects = projects;
          populateProjectSelect(projects, stateCenter.state.currentProject);
          if (utils?.showToast) {
            utils.showToast(`已自动刷新探测：识别到 ${projects.length} 个本地 Qoder 知识库`);
          }
        }
      });
    }

    const btnOpenFolder = document.getElementById('btn-open-folder');
    if (btnOpenFolder) {
      btnOpenFolder.addEventListener('click', async () => {
        const s = stateCenter.state;
        try {
          const res = await api.openFolder(s.currentProject, 'memory');
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
    switchProject,
    saveAllToDisk
  };
})();

// 向下兼容旧调用
window.QM_APP = window.QM.app;

// 页面加载完成后启动应用
window.addEventListener('DOMContentLoaded', () => {
  window.QM.app.initApp();
});
