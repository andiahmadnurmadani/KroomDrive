import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  RefreshCw, X, ArrowDownCircle, CheckCircle2,
  AlertTriangle, GitCommit, ChevronDown, ChevronUp,
  Loader2, ExternalLink, GitBranch,
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

export const UpdateModal: React.FC<UpdateModalProps> = ({ info, onClose, onUpdated }) => {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [logs, setLogs] = useState<{ type: string; message: string }[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleUpdate = useCallback(() => {
    setPhase('updating');
    setLogs([]);
    setShowLogs(true);

    const cancel = api.startUpdate(
      (type, message) => {
        setLogs(prev => [...prev, { type, message }]);
      },
      () => {
        setPhase('done');
        // Auto-reload after 3s
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      },
      (msg) => {
        setPhase('error');
        setErrorMsg(msg);
      },
    );
    cancelRef.current = cancel;
  }, []);

  const commitCount = info.commits?.length ?? 0;

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

        {/* Commits changelog */}
        {commitCount > 0 && (
          <div className="px-6 py-4 border-b border-gray-50 max-h-48 overflow-y-auto">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <GitBranch size={11} /> {commitCount} new commit{commitCount > 1 ? 's' : ''}
            </p>
            <div className="space-y-2">
              {info.commits.map((c, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="flex-shrink-0 mt-0.5">
                    <GitCommit size={13} className="text-gray-300" />
                  </div>
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

        {/* Footer */}
        <div className="px-6 py-5">
          {phase === 'idle' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700 leading-relaxed">
                <p className="font-bold mb-1">What will happen:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-amber-600 text-xs">
                  <li>Pull latest code from GitHub</li>
                  <li>Install npm packages (frontend + backend)</li>
                  <li>Build frontend</li>
                  <li>Restart app via PM2</li>
                </ol>
                <p className="mt-2 text-xs text-amber-500">The app will be briefly unavailable during restart (~30s).</p>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors font-medium">
                  Later
                </button>
                <button
                  onClick={handleUpdate}
                  className="flex-1 px-4 py-2.5 text-sm text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  <ArrowDownCircle size={16} />
                  Update Now
                </button>
              </div>
            </div>
          )}

          {phase === 'updating' && (
            <div className="flex flex-col items-center gap-3 py-2">
              <Loader2 size={28} className="animate-spin text-amber-500" />
              <p className="text-sm font-medium text-gray-700">Updating KroomDrive…</p>
              <p className="text-xs text-gray-400 text-center">Please don't close this window.</p>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center gap-3 py-2">
              <CheckCircle2 size={28} className="text-green-500" />
              <p className="text-sm font-bold text-gray-800">Update complete!</p>
              <p className="text-xs text-gray-400">The page will reload automatically…</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-1 flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-green-500 hover:bg-green-600 rounded-xl transition-colors font-bold"
              >
                <RefreshCw size={14} /> Reload now
              </button>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
                <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-700">Update failed</p>
                  <p className="text-xs text-red-600 mt-0.5 break-words">{errorMsg}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors font-medium">
                  Close
                </button>
                <button
                  onClick={handleUpdate}
                  className="flex-1 px-4 py-2.5 text-sm text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors font-bold flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            </div>
          )}
        </div>
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
