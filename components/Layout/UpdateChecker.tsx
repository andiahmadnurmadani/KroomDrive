import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  RefreshCw, X, ArrowDownCircle, CheckCircle2,
  AlertTriangle, GitCommit, ChevronDown, ChevronUp,
  Loader2, GitBranch, KeyRound, Eye, EyeOff,
} from 'lucide-react';
import * as api from '../../services/api';
import type { UpdateCheckResult } from '../../services/api';

// ─── Update Badge (shown in sidebar) ─────────────────────────────────────────
interface UpdateBadgeProps {
  onClick: () => void;
  checking: boolean;
  hasUpdate: boolean;
  collapsed: boolean;
}

export const UpdateBadge: React.FC<UpdateBadgeProps> = ({ onClick, checking, hasUpdate, collapsed }) => {
  if (checking) {
    return collapsed ? null : (
      <button disabled className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-gray-400 text-xs">
        <Loader2 size={13} className="animate-spin flex-shrink-0" />
        <span>Checking for updates…</span>
      </button>
    );
  }

  if (!hasUpdate) return null;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors text-xs font-bold animate-pulse-once ${
        collapsed ? 'justify-center' : ''
      }`}
      title="App update available — click to update"
    >
      <ArrowDownCircle size={15} className="flex-shrink-0 text-amber-500" />
      {!collapsed && <span>Update available</span>}
    </button>
  );
};

// ─── Update Modal ─────────────────────────────────────────────────────────────
interface UpdateModalProps {
  info: UpdateCheckResult;
  onClose: () => void;
  onUpdated: () => void;
}

type UpdatePhase = 'idle' | 'updating' | 'done' | 'error';
type ModalTab = 'update' | 'credentials';

export const UpdateModal: React.FC<UpdateModalProps> = ({ info, onClose, onUpdated }) => {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [logs, setLogs] = useState<{ type: string; message: string }[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [tab, setTab] = useState<ModalTab>('update');

  // Credentials form
  const [credUsername, setCredUsername] = useState('');
  const [credToken, setCredToken]       = useState('');
  const [showToken, setShowToken]       = useState(false);
  const [credSaving, setCredSaving]     = useState(false);
  const [credSaved, setCredSaved]       = useState(false);
  const [credExists, setCredExists]     = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Load existing credentials status
  useEffect(() => {
    api.getSystemGitCredentials()
      .then(r => {
        setCredExists(r.exists && r.hasToken);
        if (r.username) setCredUsername(r.username);
      })
      .catch(() => {});
  }, []);

  const handleSaveCreds = async () => {
    if (!credToken.trim()) return;
    setCredSaving(true);
    try {
      await api.saveSystemGitCredentials(credUsername.trim(), credToken.trim());
      setCredSaved(true);
      setCredExists(true);
      setCredToken('');
      setTimeout(() => setCredSaved(false), 3000);
    } catch (e: any) {
      alert('Failed to save: ' + e.message);
    } finally {
      setCredSaving(false);
    }
  };

  const handleUpdate = useCallback(() => {
    setPhase('updating');
    setLogs([]);
    setShowLogs(true);
    setTab('update');

    api.startUpdate(
      (type, message) => setLogs(prev => [...prev, { type, message }]),
      () => {
        setPhase('done');
        setTimeout(() => window.location.reload(), 3000);
      },
      (msg) => {
        setPhase('error');
        setErrorMsg(msg);
      },
    );
  }, []);

  const commitCount = info.commits?.length ?? 0;
  const isAuthError = errorMsg.toLowerCase().includes('authentication') ||
                      errorMsg.toLowerCase().includes('username or token') ||
                      errorMsg.toLowerCase().includes('403') ||
                      errorMsg.toLowerCase().includes('401');

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in slide-in-from-bottom-4 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
              <ArrowDownCircle size={20} className="text-amber-500" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">Update Available</h2>
              <p className="text-xs text-gray-400 font-mono">
                {info.currentCommit} → {info.remoteCommit}
                {info.branch && <span className="ml-1.5 text-gray-300">on {info.branch}</span>}
              </p>
            </div>
          </div>
          {phase !== 'updating' && (
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Tabs */}
        {phase === 'idle' || phase === 'error' ? (
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setTab('update')}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors ${tab === 'update' ? 'text-amber-600 border-b-2 border-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Update
            </button>
            <button
              onClick={() => setTab('credentials')}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${tab === 'credentials' ? 'text-amber-600 border-b-2 border-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <KeyRound size={12} />
              Git Credentials
              {credExists && <span className="w-1.5 h-1.5 rounded-full bg-green-400 ml-0.5" />}
            </button>
          </div>
        ) : null}

        {/* Tab: Update */}
        {tab === 'update' && (
          <>
            {/* Commits changelog */}
            {commitCount > 0 && phase === 'idle' && (
              <div className="px-6 py-4 border-b border-gray-50 max-h-44 overflow-y-auto">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <GitBranch size={11} /> {commitCount} new commit{commitCount > 1 ? 's' : ''}
                </p>
                <div className="space-y-2">
                  {info.commits.map((c, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <GitCommit size={13} className="text-gray-300 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-700 font-medium leading-snug">{c.subject}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          <span className="font-mono text-gray-300">{c.hash}</span>
                          <span className="mx-1">·</span>{c.author}
                          <span className="mx-1">·</span>{c.relTime}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Log output */}
            {showLogs && (
              <div className="border-b border-gray-100">
                <button
                  onClick={() => setShowLogs(s => !s)}
                  className="w-full flex items-center gap-2 px-6 py-2.5 text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {showLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  Update log
                </button>
                {showLogs && (
                  <div className="bg-gray-950 px-4 py-3 max-h-52 overflow-y-auto font-mono text-[11px] leading-relaxed">
                    {logs.map((l, i) => (
                      <div key={i} className={`${
                        l.type === 'step'     ? 'text-blue-400 font-bold mt-1' :
                        l.type === 'done'     ? 'text-green-400' :
                        l.type === 'error'    ? 'text-red-400 font-bold' :
                        l.type === 'complete' ? 'text-green-300 font-bold mt-1' :
                        l.type === 'start'    ? 'text-gray-400' :
                        'text-gray-300'
                      }`}>
                        {l.message}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            )}

            {/* Footer actions */}
            <div className="px-6 py-5">
              {phase === 'idle' && (
                <div className="space-y-4">
                  {!credExists && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-600 flex items-start gap-2">
                      <KeyRound size={13} className="flex-shrink-0 mt-0.5" />
                      <span>
                        If this is a private repo, save your GitHub token in the <button onClick={() => setTab('credentials')} className="underline font-bold">Git Credentials</button> tab first.
                      </span>
                    </div>
                  )}
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
                    <p className="font-bold mb-1 text-xs uppercase tracking-wide">Update steps:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-amber-600 text-xs">
                      <li>git pull (latest code)</li>
                      <li>npm install (frontend + backend)</li>
                      <li>vite build (compile frontend)</li>
                      <li>pm2 restart kroomdrive</li>
                    </ol>
                    <p className="mt-2 text-xs text-amber-500">App will be briefly unavailable during restart (~30s).</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors font-medium">
                      Later
                    </button>
                    <button onClick={handleUpdate} className="flex-1 px-4 py-2.5 text-sm text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20">
                      <ArrowDownCircle size={16} /> Update Now
                    </button>
                  </div>
                </div>
              )}

              {phase === 'updating' && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <Loader2 size={28} className="animate-spin text-amber-500" />
                  <p className="text-sm font-medium text-gray-700">Updating KroomDrive…</p>
                  <p className="text-xs text-gray-400">Please don't close this window.</p>
                </div>
              )}

              {phase === 'done' && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <CheckCircle2 size={28} className="text-green-500" />
                  <p className="text-sm font-bold text-gray-800">Update complete!</p>
                  <p className="text-xs text-gray-400">The page will reload automatically…</p>
                  <button onClick={() => window.location.reload()} className="mt-1 flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-green-500 hover:bg-green-600 rounded-xl transition-colors font-bold">
                    <RefreshCw size={14} /> Reload now
                  </button>
                </div>
              )}

              {phase === 'error' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
                    <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-red-700">Update failed</p>
                      <p className="text-xs text-red-600 mt-0.5 break-all">{errorMsg}</p>
                    </div>
                  </div>
                  {isAuthError && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 flex items-start gap-2">
                      <KeyRound size={13} className="flex-shrink-0 mt-0.5" />
                      <span>
                        Authentication failed. <button onClick={() => setTab('credentials')} className="underline font-bold">Save your GitHub token</button> then retry.
                      </span>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors font-medium">
                      Close
                    </button>
                    <button onClick={handleUpdate} className="flex-1 px-4 py-2.5 text-sm text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors font-bold flex items-center justify-center gap-2">
                      <RefreshCw size={14} /> Retry
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab: Credentials */}
        {tab === 'credentials' && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              If the KroomDrive repo is <strong>private</strong>, enter a GitHub Personal Access Token (PAT) with <code className="bg-gray-100 px-1 rounded">repo</code> scope. This is only used for <code className="bg-gray-100 px-1 rounded">git pull</code> during updates.
            </p>

            {credExists && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-xs text-green-700 font-medium">
                <CheckCircle2 size={14} className="text-green-500" />
                Token saved — updates will use stored credentials
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">GitHub Username</label>
                <input
                  type="text"
                  value={credUsername}
                  onChange={e => setCredUsername(e.target.value)}
                  placeholder="your-github-username"
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Personal Access Token</label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={credToken}
                    onChange={e => setCredToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 pr-9 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 font-mono"
                  />
                  <button
                    onClick={() => setShowToken(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    type="button"
                  >
                    {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Generate at: github.com → Settings → Developer settings → Personal access tokens
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setTab('update')} className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors font-medium">
                Back
              </button>
              <button
                onClick={handleSaveCreds}
                disabled={!credToken.trim() || credSaving}
                className="flex-1 px-4 py-2.5 text-sm text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 rounded-xl transition-colors font-bold flex items-center justify-center gap-2"
              >
                {credSaving ? <Loader2 size={14} className="animate-spin" /> : credSaved ? <CheckCircle2 size={14} /> : <KeyRound size={14} />}
                {credSaving ? 'Saving…' : credSaved ? 'Saved!' : 'Save Token'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main hook — use this in Sidebar ─────────────────────────────────────────
export function useUpdateChecker() {
  const [checking, setChecking]     = useState(false);
  const [result, setResult]         = useState<UpdateCheckResult | null>(null);
  const [showModal, setShowModal]   = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const r = await api.checkForUpdates();
      setResult(r);
    } catch (_) {
      setResult(null);
    } finally {
      setChecking(false);
    }
  }, []);

  // Auto-check on mount, then every 30 minutes
  useEffect(() => {
    check();
    const interval = setInterval(check, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [check]);

  return {
    checking,
    hasUpdate: result?.hasUpdate ?? false,
    result,
    showModal,
    openModal: () => setShowModal(true),
    closeModal: () => setShowModal(false),
    recheck: check,
  };
}
