import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 根目录与资源路径解析 (ROOT_DIR 自动指向项目总根目录)
const PORT = parseInt(process.env.PORT || '8901', 10);
const SERVER_DIR = __dirname;
const ROOT_DIR = path.resolve(SERVER_DIR, '..');
const WEB_DIR = path.resolve(ROOT_DIR, 'web');
const USER_HOME = process.env.USERPROFILE || os.homedir();

// 默认通用项目元信息基础字典
const DEFAULT_PROJECT_META = {
  global: { name: '🌐 全局研发智库 (Qoder 通用规范)', icon: '🌐', shortName: 'global' }
};

// 动态载入本地工程自定义配置 (从 data/projects.local.json 隔离读取，零外部依赖，防泄露)
export function loadLocalProjectConfig() {
  const candidatePaths = [
    path.resolve(ROOT_DIR, 'data', 'projects.local.json'),
    path.resolve(ROOT_DIR, 'projects.local.json')
  ];

  for (const configPath of candidatePaths) {
    if (fsSync.existsSync(configPath)) {
      try {
        const raw = fsSync.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          projectMeta: { ...DEFAULT_PROJECT_META, ...(parsed.projectMeta || {}) },
          priority: Array.isArray(parsed.priority) && parsed.priority.length > 0 ? parsed.priority : ['global']
        };
      } catch (err) {
        console.warn(`[Config] 解析本地配置文件失败: ${configPath}`, err.message);
      }
    }
  }

  return {
    projectMeta: { ...DEFAULT_PROJECT_META },
    priority: ['global']
  };
}

// Slug 源码工程路径智能贪心反解器 (基于真实物理文件系统测试)
export function recoverPathFromSlug(slug) {
  const match = slug.match(/^([a-zA-Z])(?:--|-)(.*)$/);
  if (!match) return { workspacePath: null, exists: false };
  const drive = match[1].toUpperCase() + ':\\';
  const tokens = match[2].split('-');
  let currentPath = drive;
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (let j = tokens.length; j > i; j--) {
      const segment = tokens.slice(i, j).join('-');
      const testPath = path.join(currentPath, segment);
      if (fsSync.existsSync(testPath)) {
        currentPath = testPath;
        i = j;
        matched = true;
        break;
      }
    }
    if (!matched) {
      currentPath = path.join(currentPath, tokens[i]);
      i++;
    }
  }
  return { workspacePath: currentPath, exists: fsSync.existsSync(currentPath) };
}

// 智能探测工程元信息 (Java/Maven/Node/Git 等)
function detectProjectMeta(baseName, workspacePath, exists, metaDict = DEFAULT_PROJECT_META) {
  if (metaDict && metaDict[baseName]) {
    return metaDict[baseName];
  }
  let icon = '📁';
  let friendlyName = baseName;
  if (exists && workspacePath) {
    if (fsSync.existsSync(path.join(workspacePath, 'pom.xml'))) {
      icon = '☕';
      try {
        const pomContent = fsSync.readFileSync(path.join(workspacePath, 'pom.xml'), 'utf-8');
        const artMatch = pomContent.match(/<artifactId>([^<]+)<\/artifactId>/);
        const nameMatch = pomContent.match(/<name>([^<]+)<\/name>/);
        if (nameMatch && nameMatch[1].trim() && !nameMatch[1].includes('$')) {
          friendlyName = `${nameMatch[1].trim()} (${baseName})`;
        } else if (artMatch && artMatch[1].trim()) {
          friendlyName = `${artMatch[1].trim()} (${baseName})`;
        }
      } catch (e) {}
    } else if (fsSync.existsSync(path.join(workspacePath, 'package.json'))) {
      icon = '📦';
      try {
        const pkg = JSON.parse(fsSync.readFileSync(path.join(workspacePath, 'package.json'), 'utf-8'));
        if (pkg.name) friendlyName = `${pkg.name} (${baseName})`;
      } catch (e) {}
    }
  }
  return {
    name: `${icon} ${friendlyName}`,
    icon,
    shortName: baseName
  };
}

// Qoder 国内版与国际版环境定义 SSOT
export const EDITIONS = {
  cn: {
    id: 'cn',
    name: '🇨🇳 国内版 (Qoder CN)',
    root: path.join(USER_HOME, '.qoder-cn'),
    statusFile: path.join(USER_HOME, '.qoder-cn', '.qoder-app-status.json')
  },
  intl: {
    id: 'intl',
    name: '🌐 国际版 (Qoder Global)',
    root: path.join(USER_HOME, '.qoder'),
    statusFile: path.join(USER_HOME, '.qoder', '.qoder-app-status.json')
  }
};

// Qoder 官方 4 大分类聚类体系 SSOT (国际版与国内版 100% 同构)
export const OFFICIAL_CATEGORIES = {
  spec: {
    id: 'spec',
    name: '开发规范',
    icon: '🔗',
    badgeClass: 'cat-spec',
    subs: [
      'development_code_specification',
      'development_practice_specification',
      'development_comment_specification',
      'development_test_specification'
    ]
  },
  project: {
    id: 'project',
    name: '项目信息',
    icon: '📖',
    badgeClass: 'cat-project',
    subs: [
      'project_architecture',
      'project_dependency_configuration',
      'project_environment_configuration',
      'project_build_configuration',
      'project_ide_configuration',
      'project_introduction',
      'project_rule',
      'project_scm_configuration',
      'project_tech_stack'
    ]
  },
  experience: {
    id: 'experience',
    name: '经验教训',
    icon: '💡',
    badgeClass: 'cat-experience',
    subs: [
      'common_pitfalls_experience',
      'important_decision_experience',
      'task_experience',
      'expert_experience',
      'learned_skill_experience',
      'mcp_experience',
      'skill_experience',
      'tool_experience',
      'plan_experience'
    ]
  },
  task: {
    id: 'task',
    name: '任务总结',
    icon: '📋',
    badgeClass: 'cat-task',
    subs: [
      'task_summary_experience',
      'task_breakdown_experience',
      'task_flow_experience',
      'history_task_reference_files',
      'history_task_workflow'
    ]
  }
};

// 探测与映射至官方四大分类
export function mapToOfficialGroup(subCatName) {
  if (!subCatName) return { id: 'experience', name: '经验教训', icon: '💡' };
  for (const [key, grp] of Object.entries(OFFICIAL_CATEGORIES)) {
    if (grp.subs.includes(subCatName)) {
      return { id: grp.id, name: grp.name, icon: grp.icon };
    }
  }
  if (subCatName.startsWith('project_')) return { id: 'project', name: '项目信息', icon: '📖' };
  if (subCatName.startsWith('development_')) return { id: 'spec', name: '开发规范', icon: '🔗' };
  if (subCatName.startsWith('task_') || subCatName.startsWith('history_')) return { id: 'task', name: '任务总结', icon: '📋' };
  return { id: 'experience', name: '经验教训', icon: '💡' };
}

