/**
 * Qoder Memory Visualizer - 抽屉编辑控制器与 CRUD 交互 (Drawer Module)
 * 职责：核心内容优先展示、规约元数据按需折叠、Markdown 优雅预览、物理删除闭环
 */
window.QM = window.QM || {};

window.QM.drawer = (function() {
  const drawerEl = () => document.getElementById('editor-drawer');
  let currentActiveItemId = null;
  let isEventsBound = false;

  function setDrawerInputsDisabled(disabled) {
    const fieldIds = [
      'edit-name', 'edit-filename', 'edit-type', 'edit-category-select', 'edit-category-custom',
      'edit-source', 'edit-chain-target', 'edit-description', 'edit-keywords', 'edit-body'
    ];
    fieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });
  }

  function setMetaSectionCollapsed(collapsed) {
    const metaSec = document.getElementById('drawer-meta-section');
    const arrowEl = document.getElementById('meta-toggle-arrow');
    if (!metaSec) return;

    if (collapsed) {
      metaSec.classList.add('is-collapsed');
      if (arrowEl) arrowEl.innerText = '▸ 点击展开';
    } else {
      metaSec.classList.remove('is-collapsed');
      if (arrowEl) arrowEl.innerText = '▾ 收起配置';
    }
  }

  function updateMetaSummary(item) {
    const pill = document.getElementById('meta-summary-pill');
    if (!pill) return;
    const cat = item.category || 'common';
    const type = item.type || 'project';
    const kwCount = (item.keywords || []).length;
    pill.innerText = `${cat} · ${type}${kwCount > 0 ? ` · 🏷️ ${kwCount}` : ''}`;
    pill.title = `分类: ${cat} | 类型: ${type} | 关键词: ${kwCount} 个`;
  }

  function bindDrawerStaticEvents() {
    if (isEventsBound) return;
    isEventsBound = true;

    // 1. 折叠卡片点击展开/收起
    const metaToggle = document.getElementById('drawer-meta-toggle');
    if (metaToggle) {
      metaToggle.addEventListener('click', () => {
        const metaSec = document.getElementById('drawer-meta-section');
        if (metaSec) {
          const isCurrentlyCollapsed = metaSec.classList.contains('is-collapsed');
          setMetaSectionCollapsed(!isCurrentlyCollapsed);
        }
      });
    }

    // 2. 一键复制正文 Markdown
    const btnCopy = document.getElementById('btn-copy-drawer-content');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const bodyInput = document.getElementById('edit-body');
        const text = (bodyInput && bodyInput.value) || '';
        if (!text.trim()) {
          window.QM.utils?.showToast('正文内容为空');
          return;
        }
        navigator.clipboard.writeText(text).then(() => {
          window.QM.utils?.showToast('📋 已成功复制正文 Markdown 到剪贴板！');
        }).catch(() => {
          window.QM.utils?.showToast('复制失败，请手动选择复制');
        });
      });
    }

    // 3. 抽屉内删除按钮
    const btnDelete = document.getElementById('drawer-delete-btn');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        if (currentActiveItemId) {
          deleteCard(currentActiveItemId);
        }
      });
    }
  }

  function openDrawer(id) {
    bindDrawerStaticEvents();
    const { memories, isEditMode, currentProject, currentProjectScope } = window.QM.state.state;
    const item = memories.find(m => m.id === id);
    if (!item) return;

    currentActiveItemId = id;
    const drawer = drawerEl();
    const titleEl = document.getElementById('drawer-title');
    const scopeSubEl = document.getElementById('drawer-scope-sub');
    const noticeEl = document.getElementById('drawer-readonly-notice');
    const saveBtn = document.getElementById('drawer-save-btn');
    const cancelBtn = document.getElementById('drawer-cancel-btn');
    const deleteBtn = document.getElementById('drawer-delete-btn');

    if (scopeSubEl) {
      scopeSubEl.innerText = currentProjectScope === 'global'
        ? '作用范围：🌐 全局 (Global Scope)'
        : `作用范围：📁 当前工程 (${currentProject})`;
    }

    // 控制删除按钮：具体记忆切片展示删除按钮，支持安全维护
    if (deleteBtn) {
      deleteBtn.style.display = 'inline-flex';
      deleteBtn.innerText = '🗑️ 删除此记忆';
    }

    if (isEditMode) {
      if (titleEl) titleEl.innerText = "编辑记忆卡片";
      if (noticeEl) noticeEl.style.display = 'none';
      if (saveBtn) saveBtn.style.display = 'inline-block';
      if (cancelBtn) cancelBtn.innerText = "取消";
      if (drawer) drawer.classList.remove('is-readonly');
      setDrawerInputsDisabled(false);
    } else {
      if (titleEl) titleEl.innerText = "查阅记忆切片";
      if (noticeEl) noticeEl.style.display = 'flex';
      if (saveBtn) saveBtn.style.display = 'none';
      if (cancelBtn) cancelBtn.innerText = "关闭";
      if (drawer) drawer.classList.add('is-readonly');
      setDrawerInputsDisabled(true);
    }

    // 填充核心字段
    document.getElementById('edit-id').value = item.id;
    document.getElementById('edit-name').value = item.name || '';
    document.getElementById('edit-description').value = item.description || '';
    document.getElementById('edit-body').value = item.body || '';

    // Markdown 预览渲染
    const previewEl = document.getElementById('drawer-body-preview');
    if (previewEl) {
      const renderFn = window.QM.utils?.renderMarkdown || (t => t);
      previewEl.innerHTML = renderFn(item.body || '*(暂无正文内容)*');
    }

    // 填充高级配置折叠区字段
    document.getElementById('edit-filename').value = item.filename || '';

    const typeSelect = document.getElementById('edit-type');
    if (typeSelect) typeSelect.value = item.type || 'project';

    const catSelect = document.getElementById('edit-category-select');
    const customInput = document.getElementById('edit-category-custom');
    if (catSelect && customInput) {
      if (Array.from(catSelect.options).some(o => o.value === item.category)) {
        catSelect.value = item.category;
        customInput.style.display = 'none';
      } else {
        catSelect.value = 'custom';
        customInput.style.display = 'block';
        customInput.value = item.category || '';
      }
    }

    document.getElementById('edit-source').value = item.source || 'auto';
    document.getElementById('edit-keywords').value = (item.keywords || []).join(', ');

    const chainSelect = document.getElementById('edit-chain-target');
    if (chainSelect) {
      chainSelect.innerHTML = '<option value="">-- 选择要建立链式关联的目标记忆 --</option>';
      memories.forEach(other => {
        if (other.id !== item.id) {
          const isChained = (item.chains || []).includes(other.id);
          chainSelect.add(new Option((isChained ? '✅ 已链向：' : '🔗 链向：') + other.name, other.id, false, isChained));
        }
      });
    }

    // 更新折叠摘要并默认折叠元数据，突出核心内容
    updateMetaSummary(item);
    setMetaSectionCollapsed(true);

    if (drawer) drawer.classList.add('open');
  }

  function closeDrawer() {
    currentActiveItemId = null;
    const drawer = drawerEl();
    if (drawer) drawer.classList.remove('open');
  }

  function openDomainDrawer(node) {
    bindDrawerStaticEvents();
    currentActiveItemId = null;
    const { memories } = window.QM.state.state;
    const cat = node.categoryKey;
    const catMemories = memories.filter(m => m.category === cat);
    const drawer = drawerEl();
    const titleEl = document.getElementById('drawer-title');
    const noticeEl = document.getElementById('drawer-readonly-notice');
    const saveBtn = document.getElementById('drawer-save-btn');
    const cancelBtn = document.getElementById('drawer-cancel-btn');
    const deleteBtn = document.getElementById('drawer-delete-btn');

    if (deleteBtn) deleteBtn.style.display = 'none';

    if (titleEl) titleEl.innerText = `主题认知域 [${node.name}]`;
    if (noticeEl) {
      noticeEl.style.display = 'flex';
      noticeEl.innerHTML = `<span>📂 <strong>主题认知域查阅</strong>：当前展示该认知域基本信息及其下属 ${catMemories.length} 篇知识切片。</span>`;
    }
    if (saveBtn) saveBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.innerText = "关闭";
    if (drawer) drawer.classList.add('is-readonly');
    setDrawerInputsDisabled(true);

    document.getElementById('edit-id').value = node.id;
    document.getElementById('edit-name').value = `主题认知域: ${node.name}`;
    document.getElementById('edit-filename').value = `${cat}/ (认知域目录)`;

    const catSelect = document.getElementById('edit-category-select');
    const customInput = document.getElementById('edit-category-custom');
    if (catSelect && customInput) {
      if (Array.from(catSelect.options).some(o => o.value === cat)) {
        catSelect.value = cat;
        customInput.style.display = 'none';
      } else {
        catSelect.value = 'custom';
        customInput.style.display = 'block';
        customInput.value = cat;
      }
    }

    document.getElementById('edit-source').value = 'domain';
    document.getElementById('edit-description').value = `本认知域汇聚 ${catMemories.length} 篇核心知识切片，构成此方向的标准引力约束场。`;

    const allKeywords = Array.from(new Set(catMemories.flatMap(m => m.keywords || [])));
    document.getElementById('edit-keywords').value = allKeywords.join(', ');

    const chainSelect = document.getElementById('edit-chain-target');
    if (chainSelect) {
      chainSelect.innerHTML = `<option value="">-- 当前认知域包含 ${catMemories.length} 篇记忆 --</option>`;
      catMemories.forEach(m => chainSelect.add(new Option('📄 ' + m.name, m.id)));
    }

    const bodyText = `# 主题认知域：${node.name} (${cat})

- **汇聚记忆切片**：共 ${catMemories.length} 篇
- **高频语义关键词**：${allKeywords.join('、') || '暂无'}

## 包含的切片列表
${catMemories.map((m, i) => `${i + 1}. **${m.name}** (\`${m.filename}\`)\n   - 场景: ${m.description || '无指定场景'}`).join('\n') || '暂无切片'}
`;
    document.getElementById('edit-body').value = bodyText;

    const previewEl = document.getElementById('drawer-body-preview');
    if (previewEl) {
      const renderFn = window.QM.utils?.renderMarkdown || (t => t);
      previewEl.innerHTML = renderFn(bodyText);
    }

    updateMetaSummary({ category: cat, type: 'domain', keywords: allKeywords });
    setMetaSectionCollapsed(true);

    if (drawer) drawer.classList.add('open');
  }

  function openCoreDrawer(node) {
    bindDrawerStaticEvents();
    currentActiveItemId = null;
    const { memories, currentDirName, currentProject } = window.QM.state.state;
    const drawer = drawerEl();
    const titleEl = document.getElementById('drawer-title');
    const noticeEl = document.getElementById('drawer-readonly-notice');
    const saveBtn = document.getElementById('drawer-save-btn');
    const cancelBtn = document.getElementById('drawer-cancel-btn');
    const deleteBtn = document.getElementById('drawer-delete-btn');

    if (deleteBtn) deleteBtn.style.display = 'none';

    if (titleEl) titleEl.innerText = `项目意图枢纽 [${node.name}]`;
    if (noticeEl) {
      noticeEl.style.display = 'flex';
      noticeEl.innerHTML = `<span>🌟 <strong>全局意图枢纽</strong>：当前项目的核心语义源，承载全域认知引力中心。</span>`;
    }
    if (saveBtn) saveBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.innerText = "关闭";
    if (drawer) drawer.classList.add('is-readonly');
    setDrawerInputsDisabled(true);

    const categoriesFound = new Set(memories.map(m => m.category).filter(Boolean));
    const allKeywords = Array.from(new Set(memories.flatMap(m => m.keywords || [])));

    document.getElementById('edit-id').value = "core-root";
    document.getElementById('edit-name').value = `全局意图枢纽: ${currentDirName}`;
    document.getElementById('edit-filename').value = "MEMORY.md (根意图索引)";

    const catSelect = document.getElementById('edit-category-select');
    const customInput = document.getElementById('edit-category-custom');
    if (catSelect && customInput) {
      catSelect.value = 'project_introduction';
      customInput.style.display = 'none';
    }

    document.getElementById('edit-source').value = 'core';
    document.getElementById('edit-description').value = `项目名称: ${currentProject}，当前累计 ${memories.length} 篇记忆切片，分布于 ${categoriesFound.size} 个主题认知域中。`;
    document.getElementById('edit-keywords').value = allKeywords.slice(0, 15).join(', ');

    const chainSelect = document.getElementById('edit-chain-target');
    if (chainSelect) {
      chainSelect.innerHTML = `<option value="">-- 全项目共 ${memories.length} 篇知识切片 --</option>`;
    }

    const bodyText = `# 项目认知枢纽：${currentDirName}

