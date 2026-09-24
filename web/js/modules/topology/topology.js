/**
 * Qoder Memory Visualizer - 3D 认知引力场拓扑主引擎 (Topology Engine)
 * 职责：星系总控协调器、透视投影坐标系统、摄像机运镜控制、交互事件总线与天体子系统调度
 */
window.QM = window.QM || {};

window.QM.topology = (function() {
  const SYSTEM_TILT_X = 0.44;     // 主俯仰倾角 (立体纵深感)
  const CAMERA_DISTANCE = 1100;    // 投影焦距

  let canvas, ctx, container;
  let nodes = [];
  let edges = [];
  let nodeMap = new Map();
  let hoveredNode = null;
  let draggedNode = null;
  let dragStartMouse = { x: 0, y: 0 };
  let grabOffsetX = 0;             // 抓取点相对天体球心的X偏移量 (消除抓取跳变)
  let grabOffsetY = 0;             // 抓取点相对天体球心的Y偏移量 (消除抓取跳变)
  const dragSnapshotMap = new Map();

  let focusTarget = null;
  let focusRelatedIds = new Set();
  let animationTime = 0;

  // 摄像机镜头平滑运镜中枢 (Camera Director)
  let cameraTargetNode = null;
  let cameraTargetScale = 1.0;
  let isAutoCameraActive = false;
  let initialScale = 1.0;

  function getDomainCameraScale(cardCount = 10) {
    return cardCount > 25 ? 0.95 : (cardCount > 12 ? 1.05 : 1.15);
  }

  const celestialStore = new Map();
  const transform = { x: 0, y: 0, scale: 1.0 };
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let clickOrigin = { x: 0, y: 0 };
  let isWheelInteracting = false;
  let wheelDebounceTimer = null;

  /**
   * 计算机体世界坐标视口可视范围包围盒 (Viewport Frustum Culling)
   */
  function getViewportBounds(padding = 80) {
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

    window.addEventListener('resize', () => {
      resizeCanvas();
      requestRender();
    });
    resizeCanvas();
    bindEvents();

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

  function fitGalaxyView() {
    if (!container || !nodes.length) return;
    const w = container.clientWidth || 1200;
    const h = container.clientHeight || 800;

    let maxDistX = 260;
    let maxDistY = 220;
    const cosTilt = Math.cos(SYSTEM_TILT_X);

    nodes.forEach(n => {
      if (n.type === 'domain' && n.celestial && n.celestial.semiMajor) {
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

    transform.scale = Math.max(0.50, Math.min(1.05, idealScale));
    initialScale = transform.scale;
    transform.x = w / 2;
    transform.y = h / 2;
    requestRender();
  }

  function buildGalaxyGraph() {
    nodes = [];
    edges = [];
    nodeMap.clear();

    const { memories, currentDirName } = window.QM.state.state;
    const { CATEGORY_MAP } = window.QM.constants;
    const star = window.QM.star;
    const planet = window.QM.planet;
    const satellite = window.QM.satellite;

    // 1. 全局意图核心恒星
    const coreNode = star.createStarNode(currentDirName);
    nodes.push(coreNode);
    nodeMap.set(coreNode.id, coreNode);

    // 2. 主题认知域行星统计与构建
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
    const numDomains = catList.length;
    const domainNodeMap = new Map();
    const tierCapacities = [6, 12, 18, 24, 30, 36, 42];

    const R_MIN = 240;
    const domainTiers = numDomains > 11 ? 4 : (numDomains > 6 ? 3 : (numDomains > 2 ? 2 : 1));
    const domainSpread = Math.min(180, Math.log2(Math.max(1, numDomains)) * 55);
    const cardSpread = Math.min(140, Math.sqrt(Math.max(0, totalCards)) * 10);
    const R_MAX = Math.min(680, Math.max(R_MIN + 220, R_MIN + domainSpread * 1.3 + cardSpread * 1.1));
    const tierBandWidth = (R_MAX - R_MIN) / Math.max(domainTiers, 1);

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
          pStore = planet.initPlanetCelestial(cat, idxInTier, tierCount, isStrongAffinity, dTier, domainTiers, tierBandWidth, R_MIN);
          celestialStore.set("domain-" + cat, pStore);
        }

        const domainNode = planet.createPlanetNode(cat, catCfg, cardCount, pStore);
        nodes.push(domainNode);
        nodeMap.set(domainNode.id, domainNode);
        domainNodeMap.set(cat, domainNode);

        edges.push({
          from: coreNode.id, to: domainNode.id,
          type: "hierarchy",
          isChain: false
        });
      });
    });

    // 3. 记忆切片知识卫星构建
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
          mStore = satellite.initSatelliteCelestial(m, mIdx, unitCount, parentOmega, tierCapacities);
          celestialStore.set(m.id, mStore);
        }

        const unitNode = satellite.createSatelliteNode(m, parentDomain, mStore);
        nodes.push(unitNode);
        nodeMap.set(unitNode.id, unitNode);

        edges.push({
          from: parentDomain.id, to: unitNode.id,
          type: "belongs_to",
          isChain: false
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
            type: "chain",
            isChain: true
          });
        }
      });
    });

    // 5. 隐式关键词共振网络 (构建倒排索引并设置上限，防止 N^2 边暴涨)
    const kwInvertedIndex = new Map();
    memories.forEach(m => {
      (m.keywords || []).forEach(k => {
        if (!k || k.length < 2) return;
        if (!kwInvertedIndex.has(k)) kwInvertedIndex.set(k, []);
        kwInvertedIndex.get(k).push(m.id);
      });
    });

    const candidatePairs = new Map();
    kwInvertedIndex.forEach(idList => {
      if (idList.length > 1 && idList.length <= 30) {
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
    validPairs.slice(0, 120).forEach(p => {
      edges.push({
        from: p.from, to: p.to,
        type: "shared_keywords",
        isChain: false
      });
    });

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
    simulateCelestialSystem();
    requestRender();
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
        if (node.id === 'core-root') return false;
        return true;
      } else if (focusTarget.type === 'unit') {
        if (node.id === focusTarget.parentId) return false;
        if (focusRelatedIds.has(node.id)) return false;
        return true;
      } else if (focusTarget.type === 'core') {
        if (node.type === 'domain') return false;
        return true;
      }
    }

    // 4. 分类过滤模式
    if (activeCategory && activeCategory !== 'all') {
      if (node.type === 'core') return false;
      if (node.type === 'domain' && node.categoryKey !== activeCategory) return true;
      if (node.type === 'unit' && node.rawItem && node.rawItem.category !== activeCategory) return true;
    }

    return false;
  }

  function simulateCelestialSystem() {
    const { enableEffects } = window.QM.state.state;
    if (enableEffects) {
      animationTime += 1;
    }

    const star = window.QM.star;
    const planet = window.QM.planet;
    const satellite = window.QM.satellite;

    const core = nodeMap.get("core-root");
    star?.simulateStar(core, enableEffects);

    let activeDomainId = null;
    if (focusTarget) {
      if (focusTarget.type === 'domain') activeDomainId = focusTarget.id;
      else if (focusTarget.type === 'unit' && focusTarget.parentId) activeDomainId = focusTarget.parentId;
    }

    // 检查是否有认知域正在进行扩散动画过渡
    let hasDomainExpanding = false;
    nodes.forEach(n => {
      if (n.type !== 'domain') return;
      const targetExp = (n.id === activeDomainId) ? 1.0 : 0.0;
      if (Math.abs(targetExp - (n.expansionProgress || 0)) > 0.01) {
        hasDomainExpanding = true;
      }
    });

    // 性能保护：在静态节能模式下，若无拖拽且天体扩散已收敛，运镜期间跳过全量天体的多余动力学与开普勒反解
    const shouldSimulateDynamics = enableEffects || Boolean(draggedNode) || hasDomainExpanding;
    if (shouldSimulateDynamics) {
      nodes.forEach(n => {
        if (n.type !== 'domain') return;
        const isBeingDragged = draggedNode && (draggedNode === n || (draggedNode.type === 'domain' && n.parentId === draggedNode.id));
        planet.simulatePlanet(n, isBeingDragged, activeDomainId, SYSTEM_TILT_X, CAMERA_DISTANCE, enableEffects);
      });

      nodes.forEach(n => {
        if (n.type !== 'unit') return;
        const isBeingDragged = draggedNode && (draggedNode === n || (draggedNode.type === 'domain' && n.parentId === draggedNode.id));
        const parentDomain = nodeMap.get(n.parentId) || core;
        satellite.simulateSatellite(n, parentDomain, isBeingDragged, SYSTEM_TILT_X, CAMERA_DISTANCE, enableEffects);
      });
    }

    if (isAutoCameraActive && container) {
      const panLerp = 0.12; // 优化运镜插值阻尼，过渡更加利落敏捷，缩减总过渡帧数
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

        if (Math.abs(transform.scale - cameraTargetScale) < 0.003 &&
            Math.abs(transform.x - desiredTransformX) < 0.8 &&
            Math.abs(transform.y - desiredTransformY) < 0.8) {
          transform.scale = cameraTargetScale;
          transform.x = desiredTransformX;
          transform.y = desiredTransformY;
          isAutoCameraActive = false;
        }
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

      // 若在静止节能模式下运镜结束，对齐扩散过渡值并完成最终帧对齐
      if (!enableEffects && !isAutoCameraActive) {
        nodes.forEach(n => {
          if (n.type === 'domain') {
            n.expansionProgress = (n.id === activeDomainId) ? 1.0 : 0.0;
            planet.simulatePlanet(n, false, activeDomainId, SYSTEM_TILT_X, CAMERA_DISTANCE, false);
          }
        });
        nodes.forEach(n => {
          if (n.type === 'unit') {
            const parentDomain = nodeMap.get(n.parentId) || core;
            satellite.simulateSatellite(n, parentDomain, false, SYSTEM_TILT_X, CAMERA_DISTANCE, false);
          }
        });
      }
    }
  }

  function drawGalaxy() {
    if (!ctx || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const bounds = getViewportBounds(80);
    const isTransitioning = isAutoCameraActive || isWheelInteracting || isDragging || Boolean(draggedNode);

    // 预计算节点置灰映射缓存，彻底消除边关系渲染中成千上万次重复函数评估
    const nodeDimmedMap = new Map();
    nodes.forEach(n => {
      nodeDimmedMap.set(n.id, isNodeDimmed(n));
    });

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    const core = nodeMap.get("core-root");
    drawDeepSpaceAndLighting(core, bounds);
    drawOrbits(bounds, nodeDimmedMap);
    drawEdges(bounds, nodeDimmedMap);
    drawCelestialBodies(bounds, nodeDimmedMap, isTransitioning);

    ctx.restore();

    drawNodeInfoOverlay();
  }

  function drawDeepSpaceAndLighting(core, bounds) {
    if (!core) return;
    ctx.save();

    // 1. 合批极速绘制星尘粒子 (视口内裁剪)
    ctx.beginPath();
    cognitiveSpaceDust.forEach(d => {
      if (bounds && (d.x < bounds.minX || d.x > bounds.maxX || d.y < bounds.minY || d.y > bounds.maxY)) return;
      ctx.moveTo(d.x + d.size, d.y);
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
    });
    const dustAlpha = 0.12 + Math.sin(animationTime * 0.02) * 0.05;
    ctx.fillStyle = `rgba(148, 163, 184, ${dustAlpha.toFixed(2)})`;
    ctx.fill();

    // 2. 恒星引力参考环 (去除超大径向渐变阴影，仅保留轻质科技虚线环)
    ctx.beginPath();
    ctx.ellipse(0, 0, 115, 115 * Math.cos(SYSTEM_TILT_X), 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  function drawOrbits(bounds, nodeDimmedMap) {
    nodes.forEach(n => {
      if (n.type !== 'domain' || !n.celestial) return;
      const c = n.celestial;
      const r = c.semiMajor;
      // 快速视口剔除：如果整个椭圆轨道都在视口外，直接跳过
      if (bounds) {
        if (bounds.minX > r || bounds.maxX < -r || bounds.minY > r || bounds.maxY < -r) return;
      }
      const isRelated = focusRelatedIds.has(n.id) || (focusTarget && focusTarget.id === n.id);
      const isDimmed = nodeDimmedMap ? Boolean(nodeDimmedMap.get(n.id)) : isNodeDimmed(n);
      window.QM.planet?.drawPlanetOrbit(ctx, n, isRelated, SYSTEM_TILT_X, isDimmed);
    });
  }

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

      // 视口快速 AABB 裁剪：如果连线两端点都在视口同一外侧，整条线必不可见，直接跳过
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

    // 1. 合批绘制普通层级连线 (一次性 Draw Call)
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.22)';
    ctx.lineWidth = 0.7;
    ctx.stroke(normalPath);

    // 2. 合批绘制高亮聚焦连线
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke(focusPath);

    // 3. 合批绘制关键词虚线共振连线
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 4]);
    ctx.stroke(kwFocusPath);
    ctx.setLineDash([]);

    // 4. 绘制显式知识链连线 (带能量粒子流动)
    chainEdgesList.forEach(({ fromNode, toNode, isFocusLink }) => {
      ctx.beginPath();
      ctx.moveTo(fromNode.screenX, fromNode.screenY);
      ctx.lineTo(toNode.screenX, toNode.screenY);
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
    });

    ctx.restore();
  }

  function drawCelestialBodies(bounds, nodeDimmedMap, isTransitioning) {
    const { activeTag, memories } = window.QM.state.state;
    const currentScale = transform.scale || 1.0;

    // 视口几何裁剪：快速筛选屏幕视野内可见节点，大幅减少全量深度排序与绘图调用
    const visibleNodes = nodes.filter(n => {
      if (!bounds) return true;
      const extraMargin = n.type === 'core' ? 140 : (n.type === 'domain' ? 50 : 25);
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

      let nodeAlpha = isDimmed ? 0.55 : 1.0;

      ctx.save();
      ctx.translate(n.screenX, n.screenY);
      ctx.globalAlpha = nodeAlpha;

      if (isCore) {
        star?.drawStar(ctx, n, animationTime, isDimmed);
      } else if (isDomain) {
        planet?.drawPlanet(ctx, n, isFocus, isHover, isRelated, isDimmed);
      } else if (isUnit) {
        const isDomainFocused = Boolean(focusTarget && focusTarget.type === 'domain' && focusTarget.id === n.parentId);
        satellite?.drawSatellite(ctx, n, isFocus, isHover, isRelated, activeTag, isTagHit, isDimmed, isDomainFocused);
      }

      ctx.restore();
    });
  }

  let animLoopId = null;
  let isRenderPending = false;

  function requestRender() {
    if (animLoopId) return; // 若正在跑 60fps 连续动画，无需重复按需排队
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
      // 满足特效开启条件，或运镜过渡期间自动维持平滑帧
      if (viewMode === 'galaxy' && (enableEffects || isAutoCameraActive)) {
        simulateCelestialSystem();
        drawGalaxy();
        animLoopId = requestAnimationFrame(loop);
      } else {
        animLoopId = null;
        if (viewMode === 'galaxy') {
          drawGalaxy();
        }
      }
    }
    animLoopId = requestAnimationFrame(loop);
  }

  function stopGalaxyLoop() {
    if (animLoopId) {
      cancelAnimationFrame(animLoopId);
      animLoopId = null;
    }
    requestRender();
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

    const state = window.QM.state.state;
    const constants = window.QM.constants;
    const { escapeHtml } = window.QM.utils;

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
        const allKeywords = Array.from(new Set(state.memories.flatMap(m => m.keywords || []))).slice(0, 8);
        tagsEl.innerHTML = allKeywords.map(k => `<span class="c-card-tag">${escapeHtml(k)}</span>`).join('');
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
      const catMemories = state.memories.filter(m => m.category === node.categoryKey);
      const catKeywords = Array.from(new Set(catMemories.flatMap(m => m.keywords || []))).slice(0, 8);
      if (descEl) descEl.innerText = `该主题汇聚 ${catMemories.length} 篇知识切片。点击「详细规约」可在侧边抽屉查阅包含的切片清单与场景。`;
      if (tagsEl) {
        tagsEl.innerHTML = catKeywords.map(k => `<span class="c-card-tag">${escapeHtml(k)}</span>`).join('');
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
      const catCfg = constants.CATEGORY_MAP[item.category];
      const catName = catCfg ? catCfg.name : (item.category || '知识切片');
      if (subEl) subEl.innerText = `${catName} · ${item.filename}`;
      if (descEl) descEl.innerText = item.description || "暂无特定触发场景描述，点击「查阅规约」查看 Markdown 详细内容。";
      if (tagsEl) {
        const kws = (item.keywords || []).slice(0, 8);
        tagsEl.innerHTML = kws.map(k => `<span class="c-card-tag">${escapeHtml(k)}</span>`).join('');
      }
      if (openBtn) openBtn.innerText = state.isEditMode ? "✏️ 编辑切片" : "📖 查阅规约";
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
    startGalaxyLoop();
    updateFocusRelatedSet();

    window.QM.drawer?.closeDrawer();
    hideCelestialCard();

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

    const domainNode = nodeMap.get('domain-' + catKey);
    if (!domainNode) {
      deselectFocus(false);
      return;
    }

    focusTarget = domainNode;
    updateFocusRelatedSet();

    cameraTargetNode = domainNode;
    cameraTargetScale = getDomainCameraScale(domainNode.cardCount);
    isAutoCameraActive = true;
    startGalaxyLoop();

    showCelestialCard(domainNode);

    const drawerEl = document.getElementById('editor-drawer');
    if (drawerEl && drawerEl.classList.contains('open')) {
      window.QM.drawer?.openDomainDrawer(domainNode);
    }
    requestRender();
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

        if (draggedNode.id !== "core-root") {
          if (draggedNode.type === 'domain') {
            const solved = planet.solvePlanetCoordsFromScreen(
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
            const solved = satellite.solveSatelliteCoordsFromScreen(
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
              if (clicked.rawItem && drawer) {
                drawer.openDrawer(clicked.rawItem.id);
              }
              if (sidebar && typeof sidebar.highlightCategory === 'function') {
                const cat = (clicked.rawItem && clicked.rawItem.category) || 'all';
                sidebar.highlightCategory(cat, true);
              }
            } else if (clicked.type === 'domain') {
              cameraTargetNode = clicked;
              cameraTargetScale = getDomainCameraScale(clicked.cardCount);
              isAutoCameraActive = true;
              startGalaxyLoop();
              if (drawer) drawer.openDomainDrawer(clicked);
              if (sidebar && typeof sidebar.highlightCategory === 'function') {
                sidebar.highlightCategory(clicked.categoryKey, true);
              }
            } else if (clicked.type === 'core') {
              cameraTargetNode = clicked;
              cameraTargetScale = 0.75;
              isAutoCameraActive = true;
              startGalaxyLoop();
              if (drawer) drawer.openCoreDrawer(clicked);
              if (sidebar && typeof sidebar.highlightCategory === 'function') {
                sidebar.highlightCategory('all', true);
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
                planet.recalculatePlanetOrbit(
                  draggedNode, finalDropPos.x, finalDropPos.y,
                  core ? core.radius : 34, SYSTEM_TILT_X, CAMERA_DISTANCE, childSats
                );
              } else if (draggedNode.type === 'unit') {
                const core = nodeMap.get("core-root");
                const parent = draggedNode.parentId ? (nodeMap.get(draggedNode.parentId) || core) : core;
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
        requestRender();
      }
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
      const drawer = window.QM.drawer;
      if (hit && drawer) {
        if (hit.type === 'core') drawer.openCoreDrawer(hit);
        else if (hit.type === 'domain') drawer.openDomainDrawer(hit);
        else if (hit.rawItem) drawer.openDrawer(hit.rawItem.id);
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
          const sidebar = window.QM.sidebar;
          if (currentCardNode.type !== 'unit') {
            cameraTargetNode = currentCardNode;
            isAutoCameraActive = true;
            startGalaxyLoop();
            if (currentCardNode.type === 'domain') {
              cameraTargetScale = getDomainCameraScale(currentCardNode.cardCount);
              if (sidebar && typeof sidebar.highlightCategory === 'function') {
                sidebar.highlightCategory(currentCardNode.categoryKey, true);
              }
            } else if (currentCardNode.type === 'core') {
              cameraTargetScale = 0.75;
              if (sidebar && typeof sidebar.highlightCategory === 'function') {
                sidebar.highlightCategory('all', true);
              }
            }
          } else {
            if (sidebar && typeof sidebar.highlightCategory === 'function') {
              const cat = (currentCardNode.rawItem && currentCardNode.rawItem.category) || 'all';
              sidebar.highlightCategory(cat, true);
            }
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

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      isAutoCameraActive = false;
      cameraTargetNode = null;

      // 激活高频缩放过渡态 (自动激活极速草稿渲染管线)
      isWheelInteracting = true;
      if (wheelDebounceTimer) clearTimeout(wheelDebounceTimer);
      wheelDebounceTimer = setTimeout(() => {
        isWheelInteracting = false;
        requestRender(); // 滚轮停顿后立即对齐完整细腻高清视效
      }, 140);

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(0.12, transform.scale * factor), 4.0);
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
    isAutoCameraActive = false;
    hideCelestialCard();
    requestRender();
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
    focusOnCategory,
    requestRender,
    startGalaxyLoop,
    stopGalaxyLoop
  };
})();

// 向下兼容旧调用
window.QM_GALAXY = window.QM.topology;