// 获取指定版本下的全部可用账号及活跃状态
export async function getEditionAccounts(editionKey = 'cn') {
  const ed = EDITIONS[editionKey] || EDITIONS.cn;
  const memoriesDir = path.join(ed.root, 'memories');
  const accounts = [];
  let activeId = null;

  // 探测当前活跃登录账号
  if (fsSync.existsSync(ed.statusFile)) {
    try {
      const s = JSON.parse(await fs.readFile(ed.statusFile, 'utf-8'));
      if (s && s.logged_in) {
        const m = (s.avatar_url || '').match(/users\/([a-zA-Z0-9_-]+)/);
        if (m) activeId = m[1].slice(0, 8);
      }
    } catch (e) {}
  }

  if (fsSync.existsSync(memoriesDir)) {
    try {
      const entries = await fs.readdir(memoriesDir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const accId = ent.name;
        const isActive = activeId ? (accId === activeId || accId.startsWith(activeId)) : false;
        accounts.push({
          id: accId,
          name: isActive ? `${accId} (当前登录)` : accId,
          isActive
        });
      }
    } catch (e) {}
  }

  if (accounts.length > 0 && !accounts.some(a => a.isActive)) {
    accounts[0].isActive = true;
  }

  return accounts;
}

// 全局在内存中的项目路由映射表 (支持 id, slug, realPath 多维索引)
export const activeProjectRegistry = new Map();
let currentScanContext = { edition: 'cn', account: null, track: 'ide' };

// 多源动态扫描全部 Qoder 记忆文档 (支持版本隔离、账号隔离、IDE/Agent 轨道切换)
export async function scanAllProjects(options = {}) {
  const localConfig = loadLocalProjectConfig();
  const editionKey = options.edition || currentScanContext.edition || 'cn';
  const targetEdition = EDITIONS[editionKey] || EDITIONS.cn;
  
  const accounts = await getEditionAccounts(targetEdition.id);
  const activeAcc = accounts.find(a => a.isActive) || accounts[0];
  const targetAccount = options.account || (options.edition ? activeAcc?.id : currentScanContext.account) || activeAcc?.id || null;
  const track = options.track || currentScanContext.track || 'ide';

  currentScanContext = { edition: targetEdition.id, account: targetAccount, track };
  activeProjectRegistry.clear();

  const projects = [];
  const scannedRealPaths = new Set();
  const projectMap = new Map(); // key: slug/baseName -> 聚合对象

  // 1. 扫描当前账号下的 IDE 会话长期记忆库 (memories/<account>/)
  if (targetAccount) {
    const accRoot = path.join(targetEdition.root, 'memories', targetAccount);
    
    // 1.1 全局用户记忆 (global)
    const accGlobalDir = path.join(accRoot, 'global');
    if (fsSync.existsSync(accGlobalDir)) {
      const groupCounts = { spec: 0, project: 0, experience: 0, task: 0 };
      let totalCount = 0;
      try {
        const subCats = await fs.readdir(accGlobalDir, { withFileTypes: true });
        for (const sub of subCats) {
          if (!sub.isDirectory()) continue;
          const grp = mapToOfficialGroup(sub.name);
          const files = await fs.readdir(path.join(accGlobalDir, sub.name));
          const count = files.filter(f => f.endsWith('.md')).length;
          groupCounts[grp.id] = (groupCounts[grp.id] || 0) + count;
          totalCount += count;
        }
      } catch (e) {}

      const globalObj = {
        id: 'global',
        slug: 'global',
        scope: 'global',
        shortName: 'global',
        rawName: targetEdition.id === 'cn' ? '🌐 全局研发智库 (Qoder CN)' : '🌐 全局研发智库 (Qoder Intl)',
        name: '',
        icon: '🌐',
        edition: targetEdition.id,
        account: targetAccount,
        ideCount: totalCount,
        agentCount: 0,
        groupCounts,
        idePath: accGlobalDir,
        agentPath: path.join(targetEdition.root, 'memory'),
        realPath: accGlobalDir,
        workspacePath: targetEdition.root,
        isOffline: false
      };
      projectMap.set('global', globalObj);
    }

    // 1.2 项目级 IDE 记忆 (projects/)
    const accProjsDir = path.join(accRoot, 'projects');
    if (fsSync.existsSync(accProjsDir)) {
      try {
        const pEntries = await fs.readdir(accProjsDir, { withFileTypes: true });
        for (const pEnt of pEntries) {
          if (!pEnt.isDirectory()) continue;
          const pDir = path.join(accProjsDir, pEnt.name);
          const groupCounts = { spec: 0, project: 0, experience: 0, task: 0 };
          let totalCount = 0;

          try {
            const subCats = await fs.readdir(pDir, { withFileTypes: true });
            for (const sub of subCats) {
              if (!sub.isDirectory()) continue;
              const grp = mapToOfficialGroup(sub.name);
              const files = await fs.readdir(path.join(pDir, sub.name));
              const count = files.filter(f => f.endsWith('.md')).length;
              groupCounts[grp.id] = (groupCounts[grp.id] || 0) + count;
              totalCount += count;
            }
          } catch (e) {}

          const { workspacePath, exists } = recoverPathFromSlug(pEnt.name);
          const baseName = workspacePath ? path.basename(workspacePath) : pEnt.name;
          const meta = detectProjectMeta(baseName, workspacePath, exists, localConfig.projectMeta);

          projectMap.set(pEnt.name, {
            id: baseName,
            slug: pEnt.name,
            scope: 'project',
            shortName: baseName,
            rawName: meta.name || baseName,
            name: '',
            icon: meta.icon || '📁',
            edition: targetEdition.id,
            account: targetAccount,
            ideCount: totalCount,
            agentCount: 0,
            groupCounts,
            idePath: pDir,
            agentPath: null,
            realPath: pDir,
            workspacePath: exists ? workspacePath : null,
            isOffline: !exists
          });
        }
      } catch (e) {}
    }
  }

  // 2. 扫描 Agent 任务自治记忆库 (projects/<slug>/memory/)
  const autoProjsDir = path.join(targetEdition.root, 'projects');
  if (fsSync.existsSync(autoProjsDir)) {
    try {
      const autoEntries = await fs.readdir(autoProjsDir, { withFileTypes: true });
      for (const ent of autoEntries) {
        if (!ent.isDirectory()) continue;
        const memDir = path.join(autoProjsDir, ent.name, 'memory');
        if (!fsSync.existsSync(memDir)) continue;

        let agentCount = 0;
        try {
          const files = await fs.readdir(memDir);
          agentCount = files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md').length;
        } catch (e) {}

        if (agentCount === 0 && !fsSync.existsSync(path.join(memDir, 'MEMORY.md'))) continue;

        const { workspacePath, exists } = recoverPathFromSlug(ent.name);
        const baseName = workspacePath ? path.basename(workspacePath) : ent.name;

        // 尝试与 IDE 记忆项目汇聚
        let proj = projectMap.get(ent.name) || (baseName ? projectMap.get(baseName) : null);
        if (!proj) {
          for (const item of projectMap.values()) {
            if (item.id === baseName || item.shortName === baseName) {
              proj = item;
              break;
            }
          }
        }

        if (proj) {
          proj.agentCount = agentCount;
          proj.agentPath = memDir;
        } else {
          // 纯 Agent 任务记忆项目
          const meta = detectProjectMeta(baseName, workspacePath, exists, localConfig.projectMeta);
          projectMap.set(ent.name, {
            id: baseName,
            slug: ent.name,
            scope: 'project',
            shortName: baseName,
            rawName: meta.name || baseName,
            name: '',
            icon: meta.icon || '📁',
            edition: targetEdition.id,
            account: targetAccount,
            ideCount: 0,
            agentCount,
            groupCounts: { spec: 0, project: 0, experience: 0, task: 0 },
            idePath: null,
            agentPath: memDir,
            realPath: memDir,
            workspacePath: exists ? workspacePath : null,
            isOffline: !exists
          });
        }
      }
    } catch (e) {}
  }

  // 3. 统计生效篇数与注册
  for (const proj of projectMap.values()) {
    let effectiveCount = 0;
    if (track === 'agent') {
      effectiveCount = proj.agentCount;
      proj.realPath = proj.agentPath || proj.idePath;
    } else if (track === 'all') {
      effectiveCount = proj.ideCount + proj.agentCount;
      proj.realPath = proj.idePath || proj.agentPath;
    } else {
      // 默认 IDE 官方记忆轨道
      effectiveCount = proj.ideCount;
      proj.realPath = proj.idePath || proj.agentPath;
    }

    proj.count = effectiveCount;
    proj.name = `${proj.rawName} [${effectiveCount}篇]`;

    // 仅保留有效计数的项目或存在对应目录的项目
    if (effectiveCount > 0 || proj.idePath || proj.agentPath) {
      projects.push(proj);
      const realResolved = path.resolve(proj.realPath || proj.idePath || proj.agentPath || '').toLowerCase();
      
      activeProjectRegistry.set(proj.id, proj);
      activeProjectRegistry.set(proj.slug, proj);
      if (realResolved) activeProjectRegistry.set(realResolved, proj);
      if (proj.shortName && !activeProjectRegistry.has(proj.shortName)) {
        activeProjectRegistry.set(proj.shortName, proj);
      }
      if (proj.id.endsWith('-dev')) {
        const withoutDev = proj.id.replace(/-dev$/, '');
        if (!activeProjectRegistry.has(withoutDev)) {
          activeProjectRegistry.set(withoutDev, proj);
        }
      }
    }
  }

  // 排序优先级：以本地配置为准（默认 global 优先）
  const priority = localConfig.priority || ['global'];
  projects.sort((a, b) => {
    const ia = priority.indexOf(a.id);
    const ib = priority.indexOf(b.id);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.id.localeCompare(b.id);
  });

  return projects;
}

