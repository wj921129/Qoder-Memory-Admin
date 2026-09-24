/**
 * Qoder Memory Visualizer - 基础业务常量与元数据字典 (Constants)
 */
window.QM = window.QM || {};

window.QM.constants = (function() {
  // 认知分类色彩与层级映射字典
  const CATEGORY_MAP = {
    common_pitfalls_experience: { name: "常见工程避坑", color: "#f43f5e", border: "#e11d48", core: "#fda4af" },
    important_decision_experience: { name: "重大决策经验", color: "#f97316", border: "#ea580c", core: "#fdba74" },
    development_code_specification: { name: "开发与代码规约", color: "#0ea5e9", border: "#0284c7", core: "#7dd3fc" },
    development_practice_specification: { name: "工程实践规约", color: "#3b82f6", border: "#2563eb", core: "#93c5fd" },
    development_comment_specification: { name: "代码与注释规约", color: "#14b8a6", border: "#0d9488", core: "#5eead4" },
    project_architecture: { name: "系统与模块架构", color: "#6366f1", border: "#4f46e5", core: "#a5b4fc" },
    project_tech_stack: { name: "项目技术栈", color: "#8b5cf6", border: "#7c3aed", core: "#c4b5fd" },
    project_introduction: { name: "系统与业务概述", color: "#10b981", border: "#059669", core: "#6ee7b7" },
    project_build_configuration: { name: "编译构建配置", color: "#f59e0b", border: "#d97706", core: "#fde68a" },
    project_dependency_configuration: { name: "依赖管理配置", color: "#eab308", border: "#ca8a04", core: "#fef08a" },
    learned_skill_experience: { name: "工作流与技能经验", color: "#a855f7", border: "#9333ea", core: "#d8b4fe" },
    task_summary_experience: { name: "任务交付复盘", color: "#22c55e", border: "#16a34a", core: "#86efac" },
    tool_experience: { name: "工具与环境经验", color: "#06b6d4", border: "#0891b2", core: "#67e8f9" },
    user_behavior: { name: "用户习惯与偏好", color: "#ec4899", border: "#db2777", core: "#f472b6" },
    user_communication: { name: "交互与沟通习惯", color: "#f43f5e", border: "#be123c", core: "#fb7185" },
    common: { name: "通用工程规约", color: "#64748b", border: "#475569", core: "#94a3b8" }
  };

  // Qoder 官方四大元数据类型 (user / feedback / project / reference)
  const TYPE_MAP = {
    project: { name: "工程架构与规约 (project)", color: "#0ea5e9", icon: "🏛️", badgeClass: "type-project" },
    feedback: { name: "踩坑反馈与修正 (feedback)", color: "#f43f5e", icon: "⚠️", badgeClass: "type-feedback" },
    user: { name: "用户习惯与偏好 (user)", color: "#ec4899", icon: "👤", badgeClass: "type-user" },
    reference: { name: "外部规范与参考 (reference)", color: "#8b5cf6", icon: "📖", badgeClass: "type-reference" }
  };

  // 项目元信息字典
  const PROJECT_META = {
    global: { name: "🌐 全局研发智库 (Qoder CN 通用规范)", icon: "🌐", shortName: "global" },
    "fmmpay-busi": { name: "⚡ fmmpay-busi (国际卡收单核心服务)", icon: "⚡", shortName: "fmmpay-busi" },
    "fmmpay-dev": { name: "🚀 fmmpay-dev (国际卡开发工程与业务库)", icon: "🚀", shortName: "fmmpay-dev" },
    "gpay-gateb": { name: "🛡️ gpay-gateb (支付网关接入前置服务)", icon: "🛡️", shortName: "gpay-gateb" },
    "gpay-gateb-dev": { name: "🛡️ gpay-gateb (支付网关接入前置服务)", icon: "🛡️", shortName: "gpay-gateb-dev" },
    "gpay-chnlwg": { name: "🔌 gpay-chnlwg (渠道网关通道通信服务)", icon: "🔌", shortName: "gpay-chnlwg" },
    "gpay-cbmu": { name: "🌐 gpay-cbmu (跨境商户结算中台服务)", icon: "🌐", shortName: "gpay-cbmu" },
    "gpay-cbmu-dev": { name: "🌐 gpay-cbmu (跨境商户结算中台服务)", icon: "🌐", shortName: "gpay-cbmu-dev" },
    "gpay-busi": { name: "💳 gpay-busi (全渠道支付核心业务服务)", icon: "💳", shortName: "gpay-busi" }
  };

  return {
    CATEGORY_MAP,
    TYPE_MAP,
    PROJECT_META
  };
})();

// 向下兼容旧调用
window.QM_CONSTANTS = window.QM_CONSTANTS || window.QM.constants;
