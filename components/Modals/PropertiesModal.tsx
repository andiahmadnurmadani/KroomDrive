import React, { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { FileItem, FolderSizeResponse } from '../../types';
import { FileIcon } from '../Icons';
import { formatSize, formatDate } from '../../utils/formatters';
import { Loader2 } from 'lucide-react';
import * as api from '../../services/api';

interface PropertiesModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: FileItem | null;
}

export const PropertiesModal: React.FC<PropertiesModalProps> = ({ isOpen, onClose, item }) => {
    const [folderStats, setFolderStats] = useState<FolderSizeResponse | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);

    useEffect(() => {
        if (isOpen && item && item.type === 'folder') {
            setLoadingStats(true);
            api.getFolderSize(item.path)
                .then(setFolderStats)
                .catch(console.error)
                .finally(() => setLoadingStats(false));
        } else {
            setFolderStats(null);
        }
    }, [isOpen, item]);

    if (!item) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Properties">
          <div className="space-y-4">
             <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
               <div className="bg-white p-3 rounded-lg shadow-sm">
                 <FileIcon type={item.type} name={item.name} className="w-10 h-10" />
               </div>
               <div className="flex-1 min-w-0">
                 <h4 className="font-semibold text-gray-900 truncate" title={item.name}>{item.name}</h4>
                 <p className="text-sm text-gray-500">{item.type === 'folder' ? 'Folder' : item.name.split('.').pop()?.toUpperCase() + ' File'}</p>
               </div>
             </div>

             <div className="grid grid-cols-3 gap-y-3 text-sm">
                <div className="text-gray-500 col-span-1">Location</div>
                <div className="text-gray-900 col-span-2 truncate font-mono text-xs bg-gray-50 p-1 rounded" title={item.path}>{item.path}</div>

                <div className="text-gray-500 col-span-1">Last Modified</div>
                <div className="text-gray-900 col-span-2">{item.modified ? formatDate(item.modified) : '-'}</div>

                {item.type === 'file' && (
                  <>
                    <div className="text-gray-500 col-span-1">Size</div>
                    <div className="text-gray-900 col-span-2 font-medium">{formatSize(item.size || 0)}</div>
                  </>
                )}
             </div>

             {item.type === 'folder' && (
               <div className="border-t border-gray-100 pt-3 mt-2">
                 <h5 className="font-medium text-gray-900 mb-2">Folder Statistics</h5>
                 {loadingStats ? (
                   <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                     <Loader2 size={14} className="animate-spin" />
                     Calculating size...
                   </div>
                 ) : folderStats ? (
                   <div className="grid grid-cols-3 gap-y-2 text-sm">
                      <div className="text-gray-500">Total Size</div>
                      <div className="text-gray-900 col-span-2 font-medium">{formatSize(folderStats.totalBytes)}</div>
                      
                      <div className="text-gray-500">File Count</div>
                      <div className="text-gray-900 col-span-2">{folderStats.files} files</div>
                   </div>
                 ) : (
                   <div className="text-red-500 text-sm">Failed to load statistics</div>
                 )}
               </div>
             )}

             <div className="flex justify-end pt-2">
               <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg">Close</button>
             </div>
          </div>
        </Modal>
    );
};