// 获取或动态重新探测目标项目 (SSOT)
export async function getTargetProject(projKey, options = {}) {
  if (!projKey) return null;
  if (activeProjectRegistry.size === 0) {
    await scanAllProjects(options);
  }
  let target = activeProjectRegistry.get(projKey) || activeProjectRegistry.get(projKey.toLowerCase());
  if (!target) {
    await scanAllProjects(options);
    target = activeProjectRegistry.get(projKey) || activeProjectRegistry.get(projKey.toLowerCase());
  }
  return target || null;
}

// MIME 类型字典
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// 去除 YAML 标量两端的引号
function stripYamlQuotes(raw) {
  return String(raw).trim().replace(/^["']|["']$/g, '').trim();
}

// 解析 frontmatter 列表字段：兼容官方三种写法
// 1) 内联 `keywords: [a, b]`  2) 块列表 `keywords:\n    - "a"`  3) 平铺 `keywords: a, b`
function extractListField(fmText, key) {
  const inline = fmText.match(new RegExp(key + ':\\s*\\[([^\\]]*)\\]', 'm'));
  if (inline) {
    return inline[1].split(/[,，]/).map(stripYamlQuotes).filter(Boolean);
  }
  const block = fmText.match(new RegExp('^' + key + ':[ \\t]*\\r?\\n((?:[ \\t]+-[^\\r\\n]*\\r?\\n?)+)', 'm'));
  if (block) {
    return block[1].split(/\r?\n/)
      .map(l => stripYamlQuotes(l.replace(/^[ \t]*-[ \t]*/, '')))
      .filter(Boolean);
  }
  const flat = fmText.match(new RegExp('^' + key + ':[ \\t]*([^\\r\\n]+)$', 'm'));
  if (flat) {
    return flat[1].split(/[,，]/).map(stripYamlQuotes).filter(Boolean);
  }
  return [];
}

// 读取 frontmatter 单值字段，并回传该键是否真实存在（用于落盘时判定是否原样保留）
function readScalarField(fmText, keyRegex, keyName) {
  const m = fmText.match(new RegExp('^' + keyRegex + ':\\s*["\']?([^"\'\\r\\n]+)["\']?', 'm'));
  return { present: !!m, value: m ? m[1].trim() : '' };
}

// 解析 Markdown Frontmatter
// storeKind: 'agent' (Auto-Memory 平铺库) | 'ide' (IDE 分类子目录库)，用于决定落盘时采用哪套官方字段模板
export function parseMarkdownFile(text, filename, subDirCategory = null, storeKind = null) {
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  let name = filename.replace(/\.md$/, '');
  let category = subDirCategory || '';
  let source = 'auto';
  let type = '';
  let description = '';
  let keywords = [];
  let chains = [];
  let usageScenario = [];
  let body = text;

  // 记录原文件真实存在的字段（仅供展示与诊断参考，回写判定以 original 快照为准）
  const presentFields = [];
  let nameKey = null;

  if (fmMatch) {
    const fmText = fmMatch[1];
    body = fmMatch[2].trim();

    // 官方 IDE 记忆用 title，Auto-Memory 用 name，两者取其一且需原样回写
    const titleField = readScalarField(fmText, 'title', 'title');
    const nameField = readScalarField(fmText, 'name', 'name');
    if (titleField.present) {
      nameKey = 'title';
      name = titleField.value;
      presentFields.push('title');
    } else if (nameField.present) {
      nameKey = 'name';
      name = nameField.value;
      presentFields.push('name');
    }

    const catField = readScalarField(fmText, 'category', 'category');
    if (catField.present) {
      category = catField.value;
      presentFields.push('category');
    }

    const srcField = readScalarField(fmText, 'source', 'source');
    if (srcField.present) {
      source = srcField.value;
      presentFields.push('source');
    }

    const typeField = readScalarField(fmText, 'type', 'type');
    if (typeField.present) {
      type = typeField.value;
      presentFields.push('type');
    }

    const descField = readScalarField(fmText, 'description', 'description');
    if (descField.present) {
      description = descField.value;
      presentFields.push('description');
    }

    // IDE 格式：usage_scenario 为列表，聚合展示为 description
    usageScenario = extractListField(fmText, 'usage_scenario');
    if (usageScenario.length > 0) {
      presentFields.push('usage_scenario');
      if (!description) description = usageScenario.join('; ');
    }

    keywords = extractListField(fmText, 'keywords');
    if (keywords.length > 0) presentFields.push('keywords');

    chains = extractListField(fmText, 'chains');
    if (chains.length > 0) presentFields.push('chains');
  }

  // 分类与类型仅用于展示推导（不落盘）：typeDerived / categoryDerived 标记来源，防止污染官方 schema
  const categoryDerived = !category || category === 'common';
  if (categoryDerived) {
    if (subDirCategory) {
      category = subDirCategory;
    } else if (type === 'feedback') {
      category = 'common_pitfalls_experience';
    } else if (type === 'user') {
      category = 'user_behavior';
    } else if (type === 'project') {
      category = 'project_architecture';
    } else if (type === 'reference') {
      category = 'development_code_specification';
    } else {
      category = 'common_pitfalls_experience';
    }
  }

  const typeDerived = !['user', 'feedback', 'project', 'reference'].includes(type);
  if (typeDerived) {
    if (category.startsWith('user_')) type = 'user';
    else if (category.includes('pitfalls') || category.includes('feedback')) type = 'feedback';
    else if (category.startsWith('project_') || category.includes('decision')) type = 'project';
    else type = 'reference';
  }

  // 原始格式指纹：决定保存时回写 title/usage_scenario 还是 name/description/metadata
  const rawFormat = (nameKey === 'title' || presentFields.includes('usage_scenario') || storeKind === 'ide')
    ? 'ide'
    : 'auto';

  // 原始快照：以“展示态有效值”为基准，只有被用户真正改动的键才会被回写，杜绝默认值/推导值污染官方文件
  const original = {
    name,
    description,
    category,
    type,
    source,
    keywords: keywords.slice(),
    chains: chains.slice(),
    usageScenario: usageScenario.slice(),
    body
  };

  return {
    id: filename.replace(/\.md$/, ''),
    filename,
    name,
    category,
    source,
    type,
    description,
    keywords,
    chains,
    body,
    usageScenario,
    rawFormat,
    typeDerived,
    categoryDerived,
    frontmatterRaw: fmMatch ? fmMatch[1] : null,
    original
  };
}

// YAML 双引号标量转义
function yamlStr(val) {
  return `"${String(val == null ? '' : val).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// 未加引号的裸量仅在不破坏 YAML 解析时保留（原文件风格优先）
function safeBare(val) {
  const s = String(val == null ? '' : val);
  if (s !== s.trim()) return null;
  if (/^[-?#:]/.test(s) || /[:#\[\]{}&*!|>'"%@`]/.test(s) || s === '') return null;
  return s;
}

