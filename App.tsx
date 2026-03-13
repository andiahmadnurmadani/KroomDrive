
import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FileProvider, useFile } from './contexts/FileContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { Sidebar } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { FileList } from './components/Files/FileList';
import { ContextMenu } from './components/Files/ContextMenu';
import { LoginForm } from './components/Auth/LoginForm';
import { Modal } from './components/Modal';
import { PropertiesModal } from './components/Modals/PropertiesModal';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { TrashView } from './components/Files/TrashView';
import { FileItem } from './types';
import * as api from './services/api';
import { AlertCircle, Loader2 } from 'lucide-react';

const PathUtils = {
  getSeparator: (path: string) => {
    return path.includes('\\') ? '\\' : '/';
  },
  join: (base: string, name: string) => {
    const sep = PathUtils.getSeparator(base);
    const cleanBase = base.endsWith(sep) ? base.slice(0, -1) : base;
    return `${cleanBase}${sep}${name}`;
  },
  dirname: (path: string) => {
    const sep = PathUtils.getSeparator(path);
    const lastIdx = path.lastIndexOf(sep);
    if (lastIdx === -1) return path;
    if (lastIdx === 0 && path.length === 1) return path;
    if (path.slice(lastIdx - 1, lastIdx) === ':') return path.slice(0, lastIdx + 1);
    return path.slice(0, lastIdx);
  },
  basename: (path: string) => {
    const sep = PathUtils.getSeparator(path);
    return path.split(sep).pop() || path;
  }
};

interface ContextMenuState {
    x: number;
    y: number;
    item: FileItem | null; 
}

