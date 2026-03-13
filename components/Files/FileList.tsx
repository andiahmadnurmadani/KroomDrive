
import React from 'react';
import { FileItem } from '../../types';
import { FileIcon } from '../Icons';
import { formatSize, formatDate } from '../../utils/formatters';
import { Loader2, AlertCircle, Search, Folder as FolderIcon, MoreVertical, CheckCircle2, Circle } from 'lucide-react';
import { useFile } from '../../contexts/FileContext';
import * as api from '../../services/api';

interface FileListProps {
  onContextMenu: (e: React.MouseEvent, item: FileItem | null) => void;
  onNavigate: (path: string) => void;
}

export const FileList: React.FC<FileListProps> = ({ onContextMenu, onNavigate }) => {
  const { 
    files, 
    viewMode, 
    loading, 
    error, 
    searchQuery, 
    refreshFiles, 
    selectedPaths, 
    toggleSelection, 
    clearSelection 
  } = useFile();

  const handleDownload = (item: FileItem) => {
    if (item.type === 'folder') return;
    api.downloadFileBlob(item.path, item.name).catch(err => console.error(err));
  };

  const handleDoubleClick = (file: FileItem) => {
      if (file.type === 'folder') {
          onNavigate(file.path);
      } else {
          handleDownload(file);
      }
  }

  const handleClick = (e: React.MouseEvent, file: FileItem) => {
      e.stopPropagation();
      // Logic: path, isMulti (Ctrl), isRange (Shift)
      toggleSelection(file.path, e.ctrlKey || e.metaKey, e.shiftKey);
  }

  const handleBackgroundClick = () => {
      clearSelection();
  }

  if (loading) {
    return (
        <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center backdrop-blur-[2px] rounded-2xl">
          <div className="flex flex-col items-center bg-white p-6 rounded-2xl shadow-xl">
            <Loader2 className="w-10 h-10 text-primary-600 animate-spin mb-3" />
            <span className="text-sm font-medium text-secondary">Loading files...</span>
          </div>
        </div>
    );
  }

  if (error) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
           <div className="bg-red-50 p-6 rounded-full mb-4 shadow-sm">
             <AlertCircle className="w-10 h-10 text-red-500" />
           </div>
           <h3 className="text-xl font-bold text-secondary mb-2">Access Denied</h3>
           <p className="text-gray-500 max-w-sm mb-6">{error}</p>
           <button 
             onClick={refreshFiles}
             className="px-6 py-2.5 bg-secondary text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200"
           >
             Try Again
           </button>
        </div>
    );
  }

  if (files.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 pointer-events-none"
             onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); (e.target as HTMLElement).style.pointerEvents = 'auto'; onContextMenu(e, null); }}>
          <div className="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center mb-6">
            {searchQuery ? <Search className="w-12 h-12 text-gray-300" /> : <FolderIcon className="w-12 h-12 text-gray-300" />}
          </div>
          <p className="font-medium text-lg text-gray-500">{searchQuery ? 'No results found' : 'This folder is empty'}</p>
        </div>
    );
  }

  return (
    <div 
        className="h-full pb-10" 
        onContextMenu={(e) => onContextMenu(e, null)}
        onClick={handleBackgroundClick}
    >
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-5">
          {files.map((file) => {
            const isSelected = selectedPaths.includes(file.path);
            return (
                <div 
                  key={file.path}
                  onClick={(e) => handleClick(e, file)}
                  onDoubleClick={() => handleDoubleClick(file)}
                  onContextMenu={(e) => onContextMenu(e, file)}
                  className={`group relative border rounded-[20px] p-5 flex flex-col items-center justify-center text-center shadow-sm transition-all duration-200 cursor-pointer select-none ${
                      isSelected 
                        ? 'bg-primary-50 border-primary-500 shadow-md ring-1 ring-primary-500' 
                        : 'bg-white border-transparent hover:shadow-soft hover:border-primary-100'
                  }`}
                >
                   {/* Selection Indicator */}
                   <div className={`absolute top-3 left-3 z-10 transition-all duration-200 ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100'}`}>
                       {isSelected ? (
                           <CheckCircle2 size={22} className="text-white fill-primary-600 shadow-sm" />
                       ) : (
                           <Circle size={22} className="text-gray-300 fill-white/80 hover:text-gray-400" />
                       )}
                   </div>

                   <div className={`w-14 h-14 mb-4 flex items-center justify-center rounded-2xl transition-transform duration-200 ${isSelected ? 'scale-110' : 'group-hover:scale-110 bg-gray-50'}`}>
                      <FileIcon type={file.type} name={file.name} className="w-8 h-8" />
                   </div>
                   <span className={`text-sm font-bold truncate w-full px-1 mb-1 ${isSelected ? 'text-primary-800' : 'text-secondary'}`} title={file.name}>{file.name}</span>
                   <span className="text-[11px] font-medium text-gray-400">{file.type === 'folder' ? 'Folder' : formatSize(file.size || 0)}</span>
                   
                   <button 
                      className={`absolute top-3 right-3 p-1 rounded-lg transition-all ${isSelected ? 'opacity-100 text-primary-600 hover:bg-primary-100' : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:bg-gray-100'}`}
                      onClick={(e) => { e.stopPropagation(); onContextMenu(e, file); }}
                   >
                      <MoreVertical size={16} />
                   </button>
                </div>
            );
          })}
        </div>
      ) : (
         <div className="bg-white rounded-[20px] shadow-sm border border-gray-100 overflow-hidden">
           <table className="w-full text-left text-sm text-gray-600">
             <thead className="bg-gray-50/50 border-b border-gray-100 font-bold text-gray-400 uppercase tracking-wider text-xs">
               <tr>
                 <th className="px-6 py-4">Name</th>
                 <th className="px-6 py-4 w-32">Size</th>
                 <th className="px-6 py-4 w-48">Date Modified</th>
                 <th className="px-6 py-4 w-10 text-right"></th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-50">
               {files.map((file) => {
                 const isSelected = selectedPaths.includes(file.path);
                 return (
                     <tr 
                      key={file.path} 
                      onClick={(e) => handleClick(e, file)}
                      className={`transition-colors cursor-pointer group select-none ${
                          isSelected ? 'bg-primary-50 hover:bg-primary-100' : 'hover:bg-gray-50'
                      }`}
                      onDoubleClick={() => handleDoubleClick(file)}
                      onContextMenu={(e) => onContextMenu(e, file)}
                     >
                       <td className="px-6 py-3.5">
                         <div className="flex items-center space-x-4">
                           {/* List View Selection Indicator */}
                           <div className="flex-shrink-0">
                               {isSelected ? (
                                   <CheckCircle2 size={18} className="text-white fill-primary-600" />
                               ) : (
                                   <Circle size={18} className="text-gray-300 fill-white opacity-0 group-hover:opacity-100 transition-opacity" />
                               )}
                           </div>
                           
                           <div className={`p-2 rounded-lg ${isSelected ? 'bg-white' : 'bg-gray-50'}`}>
                              <FileIcon type={file.type} name={file.name} className="w-5 h-5 flex-shrink-0" />
                           </div>
                           <span className={`font-bold truncate max-w-xs sm:max-w-md ${isSelected ? 'text-primary-800' : 'text-secondary'}`}>{file.name}</span>
                         </div>
                       </td>
                       <td className="px-6 py-3.5 text-gray-500 font-medium">
                         {file.type === 'folder' ? '-' : formatSize(file.size || 0)}
                       </td>
                       <td className="px-6 py-3.5 text-gray-500">
                         {file.modified ? formatDate(file.modified) : '-'}
                       </td>
                       <td className="px-6 py-3.5 text-right">
                         <button 
                            className={`p-2 rounded-lg transition-all ${isSelected ? 'opacity-100 text-primary-600 hover:bg-white' : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-secondary hover:bg-white hover:shadow-sm'}`}
                            onClick={(e) => { e.stopPropagation(); onContextMenu(e, file); }}
                         >
                           <MoreVertical size={18} />
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
  );
};
