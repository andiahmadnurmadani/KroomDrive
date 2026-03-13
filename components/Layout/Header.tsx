
import React, { useRef } from 'react';
import { 
  LayoutGrid, 
  List as ListIcon, 
  FolderPlus, 
  Upload, 
  ArrowUp,
  Search,
  XCircle,
  ClipboardCheck,
  Loader2
} from 'lucide-react';
import { useFile } from '../../contexts/FileContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ChevronRight } from 'lucide-react';

interface HeaderProps {
    onCreateFolder: () => void;
    onUploadStart: () => void;
    onUploadEnd: () => void;
    uploading: boolean;
    onPaste: () => void;
    pasteLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({ 
    onCreateFolder, 
    onUploadStart, 
    onUploadEnd,
    uploading,
    onPaste,
    pasteLoading
}) => {
    const { 
        currentPath, 
        setCurrentPath, 
        searchQuery, 
        setSearchQuery, 
        viewMode, 
        setViewMode,
        clipboard,
        storageStats,
        uploadWithProgress
    } = useFile();
    const { user } = useAuth();
    const { showToast, handleError } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        
        onUploadStart();
        try {
          await uploadWithProgress(file);
          showToast(`File "${file.name}" uploaded successfully`, 'success');
        } catch (err: any) {
          handleError(err);
        } finally {
          onUploadEnd();
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };

    const handleGoUp = () => {
        const separator = currentPath.includes('\\') ? '\\' : '/';
        const availableDrives = (user?.paths && user.paths.length > 0) 
            ? user.paths.map(p => p.path)
            : storageStats.map(s => s.drive);

        // Simple root check
        const isRoot = availableDrives.some(p => 
            p.replace(/[\\/]$/, '') === currentPath.replace(/[\\/]$/, '')
        );
        if (isRoot) return;

        const parts = currentPath.split(separator).filter(Boolean);
        parts.pop();
        
        let newPath = parts.join(separator);
        
        // Windows/Linux path fix logic
        if (currentPath.includes(':') && !newPath.includes(separator)) newPath += separator;
        if (currentPath.startsWith('/') && !newPath.startsWith('/')) newPath = '/' + newPath;
        if (!newPath && currentPath.startsWith('/')) newPath = '/';

        setCurrentPath(newPath);
    };

    const renderBreadcrumbs = () => {
        const separator = currentPath.includes('\\') ? '\\' : '/';
        const parts = currentPath.split(separator).filter(Boolean);
        
        return (
          <div className="flex items-center text-sm text-gray-600 overflow-x-auto whitespace-nowrap pb-1 scrollbar-hide">
            {parts.map((part, index) => {
              const isLast = index === parts.length - 1;
              let fullPath = parts.slice(0, index + 1).join(separator);
              if (currentPath.startsWith('/')) fullPath = '/' + fullPath;
              if (currentPath.includes(':') && index === 0) fullPath += separator;
    
              return (
                <React.Fragment key={index}>
                  <button 
                    onClick={() => setCurrentPath(fullPath)}
                    className={`hover:text-primary-600 hover:bg-gray-100 px-1.5 py-0.5 rounded transition-colors ${isLast ? 'font-semibold text-gray-900' : ''}`}
                  >
                    {part}
                  </button>
                  {!isLast && <ChevronRight size={14} className="text-gray-400 mx-1 flex-shrink-0" />}
                </React.Fragment>
              );
            })}
          </div>
        );
      };

    return (
        <header className="px-6 py-4 border-b border-gray-100 flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button 
              onClick={handleGoUp}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              title="Go Up"
            >
              <ArrowUp size={20} />
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center min-w-0 gap-2">
             <div className="flex items-center bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 focus-within:ring-2 focus-within:ring-primary-100 focus-within:border-primary-400 transition-all">
                <Search size={18} className="text-gray-400 flex-shrink-0" />
                <input 
                  type="text" 
                  placeholder="Search files..."
                  className="bg-transparent border-none outline-none text-sm w-full ml-2 text-gray-700 placeholder-gray-400"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
                    <XCircle size={16} />
                  </button>
                )}
             </div>
             {!searchQuery && renderBreadcrumbs()}
          </div>

          <div className="flex items-center gap-2">
            {clipboard && (
               <button 
                 onClick={onPaste}
                 disabled={pasteLoading}
                 className="flex items-center gap-1.5 px-3 py-2 text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors font-medium text-sm mr-2"
                 title={`Paste ${clipboard.name}`}
               >
                 {pasteLoading ? <Loader2 size={18} className="animate-spin" /> : <ClipboardCheck size={18} />}
                 <span className="hidden sm:inline">Paste</span>
               </button>
            )}

            <button 
              onClick={onCreateFolder}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="New Folder"
            >
              <FolderPlus size={20} />
            </button>
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Upload File"
            >
              <Upload size={20} />
            </button>
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />

            <div className="h-8 w-px bg-gray-200 mx-2"></div>

            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <LayoutGrid size={18} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <ListIcon size={18} />
              </button>
            </div>
          </div>
        </header>
    );
};