// 按原文件 quoting 风格输出标量值
function styleScalar(rawSample, value) {
  const s = String(value == null ? '' : value);
  const wasQuoted = /^["']/.test(String(rawSample == null ? '' : rawSample).trim());
  const bare = safeBare(s);
  if (!wasQuoted && bare !== null) return s;
  return yamlStr(s);
}

// 列表项统一输出（沿用原块缩进与 quoting 风格）
function renderListItems(items, indent, quoted) {
  return items.map(v => {
    const bare = safeBare(v);
    return `${indent}- ${quoted || bare === null ? yamlStr(v) : v}`;
  });
}

// 将展示用的 description 反拆回 IDE 官方 usage_scenario 列表
function resolveScenarioList(item, origList) {
  const original = Array.isArray(origList) && origList.length > 0
    ? origList
    : (Array.isArray(item.usageScenario) ? item.usageScenario : []);
  const desc = (item.description || '').trim();
  if (original.length > 0 && original.join('; ') === desc) return original;
  if (!desc) return original;
  return desc.split(/[;；\r\n]+/).map(s => s.trim()).filter(Boolean);
}

// 标量键就地替换：值未变则一个字节也不改
function syncScalar(fm, key, nextVal, origVal, eol) {
  const re = new RegExp('^([ \\t]*)' + key + ':[ \\t]*([^\\r\\n]+?)[ \\t]*$', 'm');
  const m = fm.match(re);
  const nextStr = String(nextVal == null ? '' : nextVal);
  const origStr = String(origVal == null ? '' : origVal);
  if (m) {
    if (origStr === nextStr) return fm;
    return fm.replace(re, `${m[1]}${key}: ${styleScalar(m[2], nextVal)}`);
  }
  if (!nextStr || origStr === nextStr) return fm;
  return fm.replace(/\s*$/, '') + eol + `${key}: ${styleScalar('', nextVal)}`;
}

// 块列表键就地替换（usage_scenario 等官方多行写法）
function syncBlockList(fm, key, nextItems, origItems, eol) {
  const items = (nextItems || []).filter(Boolean);
  const blockRe = new RegExp('^([ \\t]*)' + key + ':[ \\t]*\\r?\\n([ \\t]+-[^\\r\\n]*(?:\\r?\\n[ \\t]+-[^\\r\\n]*)*)', 'm');
  const m = fm.match(blockRe);
  if (m) {
    const prev = origItems || [];
    const same = prev.length === items.length && prev.every((v, i) => v === items[i]);
    if (same) return fm;
    const itemIndent = m[2].match(/^([ \t]*)/)[1];
    const quoted = /^[ \t]+-[ \t]*["']/.test(m[2]);
    const rebuilt = `${m[1]}${key}:${eol}${renderListItems(items, itemIndent, quoted).join(eol)}`;
    return fm.split(m[0]).join(rebuilt);
  }
  if (items.length === 0) return fm;
  return fm.replace(/\s*$/, '') + eol + `${key}:${eol}` + renderListItems(items, '    ', true).join(eol);
}

// 内联/平铺列表键就地替换（Auto-Memory 库常见的 keywords: [a, b] 与 keywords: a, b）
function syncFlatList(fm, key, nextItems, origItems, eol) {
  const items = (nextItems || []).filter(Boolean);
  const re = new RegExp('^([ \\t]*)' + key + ':[ \\t]*([^\\r\\n]+?)[ \\t]*$', 'm');
  const m = fm.match(re);
  if (m) {
    const prev = origItems || [];
    const same = prev.length === items.length && prev.every((v, i) => v === items[i]);
    if (same) return fm;
    const inlineForm = /^\[.*\]$/.test(m[2].trim());
    const quoted = /["']/.test(m[2]);
    const body = items.map(v => {
      const bare = safeBare(v);
      return (quoted || inlineForm || bare === null) ? yamlStr(v) : v;
    }).join(', ');
    return fm.replace(re, `${m[1]}${key}: ${inlineForm ? `[${body}]` : body}`);
  }
  if (items.length === 0) return fm;
  return fm.replace(/\s*$/, '') + eol + `${key}: [${items.map(yamlStr).join(', ')}]`;
}

// 列表键统一入口：根据原文件形式分派（块列表 / 内联数组 / 平铺逗号），避免形式错配导致重复键
function syncAnyList(fm, key, nextItems, origItems, eol) {
  const blockHeader = new RegExp('^[ \\t]*' + key + ':[ \\t]*\\r?\\n[ \\t]+-', 'm');
  if (blockHeader.test(fm)) return syncBlockList(fm, key, nextItems, origItems, eol);
  return syncFlatList(fm, key, nextItems, origItems, eol);
}

// 将行插入 metadata: 块内（保持原有缩进层级），无块则新建
function insertMetaLine(fm, line, eol) {
  const metaRe = new RegExp('^([ \\t]*)metadata:[ \\t]*\\r?\\n(?:[ \\t]+[^\\r\\n]*(?:\\r?\\n[ \\t]+[^\\r\\n]*)*)?', 'm');
  const m = fm.match(metaRe);
  if (m) {
    const baseIndent = m[1] || '';
    return fm.split(m[0]).join(`${m[0]}${eol}${baseIndent}  ${line}`);
  }
  return fm.replace(/\s*$/, '') + eol + `metadata:${eol}  ${line}`;
}

// 记忆切片落盘序列化：基于原文件做外科手术式就地改写
// 原则：1) 未改动的键字节不变 2) 绝不向官方文件注入推导值 3) 保留原文件 quoting / 缩进 / 列表形式
export function serializeToMarkdown(item) {
  const rawFm = item.frontmatterRaw;
  const orig = item.original;

  // 抽屉新建切片（无原文件）：按官方 Auto-Memory schema 输出
  if (typeof rawFm !== 'string' || !orig) {
    const eol = '\r\n';
    const lines = ['---', `name: ${yamlStr(item.name || item.id || '')}`];
    if (item.description) lines.push(`description: ${yamlStr(item.description)}`);
    const meta = [];
    if (item.type) meta.push(`  type: ${item.type}`);
    if (item.category) meta.push(`  category: ${item.category}`);
    if (item.source) meta.push(`  source: ${item.source}`);
    if ((item.keywords || []).length) meta.push(`  keywords: [${item.keywords.map(yamlStr).join(', ')}]`);
    if ((item.chains || []).length) meta.push(`  chains: [${item.chains.map(yamlStr).join(', ')}]`);
    if (meta.length) {
      lines.push('metadata:');
      lines.push(...meta);
    }
    lines.push('---');
    return lines.join(eol) + eol + eol + String(item.body || '').trim() + eol;
  }

  const eol = rawFm.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  let fm = rawFm;
  // 新建条目（无原文件）已在上方分支处理；存量条目只动被显式改过的键
  if (item.rawFormat === 'ide') {
    // IDE 原生记忆库官方字段集：只允许碰 title(或遗留 name) / usage_scenario / keywords / source
    // 认知分类由物理子目录承载，绝不往文件里追加 category / type / chains
    const nameKey = /(^|[\r\n])[ \t]*title:/.test(fm) ? 'title' : 'name';
    fm = syncScalar(fm, nameKey, item.name, orig.name, eol);
    // usage_scenario 仅在原文件已有该块时才维护，不从 description 反向凭空造键
    if (orig.usageScenario && orig.usageScenario.length > 0) {
      fm = syncAnyList(fm, 'usage_scenario', resolveScenarioList(item, orig.usageScenario), orig.usageScenario, eol);
    }
    fm = syncAnyList(fm, 'keywords', item.keywords, orig.keywords, eol);
    fm = syncScalar(fm, 'source', item.source, orig.source, eol);
  } else {
    fm = syncScalar(fm, 'name', item.name, orig.name, eol);
    fm = syncScalar(fm, 'description', item.description, orig.description, eol);

    for (const key of ['type', 'category', 'source']) {
      const prevVal = String(orig[key] == null ? '' : orig[key]);
      const nextVal = String(item[key] == null ? '' : item[key]);
      if (prevVal === nextVal) continue;

      const re = new RegExp('^([ \\t]*)' + key + ':[ \\t]*([^\\r\\n]+?)[ \\t]*$', 'm');
      const hit = fm.match(re);
      if (hit) {
        // 已存在该键：就地换值，沿用原行缩进与 quoting 风格
        fm = fm.split(hit[0]).join(`${hit[1]}${key}: ${styleScalar(hit[2], item[key])}`);
      } else if (nextVal) {
        // 原文件没有该键且属用户显式改动：追加到 metadata 块内
        fm = insertMetaLine(fm, `${key}: ${styleScalar('', item[key])}`, eol);
      }
    }

    if (/(^|[\r\n])[ \t]*keywords:/.test(fm)) {
      fm = syncAnyList(fm, 'keywords', item.keywords, orig.keywords, eol);
    } else if ((item.keywords || []).length) {
      fm = insertMetaLine(fm, `keywords: [${item.keywords.map(yamlStr).join(', ')}]`, eol);
    }

    if (/(^|[\r\n])[ \t]*chains:/.test(fm)) {
      fm = syncAnyList(fm, 'chains', item.chains, orig.chains, eol);
    } else if ((item.chains || []).length) {
      fm = insertMetaLine(fm, `chains: [${item.chains.map(yamlStr).join(', ')}]`, eol);
    }
  }

  const body = String(item.body == null ? '' : item.body).trim();
  const origBody = String(orig.body == null ? '' : orig.body).trim();
  const finalBody = body === origBody ? String(orig.body).replace(/\s+$/, '') : body;

  return `---${eol}${fm}${eol}---${eol}${eol}${finalBody}${eol}`;
}

// 仅用于内容比对：统一换行符，避免纯 EOL 差异触发无谓重写
function normalizeEol(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\s+$/, '');
}

function normEndsWithMd(absPath) {
  return path.resolve(absPath).toLowerCase().endsWith('.md');
}

// 原子落盘：先写同目录临时文件再 rename，避免半截文件被 Qoder 读到
async function atomicWriteFile(filePath, content) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, filePath);
}

