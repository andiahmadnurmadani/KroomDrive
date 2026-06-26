import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GitBranch, GitCommit, GitMerge, RefreshCw, ArrowDown, ArrowUp,
  CheckCircle2, Clock, User, ExternalLink, X, Minus,
  Loader2, Archive, Tag, Circle, RotateCcw, Upload, ChevronRight,
  Plus, Trash2, AlertTriangle, GitPullRequest, Code2,
  Maximize2, Minimize2, Eye, EyeOff, Lock, Unlock, KeyRound,
} from 'lucide-react';
import * as api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

// ─── Sub-components ──────────────────────────────────────────────────────────

const HostIcon: React.FC<{ host: string }> = ({ host }) => {
  if (host === 'github') return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.23 3.44 9.67 8.21 11.23.6.11.82-.25.82-.56v-2.03c-3.34.71-4.04-1.57-4.04-1.57-.55-1.36-1.33-1.72-1.33-1.72-1.09-.72.08-.71.08-.71 1.2.08 1.84 1.21 1.84 1.21 1.07 1.79 2.8 1.27 3.48.97.11-.75.42-1.27.76-1.56-2.67-.3-5.47-1.3-5.47-5.79 0-1.28.47-2.33 1.24-3.15-.12-.3-.54-1.49.12-3.1 0 0 1.01-.32 3.3 1.21a11.68 11.68 0 013-.4c1.02 0 2.04.14 3 .4 2.28-1.53 3.29-1.21 3.29-1.21.66 1.61.24 2.8.12 3.1.77.82 1.24 1.87 1.24 3.15 0 4.5-2.81 5.49-5.49 5.78.43.36.82 1.09.82 2.2v3.26c0 .31.22.68.83.56C20.57 21.96 24 17.52 24 12.29 24 5.78 18.63.5 12 .5z"/></svg>
  );
  if (host === 'gitlab') return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.49a.42.42 0 01.11-.18.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/></svg>
  );
  return <span className="text-[10px] font-black">{host.slice(0,2).toUpperCase()}</span>;
};

const HostBadge: React.FC<{ host?: string|null; slug?: string; url?: string }> = ({ host, slug, url }) => {
  if (!host) return null;
  const styles: Record<string, string> = {
    github: 'bg-gray-900 text-white',
    gitlab: 'bg-orange-500 text-white',
    bitbucket: 'bg-blue-600 text-white',
  };
  return (
    <a href={url || '#'} target="_blank" rel="noopener noreferrer"
      onClick={e => { if (!url) e.preventDefault(); }}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold hover:opacity-85 transition-opacity ${styles[host] || 'bg-gray-700 text-white'}`}
    >
      <HostIcon host={host} />
      <span className="truncate max-w-[120px]">{slug || host}</span>
      {url && <ExternalLink size={9} className="opacity-60 flex-shrink-0" />}
    </a>
  );
};

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const cfg: Record<string, { color: string; label: string }> = {
    M:  { color: 'bg-yellow-400', label: 'Modified' },
    A:  { color: 'bg-green-400',  label: 'Added' },
    D:  { color: 'bg-red-400',    label: 'Deleted' },
    R:  { color: 'bg-blue-400',   label: 'Renamed' },
    '??': { color: 'bg-gray-400', label: 'Untracked' },
  };
  const c = cfg[status] || { color: 'bg-gray-400', label: status };
  return (
    <span title={c.label} className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.color}`} />
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  folderPath: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
}

type Tab = 'overview' | 'commits' | 'branches' | 'changes' | 'actions';

// Fixed panel size — medium
const PANEL_W = 380;
const PANEL_H = 560;

// ─── Main Component ───────────────────────────────────────────────────────────

