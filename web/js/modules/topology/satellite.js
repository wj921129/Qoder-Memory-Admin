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
   * 精确从 2D 投影屏幕坐标反解卫星在母行星坐标系下的三维相对开普勒坐标 (闭式解析解)
   * 严格保障松手后下一帧正向透视投影坐标与 drop 坐标 100% 吻合，0 位移跳跃
   */
  function solveSatelliteCoordsFromScreen(dropX, dropY, parentNode, inclination = 0, SYSTEM_TILT_X = 0.52, CAMERA_DISTANCE = 1200) {
    const parent = parentNode || { x: 0, y: 0, z: 0 };
    const tilt = SYSTEM_TILT_X + (inclination || 0);
    const cosTilt = Math.cos(tilt) || 1;
    const sinTilt = Math.sin(tilt);
    const s = CAMERA_DISTANCE;

    const denom = s * cosTilt + dropY * sinTilt;
    const mLocalY = (dropY * (s - (parent.z || 0)) - (parent.y || 0) * s) / (denom || 1);
    const satZ = (parent.z || 0) + mLocalY * sinTilt;
    const depthScale = s / Math.max(10, s - satZ);
    const mLocalX = dropX / depthScale - (parent.x || 0);

    return { mLocalX, mLocalY, satZ, depthScale, tilt, cosTilt, sinTilt };
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

    const depthScale = CAMERA_DISTANCE / Math.max(10, CAMERA_DISTANCE - node.z);
    node.scale = depthScale;
    node.screenX = node.x * depthScale;
    node.screenY = node.y * depthScale;
    node.screenRadius = node.radius * depthScale;
  }

  /**
   * 绘制记忆切片卫星本体及标题标签：
   * 去除复杂 ui 特效（微光、复杂球体暗面渐变），保持简单颜色圆点，清爽明了
   */
  function drawSatellite(ctx, node, isFocus, isHover, isRelated, activeTag, isTagHit, isDimmed = false, hasFocus = false) {
    const r = node.screenRadius;
    const isHighlightedTag = Boolean(activeTag && isTagHit);
    const pColor = node.parentColor || '#38bdf8';

    // 1. 焦点与悬停高亮纤细外环
    if (isFocus || isHover) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = isFocus ? '#ffffff' : pColor;
      ctx.lineWidth = isFocus ? 1.2 : 0.8;
      ctx.stroke();
    }

    // 2. 卫星本体：简单颜色小圆点，干净纯粹
    let fillColor = pColor;
    if (isDimmed) {
      fillColor = '#475569';
    } else if (isHighlightedTag) {
      fillColor = '#e879f9';
    } else if (isFocus) {
      fillColor = '#f0f9ff';
    }

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();

    // 3. 文字标题展示规则
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
   * 拖拽释放后自适应卫星轨道逆反解与重算 (闭式精确数学逆解，彻底去掉拖拽限制与跳变)
   */
  function recalculateSatelliteOrbit(node, parentNode, dropX, dropY, SYSTEM_TILT_X, CAMERA_DISTANCE) {
    if (!node || !node.celestial) return;
    const c = node.celestial;
    const parent = parentNode || { x: 0, y: 0, z: 0, screenX: 0, screenY: 0, radius: 26, expansionProgress: 0, satelliteSpacingScale: 1.0 };

    const solved = solveSatelliteCoordsFromScreen(
      dropX, dropY,
      parent,
      c.inclination,
      SYSTEM_TILT_X,
      CAMERA_DISTANCE
    );
    const mLocalX = solved.mLocalX;
    const mLocalY = solved.mLocalY;

    const ecc = c.eccentricity || 0.015;
    const oneMinusEcc2 = Math.max(0.01, 1 - ecc * ecc);

    const expansion = parent.expansionProgress || 0;
    const spacingScale = (parent.satelliteSpacingScale !== undefined) ? parent.satelliteSpacingScale : 1.0;
    const expansionMult = 1.0 + expansion * (0.48 * spacingScale + (spacingScale - 1.0) * 0.4);

    const localX = mLocalX / (expansionMult || 1);
    const localY = mLocalY / (expansionMult || 1);

    // 解除人为半长轴上限限制，仅保留非负安全保护，支持自由排布
    let newSemiMajor = Math.sqrt(localX * localX + (localY * localY) / oneMinusEcc2);
    newSemiMajor = Math.max(10, newSemiMajor);
    const newSemiMinor = newSemiMajor * Math.sqrt(oneMinusEcc2);

    let newTheta = Math.atan2(localY / (newSemiMinor || 1), localX / (newSemiMajor || 1));
    if (newTheta < 0) newTheta += Math.PI * 2;

    const parentOmega = parent.celestial ? parent.celestial.omega : 0.0006;
    const speedMultiplier = Math.max(1.1, Math.min(4.0, 1.2 + 60 / newSemiMajor));
    const newOmega = parentOmega * speedMultiplier;

    c.semiMajor = newSemiMajor;
    c.semiMinor = newSemiMinor;
    c.theta = newTheta;
    c.omega = newOmega;

    node.x = parent.x + mLocalX;
    node.y = parent.y + mLocalY * solved.cosTilt;
    node.z = solved.satZ;
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