// 物理路径同形化比对（Windows 大小写不敏感）
function normalizePathKey(absPath) {
  return path.resolve(absPath).toLowerCase();
}

// 判断绝对路径是否落在该记忆库已探测到的物理根目录内
function withinAllowedRoots(project, absPath) {
  const norm = path.resolve(absPath).toLowerCase();
  return [project.realPath, project.idePath, project.agentPath, ...(project.ideMemoryDirs || [])]
    .filter(Boolean)
    .some(root => norm.startsWith(path.resolve(root).toLowerCase() + path.sep));
}

// 校验落盘目标必须落在该记忆库已探测到的物理根目录内，杜绝路径穿越
function resolveWriteTarget(project, item) {
  const withinRoot = absPath => withinAllowedRoots(project, absPath) && normEndsWithMd(absPath);

  const baseName = path.basename(item.filename || '');
  if (!baseName || baseName === 'MEMORY.md') return null;

  // 读取阶段已定位到精确物理文件，直接复用（修正多账号库写回 ideMemoryDirs[0] 的串库问题）
  if (item.diskPath) {
    const abs = path.isAbsolute(item.diskPath)
      ? path.resolve(item.diskPath)
      : path.resolve(project.realPath, item.diskPath);
    if (withinRoot(abs)) return abs;
  }

  // 兼容旧客户端：IDE 切片按 subDir 回到对应来源目录
  if (item.storeType === 'ide' && item.subDir) {
    const fallbackRoot = project.idePath || (project.ideMemoryDirs && project.ideMemoryDirs.length > 0 ? project.ideMemoryDirs[0] : project.realPath);
    if (fallbackRoot) {
      const abs = path.resolve(fallbackRoot, item.subDir, baseName);
      if (withinRoot(abs)) return abs;
    }
  }

  const flat = path.resolve(project.realPath, baseName);
  return withinRoot(flat) ? flat : null;
}

