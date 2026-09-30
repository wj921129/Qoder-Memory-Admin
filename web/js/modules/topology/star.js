/**
 * Qoder Memory Visualizer - 拟真恒星模块 (Realistic Star System)
 * 职责：天文观测级拟真恒星光效渲染（多层柔和深空日冕光晕、光学衍射星芒、致密炽热日核、星系规模自适应）
 */
window.QM = window.QM || {};

window.QM.star = (function() {
  /**
   * 创建星系核心恒星节点 (支持多星系统自适应规模)
   */
  function createStarNode(galaxyMeta = {}, cx = 0, cy = 0) {
    const id = galaxyMeta.id ? `star-${galaxyMeta.id}` : 'core-root';
    const name = galaxyMeta.rawName || galaxyMeta.name || '意图核心';
    const cardCount = typeof galaxyMeta.count === 'number' ? galaxyMeta.count : (galaxyMeta.cardCount || 0);

    // 恒星半径依据星系规模自适应（小星系精巧 28px，特大星系壮丽 42px）
    const baseRadius = 28;
    const scaleBonus = Math.min(14, Math.sqrt(Math.max(0, cardCount)) * 1.8);
    const radius = Math.round(baseRadius + scaleBonus);

    return {
      id,
      galaxyId: galaxyMeta.id || 'global',
      name,
      shortName: galaxyMeta.shortName || galaxyMeta.id || 'core',
      type: "core",
      radius,
      cardCount,
      cx, cy,
      x: cx, y: cy, z: 0,
      screenX: cx, screenY: cy, screenRadius: radius,
      scale: 1,
      color: "#f59e0b",
      border: "#d97706",
      core: "#fef08a",
      glowColor: "rgba(254, 240, 138, 0.28)",
      coronaPhase: Math.random() * Math.PI * 2
    };
  }

  /**
   * 恒星微动态每帧更新 (平滑等离子体呼吸波)
   */
  function simulateStar(node, enableEffects = true) {
    if (!node) return;
    node.x = node.cx || 0;
    node.y = node.cy || 0;
    node.z = 0;
    node.scale = 1;
    node.screenX = node.x;
    node.screenY = node.y;
    node.screenRadius = node.radius;

    if (!enableEffects) return;
    node.coronaPhase = ((node.coronaPhase || 0) + 0.012) % (Math.PI * 2);
  }

  /**
   * 模拟天文望远镜观测恒星的真实特效：
   * 1. 消除原有的 6 条机械硬线与生硬塑料球；
   * 2. 多层柔和深空日冕辉光 (Deep Space Corona Falloff)；
   * 3. 真实光学衍射星芒 (Diffraction Spikes，极轻淡柔和，两头淡出)；
   * 4. 炽白至暖金等离子体日核，无硬线边框。
   */
  function drawStar(ctx, node, animationTime, isDimmed = false) {
    const r = node.screenRadius || node.radius;
    const phase = node.coronaPhase || (animationTime * 0.001);
    const breath = 1.0 + Math.sin(phase) * 0.035;

    // 1. 最外层宏观宇宙深空漫射光晕 (超柔和多重径向衰减，大幅扩展光芒辐射范围，模拟真实深空恒星辐射场)
    const outerHaloR = r * 4.5 * breath;
    const outerHalo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, outerHaloR);
    if (isDimmed) {
      outerHalo.addColorStop(0, 'rgba(254, 240, 138, 0.08)');
      outerHalo.addColorStop(0.35, 'rgba(245, 158, 11, 0.03)');
      outerHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      outerHalo.addColorStop(0, 'rgba(254, 240, 138, 0.30)');
      outerHalo.addColorStop(0.25, 'rgba(251, 191, 36, 0.18)');
      outerHalo.addColorStop(0.55, 'rgba(245, 158, 11, 0.07)');
      outerHalo.addColorStop(0.85, 'rgba(217, 119, 6, 0.02)');
      outerHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.beginPath();
    ctx.arc(0, 0, outerHaloR, 0, Math.PI * 2);
    ctx.fillStyle = outerHalo;
    ctx.fill();

    // 2. 近核高能日冕层 (Medium Corona)
    const midCoronaR = r * 1.85;
    const midCorona = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, midCoronaR);
    midCorona.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
    midCorona.addColorStop(0.3, 'rgba(254, 240, 138, 0.38)');
    midCorona.addColorStop(0.7, 'rgba(245, 158, 11, 0.14)');
    midCorona.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.beginPath();
    ctx.arc(0, 0, midCoronaR, 0, Math.PI * 2);
    ctx.fillStyle = midCorona;
    ctx.fill();

    // 3. 天文光学衍射微芒 (Diffraction Spikes - 4道极淡极细的望远镜十字星芒，极度柔和)
    if (!isDimmed) {
      const spikeRot = animationTime * 0.0015;
      const spikeLen = r * 3.6;
      const spikeWidth = 1.6;
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const angle = spikeRot + (i * Math.PI / 2);
        ctx.save();
        ctx.rotate(angle);
        const grad = ctx.createLinearGradient(-spikeLen, 0, spikeLen, 0);
        grad.addColorStop(0, 'rgba(254, 240, 138, 0)');
        grad.addColorStop(0.35, 'rgba(254, 240, 138, 0.08)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
        grad.addColorStop(0.65, 'rgba(254, 240, 138, 0.08)');
        grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-spikeLen, -spikeWidth / 2, spikeLen * 2, spikeWidth);
        ctx.restore();
      }
      ctx.restore();
    }

    // 4. 炽白高致密恒星本体核 (Plasma Sun Core - 纯白向暖黄自然漫射过渡，消除生硬边缘)
    const coreGrad = ctx.createRadialGradient(-r * 0.12, -r * 0.12, 1, 0, 0, r);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.25, '#fffbeb');
    coreGrad.addColorStop(0.55, '#fef08a');
    coreGrad.addColorStop(0.85, '#f59e0b');
    coreGrad.addColorStop(1, '#d97706');

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    // 5. 恒星文字标签与规模标识 (清晰、高级、直观体现规模)
    ctx.save();
    ctx.textAlign = 'center';

    // 星系名称
    ctx.font = 'bold 12.5px sans-serif';
    ctx.fillStyle = isDimmed ? '#94a3b8' : '#fef08a';
    ctx.fillText(node.name, 0, r + 16);

    // 星系规模徽章
    if (typeof node.cardCount === 'number') {
      ctx.font = '10px sans-serif';
      ctx.fillStyle = isDimmed ? '#64748b' : '#fcd34d';
      const labelText = node.cardCount > 0 ? `🌌 ${node.cardCount} 记忆切片` : `🌌 初始星系`;
      ctx.fillText(labelText, 0, r + 30);
    }
    ctx.restore();
  }

  return {
    createStarNode,
    simulateStar,
    drawStar
  };
})();

// 向下兼容旧调用
window.QM_STAR = window.QM.star;
