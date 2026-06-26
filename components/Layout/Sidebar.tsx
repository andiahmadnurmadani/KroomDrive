
import React, { useEffect, useState, useMemo } from 'react';
import { Trash2, LogOut, ShieldCheck, Database, HardDrive, Cloud, Folder, PieChart, Loader2, Lock, ChevronRight, AlertTriangle, Server, RefreshCw, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFile } from '../../contexts/FileContext';
import { formatSize } from '../../utils/formatters';
import { QuotaItem } from '../../types';
import * as api from '../../services/api';
import { KroomLogo } from '../Icons';

interface SidebarProps {
  onNavigateTrash: () => void;
  onNavigateAdmin: () => void;
  onNavigateFiles: () => void;
  currentView: 'files' | 'admin' | 'trash';
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// Skeleton Component for Loading State
const StorageSkeleton = () => (
  <div className="animate-pulse bg-white border border-gray-100 rounded-2xl p-3.5 mb-3 shadow-sm">
    <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 w-full">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex-shrink-0"></div>
            <div className="flex-1 min-w-0 space-y-2">
                <div className="h-3 bg-gray-100 rounded-full w-3/4"></div>
                <div className="flex gap-1">
                    <div className="h-2 bg-gray-50 rounded w-8"></div>
                    <div className="h-2 bg-gray-50 rounded w-8"></div>
                </div>
            </div>
        </div>
    </div>
    <div className="space-y-1.5">
        <div className="w-full h-1.5 bg-gray-50 rounded-full"></div>
        <div className="flex justify-between">
            <div className="h-2 bg-gray-50 rounded w-10"></div>
            <div className="h-2 bg-gray-50 rounded w-10"></div>
        </div>
    </div>
  </div>
);

export const Sidebar: React.FC<SidebarProps> = ({ onNavigateTrash, onNavigateAdmin, onNavigateFiles, currentView, collapsed, onToggleCollapse }) => {
  const { user, logout } = useAuth();
  const { currentPath, setCurrentPath, storageStats, assignedDrives, files, fetchDriveInfo, loadingDrives } = useFile();
  
  // Storage Stats State — derive from context loadingDrives
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  
  // Admin Data
  const [adminStorageStats, setAdminStorageStats] = useState(storageStats);
  
  // User Data
  const [userQuotas, setUserQuotas] = useState<QuotaItem[]>([]);

  // 1. Fetch Data based on Role
  useEffect(() => {
    if (!user) return;

    if (user.role === 'admin') {
        setAdminStorageStats(storageStats);
        // Sync loading state with context's loadingDrives
        if (loadingDrives) {
            setLoadingStats(true);
        } else {
            setLoadingStats(false);
        }
    } else {
        if (loadingDrives) {
            setLoadingStats(true);
            return;
        }
        // User: fetch quotas independently
        const fetchUserQuota = async () => {
            setLoadingStats(true);
            try {
                const quotas = await api.getQuota();
                setUserQuotas(quotas);
            } catch (e) {
                console.error("Failed to fetch quotas", e);
            } finally {
                setLoadingStats(false);
            }
        };
        fetchUserQuota();
    }
  }, [user, storageStats, assignedDrives, loadingDrives]);

  // Construct display list for Navigation
  const getDisplayItems = () => {
      // 1. Admin View: One entry per SSH server (showing root "/")
      if (user?.role === 'admin') {
          // Use assignedDrives which for admin = one entry per server
          if (assignedDrives.length > 0) {
              return assignedDrives.map((d: any) => {
                  // Find matching storage stats for disk usage
                  const matchingStat = adminStorageStats.find(s =>
                      s.drive.includes(d.serverHost || '')
                  );
                  const used = matchingStat ? matchingStat.used : 0;
                  const total = matchingStat ? matchingStat.total : 0;
                  const free = matchingStat ? matchingStat.free : 0;
                  const percent = total > 0 ? (used / total) * 100 : 0;

                  return {
                      name: d.serverName || d.serverHost || 'Server',
                      subLabel: d.serverHost,
                      path: d.drive,   // e.g. srv:<uuid>:/
                      type: 'server',
                      permissions: d.permissions,
                      stats: { used, free, total, percent, isUnlimited: total === 0 }
                  };
              });
          }
          // Fallback: show storageStats-based entries if no assignedDrives yet
          if (adminStorageStats.length > 0) {
              return adminStorageStats.map(s => {
                  const used = s.total - s.free;
                  const percent = s.total > 0 ? (used / s.total) * 100 : 0;
                  return {
                      name: s.drive,
                      subLabel: undefined,
                      path: s.drive,
                      type: 'disk',
                      permissions: { read: true, write: true, delete: true },
                      stats: { used, free: s.free, total: s.total, percent, isUnlimited: false }
                  };
              });
          }
          return [];
      }

      // 2. User View: Quotas from API
      if (userQuotas.length > 0) {
          return userQuotas.map(q => {
              const assigned = assignedDrives.find(ad => ad.drive === q.path);
              const name = assigned?.drive.split(/[\\/]/).filter(Boolean).pop() || q.path;
              const isUnlimited = q.quota === null;
              const total = q.quota || 0;
              const used = q.used;
              const percent = q.percent || 0;
              return {
                  name,
                  subLabel: undefined,
                  path: q.path,
                  type: 'folder',
                  permissions: assigned?.permissions || { read: true, write: false, delete: false },
                  stats: {
                      used,
                      free: isUnlimited ? 0 : Math.max(0, total - used),
                      total,
                      percent: isUnlimited ? 0 : percent,
                      isUnlimited
                  }
              };
          });
      }

      return [];
  };

  const navItems = getDisplayItems();

  // Widget Calculation

  // FOR ADMIN: Calculate Unique Disks
  const adminAggregateStats = useMemo(() => {
      if (user?.role !== 'admin') return null;
      
      const seen = new Set<string>();
      let total = 0;
      let free = 0;

      adminStorageStats.forEach(d => {
          const signature = `${d.total}-${d.free}`;
          if (!seen.has(signature)) {
             total += d.total;
             free += d.free;
             seen.add(signature);
          }
      });

      const used = total - free;
      const percent = total > 0 ? (used / total) * 100 : 0;

      return { total, free, used, percent };
  }, [adminStorageStats, user]);

  // FOR USER: Sum of Quotas
  const userStats = useMemo(() => {
     if (user?.role === 'admin') return null;
     
     let totalUsed = 0;
     let totalQuota = 0;
     let hasUnlimited = false;

     userQuotas.forEach(q => {
         totalUsed += q.used;
         if (q.quota === null) {
             hasUnlimited = true;
         } else {
             totalQuota += q.quota;
         }
     });

     const percent = totalQuota > 0 ? (totalUsed / totalQuota) * 100 : 0;
     
     return {
         used: totalUsed,
         total: totalQuota,
         percent: hasUnlimited ? 0 : percent,
         isUnlimited: hasUnlimited && totalQuota === 0, // Only unlimited if NO quota drives
         label: 'Cloud Storage',
         subLabel: hasUnlimited ? 'Mixed / Unlimited' : 'Quota Usage'
     };
  }, [user, userQuotas]);

  // Helper to get progress bar color
  const getProgressColor = (percent: number) => {
      if (percent >= 100) return 'bg-red-600';
      if (percent >= 90) return 'bg-orange-500';
      return 'bg-primary-500';
  };

  // Helper to get background bar color when active/inactive
  const getProgressBg = (isActive: boolean, percent: number) => {
      if (isActive) {
          if (percent >= 90) return 'bg-white/20';
          return 'bg-white/20';
      }
      return 'bg-gray-100';
  }

  // ── Collapsed mode ─────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className="w-16 bg-white flex flex-col flex-shrink-0 z-20 h-full shadow-soft m-4 rounded-[20px] overflow-hidden border border-gray-100 transition-all duration-200 ease-in-out">
        {/* Logo */}
        <div className="flex items-center justify-center pt-5 pb-3">
          <KroomLogo className="w-8 h-8 text-primary-600" />
        </div>

        {/* Nav items — icon only */}
        <div className="flex-1 overflow-y-auto flex flex-col items-center py-2 gap-1.5 scrollbar-hide">
          {navItems.map((item, i) => {
            let isActive = false;
            if (currentView === 'files') {
              if (item.path.startsWith('srv:') && currentPath.startsWith('srv:')) {
                isActive = item.path.slice(4, 40) === currentPath.slice(4, 40);
              } else {
                const itemRoot = item.path.endsWith('\\') || item.path.endsWith('/') ? item.path : item.path + (item.path.includes('/') ? '/' : '\\');
                const currRoot = currentPath.endsWith('\\') || currentPath.endsWith('/') ? currentPath : currentPath + (currentPath.includes('/') ? '/' : '\\');
                isActive = currRoot.startsWith(itemRoot);
              }
            }
            return (
              <button
                key={`${item.path}-${i}`}
                title={(item.name) + (item.subLabel ? `\n${item.subLabel}` : '')}
                onClick={() => { setCurrentPath(item.path); onNavigateFiles(); }}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  isActive ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/30' : 'text-gray-400 hover:bg-gray-100 hover:text-primary-600'
                }`}
              >
                {item.type === 'disk' ? <HardDrive size={18} />
                  : item.type === 'server' ? <Server size={18} />
                  : <Folder size={18} />}
              </button>
            );
          })}

          {/* Divider */}
          {user?.role === 'admin' && navItems.length > 0 && <div className="w-6 h-px bg-gray-100 my-1" />}

          {/* Admin tools */}
          {user?.role === 'admin' && (
            <>
              <button
                title="Recycle Bin"
                onClick={onNavigateTrash}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${currentView === 'trash' ? 'bg-red-50 text-red-500' : 'text-gray-400 hover:bg-gray-100 hover:text-red-500'}`}
              >
                <Trash2 size={18} />
              </button>
              <button
                title="Admin Console"
                onClick={onNavigateAdmin}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${currentView === 'admin' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:bg-gray-100 hover:text-indigo-600'}`}
              >
                <ShieldCheck size={18} />
              </button>
            </>
          )}
        </div>

        {/* Bottom: avatar + toggle */}
        <div className="flex flex-col items-center gap-2 p-3">
          {/* User avatar */}
          <div
            title={`${user?.username} · ${user?.role}`}
            className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm border border-indigo-100"
          >
            {(user?.username || 'U').charAt(0).toUpperCase()}
          </div>
          {/* Expand button */}
          <button
            onClick={onToggleCollapse}
            title="Expand sidebar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      </aside>
    );
  }