// 生成 MEMORY.md 索引
export function generateMemoryIndex(memories) {
  const lines = [];
  memories.forEach(m => {
    const desc = m.description ? ` — ${m.description}` : '';
    lines.push(`- [${m.name}](${m.filename})${desc}`);
  });
  return lines.join('\n') + '\n';
}

// 重扫 Auto-Memory 平铺目录重建 MEMORY.md
// 官方约束：MEMORY.md 是每个记忆根目录的纯导航索引，不得指向子目录外的 IDE 切片文件
async function rebuildMemoryIndex(agentDir) {
  if (!agentDir || !fsSync.existsSync(agentDir)) return false;
  const files = await fs.readdir(agentDir);
  const remaining = [];
  for (const f of files.filter(x => x.endsWith('.md') && x !== 'MEMORY.md')) {
    try {
      const stat = await fs.stat(path.join(agentDir, f));
      if (!stat.isFile()) continue;
      const text = await fs.readFile(path.join(agentDir, f), 'utf-8');
      remaining.push(parseMarkdownFile(text, f, null, 'agent'));
    } catch (e) {
      console.warn(`[Index] 解析记忆文件失败: ${f}`, e.message);
    }
  }
  remaining.sort((a, b) => (a.name || a.filename).localeCompare(b.name || b.filename));
  await atomicWriteFile(path.join(agentDir, 'MEMORY.md'), generateMemoryIndex(remaining));
  return true;
}

// 读取指定工程全部记忆切片 (精准聚合 IDE 原生长期记忆与 Agent 任务记忆)
async function loadMemoriesForProject(targetProj, track = 'ide') {
  if (!targetProj) return [];
  const loaded = [];
  const loadedKeys = new Set();

  // 1. 官方 IDE 原生会话长期记忆轨道
  if ((track === 'ide' || track === 'all') && targetProj.idePath && fsSync.existsSync(targetProj.idePath)) {
    try {
      const subEntries = await fs.readdir(targetProj.idePath, { withFileTypes: true });
      for (const sub of subEntries) {
        if (!sub.isDirectory()) continue;
        const catDir = path.join(targetProj.idePath, sub.name);
        const catFiles = await fs.readdir(catDir);
        const officialGroup = mapToOfficialGroup(sub.name);

        for (const fname of catFiles.filter(f => f.endsWith('.md') && f !== 'MEMORY.md')) {
          try {
            const filePath = path.join(catDir, fname);
            const content = await fs.readFile(filePath, 'utf-8');
            const item = parseMarkdownFile(content, fname, sub.name, 'ide');
            item.storeType = 'ide';
            item.track = 'ide';
            item.relPath = `${sub.name}/${fname}`;
            item.subDir = sub.name;
            item.ideDir = targetProj.idePath;
            item.diskPath = filePath;
            item.originPath = filePath;
            item.category = sub.name;
            item.officialGroup = officialGroup;

            const normKey = (item.name || fname).trim().toLowerCase();
            if (!loadedKeys.has(normKey)) {
              loaded.push(item);
              loadedKeys.add(normKey);
            }
          } catch (err) {
            console.error(`解析 IDE 记忆文件失败: ${fname}`, err.message);
          }
        }
      }
    } catch (e) {
      console.error(`读取 IDE 记忆目录失败: ${targetProj.idePath}`, e.message);
    }
  }

  // 2. Agent 任务自治记忆轨道
  if ((track === 'agent' || track === 'all') && targetProj.agentPath && fsSync.existsSync(targetProj.agentPath)) {
    try {
      const files = await fs.readdir(targetProj.agentPath);
      const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
      for (const fname of mdFiles) {
        try {
          const filePath = path.join(targetProj.agentPath, fname);
          const content = await fs.readFile(filePath, 'utf-8');
          const item = parseMarkdownFile(content, fname, null, 'agent');
          item.storeType = 'agent';
          item.track = 'agent';
          item.relPath = fname;
          item.diskPath = filePath;
          item.originPath = filePath;
          item.officialGroup = mapToOfficialGroup(item.category);

          const normKey = (item.name || fname).trim().toLowerCase();
          if (track === 'agent' || !loadedKeys.has(normKey)) {
            loaded.push(item);
            loadedKeys.add(normKey);
          }
        } catch (err) {
          console.error(`解析 Agent 记忆文件失败: ${fname}`, err.message);
        }
      }
    } catch (e) {
      console.error(`读取 Agent 记忆目录失败: ${targetProj.agentPath}`, e.message);
    }
  }

  loaded.sort((a, b) => (a.name || a.filename).localeCompare(b.name || b.filename));
  return loaded;
}

// 读取 Request Body
async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// 统一响应 JSON
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// 静态文件服务
async function serveStaticFile(res, filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    sendJson(res, 404, { error: 'Static file not found' });
  }
}

