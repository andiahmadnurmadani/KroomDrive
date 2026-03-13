
import React, { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { UserPlus, Loader2, CheckCircle2, Shield, Folder, ChevronRight, Users, UserX, Key, FolderInput, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import * as api from '../../services/api';
import { Permissions, FileItem, User } from '../../types';
import { useToast } from '../../contexts/ToastContext';

// Helper component for Folder Picking
const FolderPicker: React.FC<{ onSelect: (path: string) => void }> = ({ onSelect }) => {
    const [drives, setDrives] = useState<string[]>([]);
    const [currentBrowsePath, setCurrentBrowsePath] = useState('');
    const [items, setItems] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedPath, setSelectedPath] = useState('');

    useEffect(() => {
        // Load drives initially
        api.getStorageInfo().then(stats => {
            const drvs = stats.map(s => s.drive.includes('\\') || s.drive.includes('/') ? s.drive : s.drive + '\\');
            setDrives(drvs);
            if (drvs.length > 0) browse(drvs[0]);
        });
    }, []);

    const browse = async (path: string) => {
        setLoading(true);
        try {
            const list = await api.getList(path);
            setItems(list.filter(i => i.type === 'folder')); // Only show folders
            setCurrentBrowsePath(path);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    const handleSelect = (path: string) => {
        setSelectedPath(path);
        onSelect(path);
    }

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden h-64 flex flex-col bg-white shadow-sm">
            <div className="bg-gray-50 p-2 border-b border-gray-200 flex gap-2 overflow-x-auto scrollbar-hide">
                {drives.map(d => (
                    <button 
                        key={d} 
                        onClick={() => browse(d)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex-shrink-0 ${currentBrowsePath.startsWith(d) ? 'bg-primary-600 text-white border-primary-600 shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                        {d}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {/* Back button if not root */}
                {drives.every(d => d !== currentBrowsePath) && (
                    <button 
                        onClick={() => {
                            const parent = currentBrowsePath.split(/[\\/]/).slice(0, -1).join('/') || drives[0]; 
                             // Basic parent handling, usually rely on drive clicks to reset
                             // But let's allow basic "up" if separator exists
                             if(currentBrowsePath.includes('/') || currentBrowsePath.includes('\\')) {
                                 const sep = currentBrowsePath.includes('\\') ? '\\' : '/';
                                 const parts = currentBrowsePath.split(sep);
                                 parts.pop();
                                 let newPath = parts.join(sep);
                                 if(!newPath) newPath = drives[0]; // fallback
                                 // Ideally we should just rely on Drives, but this is ok
                             }
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <ChevronRight size={12} className="rotate-180" /> Back / Reset
                    </button>
                )}
                
                <div className="px-3 py-1.5 text-xs text-gray-500 font-mono break-all bg-gray-50 rounded mb-2 border border-gray-100 flex items-center gap-2">
                    <Folder size={12} className="text-gray-400" />
                    {currentBrowsePath}
                </div>

                {loading ? (
                    <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary-300" /></div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                        <Folder size={24} className="mb-2 opacity-20" />
                        <span className="text-xs">No subfolders found</span>
                    </div>
                ) : (
                    items.map(item => (
                        <div key={item.path} className="flex items-center gap-1 group">
                            <button
                                onClick={() => handleSelect(item.path)}
                                className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-all ${selectedPath === item.path ? 'bg-primary-50 text-primary-700 font-medium ring-1 ring-primary-200' : 'hover:bg-gray-50 text-gray-700'}`}
                            >
                                <Folder size={16} className={`transition-colors ${selectedPath === item.path ? 'fill-primary-200 text-primary-600' : 'fill-gray-50 text-gray-400 group-hover:text-primary-500'}`} />
                                <span className="truncate">{item.name}</span>
                            </button>
                            <button 
                                onClick={() => browse(item.path)}
                                className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Open Folder"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    ))
                )}
            </div>
            {selectedPath && (
                 <div className="p-3 bg-primary-50 border-t border-primary-100 text-xs text-primary-800 font-medium flex items-center gap-2 animate-in slide-in-from-bottom-2">
                    <CheckCircle2 size={14} className="text-primary-600" />
                    <span className="truncate">Selected: <span className="font-mono">{selectedPath}</span></span>
                 </div>
            )}
        </div>
    )
}

interface AdminModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose }) => {
    const { handleError } = useToast();
    const [activeTab, setActiveTab] = useState<'grant' | 'manage'>('grant');
    
    // Grant Access State
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [selectedPath, setSelectedPath] = useState('');
    const [permissions, setPermissions] = useState<Permissions>({ read: true, write: true, delete: false });
    const [loadingAction, setLoadingAction] = useState(false);

    // Manage Users State
    const [userList, setUserList] = useState<User[]>([]);
    const [loadingList, setLoadingList] = useState(false);
    const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
    const [expandedUserDetails, setExpandedUserDetails] = useState<User | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    
    // Confirmation State
    const [revokeData, setRevokeData] = useState<{userId: string, path: string} | null>(null);
    const [revokeLoading, setRevokeLoading] = useState(false);

    const [statusMsg, setStatusMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

    // Reset when modal opens
    useEffect(() => {
        if(isOpen) {
            setStatusMsg(null);
            setUsername('');
            setPassword('');
            setSelectedPath('');
            setExpandedUserId(null);
        }
    }, [isOpen]);

    // Auto-load users when switching to manage tab
    useEffect(() => {
        if (isOpen && activeTab === 'manage') {
            loadUsers();
        }
    }, [isOpen, activeTab]);

    const loadUsers = async () => {
        setLoadingList(true);
        try {
            const list = await api.getUsers();
            setUserList(list);
        } catch (e: any) {
            setStatusMsg({ type: 'error', text: e.message });
            handleError(e);
        } finally {
            setLoadingList(false);
        }
    };

    const toggleUserExpand = async (id: string) => {
        if (expandedUserId === id) {
            setExpandedUserId(null);
            setExpandedUserDetails(null);
        } else {
            setExpandedUserId(id);
            setLoadingDetails(true);
            try {
                const details = await api.getUserDetails(id);
                setExpandedUserDetails(details);
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingDetails(false);
            }
        }
    }

    const handleGrantAccess = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !selectedPath) {
             setStatusMsg({ type: 'error', text: "Username and Folder are required" });
             return;
        }

        setLoadingAction(true);
        setStatusMsg(null);

        try {
            // 1. If password provided, attempt to create user
            let created = false;
            if (password) {
                try {
                    await api.createUser(username, password);
                    created = true;
                } catch (err: any) {
                    console.warn("Create user failed (might exist):", err.message);
                    // We continue to share logic even if user create failed (assuming user exists)
                    // But if it failed for other reasons, share might work if user exists.
                }
            }

            // 2. Share the folder
            await api.sharePath(username, selectedPath, permissions);

            setStatusMsg({ 
                type: 'success', 
                text: created 
                    ? `User '${username}' created & access granted to selected folder.` 
                    : `Access granted to existing user '${username}'.` 
            });
            
            // Clear inputs for next entry
            setUsername('');
            setPassword('');
            // We keep the path and permissions as admin might want to add another user to same folder
        } catch (err: any) {
            setStatusMsg({ type: 'error', text: err.message });
            handleError(err);
        } finally {
            setLoadingAction(false);
        }
    };

    const confirmRevoke = async () => {
        if (!revokeData) return;
        setRevokeLoading(true);
        try {
            await api.revokePermission(revokeData.userId, revokeData.path);
            const details = await api.getUserDetails(revokeData.userId);
            setExpandedUserDetails(details);
            setRevokeData(null);
        } catch (e: any) {
            handleError(e);
        } finally {
            setRevokeLoading(false);
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Admin Console">
            <div className="flex flex-col h-[70vh] min-h-[500px]">
                {/* Tabs */}
                <div className="flex p-1 bg-gray-100 rounded-xl mb-6 flex-shrink-0">
                    <button 
                        onClick={() => { setActiveTab('grant'); setStatusMsg(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'grant' ? 'bg-white text-primary-600 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                    >
                        <UserPlus size={16} />
                        Grant Access
                    </button>
                    <button 
                        onClick={() => { setActiveTab('manage'); setStatusMsg(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'manage' ? 'bg-white text-primary-600 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                    >
                        <Shield size={16} />
                        Manage Users
                    </button>
                </div>

                {/* Feedback */}
                {statusMsg && (
                    <div className={`p-4 rounded-xl text-sm mb-6 flex-shrink-0 flex items-start gap-3 border animate-in slide-in-from-top-2 ${statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border-green-100' : 'bg-red-50 text-red-800 border-red-100'}`}>
                        {statusMsg.type === 'success' ? <CheckCircle2 size={18} className="mt-0.5" /> : <Shield size={18} className="mt-0.5" />}
                        <div className="font-medium">{statusMsg.text}</div>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                    {activeTab === 'grant' ? (
                        <form onSubmit={handleGrantAccess} className="space-y-6">
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Username</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Users size={16} className="text-gray-400" />
                                        </div>
                                        <input 
                                            type="text" 
                                            required
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all font-medium text-gray-700"
                                            placeholder="Enter username"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Password <span className="normal-case font-normal text-gray-400">(New Users Only)</span></label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Key size={16} className="text-gray-400" />
                                        </div>
                                        <input 
                                            type="password" 
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all font-medium text-gray-700"
                                            placeholder="Leave empty if user exists"
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <FolderInput size={14} />
                                    Assign Folder Access
                                </label>
                                <FolderPicker onSelect={setSelectedPath} />
                            </div>

                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Access Level</label>
                                <div className="flex gap-3">
                                    {['read', 'write', 'delete'].map(perm => {
                                        const isChecked = permissions[perm as keyof Permissions];
                                        return (
                                            <label key={perm} className={`flex-1 relative flex items-center justify-center gap-2 px-4 py-3 rounded-xl border cursor-pointer transition-all select-none ${isChecked ? 'bg-white border-primary-500 shadow-md shadow-primary-500/10' : 'bg-transparent border-gray-200 hover:bg-gray-100 hover:border-gray-300'}`}>
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-primary-500 border-primary-500' : 'bg-white border-gray-300'}`}>
                                                    {isChecked && <CheckCircle2 size={12} className="text-white" />}
                                                </div>
                                                <input 
                                                    type="checkbox" 
                                                    checked={isChecked}
                                                    onChange={(e) => setPermissions(p => ({...p, [perm]: e.target.checked}))}
                                                    className="hidden"
                                                /> 
                                                <span className={`capitalize text-sm font-bold ${isChecked ? 'text-primary-700' : 'text-gray-500'}`}>{perm}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                disabled={loadingAction || !selectedPath || !username}
                                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
                            >
                                {loadingAction ? <Loader2 size={20} className="animate-spin" /> : <UserPlus size={20} />}
                                Grant Access Now
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-3">
                            {loadingList ? (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                    <Loader2 className="animate-spin mb-3 text-primary-500" size={32} />
                                    <span>Loading users...</span>
                                </div>
                            ) : userList.length === 0 ? (
                                <div className="text-center text-gray-500 py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                    <Users size={48} className="mx-auto text-gray-300 mb-3" />
                                    <p>No users found</p>
                                </div>
                            ) : (
                                userList.map(u => (
                                    <div key={u._id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm transition-shadow hover:shadow-md">
                                        <button 
                                            onClick={() => toggleUserExpand(u._id)}
                                            className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${u.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                                    {u.username.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="text-left">
                                                    <div className="font-bold text-gray-900">{u.username}</div>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {u.role}
                                                        </span>
                                                        <span className="text-xs text-gray-400">• ID: {u._id}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`p-2 rounded-full transition-colors ${expandedUserId === u._id ? 'bg-gray-100 text-gray-900' : 'text-gray-400'}`}>
                                                 {expandedUserId === u._id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            </div>
                                        </button>
                                        
                                        {expandedUserId === u._id && (
                                            <div className="bg-gray-50/50 border-t border-gray-200 p-4 animate-in slide-in-from-top-2">
                                                {loadingDetails ? (
                                                     <div className="flex justify-center p-4"><Loader2 className="animate-spin text-gray-400" size={20} /></div>
                                                ) : expandedUserDetails?.paths?.length === 0 ? (
                                                    <div className="text-sm text-gray-500 italic p-2 flex items-center gap-2">
                                                        <Folder size={16} className="text-gray-300" />
                                                        No folder access assigned
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Access List</p>
                                                            <span className="text-xs text-gray-400">{expandedUserDetails?.paths.length} folders</span>
                                                        </div>
                                                        {expandedUserDetails?.paths.map((p, idx) => (
                                                            <div key={idx} className="bg-white border border-gray-200 rounded-xl p-3 flex items-start justify-between gap-3 shadow-sm hover:border-primary-200 transition-colors">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <Folder size={16} className="text-primary-500 flex-shrink-0 fill-primary-50" />
                                                                        <span className="text-sm font-semibold text-gray-700 truncate break-all" title={p.path}>{p.path}</span>
                                                                    </div>
                                                                    <div className="flex gap-2 flex-wrap">
                                                                        {p.permissions.read && <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 font-medium rounded-full border border-green-100">Read</span>}
                                                                        {p.permissions.write && <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 font-medium rounded-full border border-blue-100">Write</span>}
                                                                        {p.permissions.delete && <span className="text-[10px] px-2 py-0.5 bg-red-50 text-red-700 font-medium rounded-full border border-red-100">Delete</span>}
                                                                    </div>
                                                                </div>
                                                                <button 
                                                                    onClick={() => setRevokeData({ userId: u._id, path: p.path })}
                                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors group"
                                                                    title="Revoke Access"
                                                                >
                                                                    <UserX size={18} className="group-hover:scale-110 transition-transform" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Revoke Confirmation Overlay */}
            {revokeData && (
                <div className="absolute inset-0 z-[70] bg-white/80 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white border border-gray-100 shadow-xl rounded-2xl p-6 w-full max-w-sm text-center">
                        <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
                            <AlertTriangle size={24} />
                        </div>
                        <h4 className="font-bold text-lg text-gray-900 mb-1">Revoke Access?</h4>
                        <p className="text-sm text-gray-500 mb-6">
                            Are you sure you want to remove access to <br/>
                            <span className="font-mono bg-gray-100 px-1 rounded font-bold text-gray-700">{revokeData.path}</span>?
                        </p>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setRevokeData(null)}
                                className="flex-1 py-2 text-gray-600 font-bold hover:bg-gray-50 rounded-lg"
                                disabled={revokeLoading}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={confirmRevoke}
                                disabled={revokeLoading}
                                className="flex-1 py-2 bg-red-500 text-white font-bold rounded-lg shadow-lg shadow-red-500/20 hover:bg-red-600 flex items-center justify-center gap-2"
                            >
                                {revokeLoading && <Loader2 size={16} className="animate-spin" />}
                                Revoke
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};
