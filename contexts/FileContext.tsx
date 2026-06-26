
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { FileItem, ViewMode, StorageInfo, AssignedDrive, ClipboardItem } from '../types';
import * as api from '../services/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { io } from "socket.io-client";

interface ProgressState {
  show: boolean;
  title: string;
  percent: number;
  current: string;
  done: number;
  total: number;
}

interface FileContextType {
  currentPath: string;
  files: FileItem[];
  viewMode: ViewMode;
  loading: boolean;
  loadingDrives: boolean;
  error: string | null;
  searchQuery: string;
  storageStats: StorageInfo[];
  assignedDrives: AssignedDrive[];
  clipboard: ClipboardItem | null;
  progress: ProgressState | null;
  activeJobId: React.MutableRefObject<string | null>;
  
  // Selection State
  selectedPaths: string[];

  // Editor State
  editingPath: string | null;
  openEditor: (path: string) => void;
  closeEditor: () => void;
  
  setCurrentPath: (path: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  refreshFiles: () => void;
  loadFiles: (path: string) => Promise<void>;
  
  setClipboard: (item: ClipboardItem | null) => void;
  fetchDriveInfo: () => Promise<void>;
  extractFile: (zipPath: string, targetDir: string) => Promise<void>;
  uploadWithProgress: (file: File) => Promise<void>;
  
  // Selection Methods
  toggleSelection: (path: string, multi: boolean, range: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;
  setSelectedPaths: (paths: string[]) => void;
}

const FileContext = createContext<FileContextType | undefined>(undefined);

export const FileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, logout } = useAuth();
  const { handleError } = useToast();
  
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [loading, setLoading] = useState(false);
  const [loadingDrives, setLoadingDrives] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [storageStats, setStorageStats] = useState<StorageInfo[]>([]);
  const [assignedDrives, setAssignedDrives] = useState<AssignedDrive[]>([]);
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  
  // Editor State
  const [editingPath, setEditingPath] = useState<string | null>(null);

  // Selection State
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const lastSelectedPath = useRef<string | null>(null);

  // Trigger state to handle socket callbacks calling refreshFiles with fresh state
  const [shouldRefresh, setShouldRefresh] = useState(false);
  
  const activeJobId = useRef<string | null>(null);
  // Track previous user ID to detect account switch
  const prevUserId = useRef<string | null>(null);

  // Reset all file state when user changes (logout → re-login as different user)
  useEffect(() => {
    const currentUserId = user?._id || null;
    if (prevUserId.current !== null && prevUserId.current !== currentUserId) {
      // User switched — wipe everything so previous user's path is not carried over
      setCurrentPath('');
      setFiles([]);
      setSearchQuery('');
      setStorageStats([]);
      setAssignedDrives([]);
      setClipboard(null);
      setProgress(null);
      setSelectedPaths([]);
      setError(null);
      setEditingPath(null);
      lastSelectedPath.current = null;
      activeJobId.current = null;
    }
    prevUserId.current = currentUserId;
  }, [user?._id]);

  // Initial Path Logic
  useEffect(() => {
    if (isAuthenticated) {
        fetchDriveInfo().then(() => {
            // Always reset to the correct root for the current user
            // (currentPath may still hold a stale value from a previous user if reset hasn't propagated)
            api.getAssignedDrives().then(drives => {
                    if (drives.length > 0) {
                        setCurrentPath(drives[0].drive);
                    } else {
                        api.getStorageInfo().then(stats => {
                            if (stats.length > 0) {
                                const firstDrive = stats[0].drive.includes('\\') || stats[0].drive.includes('/') 
                                ? stats[0].drive 
                                : stats[0].drive + '\\';
                                setCurrentPath(firstDrive);
                            }
                        });
                    }
                });
        });
    }
  }, [isAuthenticated, user?._id]);

  // Handle auto-refresh triggered by sockets
  useEffect(() => {
    if (shouldRefresh) {
        refreshFiles();
        setShouldRefresh(false);
    }
  }, [shouldRefresh, currentPath, searchQuery]);

