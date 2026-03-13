
import React, { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { TrashItem } from '../../types';
import { FileIcon } from '../Icons';
import { formatDate } from '../../utils/formatters';
import { Loader2, Trash2, RotateCcw, Ban } from 'lucide-react';
import * as api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useFile } from '../../contexts/FileContext';
import { useToast } from '../../contexts/ToastContext';

interface TrashModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEmptyTrash: () => void;
}

const PathUtils = {
  getSeparator: (path: string) => {
    return path.includes('\\') ? '\\' : '/';
  },
  join: (base: string, name: string) => {
    const sep = PathUtils.getSeparator(base);
    const cleanBase = base.endsWith(sep) ? base.slice(0, -1) : base;
    return `${cleanBase}${sep}${name}`;
  }
};

export const TrashModal: React.FC<TrashModalProps> = ({ isOpen, onClose, onEmptyTrash }) => {
    const { user } = useAuth();
    const { currentPath, refreshFiles, storageStats, assignedDrives } = useFile();
    const { showToast, handleError } = useToast();
    const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
    const [trashLoading, setTrashLoading] = useState(false);

    // Get current drive based on path
    const getCurrentDrive = () => {
        if (!currentPath || !user) return '';
        // Combine all possible roots
        const availableDrives: string[] = assignedDrives.map(d => d.drive)
            .concat(storageStats.map(s => s.drive));
        
        // Find best match (longest prefix match logic is ideal, but simple startsWith works for roots)
        return availableDrives.find(p => currentPath.startsWith(p)) || availableDrives[0] || '';
    }

    const loadTrash = async () => {
        const drive = getCurrentDrive();
        if (!drive) return;
        setTrashLoading(true);
        try {
            const items = await api.getTrash(drive);
            items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
            setTrashItems(items);
        } catch (e) {
            // Trash might be disabled or not accessible
            console.warn("Trash load error", e);
            setTrashItems([]);
        } finally {
            setTrashLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadTrash();
        }
    }, [isOpen, currentPath]);

    const handleRestore = async (item: TrashItem) => {
        try {
            await api.restoreItem(item.path);
            setTrashItems(prev => prev.filter(i => i.path !== item.path));
            refreshFiles();
            showToast('Item restored successfully', 'success');
        } catch (err: any) {
            handleError(err);
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Recycle Bin">
          <div className="flex flex-col h-[500px]">
            <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-2">
                   <p className="text-sm text-gray-500">Items deleted from <span className="font-mono font-medium text-gray-700 bg-gray-100 rounded px-1">{getCurrentDrive()}</span></p>
                   <button onClick={loadTrash} className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Refresh"><RotateCcw size={16} /></button>
               </div>
               {trashItems.length > 0 && user?.role === 'admin' && (
                  <button 
                    onClick={onEmptyTrash} 
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Ban size={14} />
                    Empty Recycle Bin
                  </button>
               )}
            </div>
  
            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
               {trashLoading ? (
                 <div className="flex items-center justify-center h-full">
                   <Loader2 className="animate-spin text-gray-400" />
                 </div>
               ) : trashItems.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <Trash2 size={32} className="mb-2 opacity-20" />
                    <span className="text-sm">Recycle bin is empty</span>
                 </div>
               ) : (
                  <table className="w-full text-left text-sm text-gray-600">
                     <thead className="bg-gray-50 sticky top-0">
                        <tr>
                           <th className="px-4 py-2 font-medium">Original Name</th>
                           <th className="px-4 py-2 font-medium w-32">Deleted</th>
                           <th className="px-4 py-2 font-medium w-24 text-right">Action</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                        {trashItems.map((item) => {
                           const displayName = item.name.split('__').pop() || item.name;
                           return (
                              <tr key={item.path} className="hover:bg-gray-50">
                                 <td className="px-4 py-2">
                                    <div className="flex items-center space-x-2">
                                       <FileIcon type="file" name={displayName} className="w-4 h-4 text-gray-400" />
                                       <span className="truncate max-w-[200px]" title={item.name}>{displayName}</span>
                                    </div>
                                 </td>
                                 <td className="px-4 py-2 text-xs text-gray-500">
                                    {formatDate(item.deletedAt)}
                                 </td>
                                 <td className="px-4 py-2 text-right">
                                    <button 
                                      onClick={() => handleRestore(item)}
                                      className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
                                      title="Restore to current folder"
                                    >
                                      <RotateCcw size={14} />
                                    </button>
                                 </td>
                              </tr>
                           );
                        })}
                     </tbody>
                  </table>
               )}
            </div>
            
            <div className="mt-4 flex justify-end">
               <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Close</button>
            </div>
          </div>
        </Modal>
    );
};