// 创建 HTTP 服务端
export function createServer() {
  return http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // 跨域 OPTIONS
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    try {
      // 1. 服务健康状态
      if (pathname === '/api/status' && req.method === 'GET') {
        if (activeProjectRegistry.size === 0) {
          await scanAllProjects();
        }
        const projects = Array.from(new Set(activeProjectRegistry.values()));
        sendJson(res, 200, {
          ok: true,
          version: '1.3.0',
          totalProjects: projects.length,
          totalMemories: projects.reduce((acc, p) => acc + (p.count || 0), 0),
          system: {
            platform: process.platform,
            nodeVersion: process.version,
            userHome: USER_HOME
          },
          timestamp: Date.now()
        });
        return;
      }

      // 1.1 获取国内外版本与账号上下文元信息 (Context)
      if (pathname === '/api/context' && req.method === 'GET') {
        const cnAccounts = await getEditionAccounts('cn');
        const intlAccounts = await getEditionAccounts('intl');

        const activeCnAcc = cnAccounts.find(a => a.isActive)?.id || cnAccounts[0]?.id || null;
        const activeIntlAcc = intlAccounts.find(a => a.isActive)?.id || intlAccounts[0]?.id || null;

        sendJson(res, 200, {
          ok: true,
          editions: [
            { id: 'cn', name: EDITIONS.cn.name, root: EDITIONS.cn.root, active: true },
            { id: 'intl', name: EDITIONS.intl.name, root: EDITIONS.intl.root, active: false }
          ],
          accounts: {
            cn: cnAccounts,
            intl: intlAccounts
          },
          officialCategories: OFFICIAL_CATEGORIES,
          defaultEdition: 'cn',
          defaultAccounts: {
            cn: activeCnAcc,
            intl: activeIntlAcc
          }
        });
        return;
      }

      // 2. 扫描并获取项目列表 (支持版本隔离、账号隔离、IDE/Agent 轨道切换)
      if ((pathname === '/api/projects' || pathname === '/api/rescan') && req.method === 'GET') {
        const edition = parsedUrl.searchParams.get('edition') || 'cn';
        const account = parsedUrl.searchParams.get('account') || null;
        const track = parsedUrl.searchParams.get('track') || 'ide';

        const projects = await scanAllProjects({ edition, account, track });
        sendJson(res, 200, {
          ok: true,
          edition,
          account,
          track,
          projects
        });
        return;
      }

      // 2.5 读取全宇宙宏观星系记忆 (宏观多星系架构核心 API)
      if ((pathname === '/api/all-memories' || (pathname === '/api/memories' && parsedUrl.searchParams.get('project') === 'all')) && req.method === 'GET') {
        const edition = parsedUrl.searchParams.get('edition') || 'cn';
        const account = parsedUrl.searchParams.get('account') || null;
        const track = parsedUrl.searchParams.get('track') || 'ide';

        const projects = await scanAllProjects({ edition, account, track });
        const galaxyMap = new Map();

        for (const p of projects) {
          const loaded = await loadMemoriesForProject(p, track);
          loaded.forEach(m => {
            m.projectId = p.id;
            m.projectName = p.rawName || p.name;
            m.projectScope = p.scope;
            m.id = `${p.id}__${m.filename.replace(/\.md$/, '')}`;
          });

          if (galaxyMap.has(p.id)) {
            const existing = galaxyMap.get(p.id);
            for (const m of loaded) {
              if (!existing.memories.some(em => em.filename === m.filename && em.name === m.name)) {
                existing.memories.push(m);
              }
            }
            existing.count = existing.memories.length;
            const groupCounts = { spec: 0, project: 0, experience: 0, task: 0 };
            for (const m of existing.memories) {
              const gid = m.officialGroup?.id || 'experience';
              groupCounts[gid] = (groupCounts[gid] || 0) + 1;
            }
            existing.groupCounts = groupCounts;
            continue;
          }

          const groupCounts = { spec: 0, project: 0, experience: 0, task: 0 };
          for (const m of loaded) {
            const gid = m.officialGroup?.id || 'experience';
            groupCounts[gid] = (groupCounts[gid] || 0) + 1;
          }

          p.count = loaded.length;

          galaxyMap.set(p.id, {
            id: p.id,
            name: p.name,
            rawName: p.rawName || p.name,
            shortName: p.shortName,
            scope: p.scope,
            icon: p.icon || '📁',
            count: loaded.length,
            realPath: p.realPath,
            workspacePath: p.workspacePath,
            groupCounts,
            memories: loaded
          });
        }

        const galaxies = Array.from(galaxyMap.values());
        const totalMemories = galaxies.reduce((sum, g) => sum + g.count, 0);

        sendJson(res, 200, {
          ok: true,
          edition,
          account,
          track,
          totalProjects: galaxies.length,
          totalMemories,
          galaxies
        });
        return;
      }

      // 3. 读取指定项目/全局的全部记忆切片 (精准支持 IDE 原生记忆 vs Agent 任务自治记忆)
      if (pathname === '/api/memories' && req.method === 'GET') {
        const projKey = parsedUrl.searchParams.get('project') || 'global';
        const edition = parsedUrl.searchParams.get('edition') || 'cn';
        const account = parsedUrl.searchParams.get('account') || null;
        const track = parsedUrl.searchParams.get('track') || 'ide';

        const targetProj = await getTargetProject(projKey, { edition, account, track });

        if (!targetProj) {
          sendJson(res, 404, { error: `未找到该项目的物理记忆库: ${projKey}` });
          return;
        }

        const loaded = await loadMemoriesForProject(targetProj, track);
        loaded.forEach(m => {
          m.projectId = targetProj.id;
          m.projectName = targetProj.rawName || targetProj.name;
          m.projectScope = targetProj.scope;
          m.id = `${targetProj.id}__${m.filename.replace(/\.md$/, '')}`;
        });

        // 动态计算本次记忆集的官方 4 大分类计数
        const groupCounts = { spec: 0, project: 0, experience: 0, task: 0 };
        for (const m of loaded) {
          const gid = m.officialGroup?.id || 'experience';
          groupCounts[gid] = (groupCounts[gid] || 0) + 1;
        }

        targetProj.count = loaded.length;

        sendJson(res, 200, {
          project: targetProj.id,
          scope: targetProj.scope,
          edition,
          account,
          track,
          realPath: targetProj.realPath,
          workspacePath: targetProj.workspacePath,
          shortName: targetProj.shortName,
          name: targetProj.rawName || targetProj.name,
          count: loaded.length,
          ideCount: targetProj.ideCount,
          agentCount: targetProj.agentCount,
          groupCounts: targetProj.groupCounts || groupCounts,
          currentGroupCounts: groupCounts,
          memories: loaded
        });
        return;
      }

      // 4. 保存全部记忆切片并自动刷新 MEMORY.md (物理原子落盘)
      if (pathname === '/api/save' && req.method === 'POST') {
        const { project, memories } = await readRequestBody(req);
        if (!project || !Array.isArray(memories)) {
          sendJson(res, 400, { error: '参数必须包含 project 与 memories 数组' });
          return;
        }

        const targetProj = await getTargetProject(project);
        if (!targetProj) {
          sendJson(res, 404, { error: `无法落盘：未定位到项目物理路径 [${project}]` });
          return;
        }

        const projPath = targetProj.realPath;
        if (!targetProj.isIdeStore) {
          await fs.mkdir(projPath, { recursive: true });
        }

        // 只重写真正有差异的内容：未编辑的切片字节级不动，避免往返破坏官方字段
        const written = [];
        const skipped = [];
        const rejected = [];

        for (const m of memories) {
          if (!m.filename) continue;

          const filePath = resolveWriteTarget(targetProj, m);
          if (!filePath) {
            rejected.push(m.filename);
            console.warn(`[Save] 拒绝越界落盘: ${m.filename}`);
            continue;
          }

          const nextText = serializeToMarkdown(m);
          let prevText = null;
          try {
            prevText = await fs.readFile(filePath, 'utf-8');
          } catch (e) {
            prevText = null; // 新文件
          }

          // 区分两种“磁盘上没这个文件”：抽屉新建卡片（无 originPath）→ 按官方 schema 新建；
          // 存量切片但 frontmatterRaw 缺失（旧版缓存客户端）→ 拒绝，避免写出无 name 的残缺卡片
          const isNewCard = !m.originPath && !m.frontmatterRaw;
          if (prevText === null && m.frontmatterRaw === null && !isNewCard) {
            rejected.push(m.filename);
            console.warn(`[Save] 无原文件指纹且非新建卡片，拒绝盲写: ${m.filename}`);
            continue;
          }
          if (prevText === null && isNewCard && !m.name) {
            rejected.push(m.filename);
            continue;
          }

          if (prevText !== null && normalizeEol(prevText) === normalizeEol(nextText)) {
            skipped.push(path.basename(filePath));
            continue;
          }

          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await atomicWriteFile(filePath, nextText);
          written.push(path.basename(filePath));

          // 改名场景：新文件落盘后清理旧路径，避免同一记忆两份副本
          if (m.originPath) {
            const oldPath = path.resolve(m.originPath);
            if (!withinAllowedRoots(targetProj, oldPath)) {
              console.warn(`[Save] 忽略越界的旧路径清理: ${oldPath}`);
            } else if (normalizePathKey(oldPath) !== normalizePathKey(filePath) && fsSync.existsSync(oldPath)) {
              await fs.unlink(oldPath);
            }
          }
        }

        // MEMORY.md 只在确实有文件写入时才重建，且只索引本平铺目录内的 Auto-Memory 切片
        // （零写入时不重写，避免覆盖用户人工维护的索引标题；删除场景由 /api/delete 自行重建）
        let indexRefreshed = false;
        if (!targetProj.isIdeStore && written.length > 0 && fsSync.existsSync(path.join(projPath, 'MEMORY.md'))) {
          indexRefreshed = await rebuildMemoryIndex(projPath);
        }

        sendJson(res, 200, {
          ok: true,
          written: written.length,
          writtenFiles: written,
          unchanged: skipped.length,
          rejected,
          indexRefreshed,
          count: memories.length,
          realPath: projPath
        });
        return;
      }

      // 5. 真实删除单条切片并刷新索引
      if (pathname === '/api/delete' && req.method === 'POST') {
        const { project, id, filename } = await readRequestBody(req);
        if (!project || (!id && !filename)) {
          sendJson(res, 400, { error: '缺少 project 或 id/filename' });
          return;
        }

        const targetProj = await getTargetProject(project);
        if (!targetProj) {
          sendJson(res, 404, { error: `未定位到项目物理路径 [${project}]` });
          return;
        }

        let pureId = id || '';
        if (pureId.includes('__')) pureId = pureId.split('__').slice(1).join('__');
        else if (pureId.includes('::')) pureId = pureId.split('::').pop();
        const targetFile = path.basename(filename || (pureId.endsWith('.md') ? pureId : `${pureId}.md`));
        const candidatePaths = [path.join(targetProj.realPath, targetFile)];

        if (targetProj.ideMemoryDirs) {
          for (const ideDir of targetProj.ideMemoryDirs) {
            if (fsSync.existsSync(ideDir)) {
              try {
                const subs = await fs.readdir(ideDir, { withFileTypes: true });
                for (const s of subs) {
                  if (s.isDirectory()) {
                    candidatePaths.push(path.join(ideDir, s.name, targetFile));
                  }
                }
              } catch (e) {}
            }
          }
        }

        // 探测工程目录下一级子分类目录
        if (targetProj.realPath && fsSync.existsSync(targetProj.realPath)) {
          try {
            const subs = await fs.readdir(targetProj.realPath, { withFileTypes: true });
            for (const s of subs) {
              if (s.isDirectory()) {
                candidatePaths.push(path.join(targetProj.realPath, s.name, targetFile));
              }
            }
          } catch (e) {}
        }

        let deletedCount = 0;
        for (const p of candidatePaths) {
          if (fsSync.existsSync(p)) {
            try {
              await fs.unlink(p);
              deletedCount++;
            } catch (e) {
              console.warn('[Delete Error]', e.message);
            }
          }
        }

        // 重新统计并更新 MEMORY.md (如果有)
        if (!targetProj.isIdeStore && fsSync.existsSync(path.join(targetProj.realPath, 'MEMORY.md'))) {
          await rebuildMemoryIndex(targetProj.realPath);
        }

        // 刷新内存中的项目列表与计数
        await scanAllProjects();

        sendJson(res, 200, { ok: true, deletedFile: targetFile, deletedCount });
        return;
      }

      // 6. 在本地资源管理器打开记忆目录或源码工程
      if (pathname === '/api/open-folder' && req.method === 'POST') {
        const { project, target } = await readRequestBody(req);
        const targetProj = await getTargetProject(project);
        if (!targetProj) {
          sendJson(res, 404, { error: `未定位到项目 [${project}]` });
          return;
        }

        const folderToOpen = (target === 'workspace' && targetProj.workspacePath) ? targetProj.workspacePath : targetProj.realPath;
        if (!fsSync.existsSync(folderToOpen)) {
          sendJson(res, 404, { error: `目录不存在: ${folderToOpen}` });
          return;
        }

        const openCmd = process.platform === 'win32'
          ? `explorer.exe "${folderToOpen}"`
          : (process.platform === 'darwin' ? `open "${folderToOpen}"` : `xdg-open "${folderToOpen}"`);

        exec(openCmd, err => {
          if (err) console.warn('[Open Folder Error]:', err.message);
        });

        sendJson(res, 200, { ok: true, opened: folderToOpen });
        return;
      }

      // 7. 静态资源路由映射 (映射至 web/ 目录)
      let relativePath = pathname;
      if (relativePath === '/' || relativePath === '/index.html') {
        relativePath = '/index.html';
      }

      const candidatePath = path.join(WEB_DIR, relativePath);
      if (fsSync.existsSync(candidatePath)) {
        await serveStaticFile(res, candidatePath);
        return;
      }

      // 404
      sendJson(res, 404, { error: `Endpoint Not Found: ${pathname}` });
    } catch (err) {
      console.error('[Server Error]', err);
      sendJson(res, 500, { error: err.message || 'Internal Server Error' });
    }
  });
}

