
import { FileItem, LoginResponse, StorageInfo, FolderSizeResponse, TrashItem, AssignedDrive, Permissions, User, StorageDefinition, MyStorage, QuotaItem } from '../types';

// Updated to the production API URL provided
const API_BASE = "https://api-filemanager.kolab.top/api";

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
}

export const updateProfile = async (username?: string, password?: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: getAuthHeaders() as any,
        body: JSON.stringify({ username, password }),
    });
    return handleResponse(res);
};

export const sharePath = async (username: string, path: string, permissions: Permissions, quotaGB?: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/share`, {
        method: 'POST',
        headers: getAuthHeaders() as any,
        body: JSON.stringify({ username, path, permissions, quotaGB }),
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
