
import { FileItem, LoginResponse, StorageInfo, FolderSizeResponse, TrashItem, AssignedDrive, Permissions, User, StorageDefinition, MyStorage, QuotaItem } from '../types';

// API base — relative path, proxied by Vite in dev, same-origin in production
const API_BASE = "/api";

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

const handleResponse = async (res: Response) => {
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized');
    let errorMsg = 'Request failed';
    let isJson = false;
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
      isJson = true;
    } catch {
      errorMsg = res.statusText;
    }
    if (res.status === 403) throw new Error(isJson ? errorMsg : 'Unauthorized');
    throw new Error(errorMsg);
  }
  return res.json();
};

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
};

// Physical Disks (PowerShell)
export const getStorageInfo = async (): Promise<StorageInfo[]> => {
  try {
    const res = await fetch(`${API_BASE}/storage`, { headers: getAuthHeaders() });
    if (!res.ok) return [];
    return res.json();
  } catch (error) {
    console.warn("Storage info unavailable", error);
    return [];
  }
};

// Logical Storages (Mongo) - Admin Only
export const getDefinedStorages = async (): Promise<StorageDefinition[]> => {
    const res = await fetch(`${API_BASE}/storages`, { headers: getAuthHeaders() });
    return handleResponse(res);
};

export const createStorage = async (name: string, rootPath: string, quotaGB?: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/storages`, {
        method: 'POST',
        headers: getAuthHeaders() as any,
        body: JSON.stringify({ name, rootPath, quotaGB }),
    });
    return handleResponse(res);
};

// Storages assigned to the current user
export const getMyStorages = async (): Promise<MyStorage[]> => {
  const res = await fetch(`${API_BASE}/my-storages`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

export const getAssignedDrives = async (): Promise<AssignedDrive[]> => {
  try {
      const res = await fetch(`${API_BASE}/my-drives`, { headers: getAuthHeaders() });
      return handleResponse(res);
  } catch (e) {
      console.warn("Failed to fetch assigned drives", e);
      return [];
  }
};

export const getQuota = async (): Promise<QuotaItem[]> => {
    try {
        const res = await fetch(`${API_BASE}/quota`, { headers: getAuthHeaders() });
        return handleResponse(res);
    } catch (e) {
        console.warn("Failed to fetch quota", e);
        return [];
    }
};

export const getFolderSize = async (path: string): Promise<FolderSizeResponse> => {
  const encodedPath = encodeURIComponent(path);
  const res = await fetch(`${API_BASE}/folder-size?path=${encodedPath}`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

export const getList = async (path: string): Promise<FileItem[]> => {
  const encodedPath = encodeURIComponent(path);
  const res = await fetch(`${API_BASE}/list?path=${encodedPath}`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

export const searchFiles = async (path: string, query: string): Promise<FileItem[]> => {
  const params = new URLSearchParams({ path, q: query });
  const res = await fetch(`${API_BASE}/search?${params.toString()}`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

export const createFolder = async (path: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/folder`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
    body: JSON.stringify({ path }),
  });
  return handleResponse(res);
};

export const renameItem = async (oldPath: string, newPath: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/rename`, {
    method: 'PUT',
    headers: getAuthHeaders() as any,
    body: JSON.stringify({ oldPath, newPath }),
  });
  return handleResponse(res);
};

export const copyItem = async (from: string, to: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/copy`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
    body: JSON.stringify({ from, to }),
  });
  return handleResponse(res);
};

export const moveItem = async (from: string, to: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/move`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
    body: JSON.stringify({ from, to }),
  });
  return handleResponse(res);
};

export const deleteItemsBulk = async (paths: string[], jobId: string): Promise<{ success: boolean; jobId: string }> => {
  const res = await fetch(`${API_BASE}/delete/bulk`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
    body: JSON.stringify({ paths, jobId }),
  });
  return handleResponse(res);
};

export const extractFiles = async (zipPath: string, targetDir: string, jobId: string): Promise<{ success: boolean; jobId: string }> => {
  const res = await fetch(`${API_BASE}/extract`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
    body: JSON.stringify({ zipPath, targetDir, jobId }),
  });
  return handleResponse(res);
};

export const getTrash = async (drive: string): Promise<TrashItem[]> => {
  const encodedDrive = encodeURIComponent(drive);
  const res = await fetch(`${API_BASE}/trash?drive=${encodedDrive}`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

export const restoreItem = async (trashPath: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/trash/restore`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
    body: JSON.stringify({ trashPath }),
  });
  return handleResponse(res);
};