- **项目标识**：\`${currentProject}\`
- **记忆库规模**：共 ${memories.length} 篇记忆切片
- **认知域覆盖**：共 ${categoriesFound.size} 个一级分类
- **总高频标签**：共 ${allKeywords.length} 个语义关键词

## 认知引力体系
此节点为整座认知星系的中心恒星，所有主题认知域行星及记忆切片卫星均受其意图引力牵引。`;
    document.getElementById('edit-body').value = bodyText;

    const previewEl = document.getElementById('drawer-body-preview');
    if (previewEl) {
      const renderFn = window.QM.utils?.renderMarkdown || (t => t);
      previewEl.innerHTML = renderFn(bodyText);
    }

    updateMetaSummary({ category: 'core', type: 'anchor', keywords: allKeywords });
    setMetaSectionCollapsed(true);

    if (drawer) drawer.classList.add('open');
  }

  function openNewCardDrawer() {
    bindDrawerStaticEvents();
    currentActiveItemId = null;
    const { isEditMode, memories, currentProject, currentProjectScope } = window.QM.state.state;
    if (!isEditMode) {
      window.QM.utils?.showToast('当前处于只读模式。请先在顶部工具栏切换至「✏️ 编辑模式」后再新建记忆！');
      return;
    }

    const drawer = drawerEl();
    const titleEl = document.getElementById('drawer-title');
    const noticeEl = document.getElementById('drawer-readonly-notice');
    const saveBtn = document.getElementById('drawer-save-btn');
    const cancelBtn = document.getElementById('drawer-cancel-btn');
    const deleteBtn = document.getElementById('drawer-delete-btn');

    if (deleteBtn) deleteBtn.style.display = 'none';

    if (titleEl) titleEl.innerText = "新建记忆卡片";
    if (noticeEl) noticeEl.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'inline-block';
    if (cancelBtn) cancelBtn.innerText = "取消";
    if (drawer) drawer.classList.remove('is-readonly');
    setDrawerInputsDisabled(false);

    const isGlobal = currentProjectScope === 'global';
    const scopeSubEl = document.getElementById('drawer-scope-sub');
    if (scopeSubEl) {
      scopeSubEl.innerText = isGlobal
        ? '作用范围：🌐 全局 (Global Scope)'
        : `作用范围：📁 当前工程 (${currentProject})`;
    }

    document.getElementById('edit-id').value = "";
    document.getElementById('edit-name').value = "";
    document.getElementById('edit-filename').value = "";
    const typeSelect = document.getElementById('edit-type');
    if (typeSelect) typeSelect.value = isGlobal ? 'user' : 'project';
    document.getElementById('edit-category-select').value = isGlobal ? "user_behavior" : "common_pitfalls_experience";
    document.getElementById('edit-category-custom').style.display = 'none';
    document.getElementById('edit-source').value = "manual";
    document.getElementById('edit-description').value = "";
    document.getElementById('edit-keywords').value = "";
    document.getElementById('edit-body').value = "";

    const previewEl = document.getElementById('drawer-body-preview');
    if (previewEl) previewEl.innerHTML = '';

    const chainSelect = document.getElementById('edit-chain-target');
    if (chainSelect) {
      chainSelect.innerHTML = '<option value="">-- 选择要建立链式关联的目标记忆 --</option>';
      memories.forEach(other => {
        chainSelect.add(new Option('🔗 链向：' + other.name, other.id));
      });
    }

    updateMetaSummary({ category: isGlobal ? "user_behavior" : "common_pitfalls_experience", type: isGlobal ? 'user' : 'project', keywords: [] });
    // 新建卡片时允许展开配置以便设定文件名或分类
    setMetaSectionCollapsed(false);

    if (drawer) drawer.classList.add('open');
    document.getElementById('edit-name').focus();
  }

  function saveCurrentDrawer() {
    const state = window.QM.state.state;
    if (!state.isEditMode) {
      window.QM.utils?.showToast('当前处于只读模式，无法保存修改！');
      return;
    }

    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('edit-name').value.trim();
    if (!name) return window.QM.utils?.showToast ? window.QM.utils.showToast('请输入记忆标题') : alert('请输入记忆标题');

    let filename = document.getElementById('edit-filename').value.trim();
    if (!filename) {
      filename = name.toLowerCase().replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '-').replace(/-+/g, '-') + '.md';
    }
    if (!filename.endsWith('.md')) filename += '.md';

    const typeEl = document.getElementById('edit-type');
    const type = (typeEl && typeEl.value) || 'project';

    let category = document.getElementById('edit-category-select').value;
    if (category === 'custom') {
      category = document.getElementById('edit-category-custom').value.trim() || 'common';
    }

    const source = document.getElementById('edit-source').value;
    const description = document.getElementById('edit-description').value.trim();
    const keywordsRaw = document.getElementById('edit-keywords').value;
    const keywords = keywordsRaw.split(/[,，]/).map(k => k.trim()).filter(Boolean);
    const body = document.getElementById('edit-body').value.trim();
    const selectedChain = document.getElementById('edit-chain-target').value;

    if (id) {
      const item = state.memories.find(m => m.id === id);
      if (item) {
        item.name = name;
        item.filename = filename;
        item.type = type;
        item.category = category;
        item.source = source;
        item.description = description;
        item.keywords = keywords;
        item.body = body;
        if (selectedChain && !(item.chains || []).includes(selectedChain)) {
          item.chains = item.chains || [];
          item.chains.push(selectedChain);
        }
      }
      window.QM.utils?.showToast('记忆切片已成功更新');
    } else {
      const newId = 'mem-' + Date.now();
      state.memories.unshift({
        id: newId,
        name,
        filename,
        type,
        category,
        source,
        description,
        keywords,
        chains: selectedChain ? [selectedChain] : [],
        body
      });
      window.QM.utils?.showToast('记忆切片已成功创建！');
    }

    closeDrawer();
    window.QM.state.setDirty(true);
    window.QM.cards?.renderUI();
  }

  async function deleteCard(id) {
    const { isServerMode, currentProject, memories } = window.QM.state.state;
    const item = memories.find(m => m.id === id);
    if (!item) return;

    const confirmed = confirm(`⚠️ 危险维护操作确认：\n\n确定彻底删除记忆切片 "${item.name}" 吗？\n文件：${item.filename}\n\n此操作将从物理磁盘中彻底删除该 Markdown 文件并自动更新 MEMORY.md 索引，不可撤回！`);
    if (!confirmed) return;

    if (isServerMode && window.QM.api) {
      try {
        await window.QM.api.deleteMemory(currentProject, id, item.filename);
        window.QM.state.state.memories = memories.filter(m => m.id !== id);
        window.QM.state.setDirty(false);
        closeDrawer();

        // 若当前天体常驻卡片正在展示该项，隐藏之
        if (window.QM.topology?.hideCelestialCard) {
          window.QM.topology.hideCelestialCard();
        }

        window.QM.cards?.renderUI();
        window.QM.utils?.showToast(`🗑️ 已从磁盘彻底删除 ${item.filename} 并刷新索引！`);
        return;
      } catch (err) {
        console.error('[Delete] 服务端删除失败:', err.message);
        window.QM.utils?.showToast(`删除失败: ${err.message}`);
        return;
      }
    }

    // 离线模式降级处理
    window.QM.state.state.memories = memories.filter(m => m.id !== id);
    window.QM.state.setDirty(true);
    closeDrawer();
    if (window.QM.topology?.hideCelestialCard) {
      window.QM.topology.hideCelestialCard();
    }
    window.QM.cards?.renderUI();
    window.QM.utils?.showToast(`已删除记忆条目 (离线态)`);
  }

  return {
    openDrawer,
    openDomainDrawer,
    openCoreDrawer,
    closeDrawer,
    openNewCardDrawer,
    saveCurrentDrawer,
    deleteCard
  };
})();

// 向下兼容旧调用
window.QM_DRAWER = window.QM.drawer;
