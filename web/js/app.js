/**
 * Qoder Memory Visualizer - 应用主入口与事件中枢 (Application Bootstrap)
 */
window.QM_APP = (function() {
  async function initApp() {
    // 1. 初始化 3D 引力星系引擎
    QM_GALAXY.init();

    // 2. 默认以只读安全模式启动
    QM_STATE.setEditMode(false);

    // 3. 绑定 UI 事件
    bindUIEvents();

    // 4. 连接 Node 本地服务
    await connectServer();
  }

  function populateProjectSelect(projects, currentVal) {
    const sel = document.getElementById('project-select');
    if (!sel || !projects) return;

    const globalGroup = projects.filter(p => p.scope === 'global');
    const projectGroup = projects.filter(p => p.scope !== 'global');

    let html = '';
    if (globalGroup.length > 0) {
      html += '<optgroup label="🌐 全局记忆库 (Global Scope)">';
      globalGroup.forEach(p => {
        const isSel = p.id === currentVal ? 'selected' : '';
        html += `<option value="${QM_CONSTANTS.escapeHtml(p.id)}" ${isSel}>${QM_CONSTANTS.escapeHtml(p.name)}</option>`;
      });
      html += '</optgroup>';
    }

    if (projectGroup.length > 0) {
      html += '<optgroup label="📁 本地工程记忆库 (Project Scope - 自动识别)">';
      projectGroup.forEach(p => {
        const isSel = p.id === currentVal ? 'selected' : '';
        const titleTip = p.workspacePath ? `源码工程: ${p.workspacePath}` : `物理目录: ${p.realPath}`;
        html += `<option value="${QM_CONSTANTS.escapeHtml(p.id)}" title="${QM_CONSTANTS.escapeHtml(titleTip)}" ${isSel}>${QM_CONSTANTS.escapeHtml(p.name)}</option>`;
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
    const sStatus = await QM_API.checkStatus();

    if (sStatus && sStatus.ok) {
      QM_STATE.state.isServerMode = true;
      if (sBadge) sBadge.style.display = 'inline-flex';

      const projects = await QM_API.getProjects();
      QM_STATE.state.availableProjects = projects;

      const defaultProj = projects.find(p => p.id === 'fmmpay-busi') ? 'fmmpay-busi' : (projects[0] ? projects[0].id : 'global');
      populateProjectSelect(projects, defaultProj);
      await switchProject(defaultProj);
    } else {
      QM_STATE.state.isServerMode = false;
      if (sBadge) sBadge.style.display = 'none';
      QM_CONSTANTS.showToast('提示：当前为离线模式，双击 start.bat 可启动本地服务实现免软链接物理直读直写');
      QM_CARDS.renderUI();
      QM_GALAXY.fitGalaxyView();
    }
  }

  async function switchProject(projKey) {
    const s = QM_STATE.state;
    if (s.isServerMode) {
      try {
        const list = await QM_API.getMemories(projKey);
        if (list !== null) {
          s.currentProject = projKey;
          const meta = s.availableProjects.find(p => p.id === projKey) || {};
          s.currentProjectScope = meta.scope || (projKey === 'global' ? 'global' : 'project');
          s.currentProjectRealPath = meta.realPath || '';
          s.currentProjectWorkspacePath = meta.workspacePath || '';
          s.currentDirName = meta.rawName || meta.name || projKey;
          s.memories = list;

          updateScopeBadge(s.currentProjectScope, projKey, meta);

          QM_GALAXY.clearCelestialStore();
          QM_STATE.setDirty(false);
          QM_CARDS.renderUI();
          QM_GALAXY.fitGalaxyView();
          QM_CONSTANTS.showToast(`已实时载入 ${s.currentProjectScope === 'global' ? '全局记忆库' : '工程记忆库'}：${projKey} (${s.memories.length} 篇切片)`);
          return;
        }
      } catch (err) {
        console.error('切换项目异常:', err);
        QM_CONSTANTS.showToast(`读取磁盘项目失败: ${err.message}`);
      }
    }
  }

  async function saveAllToDisk() {
    const s = QM_STATE.state;
    if (!s.isEditMode) {
      QM_CONSTANTS.showToast('当前处于只读模式。请先在顶部工具栏切换至「✏️ 编辑模式」后再同步落盘！');
      return;
    }

    if (s.isServerMode) {
      try {
        const res = await QM_API.saveMemories(s.currentProject, s.memories);
        if (res && res.ok) {
          QM_STATE.setDirty(false);
          QM_CONSTANTS.showToast(`已全部保存落盘至 ${s.currentProject}！真实 .md 与 MEMORY.md 索引已同步！`);
          return;
        }
      } catch (err) {
        QM_CONSTANTS.showToast(`落盘失败: ${err.message}`);
        return;
      }
    } else {
      QM_CONSTANTS.showToast('离线模式无法直接写入磁盘，请运行 start.bat 开启本地微服务！');
    }
  }

  function bindUIEvents() {
    // 1. 运行模式切换
    const btnAppMode = document.getElementById('btn-app-mode');
    if (btnAppMode) {
      btnAppMode.addEventListener('click', () => {
        QM_STATE.setEditMode(!QM_STATE.state.isEditMode);
        QM_CARDS.renderUI();
      });
    }

    // 2. 视图切换
    const btnModeGalaxy = document.getElementById('btn-mode-galaxy');
    const btnModeCards = document.getElementById('btn-mode-cards');
    if (btnModeGalaxy) btnModeGalaxy.addEventListener('click', () => {
      QM_STATE.setViewMode('galaxy');
      QM_GALAXY.resizeCanvas();
    });
    if (btnModeCards) btnModeCards.addEventListener('click', () => QM_STATE.setViewMode('cards'));

    // 3. 项目选择器与刷新/定位
    const selProject = document.getElementById('project-select');
    if (selProject) {
      selProject.addEventListener('change', e => switchProject(e.target.value));
    }

    const btnRescan = document.getElementById('btn-rescan-projects');
    if (btnRescan) {
      btnRescan.addEventListener('click', async () => {
        btnRescan.style.transform = 'rotate(180deg)';
        const projects = await QM_API.rescanProjects();
        setTimeout(() => { btnRescan.style.transform = ''; }, 350);
        if (projects && projects.length > 0) {
          QM_STATE.state.availableProjects = projects;
          populateProjectSelect(projects, QM_STATE.state.currentProject);
          QM_CONSTANTS.showToast(`已自动刷新探测：识别到 ${projects.length} 个本地 Qoder 知识库`);
        }
      });
    }

    const btnOpenFolder = document.getElementById('btn-open-folder');
    if (btnOpenFolder) {
      btnOpenFolder.addEventListener('click', async () => {
        const s = QM_STATE.state;
        try {
          const res = await QM_API.openFolder(s.currentProject, 'memory');
          if (res && res.ok) {
            QM_CONSTANTS.showToast(`已在系统资源管理器打开目录：${res.opened}`);
          }
        } catch (err) {
          QM_CONSTANTS.showToast(`打开目录失败: ${err.message}`);
        }
      });
    }

    // 4. 搜索框
    const searchBox = document.getElementById('search-box');
    if (searchBox) {
      searchBox.addEventListener('input', e => {
        QM_STATE.state.searchQuery = e.target.value.trim();
        QM_CARDS.renderUI();
      });
    }

    // 5. 排序选择
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', e => {
        QM_STATE.state.sortBy = e.target.value;
        QM_CARDS.renderUI();
      });
    }

    // 6. 新建与保存
    const newCardBtn = document.getElementById('new-card-btn');
    if (newCardBtn) newCardBtn.addEventListener('click', () => QM_DRAWER.openNewCardDrawer());

    const saveAllBtn = document.getElementById('save-all-btn');
    if (saveAllBtn) saveAllBtn.addEventListener('click', () => saveAllToDisk());

    // 7. 抽屉内部控制
    const closeDrawerBtn = document.getElementById('close-drawer');
    const cancelDrawerBtn = document.getElementById('drawer-cancel-btn');
    const saveDrawerBtn = document.getElementById('drawer-save-btn');
    if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', () => {
      QM_DRAWER.closeDrawer();
      if (window.QM_GALAXY && typeof window.QM_GALAXY.deselectFocus === 'function') {
        window.QM_GALAXY.deselectFocus();
      }
    });
    if (cancelDrawerBtn) cancelDrawerBtn.addEventListener('click', () => {
      QM_DRAWER.closeDrawer();
      if (window.QM_GALAXY && typeof window.QM_GALAXY.deselectFocus === 'function') {
        window.QM_GALAXY.deselectFocus();
      }
    });
    if (saveDrawerBtn) saveDrawerBtn.addEventListener('click', () => QM_DRAWER.saveCurrentDrawer());

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
        if (preview) preview.value = QM_STATE.generateMemoryIndex();
        indexModal.classList.remove('hidden');
      });
    }

    // 快捷键支持
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveAllToDisk();
      } else if (e.key === 'Escape') {
        QM_DRAWER.closeDrawer();
        if (indexModal) indexModal.classList.add('hidden');
        if (window.QM_GALAXY && typeof window.QM_GALAXY.deselectFocus === 'function') {
          window.QM_GALAXY.deselectFocus();
        }
      }
    });
  }

  return {
    initApp,
    switchProject,
    saveAllToDisk
  };
})();

// 页面加载完成后启动应用
window.addEventListener('DOMContentLoaded', () => {
  QM_APP.initApp();
});
