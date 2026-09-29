/**
 * Qoder Memory Visualizer - 全局状态管理中心 (SSOT Store)
 */
window.QM = window.QM || {};

window.QM.state = (function() {
  const state = {
    edition: 'cn',
    account: null,
    track: 'ide',
    officialCategory: 'all',
    availableEditions: [],
    availableAccounts: [],
    groupCounts: { spec: 0, project: 0, experience: 0, task: 0 },
    currentProject: 'fmmpay-dev',
    currentProjectScope: 'project',
    currentProjectRealPath: '',
    currentProjectWorkspacePath: '',
    currentDirName: '宏观全宇宙',
    memories: [],
    galaxies: [],
    activeGalaxyId: null,
    selectedPlanet: null,
    planetSpacingMap: {},
    availableProjects: [],
    isServerMode: false,
    isEditMode: false,
    isDirty: false,
    activeCategory: 'all',
    activeTag: null,
    searchQuery: '',
    sortBy: 'name',
    viewMode: 'galaxy',
    enableEffects: localStorage.getItem('qm_enable_effects') !== 'false'
  };

  const listeners = new Map();

  function on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
    return () => listeners.get(event).delete(callback);
  }

  function emit(event, payload) {
    if (listeners.has(event)) {
      listeners.get(event).forEach(cb => {
        try {
          cb(payload, state);
        } catch(e) {
          console.error(`[State Listener Error: ${event}]`, e);
        }
      });
    }
  }

  function setDirty(val) {
    state.isDirty = !!val;
    const dot = document.getElementById('dirty-dot');
    if (dot) dot.classList.toggle('dirty', state.isDirty);
    const saveBtn = document.getElementById('save-all-btn');
    if (saveBtn) saveBtn.classList.toggle('dirty', state.isDirty);
    emit('dirty-changed', state.isDirty);
  }

  function setEditMode(toEdit) {
    state.isEditMode = !!toEdit;
    const btnAppMode = document.getElementById('btn-app-mode');
    const hudModePill = document.getElementById('hud-mode-pill');
    const legendTip = document.querySelector('.legend-tip');
    const toastFn = window.QM?.utils?.showToast;

    if (btnAppMode) {
      btnAppMode.classList.toggle('is-edit', state.isEditMode);
      btnAppMode.innerHTML = state.isEditMode ? '<span>✏️ 编辑模式</span>' : '<span>🔒 只读模式</span>';
      btnAppMode.title = state.isEditMode ? '当前处于编辑模式 · 点击切换回只读模式' : '当前处于只读保护状态 · 点击切换至编辑模式';
    }

    if (state.isEditMode) {
      document.body.classList.remove('is-readonly');
      document.body.classList.add('is-edit-mode');
      if (hudModePill) {
        hudModePill.innerText = "✏️ 编辑模式";
        hudModePill.className = "hud-mode-pill edit";
      }
      if (legendTip) {
        legendTip.innerHTML = "💡 [编辑模式] 拖拽天体可重塑引力轨道并牵引关联 · 点击卡片可修改内容 · 允许新建/删除与落盘";
      }
      if (toastFn) toastFn("已切换至【编辑模式】：已解锁记忆内容编辑与落盘同步");
    } else {
      document.body.classList.remove('is-edit-mode');
      document.body.classList.add('is-readonly');
      if (hudModePill) {
        hudModePill.innerText = "🔒 只读模式";
        hudModePill.className = "hud-mode-pill";
      }
      if (legendTip) {
        legendTip.innerHTML = "💡 [只读模式] 恒星之外的所有天体均可自由拖拽探索 · 知识卡片处于只读保护状态";
      }
      if (toastFn) toastFn("已切换至【只读模式】：知识库内容已锁定保护");
    }

    emit('mode-changed', state.isEditMode);
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    document.body.classList.toggle('view-cards', mode === 'cards');

    const btnGalaxy = document.getElementById('btn-mode-galaxy');
    const btnCards = document.getElementById('btn-mode-cards');
    const galBox = document.getElementById('galaxy-container');
    const cardBox = document.getElementById('cards-container');

    if (btnGalaxy) btnGalaxy.classList.toggle('active', mode === 'galaxy');
    if (btnCards) btnCards.classList.toggle('active', mode === 'cards');
    if (galBox) galBox.classList.toggle('hidden', mode !== 'galaxy');
    if (cardBox) cardBox.classList.toggle('hidden', mode !== 'cards');

    emit('view-changed', mode);
  }

  function setEffectsMode(toEnable, silent = false) {
    state.enableEffects = !!toEnable;
    localStorage.setItem('qm_enable_effects', state.enableEffects ? 'true' : 'false');

    const btnEffects = document.getElementById('btn-effects-toggle');
    const iconEl = document.getElementById('effects-icon');
    const menuToggle = document.getElementById('menu-toggle-effects');
    const toastFn = window.QM?.utils?.showToast;

    if (btnEffects) {
      btnEffects.classList.toggle('active', state.enableEffects);
      btnEffects.classList.toggle('eco', !state.enableEffects);
      btnEffects.title = state.enableEffects 
        ? "动态渲染特效：开启 60fps 轨道物理 / 点击切换至静止节能模式" 
        : "静止节能模式：已停止连续渲染 (0% 连续开销) / 点击开启动态特效";
    }
    if (iconEl) {
      iconEl.innerText = state.enableEffects ? "✨" : "🍃";
    }
    if (menuToggle) {
      menuToggle.innerText = state.enableEffects ? "✨ 动态特效：开启" : "🍃 静态节能：开启";
    }

    if (!silent && toastFn) {
      toastFn(state.enableEffects 
        ? "✨ 已开启动态引力星空 (60fps 物理公转)" 
        : "🍃 已切换至静止节能模式 (0% 连续重绘，按需响应)");
    }

    emit('effects-changed', state.enableEffects);
  }

  function generateMemoryIndex(memories) {
    const lines = [];
    (memories || state.memories).forEach(m => {
      const desc = m.description ? ` — ${m.description}` : '';
      lines.push(`- [${m.name}](${m.filename})${desc}`);
    });
    return lines.join('\n') + '\n';
  }

  function setEdition(ed) {
    state.edition = ed;
    emit('edition-changed', ed);
  }

  function setAccount(acc) {
    state.account = acc;
    emit('account-changed', acc);
  }

  function setTrack(trk) {
    state.track = trk;
    emit('track-changed', trk);
  }

  function setOfficialCategory(cat) {
    state.officialCategory = cat || 'all';
    emit('official-category-changed', state.officialCategory);
  }

  function setGroupCounts(counts) {
    state.groupCounts = counts || { spec: 0, project: 0, experience: 0, task: 0 };
    emit('group-counts-changed', state.groupCounts);
  }

  function setSelectedPlanet(planetNode) {
    state.selectedPlanet = planetNode;
    emit('selected-planet-changed', planetNode);
  }

  function setPlanetSpacing(planetId, scale) {
    if (!planetId) return;
    const clampedScale = Math.max(0.4, Math.min(3.0, parseFloat(scale) || 1.0));
    state.planetSpacingMap[planetId] = clampedScale;
    emit('planet-spacing-changed', { planetId, scale: clampedScale });
  }

  function getPlanetSpacing(planetId) {
    if (!planetId) return 1.0;
    return state.planetSpacingMap[planetId] || 1.0;
  }

  function setGalaxies(galaxies) {
    state.galaxies = galaxies || [];
    emit('galaxies-changed', state.galaxies);
  }

  return {
    state,
    on,
    emit,
    setDirty,
    setEditMode,
    setViewMode,
    setEffectsMode,
    setEdition,
    setAccount,
    setTrack,
    setOfficialCategory,
    setGroupCounts,
    setSelectedPlanet,
    setPlanetSpacing,
    getPlanetSpacing,
    setGalaxies,
    generateMemoryIndex
  };
})();

// 向下兼容旧调用
window.QM_STATE = window.QM.state;
