
import React, { useState, useEffect } from 'react';
import { 
    Users, Database, Plus, Trash2, HardDrive, 
    CheckCircle2, FolderInput,
    ArrowLeft, UserPlus, Search, UserX, X, AlertTriangle, PieChart,
    ChevronRight, Folder, Loader2, ExternalLink,
    Edit2, Cloud, ChevronDown
} from 'lucide-react';
import * as api from '../../services/api';
import { User, StorageDefinition, Permissions, FileItem } from '../../types';
import { formatSize } from '../../utils/formatters';
import { useToast } from '../../contexts/ToastContext';

interface AdminDashboardProps {
    onBack: () => void;
}

// --- INTERNAL COMPONENT: FOLDER PICKER ---
const FolderPicker: React.FC<{ onSelect: (path: string) => void }> = ({ onSelect }) => {
    const [drives, setDrives] = useState<string[]>([]);
    const [currentPath, setCurrentPath] = useState<string>('');
    const [folders, setFolders] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedPath, setSelectedPath] = useState('');

    useEffect(() => {
        // Load drives initially
        api.getStorageInfo().then(stats => {
            const drvs = stats.map(s => s.drive.includes('\\') || s.drive.includes('/') ? s.drive : s.drive + '\\');
            setDrives(drvs);
            if (drvs.length > 0) handleBrowse(drvs[0]);
        });
    }, []);

    const handleBrowse = async (path: string) => {
        setLoading(true);
        setCurrentPath(path);
        try {
            const list = await api.getList(path);
            // Only show folders in picker
            setFolders(list.filter(i => i.type === 'folder'));
        } catch (e) {
            console.error("Failed to load path", e);
            setFolders([]);
        } finally {
            setLoading(false);
        }
    };

    const handleFolderClick = (folderName: string) => {
        const separator = currentPath.includes('\\') ? '\\' : '/';
        const newPath = currentPath.endsWith(separator) 
            ? `${currentPath}${folderName}` 
            : `${currentPath}${separator}${folderName}`;
        handleBrowse(newPath);
    };

    const handleBack = () => {
        const separator = currentPath.includes('\\') ? '\\' : '/';
        // Check if root
        if (drives.includes(currentPath) || drives.includes(currentPath + separator)) return;
        
        const parts = currentPath.split(separator).filter(Boolean);
        parts.pop();
        let parent = parts.join(separator);
        
        // Fix drive root format (e.g. "C:" -> "C:\")
        if (parent.endsWith(':')) parent += separator;
        if (!parent) parent = drives[0];

        handleBrowse(parent);
    };

    const handleSelectCurrent = (path: string) => {
        setSelectedPath(path);
        onSelect(path);
    };

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col h-[280px]">
            {/* Header: Drives & Nav */}
            <div className="bg-gray-50 border-b border-gray-200 p-2 flex flex-col gap-2">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {drives.map(d => (
                        <button 
                            key={d}
                            onClick={() => handleBrowse(d)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex-shrink-0 flex items-center gap-1.5 ${currentPath.startsWith(d) ? 'bg-primary-600 text-white border-primary-600 shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                        >
                            <HardDrive size={12} /> {d}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 px-1">
                     <button 
                        onClick={handleBack}
                        disabled={drives.some(d => currentPath === d || currentPath === d.replace(/\\$/, ''))}
                        className="p-1.5 text-gray-500 hover:bg-gray-200 rounded-lg disabled:opacity-30"
                     >
                        <ArrowLeft size={14} />
                     </button>
                     <div className="flex-1 bg-white border border-gray-200 rounded-md px-2 py-1 text-xs font-mono text-gray-600 truncate flex items-center gap-2">
                        <Folder size={12} className="text-primary-500" />
                        {currentPath}
                     </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                        <Loader2 className="animate-spin text-primary-500" />
                        <span className="text-xs">Loading folders...</span>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {/* Option to select current folder */}
                        <button
                            onClick={() => handleSelectCurrent(currentPath)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all mb-2 ${selectedPath === currentPath ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-500' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                        >
                            <CheckCircle2 size={14} className={selectedPath === currentPath ? 'text-primary-600' : 'text-gray-400'} />
                            Select Current Folder: <span className="font-mono ml-1">{currentPath}</span>
                        </button>

                        <div className="border-t border-gray-100 my-2"></div>

                        {folders.length === 0 ? (
                            <div className="text-center py-8 text-gray-400 text-xs italic">No subfolders found</div>
                        ) : (
                            folders.map(f => (
                                <div key={f.path} className="flex items-center gap-1 group">
                                    <button
                                        onClick={() => handleSelectCurrent(f.path)}
                                        className={`flex-1 text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${selectedPath === f.path ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        <Folder size={16} className={`transition-colors ${selectedPath === f.path ? 'fill-indigo-200 text-indigo-600' : 'fill-gray-50 text-gray-400 group-hover:text-primary-500'}`} />
                                        <span className="truncate">{f.name}</span>
                                    </button>
                                    <button 
                                        onClick={() => handleFolderClick(f.name)}
                                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- DELETE MODAL ---
const DeleteConfirmModal: React.FC<{
    isOpen: boolean;
    title: string;
    message: string;
    onClose: () => void;
    onConfirm: () => void;
    loading: boolean;
}> = ({ isOpen, title, message, onClose, onConfirm, loading }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[80] bg-[#2B3674]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="text-red-500" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{message}</p>
                </div>
                <div className="bg-gray-50 px-6 py-4 flex gap-3">
                    <button 
                        onClick={onClose} 
                        disabled={loading}
                        className="flex-1 py-2.5 text-gray-600 font-bold hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={onConfirm}
                        disabled={loading}
                        className="flex-1 py-2.5 bg-red-500 text-white font-bold hover:bg-red-600 rounded-xl shadow-lg shadow-red-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENT: FOLDER USAGE BAR ---
const FolderUsageBar: React.FC<{ path: string, quotaBytes: number | null | undefined }> = ({ path, quotaBytes }) => {
    const [usage, setUsage] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        api.getFolderSize(path).then(res => {
            if (mounted) {
                setUsage(res.totalBytes);
                setLoading(false);
            }
        }).catch(() => {
            if (mounted) setLoading(false);
        });
        return () => { mounted = false; };
    }, [path]);

    if (!quotaBytes) {
        return (
            <div className="mt-2 text-[10px] text-gray-400 font-medium flex items-center gap-1">
                {loading ? <Loader2 size={10} className="animate-spin" /> : <PieChart size={12} />}
                <span>Unlimited Quota</span>
                {usage !== null && <span className="text-gray-500">• Used: {formatSize(usage)}</span>}
            </div>
        );
    }

    const percent = usage !== null ? Math.min(100, (usage / quotaBytes) * 100) : 0;
    const remaining = Math.max(0, quotaBytes - (usage || 0));
    
    return (
        <div className="mt-2 w-full">
            <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1">
                {loading ? (
                    <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Calculating...</span>
                ) : (
                    <>
                        <span>{formatSize(usage || 0)} used</span>
                        <span>{formatSize(remaining)} free</span>
                    </>
                )}
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <div 
                    className={`h-full rounded-full transition-all duration-1000 ${percent > 90 ? 'bg-red-500' : 'bg-primary-500'}`}
                    style={{ width: `${loading ? 0 : percent}%` }}
                ></div>
            </div>
            <div className="text-[10px] text-gray-400 mt-1 text-right">Quota: {formatSize(quotaBytes)}</div>
        </div>
    );
};

// --- USER DETAILS MODAL ---
const UserDetailsModal: React.FC<{
    user: User | null;
    loading: boolean;
    onClose: () => void;
    onAssign: () => void;
    onRefresh: () => void;
    storages: StorageDefinition[];
}> = ({ user, loading, onClose, onAssign, onRefresh, storages }) => {
    const { showToast, handleError } = useToast();
    const [editingPath, setEditingPath] = useState<string | null>(null);
    const [editPerms, setEditPerms] = useState<Permissions>({ read: false, write: false, delete: false });
    const [saveLoading, setSaveLoading] = useState(false);
    const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);

    const getStorageName = (storageId?: string, path?: string) => {
        if (storageId) {
            const s = storages.find(st => st._id === storageId);
            if (s) return s.name;
        }
        return path?.split(/[\\/]/).filter(Boolean).pop() || path || 'Unknown';
    };

    const handleEditStart = (path: string, currentPerms: Permissions) => {
        setEditingPath(path);
        setEditPerms({...currentPerms});
    };

    const handleEditSave = async () => {
        if (!user || !editingPath) return;
        setSaveLoading(true);
        try {
            await api.updatePermission(user._id, editingPath, editPerms);
            showToast('Permissions updated successfully', 'success');
            onRefresh();
            setEditingPath(null);
        } catch (e: any) {
            handleError(e);
        } finally {
            setSaveLoading(false);
        }
    };

    const handleRevoke = async (path: string) => {
        if (!user) return;
        setSaveLoading(true);
        try {
            await api.revokePermission(user._id, path);
            showToast('Access revoked successfully', 'success');
            onRefresh();
            setRevokeConfirm(null);
        } catch (e: any) {
            handleError(e);
        } finally {
            setSaveLoading(false);
        }
    };

    if (!user) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-[#2B3674]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl shadow-sm ${user.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                            {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">{user.username}</h3>
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>{user.role}</span>
                                <span className="text-xs text-gray-400 font-mono">ID: {user._id}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
                            <Loader2 className="animate-spin text-primary-500 w-8 h-8" />
                            <span className="text-sm">Loading details...</span>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Assigned Storage Section */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                                        <Database size={16} className="text-gray-400" />
                                        Assigned Storage
                                    </h4>
                                    <button 
                                        onClick={onAssign}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-lg text-xs font-bold transition-colors"
                                    >
                                        <Plus size={14} /> Assign Storage
                                    </button>
                                </div>

                                {user.paths && user.paths.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-3">
                                        {user.paths.map((p, i) => (
                                            <div key={i} className={`bg-white border rounded-xl p-4 shadow-sm transition-all group ${editingPath === p.path ? 'border-primary-500 ring-1 ring-primary-500' : 'border-gray-200 hover:border-primary-200'}`}>
                                                
                                                {/* Editing Mode */}
                                                {editingPath === p.path ? (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between">
                                                             <div className="flex items-center gap-2">
                                                                <Folder size={18} className="text-primary-500 flex-shrink-0" />
                                                                <span className="font-bold text-gray-800 text-sm">{getStorageName(p.storageId, p.path)}</span>
                                                             </div>
                                                             <div className="text-xs font-mono text-gray-400">{p.path}</div>
                                                        </div>
                                                        <div className="bg-gray-50 p-2 rounded-lg flex items-center gap-2">
                                                            {['read', 'write', 'delete'].map(perm => (
                                                                <label key={perm} className={`flex-1 flex items-center justify-center gap-2 py-1.5 border rounded cursor-pointer transition-all ${editPerms[perm as keyof Permissions] ? 'bg-white border-primary-500 text-primary-700' : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-100'}`}>
                                                                    <input 
                                                                        type="checkbox" 
                                                                        className="hidden" 
                                                                        checked={editPerms[perm as keyof Permissions]}
                                                                        onChange={e => setEditPerms(prev => ({...prev, [perm]: e.target.checked}))}
                                                                    />
                                                                    {editPerms[perm as keyof Permissions] ? <CheckCircle2 size={12} /> : <div className="w-3 h-3 border rounded-full border-gray-300"></div>}
                                                                    <span className="capitalize text-xs font-bold">{perm}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={() => setEditingPath(null)}
                                                                disabled={saveLoading}
                                                                className="flex-1 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button 
                                                                onClick={handleEditSave}
                                                                disabled={saveLoading}
                                                                className="flex-1 py-1.5 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg flex items-center justify-center gap-2"
                                                            >
                                                                {saveLoading && <Loader2 size={12} className="animate-spin" />}
                                                                Save
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    /* View Mode */
                                                    <div>
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <Folder size={18} className="text-primary-500 flex-shrink-0 fill-primary-50" />
                                                                    <span className="font-bold text-gray-800 truncate" title={getStorageName(p.storageId, p.path)}>
                                                                        {getStorageName(p.storageId, p.path)}
                                                                    </span>
                                                                </div>
                                                                <div className="text-xs text-gray-500 font-mono truncate pl-6.5 mb-2" title={p.path}>
                                                                    {p.path}
                                                                </div>
                                                                <div className="flex gap-2 pl-6.5">
                                                                    {p.permissions.read && <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 font-bold rounded border border-green-100">Read</span>}
                                                                    {p.permissions.write && <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 font-bold rounded border border-blue-100">Write</span>}
                                                                    {p.permissions.delete && <span className="text-[10px] px-2 py-0.5 bg-red-50 text-red-700 font-bold rounded border border-red-100">Delete</span>}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button 
                                                                    onClick={() => handleEditStart(p.path, p.permissions)}
                                                                    className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                                                    title="Edit Permissions"
                                                                >
                                                                    <Edit2 size={16} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => setRevokeConfirm(p.path)}
                                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Revoke Access"
                                                                >
                                                                    <UserX size={18} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Usage Bar */}
                                                        <div className="pl-6.5">
                                                            <FolderUsageBar path={p.path} quotaBytes={p.quotaBytes} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                        <FolderInput className="mx-auto text-gray-300 mb-2" size={32} />
                                        <p className="text-sm text-gray-500">No storage assigned to this user.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Footer */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-100 transition-colors shadow-sm">
                        Close
                    </button>
                </div>
            </div>

            {/* Nested Confirmation for Revoke */}
            {revokeConfirm && (
                <div className="fixed inset-0 z-[70] bg-black/20 backdrop-blur-[1px] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95">
                        <div className="flex items-center gap-3 mb-4 text-red-600">
                            <AlertTriangle size={24} />
                            <h3 className="text-lg font-bold">Revoke Access?</h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-6">
                            Are you sure you want to remove access to <br/>
                            <span className="font-mono font-bold text-gray-800 bg-gray-100 px-1 rounded">{revokeConfirm}</span>?
                        </p>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setRevokeConfirm(null)}
                                disabled={saveLoading}
                                className="flex-1 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => handleRevoke(revokeConfirm)}
                                disabled={saveLoading}
                                className="flex-1 py-2 bg-red-500 text-white font-bold hover:bg-red-600 rounded-lg shadow-lg shadow-red-500/20"
                            >
                                {saveLoading ? 'Revoking...' : 'Yes, Revoke'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
    const { showToast, handleError } = useToast();
    // Data States
    const [users, setUsers] = useState<User[]>([]);
    const [storages, setStorages] = useState<StorageDefinition[]>([]);
    const [loading, setLoading] = useState(false);
    
    // User Form State
    const [newUserUser, setNewUserUser] = useState('');
    const [newUserPass, setNewUserPass] = useState('');
    const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
    
    // User Detail View State
    const [viewingUser, setViewingUser] = useState<User | null>(null);
    const [loadingUserDetails, setLoadingUserDetails] = useState(false);

    // Assign Storage State
    const [assigningUser, setAssigningUser] = useState<User | null>(null);
    
    // Custom Path State
    const [assignPath, setAssignPath] = useState('');
    const [assignQuota, setAssignQuota] = useState(''); 

    const [assignPerms, setAssignPerms] = useState<Permissions>({ read: true, write: true, delete: false });
    
    // Action Loading
    const [createLoading, setCreateLoading] = useState(false);
    const [assignLoading, setAssignLoading] = useState(false);

    // Delete Modal State
    const [deleteData, setDeleteData] = useState<{ type: 'user' | 'storage', id: string, name: string } | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [u, s] = await Promise.all([
                api.getUsers(),
                api.getDefinedStorages()
            ]);
            setUsers(u);
            setStorages(s);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateLoading(true);
        try {
            // 1. Create User
            await api.createUser(newUserUser, newUserPass);
            showToast(`User ${newUserUser} created successfully`, 'success');
            setNewUserUser('');
            setNewUserPass('');
            setIsCreateUserOpen(false);
            loadData();
        } catch (e: any) {
            handleError(e);
            // Form stays open
        } finally {
            setCreateLoading(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteData) return;
        setDeleteLoading(true);
        try {
            if (deleteData.type === 'user') {
                await api.deleteUser(deleteData.id);
                showToast(`User ${deleteData.name} deleted`, 'success');
            }
            // Add storage delete logic here if endpoint exists
            loadData();
            setDeleteData(null);
            if (viewingUser && deleteData.type === 'user' && deleteData.id === viewingUser._id) {
                setViewingUser(null);
            }
        } catch (e: any) {
            handleError(e);
            // Modal stays open on error
        } finally {
            setDeleteLoading(false);
        }
    }

    const handleAssignStorage = async () => {
        if (!assigningUser || !assignPath) return;
        setAssignLoading(true);
        try {
            // Always use sharePath for direct assignment
            await api.sharePath(assigningUser.username, assignPath, assignPerms, assignQuota ? Number(assignQuota) : undefined);
            showToast(`Storage assigned to ${assigningUser.username}`, 'success');
            
            // Refresh logic
            if (viewingUser && viewingUser._id === assigningUser._id) {
                refreshViewingUser();
            } else {
                loadData();
            }

            setAssigningUser(null);
            setAssignPath('');
            setAssignQuota('');
        } catch (e: any) {
            handleError(e);
            // Modal stays open
        } finally {
            setAssignLoading(false);
        }
    };

    const handleViewUser = async (user: User) => {
        setViewingUser(user);
        setLoadingUserDetails(true);
        try {
            const detail = await api.getUserDetails(user._id);
            setViewingUser(detail);
            setUsers(prev => prev.map(u => u._id === user._id ? detail : u));
        } catch (e) {
            console.error("Failed to load user details", e);
        } finally {
            setLoadingUserDetails(false);
        }
    };

    const refreshViewingUser = async () => {
        if (!viewingUser) return;
        setLoadingUserDetails(true);
        try {
            const detail = await api.getUserDetails(viewingUser._id);
            setViewingUser(detail);
            setUsers(prev => prev.map(u => u._id === viewingUser._id ? detail : u));
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingUserDetails(false);
        }
    }

    return (
        <div className="h-full flex flex-col bg-gray-50/50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-[#2B3674]">Admin Console</h1>
                        <p className="text-xs text-gray-400">System Configuration Dashboard</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={onBack}
                        className="p-2 text-gray-400 hover:bg-gray-100 hover:text-red-500 rounded-lg transition-colors"
                        title="Close Admin Console"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="space-y-6 max-w-6xl mx-auto">
                    {/* Action Bar */}
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-bold text-gray-700">System Users</h2>
                        <button 
                            onClick={() => setIsCreateUserOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl shadow-lg shadow-primary-600/20 hover:bg-primary-700 transition-all"
                        >
                            <UserPlus size={18} /> New User
                        </button>
                    </div>

                    {/* Create User Form */}
                    {isCreateUserOpen && (
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-in slide-in-from-top-2">
                            <h3 className="font-bold text-gray-800 mb-4">Create New Account</h3>
                            <form onSubmit={handleCreateUser} className="space-y-4">
                                <div className="flex gap-4 items-start">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username</label>
                                        <input type="text" required value={newUserUser} onChange={e => setNewUserUser(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                                        <input type="password" required value={newUserPass} onChange={e => setNewUserPass(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    <button 
                                        type="button" 
                                        onClick={() => setIsCreateUserOpen(false)} 
                                        disabled={createLoading}
                                        className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={createLoading}
                                        className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 flex items-center gap-2 disabled:opacity-70"
                                    >
                                        {createLoading && <Loader2 size={16} className="animate-spin" />}
                                        Create Account
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Users List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {users.map(u => (
                            <div 
                                key={u._id} 
                                onClick={() => handleViewUser(u)}
                                className={`rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all relative group flex flex-col cursor-pointer ${
                                    u.role === 'admin' 
                                    ? 'bg-purple-50/40 border-purple-100 hover:border-purple-300 hover:shadow-purple-500/10' 
                                    : 'bg-white border-gray-100 hover:border-primary-200'
                                }`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm ${u.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                                            {u.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className={`font-bold transition-colors ${u.role === 'admin' ? 'text-gray-900 group-hover:text-purple-700' : 'text-gray-800 group-hover:text-primary-600'}`}>
                                                {u.username}
                                            </h3>
                                            <div className="flex flex-col items-start gap-1">
                                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-white text-purple-700 border border-purple-200' : 'bg-gray-100 text-gray-500'}`}>{u.role}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setDeleteData({ type: 'user', id: u._id, name: u.username }); }} 
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-10" 
                                            title="Delete User"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-4 pt-3 border-t border-gray-50 flex justify-between items-center text-xs text-gray-400">
                                    <span>ID: {u._id}</span>
                                    <ExternalLink size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* User Details Modal (Popup) */}
            <UserDetailsModal 
                user={viewingUser}
                loading={loadingUserDetails}
                onClose={() => setViewingUser(null)}
                onAssign={() => { 
                    if (viewingUser) { 
                        setAssigningUser(viewingUser); 
                        // Reset form for new assignment
                        setAssignPath(''); 
                        setAssignQuota(''); 
                    } 
                }}
                onRefresh={refreshViewingUser}
                storages={storages}
            />

            {/* Assign Modal (Overlay) - Higher Z-index to appear over details if needed */}
            {assigningUser && (
                <div className="fixed inset-0 z-[70] bg-[#2B3674]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">Grant Access</h3>
                                <p className="text-sm text-gray-500">Assign folder to: <span className="font-bold text-primary-600">{assigningUser.username}</span></p>
                            </div>
                            <button onClick={() => setAssigningUser(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="space-y-4 overflow-y-auto custom-scrollbar pr-2">
                            {/* Always Show Folder Picker (No Defined Storage Option) */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Select Folder</label>
                                <FolderPicker onSelect={setAssignPath} />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Storage Limit (Quota)</label>
                                <div className="relative">
                                    <PieChart className="absolute left-3 top-3 text-gray-400" size={18} />
                                    <input 
                                        type="number" 
                                        placeholder="e.g. 50 (GB) - Leave empty for Unlimited" 
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500"
                                        value={assignQuota}
                                        onChange={e => setAssignQuota(e.target.value)}
                                    />
                                    <div className="absolute right-3 top-3 text-xs font-bold text-gray-400">GB</div>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Permissions</label>
                                <div className="flex gap-2">
                                    {['read', 'write', 'delete'].map(perm => (
                                        <label key={perm} className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 border rounded-xl cursor-pointer transition-all ${assignPerms[perm as keyof Permissions] ? 'bg-primary-600 border-primary-600 text-white shadow-lg shadow-primary-600/20' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                                            <input 
                                                type="checkbox" 
                                                className="hidden" 
                                                checked={assignPerms[perm as keyof Permissions]}
                                                onChange={e => setAssignPerms(p => ({...p, [perm]: e.target.checked}))}
                                            />
                                            {assignPerms[perm as keyof Permissions] ? <CheckCircle2 size={16} /> : <div className="w-4 h-4 rounded-full border border-gray-300" />}
                                            <span className="capitalize text-xs font-bold">{perm}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button onClick={() => setAssigningUser(null)} className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-xl font-bold transition-colors">Cancel</button>
                                <button 
                                    onClick={handleAssignStorage} 
                                    disabled={!assignPath || assignLoading} 
                                    className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-bold shadow-lg shadow-primary-600/20 disabled:opacity-50 hover:bg-primary-700 transition-all flex items-center justify-center gap-2"
                                >
                                    {assignLoading && <Loader2 size={16} className="animate-spin" />}
                                    Confirm Access
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <DeleteConfirmModal 
                isOpen={!!deleteData} 
                title={`Delete ${deleteData?.type === 'user' ? 'User' : 'Storage'}?`}
                message={`Are you sure you want to delete ${deleteData?.type} "${deleteData?.name}"? This action cannot be undone.`}
                onClose={() => setDeleteData(null)}
                onConfirm={confirmDelete}
                loading={deleteLoading}
            />
        </div>
    );
};
