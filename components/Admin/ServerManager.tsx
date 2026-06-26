import React, { useState, useEffect } from 'react';
import {
  Server, Plus, Trash2, CheckCircle2, XCircle, Loader2,
  Edit2, Wifi, WifiOff, Eye, EyeOff, X, AlertTriangle, RefreshCw,
  Monitor, Apple, HardDrive, Cpu, Layers, Zap
} from 'lucide-react';
import * as api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useFile } from '../../contexts/FileContext';
import { StorageDefinition } from '../../types';

// ─── OS Badge ────────────────────────────────────────────────────────────────

const OS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  linux:    { label: 'Linux',    color: 'bg-orange-50 text-orange-700 border-orange-200',   icon: <Monitor size={11} /> },
  macos:    { label: 'macOS',    color: 'bg-gray-50 text-gray-700 border-gray-200',         icon: <Apple size={11} /> },
  synology: { label: 'Synology', color: 'bg-blue-50 text-blue-700 border-blue-200',         icon: <HardDrive size={11} /> },
  qnap:     { label: 'QNAP',     color: 'bg-indigo-50 text-indigo-700 border-indigo-200',   icon: <Layers size={11} /> },
  truenas:  { label: 'TrueNAS',  color: 'bg-cyan-50 text-cyan-700 border-cyan-200',         icon: <Cpu size={11} /> },
  freebsd:  { label: 'FreeBSD',  color: 'bg-red-50 text-red-700 border-red-200',            icon: <Cpu size={11} /> },
  openwrt:  { label: 'OpenWrt',  color: 'bg-green-50 text-green-700 border-green-200',      icon: <Zap size={11} /> },
  posix:    { label: 'POSIX',    color: 'bg-gray-50 text-gray-500 border-gray-200',         icon: <Server size={11} /> },
  unknown:  { label: 'Unknown',  color: 'bg-gray-50 text-gray-400 border-gray-200',         icon: <Server size={11} /> },
};