  // Socket IO
  useEffect(() => {
    const token = localStorage.getItem('token');
    const socket = io("/", {
      path: "/socket.io",
      auth: { token: token || '' },  // backend uses this to join user-specific room
      reconnectionAttempts: 3,
      reconnectionDelay: 5000,
      timeout: 10000,
      transports: ['websocket'],
    });

    socket.on("connect_error", (err) => {
      console.warn("Socket.IO connection failed (real-time updates disabled):", err.message);
    });

    socket.on("connect_failed", () => {
      console.warn("Socket.IO connection failed after max retries.");
    });

    // SERVER CHANGE HANDLERS — auto-refresh sidebar when admin adds/removes servers
    socket.on("server-updated", () => {
      fetchDriveInfo();
    });

    // DELETE HANDLERS
    socket.on("delete-progress", (data: any) => {
      if (data.jobId === activeJobId.current) {
        setProgress({
          show: true,
          title: "Deleting items...",
          percent: data.percent,
          current: data.current,
          done: data.done,
          total: data.total
        });
      }
    });

    socket.on("delete-done", (data: any) => {
      if (data.jobId === activeJobId.current) {
        setProgress(null);
        activeJobId.current = null;
        setShouldRefresh(true);
      }
    });

    socket.on("delete-error", (data: any) => {
        if (data.jobId === activeJobId.current) {
            handleError(data.error);
        }
    });

    // EXTRACT HANDLERS
    socket.on("extract-progress", (data: any) => {
        if (data.jobId === activeJobId.current) {
            setProgress({
                show: true,
                title: "Extracting archive...",
                percent: data.percent,
                current: data.current,
                done: data.done,
                total: data.total
            });
        }
    });

    socket.on("extract-done", (data: any) => {
        if (data.jobId === activeJobId.current) {
            setProgress(null);
            activeJobId.current = null;
            setShouldRefresh(true);
        }
    });

    socket.on("extract-error", (data: any) => {
        if (data.jobId === activeJobId.current) {
             console.error(data.error);
             handleError(data.error);
             setProgress(null);
             activeJobId.current = null;
        }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchDriveInfo = async () => {
    setLoadingDrives(true);
    try {
        const [storageResult, assignedResult] = await Promise.allSettled([
            api.getStorageInfo(),
            api.getAssignedDrives()
        ]);

        if (storageResult.status === 'fulfilled') {
            setStorageStats(storageResult.value);
        } else {
            console.warn("Failed to load storage info");
            setStorageStats([]);
        }

        if (assignedResult.status === 'fulfilled') {
            setAssignedDrives(assignedResult.value);
        } else {
            console.warn("Failed to load assigned drives");
            setAssignedDrives([]);
        }
    } catch (e) {
        console.error("Critical error in fetchDriveInfo", e);
    } finally {
        setLoadingDrives(false);
    }
  };

  const loadFiles = async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const fileList = await api.getList(path);
      fileList.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
      });
      setFiles(fileList);
      // Clear selection on new path load
      setSelectedPaths([]);
      lastSelectedPath.current = null;
    } catch (err: any) {
      if (err.message === 'Unauthorized') {
        logout();
      } else {
        setError(err.message);
        setFiles([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      loadFiles(currentPath);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const results = await api.searchFiles(currentPath, query);
      setFiles(results);
      setSelectedPaths([]);
    } catch (err: any) {
       setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshFiles = () => {
    if (searchQuery) {
        handleSearch(searchQuery);
    } else {
        loadFiles(currentPath);
    }
    fetchDriveInfo();
    // Do not clear selection on refresh to allow bulk action feedback
  };

  // Watch for path changes
  useEffect(() => {
    if (isAuthenticated && currentPath && !searchQuery) {
      loadFiles(currentPath);
    }
  }, [currentPath, isAuthenticated]);

  // Watch for search
  useEffect(() => {
    if (isAuthenticated && currentPath && searchQuery) {
        const timer = setTimeout(() => handleSearch(searchQuery), 500);
        return () => clearTimeout(timer);
    }
  }, [searchQuery]);

  const extractFile = async (zipPath: string, targetDir: string) => {
    const jobId = Math.random().toString(36).substring(7);
    activeJobId.current = jobId;
    setProgress({
        show: true,
        title: "Starting extraction...",
        percent: 0,
        current: "Initializing...",
        done: 0,
        total: 100
    });
    try {
        await api.extractFiles(zipPath, targetDir, jobId);
    } catch (e: any) {
        handleError(e);
        setProgress(null);
        activeJobId.current = null;
    }
  };

  const uploadWithProgress = async (file: File) => {
    const uploadId = "upload-" + Date.now();
    activeJobId.current = uploadId;

    setProgress({
        show: true,
        title: `Uploading ${file.name}...`,
        percent: 0,
        current: file.name,
        done: 0,
        total: 1
    });

    try {
        await api.uploadFile(currentPath, file, (percent) => {
            setProgress(prev => prev ? ({ ...prev, percent }) : null);
        });
        refreshFiles();
    } catch (e) {
        throw e;
    } finally {
        setProgress(null);
        activeJobId.current = null;
    }
  };

  // --- SELECTION LOGIC ---

  const toggleSelection = (path: string, multi: boolean, range: boolean) => {
    if (range && lastSelectedPath.current && files.length > 0) {
        // Range Selection (Shift + Click)
        const startIdx = files.findIndex(f => f.path === lastSelectedPath.current);
        const endIdx = files.findIndex(f => f.path === path);
        
        if (startIdx !== -1 && endIdx !== -1) {
            const min = Math.min(startIdx, endIdx);
            const max = Math.max(startIdx, endIdx);
            const rangePaths = files.slice(min, max + 1).map(f => f.path);
            
            // If Ctrl is also held (multi), we add the range to existing. 
            // Standard Windows Explorer behavior for Shift+Click replaces selection unless Ctrl is held, 
            // but often in web apps Shift+Click just expands. Let's do strict range replace logic for simplicity 
            // or merge if multi is true. For now, strict range replaces previous unless handled carefully.
            // Simplified: Shift always creates a new range selection anchored at lastSelected.
            setSelectedPaths(rangePaths);
        }
    } else if (multi) {
        // Multi Selection (Ctrl + Click)
        setSelectedPaths(prev => {
            if (prev.includes(path)) {
                const next = prev.filter(p => p !== path);
                // If we unselect the last selected, move lastSelected to the last one in the list (or null)
                if (path === lastSelectedPath.current) lastSelectedPath.current = next[next.length-1] || null;
                return next;
            } else {
                lastSelectedPath.current = path;
                return [...prev, path];
            }
        });
    } else {
        // Single Selection
        setSelectedPaths([path]);
        lastSelectedPath.current = path;
    }
  };

  const clearSelection = () => {
    setSelectedPaths([]);
    lastSelectedPath.current = null;
  };

  const selectAll = () => {
      setSelectedPaths(files.map(f => f.path));
  };

  return (
    <FileContext.Provider value={{
      currentPath,
      files,
      viewMode,
      loading,
      loadingDrives,
      error,
      searchQuery,
      storageStats,
      assignedDrives,
      clipboard,
      progress,
      activeJobId,
      selectedPaths,
      editingPath,
      openEditor: (path: string) => setEditingPath(path),
      closeEditor: () => setEditingPath(null),
      setCurrentPath,
      setViewMode,
      setSearchQuery,
      refreshFiles,
      loadFiles,
      setClipboard,
      fetchDriveInfo,
      extractFile,
      uploadWithProgress,
      toggleSelection,
      clearSelection,
      selectAll,
      setSelectedPaths
    }}>
      {children}
    </FileContext.Provider>
  );
};

export const useFile = () => {
  const context = useContext(FileContext);
  if (context === undefined) {
    throw new Error('useFile must be used within a FileProvider');
  }
  return context;
};
