/**
 * Qoder Memory Visualizer - 全局状态管理中心 (SSOT Store)
 */
window.QM = window.QM || {};

window.QM.state = (function() {
  const state = {
    currentProject: 'fmmpay-busi',
    currentProjectScope: 'project',
    currentProjectRealPath: '',
    currentProjectWorkspacePath: '',
    currentDirName: 'fmmpay-busi',
    memories: [],
    availableProjects: [],
    isServerMode: false,
    isEditMode: false,
    isDirty: false,
    activeCategory: 'all',
    activeTag: null,
    searchQuery: '',
    sortBy: 'name',
    viewMode: 'galaxy'
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
    const toastFn = (window.QM && window.QM.utils && window.QM.utils.showToast) || (window.QM_CONSTANTS && window.QM_CONSTANTS.showToast);

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

  function parseMarkdownFile(text, filename, subDirCategory = null) {
    const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    let name = filename.replace(/\.md$/, '');
    let category = subDirCategory || '';
    let source = 'auto';
    let type = '';
    let description = '';
    let keywords = [];
    let chains = [];
    let body = text;

    if (fmMatch) {
      const fmText = fmMatch[1];
      body = fmMatch[2].trim();

      const nameMatch = fmText.match(/^(?:name|title):\s*["']?([^"'\r\n]+)["']?/m);
      if (nameMatch) name = nameMatch[1].trim();

      const catMatch = fmText.match(/category:\s*["']?([^"'\r\n]+)["']?/m);
      if (catMatch) category = catMatch[1].trim();

      const srcMatch = fmText.match(/source:\s*["']?([^"'\r\n]+)["']?/m);
      if (srcMatch) source = srcMatch[1].trim();

      const typeMatch = fmText.match(/type:\s*["']?([^"'\r\n]+)["']?/m);
      if (typeMatch) type = typeMatch[1].trim();

      const descMatch = fmText.match(/description:\s*["']?([^"'\r\n]+)["']?/m);
      if (descMatch) description = descMatch[1].trim();

      if (!description) {
        const scenarioMatch = fmText.match(/usage_scenario:\s*\r?\n((?:\s*-[^\r\n]+\r?\n?)+)/m);
        if (scenarioMatch) {
          const lines = scenarioMatch[1].split(/\r?\n/)
            .map(l => l.replace(/^\s*-\s*["']?/, '').replace(/["']?\s*$/, '').trim())
            .filter(Boolean);
          if (lines.length > 0) description = lines.join('; ');
        }
      }

      const kwMatch = fmText.match(/keywords:\s*\[(.*?)\]/m) || fmText.match(/keywords:\s*([^\r\n]+)/m);
      if (kwMatch) {
        keywords = kwMatch[1].split(/[,，]/).map(s => s.replace(/["']/g, '').trim()).filter(Boolean);
      }

      const chainMatch = fmText.match(/chains:\s*\[(.*?)\]/m);
      if (chainMatch) {
        chains = chainMatch[1].split(/[,，]/).map(s => s.replace(/["']/g, '').trim()).filter(Boolean);
      }
    }

    if (!category || category === 'common') {
      if (subDirCategory) {
        category = subDirCategory;
      } else if (type === 'feedback') {
        category = 'common_pitfalls_experience';
      } else if (type === 'user') {
        category = 'user_behavior';
      } else if (type === 'project') {
        category = 'project_architecture';
      } else if (type === 'reference') {
        category = 'development_code_specification';
      } else {
        category = 'common_pitfalls_experience';
      }
    }

    if (!['user', 'feedback', 'project', 'reference'].includes(type)) {
      if (category.startsWith('user_')) type = 'user';
      else if (category.includes('pitfalls') || category.includes('feedback')) type = 'feedback';
      else if (category.startsWith('project_') || category.includes('decision')) type = 'project';
      else type = 'reference';
    }

    return {
      id: filename.replace(/\.md$/, ''),
      filename,
      name,
      category,
      source,
      type,
      description,
      keywords,
      chains,
      body
    };
  }

  function serializeToMarkdown(item) {
    const kwStr = (item.keywords || []).map(k => `"${k.replace(/"/g, '\\"')}"`).join(', ');
    const chainStr = (item.chains || []).map(c => `"${c.replace(/"/g, '\\"')}"`).join(', ');
    return `---
name: "${(item.name || '').replace(/"/g, '\\"')}"
description: "${(item.description || '').replace(/"/g, '\\"')}"
metadata:
  type: ${item.type || 'feedback'}
  category: ${item.category || 'common'}
  source: ${item.source || 'auto'}
  keywords: [${kwStr}]
  chains: [${chainStr}]
---

${item.body || ''}
`;
  }

  function generateMemoryIndex(memories) {
    const lines = [];
    (memories || state.memories).forEach(m => {
      const desc = m.description ? ` — ${m.description}` : '';
      lines.push(`- [${m.name}](${m.filename})${desc}`);
    });
    return lines.join('\n') + '\n';
  }

  return {
    state,
    on,
    emit,
    setDirty,
    setEditMode,
    setViewMode,
    parseMarkdownFile,
    serializeToMarkdown,
    generateMemoryIndex
  };
})();

// 向下兼容旧调用
window.QM_STATE = window.QM.state;
