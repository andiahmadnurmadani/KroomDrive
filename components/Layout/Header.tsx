
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
  Loader2,
  Home
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
        assignedDrives,
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

    // â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * Returns the user's root path that contains the current path.
     * For admin: returns null (no root restriction).
     * For user: returns the assigned drive path that is a prefix of currentPath.
     */
    const getUserRoot = (): { rootPath: string; rootLabel: string } | null => {
        if (user?.role === 'admin') return null;
        if (!assignedDrives || assignedDrives.length === 0) return null;

        const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
        const normCurrent = norm(currentPath);

        // Find the most specific (longest) matching assigned drive
        const matching = assignedDrives
            .filter(d => {
                const normRoot = norm(d.drive);
                return normCurrent === normRoot || normCurrent.startsWith(normRoot + '/');
            })
            .sort((a, b) => b.drive.length - a.drive.length);

        if (matching.length === 0) return null;

        const drive = matching[0];
        // Label: last segment of the root path, or use serverName if available
        const rootLabel = (drive as any).serverName 
            || drive.drive.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean).pop()
            || drive.drive;

        return { rootPath: drive.drive, rootLabel };
    };

    const handleGoUp = () => {
        // Handle srv:<serverId>:<path> format (admin)
        if (currentPath.startsWith('srv:')) {
            const serverId = currentPath.slice(4, 40);
            const remotePath = currentPath.slice(41) || '/';
            if (remotePath === '/' || remotePath === '') return;
            const parent = remotePath.replace(/\/[^/]+\/?$/, '') || '/';
            setCurrentPath(`srv:${serverId}:${parent}`);
            return;
        }

        const separator = currentPath.includes('\\') ? '\\' : '/';

        // For regular users: stop at their assigned root
        const userRoot = getUserRoot();
        if (userRoot) {
            const normRoot = userRoot.rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
            const normCurrent = currentPath.replace(/\\/g, '/').replace(/\/+$/, '');
            if (normCurrent === normRoot) return; // already at root
        } else {
            // Admin or no assigned root â€” check against storage stats
            const availableDrives = storageStats.map(s => s.drive);
            const isRoot = availableDrives.some(p => 
                p.replace(/[\\/]$/, '') === currentPath.replace(/[\\/]$/, '')
            );
            if (isRoot) return;
        }

        const parts = currentPath.split(separator).filter(Boolean);
        parts.pop();
        
        let newPath = parts.join(separator);
        
        if (currentPath.includes(':') && !newPath.includes(separator)) newPath += separator;
        if (currentPath.startsWith('/') && !newPath.startsWith('/')) newPath = '/' + newPath;
        if (!newPath && currentPath.startsWith('/')) newPath = '/';

        setCurrentPath(newPath);
    };

    const renderBreadcrumbs = () => {
        // â”€â”€ Admin: srv:<id>:<path> format â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (currentPath.startsWith('srv:')) {
            const serverId = currentPath.slice(4, 40);
            const remotePath = currentPath.slice(41) || '/';
            const parts = remotePath.split('/').filter(Boolean);

            return (
                <div className="flex items-center text-sm text-gray-600 overflow-x-auto whitespace-nowrap pb-1 scrollbar-hide">
                    <button
                        onClick={() => setCurrentPath(`srv:${serverId}:/`)}
                        className="hover:text-primary-600 hover:bg-gray-100 px-1.5 py-0.5 rounded transition-colors text-primary-500 font-bold flex items-center gap-1 flex-shrink-0"
                    >
                        <span className="text-[10px] bg-primary-100 text-primary-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">SSH</span>
                        /
                    </button>
                    {parts.map((part, index) => {
                        const isLast = index === parts.length - 1;
                        const fullRemote = '/' + parts.slice(0, index + 1).join('/');
                        const fullPath = `srv:${serverId}:${fullRemote}`;
                        return (
                            <React.Fragment key={index}>
                                <ChevronRight size={13} className="text-gray-300 mx-0.5 flex-shrink-0" />
                                <button
                                    onClick={() => setCurrentPath(fullPath)}
                                    className={`hover:text-primary-600 hover:bg-gray-100 px-1.5 py-0.5 rounded transition-colors flex-shrink-0 ${
                                        isLast ? 'font-semibold text-gray-800' : 'text-gray-500'
                                    }`}
                                >
                                    {part}
                                </button>
                            </React.Fragment>
                        );
                    })}
                </div>
            );
        }

        // â”€â”€ Regular user: show only relative path from their root â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const userRoot = getUserRoot();

        if (userRoot) {
            const sep = currentPath.includes('\\') ? '\\' : '/';
            const normRoot = userRoot.rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
            const normCurrent = currentPath.replace(/\\/g, '/').replace(/\/+$/, '');

            // Compute relative path after the root
            const relative = normCurrent === normRoot
                ? ''
                : normCurrent.startsWith(normRoot + '/')
                    ? normCurrent.slice(normRoot.length + 1)
                    : normCurrent;

            const relParts = relative ? relative.split('/').filter(Boolean) : [];

            return (
                <div className="flex items-center text-sm overflow-x-auto whitespace-nowrap pb-1 scrollbar-hide">
                    {/* Root anchor â€” clicking goes to their root */}
                    <button
                        onClick={() => setCurrentPath(userRoot.rootPath)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-lg transition-colors flex-shrink-0 ${
                            relParts.length === 0
                                ? 'bg-primary-600 text-white font-bold shadow-sm'
                                : 'text-primary-600 font-bold hover:bg-primary-50'
                        }`}
                    >
                        <Home size={13} />
                        <span>{userRoot.rootLabel}</span>
                    </button>

                    {/* Relative breadcrumbs */}
                    {relParts.map((part, index) => {
                        const isLast = index === relParts.length - 1;
                        // Reconstruct the full path up to this segment
                        const relUpTo = relParts.slice(0, index + 1).join('/');
                        const fullPath = normRoot + '/' + relUpTo;

                        return (
                            <React.Fragment key={index}>
                                <ChevronRight size={13} className="text-gray-300 mx-0.5 flex-shrink-0" />
                                <button
                                    onClick={() => setCurrentPath(fullPath)}
                                    className={`hover:text-primary-600 hover:bg-gray-100 px-1.5 py-0.5 rounded transition-colors flex-shrink-0 ${
                                        isLast ? 'font-semibold text-gray-800' : 'text-gray-500'
                                    }`}
                                >
                                    {part}
                                </button>
                            </React.Fragment>
                        );
                    })}
                </div>
            );
        }

        // â”€â”€ Fallback: full path (admin without srv: prefix, or no assigned drives) â”€â”€
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
                            {index > 0 && <ChevronRight size={13} className="text-gray-300 mx-0.5 flex-shrink-0" />}
                            <button
                                onClick={() => setCurrentPath(fullPath)}
                                className={`hover:text-primary-600 hover:bg-gray-100 px-1.5 py-0.5 rounded transition-colors ${
                                    isLast ? 'font-semibold text-gray-800' : 'text-gray-500'
                                }`}
                            >
                                {part}
                            </button>
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

          <div className="flex-1 flex flex-col justify-center min-w-0 gap-1.5">
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