export const emptyTrash = async (drive: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/trash/empty`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
    body: JSON.stringify({ drive }),
  });
  return handleResponse(res);
};

export const uploadFile = async (path: string, file: File, onProgress?: (percent: number) => void): Promise<void> => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('path', path);
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/upload`);

    const token = localStorage.getItem('token');
    if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
        }
    };

    xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
        } else {
            let errorMessage = 'Upload failed';
            try {
                const res = JSON.parse(xhr.responseText);
                errorMessage = res.error || errorMessage;
            } catch {
                errorMessage = xhr.statusText || errorMessage;
            }
            reject(new Error(errorMessage));
        }
    };

    xhr.onerror = () => {
        reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
};

export const createUser = async (username: string, password: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: getAuthHeaders() as any,
        body: JSON.stringify({ username, password }),
    });
    return handleResponse(res);
};

export const deleteUser = async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders() as any,
    });
    return handleResponse(res);
};

export const resetUserPassword = async (id: string, password: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/users/${id}/password`, {
        method: 'PUT',
        headers: getAuthHeaders() as any,
        body: JSON.stringify({ password }),
    });
    return handleResponse(res);
};

export const updateProfile = async (username?: string, password?: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: getAuthHeaders() as any,
        body: JSON.stringify({ username, password }),
    });
    return handleResponse(res);
};

export const sharePath = async (username: string, path: string, permissions: Permissions, quotaGB?: number, serverId?: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/share`, {
        method: 'POST',
        headers: getAuthHeaders() as any,
        body: JSON.stringify({ username, path, permissions, quotaGB, serverId }),
    });
    return handleResponse(res);
};

export const assignStorageToUser = async (userId: string, storageId: string, permissions: Permissions): Promise<void> => {
    const res = await fetch(`${API_BASE}/users/${userId}/storage`, {
        method: 'POST',
        headers: getAuthHeaders() as any,
        body: JSON.stringify({ storageId, permissions }),
    });
    return handleResponse(res);
};

export const getUsers = async (): Promise<User[]> => {
    const res = await fetch(`${API_BASE}/users`, { headers: getAuthHeaders() });
    return handleResponse(res);
};

export const getUserDetails = async (id: string): Promise<User> => {
    const res = await fetch(`${API_BASE}/users/${id}`, { headers: getAuthHeaders() });
    return handleResponse(res);
};

export const revokePermission = async (id: string, path: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/users/${id}/permission`, {
        method: 'DELETE',
        headers: getAuthHeaders() as any,
        body: JSON.stringify({ path }),
    });
    return handleResponse(res);
};

export const updatePermission = async (id: string, path: string, permissions: Permissions): Promise<void> => {
    const res = await fetch(`${API_BASE}/users/${id}/permission`, {
        method: 'PUT',
        headers: getAuthHeaders() as any,
        body: JSON.stringify({ path, permissions }),
    });
    return handleResponse(res);
};

export const downloadFileBlob = async (path: string, filename: string) => {
  const headers = getAuthHeaders();
  const res = await fetch(`${API_BASE}/download?path=${encodeURIComponent(path)}`, { headers: headers as any });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ─── Server Management (Admin) ────────────────────────────────────────────────

export interface ServerDefinition {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  enabled: boolean;
  os_type: string;
  conn_type: 'direct' | 'cloudflare';
  tunnel_url?: string;
  created_at: string;
}

export const getServers = async (): Promise<ServerDefinition[]> => {
  const res = await fetch(`${API_BASE}/servers`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

export const createServer = async (data: {
  name: string; username: string; password?: string; privateKey?: string; testConn?: boolean;
  host?: string; port?: number;
  connType?: 'direct' | 'cloudflare';
  tunnelUrl?: string; cfTokenId?: string; cfTokenSecret?: string;
}): Promise<{ success: boolean; id: string }> => {
  const res = await fetch(`${API_BASE}/servers`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const updateServer = async (id: string, data: {
  name?: string; host?: string; port?: number; username?: string;
  password?: string; privateKey?: string; enabled?: boolean; testConn?: boolean;
  connType?: 'direct' | 'cloudflare';
  tunnelUrl?: string; cfTokenId?: string; cfTokenSecret?: string;
}): Promise<void> => {
  const res = await fetch(`${API_BASE}/servers/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders() as any,
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const deleteServer = async (id: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/servers/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders() as any,
  });
  return handleResponse(res);
};

