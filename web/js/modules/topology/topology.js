/**
 * Qoder Memory Visualizer - 3D 宏观宇宙引力拓扑主引擎 (Macro Universe Topology Engine)
 * 职责：宏观全宇宙多星系统排布、直观规模呈现、天文观测级天体协调、摄像机穿梭运镜与右下角卫星间距调节
 */
window.QM = window.QM || {};

window.QM.topology = (function() {
  const SYSTEM_TILT_X = 0;        // 正俯视平角 (水平旋转，无斜角俯仰)
  const CAMERA_DISTANCE = 1100;    // 投影焦距

  /**
   * 判定摄像机当前是否处于全宇宙宏观拉远视野
   * 镜头拉远时 (scale < 0.68) 默认只展示恒星与行星，极大精简星体并消除卡顿
   */
  function isUniverseZoomedOut() {
    return (transform.scale || 1.0) < 0.68;
  }

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
   * 获取全屏画布舞台尺寸 (视口级渲染域)
   */
  function getStageSize() {
    return {
      w: (canvas && canvas.clientWidth) || 1200,
      h: (canvas && canvas.clientHeight) || 800
    };
  }

  /**
   * 计算机体世界坐标视口可视范围包围盒 (Viewport Frustum Culling)
   */
  function getViewportBounds(padding = 100) {
    if (!container) return null;
    const { w, h } = getStageSize();
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
    const { w, h } = getStageSize();
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
    const { w, h } = getStageSize();

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
        const dY = (n.celestial.semiMinor || 180) + 120;
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
   * 运镜飞跃聚焦至指定星系 (深度联动左侧3栏内容)
   */
  function focusOnGalaxy(galaxyId) {
    if (!galaxyId || galaxyId === 'all') {
      window.QM.state.state.activeGalaxyId = null;
      window.QM.state.state.currentProject = 'all';
      window.QM.utils?.syncNavDropdown?.('galaxy-dd', 'all');
      window.QM.sidebar?.render();
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
      // 默认选中该星系恒星：激活星系间距控制并弹出对应详情抽屉
      updateSpacingControllerUI(starNode);
      window.QM.drawer?.openCoreDrawer(starNode);
      // 深度联动左侧3栏显示该星系对应内容
      window.QM.state.state.activeGalaxyId = galaxyId;
      window.QM.state.state.currentProject = galaxyId;
      window.QM.utils?.syncNavDropdown?.('galaxy-dd', galaxyId);
      window.QM.sidebar?.render();
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
          const cy = Math.sin(angle) * dist; // 俯视平角，水平自然展开
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
      // 读取用户自定义的星系整体间距配置
      starNode.satelliteSpacingScale = window.QM.state.getPlanetSpacing(starNode.id) || 1.0;
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

      // 根据星系规模自适应行星轨道开普勒跨度 (需求 2：恒星与行星最近范围缩小，更显紧凑充盈)
      const R_MIN = totalCards > 30 ? 150 : (totalCards > 10 ? 120 : 95);
      const domainTiers = numDomains > 10 ? 4 : (numDomains > 5 ? 3 : (numDomains > 2 ? 2 : 1));
      const domainSpread = Math.min(150, Math.log2(Math.max(1, numDomains)) * 42);
      const cardSpread = Math.min(130, Math.sqrt(Math.max(0, totalCards)) * 10);
      const R_MAX = Math.min(580, Math.max(R_MIN + 120, R_MIN + domainSpread * 1.0 + cardSpread * 1.0));
      const tierBandWidth = (R_MAX - R_MIN) / Math.max(domainTiers, 1);
      // 需求 2：每个星系分配随机基准朝向相位，彻底避免每次刷新全部朝向单一方向
      const galaxyBasePhase = Math.random() * Math.PI * 2;

      // 记录星系引力场边界半径 (用于宏观宇宙星云渲染)
      const galaxyRadius = R_MAX + 80;
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
            pStore = planet.initPlanetCelestial(cat, idxInTier, tierCount, isStrongAffinity, dTier, domainTiers, tierBandWidth, R_MIN, galaxyBasePhase);
            celestialStore.set(storeKey, pStore);
          }

          // 行星大小随卫星数量增多而增大，且最大不超过恒星的 3 倍大小
          const domainNode = planet.createPlanetNode(cat, catCfg, cardCount, pStore, g.id, starNode.radius);
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

      // 3.3 构建该星系内的记忆切片卫星 (需求 3：连线越少越贴近母行星，连线复杂向外延展)
      const domainUnitsMap = new Map();
      gMemories.forEach(m => {
        const cat = m.category || 'other';
        if (!domainUnitsMap.has(cat)) domainUnitsMap.set(cat, []);
        domainUnitsMap.get(cat).push(m);
      });

      // 计算记忆切片的关系连接复杂度得分 (显式链路 + wiki链接 + md链接 + 关键词)
      const calcRelationScore = m => {
        let score = 0;
        if (Array.isArray(m.chains)) score += m.chains.length * 2;
        const b = m.body || '';
        const wikiMatches = b.match(/\[\[[^\]]+\]\]/g);
        if (wikiMatches) score += wikiMatches.length * 2;
        const mdMatches = b.match(/\[[^\]]+\]\([^)]+\.md\)/g);
        if (mdMatches) score += mdMatches.length * 2;
        if (Array.isArray(m.keywords)) score += Math.min(5, m.keywords.length * 0.6);
        return score;
      };

      domainUnitsMap.forEach((mList, cat) => {
        const parentDomain = domainNodeMap.get(cat) || starNode;
        const parentOmega = parentDomain.celestial ? parentDomain.celestial.omega : 0.0006;
        const unitCount = mList.length;

        // 核心排序：连线越少的切片排在前面分配至靠近母行星的内圈轨道；关系复杂的排在后面延展至外圈
        mList.sort((a, b) => calcRelationScore(a) - calcRelationScore(b));

        mList.forEach((m, mIdx) => {
          let mStore = celestialStore.get(m.id);
          const relScore = calcRelationScore(m);
          if (!mStore) {
            mStore = satellite.initSatelliteCelestial(m, mIdx, unitCount, parentOmega, tierCapacities, relScore);
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
        const parentStar = nodeMap.get(n.parentStarId);
        const starR = parentStar ? parentStar.radius : 30;
        const baseR = planet.calcPlanetRadius ? planet.calcPlanetRadius(n.cardCount || 0, starR) : 24;
        const degBonus = Math.min(6, Math.sqrt(deg) * 1.2);
        const maxAllowed = Math.round(starR * 3);
        n.radius = Math.min(maxAllowed, Math.round(baseR + degBonus));
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
  /**
   * 焦点关联网络更新 (需求 4：选择恒星/行星后，其他星系与之有关系的星体也需要展示)
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
      window.QM.sidebar?.renderTagCloud?.();
      return;
    }

    focusRelatedIds.add(focusTarget.id);

    // 1. 收集当前选中天体的核心直属群组 (primaryGroupIds)
    const primaryGroupIds = new Set([focusTarget.id]);

    if (focusTarget.type === 'core') {
      // 选中恒星：本星系内所有行星与卫星归入核心群组
      nodes.forEach(n => {
        if (n.type === 'domain' && n.parentStarId === focusTarget.id) {
          primaryGroupIds.add(n.id);
          focusRelatedIds.add(n.id);
        } else if (n.type === 'unit' && (n.galaxyId === focusTarget.galaxyId || n.projectId === focusTarget.galaxyId)) {
          primaryGroupIds.add(n.id);
          focusRelatedIds.add(n.id);
        }
      });
    } else if (focusTarget.type === 'domain') {
      // 选中行星：母恒星与该行星直属的所有卫星归入核心群组
      if (focusTarget.parentStarId) {
        primaryGroupIds.add(focusTarget.parentStarId);
        focusRelatedIds.add(focusTarget.parentStarId);
      }
      nodes.forEach(n => {
        if (n.type === 'unit' && n.parentId === focusTarget.id) {
          primaryGroupIds.add(n.id);
          focusRelatedIds.add(n.id);
        }
      });
    } else {
      // 选中卫星：直属母行星及母恒星归入核心群组
      if (focusTarget.parentId) {
        primaryGroupIds.add(focusTarget.parentId);
        focusRelatedIds.add(focusTarget.parentId);
        const pNode = nodeMap.get(focusTarget.parentId);
        if (pNode && pNode.parentStarId) {
          primaryGroupIds.add(pNode.parentStarId);
          focusRelatedIds.add(pNode.parentStarId);
        }
      }
    }

    // 2. 核心：遍历所有关系连线，查找与 primaryGroup 存在关联的“外部其他星系/其他主题”星体！
    const externalRelatedIds = new Set();
    edges.forEach(e => {
      const fromInGroup = primaryGroupIds.has(e.from);
      const toInGroup = primaryGroupIds.has(e.to);
      if (fromInGroup && !toInGroup) {
        externalRelatedIds.add(e.to);
      } else if (!fromInGroup && toInGroup) {
        externalRelatedIds.add(e.from);
      }
    });

    // 3. 将外部关联星体及其所属的母行星/母恒星全部纳入关联集合，提供清晰的外部星系脉络
    externalRelatedIds.forEach(extId => {
      focusRelatedIds.add(extId);
      const extNode = nodeMap.get(extId);
      if (extNode) {
        if (extNode.type === 'unit' && extNode.parentId) {
          focusRelatedIds.add(extNode.parentId);
          const pDomain = nodeMap.get(extNode.parentId);
          if (pDomain && pDomain.parentStarId) {
            focusRelatedIds.add(pDomain.parentStarId);
          }
        } else if (extNode.type === 'domain' && extNode.parentStarId) {
          focusRelatedIds.add(extNode.parentStarId);
        }
      }
    });

    const extCount = externalRelatedIds.size;
    const extNote = extCount > 0 ? ` · 跨星系关联 ${extCount} 个星体` : '';

    if (focusTarget.type === 'core') {
      if (hudText) hudText.innerText = `🌟 聚焦【${focusTarget.name}】星系恒星${extNote} · 可调节右下角星系整体间距`;
    } else if (focusTarget.type === 'domain') {
      if (hudText) hudText.innerText = `🪐 聚焦主题认知行星：【${focusTarget.name}】${extNote} · 可调节右下角卫星间距`;
    } else {
      if (hudText) hudText.innerText = `💡 聚焦记忆节点：${focusTarget.name}${extNote} · 激活脉冲引力`;
    }

    if (hudIndicator) {
      hudIndicator.style.background = "#38bdf8";
      hudIndicator.style.boxShadow = "0 0 10px #38bdf8";
    }

    window.QM.sidebar?.renderTagCloud?.();
  }

  /**
   * 获取当前聚焦天体及其所有关联天体对应的记忆切片列表
   * 若无聚焦天体，返回 null（表示全局/全宇宙切片）
   */
  function getFocusedRelatedMemories() {
    if (!focusTarget) return null;

    const relatedMemories = [];
    const seenMemoryIds = new Set();

    nodes.forEach(n => {
      if (n.type === 'unit' && n.rawItem && focusRelatedIds.has(n.id)) {
        if (!seenMemoryIds.has(n.rawItem.id)) {
          seenMemoryIds.add(n.rawItem.id);
          relatedMemories.push(n.rawItem);
        }
      }
    });

    return relatedMemories;
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

    // 3. 画布天体选中聚焦状态 (需求 4：选择恒星/行星后，其他星系与之有关系的星体同步清晰展示)
    if (focusTarget) {
      if (node.id === focusTarget.id) return false;
      if (focusRelatedIds.has(node.id)) return false;
      return true;
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

    // 模拟所有恒星 (同步星系整体间距倍率与选中展开度)
    const activeStarId = (focusTarget && focusTarget.type === 'core') ? focusTarget.id : null;
    nodes.filter(n => n.type === 'core').forEach(c => {
      c.satelliteSpacingScale = window.QM.state.getPlanetSpacing(c.id) || c.satelliteSpacingScale || 1.0;
      const starTargetExp = (c.id === activeStarId) ? 1.0 : 0.0;
      c.expansionProgress = (c.expansionProgress || 0) + (starTargetExp - (c.expansionProgress || 0)) * 0.08;
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
      if (n.type !== 'domain' && n.type !== 'core') return;
      const anchorId = (n.type === 'core') ? activeStarId : activeDomainId;
      const targetExp = (n.id === anchorId) ? 1.0 : 0.0;
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
        // 星系级整体间距倍率：恒星选中展开度与恒星间距倍率统一驱动行星与卫星扩张
        n.galaxySpacingMult = planet.getGalaxySpacingMultiplier(parentStar);
        planet.simulatePlanet(n, isBeingDragged, activeDomainId, SYSTEM_TILT_X, CAMERA_DISTANCE, enableEffects, parentStar);
      });

      const isFar = isUniverseZoomedOut();
      nodes.forEach(n => {
        if (n.type !== 'unit') return;
        // 镜头拉远且无特定聚焦时，跳过隐藏卫星的高频动力学计算，极大提升渲染帧率
        if (isFar && !focusTarget && !forceFull && n.screenX !== 0) return;
        const isBeingDragged = draggedNode && (draggedNode === n || (draggedNode.type === 'domain' && n.parentId === draggedNode.id));
        const parentDomain = nodeMap.get(n.parentId);
        satellite.simulateSatellite(n, parentDomain, isBeingDragged, SYSTEM_TILT_X, CAMERA_DISTANCE, enableEffects);
      });
    }

    // 摄像机镜头平滑运镜中枢 (基于世界坐标解耦插值，消除屏幕矩阵滞后引起的弧形滑动)
    if (isAutoCameraActive && container) {
      const panLerp = 0.12;
      const drawerEl = document.getElementById('editor-drawer');
      const isDrawerOpen = drawerEl && drawerEl.classList.contains('open');
      const drawerW = isDrawerOpen ? (drawerEl.offsetWidth || 560) : 0;
      const { w: stageW, h: stageH } = getStageSize();
      const sideW = document.getElementById('sidebar-filter')?.clientWidth || 0;
      const headH = document.querySelector('header')?.clientHeight || 0;
      // 目标中心 = 未被左侧栏/顶部栏/右侧抽屉遮挡的可视区域中心
      const effectiveW = Math.max(stageW - sideW - drawerW, 300);
      const targetCenterX = sideW + effectiveW / 2;
      const targetCenterY = headH + (stageH - headH) / 2;

      let targetX = 0, targetY = 0;
      if (cameraTargetNode) {
        targetX = cameraTargetNode.screenX;
        targetY = cameraTargetNode.screenY;
      } else if (cameraTargetPos) {
        targetX = cameraTargetPos.x;
        targetY = cameraTargetPos.y;
      }

      // 从当前变换矩阵反解相机当前对准的世界坐标焦点，在世界坐标系下做绝对直线平滑逼近
      const curScale = transform.scale || 1.0;
      let curCamX = (targetCenterX - transform.x) / curScale;
      let curCamY = (targetCenterY - transform.y) / curScale;

      curCamX += (targetX - curCamX) * panLerp;
      curCamY += (targetY - curCamY) * panLerp;
      transform.scale += (cameraTargetScale - curScale) * panLerp;

      transform.x = targetCenterX - curCamX * transform.scale;
      transform.y = targetCenterY - curCamY * transform.scale;

      const scaleDist = Math.abs(cameraTargetScale - transform.scale);
      const worldDist = Math.hypot(targetX - curCamX, targetY - curCamY);

      if (scaleDist < 0.003 && worldDist < 0.8) {
        transform.scale = cameraTargetScale;
        transform.x = targetCenterX - targetX * cameraTargetScale;
        transform.y = targetCenterY - targetY * cameraTargetScale;
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

    const { w, h } = getStageSize();
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

      // 星系外围引力边界参考环 (俯视正圆，极淡微弱虚线环，纯净深邃)
      ctx.beginPath();
      ctx.arc(cx, cy, nebR * 0.95, 0, Math.PI * 2);
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

      // 镜头拉远时减少连线渲染，默认只保留恒星与行星之间的引力干线，大幅提升全宇宙帧率
      const isFar = isUniverseZoomedOut();
      const isSatelliteEdge = fromNode.type === 'unit' || toNode.type === 'unit';
      if (isFar && isSatelliteEdge) {
        const isFocusLink = focusTarget && (e.from === focusTarget.id || e.to === focusTarget.id || (focusRelatedIds.has(e.from) && focusRelatedIds.has(e.to)));
        if (!isFocusLink) return;
      }

      if (isTagFilterActive && (fromDimmed || toDimmed)) return;
      if (isSearchFilterActive && (fromDimmed || toDimmed)) return;

      if (isFocusActive) {
        const isFromActive = !fromDimmed || (hoveredNode && hoveredNode.id === fromNode.id);
        const isToActive = !toDimmed || (hoveredNode && hoveredNode.id === toNode.id);
        if (!isFromActive || !isToActive) return;

        // 需求 4：两端均在关联集合中，或者连向悬停节点，允许跨星系关联连线畅通无阻
        const isRelatedEdge = focusRelatedIds.has(e.from) && focusRelatedIds.has(e.to);
        const connectsToHover = hoveredNode && (e.from === hoveredNode.id || e.to === hoveredNode.id);
        if (!isRelatedEdge && !connectsToHover) return;
      }

      const isCrossGalaxy = fromNode.galaxyId && toNode.galaxyId && fromNode.galaxyId !== toNode.galaxyId;
      const isFocusLink = (focusTarget && (e.from === focusTarget.id || e.to === focusTarget.id || isCrossGalaxy)) ||
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

    // 1. 合批绘制普通层级连线 (聚焦恒星时本星系层级关系线整体提亮，直观呈现星系内全部关系)
    const isGalaxyFocus = Boolean(focusTarget && focusTarget.type === 'core');
    ctx.strokeStyle = isGalaxyFocus ? 'rgba(56, 189, 248, 0.30)' : 'rgba(51, 65, 85, 0.20)';
    ctx.lineWidth = isGalaxyFocus ? 1.2 : 1;
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

    const isFar = isUniverseZoomedOut();
    const visibleNodes = nodes.filter(n => {
      // 镜头拉远时减少星体展示，默认只显示恒星和行星，但聚焦时保留所有关联星体 (需求 4)
      if (isFar && n.type === 'unit') {
        const isFocusedOrRelated = focusTarget && (focusTarget.id === n.id || focusRelatedIds.has(n.id) || (focusTarget.type === 'domain' && n.parentId === focusTarget.id) || (focusTarget.type === 'core' && n.galaxyId === focusTarget.galaxyId));
        if (!isFocusedOrRelated) return false;
      }
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

    const isFar = isUniverseZoomedOut();
    for (const n of sorted) {
      if (isFar && n.type === 'unit') {
        const isFocusedOrRelated = focusTarget && (focusTarget.id === n.id || (focusTarget.type === 'domain' && n.parentId === focusTarget.id));
        if (!isFocusedOrRelated) continue;
      }
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

    const cw = getStageSize().w;
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

    // 取消选中焦点时，恢复宏观全宇宙全局星系并联动更新侧边栏与顶部导航
    window.QM.state.state.activeGalaxyId = null;
    window.QM.state.state.currentProject = 'all';
    window.QM.utils?.syncNavDropdown?.('galaxy-dd', 'all');

    if (shouldSyncSidebar) {
      window.QM.sidebar?.render?.();
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
   * 右下角当前选中天体 (行星/恒星) 间距控制器 UI 同步逻辑 (需求 1)
   */
  function updateSpacingControllerUI(targetNode) {
    const ctrl = document.getElementById('satellite-spacing-controller');
    const targetName = document.getElementById('spacing-target-name');
    const titleEl = document.getElementById('spacing-title');
    const tipEl = document.getElementById('spacing-tip');
    const slider = document.getElementById('spacing-slider');
    const valText = document.getElementById('spacing-val');
    const btnDec = document.getElementById('btn-spacing-dec');
    const btnInc = document.getElementById('btn-spacing-inc');
    const btnReset = document.getElementById('btn-spacing-reset');

    if (!ctrl || !targetNode) return;

    const isStar = targetNode.type === 'core';
    ctrl.classList.add('is-active');
    if (targetName) targetName.innerText = isStar ? `🌟 ${targetNode.name} 星系` : `【${targetNode.name}】`;
    if (titleEl) titleEl.innerText = isStar ? '🌟 星系间距控制' : '🪐 卫星间距控制';
    if (tipEl) tipEl.innerText = isStar
      ? '💡 选中恒星后，可整体扩展或聚拢该星系恒星、行星与卫星的环绕间距'
      : '💡 选中行星后，可在此自由扩展或聚拢各卫星的环绕间距';

    const currentSpacing = window.QM.state.getPlanetSpacing(targetNode.id) || targetNode.satelliteSpacingScale || 1.0;
    targetNode.satelliteSpacingScale = currentSpacing;
    if (slider) {
      slider.disabled = false;
      slider.value = currentSpacing;
    }
    if (valText) valText.innerText = currentSpacing.toFixed(2) + 'x';
    if (btnDec) btnDec.disabled = false;
    if (btnInc) btnInc.disabled = false;
    if (btnReset) btnReset.disabled = false;

    window.QM.state.setSelectedPlanet(targetNode);

    // 无论动效/静止模式，均启动动画循环让 lerp 平滑过渡卫星展开，循环在过渡完成后自动停止
    hasDomainExpanding = true;
    startGalaxyLoop();
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
    if (targetName) targetName.innerText = '未选中天体';
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
              parentStar.x || 0, parentStar.y || 0
            );
            draggedNode.x = (parentStar.x || 0) + solved.localX;
            draggedNode.y = (parentStar.y || 0) + solved.localY;
            draggedNode.z = 0;
            draggedNode.scale = 1;
            draggedNode.screenX = targetScreenX;
            draggedNode.screenY = targetScreenY;
            draggedNode.screenRadius = draggedNode.radius;

            nodes.forEach(other => {
              if (other.type === 'unit' && other.parentId === draggedNode.id) {
                const snap = dragSnapshotMap.get(other.id);
                if (snap) {
                  other.x = draggedNode.x + snap.relX;
                  other.y = draggedNode.y + snap.relY;
                  other.z = 0;
                  other.scale = 1;
                  other.screenX = other.x;
                  other.screenY = other.y;
                  other.screenRadius = other.radius;
                }
              }
            });
          } else if (draggedNode.type === 'unit') {
            const parent = draggedNode.parentId ? nodeMap.get(draggedNode.parentId) : null;
            if (parent) {
              const solved = satellite.solveSatelliteCoordsFromScreen(
                targetScreenX, targetScreenY,
                parent
              );

              draggedNode.x = parent.x + solved.mLocalX;
              draggedNode.y = parent.y + solved.mLocalY;
              draggedNode.z = 0;
              draggedNode.scale = 1;
              draggedNode.screenX = targetScreenX;
              draggedNode.screenY = targetScreenY;
              draggedNode.screenRadius = draggedNode.radius;
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
            // 核心修复：判定为单击，立即解除拖拽状态，防止后续 simulateCelestialSystem 误将当前行星及卫星判定为 isBeingDragged
            draggedNode = null;
            dragSnapshotMap.clear();

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

              // 若该行星所属星系与当前不同，同步切换星系状态并更新左侧3栏
              if (clicked.galaxyId && clicked.galaxyId !== window.QM.state.state.activeGalaxyId) {
                window.QM.state.state.activeGalaxyId = clicked.galaxyId;
                window.QM.state.state.currentProject = clicked.galaxyId;
                window.QM.utils?.syncNavDropdown?.('galaxy-dd', clicked.galaxyId);
                if (sidebar && typeof sidebar.render === 'function') {
                  sidebar.render();
                }
              }

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

              // 选中恒星：将当前星系与顶部下拉及左侧3栏深度联动
              const gId = clicked.galaxyId || 'all';
              window.QM.state.state.activeGalaxyId = gId === 'all' ? null : gId;
              window.QM.state.state.currentProject = gId;
              window.QM.utils?.syncNavDropdown?.('galaxy-dd', gId);
              if (sidebar && typeof sidebar.render === 'function') {
                sidebar.render();
              }
              if (sidebar && typeof sidebar.highlightCategory === 'function') {
                sidebar.highlightCategory('all', true);
              }
              // 选中恒星：激活星系间距调节器
              updateSpacingControllerUI(clicked);
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
          focusTarget = currentCardNode;
          updateFocusRelatedSet();
          cameraTargetNode = currentCardNode;
          cameraTargetPos = null;
          cameraTargetScale = currentCardNode.type === 'domain'
            ? getDomainCameraScale(currentCardNode.cardCount)
            : (currentCardNode.type === 'core' ? 0.78 : 1.35);
          isAutoCameraActive = true;
          hasDomainExpanding = true;
          startGalaxyLoop();
          if (currentCardNode.type === 'domain' || currentCardNode.type === 'core') {
            updateSpacingControllerUI(currentCardNode);
          } else {
            resetSpacingControllerUI();
          }
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
    getFocusedRelatedMemories,
    requestRender,
    startGalaxyLoop,
    stopGalaxyLoop
  };
})();

// 向下兼容旧调用
window.QM_GALAXY = window.QM.topology;
