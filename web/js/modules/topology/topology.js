/**
 * Qoder Memory Visualizer - 3D 宏观宇宙引力拓扑主引擎 (Macro Universe Topology Engine)
 * 职责：宏观全宇宙多星系统排布、直观规模呈现、天文观测级天体协调、摄像机穿梭运镜与右下角卫星间距调节
 */
window.QM = window.QM || {};

window.QM.topology = (function() {
  const SYSTEM_TILT_X = 0.44;     // 主俯仰倾角 (立体纵深感)
  const CAMERA_DISTANCE = 1100;    // 投影焦距

  let canvas, ctx, container;
  let nodes = [];
  let edges = [];
  const nodeMap = new Map();
  const universeGalaxies = [];     // 宏观宇宙所有星系元数据
  let hoveredNode = null;
  let draggedNode = null;
  let dragStartMouse = { x: 0, y: 0 };
  let grabOffsetX = 0;             // 抓取点相对天体球心的X偏移量
  let grabOffsetY = 0;             // 抓取点相对天体球心的Y偏移量
  const dragSnapshotMap = new Map();

  let focusTarget = null;
  const focusRelatedIds = new Set();
  let animationTime = 0;

  // 摄像机镜头平滑运镜中枢 (Camera Director)
  let cameraTargetNode = null;
  let cameraTargetPos = null;      // 支持坐标点直达运镜
  let cameraTargetScale = 1.0;
  let isAutoCameraActive = false;
  let initialScale = 0.85;

  function getDomainCameraScale(cardCount = 10) {
    return cardCount > 25 ? 0.95 : (cardCount > 12 ? 1.05 : 1.15);
  }

  const celestialStore = new Map();
  const transform = { x: 0, y: 0, scale: 0.85 };
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let clickOrigin = { x: 0, y: 0 };
  let isWheelInteracting = false;
  let wheelDebounceTimer = null;
  let hasDomainExpanding = false;

  // 空间背景微尘系统
  const cognitiveSpaceDust = [];
  for (let i = 0; i < 60; i++) {
    cognitiveSpaceDust.push({
      x: (Math.random() - 0.5) * 5200,
      y: (Math.random() - 0.5) * 4000,
      size: 0.6 + Math.random() * 1.5,
      baseAlpha: 0.12 + Math.random() * 0.35,
      twinkleSpeed: 0.015 + Math.random() * 0.03,
      twinklePhase: Math.random() * Math.PI * 2
    });
  }

  /**
   * 计算机体世界坐标视口可视范围包围盒 (Viewport Frustum Culling)
   */
  function getViewportBounds(padding = 100) {
    if (!container) return null;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const s = transform.scale || 1.0;
    return {
      minX: -transform.x / s - padding,
      maxX: (w - transform.x) / s + padding,
      minY: -transform.y / s - padding,
      maxY: (h - transform.y) / s + padding,
      w,
      h,
      scale: s
    };
  }

  /**
   * 引擎初始化与全局事件挂载
   */
  function init() {
    canvas = document.getElementById('galaxy-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    container = document.getElementById('galaxy-container');

    window.addEventListener('resize', () => {
      resizeCanvas();
      requestRender();
    });
    resizeCanvas();
    bindEvents();
    bindSpacingControllerEvents();

    window.QM.state.on('effects-changed', (enabled) => {
      if (enabled) {
        startGalaxyLoop();
      } else {
        stopGalaxyLoop();
      }
    });

    window.QM.state.on('view-changed', (mode) => {
      if (mode === 'galaxy') {
        if (window.QM.state.state.enableEffects) {
          startGalaxyLoop();
        } else {
          requestRender();
        }
      } else {
        stopGalaxyLoop();
      }
    });

    window.QM.state.on('official-category-changed', (groupKey) => {
      if (groupKey === 'all') {
        deselectFocus();
      } else {
        const { OFFICIAL_CATEGORIES } = window.QM.constants;
        const grp = OFFICIAL_CATEGORIES[groupKey];
        if (grp) {
          focusTarget = null;
          focusRelatedIds.clear();
          const targetDomains = nodes.filter(n => n.type === 'domain' && grp.subs.includes(n.categoryKey));
          targetDomains.forEach(d => {
            focusRelatedIds.add(d.id);
            nodes.filter(u => u.type === 'unit' && u.parentId === d.id).forEach(u => focusRelatedIds.add(u.id));
            if (d.parentStarId) focusRelatedIds.add(d.parentStarId);
          });

          const hudText = document.getElementById('hud-text');
          if (hudText) hudText.innerText = `${grp.icon} 聚焦官方大类：【${grp.name}】 · 匹配 ${targetDomains.length} 个主题星体`;
          requestRender();
        }
      }
    });

    // 监听行星卫星间距变化
    window.QM.state.on('planet-spacing-changed', ({ planetId, scale }) => {
      const pNode = nodeMap.get(planetId);
      if (pNode) {
        pNode.satelliteSpacingScale = scale;
        if (!pNode.expansionProgress || pNode.expansionProgress < 1.0) {
          pNode.expansionProgress = 1.0;
        }
        simulateCelestialSystem(true);
        drawGalaxy();
      }
    });

    if (window.QM.state.state.enableEffects) {
      startGalaxyLoop();
    } else {
      requestRender();
    }
  }

  function resizeCanvas() {
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    if (ctx) ctx.scale(dpr, dpr);
    if (!transform.x && !transform.y) {
      transform.x = w / 2;
      transform.y = h / 2;
    }
  }

  /**
   * 宏观全宇宙视界自适应：计算全宇宙所有星系天体的外包围盒并自动居中全景缩放
   */
  function fitGalaxyView() {
    if (!container || !nodes.length) return;
    const w = container.clientWidth || 1200;
    const h = container.clientHeight || 800;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    nodes.forEach(n => {
      if (n.type === 'core') {
        const span = n.radius * 3.5;
        minX = Math.min(minX, n.x - span);
        maxX = Math.max(maxX, n.x + span);
        minY = Math.min(minY, n.y - span);
        maxY = Math.max(maxY, n.y + span);
      } else if (n.type === 'domain' && n.celestial) {
        const star = nodeMap.get(n.parentStarId) || { x: 0, y: 0 };
        const dX = (n.celestial.semiMajor || 200) + 120;
        const dY = (n.celestial.semiMinor || 180) * Math.cos(SYSTEM_TILT_X) + 120;
        minX = Math.min(minX, star.x - dX);
        maxX = Math.max(maxX, star.x + dX);
        minY = Math.min(minY, star.y - dY);
        maxY = Math.max(maxY, star.y + dY);
      }
    });

    if (minX === Infinity) {
      minX = -600; maxX = 600;
      minY = -400; maxY = 400;
    }

    const paddingX = 140;
    const paddingY = 120;
    const totalW = (maxX - minX) + paddingX * 2;
    const totalH = (maxY - minY) + paddingY * 2;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const scaleX = w / totalW;
    const scaleY = h / totalH;
    const idealScale = Math.min(scaleX, scaleY) * 0.94;

    const targetScale = Math.max(0.18, Math.min(0.95, idealScale));
    initialScale = targetScale;

    cameraTargetNode = null;
    cameraTargetPos = { x: centerX, y: centerY };
    cameraTargetScale = targetScale;
    isAutoCameraActive = true;
    startGalaxyLoop();
    requestRender();
  }

  /**
   * 运镜飞跃聚焦至指定星系
   */
  function focusOnGalaxy(galaxyId) {
    if (!galaxyId || galaxyId === 'all') {
      fitGalaxyView();
      return;
    }
    const starNode = nodeMap.get(`star-${galaxyId}`);
    if (starNode) {
      focusTarget = starNode;
      updateFocusRelatedSet();
      cameraTargetNode = starNode;
      cameraTargetPos = null;
      cameraTargetScale = 0.78;
      isAutoCameraActive = true;
      hasDomainExpanding = true;
      startGalaxyLoop();
      showCelestialCard(starNode);
      requestRender();
    }
  }

  /**
   * 构建宏观全宇宙多星系拓扑网络 (Macro Universe Multi-Galaxy Graph)
   * 需求 3 核心：不再做割裂的单工程页面切换，在同一视界中通过不同星系直观呈现全宇宙与各星系规模！
   */
  function buildGalaxyGraph() {
    nodes = [];
    edges = [];
    nodeMap.clear();
    universeGalaxies.length = 0;

    const state = window.QM.state.state;
    const { CATEGORY_MAP } = window.QM.constants;
    const star = window.QM.star;
    const planet = window.QM.planet;
    const satellite = window.QM.satellite;

    // 1. 获取所有星系列表
    let galaxyList = (state.galaxies && state.galaxies.length > 0) ? state.galaxies.slice() : [];

    // 离线单库兜底兼容
    if (galaxyList.length === 0) {
      galaxyList = [{
        id: state.currentProject || 'default',
        name: state.currentDirName || '意图核心',
        rawName: state.currentDirName || '意图核心',
        count: (state.memories && state.memories.length) || 0,
        scope: state.currentProjectScope || 'project',
        memories: state.memories || []
      }];
    }

    // 按规模（记忆切片数）降序排列，确保最大规模的星系作为宇宙主星系
    galaxyList.sort((a, b) => (b.count || (b.memories ? b.memories.length : 0)) - (a.count || (a.memories ? a.memories.length : 0)));

    // 2. 宏观宇宙星系深空螺旋星团布局算法 (Cosmic Natural Constellation Layout)
    const numGalaxies = galaxyList.length;
    const galaxyPositions = [];

    if (numGalaxies === 1) {
      galaxyPositions.push({ cx: 0, cy: 0 });
    } else {
      galaxyList.forEach((g, idx) => {
        if (idx === 0) {
          // 主星系（规模最大）置于视野核心偏左黄金点
          galaxyPositions.push({ cx: -120, cy: 0 });
        } else {
          // 斐波那契黄金螺旋分布，星系间保留充分的深空安全走廊
          const angle = idx * 2.39996; // 黄金角 ~137.5度
          const baseStep = 1050;
          const dist = baseStep + Math.sqrt(idx) * 780 + (g.count > 15 ? 260 : 0);
          const cx = Math.cos(angle) * dist - 120;
          const cy = Math.sin(angle) * dist * 0.75; // 银河盘面立体纵深轻微扁平
          galaxyPositions.push({ cx, cy });
        }
      });
    }

    // 星系颜色调色板 (赋予各工程独特的宏观深空星系主题光彩)
    const GALAXY_COLORS = [
      { name: '蔚蓝之境', aura: 'rgba(56, 189, 248, 0.18)', ring: '#38bdf8' },
      { name: '翡翠星团', aura: 'rgba(52, 211, 153, 0.18)', ring: '#34d399' },
      { name: '琥珀日曜', aura: 'rgba(251, 191, 36, 0.18)', ring: '#fbbf24' },
      { name: '紫晶星云', aura: 'rgba(192, 132, 252, 0.18)', ring: '#c084fc' },
      { name: '赤凰跃迁', aura: 'rgba(251, 113, 133, 0.18)', ring: '#fb7185' },
      { name: '极光碧海', aura: 'rgba(45, 212, 191, 0.18)', ring: '#2dd4bf' }
    ];

    const tierCapacities = [6, 12, 18, 24, 30, 36, 42];

    // 3. 逐星系构建恒星、主题认知域行星与记忆切片卫星
    galaxyList.forEach((g, gIdx) => {
      const pos = galaxyPositions[gIdx] || { cx: 0, cy: 0 };
      const gColor = GALAXY_COLORS[gIdx % GALAXY_COLORS.length];
      const gMemories = g.memories || [];
      const totalCards = gMemories.length;

      // 3.1 创建星系核心恒星节点
      const starNode = star.createStarNode(g, pos.cx, pos.cy);
      nodes.push(starNode);
      nodeMap.set(starNode.id, starNode);

      // 3.2 收集该星系的主题分类
      const categoriesFound = new Set();
      const catCountMap = new Map();
      gMemories.forEach(m => {
        if (m.category) {
          categoriesFound.add(m.category);
          catCountMap.set(m.category, (catCountMap.get(m.category) || 0) + 1);
        }
      });

      const catList = Array.from(categoriesFound);
      const numDomains = catList.length;
      const domainNodeMap = new Map();

      // 根据星系规模自适应行星轨道开普勒跨度
      const R_MIN = totalCards > 30 ? 240 : (totalCards > 10 ? 200 : 160);
      const domainTiers = numDomains > 10 ? 4 : (numDomains > 5 ? 3 : (numDomains > 2 ? 2 : 1));
      const domainSpread = Math.min(180, Math.log2(Math.max(1, numDomains)) * 50);
      const cardSpread = Math.min(150, Math.sqrt(Math.max(0, totalCards)) * 12);
      const R_MAX = Math.min(720, Math.max(R_MIN + 180, R_MIN + domainSpread * 1.2 + cardSpread * 1.2));
      const tierBandWidth = (R_MAX - R_MIN) / Math.max(domainTiers, 1);

      // 记录星系引力场边界半径 (用于宏观宇宙星云渲染)
      const galaxyRadius = R_MAX + 110;
      universeGalaxies.push({
        id: g.id,
        name: g.name,
        rawName: g.rawName || g.name,
        count: totalCards,
        cx: pos.cx,
        cy: pos.cy,
        radius: galaxyRadius,
        starNode,
        colorTheme: gColor
      });

      const tierBuckets = Array.from({ length: domainTiers }, () => []);
      catList.forEach((cat, idx) => {
        const dTier = idx % domainTiers;
        tierBuckets[dTier].push({ cat, idx });
      });

      tierBuckets.forEach((bucket, dTier) => {
        const tierCount = bucket.length;
        bucket.forEach(({ cat, idx }, idxInTier) => {
          const catCfg = CATEGORY_MAP[cat] || { name: cat, color: "#64748b", border: "#475569", core: "#94a3b8" };
          const cardCount = catCountMap.get(cat) || 0;
          const isStrongAffinity = (cat === 'project_introduction' || cat === 'project_tech_stack' || (cardCount / Math.max(totalCards, 1)) >= 0.22);

          const storeKey = `domain-${g.id}-${cat}`;
          let pStore = celestialStore.get(storeKey);
          if (!pStore) {
            pStore = planet.initPlanetCelestial(cat, idxInTier, tierCount, isStrongAffinity, dTier, domainTiers, tierBandWidth, R_MIN);
            celestialStore.set(storeKey, pStore);
          }

          const domainNode = planet.createPlanetNode(cat, catCfg, cardCount, pStore, g.id);
          domainNode.parentStarId = starNode.id;
          // 读取用户自定义的卫星间距配置
          domainNode.satelliteSpacingScale = window.QM.state.getPlanetSpacing(domainNode.id) || 1.0;

          nodes.push(domainNode);
          nodeMap.set(domainNode.id, domainNode);
          domainNodeMap.set(cat, domainNode);

          edges.push({
            from: starNode.id,
            to: domainNode.id,
            type: "hierarchy",
            isChain: false
          });
        });
      });

      // 3.3 构建该星系内的记忆切片卫星
      const domainUnitsMap = new Map();
      gMemories.forEach(m => {
        const cat = m.category || 'other';
        if (!domainUnitsMap.has(cat)) domainUnitsMap.set(cat, []);
        domainUnitsMap.get(cat).push(m);
      });

      domainUnitsMap.forEach((mList, cat) => {
        const parentDomain = domainNodeMap.get(cat) || starNode;
        const parentOmega = parentDomain.celestial ? parentDomain.celestial.omega : 0.0006;
        const unitCount = mList.length;

        mList.forEach((m, mIdx) => {
          let mStore = celestialStore.get(m.id);
          if (!mStore) {
            mStore = satellite.initSatelliteCelestial(m, mIdx, unitCount, parentOmega, tierCapacities);
            celestialStore.set(m.id, mStore);
          }

          const unitNode = satellite.createSatelliteNode(m, parentDomain, mStore);
          nodes.push(unitNode);
          nodeMap.set(unitNode.id, unitNode);

          edges.push({
            from: parentDomain.id,
            to: unitNode.id,
            type: "belongs_to",
            isChain: false
          });
        });
      });

      // 3.4 构建该星系内部的显式链式关系
      gMemories.forEach(m => {
        const targetIds = new Set(m.chains || []);
        const wikiMatches = (m.body || '').matchAll(/\[\[([^\]]+)\]\]/g);
        for (const wm of wikiMatches) targetIds.add(wm[1].trim().replace(/\.md$/, ''));

        const mdLinkMatches = (m.body || '').matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g);
        for (const mlm of mdLinkMatches) targetIds.add(mlm[2].trim().replace(/\.md$/, ''));

        targetIds.forEach(tId => {
          const targetItem = gMemories.find(item => 
            item.id === tId || 
            item.id === `${g.id}__${tId}` || 
            item.filename === (tId + '.md') || 
            item.filename === tId
          );
          if (targetItem && targetItem.id !== m.id) {
            edges.push({
              from: m.id,
              to: targetItem.id,
              type: "chain",
              isChain: true
            });
          }
        });
      });
    });

    // 4. 构建全宇宙跨/同星系关键词关联网络 (设置合理上限，防止 N^2 暴涨)
    const kwInvertedIndex = new Map();
    nodes.filter(n => n.type === 'unit' && n.rawItem).forEach(n => {
      const m = n.rawItem;
      (m.keywords || []).forEach(k => {
        if (!k || k.length < 2) return;
        if (!kwInvertedIndex.has(k)) kwInvertedIndex.set(k, []);
        kwInvertedIndex.get(k).push(m.id);
      });
    });

    const candidatePairs = new Map();
    kwInvertedIndex.forEach(idList => {
      if (idList.length > 1 && idList.length <= 25) {
        for (let i = 0; i < idList.length; i++) {
          for (let j = i + 1; j < idList.length; j++) {
            const pairKey = idList[i] < idList[j] ? `${idList[i]}___${idList[j]}` : `${idList[j]}___${idList[i]}`;
            candidatePairs.set(pairKey, (candidatePairs.get(pairKey) || 0) + 1);
          }
        }
      }
    });

    const validPairs = [];
    candidatePairs.forEach((count, key) => {
      if (count >= 2) {
        const [from, to] = key.split('___');
        validPairs.push({ from, to, count });
      }
    });
    validPairs.sort((a, b) => b.count - a.count);
    validPairs.slice(0, 150).forEach(p => {
      edges.push({
        from: p.from,
        to: p.to,
        type: "shared_keywords",
        isChain: false
      });
    });

    // 5. 天体度中心度计算与尺寸微调
    const degreeMap = new Map();
    edges.forEach(e => {
      degreeMap.set(e.from, (degreeMap.get(e.from) || 0) + 1);
      degreeMap.set(e.to, (degreeMap.get(e.to) || 0) + 1);
    });

    nodes.forEach(n => {
      const deg = degreeMap.get(n.id) || 0;
      n.degree = deg;
      if (n.type === 'domain') {
        n.radius = Math.round(24 + Math.min(10, Math.sqrt(deg) * 2.5));
        n.screenRadius = n.radius;
      } else if (n.type === 'unit') {
        n.radius = Math.round(11 + Math.min(6, Math.sqrt(deg) * 1.5));
        n.screenRadius = n.radius;
      }
    });

    updateFocusRelatedSet();
    simulateCelestialSystem(true);
    requestRender();
  }

  /**
   * 焦点关联网络更新
   */
  function updateFocusRelatedSet() {
    focusRelatedIds.clear();
    const hudText = document.getElementById('hud-text');
    const hudIndicator = document.getElementById('hud-indicator');

    if (!focusTarget) {
      if (hudText) hudText.innerText = "🌌 宏观全宇宙引力网络就绪 · 俯瞰多星系拓扑";
      if (hudIndicator) {
        hudIndicator.style.background = "#10b981";
        hudIndicator.style.boxShadow = "0 0 8px #10b981";
      }
      return;
    }

    focusRelatedIds.add(focusTarget.id);
    edges.forEach(e => {
      if (e.from === focusTarget.id) focusRelatedIds.add(e.to);
      if (e.to === focusTarget.id) focusRelatedIds.add(e.from);
    });

    if (focusTarget.type === 'core') {
      nodes.forEach(n => {
        if (n.type === 'domain' && n.parentStarId === focusTarget.id) focusRelatedIds.add(n.id);
      });
      if (hudText) hudText.innerText = `🌟 聚焦【${focusTarget.name}】星系恒星 · 激活星系拓扑`;
    } else if (focusTarget.type === 'domain') {
      if (focusTarget.parentStarId) focusRelatedIds.add(focusTarget.parentStarId);
      nodes.forEach(n => {
        if (n.parentId === focusTarget.id) focusRelatedIds.add(n.id);
      });
      if (hudText) hudText.innerText = `🪐 聚焦主题认知行星：【${focusTarget.name}】 · 可调节右下角卫星间距`;
    } else {
      if (focusTarget.parentId) focusRelatedIds.add(focusTarget.parentId);
      if (hudText) hudText.innerText = `💡 聚焦记忆节点：${focusTarget.name} · 激活脉冲引力`;
    }

    if (hudIndicator) {
      hudIndicator.style.background = "#38bdf8";
      hudIndicator.style.boxShadow = "0 0 10px #38bdf8";
    }
  }

  function isNodeDimmed(node) {
    if (!node) return false;
    if (hoveredNode && hoveredNode.id === node.id) return false;

    const { activeTag, searchQuery, activeCategory, memories } = window.QM.state.state;

    // 1. 标签过滤模式
    if (activeTag) {
      let isTagHit = false;
      if (node.type === 'unit') {
        isTagHit = node.rawItem ? (node.rawItem.keywords || []).includes(activeTag) : false;
      } else if (node.type === 'domain') {
        isTagHit = memories.some(m => m.category === node.categoryKey && (m.keywords || []).includes(activeTag));
      } else if (node.type === 'core') {
        isTagHit = true;
      }
      return !isTagHit;
    }

    // 2. 搜索 / 分类过滤模式
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = (node.name || '').toLowerCase().includes(q);
      const matchBody = node.rawItem ? (node.rawItem.body || '').toLowerCase().includes(q) : false;
      const matchDesc = node.rawItem ? (node.rawItem.description || '').toLowerCase().includes(q) : false;
      const matchKw = node.rawItem ? (node.rawItem.keywords || []).some(k => k.toLowerCase().includes(q)) : false;
      if (!(matchName || matchBody || matchDesc || matchKw)) return true;
    }

    // 3. 画布天体选中聚焦状态
    if (focusTarget) {
      if (node.id === focusTarget.id) return false;
      if (focusTarget.type === 'domain') {
        if (node.type === 'unit' && node.parentId === focusTarget.id) return false;
        if (node.id === focusTarget.parentStarId) return false;
        return true;
      } else if (focusTarget.type === 'unit') {
        if (node.id === focusTarget.parentId) return false;
        if (focusRelatedIds.has(node.id)) return false;
        return true;
      } else if (focusTarget.type === 'core') {
        if (node.type === 'domain' && node.parentStarId === focusTarget.id) return false;
        return true;
      }
    }

    // 4. 分类过滤模式
    if (activeCategory && activeCategory !== 'all') {
      if (node.type === 'core') return false;
      if (node.type === 'domain' && node.categoryKey !== activeCategory) return true;
      if (node.type === 'unit' && node.rawItem && node.rawItem.category !== activeCategory) return true;
    }

    // 5. 官方四大分类体系过滤 (spec / project / experience / task)
    const { officialCategory } = window.QM.state.state;
    if (officialCategory && officialCategory !== 'all') {
      const { OFFICIAL_CATEGORIES } = window.QM.constants || {};
      const targetGroup = OFFICIAL_CATEGORIES?.[officialCategory];
      const allowedSubs = targetGroup ? new Set(targetGroup.subs || []) : null;

      if (node.type === 'core') return false;
      if (node.type === 'domain') {
        const isMatched = allowedSubs ? allowedSubs.has(node.categoryKey) : false;
        if (!isMatched) return true;
      } else if (node.type === 'unit' && node.rawItem) {
        const cat = node.rawItem.category;
        const isMatched = allowedSubs ? allowedSubs.has(cat) : false;
        if (!isMatched) return true;
      }
    }

    return false;
  }

  /**
   * 全宇宙天体系统动力学每帧模拟 (统一驱动所有星系的恒星、行星与受间距调节的卫星)
   */
  function simulateCelestialSystem(forceFull = false) {
    const { enableEffects } = window.QM.state.state;
    if (enableEffects) {
      animationTime += 1;
    }

    const star = window.QM.star;
    const planet = window.QM.planet;
    const satellite = window.QM.satellite;

    // 模拟所有恒星
    nodes.filter(n => n.type === 'core').forEach(c => {
      star?.simulateStar(c, enableEffects);
    });

    let activeDomainId = null;
    const selPlanet = window.QM.state?.state?.selectedPlanet;
    if (focusTarget) {
      if (focusTarget.type === 'domain') activeDomainId = focusTarget.id;
      else if (focusTarget.type === 'unit' && focusTarget.parentId) activeDomainId = focusTarget.parentId;
    } else if (selPlanet) {
      activeDomainId = selPlanet.id;
    }

    hasDomainExpanding = false;
    nodes.forEach(n => {
      if (n.type !== 'domain') return;
      const targetExp = (n.id === activeDomainId) ? 1.0 : 0.0;
      if (Math.abs(targetExp - (n.expansionProgress || 0)) > 0.005) {
        hasDomainExpanding = true;
      }
    });

    const hasUnpositionedNodes = nodes.some(n => n.type !== 'core' && n.screenX === 0 && n.screenY === 0);
    const shouldSimulateDynamics = forceFull || hasUnpositionedNodes || enableEffects || Boolean(draggedNode) || hasDomainExpanding;

    if (shouldSimulateDynamics) {
      nodes.forEach(n => {
        if (n.type !== 'domain') return;
        const isBeingDragged = draggedNode && (draggedNode === n || (draggedNode.type === 'domain' && n.parentId === draggedNode.id));
        const parentStar = nodeMap.get(n.parentStarId);
        // 读取当前行星最新的卫星间距倍率
        n.satelliteSpacingScale = window.QM.state.getPlanetSpacing(n.id) || n.satelliteSpacingScale || 1.0;
        planet.simulatePlanet(n, isBeingDragged, activeDomainId, SYSTEM_TILT_X, CAMERA_DISTANCE, enableEffects, parentStar);
      });

      nodes.forEach(n => {
        if (n.type !== 'unit') return;
        const isBeingDragged = draggedNode && (draggedNode === n || (draggedNode.type === 'domain' && n.parentId === draggedNode.id));
        const parentDomain = nodeMap.get(n.parentId);
        satellite.simulateSatellite(n, parentDomain, isBeingDragged, SYSTEM_TILT_X, CAMERA_DISTANCE, enableEffects);
      });
    }

    // 摄像机镜头平滑运镜中枢 (支持节点对齐与坐标点平滑飞跃)
    if (isAutoCameraActive && container) {
      const panLerp = 0.12;
      const drawerEl = document.getElementById('editor-drawer');
      const isDrawerOpen = drawerEl && drawerEl.classList.contains('open');
      const drawerW = isDrawerOpen ? (drawerEl.offsetWidth || 560) : 0;
      const effectiveW = Math.max(container.clientWidth - drawerW, 300);
      const targetCenterX = effectiveW / 2;
      const targetCenterY = container.clientHeight / 2;

      let targetX = 0, targetY = 0;
      if (cameraTargetNode) {
        targetX = cameraTargetNode.screenX;
        targetY = cameraTargetNode.screenY;
      } else if (cameraTargetPos) {
        targetX = cameraTargetPos.x;
        targetY = cameraTargetPos.y;
      }

      transform.scale += (cameraTargetScale - transform.scale) * panLerp;
      const desiredTransformX = targetCenterX - targetX * transform.scale;
      const desiredTransformY = targetCenterY - targetY * transform.scale;

      transform.x += (desiredTransformX - transform.x) * panLerp;
      transform.y += (desiredTransformY - transform.y) * panLerp;

      const scaleDist = Math.abs(cameraTargetScale - transform.scale);
      const panDist = Math.hypot(desiredTransformX - transform.x, desiredTransformY - transform.y);

      if (scaleDist < 0.003 && panDist < 0.8) {
        transform.scale = cameraTargetScale;
        transform.x = desiredTransformX;
        transform.y = desiredTransformY;
        isAutoCameraActive = false;
        cameraTargetNode = null;
        cameraTargetPos = null;
      }
    }
  }

  /**
   * 宏观宇宙画布渲染流水线
   */
  function drawGalaxy() {
    if (!ctx || !container) return;

    if (nodes.some(n => n.type !== 'core' && n.screenX === 0 && n.screenY === 0)) {
      simulateCelestialSystem(true);
    }

    const w = container.clientWidth;
    const h = container.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const bounds = getViewportBounds(100);
    const isTransitioning = isAutoCameraActive || isWheelInteracting || isDragging || Boolean(draggedNode);

    const nodeDimmedMap = new Map();
    nodes.forEach(n => {
      nodeDimmedMap.set(n.id, isNodeDimmed(n));
    });

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // 1. 深空星尘与宏观宇宙星云光芒
    drawDeepSpaceAndLighting(bounds);
    // 2. 引力椭圆轨道
    drawOrbits(bounds, nodeDimmedMap);
    // 3. 关联拓扑流
    drawEdges(bounds, nodeDimmedMap);
    // 4. 天体球体本体
    drawCelestialBodies(bounds, nodeDimmedMap, isTransitioning);

    ctx.restore();

    // 5. 悬停提示浮层
    drawNodeInfoOverlay();
  }

  /**
   * 宏观宇宙深空背景、星尘微粒与各星系规模星云渲染 (需求 3 直观展示各星系规模)
   */
  function drawDeepSpaceAndLighting(bounds) {
    ctx.save();

    // 1. 合批极速绘制星尘粒子
    ctx.beginPath();
    cognitiveSpaceDust.forEach(d => {
      if (bounds && (d.x < bounds.minX || d.x > bounds.maxX || d.y < bounds.minY || d.y > bounds.maxY)) return;
      ctx.moveTo(d.x + d.size, d.y);
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
    });
    const dustAlpha = 0.14 + Math.sin(animationTime * 0.02) * 0.05;
    ctx.fillStyle = `rgba(148, 163, 184, ${dustAlpha.toFixed(2)})`;
    ctx.fill();

    // 2. 宏观多星系深空星云与直观规模指示环 (Galactic Nebula & Cosmic Field)
    universeGalaxies.forEach(g => {
      const cx = g.cx;
      const cy = g.cy;
      const nebR = g.radius;

      if (bounds) {
        if (cx + nebR < bounds.minX || cx - nebR > bounds.maxX || cy + nebR < bounds.minY || cy - nebR > bounds.maxY) {
          return;
        }
      }

      // 星系柔和星云晕光 (规模越大，星云越浩瀚绚烂)
      const nebulaGrad = ctx.createRadialGradient(cx, cy, nebR * 0.1, cx, cy, nebR);
      const auraColor = (g.colorTheme && g.colorTheme.aura) || 'rgba(56, 189, 248, 0.15)';
      nebulaGrad.addColorStop(0, auraColor);
      nebulaGrad.addColorStop(0.45, auraColor.replace(/[\d.]+\)$/, '0.06)'));
      nebulaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.arc(cx, cy, nebR, 0, Math.PI * 2);
      ctx.fillStyle = nebulaGrad;
      ctx.fill();

      // 星系外围引力边界参考环 (极淡微弱虚线环，纯净深邃)
      ctx.beginPath();
      ctx.ellipse(cx, cy, nebR * 0.95, nebR * 0.95 * Math.cos(SYSTEM_TILT_X), 0, 0, Math.PI * 2);
      ctx.strokeStyle = (g.colorTheme && g.colorTheme.ring) ? (g.colorTheme.ring + '0a') : 'rgba(56, 189, 248, 0.05)';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([2, 10]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 宏观全宇宙视角下 (拉远缩放 transform.scale < 0.65) 在星系上方渲染大号星系规模徽章
      if (transform.scale < 0.65) {
        ctx.save();
        const badgeY = cy - nebR * 0.72;
        const scaleText = g.count > 0 ? `${g.count} 篇切片` : '空星系';
        const fullLabel = `${g.rawName || g.name} · ${scaleText}`;

        ctx.font = 'bold 15px sans-serif';
        const txtW = ctx.measureText(fullLabel).width;
        const boxW = txtW + 24;
        const boxH = 28;

        // 胶囊背景
        ctx.fillStyle = 'rgba(10, 16, 30, 0.88)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx - boxW / 2, badgeY - boxH / 2, boxW, boxH, 14);
        else ctx.rect(cx - boxW / 2, badgeY - boxH / 2, boxW, boxH);
        ctx.fill();

        ctx.strokeStyle = (g.colorTheme && g.colorTheme.ring) || '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fullLabel, cx, badgeY);
        ctx.restore();
      }
    });

    ctx.restore();
  }

  /**
   * 绘制行星引力开普勒公转轨道
   */
  function drawOrbits(bounds, nodeDimmedMap) {
    nodes.forEach(n => {
      if (n.type !== 'domain' || !n.celestial) return;
      const parentStar = nodeMap.get(n.parentStarId);
      const isRelated = focusRelatedIds.has(n.id) || (focusTarget && focusTarget.id === n.id);
      const isDimmed = nodeDimmedMap ? Boolean(nodeDimmedMap.get(n.id)) : isNodeDimmed(n);
      window.QM.planet?.drawPlanetOrbit(ctx, n, isRelated, SYSTEM_TILT_X, isDimmed, parentStar);
    });
  }

  /**
   * 绘制节点间拓扑连线
   */
  function drawEdges(bounds, nodeDimmedMap) {
    ctx.save();
    const { activeTag, searchQuery, activeCategory } = window.QM.state.state;
    const isTagFilterActive = Boolean(activeTag);
    const isSearchFilterActive = Boolean(searchQuery) || activeCategory !== 'all';
    const isFocusActive = Boolean(focusTarget);

    const normalPath = new Path2D();
    const focusPath = new Path2D();
    const kwFocusPath = new Path2D();
    const chainEdgesList = [];

    edges.forEach(e => {
      const fromNode = nodeMap.get(e.from);
      const toNode = nodeMap.get(e.to);
      if (!fromNode || !toNode) return;

      const fx = fromNode.screenX;
      const fy = fromNode.screenY;
      const tx = toNode.screenX;
      const ty = toNode.screenY;

      if (bounds) {
        if ((fx < bounds.minX && tx < bounds.minX) ||
            (fx > bounds.maxX && tx > bounds.maxX) ||
            (fy < bounds.minY && ty < bounds.minY) ||
            (fy > bounds.maxY && ty > bounds.maxY)) {
          return;
        }
      }

      const fromDimmed = nodeDimmedMap ? Boolean(nodeDimmedMap.get(fromNode.id)) : isNodeDimmed(fromNode);
      const toDimmed = nodeDimmedMap ? Boolean(nodeDimmedMap.get(toNode.id)) : isNodeDimmed(toNode);

      if (isTagFilterActive && (fromDimmed || toDimmed)) return;
      if (isSearchFilterActive && (fromDimmed || toDimmed)) return;

      if (isFocusActive) {
        const isFromActive = !fromDimmed || (hoveredNode && hoveredNode.id === fromNode.id);
        const isToActive = !toDimmed || (hoveredNode && hoveredNode.id === toNode.id);
        if (!isFromActive || !isToActive) return;

        if (focusTarget.type === 'domain') {
          const isBelongsToCurrentDomain = (e.from === focusTarget.id || e.to === focusTarget.id);
          const connectsToHover = hoveredNode && (e.from === hoveredNode.id || e.to === hoveredNode.id);
          if (!isBelongsToCurrentDomain && !connectsToHover) return;
        } else if (focusTarget.type === 'unit') {
          const connectsToFocus = (e.from === focusTarget.id || e.to === focusTarget.id);
          const connectsToHover = hoveredNode && (e.from === hoveredNode.id || e.to === hoveredNode.id);
          if (!connectsToFocus && !connectsToHover) return;
        }
      }

      const isFocusLink = (focusTarget && (e.from === focusTarget.id || e.to === focusTarget.id)) ||
                          (hoveredNode && (e.from === hoveredNode.id || e.to === hoveredNode.id));

      if (e.isChain) {
        chainEdgesList.push({ fromNode, toNode, isFocusLink });
      } else if (e.type === 'shared_keywords') {
        if (isFocusLink) {
          kwFocusPath.moveTo(fx, fy);
          kwFocusPath.lineTo(tx, ty);
        }
      } else {
        if (isFocusLink) {
          focusPath.moveTo(fx, fy);
          focusPath.lineTo(tx, ty);
        } else {
          normalPath.moveTo(fx, fy);
          normalPath.lineTo(tx, ty);
        }
      }
    });

    // 1. 合批绘制普通层级连线
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.20)';
    ctx.lineWidth = 1;
    ctx.stroke(normalPath);

    // 2. 焦点关联层级连线
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.stroke(focusPath);

    // 3. 关键词关联连线
    ctx.strokeStyle = 'rgba(232, 121, 249, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.stroke(kwFocusPath);
    ctx.setLineDash([]);

    // 4. 显式链式衍生脉冲激活流
    chainEdgesList.forEach(({ fromNode, toNode, isFocusLink }) => {
      ctx.beginPath();
      ctx.moveTo(fromNode.screenX, fromNode.screenY);
      ctx.lineTo(toNode.screenX, toNode.screenY);
      ctx.strokeStyle = isFocusLink ? '#10b981' : 'rgba(16, 185, 129, 0.35)';
      ctx.lineWidth = isFocusLink ? 2.0 : 1.2;
      ctx.stroke();

      const pulseT = ((animationTime * 0.015) % 1.0);
      const px = fromNode.screenX + (toNode.screenX - fromNode.screenX) * pulseT;
      const py = fromNode.screenY + (toNode.screenY - fromNode.screenY) * pulseT;
      ctx.beginPath();
      ctx.arc(px, py, isFocusLink ? 3.0 : 2.0, 0, Math.PI * 2);
      ctx.fillStyle = '#34d399';
      ctx.fill();
    });

    ctx.restore();
  }

  /**
   * 绘制所有天体实体 (拟真天文观测级特效渲染)
   */
  function drawCelestialBodies(bounds, nodeDimmedMap, isTransitioning) {
    const { activeTag, memories } = window.QM.state.state;
    const hasFocus = Boolean(focusTarget);

    const visibleNodes = nodes.filter(n => {
      if (!bounds) return true;
      const extraMargin = n.type === 'core' ? 180 : (n.type === 'domain' ? 90 : 35);
      const r = (n.screenRadius || n.radius || 15) + extraMargin;
      return (
        n.screenX + r >= bounds.minX &&
        n.screenX - r <= bounds.maxX &&
        n.screenY + r >= bounds.minY &&
        n.screenY - r <= bounds.maxY
      );
    });

    visibleNodes.sort((a, b) => (a.z || 0) - (b.z || 0));

    const star = window.QM.star;
    const planet = window.QM.planet;
    const satellite = window.QM.satellite;

    visibleNodes.forEach(n => {
      const isCore = n.type === 'core';
      const isDomain = n.type === 'domain';
      const isUnit = n.type === 'unit';
      const isFocus = focusTarget && focusTarget.id === n.id;
      const isHover = hoveredNode && hoveredNode.id === n.id;
      const isRelated = focusRelatedIds.has(n.id);
      const isDimmed = nodeDimmedMap ? Boolean(nodeDimmedMap.get(n.id)) : isNodeDimmed(n);

      let isTagHit = false;
      if (activeTag) {
        if (isUnit) isTagHit = n.rawItem ? (n.rawItem.keywords || []).includes(activeTag) : false;
        else if (isDomain) isTagHit = memories.some(m => m.category === n.categoryKey && (m.keywords || []).includes(activeTag));
        else if (isCore) isTagHit = true;
      }

      const nodeAlpha = isDimmed ? 0.55 : 1.0;

      ctx.save();
      ctx.translate(n.screenX, n.screenY);
      ctx.globalAlpha = nodeAlpha;

      if (isCore) {
        star?.drawStar(ctx, n, animationTime, isDimmed);
      } else if (isDomain) {
        planet?.drawPlanet(ctx, n, isFocus, isHover, isRelated, isDimmed);
      } else if (isUnit) {
        satellite?.drawSatellite(ctx, n, isFocus, isHover, isRelated, activeTag, isTagHit, isDimmed, hasFocus);
      }

      ctx.restore();
    });
  }

  let animLoopId = null;
  let isRenderPending = false;

  function requestRender() {
    if (animLoopId) return;
    if (!isRenderPending) {
      isRenderPending = true;
      requestAnimationFrame(() => {
        isRenderPending = false;
        if (window.QM.state.state.viewMode === 'galaxy') {
          drawGalaxy();
        }
      });
    }
  }

  function startGalaxyLoop() {
    if (animLoopId) return;
    function loop() {
      const { viewMode, enableEffects } = window.QM.state.state;
      const isStillAnimating = Boolean(enableEffects || isAutoCameraActive || hasDomainExpanding);
      if (viewMode === 'galaxy' && isStillAnimating) {
        simulateCelestialSystem();
        drawGalaxy();
        animLoopId = requestAnimationFrame(loop);
      } else {
        animLoopId = null;
      }
    }
    animLoopId = requestAnimationFrame(loop);
  }

  function stopGalaxyLoop() {
    if (animLoopId) {
      cancelAnimationFrame(animLoopId);
      animLoopId = null;
    }
  }

  /**
   * 屏幕坐标反查天体命中拾取
   */
  function getNodeAtScreen(sx, sy) {
    const worldPos = screenToWorld(sx, sy);
    const sorted = [...nodes].sort((a, b) => {
      const priority = { unit: 3, domain: 2, core: 1 };
      if (priority[a.type] !== priority[b.type]) {
        return priority[b.type] - priority[a.type];
      }
      return (b.z || 0) - (a.z || 0);
    });

    for (const n of sorted) {
      const hitMargin = n.type === 'unit' ? 8 : (n.type === 'domain' ? 10 : 12);
      const hitR = (n.screenRadius || n.radius) + hitMargin;
      const dist = Math.hypot(worldPos.x - n.screenX, worldPos.y - n.screenY);
      if (dist <= hitR) return n;
    }
    return null;
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - transform.x) / transform.scale,
      y: (sy - transform.y) / transform.scale
    };
  }

  function getNodeScreenPos(node) {
    if (!node) return { x: 0, y: 0, r: 0 };
    return {
      x: transform.x + node.screenX * transform.scale,
      y: transform.y + node.screenY * transform.scale,
      r: (node.screenRadius || node.radius) * transform.scale
    };
  }

  let currentCardNode = null;

  function showCelestialCard(node) {
    if (!node) return;
    currentCardNode = node;
    const cardEl = document.getElementById('celestial-card');
    const badgeDot = document.getElementById('c-card-dot');
    const typeEl = document.getElementById('c-card-type');
    const titleEl = document.getElementById('c-card-title');
    const subEl = document.getElementById('c-card-sub');
    const descEl = document.getElementById('c-card-desc');
    const tagsEl = document.getElementById('c-card-tags');
    const openBtn = document.getElementById('c-card-open-btn');

    if (!cardEl) return;

    const state = window.QM.state.state;
    const constants = window.QM.constants;
    const { escapeHtml } = window.QM.utils;

    if (node.type === 'core') {
      if (typeEl) typeEl.innerText = "星系意图恒星";
      if (badgeDot) {
        badgeDot.style.background = "#f59e0b";
        badgeDot.style.boxShadow = "0 0 8px #f59e0b";
      }
      if (titleEl) titleEl.innerText = `🌟 ${node.name}`;
      if (subEl) subEl.innerText = `宏观星系 · ${node.cardCount || 0} 篇切片`;
      if (descEl) descEl.innerText = `承载【${node.name}】工程全局意图架构与认知引力中心，所属规约与避坑经验受其牵引。`;
      if (tagsEl) {
        const projMemories = state.memories.filter(m => m.projectId === node.galaxyId);
        const allKeywords = Array.from(new Set(projMemories.flatMap(m => m.keywords || []))).slice(0, 8);
        tagsEl.innerHTML = allKeywords.map(k => `<span class="c-card-tag">${escapeHtml(k)}</span>`).join('');
      }
      if (openBtn) openBtn.innerText = "📋 查看索引";
    } else if (node.type === 'domain') {
      const color = node.color || "#38bdf8";
      if (typeEl) typeEl.innerText = "主题认知行星";
      if (badgeDot) {
        badgeDot.style.background = color;
        badgeDot.style.boxShadow = `0 0 8px ${color}`;
      }
      if (titleEl) titleEl.innerText = `🪐 ${node.name}`;
      if (subEl) subEl.innerText = `${node.categoryKey} · ${node.cardCount || 0} 篇切片`;
      const catMemories = state.memories.filter(m => m.category === node.categoryKey && (!node.galaxyId || m.projectId === node.galaxyId));
      const catKeywords = Array.from(new Set(catMemories.flatMap(m => m.keywords || []))).slice(0, 8);
      if (descEl) descEl.innerText = `该主题汇聚 ${catMemories.length} 篇知识切片。可在页面右下角灵活调节其卫星环绕间距。`;
      if (tagsEl) {
        tagsEl.innerHTML = catKeywords.map(k => `<span class="c-card-tag">${escapeHtml(k)}</span>`).join('');
      }
      if (openBtn) openBtn.innerText = "📂 认知域详情";
    } else if (node.rawItem) {
      const item = node.rawItem;
      const color = node.parentColor || "#a78bfa";
      if (typeEl) typeEl.innerText = "记忆切片卫星";
      if (badgeDot) {
        badgeDot.style.background = color;
        badgeDot.style.boxShadow = `0 0 8px ${color}`;
      }
      if (titleEl) titleEl.innerText = `💡 ${item.name}`;
      const catCfg = constants.CATEGORY_MAP[item.category];
      const catName = catCfg ? catCfg.name : (item.category || '知识切片');
      if (subEl) subEl.innerText = `${catName} · ${item.filename}`;
      if (descEl) descEl.innerText = item.description || "暂无特定触发场景描述，点击「详细规约」查看 Markdown 详细内容。";
      if (tagsEl) {
        const kws = (item.keywords || []).slice(0, 8);
        tagsEl.innerHTML = kws.map(k => `<span class="c-card-tag">${escapeHtml(k)}</span>`).join('');
      }
      if (openBtn) openBtn.innerText = state.isEditMode ? "✏️ 编辑切片" : "📖 详细规约";
    }

    const cardDeleteBtn = document.getElementById('c-card-delete-btn');
    if (cardDeleteBtn) {
      cardDeleteBtn.style.display = (node.rawItem && node.rawItem.id) ? 'inline-flex' : 'none';
    }

    cardEl.style.display = 'flex';
  }

  function hideCelestialCard() {
    const cardEl = document.getElementById('celestial-card');
    if (cardEl) cardEl.style.display = 'none';
  }

  function drawNodeInfoOverlay() {
    if (!hoveredNode || !container) return;
    const target = hoveredNode;
    const sp = getNodeScreenPos(target);

    const fullName = target.name || '';
    if (!fullName) return;

    ctx.save();
    ctx.font = 'bold 12px sans-serif';
    const textMetrics = ctx.measureText(fullName);
    const textW = textMetrics.width;

    const padX = 14;
    const boxW = Math.max(90, textW + padX * 2);
    const boxH = 30;

    const cw = container.clientWidth;
    let bx = sp.x - boxW / 2;
    let by = sp.y - sp.r - 40;

    if (bx < 15) bx = 15;
    if (bx + boxW > cw - 15) bx = cw - boxW - 15;
    if (by < 15) by = sp.y + sp.r + 14;

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 6);
    else ctx.rect(bx, by, boxW, boxH);
    ctx.fillStyle = 'rgba(10, 16, 30, 0.94)';
    ctx.fill();

    const colorTheme = target.type === 'core' ? '#f59e0b' : (target.color || target.parentColor || '#38bdf8');
    ctx.strokeStyle = colorTheme;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fullName, bx + boxW / 2, by + boxH / 2);
    ctx.restore();
  }

  /**
   * 取消选中焦点，恢复宏观全宇宙视界
   */
  function deselectFocus(shouldSyncSidebar = true) {
    focusTarget = null;
    cameraTargetNode = null;
    cameraTargetPos = null;
    isAutoCameraActive = false;
    hasDomainExpanding = true;
    startGalaxyLoop();
    updateFocusRelatedSet();

    window.QM.drawer?.closeDrawer();
    hideCelestialCard();
    resetSpacingControllerUI();

    const moreMenu = document.getElementById('more-menu');
    if (moreMenu) moreMenu.classList.remove('show');
    const indexModal = document.getElementById('index-modal');
    if (indexModal) indexModal.classList.add('hidden');

    if (shouldSyncSidebar) {
      window.QM.sidebar?.highlightCategory('all', true);
    }
    requestRender();
  }

  function focusOnCategory(catKey) {
    if (!catKey || catKey === 'all') {
      deselectFocus(false);
      return;
    }

    const domainNode = nodes.find(n => n.type === 'domain' && n.categoryKey === catKey);
    if (!domainNode) {
      deselectFocus(false);
      return;
    }

    focusTarget = domainNode;
    updateFocusRelatedSet();

    cameraTargetNode = domainNode;
    cameraTargetScale = getDomainCameraScale(domainNode.cardCount);
    isAutoCameraActive = true;
    hasDomainExpanding = true;
    startGalaxyLoop();

    showCelestialCard(domainNode);
    updateSpacingControllerUI(domainNode);

    const drawerEl = document.getElementById('editor-drawer');
    if (drawerEl && drawerEl.classList.contains('open')) {
      window.QM.drawer?.openDomainDrawer(domainNode);
    }
    requestRender();
  }

  function onOfficialCategoryChanged(groupKey = 'all') {
    // 仅清理焦点天体与关联集，镜头保持当前位置不发生任何偏移
    focusTarget = null;
    isAutoCameraActive = false;
    cameraTargetNode = null;
    cameraTargetPos = null;
    updateFocusRelatedSet();

    window.QM.drawer?.closeDrawer();
    hideCelestialCard();
    resetSpacingControllerUI();

    const hudText = document.getElementById('hud-text');
    const hudIndicator = document.getElementById('hud-indicator');
    const { OFFICIAL_CATEGORIES } = window.QM.constants || {};

    if (groupKey && groupKey !== 'all' && OFFICIAL_CATEGORIES?.[groupKey]) {
      const grp = OFFICIAL_CATEGORIES[groupKey];
      const allowedSubs = new Set(grp.subs || []);
      const matchedPlanets = nodes.filter(n => n.type === 'domain' && allowedSubs.has(n.categoryKey));

      if (hudText) {
        hudText.innerText = `🌌 官方领域聚焦：${grp.icon} 【${grp.name}】 · 高亮 ${matchedPlanets.length} 个主题认知行星`;
      }
      if (hudIndicator) {
        hudIndicator.style.background = grp.color || '#38bdf8';
        hudIndicator.style.boxShadow = `0 0 10px ${grp.color || '#38bdf8'}`;
      }

      window.QM.utils?.showToast(`已聚焦官方领域：${grp.icon} ${grp.name}（${matchedPlanets.length} 个认知行星高亮）`);
    } else {
      if (hudText) {
        hudText.innerText = '🌌 认知引力网络待命 · 全局拓扑就绪';
      }
      if (hudIndicator) {
        hudIndicator.style.background = '#10b981';
        hudIndicator.style.boxShadow = '0 0 10px #10b981';
      }
      window.QM.utils?.showToast('已恢复全宇宙宏观全貌');
    }

    requestRender();
  }

  /**
   * 右下角当前选中行星卫星间距控制器 UI 同步逻辑 (需求 1)
   */
  function updateSpacingControllerUI(planetNode) {
    const ctrl = document.getElementById('satellite-spacing-controller');
    const targetName = document.getElementById('spacing-target-name');
    const slider = document.getElementById('spacing-slider');
    const valText = document.getElementById('spacing-val');
    const btnDec = document.getElementById('btn-spacing-dec');
    const btnInc = document.getElementById('btn-spacing-inc');
    const btnReset = document.getElementById('btn-spacing-reset');

    if (!ctrl || !planetNode) return;

    ctrl.classList.add('is-active');
    if (targetName) targetName.innerText = `【${planetNode.name}】`;

    const currentSpacing = window.QM.state.getPlanetSpacing(planetNode.id) || planetNode.satelliteSpacingScale || 1.0;
    planetNode.satelliteSpacingScale = currentSpacing;
    if (!planetNode.expansionProgress || planetNode.expansionProgress < 1.0) {
      if (!window.QM.state.state.enableEffects) {
        planetNode.expansionProgress = 1.0;
      }
    }
    if (slider) {
      slider.disabled = false;
      slider.value = currentSpacing;
    }
    if (valText) valText.innerText = currentSpacing.toFixed(2) + 'x';
    if (btnDec) btnDec.disabled = false;
    if (btnInc) btnInc.disabled = false;
    if (btnReset) btnReset.disabled = false;

    window.QM.state.setSelectedPlanet(planetNode);
  }

  function resetSpacingControllerUI() {
    const ctrl = document.getElementById('satellite-spacing-controller');
    const targetName = document.getElementById('spacing-target-name');
    const slider = document.getElementById('spacing-slider');
    const valText = document.getElementById('spacing-val');
    const btnDec = document.getElementById('btn-spacing-dec');
    const btnInc = document.getElementById('btn-spacing-inc');
    const btnReset = document.getElementById('btn-spacing-reset');

    if (!ctrl) return;

    ctrl.classList.remove('is-active');
    if (targetName) targetName.innerText = '未选中行星';
    if (slider) {
      slider.disabled = true;
      slider.value = 1.0;
    }
    if (valText) valText.innerText = '1.0x';
    if (btnDec) btnDec.disabled = true;
    if (btnInc) btnInc.disabled = true;
    if (btnReset) btnReset.disabled = true;

    window.QM.state.setSelectedPlanet(null);
  }

  /**
   * 绑定右下角卫星间距调节器交互事件 (需求 1 核心交互)
   */
  function bindSpacingControllerEvents() {
    const slider = document.getElementById('spacing-slider');
    const valText = document.getElementById('spacing-val');
    const btnDec = document.getElementById('btn-spacing-dec');
    const btnInc = document.getElementById('btn-spacing-inc');
    const btnReset = document.getElementById('btn-spacing-reset');

    function applySpacing(newScale) {
      const clamped = Math.max(0.4, Math.min(2.6, parseFloat(newScale) || 1.0));
      const selPlanet = window.QM.state.state.selectedPlanet;
      if (selPlanet) {
        selPlanet.satelliteSpacingScale = clamped;
        if (!selPlanet.expansionProgress || selPlanet.expansionProgress < 1.0) {
          selPlanet.expansionProgress = 1.0;
        }
        window.QM.state.setPlanetSpacing(selPlanet.id, clamped);
        if (slider) slider.value = clamped;
        if (valText) valText.innerText = clamped.toFixed(2) + 'x';
        simulateCelestialSystem(true);
        drawGalaxy();
      }
    }

    if (slider) {
      slider.addEventListener('input', e => {
        applySpacing(e.target.value);
      });
    }

    if (btnDec) {
      btnDec.addEventListener('click', () => {
        const cur = parseFloat(slider?.value || 1.0);
        applySpacing(cur - 0.1);
      });
    }

    if (btnInc) {
      btnInc.addEventListener('click', () => {
        const cur = parseFloat(slider?.value || 1.0);
        applySpacing(cur + 0.1);
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        applySpacing(1.0);
      });
    }
  }

  /**
   * 画布鼠标手势与天体拖拽交互
   */
  function bindEvents() {
    canvas.addEventListener('mousedown', e => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      clickOrigin = { x: e.clientX, y: e.clientY };
      const worldPos = screenToWorld(sx, sy);
      const hit = getNodeAtScreen(sx, sy);

      if (hit) {
        draggedNode = hit;
        isAutoCameraActive = false;
        cameraTargetNode = null;
        cameraTargetPos = null;
        dragStartMouse = worldPos;

        grabOffsetX = worldPos.x - hit.screenX;
        grabOffsetY = worldPos.y - hit.screenY;

        dragSnapshotMap.clear();
        nodes.forEach(n => {
          dragSnapshotMap.set(n.id, {
            x: n.x, y: n.y, z: n.z || 0,
            screenX: n.screenX, screenY: n.screenY,
            relX: hit.type === 'domain' && n.parentId === hit.id ? (n.x - hit.x) : 0,
            relY: hit.type === 'domain' && n.parentId === hit.id ? (n.y - hit.y) : 0,
            relZ: hit.type === 'domain' && n.parentId === hit.id ? ((n.z || 0) - (hit.z || 0)) : 0
          });
        });
      } else {
        isDragging = true;
        isAutoCameraActive = false;
        cameraTargetNode = null;
        cameraTargetPos = null;
        dragStart = { x: e.clientX - transform.x, y: e.clientY - transform.y };
      }
    });

    window.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const worldPos = screenToWorld(sx, sy);

      if (!draggedNode && !isDragging) {
        const hit = getNodeAtScreen(sx, sy);
        if (hit !== hoveredNode) {
          hoveredNode = hit;
          canvas.style.cursor = hit ? "pointer" : "grab";
          requestRender();
        }
      }

      if (draggedNode) {
        if ((e.buttons & 1) !== 1) {
          draggedNode = null;
          dragSnapshotMap.clear();
          return;
        }

        canvas.style.cursor = "grabbing";
        const targetScreenX = worldPos.x - grabOffsetX;
        const targetScreenY = worldPos.y - grabOffsetY;

        const planet = window.QM.planet;
        const satellite = window.QM.satellite;

        if (draggedNode.type !== "core") {
          if (draggedNode.type === 'domain') {
            const parentStar = nodeMap.get(draggedNode.parentStarId) || { x: 0, y: 0, z: 0, screenX: 0, screenY: 0 };
            const solved = planet.solvePlanetCoordsFromScreen(
              targetScreenX, targetScreenY,
              parentStar.x || 0, parentStar.y || 0, parentStar.z || 0,
              draggedNode.celestial ? draggedNode.celestial.inclination : 0,
              SYSTEM_TILT_X, CAMERA_DISTANCE
            );
            draggedNode.x = (parentStar.x || 0) + solved.localX;
            draggedNode.y = (parentStar.y || 0) + solved.localY * solved.cosTilt;
            draggedNode.z = solved.planetZ;
            draggedNode.scale = solved.depthScale;
            draggedNode.screenX = targetScreenX;
            draggedNode.screenY = targetScreenY;
            draggedNode.screenRadius = draggedNode.radius * solved.depthScale;

            nodes.forEach(other => {
              if (other.type === 'unit' && other.parentId === draggedNode.id) {
                const snap = dragSnapshotMap.get(other.id);
                if (snap) {
                  other.x = draggedNode.x + snap.relX;
                  other.y = draggedNode.y + snap.relY;
                  other.z = draggedNode.z + snap.relZ;
                  const oDs = CAMERA_DISTANCE / Math.max(10, CAMERA_DISTANCE - other.z);
                  other.scale = oDs;
                  other.screenX = other.x * oDs;
                  other.screenY = other.y * oDs;
                  other.screenRadius = other.radius * oDs;
                }
              }
            });
          } else if (draggedNode.type === 'unit') {
            const parent = draggedNode.parentId ? nodeMap.get(draggedNode.parentId) : null;
            if (parent) {
              const solved = satellite.solveSatelliteCoordsFromScreen(
                targetScreenX, targetScreenY,
                parent,
                draggedNode.celestial ? draggedNode.celestial.inclination : 0,
                SYSTEM_TILT_X, CAMERA_DISTANCE
              );

              draggedNode.x = parent.x + solved.mLocalX;
              draggedNode.y = parent.y + solved.mLocalY * solved.cosTilt;
              draggedNode.z = solved.satZ;
              draggedNode.scale = solved.depthScale;
              draggedNode.screenX = targetScreenX;
              draggedNode.screenY = targetScreenY;
              draggedNode.screenRadius = draggedNode.radius * solved.depthScale;
            }
          }
        }
        requestRender();
      } else if (isDragging) {
        isAutoCameraActive = false;
        transform.x = e.clientX - dragStart.x;
        transform.y = e.clientY - dragStart.y;
        requestRender();
      }
    });

    window.addEventListener('mouseup', e => {
      try {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const worldPos = screenToWorld(sx, sy);
        const screenMoved = Math.hypot(e.clientX - clickOrigin.x, e.clientY - clickOrigin.y);

        const drawer = window.QM.drawer;
        const sidebar = window.QM.sidebar;
        const planet = window.QM.planet;
        const satellite = window.QM.satellite;

        if (draggedNode) {
          if (screenMoved < 6) {
            const clicked = draggedNode;
            focusTarget = clicked;
            updateFocusRelatedSet();

            if (clicked.type === 'unit') {
              isAutoCameraActive = false;
              cameraTargetNode = null;
              cameraTargetPos = null;
              hasDomainExpanding = true;
              startGalaxyLoop();
              if (clicked.rawItem && drawer) {
                drawer.openDrawer(clicked.rawItem.id);
              }
              if (sidebar && typeof sidebar.highlightCategory === 'function') {
                const cat = (clicked.rawItem && clicked.rawItem.category) || 'all';
                sidebar.highlightCategory(cat, true);
              }
              resetSpacingControllerUI();
            } else if (clicked.type === 'domain') {
              cameraTargetNode = clicked;
              cameraTargetPos = null;
              cameraTargetScale = getDomainCameraScale(clicked.cardCount);
              isAutoCameraActive = true;
              hasDomainExpanding = true;
              startGalaxyLoop();
              if (drawer) drawer.openDomainDrawer(clicked);
              if (sidebar && typeof sidebar.highlightCategory === 'function') {
                sidebar.highlightCategory(clicked.categoryKey, true);
              }
              // 关键：激活右下角卫星间距调节器！
              updateSpacingControllerUI(clicked);
            } else if (clicked.type === 'core') {
              cameraTargetNode = clicked;
              cameraTargetPos = null;
              cameraTargetScale = 0.78;
              isAutoCameraActive = true;
              hasDomainExpanding = true;
              startGalaxyLoop();
              if (drawer) drawer.openCoreDrawer(clicked);
              if (sidebar && typeof sidebar.highlightCategory === 'function') {
                sidebar.highlightCategory('all', true);
              }
              resetSpacingControllerUI();
            }

            showCelestialCard(clicked);
          } else {
            const finalDropPos = {
              x: worldPos.x - grabOffsetX,
              y: worldPos.y - grabOffsetY
            };
            if (draggedNode.type !== "core") {
              if (draggedNode.type === 'domain') {
                const childSats = nodes.filter(n => n.type === 'unit' && n.parentId === draggedNode.id);
                const parentStar = nodeMap.get(draggedNode.parentStarId);
                planet.recalculatePlanetOrbit(
                  draggedNode, finalDropPos.x, finalDropPos.y,
                  parentStar ? parentStar.radius : 30, SYSTEM_TILT_X, CAMERA_DISTANCE, childSats, parentStar
                );
              } else if (draggedNode.type === 'unit') {
                const parent = draggedNode.parentId ? nodeMap.get(draggedNode.parentId) : null;
                satellite.recalculateSatelliteOrbit(
                  draggedNode, parent, finalDropPos.x, finalDropPos.y,
                  SYSTEM_TILT_X, CAMERA_DISTANCE
                );
              }
            }
          }
        } else {
          const hit = getNodeAtScreen(sx, sy);
          if (!hit && screenMoved < 6) {
            deselectFocus();
          }
        }
      } catch (err) {
        console.error('mouseup 处理异常:', err);
      } finally {
        draggedNode = null;
        dragSnapshotMap.clear();
        isDragging = false;
        canvas.style.cursor = hoveredNode ? "pointer" : "grab";
        requestRender();
      }
    });

    // 绑定常驻介绍卡片按钮
    const cardCloseBtn = document.getElementById('c-card-close');
    if (cardCloseBtn) cardCloseBtn.addEventListener('click', () => hideCelestialCard());

    const cardCenterBtn = document.getElementById('c-card-center-btn');
    if (cardCenterBtn) {
      cardCenterBtn.addEventListener('click', () => {
        if (currentCardNode) {
          cameraTargetNode = currentCardNode;
          cameraTargetPos = null;
          cameraTargetScale = currentCardNode.type === 'domain'
            ? getDomainCameraScale(currentCardNode.cardCount)
            : (currentCardNode.type === 'core' ? 0.78 : 1.35);
          isAutoCameraActive = true;
          startGalaxyLoop();
          requestRender();
        }
      });
    }

    const cardOpenBtn = document.getElementById('c-card-open-btn');
    if (cardOpenBtn) {
      cardOpenBtn.addEventListener('click', () => {
        if (currentCardNode) {
          const drawer = window.QM.drawer;
          if (drawer) {
            if (currentCardNode.type === 'core') drawer.openCoreDrawer(currentCardNode);
            else if (currentCardNode.type === 'domain') drawer.openDomainDrawer(currentCardNode);
            else if (currentCardNode.rawItem) drawer.openDrawer(currentCardNode.rawItem.id);
          }
        }
      });
    }

    const cardDeleteBtn = document.getElementById('c-card-delete-btn');
    if (cardDeleteBtn) {
      cardDeleteBtn.addEventListener('click', () => {
        if (currentCardNode && currentCardNode.rawItem) {
          const drawer = window.QM.drawer;
          if (drawer && typeof drawer.deleteCard === 'function') {
            drawer.deleteCard(currentCardNode.rawItem.id);
          }
        }
      });
    }

    // 滚轮缩放宏观宇宙
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      isAutoCameraActive = false;
      cameraTargetNode = null;
      cameraTargetPos = null;

      isWheelInteracting = true;
      if (wheelDebounceTimer) clearTimeout(wheelDebounceTimer);
      wheelDebounceTimer = setTimeout(() => {
        isWheelInteracting = false;
        requestRender();
      }, 140);

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(0.08, transform.scale * factor), 4.0);
      if (newScale !== transform.scale) {
        transform.x = sx - (sx - transform.x) * (newScale / transform.scale);
        transform.y = sy - (sy - transform.y) * (newScale / transform.scale);
        transform.scale = newScale;
        requestRender();
      }
    }, { passive: false });
  }

  function clearCelestialStore() {
    celestialStore.clear();
    focusTarget = null;
    focusRelatedIds.clear();
    cameraTargetNode = null;
    cameraTargetPos = null;
    isAutoCameraActive = false;
    hideCelestialCard();
    resetSpacingControllerUI();
    requestRender();
  }

  return {
    init,
    resizeCanvas,
    fitGalaxyView,
    focusOnGalaxy,
    buildGalaxyGraph,
    updateFocusRelatedSet,
    clearCelestialStore,
    showCelestialCard,
    hideCelestialCard,
    deselectFocus,
    focusOnCategory,
    onOfficialCategoryChanged,
    updateSpacingControllerUI,
    resetSpacingControllerUI,
    requestRender,
    startGalaxyLoop,
    stopGalaxyLoop
  };
})();

// 向下兼容旧调用
window.QM_GALAXY = window.QM.topology;
