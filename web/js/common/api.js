/**
 * Qoder Memory Visualizer - REST API 通信适配层 (API Adapter)
 */
window.QM = window.QM || {};

window.QM.api = (function() {
  async function checkStatus() {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) {
      return null;
    }
    return null;
  }

  async function getContext() {
    try {
      const res = await fetch('/api/context', { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('[API] 获取上下文元信息失败:', e.message);
    }
    return null;
  }

  async function getProjects(params = {}) {
    try {
      const query = new URLSearchParams();
      if (params.edition) query.set('edition', params.edition);
      if (params.account) query.set('account', params.account);
      if (params.track) query.set('track', params.track);

      const url = `/api/projects${query.toString() ? '?' + query.toString() : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        return data.projects || [];
      }
    } catch (e) {
      console.warn('[API] 获取项目列表失败:', e.message);
    }
    return [];
  }

  async function getMemories(project, params = {}) {
    try {
      const query = new URLSearchParams({ project });
      if (params.edition) query.set('edition', params.edition);
      if (params.account) query.set('account', params.account);
      if (params.track) query.set('track', params.track);

      const res = await fetch(`/api/memories?${query.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error(`[API] 读取项目 [${project}] 记忆切片失败:`, e.message);
    }
    return null;
  }

  async function saveMemories(project, memories) {
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, memories })
      });
      if (res.ok) return await res.json();
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    } catch (e) {
      throw e;
    }
  }

  async function deleteMemory(project, id, filename) {
    try {
      const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, id, filename })
      });
      if (res.ok) return await res.json();
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    } catch (e) {
      throw e;
    }
  }

  async function rescanProjects() {
    try {
      const res = await fetch('/api/rescan', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        return data.projects || [];
      }
    } catch (e) {
      console.warn('[API] 重新扫描项目失败:', e.message);
    }
    return [];
  }

  async function openFolder(project, target = 'memory') {
    try {
      const res = await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, target })
      });
      if (res.ok) return await res.json();
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    } catch (e) {
      console.warn('[API] 打开系统文件夹失败:', e.message);
      throw e;
    }
  }

  return {
    checkStatus,
    getContext,
    getProjects,
    getMemories,
    saveMemories,
    deleteMemory,
    rescanProjects,
    openFolder
  };
})();

// 向下兼容旧调用
window.QM_API = window.QM.api;