export const testServer = async (id: string): Promise<{ success: boolean; message: string }> => {
  const res = await fetch(`${API_BASE}/servers/${id}/test`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
  });
  return handleResponse(res);
};

export const detectServerOS = async (id: string): Promise<{ success: boolean; osType: string }> => {
  const res = await fetch(`${API_BASE}/servers/${id}/detect-os`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
  });
  return handleResponse(res);
};

export const createStorageDefinition = async (data: {
  name: string; rootPath: string; serverId: string; quotaGB?: number;
}): Promise<void> => {
  const res = await fetch(`${API_BASE}/storages`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
    body: JSON.stringify(data),
  });
  return handleResponse(res);
};

export const deleteStorageDefinition = async (id: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/storages/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders() as any,
  });
  return handleResponse(res);
};

// ─── Git Integration ──────────────────────────────────────────────────────────

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  relTime: string;
  date: string;
  subject: string;
}

export interface GitInfo {
  isGitRepo: boolean;
  branch?: string;
  remoteName?: string;
  remoteUrl?: string;
  repoHost?: 'github' | 'gitlab' | 'bitbucket' | null;
  repoSlug?: string;
  repoWebUrl?: string;
  lastCommit?: GitCommit;
  changedFiles?: { status: string; file: string }[];
  ahead?: number;
  behind?: number;
  stashCount?: number;
  latestTag?: string;
  isDirty?: boolean;
  error?: string;
}

export const readFileContent = async (path: string): Promise<{ content: string; filename: string; size: number }> => {
  const res = await fetch(`${API_BASE}/file/read?path=${encodeURIComponent(path)}`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

export const writeFileContent = async (path: string, content: string): Promise<{ success: boolean; size: number }> => {
  const res = await fetch(`${API_BASE}/file/write`, {
    method: 'POST', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path, content }),
  });
  return handleResponse(res);
};

