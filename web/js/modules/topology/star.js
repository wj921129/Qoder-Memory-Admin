/**
 * Qoder Memory Visualizer - 恒星模块 (Core Star System)
 * 职责：项目全局意图枢纽的几何属性、日冕耀斑、呼吸光晕与活跃微粒动力学模拟及渲染
 */
window.QM = window.QM || {};

window.QM.star = (function() {
  // 活跃微粒系统
  const semanticCoreParticles = [];
  for (let i = 0; i < 32; i++) {
    semanticCoreParticles.push({
      angle: Math.random() * Math.PI * 2,
      dist: 28 + Math.random() * 22,
      speed: 0.006 + Math.random() * 0.012,
      size: 1.2 + Math.random() * 1.8,
      alpha: 0.3 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2
    });
  }

  /**
   * 创建全局意图核心恒星节点
   */
  function createStarNode(dirName) {
    return {
      id: "core-root",
      name: dirName || "意图核心",
      type: "core",
      radius: 34,
      x: 0, y: 0, z: 0,
      screenX: 0, screenY: 0, screenRadius: 34,
      scale: 1,
      color: "#f59e0b",
      border: "#d97706",
      core: "#fef08a"
    };
  }

  /**
   * 恒星微粒动力学每帧更新
   */
  function simulateStar(coreNode, enableEffects = true) {
    if (!coreNode) return;
    coreNode.x = 0;
    coreNode.y = 0;
    coreNode.z = 0;
    coreNode.screenX = 0;
    coreNode.screenY = 0;
    coreNode.scale = 1;
    coreNode.screenRadius = coreNode.radius;

    if (!enableEffects) return;

    semanticCoreParticles.forEach(p => {
      p.angle = (p.angle + p.speed) % (Math.PI * 2);
      p.phase = (p.phase || 0) + 0.035;
      p.currentDist = p.dist + Math.sin(p.phase) * 6;
      p.currentAlpha = Math.max(0.15, Math.min(0.9, p.alpha + Math.sin(p.phase * 1.5) * 0.2));
    });
  }

  /**
   * 恒星本体、日冕耀斑与日核光辉渲染 (保留真实金黄核质感)
   */
  function drawStar(ctx, node, animationTime, isDimmed = false) {
    const r = node.screenRadius || node.radius;

    const flareR = r * 1.8;

    // 2. 旋转日冕耀斑射线 (6道轻量微光流)
    const rayRot = animationTime * 0.008;
    for (let rayIdx = 0; rayIdx < 6; rayIdx++) {
      const rayAngle = rayRot + (rayIdx * Math.PI / 3);
      const rayLen = flareR * (1.05 + Math.sin(animationTime * 0.08 + rayIdx) * 0.15);
      const rx = Math.cos(rayAngle) * rayLen;
      const ry = Math.sin(rayAngle) * rayLen;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(rx, ry);
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.15)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // 3. 恒星主球体日核质感渐变 (恢复原有金黄暖曜光彩)
    const coreBody = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 2, 0, 0, r);
    coreBody.addColorStop(0, '#ffffff');
    coreBody.addColorStop(0.3, '#fef08a');
    coreBody.addColorStop(0.65, '#f59e0b');
    coreBody.addColorStop(1, '#b45309');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = coreBody;
    ctx.fill();

    // 4. 环绕语义微粒流
    semanticCoreParticles.forEach(p => {
      const curDist = p.currentDist || p.dist;
      const px = Math.cos(p.angle) * (r + curDist * (r / 34));
      const py = Math.sin(p.angle) * (r + curDist * (r / 34));
      ctx.beginPath();
      ctx.arc(px, py, p.size * (r / 34), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(254, 240, 138, ${p.currentAlpha || p.alpha})`;
      ctx.fill();
    });

    // 5. 恒星文字标签
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(node.name, 0, r + 16);
  }

  return {
    createStarNode,
    simulateStar,
    drawStar
  };
})();

// 向下兼容旧调用
window.QM_STAR = window.QM.star;
