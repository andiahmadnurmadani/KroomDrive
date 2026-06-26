import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Server, Folder, FolderOpen, ChevronRight, ArrowLeft,
  CheckCircle2, Loader2, AlertTriangle, PieChart, Home,
  Shield, Eye, Edit3, Trash2, RefreshCw, Search
} from 'lucide-react';
import * as api from '../../services/api';
import { Permissions } from '../../types';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  isOpen: boolean;
  targetUsername: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface FolderEntry {
  name: string;
  path: string;       // srv:<id>:<remote_path>
  remotePath: string; // just the remote part
}

const PERM_CONFIG = [
  { key: 'read',   label: 'Read',   icon: <Eye size={14} />,    color: 'green'  },
  { key: 'write',  label: 'Write',  icon: <Edit3 size={14} />,  color: 'blue'   },
  { key: 'delete', label: 'Delete', icon: <Trash2 size={14} />, color: 'red'    },
];

export const GrantAccessModal: React.FC<Props> = ({ isOpen, targetUsername, onClose, onSuccess }) => {
  const { showToast, handleError } = useToast();

  // ── Step state: 'server' | 'folder' | 'confirm' ──────────────────────────
  const [step, setStep] = useState<'server' | 'folder' | 'confirm'>('server');

  // ── Server selection ──────────────────────────────────────────────────────
  const [servers, setServers] = useState<api.ServerDefinition[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [selectedServer, setSelectedServer] = useState<api.ServerDefinition | null>(null);

  // ── Folder browser ────────────────────────────────────────────────────────
  const [remotePath, setRemotePath] = useState('/');         // current browse path (remote)
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [selectedRemotePath, setSelectedRemotePath] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState('/');
  const [pathInputFocused, setPathInputFocused] = useState(false);

  // ── Permissions + quota ───────────────────────────────────────────────────
  const [perms, setPerms] = useState<Permissions>({ read: true, write: false, delete: false });
  const [quotaGB, setQuotaGB] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Load servers on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setStep('server');
    setSelectedServer(null);
    setRemotePath('/');
    setSelectedRemotePath(null);
    setPathInput('/');
    setPerms({ read: true, write: false, delete: false });
    setQuotaGB('');
    setLoadingServers(true);
    api.getServers()
      .then(s => setServers(s.filter(sv => sv.enabled)))
      .catch(() => setServers([]))
      .finally(() => setLoadingServers(false));
  }, [isOpen]);

  // ── Build srv: path helper ────────────────────────────────────────────────
  const srvPath = useCallback((remote: string) => {
    if (!selectedServer) return remote;
    return `srv:${selectedServer.id}:${remote}`;
  }, [selectedServer]);

  // ── Browse a remote directory ─────────────────────────────────────────────
  const browse = useCallback(async (remote: string) => {
    if (!selectedServer) return;
    setLoadingEntries(true);
    setBrowseError(null);
    setRemotePath(remote);
    setPathInput(remote);
    try {
      const items = await api.getList(srvPath(remote));
      const folders = items
        .filter(i => i.type === 'folder')
        .map(i => {
          // path returned is srv:<id>:/remote/child — extract remote part
          const remPart = i.path.startsWith('srv:')
            ? i.path.slice(41)  // skip "srv:" + 36-char UUID + ":"
            : i.path;
          return { name: i.name, path: i.path, remotePath: remPart };
        });
      setEntries(folders);
    } catch (e: any) {
      setBrowseError(e.message);
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, [selectedServer, srvPath]);

  // ── Go up one directory ───────────────────────────────────────────────────
  const goUp = () => {
    if (remotePath === '/') return;
    const parent = remotePath.replace(/\/[^/]+\/?$/, '') || '/';
    browse(parent);
  };

  // ── Breadcrumb parts ──────────────────────────────────────────────────────
  const breadcrumbs = remotePath === '/'
    ? [{ label: '/', remote: '/' }]
    : [
        { label: '/', remote: '/' },
        ...remotePath.replace(/^\//, '').split('/').filter(Boolean).map((part, i, arr) => ({
          label: part,
          remote: '/' + arr.slice(0, i + 1).join('/'),
        })),
      ];

  // ── Handle path input submit ──────────────────────────────────────────────
  const handlePathInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = '/' + pathInput.replace(/^\/+/, '');
    browse(clean);
  };

  // ── Handle server selection → go to step 2 ────────────────────────────────
  const handleSelectServer = (srv: api.ServerDefinition) => {
    setSelectedServer(srv);
    setStep('folder');
    setRemotePath('/');
    setPathInput('/');
    setSelectedRemotePath(null);
    setEntries([]);
    // Auto browse root
    setTimeout(() => {}, 0); // let state settle
  };

  useEffect(() => {
    if (step === 'folder' && selectedServer) {
      browse('/');
    }
  }, [step, selectedServer]);

  // ── Select current folder as target ──────────────────────────────────────
  const selectCurrentFolder = () => {
    setSelectedRemotePath(remotePath);
    setStep('confirm');
  };

  // ── Select a listed subfolder as target ──────────────────────────────────
  const selectEntry = (entry: FolderEntry) => {
    setSelectedRemotePath(entry.remotePath);
    setStep('confirm');
  };

  // ── Submit grant ──────────────────────────────────────────────────────────
  const handleGrant = async () => {
    if (!selectedRemotePath) return;
    setSaving(true);
    try {
      // The path stored in DB for the user is the raw remote path (e.g. /home/files)
      // But we need to tell the backend which server it's on.
      // We use the srv: format so backend resolves it correctly, then
      // the share endpoint stores just the remote path + server reference via storage lookup.
      // If no storage definition exists, we pass the raw path — backend handles it.
      await api.sharePath(
        targetUsername,
        selectedRemotePath,
        perms,
        quotaGB ? Number(quotaGB) : undefined,
        selectedServer!.id   // pass serverId so backend can associate correctly
      );
      showToast(`Access granted to ${targetUsername}`, 'success');
      onSuccess();
      onClose();
    } catch (e: any) {
      handleError(e);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // ── Step indicators ───────────────────────────────────────────────────────
  const steps = [
    { id: 'server', label: 'Server' },
    { id: 'folder', label: 'Folder' },
    { id: 'confirm', label: 'Confirm' },
  ];

  return (
    <div className="fixed inset-0 z-[70] bg-[#2B3674]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Grant Access</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Assign a folder to <span className="font-bold text-primary-600">@{targetUsername}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Step Bar ── */}
        <div className="px-6 pt-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-0">
            {steps.map((s, idx) => {
              const isDone = steps.findIndex(x => x.id === step) > idx;
              const isActive = s.id === step;
              return (
                <React.Fragment key={s.id}>
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isDone ? 'bg-primary-600 text-white' :
                      isActive ? 'bg-primary-600 text-white ring-4 ring-primary-100' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {isDone ? <CheckCircle2 size={14} /> : idx + 1}
                    </div>
                    <span className={`text-xs font-bold ${isActive ? 'text-primary-600' : isDone ? 'text-gray-500' : 'text-gray-300'}`}>
                      {s.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-3 rounded transition-all ${isDone ? 'bg-primary-400' : 'bg-gray-100'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ════ STEP 1: SELECT SERVER ════ */}
          {step === 'server' && (
            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-500 mb-4">Choose the SSH server where the folder is located.</p>
              {loadingServers ? (
                <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
                  <Loader2 size={22} className="animate-spin text-primary-500" />
                  <span className="text-sm">Loading servers...</span>
                </div>
              ) : servers.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <Server className="mx-auto text-gray-300 mb-3" size={32} />
                  <p className="text-gray-500 font-medium text-sm">No servers configured</p>
                  <p className="text-gray-400 text-xs mt-1">Add a server in the Servers & Storage tab first</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {servers.map(srv => (
                    <button
                      key={srv.id}
                      onClick={() => handleSelectServer(srv)}
                      className="group text-left p-4 border border-gray-100 rounded-xl hover:border-primary-300 hover:bg-primary-50/50 hover:shadow-md transition-all relative overflow-hidden"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gray-50 group-hover:bg-primary-100 rounded-xl transition-colors">
                          <Server size={20} className="text-gray-400 group-hover:text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-800 group-hover:text-primary-700 text-sm truncate">
                            {srv.name}
                          </p>
                          <p className="text-xs text-gray-400 font-mono truncate">
                            {srv.username}@{srv.host}:{srv.port}
                          </p>
                        </div>
                      </div>
                      <ChevronRight
                        size={16}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-primary-500 transition-colors"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════ STEP 2: BROWSE FOLDER ════ */}
          {step === 'folder' && selectedServer && (
            <div className="flex flex-col" style={{ height: '400px' }}>
              {/* Browser toolbar */}
              <div className="px-4 pt-4 pb-2 flex-shrink-0 space-y-2">
                {/* Server badge + back */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep('server')}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Back to server selection"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div className="flex items-center gap-2 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-100">
                    <Server size={12} />
                    {selectedServer.name}
                    <span className="text-indigo-400 font-normal">({selectedServer.host})</span>
                  </div>
                  <button
                    onClick={() => browse(remotePath)}
                    className="ml-auto p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Reload"
                  >
                    <RefreshCw size={14} className={loadingEntries ? 'animate-spin' : ''} />
                  </button>
                </div>

                {/* Path input + go up */}
                <div className="flex gap-2">
                  <button
                    onClick={goUp}
                    disabled={remotePath === '/'}
                    className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors flex-shrink-0"
                    title="Go up"
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <button
                    onClick={() => browse('/')}
                    className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                    title="Root"
                  >
                    <Home size={15} />
                  </button>
                  <form onSubmit={handlePathInputSubmit} className="flex-1 flex">
                    <input
                      value={pathInput}
                      onChange={e => setPathInput(e.target.value)}
                      onFocus={() => setPathInputFocused(true)}
                      onBlur={() => setPathInputFocused(false)}
                      className="flex-1 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all"
                    />
                  </form>
                </div>

                {/* Breadcrumb */}
                {!pathInputFocused && (
                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                    {breadcrumbs.map((bc, i) => (
                      <React.Fragment key={bc.remote}>
                        {i > 0 && <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />}
                        <button
                          onClick={() => browse(bc.remote)}
                          className={`text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0 ${
                            bc.remote === remotePath ? 'font-bold text-primary-600' : 'text-gray-500'
                          }`}
                        >
                          {bc.label}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>

              {/* Folder list */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {loadingEntries ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                    <Loader2 size={24} className="animate-spin text-primary-500" />
                    <span className="text-xs">Loading...</span>
                  </div>
                ) : browseError ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400">
                    <AlertTriangle size={24} />
                    <p className="text-xs text-center max-w-xs">{browseError}</p>
                    <button
                      onClick={() => browse(remotePath)}
                      className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* Select current folder button */}
                    <button
                      onClick={selectCurrentFolder}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary-50 border border-primary-200 text-primary-700 hover:bg-primary-100 transition-colors text-sm font-bold mb-3"
                    >
                      <CheckCircle2 size={16} className="text-primary-500 flex-shrink-0" />
                      <span className="truncate text-left">
                        Select this folder
                        <span className="block text-[10px] font-mono text-primary-400 font-normal">{remotePath}</span>
                      </span>
                    </button>

                    {/* Subfolders */}
                    {entries.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-xs italic">
                        No subfolders found
                      </div>
                    ) : (
                      entries.map(entry => (
                        <div key={entry.remotePath} className="flex items-center gap-1 group rounded-xl hover:bg-gray-50 transition-colors">
                          {/* Click name → select this folder */}
                          <button
                            onClick={() => selectEntry(entry)}
                            className="flex-1 flex items-center gap-2.5 px-3 py-2.5 text-left min-w-0"
                          >
                            <Folder
                              size={18}
                              className="text-yellow-400 fill-yellow-100 flex-shrink-0 group-hover:text-yellow-500"
                            />
                            <span className="text-sm text-gray-700 font-medium truncate group-hover:text-gray-900">
                              {entry.name}
                            </span>
                          </button>
                          {/* Chevron → navigate into folder */}
                          <button
                            onClick={(e) => { e.stopPropagation(); browse(entry.remotePath); }}
                            className="p-2 text-gray-300 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors flex-shrink-0 mr-1"
                            title="Open folder"
                          >
                            <FolderOpen size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════ STEP 3: CONFIRM & PERMISSIONS ════ */}
          {step === 'confirm' && selectedServer && selectedRemotePath && (
            <div className="p-6 space-y-5">
              {/* Back */}
              <button
                onClick={() => setStep('folder')}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ArrowLeft size={14} /> Back to folder browser
              </button>

              {/* Selected path summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2.5 bg-yellow-50 rounded-xl flex-shrink-0">
                  <Folder size={20} className="text-yellow-500 fill-yellow-100" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-0.5">Selected Folder</p>
                  <p className="font-bold text-gray-800 text-sm truncate">{selectedRemotePath}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Server size={11} className="text-gray-400" />
                    <span className="text-xs text-gray-400">{selectedServer.name} · {selectedServer.host}</span>
                  </div>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">
                  <Shield size={12} className="inline mr-1" />
                  Permissions
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PERM_CONFIG.map(({ key, label, icon, color }) => {
                    const active = perms[key as keyof Permissions];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPerms(p => ({ ...p, [key]: !p[key as keyof Permissions] }))}
                        className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all font-bold text-xs ${
                          active
                            ? color === 'green' ? 'bg-green-50 border-green-400 text-green-700 shadow-sm'
                            : color === 'blue'  ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm'
                            :                    'bg-red-50 border-red-400 text-red-700 shadow-sm'
                            : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        <div className={active ? '' : 'opacity-40'}>{icon}</div>
                        {label}
                        {active && <CheckCircle2 size={12} className="mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
                {!perms.read && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertTriangle size={12} /> Read access is recommended for the user to see files.
                  </p>
                )}
              </div>

              {/* Quota */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  <PieChart size={12} className="inline mr-1" />
                  Storage Quota
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="Leave empty for unlimited"
                    value={quotaGB}
                    onChange={e => setQuotaGB(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 text-sm pr-12"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">GB</span>
                </div>
                {quotaGB && (
                  <p className="text-xs text-gray-400 mt-1">
                    Quota: <span className="font-bold text-gray-600">{quotaGB} GB</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50/50">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Cancel
          </button>

          {step === 'confirm' && (
            <button
              onClick={handleGrant}
              disabled={saving || !selectedRemotePath}
              className="px-6 py-2.5 bg-primary-600 text-white font-bold text-sm rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-600/20 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Granting...' : 'Grant Access'}
            </button>
          )}

          {step === 'folder' && (
            <p className="text-xs text-gray-400">
              Click a folder name to select it, or <span className="text-primary-500 font-medium">▷</span> to browse inside
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
