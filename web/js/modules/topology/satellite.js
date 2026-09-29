/**
 * Qoder Memory Visualizer - 拟真卫星模块 (Realistic Satellite System)
 * 职责：记忆切片卫星天体的开普勒层级分布、平滑扩散、支持选中情况下动态卫星间距调节、微型天体光影渲染
 */
window.QM = window.QM || {};

window.QM.satellite = (function() {

  /**
   * 初始化卫星多级黄金分割层级开普勒轨道参数
   */
  function initSatelliteCelestial(m, mIdx, unitCount, parentOmega, tierCapacities) {
    const capacities = tierCapacities || [6, 12, 18, 24, 30, 36, 42];
    let temp = mIdx;
    let myTier = 0, myIndexInTier = 0, myTierCount = capacities[0];
    for (let t = 0; t < capacities.length; t++) {
      const cap = capacities[t];
      if (temp < cap) {
        myTier = t;
        myIndexInTier = temp;
        const tierStart = mIdx - temp;
        myTierCount = Math.min(cap, unitCount - tierStart);
        break;
      }
      temp -= cap;
      if (t === capacities.length - 1) {
        myTier = t;
        myIndexInTier = temp;
        myTierCount = cap;
      }
    }

    const baseR = 52 + Math.min(10, unitCount * 0.15);
    const tierStep = 34;
    const semiMajor = baseR + myTier * tierStep + (Math.random() * 3 - 1.5);
    const eccentricity = 0.015;
    const semiMinor = semiMajor * Math.sqrt(1 - eccentricity * eccentricity);
    const speedMultiplier = Math.max(1.15, 2.4 - myTier * 0.3) + Math.random() * 0.15;
    const omega = (parentOmega || 0.0006) * speedMultiplier;
    const inclination = (Math.random() - 0.5) * 0.08;

    const goldenOffset = myTier * (0.61803398875 * Math.PI * 2);
    const initialTheta = ((myIndexInTier / Math.max(myTierCount, 1)) * Math.PI * 2) + goldenOffset;

    return {
      semiMajor,
      semiMinor,
      eccentricity,
      omega,
      inclination,
      theta: initialTheta,
      tier: myTier
    };
  }

  /**
   * 构造记忆切片卫星节点
   */
  function createSatelliteNode(m, parentDomain, mStore) {
    return {
      id: m.id,
      name: m.name,
      filename: m.filename,
      type: "unit",
      parentId: parentDomain.id,
      galaxyId: parentDomain.galaxyId || 'global',
      projectId: m.projectId || parentDomain.galaxyId || 'global',
      radius: 14,
      x: 0, y: 0, z: 0,
      screenX: 0, screenY: 0, screenRadius: 14,
      scale: 1,
      color: "#94a3b8",
      border: "rgba(148, 163, 184, 0.4)",
      core: "#f1f5f9",
      parentColor: parentDomain.color || "#38bdf8",
      rawItem: m,
      celestial: mStore
    };
  }

  /**
   * 精确从相对于父行星的投影屏幕差量 (deltaWx, deltaWy) 反解卫星三维相对坐标
   */
  function solveSatelliteCoordsFromScreen(deltaWx, deltaWy, inclination, parentZ, SYSTEM_TILT_X, CAMERA_DISTANCE) {
    const tilt = SYSTEM_TILT_X + (inclination || 0);
    const cosTilt = Math.cos(tilt) || 1;
    const sinTilt = Math.sin(tilt);
    const camEff = CAMERA_DISTANCE - (parentZ || 0);

    const denom = cosTilt * CAMERA_DISTANCE + deltaWy * sinTilt;
    const deltaRotY = (deltaWy * camEff) / (denom || 1);
    const deltaZ = deltaRotY * sinTilt;
    const depthScale = CAMERA_DISTANCE / (CAMERA_DISTANCE - (parentZ || 0) - deltaZ);
    const deltaRotX = deltaWx / (depthScale || 1);

    return { deltaRotX, deltaRotY, deltaZ, depthScale, tilt, cosTilt, sinTilt };
  }

  /**
   * 卫星每帧动力学模拟：
   * 结合母行星的 expansionProgress 与 satelliteSpacingScale 动态控制卫星间距！
   */
  function simulateSatellite(node, parentNode, isBeingDragged, SYSTEM_TILT_X, CAMERA_DISTANCE, enableEffects = true) {
    if (!node || node.type !== 'unit' || !node.celestial) return;
    if (isBeingDragged) return;

    const c = node.celestial;
    const parent = parentNode || { x: 0, y: 0, z: 0, expansionProgress: 0, satelliteSpacingScale: 1.0 };
    const expansion = parent.expansionProgress || 0;
    const spacingScale = (parent.satelliteSpacingScale !== undefined) ? parent.satelliteSpacingScale : 1.0;

    // 选中状态下：间距倍率 spacingScale 深度作用于展开幅度
    const expansionMult = 1.0 + expansion * (0.48 * spacingScale + (spacingScale - 1.0) * 0.4);

    if (enableEffects) {
      c.theta = (c.theta + c.omega) % (Math.PI * 2);
    }
    const curMajor = c.semiMajor * expansionMult;
    const curMinor = c.semiMinor * expansionMult;
    const mLocalX = curMajor * Math.cos(c.theta);
    const mLocalY = curMinor * Math.sin(c.theta);
    const mTotalTilt = SYSTEM_TILT_X + (c.inclination || 0);

    node.x = parent.x + mLocalX;
    node.y = parent.y + mLocalY * Math.cos(mTotalTilt);
    node.z = parent.z + mLocalY * Math.sin(mTotalTilt);

    const depthScale = CAMERA_DISTANCE / (CAMERA_DISTANCE - node.z);
    node.scale = depthScale;
    node.screenX = node.x * depthScale;
    node.screenY = node.y * depthScale;
    node.screenRadius = node.radius * depthScale;
  }

  /**
   * 绘制记忆切片卫星本体及标题标签 (拟真微型星体，柔和微光)
   */
  function drawSatellite(ctx, node, isFocus, isHover, isRelated, activeTag, isTagHit, isDimmed = false, hasFocus = false) {
    const r = node.screenRadius;
    const isHighlightedTag = Boolean(activeTag && isTagHit);

    // 1. 焦点与悬停高亮柔和外光环
    if (isFocus || isHover) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = isFocus ? 'rgba(255, 255, 255, 0.7)' : 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = isFocus ? 1.5 : 1;
      ctx.stroke();
    }

    // 2. 拟真外圈淡淡光晕 (Ethereal Micro-Glow)
    const glowR = r * 1.35;
    const glowGrad = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, glowR);
    const basePColor = node.parentColor || '#38bdf8';
    if (isDimmed) {
      glowGrad.addColorStop(0, 'rgba(71, 85, 105, 0.15)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      glowGrad.addColorStop(0, basePColor + (isFocus ? '44' : '22'));
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // 3. 拟真微型球体表面 (消除平面纯色填充，采用立体漫反射渐变)
    const sphereGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0.5, 0, 0, r);
    if (isDimmed) {
      sphereGrad.addColorStop(0, '#64748b');
      sphereGrad.addColorStop(0.5, '#334155');
      sphereGrad.addColorStop(1, '#0f172a');
    } else {
      sphereGrad.addColorStop(0, '#ffffff');
      sphereGrad.addColorStop(0.25, node.core || '#f1f5f9');
      sphereGrad.addColorStop(0.65, node.parentColor || '#0284c7');
      sphereGrad.addColorStop(1, '#061a35');
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = sphereGrad;
    ctx.fill();

    // 4. 柔和边缘轮廓散射线 (消除粗糙硬边)
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = isFocus ? 'rgba(255, 255, 255, 0.65)' : (isDimmed ? 'rgba(148, 163, 184, 0.18)' : 'rgba(255, 255, 255, 0.35)');
    ctx.lineWidth = isFocus ? 1.2 : 0.6;
    ctx.stroke();

    // 5. 文字标题展示规则：
    const shouldShowText = !hasFocus || isFocus || isRelated || isHover || isHighlightedTag;
    if (shouldShowText) {
      const title = node.name || '';
      if (!title) return;

      ctx.save();
      ctx.textAlign = 'center';
      const textY = r + 13;

      let font = '10px sans-serif';
      let fillStyle = isDimmed ? '#94a3b8' : '#e2e8f0';
      let displayText = title;

      if (isHover || isFocus) {
        font = 'bold 11px sans-serif';
        fillStyle = '#38bdf8';
      } else if (isHighlightedTag) {
        font = 'bold 10.5px sans-serif';
        fillStyle = '#e879f9';
        displayText = `⚡ ${title}`;
      } else if (isRelated) {
        font = '10px sans-serif';
        fillStyle = '#cbd5e1';
      }

      ctx.font = font;
      ctx.fillStyle = fillStyle;
      ctx.fillText(displayText, 0, textY);
      ctx.restore();
    }
  }

  /**
   * 拖拽释放后自适应卫星轨道逆反解与重算
   */
  function recalculateSatelliteOrbit(node, parentNode, dropX, dropY, SYSTEM_TILT_X, CAMERA_DISTANCE) {
    if (!node || !node.celestial) return;
    const c = node.celestial;
    const parent = parentNode || { x: 0, y: 0, z: 0, screenX: 0, screenY: 0, radius: 26, expansionProgress: 0, satelliteSpacingScale: 1.0 };

    const deltaWx = dropX - parent.screenX;
    const deltaWy = dropY - parent.screenY;

    const solved = solveSatelliteCoordsFromScreen(deltaWx, deltaWy, c.inclination, parent.z, SYSTEM_TILT_X, CAMERA_DISTANCE);
    const localX = solved.deltaRotX;
    const localY = solved.deltaRotY;

    const ecc = c.eccentricity || 0.015;
    const oneMinusEcc2 = Math.max(0.01, 1 - ecc * ecc);

    const expansion = parent.expansionProgress || 0;
    const spacingScale = (parent.satelliteSpacingScale !== undefined) ? parent.satelliteSpacingScale : 1.0;
    const expansionMult = 1.0 + expansion * (0.48 * spacingScale + (spacingScale - 1.0) * 0.4);

    let newSemiMajor = (Math.sqrt(localX * localX + (localY * localY) / oneMinusEcc2)) / (expansionMult || 1);
    newSemiMajor = Math.max((parent.radius || 26) + 16, Math.min(480, newSemiMajor));
    const newSemiMinor = newSemiMajor * Math.sqrt(oneMinusEcc2);

    let newTheta = Math.atan2(localY / (newSemiMinor || 1), localX / (newSemiMajor || 1));
    if (newTheta < 0) newTheta += Math.PI * 2;

    const parentOmega = parent.celestial ? parent.celestial.omega : 0.0006;
    const speedMultiplier = Math.max(1.1, Math.min(5.0, 1.2 + 75 / newSemiMajor));
    const newOmega = parentOmega * speedMultiplier;

    c.semiMajor = newSemiMajor;
    c.semiMinor = newSemiMinor;
    c.theta = newTheta;
    c.omega = newOmega;

    node.x = parent.x + localX;
    node.y = parent.y + localY * solved.cosTilt;
    node.z = parent.z + solved.deltaZ;
    node.scale = solved.depthScale;
    node.screenX = dropX;
    node.screenY = dropY;
    node.screenRadius = node.radius * solved.depthScale;
  }

  return {
    initSatelliteCelestial,
    createSatelliteNode,
    solveSatelliteCoordsFromScreen,
    simulateSatellite,
    drawSatellite,
    recalculateSatelliteOrbit
  };
})();

// 向下兼容旧调用
window.QM_SATELLITE = window.QM.satellite;