// 安全拉起系统默认浏览器 (显式指定空标题 start ""，绝不调用当前目录下的 start.bat)
function openBrowserSafe(url) {
  let openCmd;
  if (process.platform === 'win32') {
    openCmd = `cmd.exe /c start "" "${url}"`;
  } else if (process.platform === 'darwin') {
    openCmd = `open "${url}"`;
  } else {
    openCmd = `xdg-open "${url}"`;
  }

  exec(openCmd, err => {
    if (err) console.warn('[WARN] 自动拉起浏览器失败，请手动打开:', url);
  });
}

// 自动探测可用端口 (若 8901 被占用，则依次顺延尝试 8902, 8903...)
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const testServer = http.createServer();
    testServer.listen(startPort, () => {
      const port = testServer.address().port;
      testServer.close(() => resolve(port));
    });
    testServer.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
  });
}

// 独立启动支持
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const shouldOpenBrowser = !process.argv.includes('--no-open');

  (async () => {
    try {
      const portToUse = await findAvailablePort(PORT);
      const isSwitched = portToUse !== PORT;

      const projs = await scanAllProjects();
      const appServer = createServer();

      appServer.listen(portToUse, () => {
        const url = `http://localhost:${portToUse}`;
        console.log('\n============================================================');
        console.log('⚡ Qoder Memory 工业级记忆拓扑管理台 (本地自愈直读直写版)');
        if (isSwitched) {
          console.log(`⚠️ 提示: 默认端口 ${PORT} 已被占用，已自动切换至端口: ${portToUse}`);
        }
        console.log(`🌐 访问地址: ${url}`);
        console.log(`🔍 已自动识别本地 Qoder 知识库: ${projs.length} 个 (全局与工程级自适应)`);
        console.log(`🖥️ 运行平台: Windows (${os.release()}) / Node ${process.version}`);
        console.log('💡 特性支持: 零软链接依赖、Slug 物理自愈、原子落盘、MEMORY.md 索引同步');
        console.log('🛑 如需停止服务，请直接在此窗口按下 Ctrl + C');
        console.log('============================================================\n');

        if (shouldOpenBrowser) {
          openBrowserSafe(url);
        }
      });

      appServer.on('error', err => {
        console.error('服务运行异常:', err);
      });
    } catch (err) {
      console.error('服务启动失败:', err);
      process.exit(1);
    }
  })();
}
