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

// 项目元信息辅助字典 (用于补充展示图标与友好名称)
const PROJECT_META = {
  global: { name: '🌐 全局研发智库 (Qoder CN 通用规范)', icon: '🌐', shortName: 'global' },
  'fmmpay-busi': { name: '⚡ fmmpay-busi (国际卡收单核心服务)', icon: '⚡', shortName: 'fmmpay-busi' },
  'fmmpay-dev': { name: '🚀 fmmpay-dev (国际卡开发工程与业务库)', icon: '🚀', shortName: 'fmmpay-dev' },
  'gpay-gateb': { name: '🛡️ gpay-gateb (支付网关接入前置服务)', icon: '🛡️', shortName: 'gpay-gateb' },
  'gpay-gateb-dev': { name: '🛡️ gpay-gateb (支付网关接入前置服务)', icon: '🛡️', shortName: 'gpay-gateb-dev' },
  'gpay-chnlwg': { name: '🔌 gpay-chnlwg (渠道网关通道通信服务)', icon: '🔌', shortName: 'gpay-chnlwg' },
  'gpay-cbmu': { name: '🌐 gpay-cbmu (跨境商户结算中台服务)', icon: '🌐', shortName: 'gpay-cbmu' },
  'gpay-cbmu-dev': { name: '🌐 gpay-cbmu (跨境商户结算中台服务)', icon: '🌐', shortName: 'gpay-cbmu-dev' },
  'gpay-busi': { name: '💳 gpay-busi (全渠道支付核心业务服务)', icon: '💳', shortName: 'gpay-busi' }
};

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
function detectProjectMeta(baseName, workspacePath, exists) {
  if (PROJECT_META[baseName]) {
    return PROJECT_META[baseName];
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

// 全局在内存中的项目路由映射表 (支持 id, slug, realPath 多维索引)
export const activeProjectRegistry = new Map();

// 多源动态扫描全部 Qoder 记忆文档 (无需依赖本地软链接)
export async function scanAllProjects() {
  activeProjectRegistry.clear();
  const projects = [];
  const scannedRealPaths = new Set();

  const QODER_CN_HOME = path.join(USER_HOME, '.qoder-cn');
  const QODER_INTL_HOME = path.join(USER_HOME, '.qoder');

  // 1. 全局记忆扫描 (Global Scope)
  const globalMemories = [
    { home: QODER_CN_HOME, id: 'global', name: '🌐 全局研发智库 (Qoder CN 通用规范)' },
    { home: QODER_INTL_HOME, id: 'global-intl', name: '🌐 国际版全局智库 (Qoder Intl)' }
  ];

  for (const gm of globalMemories) {
    const memDir = path.join(gm.home, 'memory');
    const realMemPathResolved = path.resolve(memDir).toLowerCase();
    if (fsSync.existsSync(memDir) && !scannedRealPaths.has(realMemPathResolved)) {
      let count = 0;
      try {
        const files = await fs.readdir(memDir);
        count = files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md').length;
      } catch (e) {}

      const projObj = {
        id: gm.id,
        slug: gm.id,
        scope: 'global',
        shortName: gm.id,
        name: `${gm.name} [${count}篇]`,
        rawName: gm.name,
        icon: '🌐',
        count,
        realPath: memDir,
        workspacePath: gm.home,
        isOffline: false
      };
      projects.push(projObj);
      scannedRealPaths.add(realMemPathResolved);
      activeProjectRegistry.set(gm.id, projObj);
      activeProjectRegistry.set(realMemPathResolved, projObj);
    }
  }

  // 2. Qoder 项目级记忆扫描 (Project Scope - Agent Auto-Memory)
  const qoderHomes = [
    { root: QODER_CN_HOME, tag: 'cn' },
    { root: QODER_INTL_HOME, tag: 'intl' }
  ];

  for (const qh of qoderHomes) {
    const projsDir = path.join(qh.root, 'projects');
    if (!fsSync.existsSync(projsDir)) continue;

    let entries = [];
    try {
      entries = await fs.readdir(projsDir, { withFileTypes: true });
    } catch (e) {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const memDir = path.join(projsDir, entry.name, 'memory');
      const realMemPathResolved = path.resolve(memDir).toLowerCase();
      if (scannedRealPaths.has(realMemPathResolved)) continue;

      if (fsSync.existsSync(memDir)) {
        let count = 0;
        try {
          const files = await fs.readdir(memDir);
          count = files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md').length;
        } catch (e) {
          continue;
        }

        // 跳过毫无记忆内容的空目录
        if (count === 0 && !fsSync.existsSync(path.join(memDir, 'MEMORY.md'))) {
          continue;
        }

        const { workspacePath, exists } = recoverPathFromSlug(entry.name);
        const baseName = workspacePath ? path.basename(workspacePath) : entry.name;
        const meta = detectProjectMeta(baseName, workspacePath, exists);

        const displayName = meta.name ? `${meta.name} [${count}篇]` : `${baseName} [${count}篇]`;

        const projObj = {
          id: baseName,
          slug: entry.name,
          scope: 'project',
          shortName: baseName,
          name: displayName,
          rawName: meta.name || baseName,
          icon: meta.icon || '📁',
          count,
          realPath: memDir,
          ideMemoryDirs: [],
          workspacePath: exists ? workspacePath : null,
          isOffline: !exists
        };

        projects.push(projObj);
        scannedRealPaths.add(realMemPathResolved);

        // 多键注册，短名、slug、绝对路径皆可无缝命中
        activeProjectRegistry.set(baseName, projObj);
        activeProjectRegistry.set(entry.name, projObj);
        activeProjectRegistry.set(realMemPathResolved, projObj);
        if (baseName.endsWith('-dev')) {
          const withoutDev = baseName.replace(/-dev$/, '');
          if (!activeProjectRegistry.has(withoutDev)) {
            activeProjectRegistry.set(withoutDev, projObj);
          }
        }
      }
    }
  }

  // 3. 扫描 IDE 会话长期记忆库 (IDE Chat Memories: ~/.qoder-cn/memories/<account_id>/...)
  for (const qh of qoderHomes) {
    const memoriesRoot = path.join(qh.root, 'memories');
    if (!fsSync.existsSync(memoriesRoot)) continue;

    let accEntries = [];
    try {
      accEntries = await fs.readdir(memoriesRoot, { withFileTypes: true });
    } catch (e) {
      continue;
    }

    for (const acc of accEntries) {
      if (!acc.isDirectory()) continue;

      // 3.1 关联/汇聚 IDE Global 记忆
      const accGlobalDir = path.join(memoriesRoot, acc.name, 'global');
      if (fsSync.existsSync(accGlobalDir)) {
        let globalFilesCount = 0;
        try {
          const cats = await fs.readdir(accGlobalDir, { withFileTypes: true });
          for (const c of cats) {
            if (!c.isDirectory()) continue;
            const cFiles = await fs.readdir(path.join(accGlobalDir, c.name));
            globalFilesCount += cFiles.filter(f => f.endsWith('.md')).length;
          }
        } catch (e) {}

        if (globalFilesCount > 0) {
          const globalProj = activeProjectRegistry.get('global');
          if (globalProj) {
            globalProj.ideMemoryDirs = globalProj.ideMemoryDirs || [];
            if (!globalProj.ideMemoryDirs.includes(accGlobalDir)) {
              globalProj.ideMemoryDirs.push(accGlobalDir);
              globalProj.count += globalFilesCount;
              globalProj.name = `${globalProj.rawName} [${globalProj.count}篇]`;
            }
          }
        }
      }

      // 3.2 关联/汇聚 IDE Projects 记忆
      const accProjsDir = path.join(memoriesRoot, acc.name, 'projects');
      if (!fsSync.existsSync(accProjsDir)) continue;

      let pEntries = [];
      try {
        pEntries = await fs.readdir(accProjsDir, { withFileTypes: true });
      } catch (e) {
        continue;
      }

      for (const pEntry of pEntries) {
        if (!pEntry.isDirectory()) continue;
        const pDir = path.join(accProjsDir, pEntry.name);
        let pFilesCount = 0;
        try {
          const cats = await fs.readdir(pDir, { withFileTypes: true });
          for (const c of cats) {
            if (!c.isDirectory()) continue;
            const cFiles = await fs.readdir(path.join(pDir, c.name));
            pFilesCount += cFiles.filter(f => f.endsWith('.md')).length;
          }
        } catch (e) {}

        if (pFilesCount === 0) continue;

        const { workspacePath, exists } = recoverPathFromSlug(pEntry.name);
        const baseName = workspacePath ? path.basename(workspacePath) : pEntry.name;

        // 尝试匹配已存在的项目
        let matchedProj = activeProjectRegistry.get(baseName) 
          || activeProjectRegistry.get(pEntry.name)
          || (baseName.endsWith('-dev') ? activeProjectRegistry.get(baseName.replace(/-dev$/, '')) : null);

        if (matchedProj) {
          matchedProj.ideMemoryDirs = matchedProj.ideMemoryDirs || [];
          if (!matchedProj.ideMemoryDirs.includes(pDir)) {
            matchedProj.ideMemoryDirs.push(pDir);
            matchedProj.count += pFilesCount;
            matchedProj.name = `${matchedProj.rawName || matchedProj.shortName} [${matchedProj.count}篇]`;
          }
        } else {
          // 未在 projects/*/memory 出现过的纯 IDE 记忆工程
          const meta = detectProjectMeta(baseName, workspacePath, exists);
          const realMemPathResolved = path.resolve(pDir).toLowerCase();
          if (scannedRealPaths.has(realMemPathResolved)) continue;

          const projObj = {
            id: baseName,
            slug: pEntry.name,
            scope: 'project',
            shortName: baseName,
            name: meta.name ? `${meta.name} [${pFilesCount}篇]` : `${baseName} [${pFilesCount}篇]`,
            rawName: meta.name || baseName,
            icon: meta.icon || '📁',
            count: pFilesCount,
            realPath: pDir,
            ideMemoryDirs: [pDir],
            isIdeStore: true,
            workspacePath: exists ? workspacePath : null,
            isOffline: !exists
          };

          projects.push(projObj);
          scannedRealPaths.add(realMemPathResolved);
          activeProjectRegistry.set(baseName, projObj);
          activeProjectRegistry.set(pEntry.name, projObj);
          activeProjectRegistry.set(realMemPathResolved, projObj);
        }
      }
    }
  }

  // 4. Fallback 兼容本地 projects/ 目录 (若有用户自定义或外部指定目录)
  const localProjectsDir = path.join(ROOT_DIR, 'projects');
  if (fsSync.existsSync(localProjectsDir)) {
    try {
      const localEntries = await fs.readdir(localProjectsDir, { withFileTypes: true });
      for (const entry of localEntries) {
        const fullPath = path.join(localProjectsDir, entry.name);
        let targetPath = fullPath;
        try {
          if (entry.isSymbolicLink()) {
            targetPath = await fs.readlink(fullPath);
            if (!path.isAbsolute(targetPath)) targetPath = path.resolve(localProjectsDir, targetPath);
          }
        } catch (e) {}

        const targetResolved = path.resolve(targetPath).toLowerCase();
        if (scannedRealPaths.has(targetResolved)) continue;

        let count = 0;
        try {
          const files = await fs.readdir(targetPath);
          count = files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md').length;
        } catch (e) {
          continue;
        }

        const meta = PROJECT_META[entry.name] || { name: `${entry.name} (本地备用库)`, icon: '📁', shortName: entry.name };
        const projObj = {
          id: entry.name,
          slug: entry.name,
          scope: 'project',
          shortName: entry.name,
          name: `${meta.name} [${count}篇]`,
          rawName: meta.name,
          icon: meta.icon || '📁',
          count,
          realPath: targetPath,
          workspacePath: null,
          isOffline: false
        };
        projects.push(projObj);
        scannedRealPaths.add(targetResolved);
        activeProjectRegistry.set(entry.name, projObj);
        activeProjectRegistry.set(targetResolved, projObj);
      }
    } catch (e) {}
  }

  // 排序优先级：global 优先，随后按业务重要度排布
  const priority = ['global', 'fmmpay-busi', 'fmmpay-dev', 'gpay-gateb', 'gpay-gateb-dev', 'gpay-chnlwg', 'gpay-cbmu', 'gpay-cbmu-dev', 'gpay-busi'];
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

// 解析 Markdown Frontmatter
export function parseMarkdownFile(text, filename, subDirCategory = null) {
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  let name = filename.replace(/\.md$/, '');
  let category = subDirCategory || '';
  let source = 'auto';
  let type = '';
  let description = '';
  let keywords = [];
  let chains = [];
  let body = text;

  if (fmMatch) {
    const fmText = fmMatch[1];
    body = fmMatch[2].trim();

    const nameMatch = fmText.match(/^(?:name|title):\s*["']?([^"'\r\n]+)["']?/m);
    if (nameMatch) name = nameMatch[1].trim();

    const catMatch = fmText.match(/category:\s*["']?([^"'\r\n]+)["']?/m);
    if (catMatch) category = catMatch[1].trim();

    const srcMatch = fmText.match(/source:\s*["']?([^"'\r\n]+)["']?/m);
    if (srcMatch) source = srcMatch[1].trim();

    const typeMatch = fmText.match(/type:\s*["']?([^"'\r\n]+)["']?/m);
    if (typeMatch) type = typeMatch[1].trim();

    const descMatch = fmText.match(/description:\s*["']?([^"'\r\n]+)["']?/m);
    if (descMatch) description = descMatch[1].trim();

    // 兼容 IDE 记忆格式：从 usage_scenario 列表提取为 description
    if (!description) {
      const scenarioMatch = fmText.match(/usage_scenario:\s*\r?\n((?:\s*-[^\r\n]+\r?\n?)+)/m);
      if (scenarioMatch) {
        const lines = scenarioMatch[1].split(/\r?\n/)
          .map(l => l.replace(/^\s*-\s*["']?/, '').replace(/["']?\s*$/, '').trim())
          .filter(Boolean);
        if (lines.length > 0) description = lines.join('; ');
      }
    }

    const kwMatch = fmText.match(/keywords:\s*\[(.*?)\]/m) || fmText.match(/keywords:\s*([^\r\n]+)/m);
    if (kwMatch) {
      keywords = kwMatch[1].split(/[,，]/).map(s => s.replace(/["']/g, '').trim()).filter(Boolean);
    }

    const chainMatch = fmText.match(/chains:\s*\[(.*?)\]/m);
    if (chainMatch) {
      chains = chainMatch[1].split(/[,，]/).map(s => s.replace(/["']/g, '').trim()).filter(Boolean);
    }
  }

  // 智能分类与类型双向推导 (消除孤儿 common)
  if (!category || category === 'common') {
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

  // 规范化官方 type 字段 (user / feedback / project / reference)
  if (!['user', 'feedback', 'project', 'reference'].includes(type)) {
    if (category.startsWith('user_')) type = 'user';
    else if (category.includes('pitfalls') || category.includes('feedback')) type = 'feedback';
    else if (category.startsWith('project_') || category.includes('decision')) type = 'project';
    else type = 'reference';
  }

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
    body
  };
}

// 序列化为 Qoder 规范 Markdown
export function serializeToMarkdown(item) {
  const kwStr = (item.keywords || []).map(k => `"${k.replace(/"/g, '\\"')}"`).join(', ');
  const chainStr = (item.chains || []).map(c => `"${c.replace(/"/g, '\\"')}"`).join(', ');
  const safeName = (item.name || '').replace(/"/g, '\\"');
  const safeDesc = (item.description || '').replace(/"/g, '\\"');

  return `---
name: "${safeName}"
description: "${safeDesc}"
metadata:
  type: ${item.type || 'feedback'}
  category: ${item.category || 'common'}
  source: ${item.source || 'auto'}
  keywords: [${kwStr}]
  chains: [${chainStr}]
---

${item.body || ''}
`;
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
          version: '1.2.0',
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

      // 2. 扫描并获取项目列表 (自动识别本地 Qoder 记忆文档，支持 Global 与各个 Project)
      if ((pathname === '/api/projects' || pathname === '/api/rescan') && req.method === 'GET') {
        const projects = await scanAllProjects();
        sendJson(res, 200, { ok: true, projects });
        return;
      }

      // 3. 读取指定项目/全局的全部记忆切片 (汇聚 Agent 记忆与 IDE 会话记忆)
      if (pathname === '/api/memories' && req.method === 'GET') {
        let projKey = parsedUrl.searchParams.get('project') || 'fmmpay-busi';
        if (activeProjectRegistry.size === 0) {
          await scanAllProjects();
        }

        let targetProj = activeProjectRegistry.get(projKey) || activeProjectRegistry.get(projKey.toLowerCase());
        if (!targetProj) {
          // 重新探测一次，以防是刚刚在 Qoder 中生成的新工程
          await scanAllProjects();
          targetProj = activeProjectRegistry.get(projKey) || activeProjectRegistry.get(projKey.toLowerCase());
        }

        if (!targetProj) {
          sendJson(res, 404, { error: `未找到该项目的物理记忆库: ${projKey}` });
          return;
        }

        const loaded = [];
        const loadedNames = new Set();

        // 3.1 读取 Agent 记忆库 (平铺目录中的 .md，排除 MEMORY.md)
        if (targetProj.realPath && fsSync.existsSync(targetProj.realPath) && !targetProj.isIdeStore) {
          try {
            const files = await fs.readdir(targetProj.realPath);
            const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
            for (const fname of mdFiles) {
              try {
                const filePath = path.join(targetProj.realPath, fname);
                const content = await fs.readFile(filePath, 'utf-8');
                const item = parseMarkdownFile(content, fname);
                item.storeType = 'agent';
                item.relPath = fname;
                loaded.push(item);
                loadedNames.add((item.name || fname).trim().toLowerCase());
              } catch (err) {
                console.error(`解析 Agent 记忆文件失败: ${fname}`, err.message);
              }
            }
          } catch (e) {
            console.error(`读取 Agent 记忆目录失败: ${targetProj.realPath}`, e.message);
          }
        }

        // 3.2 读取 IDE 原生记忆库 (分类子目录结构：<category>/*.md)
        const ideDirs = targetProj.ideMemoryDirs || (targetProj.isIdeStore ? [targetProj.realPath] : []);
        for (const ideDir of ideDirs) {
          if (!fsSync.existsSync(ideDir)) continue;
          try {
            const subEntries = await fs.readdir(ideDir, { withFileTypes: true });
            for (const sub of subEntries) {
              if (!sub.isDirectory()) continue;
              const catDir = path.join(ideDir, sub.name);
              const catFiles = await fs.readdir(catDir);
              for (const fname of catFiles.filter(f => f.endsWith('.md') && f !== 'MEMORY.md')) {
                try {
                  const filePath = path.join(catDir, fname);
                  const content = await fs.readFile(filePath, 'utf-8');
                  const item = parseMarkdownFile(content, fname, sub.name);
                  item.storeType = 'ide';
                  item.relPath = `${sub.name}/${fname}`;
                  item.subDir = sub.name;
                  item.category = sub.name; // 显式匹配目录名

                  // 避免同名切片重复展示（若 Agent 库中已有相同标题，以 Agent 优先）
                  const normName = (item.name || fname).trim().toLowerCase();
                  if (!loadedNames.has(normName)) {
                    loaded.push(item);
                    loadedNames.add(normName);
                  }
                } catch (err) {
                  console.error(`解析 IDE 记忆文件失败: ${fname}`, err.message);
                }
              }
            }
          } catch (e) {
            console.error(`读取 IDE 记忆目录失败: ${ideDir}`, e.message);
          }
        }

        // 按标题或文件名自然排序
        loaded.sort((a, b) => (a.name || a.filename).localeCompare(b.name || b.filename));

        targetProj.count = loaded.length;

        sendJson(res, 200, {
          project: targetProj.id,
          scope: targetProj.scope,
          realPath: targetProj.realPath,
          workspacePath: targetProj.workspacePath,
          shortName: targetProj.shortName,
          name: targetProj.rawName || targetProj.name,
          count: loaded.length,
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

        let targetProj = activeProjectRegistry.get(project) || activeProjectRegistry.get(project.toLowerCase());
        if (!targetProj) {
          await scanAllProjects();
          targetProj = activeProjectRegistry.get(project) || activeProjectRegistry.get(project.toLowerCase());
        }

        if (!targetProj) {
          sendJson(res, 404, { error: `无法落盘：未定位到项目物理路径 [${project}]` });
          return;
        }

        const projPath = targetProj.realPath;
        if (!targetProj.isIdeStore) {
          await fs.mkdir(projPath, { recursive: true });
        }

        for (const m of memories) {
          if (!m.filename) continue;
          if (m.storeType === 'ide' && m.subDir && targetProj.ideMemoryDirs && targetProj.ideMemoryDirs[0]) {
            const ideCatDir = path.join(targetProj.ideMemoryDirs[0], m.subDir);
            await fs.mkdir(ideCatDir, { recursive: true });
            const filePath = path.join(ideCatDir, path.basename(m.filename));
            await fs.writeFile(filePath, serializeToMarkdown(m), 'utf-8');
          } else {
            const filePath = path.join(projPath, path.basename(m.filename));
            await fs.writeFile(filePath, serializeToMarkdown(m), 'utf-8');
          }
        }

        if (!targetProj.isIdeStore || fsSync.existsSync(path.join(projPath, 'MEMORY.md'))) {
          const indexPath = path.join(projPath, 'MEMORY.md');
          await fs.writeFile(indexPath, generateMemoryIndex(memories), 'utf-8');
        }

        targetProj.count = memories.length;

        sendJson(res, 200, { ok: true, count: memories.length, realPath: projPath });
        return;
      }

      // 5. 真实删除单条切片并刷新索引
      if (pathname === '/api/delete' && req.method === 'POST') {
        const { project, id, filename } = await readRequestBody(req);
        if (!project || (!id && !filename)) {
          sendJson(res, 400, { error: '缺少 project 或 id/filename' });
          return;
        }

        let targetProj = activeProjectRegistry.get(project) || activeProjectRegistry.get(project.toLowerCase());
        if (!targetProj) {
          await scanAllProjects();
          targetProj = activeProjectRegistry.get(project) || activeProjectRegistry.get(project.toLowerCase());
        }

        if (!targetProj) {
          sendJson(res, 404, { error: `未定位到项目物理路径 [${project}]` });
          return;
        }

        const targetFile = path.basename(filename || (id.endsWith('.md') ? id : `${id}.md`));
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

        for (const p of candidatePaths) {
          if (fsSync.existsSync(p)) {
            try { await fs.unlink(p); } catch (e) {}
          }
        }

        // 重新统计并更新 MEMORY.md (如果有)
        if (!targetProj.isIdeStore && fsSync.existsSync(path.join(targetProj.realPath, 'MEMORY.md'))) {
          const files = await fs.readdir(targetProj.realPath);
          const remaining = [];
          for (const f of files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md')) {
            const text = await fs.readFile(path.join(targetProj.realPath, f), 'utf-8');
            remaining.push(parseMarkdownFile(text, f));
          }
          await fs.writeFile(path.join(targetProj.realPath, 'MEMORY.md'), generateMemoryIndex(remaining), 'utf-8');
        }

        sendJson(res, 200, { ok: true });
        return;
      }

      // 6. 在本地资源管理器打开记忆目录或源码工程
      if (pathname === '/api/open-folder' && req.method === 'POST') {
        const { project, target } = await readRequestBody(req);
        let targetProj = activeProjectRegistry.get(project) || activeProjectRegistry.get(project?.toLowerCase());
        if (!targetProj) {
          await scanAllProjects();
          targetProj = activeProjectRegistry.get(project) || activeProjectRegistry.get(project?.toLowerCase());
        }

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

// 独立启动支持
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appServer = createServer();

  async function startServer(portToUse) {
    const projs = await scanAllProjects();
    appServer.listen(portToUse, () => {
      const activePort = appServer.address().port;
      const url = `http://localhost:${activePort}`;
      console.log('\n============================================================');
      console.log('⚡ Qoder Memory 工业级记忆拓扑管理台 (本地自愈直读直写版)');
      console.log(`🌐 访问地址: ${url}`);
      console.log(`🔍 已自动识别本地 Qoder 知识库: ${projs.length} 个 (全局与工程级自适应)`);
      console.log(`🖥️ 运行平台: Windows (${os.release()}) / Node ${process.version}`);
      console.log('💡 特性支持: 零软链接依赖、Slug 物理自愈、原子落盘、MEMORY.md 索引同步');
      console.log('============================================================\n');

      if (!process.argv.includes('--no-open')) {
        const startCmd = process.platform === 'win32' ? `start ${url}` : (process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`);
        exec(startCmd, err => {
          if (err) console.warn('自动拉起浏览器失败，请手动打开:', url);
        });
      }
    });
  }

  appServer.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[WARN] 默认端口 ${PORT} 已被占用，正在自动切换备用端口...`);
      startServer(0);
    } else {
      console.error('服务启动异常:', err);
    }
  });

  startServer(PORT);
}
