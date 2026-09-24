/**
 * Qoder Memory Visualizer - 3D 认知引力场与星系拓扑引擎 (Galaxy Engine)
 * 职责：星系总控协调器、透视投影坐标系统、摄像机运镜控制、交互事件总线与子系统调度
 */
window.QM_GALAXY = (function() {
  const SYSTEM_TILT_X = 0.44;     // 主俯仰倾角 (立体纵深感)
  const CAMERA_DISTANCE = 1100;    // 投影焦距

  let canvas, ctx, container;
  let nodes = [];
  let edges = [];
  let nodeMap = new Map();
  let hoveredNode = null;
  let draggedNode = null;
  let dragStartMouse = { x: 0, y: 0 };
  let dragStartNodePos = { x: 0, y: 0 };
  let grabOffsetX = 0;             // 抓取点相对天体球心的X偏移量 (消除抓取跳变)
  let grabOffsetY = 0;             // 抓取点相对天体球心的Y偏移量 (消除抓取跳变)
  let dragDisplacement = { x: 0, y: 0 };
  const dragSnapshotMap = new Map();
  const rippleDampingList = [];

  let focusTarget = null;
  let focusRelatedIds = new Set();
  let focusProgress = 0;
  let animationTime = 0;

  // 摄像机镜头平滑运镜中枢 (Camera Director)
  let cameraTargetNode = null;
  let cameraTargetScale = 1.0;
  let isAutoCameraActive = false;
  let initialScale = 1.0;

  const celestialStore = new Map();
  const transform = { x: 0, y: 0, scale: 1.0 };
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let clickOrigin = { x: 0, y: 0 };

  // 空间背景微尘系统
  const cognitiveSpaceDust = [];
  for (let i = 0; i < 40; i++) {
    cognitiveSpaceDust.push({
      x: (Math.random() - 0.5) * 2600,
      y: (Math.random() - 0.5) * 2000,
      size: 0.7 + Math.random() * 1.4,
      baseAlpha: 0.15 + Math.random() * 0.35,
      twinkleSpeed: 0.015 + Math.random() * 0.03,
      twinklePhase: Math.random() * Math.PI * 2
    });
  }

  function init() {
    canvas = document.getElementById('galaxy-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    container = document.getElementById('galaxy-container');

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    bindEvents();
    requestAnimationFrame(galaxyLoop);
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

  function fitGalaxyView() {
    if (!container || !nodes.length) return;
    const w = container.clientWidth || 1200;
    const h = container.clientHeight || 800;

    // 分别统计星系在 X 轴与 Y 轴上的有效辐射半径 (计入俯仰角投影压缩)
    let maxDistX = 260;
    let maxDistY = 220;
    const cosTilt = Math.cos(SYSTEM_TILT_X); // 约 0.905

    nodes.forEach(n => {
      if (n.type === 'domain' && n.celestial && n.celestial.semiMajor) {
        // 行星主轨半长轴 + 卫星星团安全可视区
        const satSafeMargin = 95;
        const dX = n.celestial.semiMajor + satSafeMargin;
        const dY = (n.celestial.semiMinor || (n.celestial.semiMajor * 0.98)) * cosTilt + satSafeMargin * cosTilt;
        if (dX > maxDistX) maxDistX = dX;
        if (dY > maxDistY) maxDistY = dY;
      }
    });

    const paddingX = 80;
    const paddingY = 70;
    const fitSpanX = (maxDistX + paddingX) * 2;
    const fitSpanY = (maxDistY + paddingY) * 2;

    const scaleX = w / fitSpanX;
    const scaleY = h / fitSpanY;
    const idealScale = Math.min(scaleX, scaleY) * 0.96;

    // 严控初始视野比例：即使星体极多，缩放也不低于 0.50，保证初始画面饱满、星体和文字清晰可读，绝不拉远
    transform.scale = Math.max(0.50, Math.min(1.05, idealScale));
    initialScale = transform.scale;
    transform.x = w / 2;
    transform.y = h / 2;
  }

  function buildGalaxyGraph() {
    nodes = [];
    edges = [];
    nodeMap.clear();

    const { memories, currentDirName } = QM_STATE.state;
    const { CATEGORY_MAP } = QM_CONSTANTS;

    // 1. 全局意图核心恒星 (委托 QM_STAR 模块构建)
    const coreNode = QM_STAR.createStarNode(currentDirName);
    nodes.push(coreNode);
    nodeMap.set(coreNode.id, coreNode);

    // 2. 主题认知域行星统计与构建 (委托 QM_PLANET 模块构建)
    const categoriesFound = new Set();
    const catCountMap = new Map();
    memories.forEach(m => {
      if (m.category) {
        categoriesFound.add(m.category);
        catCountMap.set(m.category, (catCountMap.get(m.category) || 0) + 1);
      }
    });

    const catList = Array.from(categoriesFound);
    const totalCards = memories.length || 1;
    const maxCatCards = Math.max(...Array.from(catCountMap.values()), 0);
    const numDomains = catList.length;
    const domainNodeMap = new Map();

    // 智能天体多能级容量与紧凑型轨道约束
    const tierCapacities = [6, 12, 18, 24, 30, 36, 42];
    let maxSatTier = 0;
    if (maxCatCards > 0) {
      let rem = maxCatCards;
      for (let t = 0; t < tierCapacities.length; t++) {
        if (rem <= tierCapacities[t]) { maxSatTier = t; break; }
        rem -= tierCapacities[t];
        maxSatTier = t + 1;
      }
    }
    const maxSatRadius = 40 + Math.min(maxSatTier, 5) * 26;

    // 核心内径：既为太阳耀斑保留安全视觉空隙，又具备舒适呼吸空间
    const R_MIN = 240;

    // 轨道能级分布（根据域数量动态分级：1~2个域单环；3~6个域双环；7~11个域3环；12个以上4环）
    const domainTiers = numDomains > 11 ? 4 : (numDomains > 6 ? 3 : (numDomains > 2 ? 2 : 1));

    // 外轨半径平滑对数缓动：保证大项目有充裕的层距空间 (80~100px)，杜绝星体间紧凑拥挤
    const domainSpread = Math.min(180, Math.log2(Math.max(1, numDomains)) * 55);
    const cardSpread = Math.min(140, Math.sqrt(Math.max(0, totalCards)) * 10);
    const R_MAX = Math.min(680, Math.max(R_MIN + 220, R_MIN + domainSpread * 1.3 + cardSpread * 1.1));
    const tierBandWidth = (R_MAX - R_MIN) / Math.max(domainTiers, 1);

    // 核心修复：按能级将各主题域分组，确保同心环上 360 度四向对称均衡展开，杜绝同向聚集
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
        const isStrongAffinity = (cat === 'project_introduction' || cat === 'project_tech_stack' || (cardCount / totalCards) >= 0.22);

        let pStore = celestialStore.get("domain-" + cat);
        if (!pStore) {
          pStore = QM_PLANET.initPlanetCelestial(cat, idxInTier, tierCount, isStrongAffinity, dTier, domainTiers, tierBandWidth, R_MIN);
          celestialStore.set("domain-" + cat, pStore);
        }

        const domainNode = QM_PLANET.createPlanetNode(cat, catCfg, cardCount, pStore);
        nodes.push(domainNode);
        nodeMap.set(domainNode.id, domainNode);
        domainNodeMap.set(cat, domainNode);

        edges.push({
          from: coreNode.id, to: domainNode.id,
          type: "hierarchy", label: pStore.isContracted ? "核心引力" : "主题引力场",
          isChain: false
        });
      });
    });

    // 3. 记忆切片知识卫星构建 (委托 QM_SATELLITE 模块构建)
    const domainUnitsMap = new Map();
    memories.forEach(m => {
      const cat = m.category || 'other';
      if (!domainUnitsMap.has(cat)) domainUnitsMap.set(cat, []);
      domainUnitsMap.get(cat).push(m);
    });

    domainUnitsMap.forEach((mList, cat) => {
      const parentDomain = domainNodeMap.get(cat) || coreNode;
      const parentOmega = parentDomain.celestial ? parentDomain.celestial.omega : 0.0006;
      const unitCount = mList.length;

      mList.forEach((m, mIdx) => {
        let mStore = celestialStore.get(m.id);
        if (!mStore) {
          mStore = QM_SATELLITE.initSatelliteCelestial(m, mIdx, unitCount, parentOmega, tierCapacities);
          celestialStore.set(m.id, mStore);
        }

        const unitNode = QM_SATELLITE.createSatelliteNode(m, parentDomain, mStore);
        nodes.push(unitNode);
        nodeMap.set(unitNode.id, unitNode);

        edges.push({
          from: parentDomain.id, to: unitNode.id,
          type: "belongs_to", label: "归属纽带", isChain: false
        });
      });
    });

    // 4. 显式链式关系
    memories.forEach(m => {
      const targetIds = new Set(m.chains || []);
      const wikiMatches = (m.body || '').matchAll(/\[\[([^\]]+)\]\]/g);
      for (const wm of wikiMatches) targetIds.add(wm[1].trim().replace(/\.md$/, ''));

      const mdLinkMatches = (m.body || '').matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g);
      for (const mlm of mdLinkMatches) targetIds.add(mlm[2].trim().replace(/\.md$/, ''));

      targetIds.forEach(tId => {
        const targetItem = memories.find(item => item.id === tId || item.filename === (tId + '.md') || item.filename === tId);
        if (targetItem && targetItem.id !== m.id) {
          edges.push({
            from: m.id, to: targetItem.id,
            type: "chain", label: "链式衍生 ➔", isChain: true
          });
        }
      });
    });

    // 5. 隐式关键词共振网络
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const a = memories[i];
        const b = memories[j];
        const shared = (a.keywords || []).filter(k => (b.keywords || []).includes(k));
        if (shared.length >= 2) {
          edges.push({
            from: a.id, to: b.id,
            type: "shared_keywords", label: shared.slice(0, 2).join('·'), isChain: false
          });
        }
      }
    }

    // 6. 度中心度自适应尺寸
    const degreeMap = new Map();
    edges.forEach(e => {
      degreeMap.set(e.from, (degreeMap.get(e.from) || 0) + 1);
      degreeMap.set(e.to, (degreeMap.get(e.to) || 0) + 1);
    });

    let maxDomainDeg = 1, minDomainDeg = Infinity;
    let maxUnitDeg = 1, minUnitDeg = Infinity;
    nodes.forEach(n => {
      const deg = degreeMap.get(n.id) || 0;
      n.degree = deg;
      if (n.type === 'domain') {
        if (deg > maxDomainDeg) maxDomainDeg = deg;
        if (deg < minDomainDeg) minDomainDeg = deg;
      } else if (n.type === 'unit') {
        if (deg > maxUnitDeg) maxUnitDeg = deg;
        if (deg < minUnitDeg) minUnitDeg = deg;
      }
    });
    if (minDomainDeg === Infinity) minDomainDeg = 1;
    if (minUnitDeg === Infinity) minUnitDeg = 1;

    nodes.forEach(n => {
      if (n.type === 'domain') {
        const ratio = maxDomainDeg === minDomainDeg ? 0.4 : (n.degree - minDomainDeg) / (maxDomainDeg - minDomainDeg);
        n.radius = Math.round(22 + (38 - 22) * Math.sqrt(ratio));
        n.screenRadius = n.radius;
      } else if (n.type === 'unit') {
        const ratio = maxUnitDeg === minUnitDeg ? 0.3 : (n.degree - minUnitDeg) / (maxUnitDeg - minUnitDeg);
        n.radius = Math.round(10 + (20 - 10) * Math.sqrt(ratio));
        n.screenRadius = n.radius;
      }
    });

    updateFocusRelatedSet();
  }

  function updateFocusRelatedSet() {
    focusRelatedIds.clear();
    const hudText = document.getElementById('hud-text');
    const hudIndicator = document.getElementById('hud-indicator');

    if (!focusTarget) {
      if (hudText) hudText.innerText = "🌌 认知引力网络待命 · 全局拓扑就绪";
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
      nodes.forEach(n => { if (n.type === 'domain') focusRelatedIds.add(n.id); });
      if (hudText) hudText.innerText = `🎯 聚焦全局意图枢纽 · 激活全域认知引力场`;
    } else if (focusTarget.type === 'domain') {
      focusRelatedIds.add("core-root");
      // 满足要求 1：行星选中时，下属卫星均为激活成员
      nodes.forEach(n => { if (n.parentId === focusTarget.id) focusRelatedIds.add(n.id); });
      if (hudText) hudText.innerText = `📂 聚焦主题认知域：${focusTarget.name} · 激活星系拓扑`;
    } else {
      if (focusTarget.parentId) focusRelatedIds.add(focusTarget.parentId);
      if (hudText) hudText.innerText = `💡 聚焦记忆节点：${focusTarget.name} · 激活脉冲引力`;
    }

    if (hudIndicator) {
      hudIndicator.style.background = "#38bdf8";
      hudIndicator.style.boxShadow = "0 0 10px #38bdf8";
    }
  }

  /**
   * 统一精准判定星体是否处于“淡化状态”
   * 严格遵循规则：
   * 1. 鼠标悬停天体：永远不淡化 (交互即时反馈)
   * 2. 标签/搜索/分类过滤下：未命中即淡化
   * 3. 天体选中状态下：
   *    - ★★★ 核心要求 1：行星选中时，卫星不做淡化处理！★★★
   *    - ★★★ 核心要求 1：只有卫星选中时，才对无关联卫星做淡化处理！★★★
   * 4. 全局未选中且无过滤：不淡化
   */
  function isNodeDimmed(node) {
    if (!node) return false;
    // 鼠标悬停的天体永远保持高亮激活
    if (hoveredNode && hoveredNode.id === node.id) return false;

    const { activeTag, searchQuery, activeCategory, memories } = QM_STATE.state;

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

    // 3. 画布天体选中聚焦状态 (焦点驱动：优先级高于分类过滤，确保关联卫星与跨分类链条能正常显色)
    if (focusTarget) {
      // 自身被选中，绝对高亮
      if (node.id === focusTarget.id) return false;

      // ★★★ 核心要求 1：行星选中时，下属卫星均不做淡化处理！★★★
      if (focusTarget.type === 'domain') {
        // 同星系下属的所有卫星，不做淡化处理！
        if (node.type === 'unit' && node.parentId === focusTarget.id) {
          return false;
        }
        // 核心恒星作为全局母星保持显示
        if (node.id === 'core-root') return false;
        // 其他外星系淡化
        return true;
      } else if (focusTarget.type === 'unit') {
        // ★★★ 核心要求 1：只有卫星选中时，才对无关联卫星做淡化处理！★★★
        // 所属母行星保持可见基准
        if (node.id === focusTarget.parentId) return false;
        // 显式链式关系的关联切片保持高亮 (含跨分类关联)
        if (focusRelatedIds.has(node.id)) return false;
        // 同星系中无关联的卫星、以及外星系天体：淡化！
        return true;
      } else if (focusTarget.type === 'core') {
        if (node.type === 'domain') return false;
        return true;
      }
    }

    // 4. 分类过滤模式（未聚焦特定天体时的分类筛选）
    if (activeCategory && activeCategory !== 'all') {
      if (node.type === 'core') return false; // 恒星核心作为坐标原点常驻显示
      if (node.type === 'domain' && node.categoryKey !== activeCategory) return true;
      if (node.type === 'unit' && node.rawItem && node.rawItem.category !== activeCategory) return true;
    }

    // 全局漫游模式：默认不淡化
    return false;
  }

  function simulateCelestialSystem() {
    animationTime += 1;
    const targetProgress = focusTarget ? 1 : 0;
    focusProgress += (targetProgress - focusProgress) * 0.12;

    // 1. 恒星动力学更新 (委托 QM_STAR 模块)
    const core = nodeMap.get("core-root");
    QM_STAR.simulateStar(core);

    // 2. 识别当前聚焦的行星认知域，驱动卫星平滑舒展扩散
    let activeDomainId = null;
    if (focusTarget) {
      if (focusTarget.type === 'domain') activeDomainId = focusTarget.id;
      else if (focusTarget.type === 'unit' && focusTarget.parentId) activeDomainId = focusTarget.parentId;
    }

    // 3. 行星动力学模拟更新 (委托 QM_PLANET 模块)
    nodes.forEach(n => {
      if (n.type !== 'domain') return;
      const isBeingDragged = draggedNode && (draggedNode === n || (draggedNode.type === 'domain' && n.parentId === draggedNode.id));
      QM_PLANET.simulatePlanet(n, isBeingDragged, activeDomainId, SYSTEM_TILT_X, CAMERA_DISTANCE);
    });

    // 4. 卫星动力学模拟更新 (委托 QM_SATELLITE 模块)
    nodes.forEach(n => {
      if (n.type !== 'unit') return;
      const isBeingDragged = draggedNode && (draggedNode === n || (draggedNode.type === 'domain' && n.parentId === draggedNode.id));
      const parentDomain = nodeMap.get(n.parentId) || core;
      QM_SATELLITE.simulateSatellite(n, parentDomain, isBeingDragged, SYSTEM_TILT_X, CAMERA_DISTANCE);
    });

    // 5. 阻尼涟漪
    for (let i = rippleDampingList.length - 1; i >= 0; i--) {
      const item = rippleDampingList[i];
      item.offsetX *= 0.85;
      item.offsetY *= 0.85;
      item.node.x += item.offsetX * 0.15;
      item.node.y += item.offsetY * 0.15;
      if (Math.hypot(item.offsetX, item.offsetY) < 0.2) rippleDampingList.splice(i, 1);
    }

    // 6. 摄像机平滑运镜中枢 (仅恒星、行星可触发自动聚焦运镜；取消选中时平滑复位)
    if (isAutoCameraActive && container) {
      const panLerp = 0.08;
      if (cameraTargetNode) {
        const drawerEl = document.getElementById('editor-drawer');
        const isDrawerOpen = drawerEl && drawerEl.classList.contains('open');
        const drawerW = isDrawerOpen ? (drawerEl.offsetWidth || 560) : 0;
        const effectiveW = Math.max(container.clientWidth - drawerW, 300);
        const targetCenterX = effectiveW / 2;
        const targetCenterY = container.clientHeight / 2;

        transform.scale += (cameraTargetScale - transform.scale) * panLerp;
        const desiredTransformX = targetCenterX - cameraTargetNode.screenX * transform.scale;
        const desiredTransformY = targetCenterY - cameraTargetNode.screenY * transform.scale;

        transform.x += (desiredTransformX - transform.x) * panLerp;
        transform.y += (desiredTransformY - transform.y) * panLerp;
      } else {
        const targetCenterX = container.clientWidth / 2;
        const targetCenterY = container.clientHeight / 2;
        transform.scale += (cameraTargetScale - transform.scale) * panLerp;
        transform.x += (targetCenterX - transform.x) * panLerp;
        transform.y += (targetCenterY - transform.y) * panLerp;

        if (Math.abs(transform.scale - cameraTargetScale) < 0.003 &&
            Math.abs(transform.x - targetCenterX) < 0.8 &&
            Math.abs(transform.y - targetCenterY) < 0.8) {
          transform.scale = cameraTargetScale;
          transform.x = targetCenterX;
          transform.y = targetCenterY;
          isAutoCameraActive = false;
        }
      }
    }
  }

  function drawGalaxy() {
    if (!ctx || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    const core = nodeMap.get("core-root");
    drawDeepSpaceAndLighting(core);
    drawOrbits();
    drawEdges();
    drawCelestialBodies();

    ctx.restore();

    drawNodeInfoOverlay();
  }

  function drawDeepSpaceAndLighting(core) {
    if (!core) return;
    ctx.save();
    cognitiveSpaceDust.forEach(d => {
      const alpha = d.baseAlpha + Math.sin(animationTime * d.twinkleSpeed + d.twinklePhase) * 0.12;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(148, 163, 184, ${Math.max(0.04, alpha)})`;
      ctx.fill();
    });

    const haloR = 480;
    const coreHalo = ctx.createRadialGradient(0, 0, 20, 0, 0, haloR);
    coreHalo.addColorStop(0, 'rgba(245, 158, 11, 0.14)');
    coreHalo.addColorStop(0.35, 'rgba(56, 189, 248, 0.05)');
    coreHalo.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fillStyle = coreHalo;
    ctx.fill();

    // 太阳内圈引力边界光环 (Inner Gravitational Horizon)
    ctx.beginPath();
    ctx.ellipse(0, 0, 115, 115 * Math.cos(SYSTEM_TILT_X), 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  function drawOrbits() {
    nodes.forEach(n => {
      if (n.type !== 'domain') return;
      const isRelated = focusRelatedIds.has(n.id) || (focusTarget && focusTarget.id === n.id);
      const isDimmed = isNodeDimmed(n);
      QM_PLANET.drawPlanetOrbit(ctx, n, isRelated, SYSTEM_TILT_X, isDimmed);
    });
  }

  /**
   * 绘制连接纽带
   * 严格实现：
   * 1. 选中左侧标签后：颜色淡化的星体对应的连接关系一律不显示！
   * 2. 卫星被选中时：无关联卫星对应的连接关系一律不显示！
   * 3. 行星被选中时：该行星与其全体卫星的连接纽带完整呈现！
   */
  function drawEdges() {
    ctx.save();
    const { activeTag, searchQuery, activeCategory } = QM_STATE.state;
    const isTagFilterActive = Boolean(activeTag);
    const isSearchFilterActive = Boolean(searchQuery) || activeCategory !== 'all';
    const isFocusActive = Boolean(focusTarget);

    edges.forEach(e => {
      const fromNode = nodeMap.get(e.from);
      const toNode = nodeMap.get(e.to);
      if (!fromNode || !toNode) return;

      const fromDimmed = isNodeDimmed(fromNode);
      const toDimmed = isNodeDimmed(toNode);

      // ★★★ 核心要求：选中左侧标签后，颜色淡化的星体对应的连接关系不显示 ★★★
      if (isTagFilterActive) {
        if (fromDimmed || toDimmed) {
          return; // 只要有任一端是淡化星体，该连接关系绝对不显示！
        }
      }

      // 搜索与分类过滤下：只要任一端是淡化星体，连接关系不显示
      if (isSearchFilterActive) {
        if (fromDimmed || toDimmed) {
          return;
        }
      }

      // ★★★ 核心要求：天体选中聚焦状态下连线过滤 ★★★
      if (isFocusActive) {
        const isFromActive = !fromDimmed || (hoveredNode && hoveredNode.id === fromNode.id);
        const isToActive = !toDimmed || (hoveredNode && hoveredNode.id === toNode.id);

        if (!isFromActive || !isToActive) {
          // 任一端连接的是非选中的淡化星体，连接关系绝不显示！
          return;
        }

        // 行星选中时：属于该行星星系的连接线全部显示！
        if (focusTarget.type === 'domain') {
          const isBelongsToCurrentDomain = (e.from === focusTarget.id || e.to === focusTarget.id);
          const connectsToHover = hoveredNode && (e.from === hoveredNode.id || e.to === hoveredNode.id);
          if (!isBelongsToCurrentDomain && !connectsToHover) {
            return;
          }
        } else if (focusTarget.type === 'unit') {
          // 卫星选中时：仅显示与该选中切片直接相连的母星纽带或链式脉冲线！
          const connectsToFocus = (e.from === focusTarget.id || e.to === focusTarget.id);
          const connectsToHover = hoveredNode && (e.from === hoveredNode.id || e.to === hoveredNode.id);
          if (!connectsToFocus && !connectsToHover) {
            return;
          }
        }
      }

      const isChain = e.isChain;
      const isFocusLink = (focusTarget && (e.from === focusTarget.id || e.to === focusTarget.id)) ||
                          (hoveredNode && (e.from === hoveredNode.id || e.to === hoveredNode.id));

      ctx.beginPath();
      ctx.moveTo(fromNode.screenX, fromNode.screenY);
      ctx.lineTo(toNode.screenX, toNode.screenY);

      if (isChain) {
        ctx.strokeStyle = isFocusLink ? '#34d399' : 'rgba(16, 185, 129, 0.4)';
        ctx.lineWidth = isFocusLink ? 2.4 : 1.2;
        ctx.stroke();

        const pulseRatio = ((animationTime * 0.015) % 1);
        const px = fromNode.screenX + (toNode.screenX - fromNode.screenX) * pulseRatio;
        const py = fromNode.screenY + (toNode.screenY - fromNode.screenY) * pulseRatio;
        ctx.beginPath();
        ctx.arc(px, py, isFocusLink ? 3.5 : 2, 0, Math.PI * 2);
        ctx.fillStyle = '#34d399';
        ctx.fill();
      } else if (e.type === 'shared_keywords') {
        if (isFocusLink) {
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([3, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else {
        ctx.strokeStyle = isFocusLink ? 'rgba(56, 189, 248, 0.7)' : 'rgba(51, 65, 85, 0.22)';
        ctx.lineWidth = isFocusLink ? 1.5 : 0.7;
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  function drawCelestialBodies() {
    const { activeTag } = QM_STATE.state;
    const sorted = [...nodes].sort((a, b) => (a.z || 0) - (b.z || 0));

    sorted.forEach(n => {
      const isCore = n.type === 'core';
      const isDomain = n.type === 'domain';
      const isUnit = n.type === 'unit';
      const isFocus = focusTarget && focusTarget.id === n.id;
      const isHover = hoveredNode && hoveredNode.id === n.id;
      const isRelated = focusRelatedIds.has(n.id);
      const isDimmed = isNodeDimmed(n);

      let isTagHit = false;
      if (activeTag) {
        if (isUnit) isTagHit = n.rawItem ? (n.rawItem.keywords || []).includes(activeTag) : false;
        else if (isDomain) isTagHit = QM_STATE.state.memories.some(m => m.category === n.categoryKey && (m.keywords || []).includes(activeTag));
        else if (isCore) isTagHit = true;
      }

      // ★★★ 核心要求 2：调低透明度，不要过于透明，不透明度设为 0.55，清晰饱满且主次分明 ★★★
      let nodeAlpha = isDimmed ? 0.55 : 1.0;

      ctx.save();
      ctx.translate(n.screenX, n.screenY);
      ctx.globalAlpha = nodeAlpha;

      if (isCore) {
        QM_STAR.drawStar(ctx, n, animationTime, isDimmed);
      } else if (isDomain) {
        QM_PLANET.drawPlanet(ctx, n, isFocus, isHover, isRelated, isDimmed);
      } else if (isUnit) {
        QM_SATELLITE.drawSatellite(ctx, n, isFocus, isHover, isRelated, activeTag, isTagHit, isDimmed);
      }

      ctx.restore();
    });
  }

  function galaxyLoop() {
    if (QM_STATE.state.viewMode === 'galaxy') {
      simulateCelestialSystem();
      drawGalaxy();
    }
    requestAnimationFrame(galaxyLoop);
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - transform.x) / transform.scale,
      y: (sy - transform.y) / transform.scale
    };
  }

  function getNodeScreenPos(n) {
    return {
      x: transform.x + n.screenX * transform.scale,
      y: transform.y + n.screenY * transform.scale,
      r: Math.max(n.screenRadius * transform.scale, n.type === 'unit' ? 12 : 20)
    };
  }

  function getNodeAtScreen(sx, sy) {
    let bestNode = null;
    let minScore = Infinity;

    // 1. 物理屏幕圆形热区判定
    for (const n of nodes) {
      const sp = getNodeScreenPos(n);
      const dist = Math.hypot(sx - sp.x, sy - sp.y);
      const hitTol = n.type === 'unit' ? 10 : 14;
      const hitRadius = sp.r + hitTol;
      if (dist <= hitRadius) {
        const score = dist - (n.z || 0) * 0.05;
        if (score < minScore) {
          minScore = score;
          bestNode = n;
        }
      }
    }
    if (bestNode) return bestNode;

    // 2. 文字标签屏幕矩形热区判定
    for (const n of nodes) {
      const sp = getNodeScreenPos(n);
      const dx = sx - sp.x;
      const dy = sy - sp.y;
      const textCharWidth = n.name ? (n.name.length * 10) : 80;
      const baseLabelW = n.type === 'core' ? 140 : (n.type === 'domain' ? 120 : Math.min(160, Math.max(70, textCharWidth)));
      const labelW = baseLabelW * Math.max(0.7, Math.min(1.2, transform.scale));
      const labelTop = sp.r;
      const labelBottom = sp.r + 28;
      if (Math.abs(dx) <= labelW / 2 && dy >= labelTop && dy <= labelBottom) {
        return n;
      }
    }
    return null;
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

    if (node.type === 'core') {
      if (typeEl) typeEl.innerText = "全局意图枢纽";
      if (badgeDot) {
        badgeDot.style.background = "#f59e0b";
        badgeDot.style.boxShadow = "0 0 8px #f59e0b";
      }
      if (titleEl) titleEl.innerText = `🌟 ${node.name}`;
      if (subEl) subEl.innerText = "MEMORY.md · 核心认知引力源";
      if (descEl) descEl.innerText = "承载项目核心意图架构与全域认知引力中心，全域规约与知识切片均受其牵引。";
      if (tagsEl) {
        const { memories } = QM_STATE.state;
        const allKeywords = Array.from(new Set(memories.flatMap(m => m.keywords || []))).slice(0, 8);
        tagsEl.innerHTML = allKeywords.map(k => `<span class="c-card-tag">${QM_CONSTANTS.escapeHtml(k)}</span>`).join('');
      }
      if (openBtn) openBtn.innerText = "📋 查看索引";
    } else if (node.type === 'domain') {
      const color = node.color || "#38bdf8";
      if (typeEl) typeEl.innerText = "主题认知域";
      if (badgeDot) {
        badgeDot.style.background = color;
        badgeDot.style.boxShadow = `0 0 8px ${color}`;
      }
      if (titleEl) titleEl.innerText = `📂 ${node.name}`;
      if (subEl) subEl.innerText = `${node.categoryKey} · ${node.cardCount || 0} 篇切片`;
      const { memories } = QM_STATE.state;
      const catMemories = memories.filter(m => m.category === node.categoryKey);
      const catKeywords = Array.from(new Set(catMemories.flatMap(m => m.keywords || []))).slice(0, 8);
      if (descEl) descEl.innerText = `该主题汇聚 ${catMemories.length} 篇知识切片。点击「详细规约」可在侧边抽屉查阅包含的切片清单与场景。`;
      if (tagsEl) {
        tagsEl.innerHTML = catKeywords.map(k => `<span class="c-card-tag">${QM_CONSTANTS.escapeHtml(k)}</span>`).join('');
      }
      if (openBtn) openBtn.innerText = "📂 认知域详情";
    } else if (node.rawItem) {
      const item = node.rawItem;
      const color = node.parentColor || "#a78bfa";
      if (typeEl) typeEl.innerText = "记忆知识切片";
      if (badgeDot) {
        badgeDot.style.background = color;
        badgeDot.style.boxShadow = `0 0 8px ${color}`;
      }
      if (titleEl) titleEl.innerText = `💡 ${item.name}`;
      const catCfg = QM_CONSTANTS.CATEGORY_MAP[item.category];
      const catName = catCfg ? catCfg.name : (item.category || '知识切片');
      if (subEl) subEl.innerText = `${catName} · ${item.filename}`;
      if (descEl) descEl.innerText = item.description || "暂无特定触发场景描述，点击「查阅规约」查看 Markdown 详细内容。";
      if (tagsEl) {
        const kws = (item.keywords || []).slice(0, 8);
        tagsEl.innerHTML = kws.map(k => `<span class="c-card-tag">${QM_CONSTANTS.escapeHtml(k)}</span>`).join('');
      }
      if (openBtn) openBtn.innerText = QM_STATE.state.isEditMode ? "✏️ 编辑切片" : "📖 查阅规约";
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
    const boxW = Math.max(130, Math.min(240, target.name.length * 11 + 36));
    const boxH = 30;

    const cw = container.clientWidth;
    let bx = sp.x - boxW / 2;
    let by = sp.y - sp.r - 40;

    if (bx < 15) bx = 15;
    if (bx + boxW > cw - 15) bx = cw - boxW - 15;
    if (by < 15) by = sp.y + sp.r + 14;

    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 6);
    else ctx.rect(bx, by, boxW, boxH);
    ctx.fillStyle = 'rgba(10, 16, 30, 0.92)';
    ctx.fill();

    const colorTheme = target.type === 'core' ? '#f59e0b' : (target.color || target.parentColor || '#38bdf8');
    ctx.strokeStyle = colorTheme;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    let shortName = target.name;
    if (shortName.length > 17) shortName = shortName.slice(0, 16) + '…';
    ctx.fillText(shortName, bx + boxW / 2, by + 19);
    ctx.restore();
  }

  function deselectFocus(shouldSyncSidebar = true) {
    focusTarget = null;
    cameraTargetNode = null;
    cameraTargetScale = initialScale || 0.85;
    isAutoCameraActive = true;
    updateFocusRelatedSet();

    QM_DRAWER.closeDrawer();
    hideCelestialCard();
    const moreMenu = document.getElementById('more-menu');
    if (moreMenu) moreMenu.classList.remove('show');
    const indexModal = document.getElementById('index-modal');
    if (indexModal) indexModal.classList.add('hidden');

    if (shouldSyncSidebar && window.QM_CARDS && typeof window.QM_CARDS.highlightCategory === 'function') {
      window.QM_CARDS.highlightCategory('all', true);
    }
  }

  /**
   * 从外部（如左侧认知分类体系列表）触发天体选中聚焦与联动
   */
  function focusOnCategory(catKey) {
    if (!catKey || catKey === 'all') {
      deselectFocus(false);
      return;
    }

    const domainNode = nodeMap.get('domain-' + catKey);
    if (!domainNode) {
      deselectFocus(false);
      return;
    }

    focusTarget = domainNode;
    updateFocusRelatedSet();

    cameraTargetNode = domainNode;
    const unitCount = domainNode.cardCount || 10;
    cameraTargetScale = unitCount > 25 ? 0.95 : (unitCount > 12 ? 1.05 : 1.15);
    isAutoCameraActive = true;

    showCelestialCard(domainNode);

    const drawerEl = document.getElementById('editor-drawer');
    const isDrawerOpen = drawerEl && drawerEl.classList.contains('open');
    if (isDrawerOpen) {
      QM_DRAWER.openDomainDrawer(domainNode);
    }
  }

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
        dragStartMouse = worldPos;
        dragStartNodePos = { x: hit.x, y: hit.y, screenX: hit.screenX, screenY: hit.screenY };

        grabOffsetX = worldPos.x - hit.screenX;
        grabOffsetY = worldPos.y - hit.screenY;

        dragDisplacement = { x: 0, y: 0 };
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
        hoveredNode = hit;
        canvas.style.cursor = hit ? "pointer" : "grab";
      }

      if (draggedNode) {
        canvas.style.cursor = "grabbing";
        const dx = worldPos.x - dragStartMouse.x;
        const dy = worldPos.y - dragStartMouse.y;
        dragDisplacement = { x: dx, y: dy };

        const targetScreenX = worldPos.x - grabOffsetX;
        const targetScreenY = worldPos.y - grabOffsetY;

        if (draggedNode.id !== "core-root") {
          if (draggedNode.type === 'domain') {
            const solved = QM_PLANET.solvePlanetCoordsFromScreen(
              targetScreenX, targetScreenY,
              draggedNode.celestial ? draggedNode.celestial.inclination : 0,
              SYSTEM_TILT_X, CAMERA_DISTANCE
            );
            draggedNode.x = solved.rotX;
            draggedNode.y = solved.rotY * solved.cosTilt;
            draggedNode.z = solved.z;
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
                  const oDs = CAMERA_DISTANCE / (CAMERA_DISTANCE - other.z);
                  other.scale = oDs;
                  other.screenX = other.x * oDs;
                  other.screenY = other.y * oDs;
                  other.screenRadius = other.radius * oDs;
                }
              }
            });
          } else if (draggedNode.type === 'unit') {
            const core = nodeMap.get("core-root");
            const parent = draggedNode.parentId ? (nodeMap.get(draggedNode.parentId) || core) : core;
            const deltaWx = targetScreenX - parent.screenX;
            const deltaWy = targetScreenY - parent.screenY;
            const solved = QM_SATELLITE.solveSatelliteCoordsFromScreen(
              deltaWx, deltaWy,
              draggedNode.celestial ? draggedNode.celestial.inclination : 0,
              parent.z, SYSTEM_TILT_X, CAMERA_DISTANCE
            );

            draggedNode.x = parent.x + solved.deltaRotX;
            draggedNode.y = parent.y + solved.deltaRotY * solved.cosTilt;
            draggedNode.z = parent.z + solved.deltaZ;
            draggedNode.scale = solved.depthScale;
            draggedNode.screenX = targetScreenX;
            draggedNode.screenY = targetScreenY;
            draggedNode.screenRadius = draggedNode.radius * solved.depthScale;
          }
        }
      } else if (isDragging) {
        isAutoCameraActive = false;
        transform.x = e.clientX - dragStart.x;
        transform.y = e.clientY - dragStart.y;
      }
    });

    window.addEventListener('mouseup', e => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const worldPos = screenToWorld(sx, sy);
      const screenMoved = Math.hypot(e.clientX - clickOrigin.x, e.clientY - clickOrigin.y);

      if (draggedNode) {
        if (screenMoved < 6) {
          const clicked = draggedNode;
          focusTarget = clicked;
          updateFocusRelatedSet();

          // 核心要求：镜头拉近效果只让恒星、行星触发，卫星不触发！
          if (clicked.type === 'unit') {
            isAutoCameraActive = false;
            cameraTargetNode = null;
            if (clicked.rawItem) {
              QM_DRAWER.openDrawer(clicked.rawItem.id);
            }
            if (window.QM_CARDS && typeof window.QM_CARDS.highlightCategory === 'function') {
              const cat = (clicked.rawItem && clicked.rawItem.category) || 'all';
              window.QM_CARDS.highlightCategory(cat, true);
            }
          } else if (clicked.type === 'domain') {
            cameraTargetNode = clicked;
            const unitCount = clicked.cardCount || 10;
            cameraTargetScale = unitCount > 25 ? 0.95 : (unitCount > 12 ? 1.05 : 1.15);
            isAutoCameraActive = true;
            QM_DRAWER.openDomainDrawer(clicked);
            if (window.QM_CARDS && typeof window.QM_CARDS.highlightCategory === 'function') {
              window.QM_CARDS.highlightCategory(clicked.categoryKey, true);
            }
          } else if (clicked.type === 'core') {
            cameraTargetNode = clicked;
            cameraTargetScale = 0.75;
            isAutoCameraActive = true;
            QM_DRAWER.openCoreDrawer(clicked);
            if (window.QM_CARDS && typeof window.QM_CARDS.highlightCategory === 'function') {
              window.QM_CARDS.highlightCategory('all', true);
            }
          }

          showCelestialCard(clicked);
        } else {
          const finalDropPos = {
            x: worldPos.x - grabOffsetX,
            y: worldPos.y - grabOffsetY
          };
          if (draggedNode.id !== "core-root") {
            if (draggedNode.type === 'domain') {
              const childSats = nodes.filter(n => n.type === 'unit' && n.parentId === draggedNode.id);
              const core = nodeMap.get("core-root");
              QM_PLANET.recalculatePlanetOrbit(
                draggedNode, finalDropPos.x, finalDropPos.y,
                core ? core.radius : 34, SYSTEM_TILT_X, CAMERA_DISTANCE, childSats
              );
            } else if (draggedNode.type === 'unit') {
              const core = nodeMap.get("core-root");
              const parent = draggedNode.parentId ? (nodeMap.get(draggedNode.parentId) || core) : core;
              QM_SATELLITE.recalculateSatelliteOrbit(
                draggedNode, parent, finalDropPos.x, finalDropPos.y,
                SYSTEM_TILT_X, CAMERA_DISTANCE
              );
            }
          }
        }
        draggedNode = null;
        dragSnapshotMap.clear();
      } else {
        const hit = getNodeAtScreen(sx, sy);
        if (!hit && screenMoved < 6) {
          deselectFocus();
        }
      }
      isDragging = false;
    });

    canvas.addEventListener('click', e => {
      const screenMoved = Math.hypot(e.clientX - clickOrigin.x, e.clientY - clickOrigin.y);
      if (screenMoved >= 6) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const hit = getNodeAtScreen(sx, sy);
      if (!hit) {
        deselectFocus();
      }
    });

    canvas.addEventListener('dblclick', e => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const hit = getNodeAtScreen(sx, sy);
      if (hit) {
        if (hit.type === 'core') QM_DRAWER.openCoreDrawer(hit);
        else if (hit.type === 'domain') QM_DRAWER.openDomainDrawer(hit);
        else if (hit.rawItem) QM_DRAWER.openDrawer(hit.rawItem.id);
      }
    });

    const cardCloseBtn = document.getElementById('c-card-close');
    if (cardCloseBtn) cardCloseBtn.addEventListener('click', hideCelestialCard);

    const cardCenterBtn = document.getElementById('c-card-center-btn');
    if (cardCenterBtn) {
      cardCenterBtn.addEventListener('click', () => {
        if (currentCardNode) {
          focusTarget = currentCardNode;
          updateFocusRelatedSet();
          if (currentCardNode.type !== 'unit') {
            cameraTargetNode = currentCardNode;
            isAutoCameraActive = true;
            if (currentCardNode.type === 'domain') {
              const unitCount = currentCardNode.cardCount || 10;
              cameraTargetScale = unitCount > 25 ? 0.95 : (unitCount > 12 ? 1.05 : 1.15);
              if (window.QM_CARDS && typeof window.QM_CARDS.highlightCategory === 'function') {
                window.QM_CARDS.highlightCategory(currentCardNode.categoryKey, true);
              }
            } else if (currentCardNode.type === 'core') {
              cameraTargetScale = 0.75;
              if (window.QM_CARDS && typeof window.QM_CARDS.highlightCategory === 'function') {
                window.QM_CARDS.highlightCategory('all', true);
              }
            }
          } else {
            if (window.QM_CARDS && typeof window.QM_CARDS.highlightCategory === 'function') {
              const cat = (currentCardNode.rawItem && currentCardNode.rawItem.category) || 'all';
              window.QM_CARDS.highlightCategory(cat, true);
            }
          }
        }
      });
    }

    const cardOpenBtn = document.getElementById('c-card-open-btn');
    if (cardOpenBtn) {
      cardOpenBtn.addEventListener('click', () => {
        if (currentCardNode) {
          if (currentCardNode.type === 'core') QM_DRAWER.openCoreDrawer(currentCardNode);
          else if (currentCardNode.type === 'domain') QM_DRAWER.openDomainDrawer(currentCardNode);
          else if (currentCardNode.rawItem) QM_DRAWER.openDrawer(currentCardNode.rawItem.id);
        }
      });
    }

    // 滚轮缩放：以鼠标所在点为中心
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      isAutoCameraActive = false;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(0.12, transform.scale * factor), 4.0);
      if (newScale !== transform.scale) {
        transform.x = sx - (sx - transform.x) * (newScale / transform.scale);
        transform.y = sy - (sy - transform.y) * (newScale / transform.scale);
        transform.scale = newScale;
      }
    }, { passive: false });
  }

  function clearCelestialStore() {
    celestialStore.clear();
    focusTarget = null;
    focusRelatedIds.clear();
    focusProgress = 0;
    cameraTargetNode = null;
    isAutoCameraActive = false;
    hideCelestialCard();
  }

  return {
    init,
    resizeCanvas,
    fitGalaxyView,
    buildGalaxyGraph,
    updateFocusRelatedSet,
    clearCelestialStore,
    showCelestialCard,
    hideCelestialCard,
    deselectFocus,
    focusOnCategory
  };
})();
