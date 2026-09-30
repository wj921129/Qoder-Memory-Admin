/**
 * Qoder Memory Visualizer - 拟真行星模块 (Realistic Planet System)
 * 职责：开普勒椭圆轨道动力学、天文观测级拟真行星渲染（外圈淡淡大气辉光、受光漫射与晨昏明暗线、卫星间距调节支撑）
 */
window.QM = window.QM || {};

window.QM.planet = (function() {

  /**
   * 初始化或生成主题认知域行星的开普勒轨道初始参数
   */
  function initPlanetCelestial(cat, idxInTier, tierCount, isStrongAffinity, dTier, domainTiers, tierBandWidth, R_MIN) {
    const tierBaseR = R_MIN + dTier * tierBandWidth;
    let semiMajor;
    if (isStrongAffinity && dTier === 0) {
      semiMajor = tierBaseR + (Math.random() * 0.2) * tierBandWidth;
    } else {
      const intraTierOffset = (idxInTier % 2 === 0 ? 1 : -1) * (tierBandWidth * 0.12);
      semiMajor = tierBaseR + tierBandWidth * 0.40 + intraTierOffset + (Math.random() * 4 - 2);
    }

    const eccentricity = 0.015 + Math.random() * 0.015;
    const semiMinor = semiMajor * Math.sqrt(1 - eccentricity * eccentricity);
    const baseOmega = (2.0 / Math.sqrt(Math.pow(semiMajor, 3))) * (0.95 + Math.random() * 0.1);
    const inclination = (Math.random() - 0.5) * 0.08;

    const tierPhaseOffset = dTier * (Math.PI * 0.61803398875);
    const initialTheta = ((idxInTier / Math.max(tierCount, 1)) * Math.PI * 2) + tierPhaseOffset;

    return {
      semiMajor,
      semiMinor,
      eccentricity,
      omega: baseOmega,
      inclination,
      theta: initialTheta,
      isContracted: isStrongAffinity
    };
  }

  /**
   * 构造行星节点数据结构 (支持所属星系绑定与卫星间距控制)
   */
  function createPlanetNode(cat, catCfg, cardCount, pStore, galaxyId = 'global') {
    return {
      id: `domain-${galaxyId}-${cat}`,
      galaxyId,
      name: catCfg.name,
      categoryKey: cat,
      type: "domain",
      radius: 26,
      x: 0, y: 0, z: 0,
      screenX: 0, screenY: 0, screenRadius: 26,
      starScreenX: 0, starScreenY: 0,
      scale: 1,
      color: catCfg.color,
      border: catCfg.border,
      core: catCfg.core,
      cardCount,
      celestial: pStore,
      expansionProgress: 0,
      satelliteSpacingScale: 1.0 // 默认卫星间距倍率
    };
  }

  /**
   * 从 2D 投影屏幕坐标反解轨道平面三维坐标（闭式解析解）
   * 严格保障松手后下一帧正向透视投影坐标与 drop 坐标 100% 吻合，无跳跃
   */
  function solvePlanetCoordsFromScreen(dropX, dropY, starX = 0, starY = 0, starZ = 0, inclination = 0, SYSTEM_TILT_X = 0.52, CAMERA_DISTANCE = 1200) {
    const tilt = SYSTEM_TILT_X + (inclination || 0);
    const cosTilt = Math.cos(tilt) || 1;
    const sinTilt = Math.sin(tilt);
    const s = CAMERA_DISTANCE;

    // 解析几何解 localY
    const denom = s * cosTilt + dropY * sinTilt;
    const localY = (dropY * (s - starZ) - starY * s) / (denom || 1);
    const localZ = localY * sinTilt;
    const planetZ = starZ + localZ;
    const depthScale = s / Math.max(10, s - planetZ);
    const localX = dropX / depthScale - starX;

    return { localX, localY, localZ, planetZ, depthScale, tilt, cosTilt, sinTilt };
  }

  /**
   * 星系级整体间距倍率：由所属恒星的选中展开度与间距倍率共同驱动行星/卫星轨道扩张
   */
  function getGalaxySpacingMultiplier(starNode) {
    if (!starNode) return 1.0;
    const scale = (starNode.satelliteSpacingScale !== undefined) ? starNode.satelliteSpacingScale : 1.0;
    const expansion = starNode.expansionProgress || 0;
    return 1.0 + expansion * (0.48 * scale + (scale - 1.0) * 0.4);
  }

  /**
   * 行星动力学模拟更新（每帧）- 围绕所属星系恒星中心公转
   */
  function simulatePlanet(node, isBeingDragged, activeDomainId, SYSTEM_TILT_X, CAMERA_DISTANCE, enableEffects = true, parentStar = null) {
    if (!node || node.type !== 'domain' || !node.celestial) return;

    // 动态平滑扩散系数过渡 (未选中 0.0，选中 1.0)
    const targetExpansion = (node.id === activeDomainId) ? 1.0 : 0.0;
    node.expansionProgress = (node.expansionProgress || 0) + (targetExpansion - (node.expansionProgress || 0)) * 0.08;

    // 记录星系中心恒星世界及屏幕坐标
    const starX = parentStar ? (parentStar.x || 0) : 0;
    const starY = parentStar ? (parentStar.y || 0) : 0;
    const starZ = parentStar ? (parentStar.z || 0) : 0;
    node.starScreenX = parentStar ? parentStar.screenX : 0;
    node.starScreenY = parentStar ? parentStar.screenY : 0;

    // 拖拽期间动力学让路
    if (isBeingDragged) return;

    const c = node.celestial;
    if (enableEffects) {
      c.theta = (c.theta + c.omega) % (Math.PI * 2);
    }
    const galaxyMult = getGalaxySpacingMultiplier(parentStar);
    const localX = c.semiMajor * galaxyMult * Math.cos(c.theta);
    const localY = c.semiMinor * galaxyMult * Math.sin(c.theta);
    const totalTilt = SYSTEM_TILT_X + (c.inclination || 0);

    node.x = starX + localX;
    node.y = starY + localY * Math.cos(totalTilt);
    node.z = starZ + localY * Math.sin(totalTilt);

    const depthScale = CAMERA_DISTANCE / Math.max(10, CAMERA_DISTANCE - node.z);
    node.scale = depthScale;
    node.screenX = node.x * depthScale;
    node.screenY = node.y * depthScale;
    node.screenRadius = node.radius * depthScale;
  }

  /**
   * 绘制行星引力轨道 (淡雅空灵开普勒力场环，去除繁重杂乱)
   */
  function drawPlanetOrbit(ctx, node, isRelated, SYSTEM_TILT_X, isDimmed = false, parentStar = null) {
    if (!node || !node.celestial) return;
    const c = node.celestial;
    const cx = parentStar ? (parentStar.x || 0) : 0;
    const cy = parentStar ? (parentStar.y || 0) : 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, Math.cos(SYSTEM_TILT_X + (c.inclination || 0)));
    const galaxyMult = getGalaxySpacingMultiplier(parentStar);
    ctx.beginPath();
    ctx.ellipse(0, 0, c.semiMajor * galaxyMult, c.semiMinor * galaxyMult, 0, 0, Math.PI * 2);

    if (isRelated) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
    } else if (isDimmed) {
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.02)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 6]);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 将 Hex 或 RGB 色值安全转换为带精确 alpha 的 rgba(...)
   */
  function hexToRgba(color, alpha = 1) {
    if (!color) return `rgba(56, 189, 248, ${alpha})`;
    if (color.startsWith('rgba')) {
      return color.replace(/[\d\.]+\)$/g, `${alpha})`);
    }
    if (color.startsWith('rgb')) {
      return color.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    }
    let c = color.replace('#', '');
    if (c.length === 3) {
      c = c.split('').map(x => x + x).join('');
    }
    const num = parseInt(c.slice(0, 6), 16);
    if (isNaN(num)) return `rgba(56, 189, 248, ${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * 绘制行星天体本体：
   * 模拟天文望远镜观测真实行星效果，四周呈现清晰饱满、向深空自然柔和漫射的外圈星体光芒
   */
  function drawPlanet(ctx, node, isFocus, isHover, isRelated, isDimmed = false) {
    const r = node.screenRadius;
    const pColor = node.color || '#38bdf8';
    const pCore = node.core || '#bae6fd';

    // 1. 最外层广域柔和漫射光晕 (Outer Atmospheric Halo)
    // 模拟真实发光星体向四周深空散发的宏观辐射场，大幅扩展光芒辐射范围
    const outerHaloR = r * (isFocus ? 3.4 : (isHover ? 3.1 : 2.8));
    const outerGrad = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, outerHaloR);
    if (isDimmed) {
      outerGrad.addColorStop(0, 'rgba(71, 85, 105, 0.20)');
      outerGrad.addColorStop(0.5, 'rgba(51, 65, 85, 0.08)');
      outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      const a1 = isFocus ? 0.45 : (isHover ? 0.38 : 0.30);
      const a2 = isFocus ? 0.22 : (isHover ? 0.16 : 0.12);
      const a3 = isFocus ? 0.08 : (isHover ? 0.05 : 0.03);
      outerGrad.addColorStop(0, hexToRgba(pColor, a1));
      outerGrad.addColorStop(0.4, hexToRgba(pColor, a2));
      outerGrad.addColorStop(0.75, hexToRgba(pColor, a3));
      outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.beginPath();
    ctx.arc(0, 0, outerHaloR, 0, Math.PI * 2);
    ctx.fillStyle = outerGrad;
    ctx.fill();

    // 2. 近核致密大气发光层 (Dense Atmospheric Limb Radiance)
    // 紧贴行星表面边缘，散发浓郁饱满的行星本色大气层高光辉光，还原望远镜观测真实星体质感
    const rimHaloR = r * (isFocus ? 1.55 : (isHover ? 1.45 : 1.38));
    const rimGrad = ctx.createRadialGradient(0, 0, r * 0.65, 0, 0, rimHaloR);
    if (isDimmed) {
      rimGrad.addColorStop(0, 'rgba(148, 163, 184, 0.35)');
      rimGrad.addColorStop(0.6, 'rgba(71, 85, 105, 0.15)');
      rimGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      const rA1 = isFocus ? 0.85 : (isHover ? 0.72 : 0.60);
      const rA2 = isFocus ? 0.50 : (isHover ? 0.40 : 0.30);
      const rA3 = isFocus ? 0.18 : (isHover ? 0.12 : 0.08);
      rimGrad.addColorStop(0, hexToRgba(pCore, rA1));
      rimGrad.addColorStop(0.45, hexToRgba(pColor, rA2));
      rimGrad.addColorStop(0.8, hexToRgba(pColor, rA3));
      rimGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.beginPath();
    ctx.arc(0, 0, rimHaloR, 0, Math.PI * 2);
    ctx.fillStyle = rimGrad;
    ctx.fill();

    // 3. 焦点/悬停状态下的高亮微光外环
    if (isFocus || isHover) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = isFocus ? 'rgba(255, 255, 255, 0.85)' : hexToRgba(pColor, 0.7);
      ctx.lineWidth = isFocus ? 1.5 : 1.0;
      ctx.stroke();
    }

    // 4. 行星球体自然本色渐变 (干净高级的星体质感)
    const sphereGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
    if (isDimmed) {
      sphereGrad.addColorStop(0, '#64748b');
      sphereGrad.addColorStop(1, '#334155');
    } else {
      sphereGrad.addColorStop(0, pCore);
      sphereGrad.addColorStop(0.65, pColor);
      sphereGrad.addColorStop(1, node.border || pColor);
    }

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = sphereGrad;
    ctx.fill();

    // 5. 边缘纤细柔和微轮廓 (Limb Rim Specular)
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = isFocus 
      ? 'rgba(255, 255, 255, 0.75)' 
      : (isDimmed ? 'rgba(51, 65, 85, 0.3)' : hexToRgba(pCore, 0.55));
    ctx.lineWidth = isFocus ? 1.2 : 0.8;
    ctx.stroke();

    // 6. 行星名称与切片计数文字
    ctx.save();
    ctx.font = '600 11.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isDimmed ? '#94a3b8' : '#f0f9ff';
    ctx.fillText(node.name, 0, r + 14);
    if (node.cardCount) {
      ctx.font = '9px sans-serif';
      ctx.fillStyle = isDimmed ? '#64748b' : '#7dd3fc';
      ctx.fillText(`${node.cardCount} 记忆切片`, 0, r + 25);
    }
    ctx.restore();
  }

  /**
   * 拖拽释放后自适应开普勒轨道重算 (闭式严格数学逆解，消除截断限制与松手跳变)
   */
  function recalculatePlanetOrbit(node, dropX, dropY, coreRadius, SYSTEM_TILT_X, CAMERA_DISTANCE, childSatellites, parentStar = null) {
    if (!node || !node.celestial) return;
    const c = node.celestial;
    const starX = parentStar ? (parentStar.x || 0) : 0;
    const starY = parentStar ? (parentStar.y || 0) : 0;
    const starZ = parentStar ? (parentStar.z || 0) : 0;

    const solved = solvePlanetCoordsFromScreen(
      dropX, dropY,
      starX, starY, starZ,
      c.inclination, SYSTEM_TILT_X, CAMERA_DISTANCE
    );
    const galaxyMult = getGalaxySpacingMultiplier(parentStar);
    const localX = solved.localX / (galaxyMult || 1);
    const localY = solved.localY / (galaxyMult || 1);

    const ecc = c.eccentricity || 0.02;
    const oneMinusEcc2 = Math.max(0.01, 1 - ecc * ecc);

    // 解除人为半长轴上限限制，仅保留非负安全保护，支持自由排布
    let newSemiMajor = Math.sqrt(localX * localX + (localY * localY) / oneMinusEcc2);
    newSemiMajor = Math.max(15, newSemiMajor);
    const newSemiMinor = newSemiMajor * Math.sqrt(oneMinusEcc2);

    let newTheta = Math.atan2(localY / (newSemiMinor || 1), localX / (newSemiMajor || 1));
    if (newTheta < 0) newTheta += Math.PI * 2;

    const newOmega = (2.0 / Math.sqrt(Math.pow(newSemiMajor, 3))) * (0.95 + Math.random() * 0.1);

    c.semiMajor = newSemiMajor;
    c.semiMinor = newSemiMinor;
    c.theta = newTheta;
    c.omega = newOmega;

    node.x = starX + solved.localX;
    node.y = starY + solved.localY * solved.cosTilt;
    node.z = solved.planetZ;
    node.scale = solved.depthScale;
    node.screenX = dropX;
    node.screenY = dropY;
    node.screenRadius = node.radius * solved.depthScale;

    if (childSatellites && childSatellites.length) {
      childSatellites.forEach(other => {
        if (other.celestial) {
          const uC = other.celestial;
          const tier = uC.tier || 0;
          const speedMultiplier = Math.max(1.3, 3.2 - tier * 0.45);
          uC.omega = newOmega * speedMultiplier;
        }
      });
    }
  }

  return {
    initPlanetCelestial,
    createPlanetNode,
    solvePlanetCoordsFromScreen,
    simulatePlanet,
    drawPlanetOrbit,
    drawPlanet,
    recalculatePlanetOrbit,
    getGalaxySpacingMultiplier
  };
})();

// 向下兼容旧调用
window.QM_PLANET = window.QM.planet;
