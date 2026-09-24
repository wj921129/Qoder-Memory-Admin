/**
 * Qoder Memory Visualizer - 行星模块 (Domain Planet System)
 * 职责：业务主题认知域天体的开普勒椭圆轨道动力学、大气层光晕、3D球体渲染、标签及拖拽重算
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
   * 构造行星节点数据结构
   */
  function createPlanetNode(cat, catCfg, cardCount, pStore) {
    return {
      id: "domain-" + cat,
      name: catCfg.name,
      categoryKey: cat,
      type: "domain",
      radius: 26,
      x: 0, y: 0, z: 0,
      screenX: 0, screenY: 0, screenRadius: 26,
      scale: 1,
      color: catCfg.color,
      border: catCfg.border,
      core: catCfg.core,
      cardCount,
      celestial: pStore,
      expansionProgress: 0
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
   * 行星动力学模拟更新（每帧）
   */
  function simulatePlanet(node, isBeingDragged, activeDomainId, SYSTEM_TILT_X, CAMERA_DISTANCE, enableEffects = true) {
    if (!node || node.type !== 'domain' || !node.celestial) return;

    // 动态平滑扩散系数过渡 (未选中 0.0，选中 1.0)
    const targetExpansion = (node.id === activeDomainId) ? 1.0 : 0.0;
    node.expansionProgress = (node.expansionProgress || 0) + (targetExpansion - (node.expansionProgress || 0)) * 0.08;

    // 拖拽期间动力学让路
    if (isBeingDragged) return;

    const c = node.celestial;
    if (enableEffects) {
      c.theta = (c.theta + c.omega) % (Math.PI * 2);
    }
    const localX = c.semiMajor * Math.cos(c.theta);
    const localY = c.semiMinor * Math.sin(c.theta);
    const totalTilt = SYSTEM_TILT_X + (c.inclination || 0);

    node.x = localX;
    node.y = localY * Math.cos(totalTilt);
    node.z = localY * Math.sin(totalTilt);

    const depthScale = CAMERA_DISTANCE / (CAMERA_DISTANCE - node.z);
    node.scale = depthScale;
    node.screenX = node.x * depthScale;
    node.screenY = node.y * depthScale;
    node.screenRadius = node.radius * depthScale;
  }

  /**
   * 绘制行星引力轨道 (精致科技天体力场设计)
   */
  function drawPlanetOrbit(ctx, node, isRelated, SYSTEM_TILT_X, isDimmed = false) {
    if (!node || !node.celestial) return;
    const c = node.celestial;
    ctx.save();
    ctx.scale(1, Math.cos(SYSTEM_TILT_X + (c.inclination || 0)));
    ctx.beginPath();
    ctx.ellipse(0, 0, c.semiMajor, c.semiMinor, 0, 0, Math.PI * 2);

    if (isRelated) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 3.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 0, c.semiMajor, c.semiMinor, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
    } else if (isDimmed) {
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.12)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    } else {
      const planetColor = node.color || '#38bdf8';
      ctx.strokeStyle = planetColor + '22';
      ctx.lineWidth = 1.0;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 绘制行星天体本体、大气散射层与文字信息 (保留真实主题色)
   */
  function drawPlanet(ctx, node, isFocus, isHover, isRelated, isDimmed = false) {
    const r = node.screenRadius;

    // 焦点 / 悬浮高亮外光环
    if (isFocus || isHover) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = isFocus ? '#ffffff' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 恒星向外投射的入射光向量 (球体立体受光阴影)
    const distToCore = Math.hypot(node.screenX, node.screenY) || 1;
    const lx = -node.screenX / distToCore;
    const ly = -node.screenY / distToCore;
    const hx = lx * r * 0.38;
    const hy = ly * r * 0.38;

    // 大气散射发光层 (Atmospheric Rayleigh Scattering)
    const atmoR = r * 1.25;
    const atmoGrad = ctx.createRadialGradient(0, 0, r * 0.85, 0, 0, atmoR);
    atmoGrad.addColorStop(0, node.color || '#0284c7');
    atmoGrad.addColorStop(0.5, isDimmed ? 'rgba(56, 189, 248, 0.10)' : 'rgba(56, 189, 248, 0.20)');
    atmoGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.beginPath();
    ctx.arc(0, 0, atmoR, 0, Math.PI * 2);
    ctx.fillStyle = atmoGrad;
    ctx.fill();

    // 行星表面 3D 拟真质感球体 (保留真实主题色彩)
    const sphereGrad = ctx.createRadialGradient(hx, hy, 1.5, 0, 0, r);
    sphereGrad.addColorStop(0, '#ffffff');
    sphereGrad.addColorStop(0.18, node.core || '#7dd3fc');
    sphereGrad.addColorStop(0.65, node.color || '#0284c7');
    sphereGrad.addColorStop(0.9, node.border || '#0369a1');
    sphereGrad.addColorStop(1, '#051329');

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = sphereGrad;
    ctx.fill();

    ctx.strokeStyle = isFocus ? '#ffffff' : (node.border || '#334155');
    ctx.lineWidth = isFocus ? 2 : 1;
    ctx.stroke();

    // 行星名称与包含切片计数文字
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;

    ctx.font = '600 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isDimmed ? '#e2e8f0' : '#f0f9ff';
    ctx.fillText(node.name, 0, r + 15);
    if (node.cardCount) {
      ctx.font = '9.5px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${node.cardCount} 记忆切片`, 0, r + 27);
    }
    ctx.restore();
  }

  /**
   * 拖拽释放后自适应开普勒轨道重算
   */
  function recalculatePlanetOrbit(node, dropX, dropY, coreRadius, SYSTEM_TILT_X, CAMERA_DISTANCE, childSatellites) {
    if (!node || !node.celestial) return;
    const c = node.celestial;

    const solved = solvePlanetCoordsFromScreen(dropX, dropY, c.inclination, SYSTEM_TILT_X, CAMERA_DISTANCE);
    const localX = solved.rotX;
    const localY = solved.rotY;

    const ecc = c.eccentricity || 0.02;
    const oneMinusEcc2 = Math.max(0.01, 1 - ecc * ecc);

    let newSemiMajor = Math.sqrt(localX * localX + (localY * localY) / oneMinusEcc2);
    newSemiMajor = Math.max((coreRadius || 34) + 40, Math.min(800, newSemiMajor));
    const newSemiMinor = newSemiMajor * Math.sqrt(oneMinusEcc2);

    let newTheta = Math.atan2(localY / (newSemiMinor || 1), localX / (newSemiMajor || 1));
    if (newTheta < 0) newTheta += Math.PI * 2;

    const newOmega = (2.0 / Math.sqrt(Math.pow(newSemiMajor, 3))) * (0.95 + Math.random() * 0.1);

    c.semiMajor = newSemiMajor;
    c.semiMinor = newSemiMinor;
    c.theta = newTheta;
    c.omega = newOmega;

    node.x = localX;
    node.y = localY * solved.cosTilt;
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