const FileManager: React.FC = () => {
    const { isAuthenticated } = useAuth();
    const { 
        currentPath, 
        setCurrentPath, 
        refreshFiles, 
        setClipboard, 
        clipboard, 
        progress,
        activeJobId,
        loading,
        files,
        selectedPaths,
        setSelectedPaths,
        clearSelection,
        selectAll
    } = useFile();
    const { showToast, handleError } = useToast();

    // App View State
    const [appView, setAppView] = useState<'files' | 'admin' | 'trash'>('files');

    // UI States
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    
    // Action Loading States (For UX Response)
    const [createLoading, setCreateLoading] = useState(false);
    const [renameLoading, setRenameLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Upload & Paste
    const [uploading, setUploading] = useState(false);
    const [pasteLoading, setPasteLoading] = useState(false);

    // Item States (For single item actions initiated via context menu on unselected items)
    const [targetItem, setTargetItem] = useState<FileItem | null>(null);
    const [newItemName, setNewItemName] = useState('');
    const [renameValue, setRenameValue] = useState('');

    // --- Actions ---

    const handleCreateFolder = async () => {
        if (!newItemName.trim()) return;
        setCreateLoading(true);
        const fullPath = PathUtils.join(currentPath, newItemName);
        try {
            await api.createFolder(fullPath);
            setIsCreateOpen(false);
            setNewItemName('');
            refreshFiles();
            showToast('Folder created successfully', 'success');
        } catch (err: any) {
            handleError(err);
        } finally {
            setCreateLoading(false);
        }
    };

    const confirmDelete = async () => {
        // Use selected paths if available, otherwise fallback to single target item
        const pathsToDelete = selectedPaths.length > 0 ? selectedPaths : (targetItem ? [targetItem.path] : []);
        
        if (pathsToDelete.length === 0) return;

        setDeleteLoading(true);
        const jobId = Math.random().toString(36).substring(7);
        activeJobId.current = jobId;
        try {
            await api.deleteItemsBulk(pathsToDelete, jobId);
            setIsDeleteOpen(false);
            clearSelection();
            showToast(`Moving ${pathsToDelete.length} item(s) to trash...`, 'info');
        } catch (err: any) {
            handleError(err);
            activeJobId.current = null;
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleRename = async () => {
        // Rename only supports single item
        const itemToRename = targetItem;
        if (!itemToRename || !renameValue.trim() || renameValue === itemToRename.name) return;

        setRenameLoading(true);
        const parentDir = PathUtils.dirname(itemToRename.path);
        const newPath = PathUtils.join(parentDir, renameValue);
        try {
            await api.renameItem(itemToRename.path, newPath);
            setIsRenameOpen(false);
            refreshFiles();
            showToast('Renamed successfully', 'success');
        } catch (err: any) {
            handleError(err);
        } finally {
            setRenameLoading(false);
        }
    };

    const handleCopy = (item?: FileItem) => {
        // If items are selected, use those. If specific item passed (context menu), use that.
        const targets = item && !selectedPaths.includes(item.path) ? [item.path] : selectedPaths;
        
        if (targets.length === 0) return;

        // Resolve paths to names using the 'files' list
        const itemsToCopy = files
            .filter(f => targets.includes(f.path))
            .map(f => ({ path: f.path, name: f.name }));

        // Fallback if item passed but not found in current file list (rare)
        if (item && itemsToCopy.length === 0) {
             itemsToCopy.push({ path: item.path, name: item.name });
        }

        if (itemsToCopy.length > 0) {
            setClipboard({ items: itemsToCopy, op: 'copy' });
            showToast(`Copied ${itemsToCopy.length} item(s)`, 'info');
        }
    };

    const handleCut = (item?: FileItem) => {
        const targets = item && !selectedPaths.includes(item.path) ? [item.path] : selectedPaths;
        
        if (targets.length === 0) return;

        const itemsToCut = files
            .filter(f => targets.includes(f.path))
            .map(f => ({ path: f.path, name: f.name }));

        if (item && itemsToCut.length === 0) {
             itemsToCut.push({ path: item.path, name: item.name });
        }

        if (itemsToCut.length > 0) {
            setClipboard({ items: itemsToCut, op: 'move' });
            showToast(`Cut ${itemsToCut.length} item(s)`, 'info');
        }
    };

    const handleCopyPath = (item: FileItem) => {
        const targets = selectedPaths.length > 0 && selectedPaths.includes(item.path) 
            ? selectedPaths 
            : [item.path];
            
        if (targets.length > 0) {
            const textToCopy = targets.join('\n');
            navigator.clipboard.writeText(textToCopy)
                .then(() => showToast('Path copied', 'info'))
                .catch(() => showToast('Failed to copy', 'error'));
        }
    };

    const handlePaste = async () => {
        if (!clipboard || clipboard.items.length === 0) return;
        setPasteLoading(true);
        
        let successCount = 0;
        const total = clipboard.items.length;

        try {
            for (const item of clipboard.items) {
                const targetPath = PathUtils.join(currentPath, item.name);
                try {
                    if (clipboard.op === 'copy') {
                        await api.copyItem(item.path, targetPath);
                    } else {
                        await api.moveItem(item.path, targetPath);
                    }
                    successCount++;
                } catch (e) {
                    console.error(`Failed to paste ${item.name}`, e);
                }
            }

            if (successCount === total) {
                showToast(clipboard.op === 'copy' ? 'Pasted successfully' : 'Moved successfully', 'success');
                if (clipboard.op === 'move') setClipboard(null);
            } else if (successCount > 0) {
                 showToast(`Pasted ${successCount}/${total} items (some failed)`, 'info');
            } else {
                throw new Error("Failed to paste items");
            }
            refreshFiles();
        } catch (err: any) {
            handleError(err);
        } finally {
            setPasteLoading(false);
        }
    };

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if focus is in an input field (e.g., Rename, Search, Create Folder)
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (appView !== 'files') return;

            // Select All (Ctrl + A)
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                selectAll();
                return;
            }

            // Copy (Ctrl + C)
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                if (selectedPaths.length > 0) {
                    handleCopy();
                }
                return;
            }

            // Cut (Ctrl + X)
            if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                e.preventDefault();
                if (selectedPaths.length > 0) {
                    handleCut();
                }
                return;
            }

            // Paste (Ctrl + V)
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                if (clipboard) {
                    handlePaste();
                }
                return;
            }

            // Delete (Del)
            if (e.key === 'Delete') {
                e.preventDefault();
                if (selectedPaths.length > 0) {
                    setIsDeleteOpen(true);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPaths, files, clipboard, appView, currentPath]); // Dependencies for shortcuts


    const handleContextMenu = (e: React.MouseEvent, item: FileItem | null) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Selection Logic for Right Click
        if (item) {
            // If item is not in current selection, reset selection to just this item
            if (!selectedPaths.includes(item.path)) {
                setSelectedPaths([item.path]);
            }
            // If item IS in selection, keep selection as is (allows bulk action on right click)
        } else {
            // Clicked background
            clearSelection();
        }

        let x = e.clientX;
        let y = e.clientY;
        const menuWidth = 200;
        const menuHeight = item ? 300 : 150; // Increased height for new option
        
        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

        setContextMenu({ x, y, item });
    };

    // --- Render ---

    if (!isAuthenticated) {
        return <LoginForm />;
    }

    return (
        <div className="flex h-screen bg-[#F4F7FE] text-[#2B3674] font-sans overflow-hidden p-4 gap-4">
            {/* Styles for the loading animation */}
            <style>{`
                @keyframes progress-indeterminate {
                    0% { left: -40%; width: 40%; }
                    50% { width: 60%; }
                    100% { left: 100%; width: 40%; }
                }
                .animate-indeterminate {
                    animation: progress-indeterminate 1.2s ease-in-out infinite;
                    position: absolute;
                    top: 0;
                    height: 100%;
                }
            `}</style>

            <Sidebar 
                onNavigateTrash={() => setAppView('trash')} 
                onNavigateAdmin={() => setAppView('admin')} 
                onNavigateFiles={() => setAppView('files')}
                currentView={appView}
            />

            <main className="flex-1 flex flex-col min-w-0 bg-white rounded-[20px] shadow-soft relative overflow-hidden border border-gray-100">
                
                {/* Global Top Loading Bar */}
                {loading && (
                    <div className="absolute top-0 left-0 w-full h-1 z-[60] bg-primary-50 overflow-hidden pointer-events-none">
                        <div className="bg-primary-600 animate-indeterminate"></div>
                    </div>
                )}

                {/* Progress Widget (Floating) */}
                {progress && (
                   <div className="absolute bottom-6 right-6 z-[60] w-80 animate-in slide-in-from-bottom-4 fade-in duration-300">
                      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                        <div className="bg-primary-600 px-5 py-4 flex items-center justify-between">
                           <h4 className="text-sm font-bold text-white flex items-center gap-2">
                             <Loader2 size={16} className="animate-spin" />
                             {progress.title}
                           </h4>
                           <span className="text-xs font-bold text-white/90 bg-white/20 px-2 py-0.5 rounded">{progress.percent}%</span>
                        </div>
                        <div className="p-5">
                           <div className="mb-3 flex justify-between text-xs text-gray-500 font-medium">
                              <span className="truncate max-w-[180px]">{PathUtils.basename(progress.current)}</span>
                              <span>{progress.done} / {progress.total}</span>
                           </div>
                           <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                              <div 
                                className="bg-primary-600 h-full rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${progress.percent}%` }}
                              ></div>
                           </div>
                        </div>
                      </div>
                   </div>
                )}

                {appView === 'admin' ? (
                    <AdminDashboard onBack={() => setAppView('files')} />
                ) : appView === 'trash' ? (
                    <TrashView onBack={() => setAppView('files')} />
                ) : (
                    <>
                        <Header 
                            onCreateFolder={() => { setIsCreateOpen(true); setNewItemName(''); }}
                            onUploadStart={() => setUploading(true)}
                            onUploadEnd={() => setUploading(false)}
                            uploading={uploading}
                            onPaste={handlePaste}
                            pasteLoading={pasteLoading}
                        />

                        <div className="flex-1 overflow-y-auto p-6 relative custom-scrollbar bg-gray-50/30">
                            <FileList 
                                onContextMenu={handleContextMenu}
                                onNavigate={setCurrentPath}
                            />
                        </div>
                    </>
                )}

                {appView === 'files' && contextMenu && (
                    <ContextMenu 
                        contextMenu={contextMenu}
                        onClose={() => setContextMenu(null)}
                        onRename={(item) => { setTargetItem(item); setRenameValue(item.name); setIsRenameOpen(true); }}
                        onDelete={(item) => { setTargetItem(item); setIsDeleteOpen(true); }}
                        onProperties={(item) => { setTargetItem(item); setIsPropertiesOpen(true); }}
                        onNewFolder={() => { setIsCreateOpen(true); setNewItemName(''); }}
                        onNavigate={setCurrentPath}
                        onCopy={() => handleCopy(contextMenu.item!)}
                        onCut={() => handleCut(contextMenu.item!)}
                        onCopyPath={handleCopyPath}
                        onPaste={handlePaste}
                    />
                )}
            </main>

            {/* Modals */}
            <Modal isOpen={isCreateOpen} onClose={() => !createLoading && setIsCreateOpen(false)} title="Create New Folder">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Folder Name</label>
                        <input 
                            type="text" 
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder="e.g. Projects"
                            disabled={createLoading}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all disabled:opacity-60"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button 
                            onClick={() => setIsCreateOpen(false)} 
                            disabled={createLoading}
                            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleCreateFolder} 
                            disabled={createLoading}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg shadow-primary-600/20 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {createLoading && <Loader2 size={16} className="animate-spin" />}
                            Create Folder
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isRenameOpen} onClose={() => !renameLoading && setIsRenameOpen(false)} title="Rename Item">
                <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">New Name</label>
                        <input 
                            type="text" 
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            placeholder="Enter new name"
                            disabled={renameLoading}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all disabled:opacity-60"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button 
                            onClick={() => setIsRenameOpen(false)} 
                            disabled={renameLoading}
                            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleRename} 
                            disabled={renameLoading}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg shadow-primary-600/20 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {renameLoading && <Loader2 size={16} className="animate-spin" />}
                            Rename
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isDeleteOpen} onClose={() => !deleteLoading && setIsDeleteOpen(false)} title="Move to Trash">
                <div className="space-y-4">
                    <div className="flex gap-4 bg-red-50 p-5 rounded-2xl border border-red-100">
                        <div className="bg-red-100 p-2 rounded-xl h-fit">
                            <AlertCircle className="text-red-600" size={24} />
                        </div>
                        <div>
                            <p className="font-bold text-red-900 text-lg">Confirm Deletion</p>
                            <p className="text-sm text-red-700/80 mt-1 leading-relaxed">
                                {selectedPaths.length > 1 ? (
                                    <>Are you sure you want to move <span className="font-bold">{selectedPaths.length} items</span> to trash?</>
                                ) : (
                                    <>Are you sure you want to move <span className="font-bold text-red-900">"{targetItem?.name || selectedPaths[0]}"</span> to trash?</>
                                )}
                                <br/>You can restore it later.
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button 
                            onClick={() => setIsDeleteOpen(false)} 
                            disabled={deleteLoading}
                            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDelete} 
                            disabled={deleteLoading}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-lg shadow-red-500/20 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                             {deleteLoading && <Loader2 size={16} className="animate-spin" />}
                             Move to Trash
                        </button>
                    </div>
                </div>
            </Modal>

            <PropertiesModal 
                isOpen={isPropertiesOpen} 
                onClose={() => setIsPropertiesOpen(false)} 
                item={targetItem} 
            />
        </div>
    );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <ToastProvider>
                <FileProvider>
                    <FileManager />
                </FileProvider>
            </ToastProvider>
        </AuthProvider>
    );
};

export default App;
