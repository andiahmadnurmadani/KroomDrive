
export interface FileItem {
  name: string;
  path: string;
  type: 'folder' | 'file';
  size?: number;
  modified?: string;
}

export interface TrashItem {
  name: string;
  path: string;
  deletedAt: string;
}

export interface Permissions {
  read: boolean;
  write: boolean;
  delete: boolean;
}

export interface User {
  _id: string; // Mongo ID
  username: string;
  role: 'admin' | 'user';
  paths: { 
    path: string; 
    permissions: Permissions; 
    storageId?: string;
    quotaBytes?: number | null; 
  }[];
}

export interface LoginResponse {
  token: string;
}

export interface StorageInfo {
  drive: string;
  total: number;
  used: number;
  free: number;
  usedPercent: string;
}

// Logical Storage defined in Admin
export interface StorageDefinition {
  _id: string;
  name: string;
  rootPath: string;
  quotaGB?: number;
  enabled: boolean;
}

// Storage assigned to a user
export interface MyStorage {
  name: string;
  rootPath: string;
  permissions: Permissions;
  quotaGB?: number;
}

export interface AssignedDrive {
  drive: string;
  permissions: Permissions;
  serverId?: string;
  serverName?: string;
  serverHost?: string;
  isServerRoot?: boolean;
}

export interface QuotaItem {
  path: string;
  used: number;
  quota: number | null;
  percent: number | null;
}

export interface FolderSizeResponse {
  totalBytes: number;
  totalGB: string;
  files: number;
}

export type ViewMode = 'grid' | 'list';

export interface ApiError {
  error: string;
}

export interface ClipboardItem {
  items: { path: string; name: string }[];
  op: 'copy' | 'move';
}
