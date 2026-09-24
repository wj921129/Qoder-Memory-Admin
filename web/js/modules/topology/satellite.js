/**
 * Qoder Memory Visualizer - 卫星模块 (Unit Satellite System)
 * 职责：记忆切片卫星天体的开普勒层级分布、平滑扩散、3D透视闭式反解、全量标题渲染及0像素瞬移重算
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
   * 卫星每帧动力学模拟（受父行星扩散因子动态平滑舒展）
   */
  function simulateSatellite(node, parentNode, isBeingDragged, SYSTEM_TILT_X, CAMERA_DISTANCE, enableEffects = true) {
    if (!node || node.type !== 'unit' || !node.celestial) return;
    if (isBeingDragged) return;

    const c = node.celestial;
    const parent = parentNode || { x: 0, y: 0, z: 0, expansionProgress: 0 };
    const expansion = parent.expansionProgress || 0;
    const expansionMult = 1.0 + expansion * 0.48;

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
   * 绘制记忆切片卫星本体及标题标签 (视觉全面统一，彻底消除灰白与彩色混搭、去除阴影)
   */
  function drawSatellite(ctx, node, isFocus, isHover, isRelated, activeTag, isTagHit, isDimmed = false, isDomainFocused = false) {
    const r = node.screenRadius;
    const isHighlightedTag = Boolean(activeTag && isTagHit);
    const isImportant = isFocus || isHover || isHighlightedTag;

    // 1. 焦点与悬停高亮外环
    if (isFocus || isHover) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = isFocus ? '#ffffff' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 2. 视觉特效全量统一：一律使用所属认知域主题色 (node.parentColor)
    // 彻底根除“部分灰白水泥、部分粉红色”的撕裂感，全星系统一纯正科技天体质感
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = isDimmed ? 'rgba(71, 85, 105, 0.55)' : (node.parentColor || '#64748b');
    ctx.fill();

    // 统一边框轮廓线 (无阴影、干净利落)
    ctx.strokeStyle = isFocus ? '#ffffff' : (isDimmed ? 'rgba(148, 163, 184, 0.25)' : 'rgba(255, 255, 255, 0.4)');
    ctx.lineWidth = isFocus ? 2 : 1;
    ctx.stroke();

    // 3. 文字标题展示规则彻底统一：
    // ① 全景未聚焦时一律隐藏卫星文字，保持星系整体干净、不杂乱遮挡；
    // ② 仅当所属认知域被点击聚焦 (isDomainFocused)、或单个卫星被 hover/focus/tagHit 时统一展示；
    // ③ 去除昂贵的 CPU 描边阴影，采用纯净轻量 fillText。
    const shouldShowText = isImportant || isDomainFocused;
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
      } else if (isDomainFocused) {
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
    const parent = parentNode || { x: 0, y: 0, z: 0, screenX: 0, screenY: 0, radius: 26, expansionProgress: 0 };

    const deltaWx = dropX - parent.screenX;
    const deltaWy = dropY - parent.screenY;

    const solved = solveSatelliteCoordsFromScreen(deltaWx, deltaWy, c.inclination, parent.z, SYSTEM_TILT_X, CAMERA_DISTANCE);
    const localX = solved.deltaRotX;
    const localY = solved.deltaRotY;

    const ecc = c.eccentricity || 0.015;
    const oneMinusEcc2 = Math.max(0.01, 1 - ecc * ecc);

    const expansion = parent.expansionProgress || 0;
    const expansionMult = 1.0 + expansion * 0.48;

    let newSemiMajor = (Math.sqrt(localX * localX + (localY * localY) / oneMinusEcc2)) / (expansionMult || 1);
    newSemiMajor = Math.max((parent.radius || 26) + 16, Math.min(420, newSemiMajor));
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
