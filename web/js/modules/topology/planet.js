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
   * 从 2D 投影屏幕坐标反解轨道平面三维坐标（解析解）
   */
  function solvePlanetCoordsFromScreen(wx, wy, inclination, SYSTEM_TILT_X, CAMERA_DISTANCE) {
    const tilt = SYSTEM_TILT_X + (inclination || 0);
    const cosTilt = Math.cos(tilt) || 1;
    const sinTilt = Math.sin(tilt);
    const denom = cosTilt * CAMERA_DISTANCE + wy * sinTilt;
    const rotY = (wy * CAMERA_DISTANCE) / (denom || 1);
    const z = rotY * sinTilt;
    const depthScale = CAMERA_DISTANCE / (CAMERA_DISTANCE - z);
    const rotX = wx / depthScale;
    return { rotX, rotY, z, depthScale, tilt, cosTilt, sinTilt };
  }

  /**
   * 行星动力学模拟更新（每帧）- 围绕所属星系恒星中心公转
   */
  function simulatePlanet(node, isBeingDragged, activeDomainId, SYSTEM_TILT_X, CAMERA_DISTANCE, enableEffects = true, parentStar = null) {
    if (!node || node.type !== 'domain' || !node.celestial) return;

    // 动态平滑扩散系数过渡 (未选中 0.0，选中 1.0)
    const targetExpansion = (node.id === activeDomainId) ? 1.0 : 0.0;
    node.expansionProgress = (node.expansionProgress || 0) + (targetExpansion - (node.expansionProgress || 0)) * 0.08;

    // 记录星系中心恒星坐标
    const starX = parentStar ? parentStar.x : 0;
    const starY = parentStar ? parentStar.y : 0;
    node.starScreenX = parentStar ? parentStar.screenX : 0;
    node.starScreenY = parentStar ? parentStar.screenY : 0;

    // 拖拽期间动力学让路
    if (isBeingDragged) return;

    const c = node.celestial;
    if (enableEffects) {
      c.theta = (c.theta + c.omega) % (Math.PI * 2);
    }
    const localX = c.semiMajor * Math.cos(c.theta);
    const localY = c.semiMinor * Math.sin(c.theta);
    const totalTilt = SYSTEM_TILT_X + (c.inclination || 0);

    node.x = starX + localX;
    node.y = starY + localY * Math.cos(totalTilt);
    node.z = localY * Math.sin(totalTilt);

    const depthScale = CAMERA_DISTANCE / (CAMERA_DISTANCE - node.z);
    node.scale = depthScale;
    node.screenX = node.x * depthScale;
    node.screenY = node.y * depthScale;
    node.screenRadius = node.radius * depthScale;
  }

  /**
   * 绘制行星引力轨道 (精致微弱力场环)
   */
  function drawPlanetOrbit(ctx, node, isRelated, SYSTEM_TILT_X, isDimmed = false, parentStar = null) {
    if (!node || !node.celestial) return;
    const c = node.celestial;
    const cx = parentStar ? parentStar.x : 0;
    const cy = parentStar ? parentStar.y : 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, Math.cos(SYSTEM_TILT_X + (c.inclination || 0)));
    ctx.beginPath();
    ctx.ellipse(0, 0, c.semiMajor, c.semiMinor, 0, 0, Math.PI * 2);

    if (isRelated) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 0, c.semiMajor, c.semiMinor, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
    } else if (isDimmed) {
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.10)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    } else {
      const planetColor = node.color || '#38bdf8';
      ctx.strokeStyle = planetColor + '18';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 6]);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 绘制行星天体本体 (天文观测级拟真效果)：
   * 1. 消除生硬纯白高光与硬描边；
   * 2. 外圈增加淡淡的大气层漫射光芒 (Atmospheric Limb Glow)；
   * 3. 真实面向恒星的漫反射球体立体受光与深邃晨昏明暗线；
   * 4. 微妙的行星纹理带，更加接近真实星体。
   */
  function drawPlanet(ctx, node, isFocus, isHover, isRelated, isDimmed = false) {
    const r = node.screenRadius;

    // 1. 外圈淡淡的大气层漫射光芒 (Atmospheric Glow - 模拟天文望远镜观测真实行星时边缘的薄层气体辉光)
    const atmoGlowR = r * (isFocus ? 1.55 : (isHover ? 1.45 : 1.35));
    const atmoGrad = ctx.createRadialGradient(0, 0, r * 0.82, 0, 0, atmoGlowR);
    const pColor = node.color || '#38bdf8';
    const pCore = node.core || '#7dd3fc';

    if (isDimmed) {
      atmoGrad.addColorStop(0, 'rgba(71, 85, 105, 0.12)');
      atmoGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      const baseAlpha = isFocus ? '44' : (isHover ? '33' : '22');
      const outerAlpha = isFocus ? '18' : '08';
      atmoGrad.addColorStop(0, pCore + baseAlpha);
      atmoGrad.addColorStop(0.5, pColor + outerAlpha);
      atmoGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }

    ctx.beginPath();
    ctx.arc(0, 0, atmoGlowR, 0, Math.PI * 2);
    ctx.fillStyle = atmoGrad;
    ctx.fill();

    // 2. 焦点/悬停状态下的柔和引力波环 (极细柔光，消除粗硬白边)
    if (isFocus || isHover) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = isFocus ? 'rgba(255, 255, 255, 0.65)' : 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = isFocus ? 1.2 : 0.8;
      ctx.stroke();
    }

    // 3. 恒星入射光矢量 (球体受光面朝向星系恒星)
    const relX = (node.screenX || 0) - (node.starScreenX || 0);
    const relY = (node.screenY || 0) - (node.starScreenY || 0);
    const distToStar = Math.hypot(relX, relY) || 1;
    const lx = -relX / distToStar;
    const ly = -relY / distToStar;
    const hx = lx * r * 0.42;
    const hy = ly * r * 0.42;

    // 4. 行星真实表面球体渐变 (自然漫反射曲面受光 + 渐变至夜半球深空阴影)
    const sphereGrad = ctx.createRadialGradient(hx, hy, r * 0.08, 0, 0, r);
    if (isDimmed) {
      sphereGrad.addColorStop(0, '#64748b');
      sphereGrad.addColorStop(0.5, '#334155');
      sphereGrad.addColorStop(1, '#0f172a');
    } else {
      sphereGrad.addColorStop(0, node.core || '#bae6fd');
      sphereGrad.addColorStop(0.35, node.color || '#0284c7');
      sphereGrad.addColorStop(0.75, node.border || '#0369a1');
      sphereGrad.addColorStop(0.95, '#041021');
      sphereGrad.addColorStop(1, '#020617'); // 深邃夜面
    }

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = sphereGrad;
    ctx.fill();

    // 5. 微妙的大气边缘轮廓反光 (Limb Rim Light - 极微弱半透明散射，消除生硬实线描边)
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = isFocus 
      ? 'rgba(255, 255, 255, 0.55)' 
      : (isDimmed ? 'rgba(51, 65, 85, 0.3)' : (pColor + '30'));
    ctx.lineWidth = isFocus ? 1.0 : 0.6;
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
   * 拖拽释放后自适应开普勒轨道重算
   */
  function recalculatePlanetOrbit(node, dropX, dropY, coreRadius, SYSTEM_TILT_X, CAMERA_DISTANCE, childSatellites, parentStar = null) {
    if (!node || !node.celestial) return;
    const c = node.celestial;
    const starX = parentStar ? parentStar.screenX : 0;
    const starY = parentStar ? parentStar.screenY : 0;

    const relDropX = dropX - starX;
    const relDropY = dropY - starY;

    const solved = solvePlanetCoordsFromScreen(relDropX, relDropY, c.inclination, SYSTEM_TILT_X, CAMERA_DISTANCE);
    const localX = solved.rotX;
    const localY = solved.rotY;

    const ecc = c.eccentricity || 0.02;
    const oneMinusEcc2 = Math.max(0.01, 1 - ecc * ecc);

    let newSemiMajor = Math.sqrt(localX * localX + (localY * localY) / oneMinusEcc2);
    newSemiMajor = Math.max((coreRadius || 30) + 40, Math.min(800, newSemiMajor));
    const newSemiMinor = newSemiMajor * Math.sqrt(oneMinusEcc2);

    let newTheta = Math.atan2(localY / (newSemiMinor || 1), localX / (newSemiMajor || 1));
    if (newTheta < 0) newTheta += Math.PI * 2;

    const newOmega = (2.0 / Math.sqrt(Math.pow(newSemiMajor, 3))) * (0.95 + Math.random() * 0.1);

    c.semiMajor = newSemiMajor;
    c.semiMinor = newSemiMinor;
    c.theta = newTheta;
    c.omega = newOmega;

    const starWorldX = parentStar ? parentStar.x : 0;
    const starWorldY = parentStar ? parentStar.y : 0;
    node.x = starWorldX + localX;
    node.y = starWorldY + localY * solved.cosTilt;
    node.z = solved.z;
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
    recalculatePlanetOrbit
  };
})();

// 向下兼容旧调用
window.QM_PLANET = window.QM.planet;
