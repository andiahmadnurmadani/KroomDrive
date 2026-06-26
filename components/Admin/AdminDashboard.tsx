
import React, { useState, useEffect } from 'react';
import { 
    Users, Database, Plus, Trash2, HardDrive, 
    CheckCircle2, FolderInput,
    ArrowLeft, UserPlus, Search, UserX, X, AlertTriangle, PieChart,
    ChevronRight, Folder, Loader2, ExternalLink,
    Edit2, Cloud, ChevronDown, Server, KeyRound, Eye, EyeOff,
    XCircle, ChevronLeft, ChevronsLeft, ChevronsRight,
    ChevronRight as ChevronRight2,
} from 'lucide-react';
import * as api from '../../services/api';
import { User, StorageDefinition, Permissions, FileItem } from '../../types';
import { formatSize } from '../../utils/formatters';
import { useToast } from '../../contexts/ToastContext';
import { ServerManager } from './ServerManager';
import { GrantAccessModal } from './GrantAccessModal';

interface AdminDashboardProps {
    onBack: () => void;
}

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

// --- RESET PASSWORD MODAL ---
const ResetPasswordModal: React.FC<{
    user: User | null;
    onClose: () => void;
}> = ({ user, onClose }) => {
    const { showToast, handleError } = useToast();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!user) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password.length < 4) {
            setError('Password must be at least 4 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            await api.resetUserPassword(user._id, password);
            showToast(`Password reset for @${user.username}`, 'success');
            onClose();
        } catch (e: any) {
            handleError(e);
            setError(e.message || 'Failed to reset password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[80] bg-[#2B3674]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-amber-50 rounded-full flex items-center justify-center">
                            <KeyRound size={18} className="text-amber-500" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 text-sm">Reset Password</h3>
                            <p className="text-xs text-gray-400">@{user.username}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* New Password */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">New Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full px-4 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                placeholder="Min. 4 characters"
                                required
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(p => !p)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Confirm Password */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Confirm Password</label>
                        <div className="relative">
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                placeholder="Repeat password"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm(p => !p)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                tabIndex={-1}
                            >
                                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Validation error */}
                    {error && (
                        <p className="text-xs text-red-500 font-medium flex items-center gap-1.5">
                            <AlertTriangle size={12} /> {error}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 py-2.5 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50 text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-2.5 bg-amber-500 text-white font-bold hover:bg-amber-600 rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Reset Password
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
    const { showToast, handleError } = useToast();
    // Tab State
    const [activeTab, setActiveTab] = useState<'users' | 'servers'>('users');

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

    // Grant Access Modal State (replaces old assigningUser + FolderPicker)
    const [grantAccessUser, setGrantAccessUser] = useState<User | null>(null);

    // Action Loading
    const [createLoading, setCreateLoading] = useState(false);

    // Delete Modal State
    const [deleteData, setDeleteData] = useState<{ type: 'user' | 'storage', id: string, name: string } | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Pagination & display settings
    const [pageSize, setPageSize] = useState(6);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchUser, setSearchUser] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');

    // Reset Password Modal State (kept here for context grouping)
    const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);

    // Derived: filtered + paginated users
    const filteredUsers = users.filter(u => {
        const matchSearch = !searchUser || u.username.toLowerCase().includes(searchUser.toLowerCase());
        const matchRole = roleFilter === 'all' || u.role === roleFilter;
        return matchSearch && matchRole;
    });
    const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
    const pagedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const handleSearchUser = (val: string) => { setSearchUser(val); setCurrentPage(1); };
    const handleRoleFilter = (val: 'all' | 'admin' | 'user') => { setRoleFilter(val); setCurrentPage(1); };
    const handlePageSize = (val: number) => { setPageSize(val); setCurrentPage(1); };

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
        // Handled by GrantAccessModal now — kept for compatibility
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
                {/* Tab Navigation */}
                <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Users size={16} /> Users
                    </button>
                    <button
                        onClick={() => setActiveTab('servers')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'servers' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Server size={16} /> Servers & Storage
                    </button>
                </div>

                {activeTab === 'servers' ? (
                    <ServerManager />
                ) : (
                <div className="space-y-4 max-w-6xl mx-auto">
                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold text-gray-700">System Users</h2>
                            {loading && (
                                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                    <Loader2 size={14} className="animate-spin text-primary-400" />
                                    <span>Loading…</span>
                                </div>
                            )}
                            {!loading && users.length > 0 && (
                                <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                    {filteredUsers.length}{filteredUsers.length !== users.length ? `/${users.length}` : ''}
                                </span>
                            )}
                        </div>
                        <button 
                            onClick={() => setIsCreateUserOpen(true)}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl shadow-lg shadow-primary-600/20 hover:bg-primary-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <UserPlus size={18} /> New User
                        </button>
                    </div>

                    {/* Search + Filter + Page size bar */}
                    {!loading && users.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Search */}
                            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 gap-2 flex-1 min-w-[180px] focus-within:ring-2 focus-within:ring-primary-100 focus-within:border-primary-300 transition-all">
                                <Search size={15} className="text-gray-400 flex-shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Search users…"
                                    value={searchUser}
                                    onChange={e => handleSearchUser(e.target.value)}
                                    className="bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400 w-full"
                                />
                                {searchUser && (
                                    <button onClick={() => handleSearchUser('')} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                                        <XCircle size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Role filter */}
                            <div className="flex bg-gray-100 p-1 rounded-xl gap-0.5">
                                {(['all', 'admin', 'user'] as const).map(r => (
                                    <button key={r} onClick={() => handleRoleFilter(r)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                                            roleFilter === r ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                        }`}>
                                        {r === 'all' ? 'All' : r}
                                    </button>
                                ))}
                            </div>

                            {/* Page size */}
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="font-medium">Show</span>
                                <select
                                    value={pageSize}
                                    onChange={e => handlePageSize(Number(e.target.value))}
                                    className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary-300 cursor-pointer"
                                >
                                    {[3, 6, 9, 12, 24].map(n => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                                <span className="font-medium">per page</span>
                            </div>
                        </div>
                    )}

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
                                    <button type="button" onClick={() => setIsCreateUserOpen(false)} disabled={createLoading}
                                        className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50">Cancel</button>
                                    <button type="submit" disabled={createLoading}
                                        className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 flex items-center gap-2 disabled:opacity-70">
                                        {createLoading && <Loader2 size={16} className="animate-spin" />}
                                        Create Account
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Users Grid */}
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[...Array(pageSize)].map((_, i) => (
                                <div key={i} className="rounded-2xl p-5 border border-gray-100 bg-white animate-pulse">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-100" />
                                            <div className="space-y-2">
                                                <div className="h-3.5 w-24 bg-gray-100 rounded-full" />
                                                <div className="h-2.5 w-14 bg-gray-50 rounded-full" />
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="w-8 h-8 bg-gray-50 rounded-lg" />
                                            <div className="w-8 h-8 bg-gray-50 rounded-lg" />
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-gray-50 flex justify-between">
                                        <div className="h-2.5 w-32 bg-gray-50 rounded-full" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 border border-gray-100">
                                <Users size={28} className="text-gray-300" />
                            </div>
                            {users.length === 0 ? (
                                <>
                                    <p className="font-bold text-gray-500">No users yet</p>
                                    <p className="text-sm text-gray-400 mt-1">Create the first user to get started</p>
                                </>
                            ) : (
                                <>
                                    <p className="font-bold text-gray-500">No users match</p>
                                    <p className="text-sm text-gray-400 mt-1">Try a different search or filter</p>
                                    <button onClick={() => { handleSearchUser(''); handleRoleFilter('all'); }}
                                        className="mt-4 text-xs text-primary-600 hover:text-primary-700 font-medium">
                                        Clear filters
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {pagedUsers.map(u => (
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
                                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-white text-purple-700 border border-purple-200' : 'bg-gray-100 text-gray-500'}`}>
                                                    {u.role}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 items-center">
                                            <button onClick={(e) => { e.stopPropagation(); setResetPasswordUser(u); }}
                                                className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors" title="Reset Password">
                                                <KeyRound size={16} />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); setDeleteData({ type: 'user', id: u._id, name: u.username }); }}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete User">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-gray-50 flex justify-between items-center text-xs text-gray-400">
                                        <span className="font-mono truncate max-w-[160px]">ID: {u._id}</span>
                                        <ExternalLink size={13} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between pt-2">
                                <p className="text-xs text-gray-400">
                                    Showing <span className="font-bold text-gray-600">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredUsers.length)}</span> of <span className="font-bold text-gray-600">{filteredUsers.length}</span> users
                                </p>
                                <div className="flex items-center gap-1">
                                    {/* First */}
                                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors" title="First page">
                                        <ChevronsLeft size={15} />
                                    </button>
                                    {/* Prev */}
                                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors" title="Previous">
                                        <ChevronLeft size={15} />
                                    </button>

                                    {/* Page numbers */}
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                        .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                                            if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                                            acc.push(p);
                                            return acc;
                                        }, [])
                                        .map((p, i) => p === '...'
                                            ? <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-xs">…</span>
                                            : <button key={p} onClick={() => setCurrentPage(p as number)}
                                                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                                    currentPage === p
                                                        ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20'
                                                        : 'text-gray-500 hover:bg-gray-100'
                                                }`}>{p}</button>
                                        )
                                    }

                                    {/* Next */}
                                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors" title="Next">
                                        <ChevronRight2 size={15} />
                                    </button>
                                    {/* Last */}
                                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
                                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors" title="Last page">
                                        <ChevronsRight size={15} />
                                    </button>
                                </div>
                            </div>
                        )}
                        </>
                    )}
                </div>
                )} {/* end activeTab === 'users' */}
            </div>

            {/* User Details Modal (Popup) */}
            <UserDetailsModal 
                user={viewingUser}
                loading={loadingUserDetails}
                onClose={() => setViewingUser(null)}
                onAssign={() => { 
                    if (viewingUser) setGrantAccessUser(viewingUser);
                }}
                onRefresh={refreshViewingUser}
                storages={storages}
            />

            {/* Grant Access Modal — replaces old FolderPicker-based modal */}
            <GrantAccessModal
                isOpen={!!grantAccessUser}
                targetUsername={grantAccessUser?.username || ''}
                onClose={() => setGrantAccessUser(null)}
                onSuccess={() => {
                    setGrantAccessUser(null);
                    if (viewingUser && grantAccessUser && viewingUser._id === grantAccessUser._id) {
                        refreshViewingUser();
                    } else {
                        loadData();
                    }
                }}
            />

            <DeleteConfirmModal 
                isOpen={!!deleteData} 
                title={`Delete ${deleteData?.type === 'user' ? 'User' : 'Storage'}?`}
                message={`Are you sure you want to delete ${deleteData?.type} "${deleteData?.name}"? This action cannot be undone.`}
                onClose={() => setDeleteData(null)}
                onConfirm={confirmDelete}
                loading={deleteLoading}
            />

            <ResetPasswordModal
                user={resetPasswordUser}
                onClose={() => setResetPasswordUser(null)}
            />
        </div>
    );
};
