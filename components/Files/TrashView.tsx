
import React, { useState, useEffect } from 'react';
import { 
    Trash2, RotateCcw, Ban, Search, Loader2, 
    HardDrive, Calendar, File as FileIcon, Folder, AlertTriangle, X 
} from 'lucide-react';
import { TrashItem, FileItem } from '../../types';
import * as api from '../../services/api';
import { useFile } from '../../contexts/FileContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { formatDate } from '../../utils/formatters';

interface TrashViewProps {
    onBack: () => void;
}

export const TrashView: React.FC<TrashViewProps> = ({ onBack }) => {
    const { user } = useAuth();
    const { assignedDrives, storageStats, refreshFiles } = useFile();
    const { showToast, handleError } = useToast();
    
    const [items, setItems] = useState<TrashItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedDrive, setSelectedDrive] = useState<string>('');
    const [drives, setDrives] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmEmpty, setConfirmEmpty] = useState(false);
    
    // Action Loading States
    const [emptyLoading, setEmptyLoading] = useState(false);
    const [restoreLoadingId, setRestoreLoadingId] = useState<string | null>(null);

    // Initialize Drives
    useEffect(() => {
        if (!user) return;
        const availableDrives = assignedDrives.map(d => d.drive)
            .concat(storageStats.map(s => s.drive));
        
        // Remove duplicates and normalize
        const uniqueDrives = Array.from(new Set(availableDrives.map(d => 
            d.includes('\\') || d.includes('/') ? d : d + '\\'
        )));

        setDrives(uniqueDrives);
        if (uniqueDrives.length > 0) {
            setSelectedDrive(uniqueDrives[0]);
        }
    }, [user, assignedDrives, storageStats]);

    // Fetch Trash Items
    useEffect(() => {
        if (!selectedDrive) return;
        
        // GUARD: Only Admin should fetch trash list
        // User paths do not grant permission to the root .trash folder in the current backend logic
        if (user?.role !== 'admin') {
            return;
        }

        const loadTrash = async () => {
            setLoading(true);
            try {
                const res = await api.getTrash(selectedDrive);
                // Sort by deleted date desc
                res.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
                setItems(res);
            } catch (e: any) {
                // Silently fail if not authorized or empty
                if (e.message !== 'Unauthorized' && !e.message.includes('permission')) {
                     console.error("Failed to load trash", e);
                }
                setItems([]);
            } finally {
                setLoading(false);
            }
        };

        loadTrash();
    }, [selectedDrive, user]);

    const handleRestore = async (item: TrashItem) => {
        // Backend handles destination logic via metadata, we just pass the trash path
        setRestoreLoadingId(item.path);
        try {
            await api.restoreItem(item.path);
            setItems(prev => prev.filter(i => i.path !== item.path));
            refreshFiles();
            showToast('Item restored successfully', 'success');
        } catch (e: any) {
            handleError(e);
        } finally {
            setRestoreLoadingId(null);
        }
    };

    const handleEmptyTrash = async () => {
        setEmptyLoading(true);
        try {
            await api.emptyTrash(selectedDrive);
            setItems([]);
            setConfirmEmpty(false);
            showToast('Recycle bin emptied', 'success');
        } catch (e: any) {
            handleError(e);
            // Modal stays open on error
        } finally {
            setEmptyLoading(false);
        }
    };

    const filteredItems = items.filter(i => 
        i.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // If user ends up here but is not admin, show access denied state
    if (user?.role !== 'admin') {
         return (
             <div className="h-full flex flex-col items-center justify-center bg-gray-50/30 text-center p-6">
                 <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                     <Ban className="text-red-500" size={32} />
                 </div>
                 <h2 className="text-xl font-bold text-gray-800">Access Restricted</h2>
                 <p className="text-gray-500 max-w-sm mt-2">Only administrators can access the recycle bin directly.</p>
                 <button onClick={onBack} className="mt-6 px-6 py-2 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-100 transition-colors">
                     Go Back
                 </button>
             </div>
         )
    }

    return (
        <div className="h-full flex flex-col bg-gray-50/30">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-red-50 text-red-600 rounded-xl">
                        <Trash2 size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-[#2B3674]">Recycle Bin</h1>
                        <p className="text-xs text-gray-400">Restore deleted items or clean up storage</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                     {/* Drive Selector if multiple */}
                     {drives.length > 1 && (
                        <div className="relative">
                            <HardDrive size={14} className="absolute left-3 top-3 text-gray-400" />
                            <select 
                                value={selectedDrive}
                                onChange={(e) => setSelectedDrive(e.target.value)}
                                className="pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer hover:bg-gray-100 transition-colors"
                            >
                                {drives.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                     )}

                    {items.length > 0 && user?.role === 'admin' && (
                        <button 
                            onClick={() => setConfirmEmpty(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg font-bold hover:bg-red-100 transition-colors"
                        >
                            <Ban size={18} />
                            <span className="hidden sm:inline">Empty Bin</span>
                        </button>
                    )}
                    
                    <button 
                        onClick={onBack}
                        className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-lg transition-colors"
                        title="Close"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Toolbar */}
                <div className="px-6 py-3 flex items-center gap-4 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
                     <div className="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary-100 w-full max-w-md shadow-sm">
                        <Search size={16} className="text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search deleted items..." 
                            className="bg-transparent border-none outline-none text-sm w-full ml-2"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                     </div>
                     <div className="text-xs text-gray-400 font-medium ml-auto">
                        {filteredItems.length} items found in {selectedDrive}
                     </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                            <Loader2 className="animate-spin text-primary-500 w-8 h-8" />
                            <span className="text-sm font-medium">Loading deleted items...</span>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-white border border-dashed border-gray-200 rounded-2xl m-4">
                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                <Trash2 size={32} className="opacity-20" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-600 mb-1">Recycle Bin is Empty</h3>
                            <p className="text-sm">No deleted items found in this drive.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <table className="w-full text-left text-sm text-gray-600">
                                <thead className="bg-gray-50/80 border-b border-gray-100 font-bold text-gray-400 uppercase tracking-wider text-xs">
                                    <tr>
                                        <th className="px-6 py-4">Name</th>
                                        <th className="px-6 py-4 w-48">Date Deleted</th>
                                        <th className="px-6 py-4 w-32 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredItems.map(item => {
                                        // Display name cleanup (remove timestamp suffix if standard format)
                                        const parts = item.name.split('__');
                                        const displayName = parts.length > 1 ? parts.slice(0, -1).join('__') : item.name;
                                        const isFolder = !item.name.includes('.'); // Simple heuristic, backend usually knows better
                                        const isRestoring = restoreLoadingId === item.path;

                                        return (
                                            <tr key={item.path} className="hover:bg-primary-50/30 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
                                                            {isFolder ? <Folder size={18} /> : <FileIcon size={18} />}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-bold text-gray-900 truncate max-w-md" title={displayName}>{displayName}</div>
                                                            <div className="text-xs text-gray-400 font-mono truncate max-w-xs">{item.path}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-500 flex items-center gap-2">
                                                    <Calendar size={14} className="text-gray-400" />
                                                    {formatDate(item.deletedAt)}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button 
                                                        onClick={() => handleRestore(item)}
                                                        disabled={!!restoreLoadingId || emptyLoading}
                                                        className="px-3 py-1.5 bg-white border border-gray-200 text-primary-600 rounded-lg text-xs font-bold shadow-sm hover:bg-primary-50 hover:border-primary-200 transition-all flex items-center gap-1 ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isRestoring ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                                        {isRestoring ? 'Restoring' : 'Restore'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Empty Trash Confirmation Modal */}
            {confirmEmpty && (
                <div className="fixed inset-0 z-[80] bg-[#2B3674]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="text-red-600" size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Empty Recycle Bin?</h3>
                            <p className="text-gray-500 text-sm leading-relaxed mb-1">
                                All items in <span className="font-mono font-bold bg-gray-100 px-1 rounded">{selectedDrive}</span> will be permanently deleted.
                            </p>
                            <p className="text-red-500 text-xs font-bold uppercase tracking-wide">This action cannot be undone.</p>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 flex gap-3">
                            <button 
                                onClick={() => setConfirmEmpty(false)} 
                                disabled={emptyLoading}
                                className="flex-1 py-2.5 text-gray-600 font-bold hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleEmptyTrash}
                                disabled={emptyLoading}
                                className="flex-1 py-2.5 bg-red-600 text-white font-bold hover:bg-red-700 rounded-xl shadow-lg shadow-red-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {emptyLoading && <Loader2 size={16} className="animate-spin" />}
                                {emptyLoading ? 'Cleaning...' : 'Permanently Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
