/**
 * Qoder Memory Visualizer - 应用主入口与事件中枢 (Application Bootstrap)
 * 职责：系统初始化、全局事件总线协调、项目切换与磁盘落盘同步
 */
window.QM = window.QM || {};

window.QM.app = (function() {
  function getTopology() { return window.QM?.topology || window.QM_GALAXY; }
  function getStateCenter() { return window.QM?.state || window.QM_STATE; }
  function getState() { return getStateCenter().state; }
  function getCards() { return window.QM?.cards || window.QM_CARDS; }
  function getDrawer() { return window.QM?.drawer || window.QM_DRAWER; }
  function getApi() { return window.QM?.api || window.QM_API; }
  function getUtils() { return window.QM?.utils || window.QM_CONSTANTS; }
  function getConstants() { return window.QM?.constants || window.QM_CONSTANTS; }

  async function initApp() {
    // 1. 初始化 3D 引力拓扑引擎
    const topology = getTopology();
    if (topology && typeof topology.init === 'function') {
      topology.init();
    }

    // 2. 默认以只读安全模式启动
    const stateCenter = getStateCenter();
    if (stateCenter && typeof stateCenter.setEditMode === 'function') {
      stateCenter.setEditMode(false);
    }

    // 3. 绑定 UI 事件
    bindUIEvents();

    // 4. 连接 Node 本地服务
    await connectServer();
  }

  function populateProjectSelect(projects, currentVal) {
    const sel = document.getElementById('project-select');
    if (!sel || !projects) return;

    const utils = getUtils();
    const escapeHtml = utils.escapeHtml || (s => s);

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
    const api = getApi();
    const state = getState();
    const utils = getUtils();
    const cards = getCards();
    const topology = getTopology();

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
      if (utils && utils.showToast) {
        utils.showToast('提示：当前为离线模式，双击 start.bat 可启动本地服务实现免软链接物理直读直写');
      }
      if (cards && typeof cards.renderUI === 'function') cards.renderUI();
      if (topology && typeof topology.fitGalaxyView === 'function') topology.fitGalaxyView();
    }
  }

  async function switchProject(projKey) {
    const s = getState();
    const api = getApi();
    const stateCenter = getStateCenter();
    const cards = getCards();
    const topology = getTopology();
    const utils = getUtils();

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

          if (topology && typeof topology.clearCelestialStore === 'function') {
            topology.clearCelestialStore();
          }
          if (stateCenter && typeof stateCenter.setDirty === 'function') {
            stateCenter.setDirty(false);
          }
          if (cards && typeof cards.renderUI === 'function') {
            cards.renderUI();
          }
          if (topology && typeof topology.fitGalaxyView === 'function') {
            topology.fitGalaxyView();
          }
          if (utils && utils.showToast) {
            utils.showToast(`已实时载入 ${s.currentProjectScope === 'global' ? '全局记忆库' : '工程记忆库'}：${projKey} (${s.memories.length} 篇切片)`);
          }
          return;
        }
      } catch (err) {
        console.error('切换项目异常:', err);
        if (utils && utils.showToast) {
          utils.showToast(`读取磁盘项目失败: ${err.message}`);
        }
      }
    }
  }

  async function saveAllToDisk() {
    const s = getState();
    const stateCenter = getStateCenter();
    const api = getApi();
    const utils = getUtils();

    if (!s.isEditMode) {
      if (utils && utils.showToast) {
        utils.showToast('当前处于只读模式。请先在顶部工具栏切换至「✏️ 编辑模式」后再同步落盘！');
      }
      return;
    }

    if (s.isServerMode) {
      try {
        const res = await api.saveMemories(s.currentProject, s.memories);
        if (res && res.ok) {
          if (stateCenter && typeof stateCenter.setDirty === 'function') {
            stateCenter.setDirty(false);
          }
          if (utils && utils.showToast) {
            utils.showToast(`已全部保存落盘至 ${s.currentProject}！真实 .md 与 MEMORY.md 索引已同步！`);
          }
          return;
        }
      } catch (err) {
        if (utils && utils.showToast) {
          utils.showToast(`落盘失败: ${err.message}`);
        }
        return;
      }
    } else {
      if (utils && utils.showToast) {
        utils.showToast('离线模式无法直接写入磁盘，请运行 start.bat 开启本地微服务！');
      }
    }
  }

  function bindUIEvents() {
    const stateCenter = getStateCenter();
    const cards = getCards();
    const topology = getTopology();
    const drawer = getDrawer();
    const api = getApi();
    const utils = getUtils();

    // 1. 运行模式切换
    const btnAppMode = document.getElementById('btn-app-mode');
    if (btnAppMode) {
      btnAppMode.addEventListener('click', () => {
        stateCenter.setEditMode(!stateCenter.state.isEditMode);
        if (cards && typeof cards.renderUI === 'function') cards.renderUI();
      });
    }

    // 2. 视图切换
    const btnModeGalaxy = document.getElementById('btn-mode-galaxy');
    const btnModeCards = document.getElementById('btn-mode-cards');
    if (btnModeGalaxy) {
      btnModeGalaxy.addEventListener('click', () => {
        stateCenter.setViewMode('galaxy');
        if (topology && typeof topology.resizeCanvas === 'function') topology.resizeCanvas();
      });
    }
    if (btnModeCards) {
      btnModeCards.addEventListener('click', () => stateCenter.setViewMode('cards'));
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
          if (utils && utils.showToast) {
            utils.showToast(`已自动刷新探测：识别到 ${projects.length} 个本地 Qoder 知识库`);
          }
        }
      });
    }

    const btnOpenFolder = document.getElementById('btn-open-folder');
    if (btnOpenFolder) {
      btnOpenFolder.addEventListener('click', async () => {
        const s = getState();
        try {
          const res = await api.openFolder(s.currentProject, 'memory');
          if (res && res.ok && utils && utils.showToast) {
            utils.showToast(`已在系统资源管理器打开目录：${res.opened}`);
          }
        } catch (err) {
          if (utils && utils.showToast) {
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
        if (cards && typeof cards.renderUI === 'function') cards.renderUI();
      });
    }

    // 5. 排序选择
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', e => {
        stateCenter.state.sortBy = e.target.value;
        if (cards && typeof cards.renderUI === 'function') cards.renderUI();
      });
    }

    // 6. 新建与保存
    const newCardBtn = document.getElementById('new-card-btn');
    if (newCardBtn) {
      newCardBtn.addEventListener('click', () => {
        if (drawer && typeof drawer.openNewCardDrawer === 'function') drawer.openNewCardDrawer();
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
        if (drawer) drawer.closeDrawer();
        if (topology && typeof topology.deselectFocus === 'function') topology.deselectFocus();
      });
    }
    if (cancelDrawerBtn) {
      cancelDrawerBtn.addEventListener('click', () => {
        if (drawer) drawer.closeDrawer();
        if (topology && typeof topology.deselectFocus === 'function') topology.deselectFocus();
      });
    }
    if (saveDrawerBtn) {
      saveDrawerBtn.addEventListener('click', () => {
        if (drawer && typeof drawer.saveCurrentDrawer === 'function') drawer.saveCurrentDrawer();
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
        if (preview && stateCenter && typeof stateCenter.generateMemoryIndex === 'function') {
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
        if (drawer) drawer.closeDrawer();
        if (indexModal) indexModal.classList.add('hidden');
        if (topology && typeof topology.deselectFocus === 'function') topology.deselectFocus();
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