  // ── Expanded mode ───────────────────────────────────────────────────────────
  return (
    <aside className="w-[280px] bg-white flex flex-col flex-shrink-0 z-20 h-full shadow-soft m-4 rounded-[20px] overflow-hidden border border-gray-100 transition-all duration-200 ease-in-out">
        {/* Brand */}
        <div className="p-8 flex items-center justify-center">
            <KroomLogo className="w-16 h-16 text-primary-600" />
        </div>
        
        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6 scrollbar-hide">
            
            {/* Main Menu */}
            <div>
                <div className="flex items-center justify-between px-4 mb-3">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        {user?.role === 'admin' ? 'SSH Servers' : 'My Storage'}
                    </p>
                    <button
                        onClick={() => fetchDriveInfo()}
                        disabled={loadingDrives}
                        title="Reload"
                        className="p-1 text-gray-300 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                        <RefreshCw
                            size={13}
                            className={loadingDrives ? 'animate-spin text-primary-400' : ''}
                        />
                    </button>
                </div>
                <div className="space-y-3">
                     {loadingStats ? (
                         <>
                            <StorageSkeleton />
                            <StorageSkeleton />
                         </>
                     ) : (
                         <>
                             {navItems.length === 0 && user?.role !== 'admin' && (
                                 <div className="mx-1 p-4 rounded-2xl bg-amber-50 border border-amber-100">
                                     <p className="text-xs font-bold text-amber-700 mb-1">No storage assigned</p>
                                     <p className="text-[11px] text-amber-600/80 leading-relaxed">
                                         Contact your admin to get access to a folder.
                                     </p>
                                 </div>
                             )}
                             {navItems.length === 0 && user?.role === 'admin' && (
                                 <div className="mx-1 p-4 rounded-2xl bg-gray-50 border border-dashed border-gray-200">
                                     <p className="text-xs font-bold text-gray-500 mb-1">No servers yet</p>
                                     <p className="text-[11px] text-gray-400 leading-relaxed">
                                         Add a server in Admin Console → Servers & Storage.
                                     </p>
                                 </div>
                             )}

                     {navItems.map((item, i) => {
                                     // Active check: srv: paths match by serverId prefix
                                     let isActive = false;
                                     if (currentView === 'files') {
                                         if (item.path.startsWith('srv:') && currentPath.startsWith('srv:')) {
                                             // same server = same serverId (chars 4..40)
                                             isActive = item.path.slice(4, 40) === currentPath.slice(4, 40);
                                         } else {
                                             const itemRoot = item.path.endsWith('\\') || item.path.endsWith('/') ? item.path : item.path + (item.path.includes('/') ? '/' : '\\');
                                             const currRoot = currentPath.endsWith('\\') || currentPath.endsWith('/') ? currentPath : currentPath + (currentPath.includes('/') ? '/' : '\\');
                                             isActive = currRoot.startsWith(itemRoot);
                                         }
                                     }

                                     const isFull = !item.stats.isUnlimited && item.stats.percent >= 100;
                                     const isNearFull = !item.stats.isUnlimited && item.stats.percent >= 90;

                                     return (
                                        <button
                                          key={`${item.path}-${i}`}
                                          onClick={() => {
                                              setCurrentPath(item.path);
                                              onNavigateFiles();
                                          }}
                                          className={`relative w-full text-left rounded-2xl transition-all duration-200 group overflow-hidden border ${
                                            isActive
                                              ? isFull 
                                                  ? 'bg-red-500 border-red-500 shadow-lg shadow-red-500/30'
                                                  : 'bg-primary-600 border-primary-600 shadow-lg shadow-primary-600/30' 
                                              : 'bg-white border-gray-100 hover:border-primary-200 hover:shadow-md'
                                          }`}
                                        >
                                            <div className="p-3.5">
                                                {/* HEADER: Icon & Name */}
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex flex-col gap-2 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${isActive ? 'bg-white/20 text-white' : 'bg-gray-50 text-primary-600 group-hover:bg-primary-50'}`}>
                                                                {item.type === 'disk' ? (
                                                                    <HardDrive size={16} strokeWidth={2.5} />
                                                                ) : item.type === 'server' ? (
                                                                    <Server size={16} strokeWidth={2.5} />
                                                                ) : (
                                                                    <Folder size={16} strokeWidth={2.5} />
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className={`font-bold text-sm leading-tight truncate ${isActive ? 'text-white' : 'text-gray-800'}`}>
                                                                    {item.name}
                                                                </div>
                                                                {(item as any).subLabel && (
                                                                    <div className={`text-[10px] font-mono truncate ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                                                                        {(item as any).subLabel}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Permission Badges */}
                                                        <div className="flex gap-1 ml-0.5">
                                                            {item.permissions?.read && (
                                                                <span title="Read Permission" className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded leading-none ${isActive ? 'bg-white/20 text-white' : 'bg-green-50 text-green-600 border border-green-100'}`}>
                                                                    Read
                                                                </span>
                                                            )}
                                                            {item.permissions?.write && (
                                                                <span title="Write Permission" className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded leading-none ${isActive ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                                                                    Write
                                                                </span>
                                                            )}
                                                            {item.permissions?.delete && (
                                                                <span title="Delete Permission" className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded leading-none ${isActive ? 'bg-white/20 text-white' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                                                    Del
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Status Indicators */}
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="flex items-center gap-1">
                                                            {isNearFull && !isFull && (
                                                                <AlertTriangle size={14} className={isActive ? 'text-yellow-200' : 'text-orange-500'} />
                                                            )}
                                                            {isFull && (
                                                                <AlertTriangle size={14} className={isActive ? 'text-white' : 'text-red-500'} />
                                                            )}
                                                            
                                                            {item.permissions && !item.permissions.write && (
                                                                <div title="Read Only" className={isActive ? 'text-white/60' : 'text-gray-300'}>
                                                                    <Lock size={12} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* BODY: Stats Bar */}
                                                <div className="space-y-1.5">
                                                    {!item.stats.isUnlimited ? (
                                                        <>
                                                            <div className={`w-full h-1.5 rounded-full overflow-hidden ${getProgressBg(isActive, item.stats.percent)}`}>
                                                                <div 
                                                                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                                                                        isActive 
                                                                            ? (isFull ? 'bg-red-300' : isNearFull ? 'bg-orange-300' : 'bg-white/90') 
                                                                            : getProgressColor(item.stats.percent)
                                                                    }`}
                                                                    style={{ width: `${Math.min(item.stats.percent, 100)}%` }}
                                                                ></div>
                                                            </div>
                                                            <div className={`flex justify-between items-center text-[10px] font-medium ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                                                                <span>
                                                                    {isFull ? 'Full' : `${item.stats.percent.toFixed(0)}% Used`}
                                                                </span>
                                                                <span>{formatSize(item.stats.total)}</span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        /* Unlimited View */
                                                        <div className={`flex justify-between items-center text-[10px] font-medium ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                                                            <span className="flex items-center gap-1">
                                                                <Database size={10} /> {formatSize(item.stats.used)} used
                                                            </span>
                                                            <span>Unlimited</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                     );
                                })
                             }
                         </>
                     )}
                </div>
            </div>

            {/* Tools (Admin Only) */}
            {user?.role === 'admin' && (
                <div>
                    <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Tools</p>
                    <div className="space-y-1">
                        <button
                            onClick={onNavigateTrash}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm group ${
                                currentView === 'trash'
                                ? 'bg-red-50 text-red-600 shadow-sm border border-red-100'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-secondary'
                            }`}
                        >
                            <Trash2 className={`w-5 h-5 transition-colors ${currentView === 'trash' ? 'text-red-600' : 'text-gray-400 group-hover:text-red-500'}`} />
                            <span>Recycle Bin</span>
                        </button>
                        
                        <button
                            onClick={onNavigateAdmin}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm group ${
                                currentView === 'admin' 
                                ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' 
                                : 'text-gray-500 hover:bg-gray-50 hover:text-secondary'
                            }`}
                        >
                            <ShieldCheck className={`w-5 h-5 transition-colors ${currentView === 'admin' ? 'text-indigo-600' : 'text-gray-400 group-hover:text-primary-600'}`} />
                            <span>Admin Console</span>
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* Storage Widget & Profile */}
        <div className="p-4 mt-auto">
            {/* Storage Usage Card — hide for users with no storage */}
            {(user?.role === 'admin' || userQuotas.length > 0) && (
            <div className={`rounded-2xl p-5 text-white shadow-lg mb-4 relative overflow-hidden group transition-colors duration-500 ${
                userStats && !userStats.isUnlimited && userStats.percent >= 90
                ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/30'
                : 'bg-gradient-to-br from-primary-600 to-primary-700 shadow-primary-600/30'
            }`}>
                {/* Decorative Background Elements */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-500"></div>
                <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full -ml-8 -mb-8"></div>
                
                {/* Widget Header */}
                <div className="flex items-center gap-3 mb-4 relative z-10">
                    <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm border border-white/10">
                        {loadingStats ? <Loader2 size={20} className="text-white animate-spin" /> : <Cloud size={20} className="text-white" />}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white">
                            {user?.role === 'admin' ? 'Server Status' : userStats?.label}
                        </p>
                        <p className="text-[10px] text-white/70 uppercase tracking-wide font-medium">
                            {user?.role === 'admin' ? 'Total Capacity' : userStats?.subLabel}
                        </p>
                    </div>
                </div>

                {/* CONTENT */}
                <div className="relative z-10">
                    {loadingStats ? (
                        /* Loading Widget State */
                        <div className="animate-pulse space-y-2">
                             <div className="w-full h-2 bg-white/20 rounded-full"></div>
                             <div className="flex justify-between">
                                 <div className="h-2 w-12 bg-white/20 rounded"></div>
                                 <div className="h-2 w-12 bg-white/20 rounded"></div>
                             </div>
                        </div>
                    ) : user?.role === 'admin' && adminAggregateStats ? (
                        /* ADMIN VIEW */
                        <>
                            <div className="w-full bg-black/20 rounded-full h-2 mb-2 overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all duration-1000 ease-out ${adminAggregateStats.percent > 90 ? 'bg-red-400' : 'bg-white'}`}
                                    style={{ width: `${Math.min(adminAggregateStats.percent, 100)}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between items-center">
                                <p className="text-xs text-white/90 font-medium">
                                    {formatSize(adminAggregateStats.used)} used
                                </p>
                                <p className="text-[10px] text-white/60">
                                    {formatSize(adminAggregateStats.free)} free
                                </p>
                            </div>
                        </>
                    ) : userStats ? (
                        /* USER VIEW */
                        !userStats.isUnlimited ? (
                            <>
                                <div className="w-full bg-black/20 rounded-full h-2 mb-2 overflow-hidden">
                                    <div 
                                        className={`h-full bg-white rounded-full transition-all duration-1000 ease-out`}
                                        style={{ width: `${Math.min(userStats.percent, 100)}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-white/90 font-bold">
                                        {formatSize(userStats.used)}
                                    </p>
                                    <p className="text-[10px] text-white/80 font-medium">
                                        of {formatSize(userStats.total)}
                                    </p>
                                </div>
                                {userStats.percent >= 100 && (
                                    <div className="mt-2 text-[10px] font-bold bg-white/20 rounded px-2 py-1 text-center border border-white/10 animate-pulse">
                                        Storage Limit Reached
                                    </div>
                                )}
                            </>
                        ) : (
                            /* Unlimited View */
                            <div>
                                <div className="flex items-end gap-1 mb-1">
                                    <span className="text-2xl font-bold">{formatSize(userStats.used)}</span>
                                    <span className="text-xs text-white/70 mb-1">used</span>
                                </div>
                                <div className="text-[10px] text-white/50 flex items-center gap-1">
                                    <PieChart size={12} /> Space is unlimited
                                </div>
                            </div>
                        )
                    ) : null}
                </div>
            </div>
            )} {/* end storage widget conditional */}

            {/* Profile */}
            {/* Profile + collapse toggle */}
            <div className="flex items-center gap-3 px-2">
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm border border-indigo-100 shadow-sm ring-2 ring-white">
                    {(user?.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-secondary truncate">{user?.username}</p>
                    <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
                </div>
                <button 
                    onClick={logout} 
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Logout"
                >
                    <LogOut size={18} />
                </button>
                <button
                    onClick={onToggleCollapse}
                    className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Collapse sidebar"
                >
                    <PanelLeftClose size={18} />
                </button>
            </div>
        </div>
    </aside>
  );
};