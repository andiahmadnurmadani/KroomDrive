
import React, { useRef, useEffect } from 'react';
import { 
  Download, Copy, Scissors, Edit2, Trash2, Info, 
  ExternalLink, FolderPlus, ClipboardCheck, CheckCircle2,
  FileArchive, Link, GitBranch, FileCode2
} from 'lucide-react';
import { FileItem } from '../../types';
import { useFile } from '../../contexts/FileContext';
import { useToast } from '../../contexts/ToastContext';
import * as api from '../../services/api';

interface ContextMenuState {
    x: number;
    y: number;
    item: FileItem | null; 
}

interface ContextMenuProps {
    contextMenu: ContextMenuState;
    onClose: () => void;
    onRename: (item: FileItem) => void;
    onDelete: (item: FileItem) => void;
    onProperties: (item: FileItem) => void;
    onNewFolder: () => void;
    onNavigate: (path: string) => void;
    onCopy: (item: FileItem) => void;
    onCut: (item: FileItem) => void;
    onCopyPath: (item: FileItem) => void;
    onPaste: () => void;
    onOpenGit?: () => void;
    isGitRepo?: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ 
    contextMenu, 
    onClose,
    onRename,
    onDelete,
    onProperties,
    onNewFolder,
    onNavigate,
    onCopy,
    onCut,
    onCopyPath,
    onPaste,
    onOpenGit,
    isGitRepo,
}) => {
    const { clipboard, refreshFiles, currentPath, extractFile, selectedPaths, openEditor } = useFile();
    const { showToast, handleError } = useToast();
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // Handle outside clicks
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [onClose]);

    const handleDownload = (item: FileItem) => {
        if (item.type === 'folder') return;
        api.downloadFileBlob(item.path, item.name).catch(err => handleError(err));
        onClose();
    };

    const handleExtract = (item: FileItem) => {
        extractFile(item.path, currentPath);
        onClose();
    };

    const isZip = contextMenu.item?.name.toLowerCase().endsWith('.zip');
    
    // Check if multiple items are selected and the right-clicked item is one of them
    const isMultiSelect = selectedPaths.length > 1 && contextMenu.item && selectedPaths.includes(contextMenu.item.path);

    return (
        <div 
          ref={contextMenuRef}
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-100 py-1.5 w-56 text-sm text-gray-700 select-none animate-in fade-in zoom-in-95 duration-100 origin-top-left"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.item ? (
            <>
              <div className="px-2 py-1.5 mb-1 border-b border-gray-50 bg-gray-50/50">
                 <div className="font-medium truncate text-xs text-gray-500 uppercase tracking-wider">
                     {isMultiSelect ? `${selectedPaths.length} items selected` : contextMenu.item.name}
                 </div>
              </div>

              {!isMultiSelect && (
                  <>
                      {contextMenu.item.type === 'folder' ? (
                        <button 
                            onClick={() => { onNavigate(contextMenu.item!.path); onClose(); }}
                            className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
                        >
                            <ExternalLink size={16} /> Open
                        </button>
                      ) : (
                        <>
                            {/* Open in Editor — available for ALL files */}
                            <button
                                onClick={() => { openEditor(contextMenu.item!.path); onClose(); }}
                                className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors font-medium"
                            >
                                <FileCode2 size={16} className="text-primary-500" /> Open in Editor
                            </button>
                            <button 
                                onClick={() => handleDownload(contextMenu.item!)}
                                className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
                            >
                                <Download size={16} /> Download
                            </button>
                            {isZip && (
                                <button 
                                    onClick={() => handleExtract(contextMenu.item!)}
                                    className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
                                >
                                    <FileArchive size={16} /> Extract Here
                                </button>
                            )}
                        </>
                      )}
                      <div className="my-1 border-t border-gray-100"></div>
                  </>
              )}

              <button 
                onClick={() => { onCopy(contextMenu.item!); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
              >
                <Copy size={16} /> {isMultiSelect ? 'Copy Items' : 'Copy'}
              </button>
              <button 
                onClick={() => { onCut(contextMenu.item!); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
              >
                <Scissors size={16} /> {isMultiSelect ? 'Cut Items' : 'Cut'}
              </button>
              
              <button 
                onClick={() => { onCopyPath(contextMenu.item!); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
              >
                <Link size={16} /> Copy as path
              </button>

              <div className="my-1 border-t border-gray-100"></div>

              {!isMultiSelect && (
                  <button 
                    onClick={() => { onRename(contextMenu.item!); onClose(); }}
                    className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
                  >
                    <Edit2 size={16} /> Rename
                  </button>
              )}
              
              <button 
                onClick={() => { onDelete(contextMenu.item!); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-red-50 hover:text-red-600 flex items-center gap-2 transition-colors text-red-500"
              >
                <Trash2 size={16} /> {isMultiSelect ? `Delete ${selectedPaths.length} items` : 'Delete'}
              </button>

              <div className="my-1 border-t border-gray-100"></div>

              <button 
                onClick={() => { onProperties(contextMenu.item!); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
              >
                <Info size={16} /> Properties
              </button>
            </>
          ) : (
            /* Background Context Menu */
            <>
              <button 
                onClick={() => { onNewFolder(); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
              >
                <FolderPlus size={16} /> New Folder
              </button>
              
              {clipboard && (
                <button 
                  onClick={() => { onPaste(); onClose(); }}
                  className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
                >
                  <ClipboardCheck size={16} /> Paste {clipboard.items.length > 1 ? `(${clipboard.items.length})` : ''}
                </button>
              )}
              
              <div className="my-1 border-t border-gray-100"></div>

              <button 
                onClick={() => { refreshFiles(); onClose(); }}
                className="w-full text-left px-3 py-2 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
              >
                <CheckCircle2 size={16} /> Refresh
              </button>

              {isGitRepo && onOpenGit && (
                <>
                  <div className="my-1 border-t border-gray-100"></div>
                  <button
                    onClick={() => { onOpenGit(); onClose(); }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 hover:text-gray-800 flex items-center gap-2 transition-colors font-medium text-gray-700"
                  >
                    <GitBranch size={16} className="text-gray-500" />
                    Open Git Panel
                  </button>
                </>
              )}
            </>
          )}
        </div>
    );
};