const OSBadge: React.FC<{ osType: string }> = ({ osType }) => {
  const meta = OS_META[osType] || OS_META.unknown;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.color}`}>
      {meta.icon} {meta.label}
    </span>
  );
};

export interface ServerDefinition {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  enabled: boolean;
  os_type: string;
  conn_type: 'direct' | 'cloudflare';
  tunnel_url?: string;
  created_at: string;
}

interface ServerFormData {
  name: string;
  connType: 'direct' | 'cloudflare';
  // direct fields
  host: string;
  port: string;
  // cloudflare fields
  tunnelUrl: string;
  cfTokenId: string;
  cfTokenSecret: string;
  // auth
  username: string;
  password: string;
  privateKey: string;
}

const emptyForm: ServerFormData = {
  name: '', connType: 'direct',
  host: '', port: '22',
  tunnelUrl: '', cfTokenId: '', cfTokenSecret: '',
  username: '', password: '', privateKey: '',
};

// ─── StorageDropdown — collapsible storage list inside a server card ─────────

const StorageDropdown: React.FC<{ storages: any[] }> = ({ storages }) => {
  const [open, setOpen] = useState(false);

  const fmtBytes = (b: number | null) => {
    if (b === null || b === undefined) return null;
    if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
    if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.round(b / 1024)} KB`;
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {/* Dropdown trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between group/btn"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
            Defined Storages
          </span>
          <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
            {storages.length}
          </span>
        </div>
        <div className={`p-0.5 rounded text-gray-400 group-hover/btn:text-gray-600 transition-all duration-150 ${open ? 'rotate-180' : ''}`}>
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Dropdown content */}
      {open && (
        <div className="mt-2 space-y-1.5 animate-in slide-in-from-top-1 fade-in duration-150">
          {storages.map((s: any) => {
            const hasQuota = s.quotaBytes != null;
            const percent = s.usedPercent;
            const isFull = percent !== null && percent >= 100;
            const isNear = percent !== null && percent >= 85;

            return (
              <div key={s._id} className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                {/* Storage header */}
                <div className="flex items-start justify-between px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-800 truncate">{s.name}</p>
                    <p className="text-[10px] font-mono text-gray-400 truncate mt-0.5">{s.rootPath}</p>
                  </div>
                  {/* Usage pill */}
                  {hasQuota && percent !== null ? (
                    <span className={`ml-2 flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isFull  ? 'bg-red-100 text-red-700' :
                      isNear  ? 'bg-orange-100 text-orange-700' :
                                'bg-indigo-50 text-indigo-600'
                    }`}>
                      {percent}%
                    </span>
                  ) : !hasQuota ? (
                    <span className="ml-2 flex-shrink-0 text-[10px] font-medium text-gray-400">∞</span>
                  ) : null}
                </div>

                {/* Quota bar */}
                {hasQuota && (
                  <div className="px-3 pb-2">
                    <div className="h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isFull ? 'bg-red-500' : isNear ? 'bg-orange-400' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${Math.min(percent ?? 0, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] text-gray-400 font-medium">
                      <span>{fmtBytes(s.usedBytes) ?? 'Calculating…'} used</span>
                      <span>{s.quotaGB} GB quota</span>
                    </div>
                  </div>
                )}
                {/* Quota set but usage not available */}
                {hasQuota && s.usedBytes === null && (
                  <div className="px-3 pb-2 flex items-center gap-1.5 text-[10px] text-gray-400">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 flex-shrink-0 opacity-50"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l1.5 1.5" strokeLinecap="round"/></svg>
                    <span>Usage unavailable · <span className="font-semibold text-gray-500">{s.quotaGB} GB</span> quota set</span>
                  </div>
                )}
                {/* No quota — show usage if available, otherwise explain */}
                {!hasQuota && s.usedBytes !== null && (
                  <div className="px-3 pb-2">
                    <p className="text-[10px] text-gray-500">
                      <span className="font-semibold">{fmtBytes(s.usedBytes)}</span>
                      <span className="text-gray-400"> used · no quota limit</span>
                    </p>
                  </div>
                )}
                {!hasQuota && s.usedBytes === null && (
                  <div className="px-3 pb-2 flex items-center gap-1.5 text-[10px] text-gray-400">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 flex-shrink-0 opacity-50"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l1.5 1.5" strokeLinecap="round"/></svg>
                    <span>Size unavailable · no quota limit</span>
                  </div>
                )}

                {/* Users */}
                {s.users && s.users.length > 0 ? (
                  <div className="border-t border-gray-100 px-3 py-2 flex flex-wrap gap-1.5">
                    {s.users.map((u: any) => (
                      <span key={u.id} className="inline-flex items-center gap-1 text-[10px] font-bold bg-white border border-gray-200 px-2 py-0.5 rounded-lg text-gray-700 shadow-sm">
                        <span className="w-3.5 h-3.5 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-[8px] font-black flex-shrink-0">
                          {u.username.charAt(0).toUpperCase()}
                        </span>
                        {u.username}
                        <span className="text-gray-300 ml-0.5">
                          {u.permissions.read ? 'R' : ''}
                          {u.permissions.write ? 'W' : ''}
                          {u.permissions.delete ? 'D' : ''}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="border-t border-gray-100 px-3 py-1.5">
                    <p className="text-[10px] text-gray-400 italic">No users assigned</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ServerManager: React.FC = () => {
  const { showToast, handleError } = useToast();
  const { fetchDriveInfo } = useFile();

  const [servers, setServers] = useState<ServerDefinition[]>([]);
  const [storages, setStorages] = useState<StorageDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServerFormData>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [testLoading, setTestLoading] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'fail' | null>>({});
  const [detectingOS, setDetectingOS] = useState<string | null>(null);

  // Storage form
  const [showStorageForm, setShowStorageForm] = useState(false);
  const [storageForm, setStorageForm] = useState({ name: '', serverId: '', rootPath: '', quotaGB: '' });
  const [storageLoading, setStorageLoading] = useState(false);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; type: 'server' | 'storage' } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [srv, stor] = await Promise.all([
        api.getServers(),
        api.getDefinedStorages(),
      ]);
      setServers(srv);
      setStorages(stor);
    } catch (e: any) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestLoading(id);
    setTestResults(prev => ({ ...prev, [id]: null }));
    try {
      await api.testServer(id);
      setTestResults(prev => ({ ...prev, [id]: 'ok' }));
      showToast('Connection successful', 'success');
      // Auto-detect OS after successful connection test
      handleDetectOS(id);
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [id]: 'fail' }));
      handleError(e);
    } finally {
      setTestLoading(null);
    }
  };

  const handleDetectOS = async (id: string) => {
    setDetectingOS(id);
    try {
      const result = await api.detectServerOS(id);
      showToast(`OS detected: ${result.osType}`, 'success');
      load(); // refresh list to show updated os_type
    } catch (e: any) {
      handleError(e);
    } finally {
      setDetectingOS(null);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const base = {
        name: form.name,
        username: form.username,
        password: form.password || undefined,
        privateKey: form.privateKey || undefined,
        connType: form.connType,
        testConn: true,
      };

      const payload = form.connType === 'cloudflare'
        ? {
            ...base,
            tunnelUrl: form.tunnelUrl,
            cfTokenId: form.cfTokenId || undefined,
            cfTokenSecret: form.cfTokenSecret || undefined,
          }
        : {
            ...base,
            host: form.host,
            port: parseInt(form.port) || 22,
          };

      if (editingId) {
        await api.updateServer(editingId, payload);
        showToast('Server updated', 'success');
      } else {
        await api.createServer(payload);
        showToast('Server added and connection verified', 'success');
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      load();
      fetchDriveInfo();
    } catch (e: any) {
      handleError(e);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (server: ServerDefinition) => {
    setEditingId(server.id);
    setForm({
      name: server.name,
      connType: server.conn_type || 'direct',
      host: server.host,
      port: String(server.port),
      tunnelUrl: server.tunnel_url || '',
      cfTokenId: '',
      cfTokenSecret: '',
      username: server.username,
      password: '',
      privateKey: '',
    });
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    try {
      if (deleteConfirm.type === 'server') {
        await api.deleteServer(deleteConfirm.id);
        showToast('Server removed', 'success');
      } else {
        await api.deleteStorageDefinition(deleteConfirm.id);
        showToast('Storage removed', 'success');
      }
      setDeleteConfirm(null);
      load();
      fetchDriveInfo(); // refresh sidebar after server/storage removed
    } catch (e: any) {
      handleError(e);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleStorageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStorageLoading(true);
    try {
      await api.createStorageDefinition({
        name: storageForm.name,
        serverId: storageForm.serverId,
        rootPath: storageForm.rootPath,
        quotaGB: storageForm.quotaGB ? Number(storageForm.quotaGB) : undefined,
      });
      showToast('Storage defined', 'success');
      setShowStorageForm(false);
      setStorageForm({ name: '', serverId: '', rootPath: '', quotaGB: '' });
      load();
      fetchDriveInfo(); // storage list change affects sidebar for users
    } catch (e: any) {
      handleError(e);
    } finally {
      setStorageLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-primary-500" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── SSH Servers ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Server size={20} className="text-primary-600" /> SSH Servers
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Remote servers accessed via SSH/SFTP</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20"
            >
              <Plus size={16} /> Add Server
            </button>
          </div>
        </div>

        {/* Server Form */}
        {showForm && (
          <form
            onSubmit={handleFormSubmit}
            className="bg-white rounded-2xl border border-primary-100 shadow-soft p-6 mb-4 animate-in slide-in-from-top-2 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">{editingId ? 'Edit Server' : 'Add New Server'}</h3>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}>
                <X size={18} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Display Name *</label>
              <input
                required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Production Server"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>

            {/* Connection Type Selector */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Connection Type *</label>
              <div className="grid grid-cols-2 gap-3">
                {/* Direct / IP */}
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, connType: 'direct' }))}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                    form.connType === 'direct'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${form.connType === 'direct' ? 'bg-primary-100' : 'bg-gray-100'}`}>
                    <Server size={20} className={form.connType === 'direct' ? 'text-primary-600' : 'text-gray-400'} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Direct / IP</p>
                    <p className={`text-[11px] mt-0.5 leading-tight ${form.connType === 'direct' ? 'text-primary-500' : 'text-gray-400'}`}>
                      Connect via IP address or hostname on SSH port
                    </p>
                  </div>
                  {form.connType === 'direct' && (
                    <CheckCircle2 size={16} className="text-primary-600 self-end ml-auto" />
                  )}
                </button>

                {/* Cloudflare Tunnel */}
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, connType: 'cloudflare' }))}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                    form.connType === 'cloudflare'
                      ? 'border-orange-400 bg-orange-50 text-orange-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${form.connType === 'cloudflare' ? 'bg-orange-100' : 'bg-gray-100'}`}>
                    <svg viewBox="0 0 24 24" className={`w-6 h-6 ${form.connType === 'cloudflare' ? 'text-orange-500' : 'text-gray-400'}`} fill="currentColor">
                      <path d="M16.5 15.5c.28-.96.17-1.85-.32-2.5-.46-.62-1.18-1-2.04-1.04l-.2-.01-.07-.19c-.26-.71-.79-1.28-1.47-1.59a3.07 3.07 0 0 0-1.37-.3c-1.37 0-2.57.93-2.94 2.25l-.06.2-.2.04a2.26 2.26 0 0 0-1.83 2.22c0 1.25 1.01 2.27 2.25 2.27h7.5c.97 0 1.75-.78 1.75-1.75 0-.2-.04-.4-.1-.6H16.5z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-sm">Cloudflare Tunnel</p>
                    <p className={`text-[11px] mt-0.5 leading-tight ${form.connType === 'cloudflare' ? 'text-orange-500' : 'text-gray-400'}`}>
                      Connect via Cloudflare Access SSH tunnel URL
                    </p>
                  </div>
                  {form.connType === 'cloudflare' && (
                    <CheckCircle2 size={16} className="text-orange-500 self-end ml-auto" />
                  )}
                </button>
              </div>
            </div>

            {/* Connection-type specific fields */}
            {form.connType === 'direct' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Host / IP *</label>
                  <input
                    required={form.connType === 'direct'}
                    value={form.host}
                    onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                    placeholder="192.168.1.10 or server.example.com"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">SSH Port</label>
                  <input
                    type="number" value={form.port}
                    onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                    placeholder="22"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-4 bg-orange-50/50 rounded-xl border border-orange-100">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                    Tunnel URL / Hostname *
                  </label>
                  <input
                    required={form.connType === 'cloudflare'}
                    value={form.tunnelUrl}
                    onChange={e => setForm(f => ({ ...f, tunnelUrl: e.target.value }))}
                    placeholder="ssh.yourdomain.com  or  https://ssh.yourdomain.com"
                    className="w-full px-4 py-2.5 bg-white border border-orange-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-300 text-sm font-mono"
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                    The hostname configured in your <span className="font-mono bg-gray-100 px-1 rounded">cloudflared</span> tunnel for SSH access.
                    Make sure <span className="font-bold">SSH</span> application is enabled in Cloudflare Access for this hostname.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                      CF Service Token ID
                      <span className="text-gray-300 font-normal ml-1">(optional)</span>
                    </label>
                    <input
                      value={form.cfTokenId}
                      onChange={e => setForm(f => ({ ...f, cfTokenId: e.target.value }))}
                      placeholder="Service Token Client ID"
                      className="w-full px-4 py-2.5 bg-white border border-orange-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-300 text-sm font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                      CF Service Token Secret
                      <span className="text-gray-300 font-normal ml-1">(optional)</span>
                    </label>
                    <input
                      type="password"
                      value={form.cfTokenSecret}
                      onChange={e => setForm(f => ({ ...f, cfTokenSecret: e.target.value }))}
                      placeholder="Service Token Client Secret"
                      className="w-full px-4 py-2.5 bg-white border border-orange-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-300 text-sm"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  Service tokens allow bypassing browser login for programmatic access.
                  Create one in Cloudflare Zero Trust → Access → Service Auth.
                </p>
              </div>
            )}

            {/* SSH Auth */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">SSH Username *</label>
                <input
                  required value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="root, ubuntu, admin…"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div className="relative">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Password {editingId && <span className="text-gray-300 font-normal">(blank = keep)</span>}
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="SSH password"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Private Key <span className="text-gray-300 font-normal">(optional, overrides password)</span>
                </label>
                <textarea
                  value={form.privateKey}
                  onChange={e => setForm(f => ({ ...f, privateKey: e.target.value }))}
                  placeholder="Paste PEM private key here (-----BEGIN ... PRIVATE KEY-----)"
                  rows={3}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono text-xs resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); }}
                disabled={formLoading}
                className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-medium text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-bold text-sm hover:bg-primary-700 flex items-center gap-2 disabled:opacity-70 shadow-lg shadow-primary-600/20"
              >
                {formLoading && <Loader2 size={16} className="animate-spin" />}
                {formLoading ? 'Testing & Saving…' : (editingId ? 'Update Server' : 'Add & Test Server')}
              </button>
            </div>
          </form>
        )}

        {/* Server List */}
        {servers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
            <Server className="mx-auto text-gray-300 mb-3" size={36} />
            <p className="text-gray-500 font-medium">No servers configured yet</p>
            <p className="text-xs text-gray-400 mt-1">Add an SSH server to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {servers.map(server => {
              const result = testResults[server.id];
              return (
                <div key={server.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 group hover:border-primary-200 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${server.enabled ? 'bg-green-50' : 'bg-gray-50'}`}>
                        <Server size={20} className={server.enabled ? 'text-green-600' : 'text-gray-400'} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-800">{server.name}</h3>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">
                          {server.conn_type === 'cloudflare'
                            ? server.tunnel_url || 'Cloudflare Tunnel'
                            : `${server.username}@${server.host}:${server.port}`
                          }
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <OSBadge osType={server.os_type || 'unknown'} />
                          {server.conn_type === 'cloudflare' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-200">
                              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                                <path d="M16.5 15.5c.28-.96.17-1.85-.32-2.5-.46-.62-1.18-1-2.04-1.04l-.2-.01-.07-.19c-.26-.71-.79-1.28-1.47-1.59a3.07 3.07 0 0 0-1.37-.3c-1.37 0-2.57.93-2.94 2.25l-.06.2-.2.04a2.26 2.26 0 0 0-1.83 2.22c0 1.25 1.01 2.27 2.25 2.27h7.5c.97 0 1.75-.78 1.75-1.75 0-.2-.04-.4-.1-.6H16.5z"/>
                              </svg>
                              Cloudflare
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleTest(server.id)}
                        disabled={testLoading === server.id}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Test Connection"
                      >
                        {testLoading === server.id
                          ? <Loader2 size={16} className="animate-spin" />
                          : <Wifi size={16} />
                        }
                      </button>
                      <button
                        onClick={() => handleDetectOS(server.id)}
                        disabled={detectingOS === server.id}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Re-detect OS"
                      >
                        {detectingOS === server.id
                          ? <Loader2 size={16} className="animate-spin" />
                          : <Monitor size={16} />
                        }
                      </button>
                      <button
                        onClick={() => handleEdit(server)}
                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ id: server.id, name: server.name, type: 'server' })}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Connection test result */}
                  {result && (
                    <div className={`mt-3 flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg ${result === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {result === 'ok'
                        ? <><CheckCircle2 size={14} /> Connection OK</>
                        : <><XCircle size={14} /> Connection Failed</>
                      }
                    </div>
                  )}

                  {/* Storages on this server — collapsible dropdown */}
                  {(() => {
                    const srv = storages.filter((s: any) => s.serverId === server.id);
                    if (srv.length === 0) return (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[11px] text-gray-400 italic">No storages defined on this server</p>
                      </div>
                    );
                    return <StorageDropdown storages={srv} />;
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Logical Storages ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Server size={20} className="text-indigo-600" /> Storage Definitions
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Named mount points on servers — assign these to users</p>
          </div>
          <button
            onClick={() => setShowStorageForm(true)}
            disabled={servers.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} /> Add Storage
          </button>
        </div>

        {servers.length === 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex items-center gap-2 mb-4">
            <AlertTriangle size={16} /> Add a server first before defining storages
          </div>
        )}

        {/* Storage Form */}
        {showStorageForm && (
          <form
            onSubmit={handleStorageSubmit}
            className="bg-white rounded-2xl border border-indigo-100 shadow-soft p-6 mb-4 animate-in slide-in-from-top-2 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">Define New Storage</h3>
              <button type="button" onClick={() => setShowStorageForm(false)}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Storage Name *</label>
                <input
                  required value={storageForm.name}
                  onChange={e => setStorageForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. User Files, Backups"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Server *</label>
                <select
                  required value={storageForm.serverId}
                  onChange={e => setStorageForm(f => ({ ...f, serverId: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400 text-sm"
                >
                  <option value="">Select a server...</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Root Path on Server *</label>
                <input
                  required value={storageForm.rootPath}
                  onChange={e => setStorageForm(f => ({ ...f, rootPath: e.target.value }))}
                  placeholder="/home/files or /mnt/data"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Default Quota (GB, optional)</label>
                <input
                  type="number" value={storageForm.quotaGB}
                  onChange={e => setStorageForm(f => ({ ...f, quotaGB: e.target.value }))}
                  placeholder="Leave empty = unlimited"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowStorageForm(false)}
                className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-medium text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={storageLoading}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-70"
              >
                {storageLoading && <Loader2 size={16} className="animate-spin" />}
                Create Storage
              </button>
            </div>
          </form>
        )}

        {storages.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
            <p className="text-gray-500 font-medium">No storage definitions yet</p>
            <p className="text-xs text-gray-400 mt-1">Create one to assign folders to users</p>
          </div>
        ) : (
          <div className="space-y-3">
            {storages.map((s: any) => {
              const hasQuota = s.quotaBytes != null;
              const usagePercent = s.usedPercent ?? null;
              const isNearFull = usagePercent !== null && usagePercent >= 90;
              const isFull = usagePercent !== null && usagePercent >= 100;

              const fmtBytes = (b: number | null) => {
                if (b === null || b === undefined) return '—';
                if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
                if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
                return `${Math.round(b / 1024)} KB`;
              };

              return (
                <div key={s._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group hover:border-indigo-200 hover:shadow-md transition-all">
                  {/* Header row */}
                  <div className="flex items-start justify-between px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-gray-800 text-sm">{s.name}</span>
                        {!s.enabled && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Disabled</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-gray-400 font-mono truncate max-w-xs">{s.rootPath}</span>
                        {(s.serverName || s.serverHost) && (
                          <span className="text-[11px] text-gray-400 flex items-center gap-1 flex-shrink-0">
                            <Server size={11} /> {s.serverName || s.serverHost}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setDeleteConfirm({ id: s._id, name: s.name, type: 'storage' })}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 ml-2"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Quota bar */}
                  <div className="px-5 pb-3">
                    {hasQuota ? (
                      <>
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <span className={`font-bold ${isFull ? 'text-red-600' : isNearFull ? 'text-orange-600' : 'text-gray-500'}`}>
                            {usagePercent !== null
                              ? `${usagePercent}% used${s.usedBytes !== null ? ` · ${fmtBytes(s.usedBytes)}` : ''}`
                              : (
                                <span className="flex items-center gap-1 text-gray-400">
                                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 opacity-60"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l1.5 1.5" strokeLinecap="round"/></svg>
                                  Usage unavailable
                                </span>
                              )
                            }
                          </span>
                          <span className="text-gray-400 font-medium">{s.quotaGB} GB quota</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              isFull ? 'bg-red-500' : isNearFull ? 'bg-orange-400' : 'bg-indigo-500'
                            }`}
                            style={{ width: usagePercent !== null ? `${Math.min(usagePercent, 100)}%` : '0%' }}
                          />
                        </div>
                        {usagePercent === null && (
                          <p className="text-[10px] text-gray-400 mt-1">Server may be offline or SSH unreachable</p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        {s.usedBytes !== null ? (
                          <>
                            <span className="font-semibold text-gray-600">{fmtBytes(s.usedBytes)}</span>
                            <span className="text-gray-400">used · no quota limit</span>
                          </>
                        ) : (
                          <>
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 text-gray-300 flex-shrink-0"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l1.5 1.5" strokeLinecap="round"/></svg>
                            <span className="text-gray-400">Size unavailable · no quota limit</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Users section */}
                  {s.users && s.users.length > 0 ? (
                    <div className="border-t border-gray-50 px-5 py-3 bg-gray-50/50">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                        {s.users.length} user{s.users.length === 1 ? '' : 's'} with access
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {s.users.map((u: any) => (
                          <div key={u.id}
                            className="flex items-center gap-1.5 bg-white border border-gray-200 px-2.5 py-1 rounded-xl text-[11px] shadow-sm"
                            title={`Path: ${u.path}`}
                          >
                            {/* Avatar */}
                            <div className="w-5 h-5 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                              {u.username.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-bold text-gray-700">{u.username}</span>
                            {/* Permission badges */}
                            <div className="flex gap-0.5 ml-1">
                              {u.permissions.read && (
                                <span className="w-3.5 h-3.5 rounded-sm bg-green-100 text-green-600 flex items-center justify-center text-[8px] font-black" title="Read">R</span>
                              )}
                              {u.permissions.write && (
                                <span className="w-3.5 h-3.5 rounded-sm bg-blue-100 text-blue-600 flex items-center justify-center text-[8px] font-black" title="Write">W</span>
                              )}
                              {u.permissions.delete && (
                                <span className="w-3.5 h-3.5 rounded-sm bg-red-100 text-red-500 flex items-center justify-center text-[8px] font-black" title="Delete">D</span>
                              )}
                            </div>
                            {/* Per-user quota */}
                            {u.quotaGB && (
                              <span className="text-gray-400 text-[10px] ml-0.5">{u.quotaGB} GB</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-gray-50 px-5 py-2.5 bg-gray-50/30">
                      <p className="text-[11px] text-gray-400 italic">No users assigned yet</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[80] bg-[#2B3674]/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">Remove {deleteConfirm.type}?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Remove <span className="font-bold">"{deleteConfirm.name}"</span> from KroomDrive?
              {deleteConfirm.type === 'server' && (
                <span className="block mt-1 text-amber-600 text-xs bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                  Storage definitions linked to this server will also be removed from KroomDrive.
                  <br/>
                  <span className="font-normal text-gray-500">Files on the actual server are <strong>not affected</strong>.</span>
                </span>
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteLoading}
                className="flex-1 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 py-2.5 bg-red-500 text-white hover:bg-red-600 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                {deleteLoading && <Loader2 size={16} className="animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