export const GitPanel: React.FC<Props> = ({ folderPath, collapsed, onToggleCollapse, onClose }) => {
  const { showToast, handleError } = useToast();

  // ── Floating window state ─────────────────────────────────────────────────
  const [pos, setPos] = useState({ x: window.innerWidth - PANEL_W - 24, y: 80 });
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [prevPos, setPrevPos] = useState({ x: window.innerWidth - PANEL_W - 24, y: 80 });

  const panelRef = useRef<HTMLDivElement>(null);
  // Drag state stored in refs — no React re-renders during drag
  const isDragging = useRef(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panelX: 0, panelY: 0 });

  const handleDragStart = (e: React.MouseEvent) => {
    if (maximized) return;
    isDragging.current = true;
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: pos.x,
      panelY: pos.y,
    };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || !panelRef.current) return;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      const newX = Math.max(0, Math.min(window.innerWidth - PANEL_W, dragStart.current.panelX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 60, dragStart.current.panelY + dy));
      // Move via transform — no React re-render during drag
      panelRef.current.style.left = `${newX}px`;
      panelRef.current.style.top  = `${newY}px`;
    };

    const onUp = (e: MouseEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      // Commit final position to React state once
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      const newX = Math.max(0, Math.min(window.innerWidth - PANEL_W, dragStart.current.panelX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 60, dragStart.current.panelY + dy));
      setPos({ x: newX, y: newY });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []); // no deps — refs are stable

  const toggleMaximize = () => {
    if (maximized) {
      setMaximized(false);
      setPos(prevPos);
    } else {
      setPrevPos(pos);
      setMaximized(true);
    }
  };

  // ── Git data state ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('overview');
  const [info, setInfo] = useState<api.GitInfo | null>(null);
  const [log, setLog] = useState<api.GitCommit[]>([]);
  const [branches, setBranches] = useState<{ local: string[]; remote: string[] } | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionOutput, setActionOutput] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [selBranch, setSelBranch] = useState('');
  const [showAllChanges, setShowAllChanges] = useState(false);
  const [tags, setTags] = useState<api.GitTag[]>([]);
  const [remotes, setRemotes] = useState<api.GitRemote[]>([]);
  const [commitMsg, setCommitMsg] = useState('');
  const [addAll, setAddAll] = useState(true);
  const [newBranch, setNewBranch] = useState('');
  const [checkoutNew, setCheckoutNew] = useState(true);
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [diffOutput, setDiffOutput] = useState('');
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showDeleteBranch, setShowDeleteBranch] = useState<string | null>(null);

  // Credential state for private repos
  const [credStatus, setCredStatus] = useState<api.GitCredentialStatus | null>(null);
  const [showCredForm, setShowCredForm] = useState(false);
  const [credUsername, setCredUsername] = useState('');
  const [credToken, setCredToken] = useState('');
  const [credLoading, setCredLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const loadInfo = useCallback(async () => {
    setLoadingInfo(true);
    try { setInfo(await api.getGitInfo(folderPath)); }
    catch (e: any) { handleError(e); }
    finally { setLoadingInfo(false); }
  }, [folderPath]);

  const loadLog = useCallback(async () => {
    try { setLog(await api.getGitLog(folderPath, 40)); }
    catch (e: any) { handleError(e); }
  }, [folderPath]);

  const loadBranches = useCallback(async () => {
    try { setBranches(await api.getGitBranches(folderPath)); }
    catch (e: any) { handleError(e); }
  }, [folderPath]);

  const loadTags = useCallback(async () => {
    try { setTags(await api.getGitTags(folderPath)); }
    catch (_e) {}
  }, [folderPath]);

  const loadRemotes = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        api.getGitRemotes(folderPath),
        api.getGitCredentials(folderPath),
      ]);
      setRemotes(r);
      setCredStatus(c);
    } catch (_e) {}
  }, [folderPath]);

  useEffect(() => { loadInfo(); }, [loadInfo]);
  useEffect(() => {
    if (tab === 'commits' && log.length === 0) loadLog();
    if (tab === 'branches' && !branches) { loadBranches(); loadTags(); }
    if (tab === 'actions') loadRemotes();
  }, [tab]);

  const run = async (label: string, fn: () => Promise<{ output: string }>) => {
    setLoadingAction(label); setActionOutput(null);
    try {
      const r = await fn();
      setActionOutput(r.output || '(done)');
      setShowOutput(true);
      showToast(`${label} completed`, 'success');
      await loadInfo();
      if (tab === 'commits') loadLog();
    } catch (e: any) {
      setActionOutput(e.message || 'Error');
      setShowOutput(true);
      handleError(e);
    } finally { setLoadingAction(null); }
  };

  const isLoading = (l: string) => loadingAction === l;

  const loadDiff = async (file?: string) => {
    setLoadingDiff(true); setShowDiff(true); setDiffFile(file || null);
    try { const r = await api.getGitDiff(folderPath, file); setDiffOutput(r.output); }
    catch (e: any) { setDiffOutput(e.message); }
    finally { setLoadingDiff(false); }
  };

  const handleSaveCreds = async () => {
    if (!credToken.trim()) return;
    setCredLoading(true);
    try {
      await api.saveGitCredentials(folderPath, { username: credUsername, token: credToken });
      showToast('Credentials saved', 'success');
      setShowCredForm(false);
      setCredToken('');
      await loadRemotes();
    } catch (e: any) { handleError(e); }
    finally { setCredLoading(false); }
  };

  const handleTestCreds = async () => {
    if (!credToken.trim()) return;
    setCredLoading(true);
    try {
      const result = await api.testGitCredentials(folderPath, { username: credUsername, token: credToken });
      if (result.ok) {
        showToast(result.message || 'Token works!', 'success');
      } else {
        showToast(result.error || 'Test failed', 'error');
      }
    } catch (e: any) { handleError(e); }
    finally { setCredLoading(false); }
  };

  const handleDeleteCreds = async () => {
    setCredLoading(true);
    try {
      await api.deleteGitCredentials(folderPath);
      showToast('Credentials removed', 'success');
      setCredStatus(null);
      await loadRemotes();
    } catch (e: any) { handleError(e); }
    finally { setCredLoading(false); }
  };

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'commits',  label: 'Commits' },
    { id: 'branches', label: 'Branches' },
    { id: 'changes',  label: 'Changes', count: info?.changedFiles?.length },
    { id: 'actions',  label: 'Actions' },
  ];

  const repoName = folderPath.includes('srv:')
    ? folderPath.slice(41).split('/').filter(Boolean).pop() || '/'
    : folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;

  // ── Computed style ────────────────────────────────────────────────────────
  const floatStyle: React.CSSProperties = maximized
    ? { position: 'fixed', left: 16, top: 16, right: 16, bottom: 16, width: 'auto', height: 'auto', zIndex: 9999 }
    : {
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: PANEL_W,
        height: minimized ? 'auto' : PANEL_H,
        zIndex: 9999,
      };

  // ── Minimized pill ────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div style={floatStyle} className="animate-in fade-in duration-150">
        <div
          className="flex items-center gap-2 pl-3 pr-2 py-2 bg-gray-900 rounded-2xl shadow-2xl shadow-black/30 border border-white/10 cursor-move select-none"
          onMouseDown={handleDragStart}
        >
          <div className="p-1 rounded-md bg-white/10 flex-shrink-0">
            <GitBranch size={13} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-white leading-tight truncate max-w-[140px]">{repoName}</p>
            {info?.branch && <p className="text-[10px] text-white/50 font-mono truncate">{info.branch}</p>}
          </div>
          {info?.isGitRepo && (
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${info.isDirty ? 'bg-yellow-400' : 'bg-green-400'}`} />
          )}
          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={() => setMinimized(false)}
              className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-all" title="Restore">
              <Maximize2 size={12} />
            </button>
            <button onClick={onClose}
              className="p-1.5 text-white/50 hover:text-red-300 hover:bg-white/10 rounded-lg transition-all" title="Close">
              <X size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Full panel ────────────────────────────────────────────────────────────
  return (
    <div
      ref={panelRef}
      style={floatStyle}
      className="flex flex-col bg-white rounded-2xl shadow-2xl shadow-black/20 border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      {/* ── Title bar (draggable) ── */}
      <div
        className={`flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 flex-shrink-0 ${maximized ? '' : 'cursor-move'} select-none`}
        onMouseDown={handleDragStart}
      >
        <div className="p-1 rounded-md bg-white/10 flex-shrink-0">
          <GitBranch size={13} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-white leading-tight truncate">{repoName}</p>
          {info?.branch && <p className="text-[10px] text-white/50 font-mono truncate">{info.branch}</p>}
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-0.5" onMouseDown={e => e.stopPropagation()}>
          <button onClick={loadInfo} disabled={loadingInfo}
            className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-all" title="Refresh">
            <RefreshCw size={12} className={loadingInfo ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setMinimized(true)}
            className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-all" title="Minimize">
            <Minus size={12} />
          </button>
          <button onClick={toggleMaximize}
            className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            title={maximized ? 'Restore' : 'Maximize'}>
            {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button onClick={onClose}
            className="p-1.5 text-white/50 hover:text-red-300 hover:bg-white/10 rounded-lg transition-all" title="Close">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* ── Loading ── */}
      {loadingInfo && !info && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
          <Loader2 size={20} className="animate-spin text-primary-400" />
          <span className="text-xs">Loading…</span>
        </div>
      )}

      {/* ── Not a repo ── */}
      {!loadingInfo && info && !info.isGitRepo && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
          <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100">
            <GitBranch size={22} className="text-gray-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-500">Not a repository</p>
            <p className="text-xs text-gray-400 mt-0.5">No .git directory found</p>
          </div>
          {info.error && (
            <p className="text-[11px] text-red-400 font-mono bg-red-50 px-2 py-1 rounded-lg w-full break-all">{info.error}</p>
          )}
        </div>
      )}

      {/* ── Repo content ── */}
      {info?.isGitRepo && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Status strip */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100 flex-shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5">
              <GitBranch size={12} className="text-primary-500" />
              <span className="text-xs font-bold text-gray-800">{info.branch}</span>
            </div>

            {(info.ahead! > 0 || info.behind! > 0) && (
              <div className="flex items-center gap-1">
                {info.ahead! > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                    <ArrowUp size={9} />{info.ahead}
                  </span>
                )}
                {info.behind! > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                    <ArrowDown size={9} />{info.behind}
                  </span>
                )}
              </div>
            )}

            {info.isDirty ? (
              <span className="text-[10px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded-full">
                ● {info.changedFiles?.length} changed
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                <CheckCircle2 size={9} />Clean
              </span>
            )}

            <HostBadge host={info.repoHost} slug={info.repoSlug} url={info.repoWebUrl} />

            {info.latestTag && (
              <span className="flex items-center gap-1 text-[10px] text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded-full">
                <Tag size={9} />{info.latestTag}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-gray-100 flex-wrap flex-shrink-0">
            <button onClick={() => run('Git pull', () => api.gitPull(folderPath))}
              disabled={!!loadingAction}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-[11px] font-bold rounded-lg shadow-sm shadow-primary-600/25 disabled:opacity-50 transition-all">
              {isLoading('Git pull') ? <Loader2 size={11} className="animate-spin"/> : <ArrowDown size={11}/>}Pull
            </button>
            <button onClick={() => run('Git fetch', () => api.gitFetch(folderPath))}
              disabled={!!loadingAction}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-[11px] font-bold rounded-lg shadow-sm disabled:opacity-50 transition-all">
              {isLoading('Git fetch') ? <Loader2 size={11} className="animate-spin"/> : <RefreshCw size={11}/>}Fetch
            </button>
            {info.ahead! > 0 && (
              <button onClick={() => run('Git push', () => api.gitPush(folderPath))}
                disabled={!!loadingAction}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg shadow-sm disabled:opacity-50 transition-all">
                {isLoading('Git push') ? <Loader2 size={11} className="animate-spin"/> : <Upload size={11}/>}Push ({info.ahead})
              </button>
            )}
            {info.isDirty && (
              <button onClick={() => run('Stash', () => api.gitStash(folderPath, 'save'))}
                disabled={!!loadingAction}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 text-[11px] font-bold rounded-lg disabled:opacity-50 transition-colors">
                {isLoading('Stash') ? <Loader2 size={11} className="animate-spin"/> : <Archive size={11}/>}Stash
              </button>
            )}
            {(info.stashCount || 0) > 0 && (
              <button onClick={() => run('Stash pop', () => api.gitStash(folderPath, 'pop'))}
                disabled={!!loadingAction}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 text-[11px] font-bold rounded-lg disabled:opacity-50 transition-colors">
                {isLoading('Stash pop') ? <Loader2 size={11} className="animate-spin"/> : <RotateCcw size={11}/>}Pop ({info.stashCount})
              </button>
            )}
          </div>

          {/* Terminal output */}
          {showOutput && actionOutput && (
            <div className="mx-3 mt-2 rounded-xl overflow-hidden border border-gray-800 flex-shrink-0">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900">
                <span className="text-[10px] font-bold text-gray-400 font-mono flex items-center gap-1.5">
                  <span className="text-green-400">$</span> output
                </span>
                <button onClick={() => setShowOutput(false)} className="text-gray-600 hover:text-gray-300 transition-colors">
                  <X size={11}/>
                </button>
              </div>
              <pre className="text-[11px] font-mono px-3 py-2 bg-gray-950 text-green-400 max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed">{actionOutput}</pre>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-3 flex-shrink-0 bg-white gap-0.5">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`relative px-2.5 py-2 text-[11px] font-bold border-b-2 transition-colors -mb-px ${
                  tab === t.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={`ml-1 text-[9px] px-1 py-0 rounded-full font-bold ${
                    tab === t.id ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500'
                  }`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 flex flex-col min-h-0">

            {/* ── Overview ── */}
            {tab === 'overview' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {info.lastCommit && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <GitCommit size={10}/>Latest commit
                    </p>
                    <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-3 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-800 leading-snug mb-2.5 line-clamp-2">{info.lastCommit.subject}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1 text-[10px] text-gray-500">
                          <User size={10}/>{info.lastCommit.author}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-gray-400">
                          <Clock size={10}/>{info.lastCommit.relTime}
                        </span>
                        <code className="ml-auto text-[10px] font-mono bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                          {info.lastCommit.shortHash}
                        </code>
                      </div>
                    </div>
                  </div>
                )}

                {info.remoteUrl && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Remote</p>
                    <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
                      <p className="text-[11px] font-mono text-gray-500 truncate flex-1">{info.remoteUrl}</p>
                      {info.repoWebUrl && (
                        <a href={info.repoWebUrl} target="_blank" rel="noopener noreferrer"
                          className="text-gray-400 hover:text-primary-600 transition-colors flex-shrink-0">
                          <ExternalLink size={12}/>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Stash count */}
                {(info.stashCount || 0) > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl">
                    <Archive size={12} className="text-amber-500 flex-shrink-0"/>
                    <p className="text-[11px] text-amber-700 font-medium">{info.stashCount} stash{info.stashCount === 1 ? '' : 'es'} saved</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Commits ── */}
            {tab === 'commits' && (
              <div className="h-full overflow-y-auto">
                {log.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 h-28 text-gray-400 text-xs">
                    <Loader2 size={15} className="animate-spin text-primary-400"/>Loading…
                  </div>
                ) : (
                  <div className="py-1">
                    {log.map((c, i) => (
                      <div key={c.hash} className="group flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                        {/* Timeline dot */}
                        <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white ${i === 0 ? 'bg-primary-600' : 'bg-gray-200'}`}>
                            <Circle size={6} className={i === 0 ? 'text-white fill-white' : 'text-gray-400 fill-gray-400'}/>
                          </div>
                          {i < log.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1 min-h-[12px]"/>}
                        </div>
                        <div className="min-w-0 flex-1 pb-1">
                          <p className="text-[11px] font-semibold text-gray-800 leading-tight line-clamp-1">{c.subject}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-gray-400 truncate max-w-[80px]">{c.author}</span>
                            <span className="text-gray-300 flex-shrink-0">·</span>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{c.relTime}</span>
                            <code className="ml-auto text-[10px] font-mono text-gray-400 bg-gray-100 px-1 py-0.5 rounded flex-shrink-0 group-hover:bg-gray-200 transition-colors">{c.shortHash}</code>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Branches ── */}
            {tab === 'branches' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {!branches ? (
                  <div className="flex items-center justify-center gap-2 h-24 text-gray-400 text-xs">
                    <Loader2 size={15} className="animate-spin text-primary-400"/>Loading…
                  </div>
                ) : (
                  <>
                    {/* Checkout */}
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Switch branch</label>
                      <div className="flex gap-1.5">
                        <select value={selBranch} onChange={e => setSelBranch(e.target.value)}
                          className="flex-1 text-[11px] px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-300 transition-all min-w-0">
                          <option value="">Select…</option>
                          {branches.local.map(b => <option key={b} value={b}>{b}{b === info.branch ? ' ✓' : ''}</option>)}
                          {branches.remote.map(b => <option key={b} value={b.replace(/^origin\//, '')}>{b}</option>)}
                        </select>
                        <button onClick={() => { if(selBranch) run(`Checkout ${selBranch}`, () => api.gitCheckout(folderPath, selBranch)); }}
                          disabled={!selBranch || !!loadingAction || selBranch === info.branch}
                          className="px-2.5 py-1.5 bg-primary-600 text-white text-[11px] font-bold rounded-lg hover:bg-primary-700 disabled:opacity-40 flex-shrink-0 transition-all">
                          {loadingAction?.startsWith('Checkout') ? <Loader2 size={11} className="animate-spin"/> : 'Go'}
                        </button>
                      </div>
                    </div>

                    {/* Local */}
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                        Local <span className="font-normal">({branches.local.length})</span>
                      </p>
                      <div className="space-y-0.5">
                        {branches.local.map((b: string) => (
                          <div key={b} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] group/b ${
                            b === info.branch
                              ? 'bg-primary-50 border border-primary-100 text-primary-700 font-bold'
                              : 'text-gray-600 hover:bg-gray-50 cursor-default'
                          }`}>
                            <GitBranch size={11} className={b === info.branch ? 'text-primary-500' : 'text-gray-300'}/>
                            <span className="truncate flex-1">{b}</span>
                            {b === info.branch
                              ? <span className="text-[9px] bg-primary-200 text-primary-700 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">active</span>
                              : <button onClick={() => setShowDeleteBranch(b)}
                                  className="opacity-0 group-hover/b:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
                                  title="Delete branch">
                                  <Trash2 size={11}/>
                                </button>
                            }
                          </div>
                        ))}
                      </div>
                      {/* Delete branch confirm */}
                      {showDeleteBranch && (
                        <div className="mt-2 p-2.5 bg-red-50 border border-red-100 rounded-xl">
                          <p className="text-[11px] text-red-700 font-medium mb-2">
                            Delete <code className="font-mono bg-red-100 px-1 rounded">{showDeleteBranch}</code>?
                          </p>
                          <div className="flex gap-2">
                            <button onClick={() => setShowDeleteBranch(null)}
                              className="flex-1 py-1 text-[11px] text-gray-600 hover:bg-white rounded-lg border border-gray-200 transition-colors">
                              Cancel
                            </button>
                            <button onClick={() => { run(`Delete ${showDeleteBranch}`, () => api.gitDeleteBranch(folderPath, showDeleteBranch!)); setShowDeleteBranch(null); setBranches(null); }}
                              disabled={!!loadingAction}
                              className="flex-1 py-1 text-[11px] text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50">
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Remote */}
                    {branches.remote.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                          Remote <span className="font-normal">({branches.remote.length})</span>
                        </p>
                        <div className="space-y-0.5">
                          {branches.remote.map(b => (
                            <div key={b} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-gray-500 hover:bg-gray-50">
                              <GitMerge size={11} className="text-gray-300 flex-shrink-0"/>
                              <span className="truncate">{b}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Changes ── */}
            {tab === 'changes' && (
              <div className="flex-1 overflow-y-auto p-3">
                {!info.changedFiles?.length ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center">
                      <CheckCircle2 size={20} className="text-emerald-400"/>
                    </div>
                    <p className="text-sm font-semibold text-gray-500">Working tree clean</p>
                    <p className="text-xs text-gray-400">No uncommitted changes</p>
                  </div>
                ) : (
                  <>
                    {/* Diff viewer */}
                    {showDiff && (
                      <div className="mb-3 rounded-xl overflow-hidden border border-gray-800">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900">
                          <span className="text-[10px] font-mono text-gray-400 flex items-center gap-1.5">
                            <Code2 size={11} className="text-green-400" />
                            {diffFile || 'All changes'}
                          </span>
                          <button onClick={() => setShowDiff(false)} className="text-gray-600 hover:text-gray-300">
                            <X size={11}/>
                          </button>
                        </div>
                        {loadingDiff ? (
                          <div className="bg-gray-950 flex items-center justify-center py-4 gap-2">
                            <Loader2 size={14} className="animate-spin text-green-400"/>
                            <span className="text-[11px] text-gray-500">Loading diff…</span>
                          </div>
                        ) : (
                          <pre className="text-[10px] font-mono px-3 py-2 bg-gray-950 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                            {diffOutput.split('\n').map((line, i) => (
                              <span key={i} className={
                                line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400 block' :
                                line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 block' :
                                line.startsWith('@@') ? 'text-blue-400 block' :
                                'text-gray-500 block'
                              }>{line || ' '}</span>
                            ))}
                          </pre>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                        {info.changedFiles.length} file{info.changedFiles.length === 1 ? '' : 's'} changed
                      </p>
                      <button onClick={() => loadDiff()}
                        className="text-[10px] text-primary-500 hover:text-primary-600 font-bold flex items-center gap-1 px-2 py-0.5 hover:bg-primary-50 rounded-lg transition-colors">
                        <Eye size={11}/> Diff all
                      </button>
                    </div>
                    <div className="space-y-0.5">
                      {(showAllChanges ? info.changedFiles : info.changedFiles.slice(0, 18)).map((f: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group/f min-w-0">
                          <StatusDot status={f.status}/>
                          <span className="text-[11px] font-mono text-gray-600 truncate flex-1 min-w-0 break-all">{f.file}</span>
                          <button onClick={() => loadDiff(f.file)}
                            className="opacity-0 group-hover/f:opacity-100 flex-shrink-0 p-0.5 text-gray-400 hover:text-primary-600 transition-all"
                            title="View diff">
                            <Code2 size={11}/>
                          </button>
                          <span className={`text-[9px] font-bold flex-shrink-0 w-5 text-center ${
                            f.status === 'M' ? 'text-yellow-500' :
                            f.status === 'A' ? 'text-green-500' :
                            f.status === 'D' ? 'text-red-500' :
                            f.status === '??' ? 'text-gray-400' : 'text-blue-500'
                          }`}>{f.status}</span>
                        </div>
                      ))}
                    </div>
                    {info.changedFiles.length > 18 && !showAllChanges && (
                      <button onClick={() => setShowAllChanges(true)}
                        className="w-full mt-2 text-[11px] text-primary-500 hover:text-primary-600 font-medium py-1.5 hover:bg-primary-50 rounded-lg transition-colors">
                        +{info.changedFiles.length - 18} more files…
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Actions ── */}
            {tab === 'actions' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-4">

                {/* Commit */}
                {info.isDirty && (
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <GitCommit size={11}/> Commit changes
                    </p>
                    <textarea
                      value={commitMsg}
                      onChange={e => setCommitMsg(e.target.value)}
                      placeholder="Commit message…"
                      rows={2}
                      className="w-full text-[11px] px-2.5 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-300 resize-none font-sans"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none">
                        <input type="checkbox" checked={addAll} onChange={e => setAddAll(e.target.checked)}
                          className="rounded text-primary-600 focus:ring-primary-300 w-3 h-3"/>
                        Stage all changes
                      </label>
                      <button
                        onClick={() => run('Commit', () => api.gitCommit(folderPath, commitMsg, addAll))}
                        disabled={!commitMsg.trim() || !!loadingAction}
                        className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white text-[11px] font-bold rounded-lg hover:bg-primary-700 disabled:opacity-40 transition-all shadow-sm"
                      >
                        {isLoading('Commit') ? <Loader2 size={11} className="animate-spin"/> : <GitCommit size={11}/>}
                        Commit
                      </button>
                    </div>
                  </div>
                )}

                {/* Create branch */}
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Plus size={11}/> New branch
                  </p>
                  <div className="flex gap-1.5">
                    <input
                      value={newBranch}
                      onChange={e => setNewBranch(e.target.value)}
                      placeholder="feature/my-branch"
                      className="flex-1 text-[11px] px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-300 font-mono min-w-0"
                    />
                    <button
                      onClick={() => run(`Create branch ${newBranch}`, () => api.gitCreateBranch(folderPath, newBranch, checkoutNew))}
                      disabled={!newBranch.trim() || !!loadingAction}
                      className="px-2.5 py-1.5 bg-primary-600 text-white text-[11px] font-bold rounded-lg hover:bg-primary-700 disabled:opacity-40 flex-shrink-0 transition-all"
                    >
                      {isLoading(`Create branch ${newBranch}`) ? <Loader2 size={11} className="animate-spin"/> : <Plus size={11}/>}
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-500 cursor-pointer select-none">
                    <input type="checkbox" checked={checkoutNew} onChange={e => setCheckoutNew(e.target.checked)}
                      className="rounded text-primary-600 focus:ring-primary-300 w-3 h-3"/>
                    Switch to new branch
                  </label>
                </div>

                {/* Tags */}
                {tags.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Tag size={11}/> Tags ({tags.length})
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {tags.map(t => (
                        <div key={t.name} className="flex items-center gap-2 text-[11px]">
                          <span className="font-bold text-gray-700 font-mono">{t.name}</span>
                          {t.date && <span className="text-gray-400">{t.date}</span>}
                          {t.message && <span className="text-gray-400 truncate">{t.message}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Remotes */}
                {remotes.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <GitPullRequest size={11}/> Remotes
                    </p>
                    <div className="space-y-2">
                      {remotes.map(r => (
                        <div key={r.name}>
                          <p className="text-[11px] font-bold text-gray-700 mb-0.5">{r.name}</p>
                          <p className="text-[10px] font-mono text-gray-400 truncate">{r.fetch || r.push}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Private repo credentials */}
                <div className={`rounded-xl p-3 border ${credStatus?.exists ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <KeyRound size={11}/>
                      {credStatus?.exists ? 'Authenticated' : 'Private repo credentials'}
                    </p>
                    {credStatus?.exists && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                        <Lock size={9}/> Saved
                      </span>
                    )}
                  </div>
                  {credStatus?.exists && !showCredForm ? (
                    <div className="space-y-2">
                      <div className="text-[11px] text-gray-500 space-y-0.5">
                        {credStatus.username && <p><span className="text-gray-400">User:</span> {credStatus.username}</p>}
                        <p><span className="text-gray-400">Token:</span> {'●'.repeat(12)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setShowCredForm(true); setCredUsername(credStatus.username || ''); }}
                          className="flex-1 py-1.5 text-[11px] font-bold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg flex items-center justify-center gap-1">
                          <Unlock size={11}/> Update
                        </button>
                        <button onClick={handleDeleteCreds} disabled={credLoading}
                          className="py-1.5 px-2.5 text-[11px] font-bold text-red-500 hover:bg-red-50 border border-red-200 rounded-lg disabled:opacity-50">
                          {credLoading ? <Loader2 size={11} className="animate-spin"/> : <Trash2 size={11}/>}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] text-gray-400">Enter your username and Personal Access Token for HTTPS remotes.</p>
                      <input value={credUsername} onChange={e => setCredUsername(e.target.value)}
                        placeholder="Username (optional)"
                        className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-300"/>
                      <div className="relative">
                        <input type={showToken ? 'text' : 'password'} value={credToken} onChange={e => setCredToken(e.target.value)}
                          placeholder="Personal Access Token / password"
                          className="w-full text-[11px] px-2.5 py-1.5 pr-8 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-300 font-mono"/>
                        <button type="button" onClick={() => setShowToken(t => !t)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {showToken ? <EyeOff size={12}/> : <Eye size={12}/>}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        {showCredForm && credStatus?.exists && (
                          <button onClick={() => setShowCredForm(false)}
                            className="flex-1 py-1.5 text-[11px] text-gray-500 hover:bg-white rounded-lg border border-gray-200">
                            Cancel
                          </button>
                        )}
                        <button onClick={handleTestCreds} disabled={!credToken.trim() || credLoading}
                          className="flex-1 py-1.5 text-[11px] font-bold bg-white border border-primary-200 text-primary-600 hover:bg-primary-50 rounded-lg disabled:opacity-40 flex items-center justify-center gap-1">
                          {credLoading ? <Loader2 size={11} className="animate-spin"/> : <CheckCircle2 size={11}/>}
                          Test
                        </button>
                        <button onClick={handleSaveCreds} disabled={!credToken.trim() || credLoading}
                          className="flex-1 py-1.5 text-[11px] font-bold bg-primary-600 text-white hover:bg-primary-700 rounded-lg shadow-sm disabled:opacity-40 flex items-center justify-center gap-1">
                          {credLoading ? <Loader2 size={11} className="animate-spin"/> : <Lock size={11}/>}
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Danger zone */}
                <div className="bg-red-50 rounded-xl p-3 border border-red-100">                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={11}/> Danger zone
                  </p>
                  {!confirmReset ? (
                    <button
                      onClick={() => setConfirmReset(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-[11px] font-bold rounded-lg hover:bg-red-50 transition-colors w-full justify-center"
                    >
                      <RotateCcw size={11}/> Reset to HEAD (hard)
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] text-red-600 font-medium">
                        This will discard ALL uncommitted changes. Are you sure?
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmReset(false)}
                          className="flex-1 py-1.5 text-[11px] font-bold text-gray-600 hover:bg-white rounded-lg transition-colors border border-gray-200">
                          Cancel
                        </button>
                        <button onClick={() => { run('Reset HEAD', () => api.gitReset(folderPath, 'hard')); setConfirmReset(false); }}
                          disabled={!!loadingAction}
                          className="flex-1 py-1.5 text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm disabled:opacity-50">
                          {isLoading('Reset HEAD') ? <Loader2 size={11} className="animate-spin mx-auto"/> : 'Yes, reset'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};