export const getGitInfo = async (path: string): Promise<GitInfo> => {
  const res = await fetch(`${API_BASE}/git/info?path=${encodeURIComponent(path)}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
};

export const getGitLog = async (path: string, limit = 20): Promise<GitCommit[]> => {
  const res = await fetch(`${API_BASE}/git/log?path=${encodeURIComponent(path)}&limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
};

export const getGitBranches = async (path: string): Promise<{ local: string[]; remote: string[] }> => {
  const res = await fetch(`${API_BASE}/git/branches?path=${encodeURIComponent(path)}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
};

export const gitPull = async (path: string, remote?: string, branch?: string): Promise<{ output: string }> => {
  const res = await fetch(`${API_BASE}/git/pull`, {
    method: 'POST', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path, remote, branch }),
  });
  return handleResponse(res);
};

export const gitPush = async (path: string, remote?: string, branch?: string, force?: boolean): Promise<{ output: string }> => {
  const res = await fetch(`${API_BASE}/git/push`, {
    method: 'POST', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path, remote, branch, force }),
  });
  return handleResponse(res);
};

export const gitFetch = async (path: string, remote?: string): Promise<{ output: string }> => {
  const res = await fetch(`${API_BASE}/git/fetch`, {
    method: 'POST', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path, remote }),
  });
  return handleResponse(res);
};

export const gitCheckout = async (path: string, branch: string): Promise<{ output: string }> => {
  const res = await fetch(`${API_BASE}/git/checkout`, {
    method: 'POST', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path, branch }),
  });
  return handleResponse(res);
};

export const gitStash = async (path: string, action: 'save' | 'pop' | 'list' | 'drop', message?: string): Promise<{ output: string }> => {
  const res = await fetch(`${API_BASE}/git/stash`, {
    method: 'POST', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path, action, message }),
  });
  return handleResponse(res);
};

export const getGitDiff = async (path: string, file?: string): Promise<{ output: string }> => {
  const params = new URLSearchParams({ path });
  if (file) params.append('file', file);
  const res = await fetch(`${API_BASE}/git/diff?${params}`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

export const gitCommit = async (path: string, message: string, addAll = true): Promise<{ output: string }> => {
  const res = await fetch(`${API_BASE}/git/commit`, {
    method: 'POST', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path, message, addAll }),
  });
  return handleResponse(res);
};

export const gitCreateBranch = async (path: string, branch: string, checkout = true): Promise<{ output: string }> => {
  const res = await fetch(`${API_BASE}/git/branch/create`, {
    method: 'POST', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path, branch, checkout }),
  });
  return handleResponse(res);
};

export const gitDeleteBranch = async (path: string, branch: string, force = false): Promise<{ output: string }> => {
  const res = await fetch(`${API_BASE}/git/branch`, {
    method: 'DELETE', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path, branch, force }),
  });
  return handleResponse(res);
};

export interface GitTag { name: string; date: string; message: string; }
export const getGitTags = async (path: string): Promise<GitTag[]> => {
  const res = await fetch(`${API_BASE}/git/tags?path=${encodeURIComponent(path)}`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

export const gitReset = async (path: string, mode: 'hard' | 'soft' | 'mixed' = 'hard', ref = 'HEAD'): Promise<{ output: string }> => {
  const res = await fetch(`${API_BASE}/git/reset`, {
    method: 'POST', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path, mode, ref }),
  });
  return handleResponse(res);
};

export interface GitRemote { name: string; fetch: string; push: string; }
export const getGitRemotes = async (path: string): Promise<GitRemote[]> => {
  const res = await fetch(`${API_BASE}/git/remotes?path=${encodeURIComponent(path)}`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

// ─── Git Credentials (private repos) ──────────────────────────────────────────

export interface GitCredentialStatus {
  exists: boolean;
  authType?: string;
  username?: string;
  hasToken?: boolean;
}

export const getGitCredentials = async (path: string): Promise<GitCredentialStatus> => {
  const res = await fetch(`${API_BASE}/git/credentials?path=${encodeURIComponent(path)}`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

export const saveGitCredentials = async (path: string, data: {
  authType?: string; username?: string; token: string;
}): Promise<void> => {
  const res = await fetch(`${API_BASE}/git/credentials`, {
    method: 'POST', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path, ...data }),
  });
  return handleResponse(res);
};

export const deleteGitCredentials = async (path: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/git/credentials`, {
    method: 'DELETE', headers: getAuthHeaders() as any,
    body: JSON.stringify({ path }),
  });
  return handleResponse(res);
};

// ─── System / Self-Update ─────────────────────────────────────────────────────

export interface UpdateCommit {
  hash: string;
  author: string;
  relTime: string;
  subject: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  commits: UpdateCommit[];
  currentCommit: string;
  remoteCommit: string;
  branch: string;
  error?: string;
}

export const checkForUpdates = async (): Promise<UpdateCheckResult> => {
  const res = await fetch(`${API_BASE}/system/update-check`, { headers: getAuthHeaders() });
  return handleResponse(res);
};

// Returns an EventSource URL for the SSE update stream
export const getUpdateStreamUrl = (): string => `${API_BASE}/system/update`;

export const startUpdate = (
  onMessage: (type: string, message: string) => void,
  onComplete: () => void,
  onError: (msg: string) => void,
): (() => void) => {
  const token = localStorage.getItem('token');

  // POST to kick off update, then open SSE
  fetch(`${API_BASE}/system/update`, {
    method: 'POST',
    headers: getAuthHeaders() as any,
  }).then(res => {
    if (!res.ok) {
      res.json().then(d => onError(d.error || 'Update failed')).catch(() => onError('Update failed'));
      return;
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { onComplete(); break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const { type, message } = JSON.parse(line.slice(6));
              onMessage(type, message);
              if (type === 'complete') onComplete();
              if (type === 'error') onError(message);
            } catch (_) {}
          }
        }
      }
    };
    pump().catch(e => onError(e.message));
  }).catch(e => onError(e.message));

  // Return cancel fn (not easily cancellable for fetch streams, but give a no-op)
  return () => {};
};
