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
    currentProject: 'all',
    currentProjectScope: 'all',
    currentProjectRealPath: '',
    currentProjectWorkspacePath: '',
    currentDirName: '宏观全宇宙',
    memories: [],
    galaxies: [],
    activeGalaxyId: null,
    selectedPlanet: null,
    planetSpacingMap: (() => {
      try {
        return JSON.parse(localStorage.getItem('qm_planet_spacing_map') || '{}') || {};
      } catch {
        return {};
      }
    })(),
    availableProjects: [],
    isServerMode: false,
    appMode: localStorage.getItem('qm_app_mode') || 'default',
    get isEditMode() { return this.appMode === 'pro'; },
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
    const saveBtn = document.getElementById('save-all-btn');
    if (saveBtn) saveBtn.classList.toggle('dirty', state.isDirty);
    emit('dirty-changed', state.isDirty);
  }

  function setAppMode(mode) {
    const targetMode = (mode === 'pro') ? 'pro' : 'default';
    state.appMode = targetMode;
    localStorage.setItem('qm_app_mode', targetMode);

    // 默认模式下强制锁定并切换至 IDE 官方记忆轨道
    if (targetMode === 'default') {
      state.track = 'ide';
      window.QM.utils?.syncNavDropdown?.('track-dd', 'ide');
    }

    // 同步顶部模式悬浮下拉的当前值展示
    window.QM.utils?.syncNavDropdown?.('mode-dd', targetMode);

    const hudModePill = document.getElementById('hud-mode-pill');
    const legendTip = document.querySelector('.legend-tip');

    if (targetMode === 'pro') {
      document.body.classList.remove('mode-default', 'is-readonly');
      document.body.classList.add('mode-pro', 'is-edit-mode');
      if (hudModePill) {
        hudModePill.innerText = "⚡ 专业模式";
        hudModePill.className = "hud-mode-pill pro edit";
      }
      if (legendTip) {
        legendTip.innerHTML = "💡 [专业模式] 拖拽天体可重塑引力轨道 · 点击卡片修改与保存 · 开启全量能力与星系穿梭";
      }
    } else {
      document.body.classList.remove('mode-pro', 'is-edit-mode');
      document.body.classList.add('mode-default', 'is-readonly');
      if (hudModePill) {
        hudModePill.innerText = "🏷️ 默认模式";
        hudModePill.className = "hud-mode-pill default";
      }
      if (legendTip) {
        legendTip.innerHTML = "💡 [默认模式] 仅展示官方记忆规约 · 滚轮以鼠标为中心缩放 · 点击卡片查阅与维护";
      }
    }

    emit('app-mode-changed', targetMode);
    emit('mode-changed', targetMode === 'pro');
  }

  function setEditMode(toEdit) {
    setAppMode(toEdit ? 'pro' : 'default');
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    document.body.classList.toggle('view-cards', mode === 'cards');

    // 同步顶部视图开关按钮的高亮状态
    const switchBtns = document.querySelectorAll('#view-toggle-switch .view-switch-btn');
    switchBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === mode);
    });

    const galBox = document.getElementById('galaxy-container');
    const cardBox = document.getElementById('cards-container');

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
    try {
      localStorage.setItem('qm_planet_spacing_map', JSON.stringify(state.planetSpacingMap));
    } catch {
      // 容错处理
    }
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
    setAppMode,
    setEditMode,
    setViewMode,
    setEffectsMode,
    setEdition,
    setAccount,
    setTrack,
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
