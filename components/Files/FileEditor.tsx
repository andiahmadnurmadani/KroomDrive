import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  X, Save, RefreshCw, Loader2, AlertTriangle, ChevronDown,
  FileCode2, Check, WrapText, AlignLeft, Maximize2, Minimize2, Download,
} from 'lucide-react';
import * as api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

// ─── Binary file types that can't be meaningfully edited ─────────────────────
const BINARY_EXTS = new Set([
  // Images
  'png','jpg','jpeg','gif','bmp','webp','ico','tiff','tif','svg','avif','heic','heif',
  // Video
  'mp4','mkv','avi','mov','wmv','flv','webm','m4v','mpg','mpeg','3gp',
  // Audio
  'mp3','wav','ogg','flac','aac','m4a','wma','opus',
  // Archives
  'zip','tar','gz','bz2','xz','7z','rar','zst','lz4',
  // Executables / compiled
  'exe','dll','so','dylib','bin','elf','o','a','lib','apk','deb','rpm',
  // Documents (binary)
  'pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp',
  // Fonts
  'ttf','otf','woff','woff2','eot',
  // Database / compiled data
  'db','sqlite','sqlite3','pyc','pyo','class','jar',
]);

function isBinaryFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return BINARY_EXTS.has(ext);
}

// ─── Language detection from filename ────────────────────────────────────────
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python', pyw: 'python',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', sass: 'sass', less: 'less',
    json: 'json', jsonc: 'json',
    yaml: 'yaml', yml: 'yaml',
    xml: 'xml', svg: 'xml',
    md: 'markdown', mdx: 'markdown',
    sql: 'sql',
    php: 'php',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
    cs: 'csharp',
    kt: 'kotlin',
    swift: 'swift',
    r: 'r',
    lua: 'lua',
    perl: 'perl', pl: 'perl',
    dockerfile: 'dockerfile',
    toml: 'toml',
    ini: 'ini', cfg: 'ini', conf: 'ini', env: 'ini',
    txt: 'plaintext', log: 'plaintext',
    nginx: 'nginx',
  };
  // Special filenames
  const nameMap: Record<string, string> = {
    dockerfile: 'dockerfile', 'docker-compose.yml': 'yaml',
    makefile: 'makefile', '.gitignore': 'gitignore',
    '.env': 'ini', '.env.example': 'ini',
    'package.json': 'json', 'tsconfig.json': 'json',
  };
  return nameMap[filename.toLowerCase()] ?? map[ext] ?? 'plaintext';
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  filePath: string;
  onClose: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export const FileEditor: React.FC<Props> = ({ filePath, onClose }) => {
  const { showToast, handleError } = useToast();
  const monaco = useMonaco();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const filename = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
  const language = detectLanguage(filename);
  const isBinary = isBinaryFile(filename);

  const [content, setContent]       = useState('');
  const [original, setOriginal]     = useState('');
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [loadError, setLoadError]   = useState('');
  const [wordWrap, setWordWrap]     = useState<'on' | 'off'>('off');
  const [minimap, setMinimap]       = useState(true);
  const [fontSize, setFontSize]     = useState(14);
  const [maximized, setMaximized]   = useState(false);
  const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 });
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [currentLang, setCurrentLang]  = useState(language);

  const isDirty = content !== original;

  // Load file content
  useEffect(() => {
    // Skip loading binary files — show info screen directly
    if (isBinary) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    api.readFileContent(filePath)
      .then(({ content: c }) => {
        setContent(c);
        setOriginal(c);
        setCurrentLang(detectLanguage(filename));
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [filePath, isBinary]);

  // Configure Monaco fonts & theme on mount
  useEffect(() => {
    if (!monaco) return;
    // Load JetBrains Mono
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap';
    document.head.appendChild(link);

    // Define VSCode Dark+ theme
    monaco.editor.defineTheme('kroomdrive-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',          foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword',          foreground: '569CD6' },
        { token: 'string',           foreground: 'CE9178' },
        { token: 'number',           foreground: 'B5CEA8' },
        { token: 'type',             foreground: '4EC9B0' },
        { token: 'class',            foreground: '4EC9B0' },
        { token: 'function',         foreground: 'DCDCAA' },
        { token: 'variable',         foreground: '9CDCFE' },
        { token: 'constant',         foreground: '4FC1FF' },
        { token: 'operator',         foreground: 'D4D4D4' },
        { token: 'tag',              foreground: '569CD6' },
        { token: 'attribute.name',   foreground: '9CDCFE' },
        { token: 'attribute.value',  foreground: 'CE9178' },
      ],
      colors: {
        'editor.background':             '#1E1E1E',
        'editor.foreground':             '#D4D4D4',
        'editorLineNumber.foreground':   '#858585',
        'editorLineNumber.activeForeground': '#C6C6C6',
        'editor.selectionBackground':    '#264F78',
        'editor.inactiveSelectionBackground': '#3A3D41',
        'editor.lineHighlightBackground':'#2A2D2E',
        'editorCursor.foreground':       '#AEAFAD',
        'editor.selectionHighlightBackground': '#ADD6FF26',
        'editorIndentGuide.background1': '#404040',
        'editorIndentGuide.activeBackground1': '#707070',
        'editorWidget.background':       '#252526',
        'editorSuggestWidget.background':'#252526',
        'editorSuggestWidget.border':    '#454545',
        'editorSuggestWidget.selectedBackground': '#04395E',
        'tab.activeBackground':          '#1E1E1E',
        'tab.inactiveBackground':        '#2D2D2D',
        'titleBar.activeBackground':     '#3C3C3C',
        'activityBar.background':        '#333333',
        'sideBar.background':            '#252526',
        'statusBar.background':          '#007ACC',
        'scrollbarSlider.background':    '#79797966',
        'scrollbarSlider.hoverBackground': '#646464B3',
      },
    });
  }, [monaco]);

  const handleEditorMount = (ed: MonacoEditor.IStandaloneCodeEditor) => {
    editorRef.current = ed;
    ed.onDidChangeCursorPosition(e => {
      setCursorInfo({ line: e.position.lineNumber, col: e.position.column });
    });
    // Ctrl+S to save
    ed.addCommand(
      // Monaco KeyMod.CtrlCmd | KeyCode.KeyS = 2097
      (window as any).monaco?.KeyMod.CtrlCmd | (window as any).monaco?.KeyCode.KeyS ?? 2097,
      () => handleSave()
    );
  };

  const handleSave = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      await api.writeFileContent(filePath, content);
      setOriginal(content);
      showToast(`Saved ${filename}`, 'success');
    } catch (e: any) {
      handleError(e);
    } finally {
      setSaving(false);
    }
  }, [filePath, content, isDirty, saving, filename]);

  const handleReload = async () => {
    if (isDirty) {
      if (!window.confirm('Discard unsaved changes and reload from server?')) return;
    }
    setLoading(true);
    try {
      const { content: c } = await api.readFileContent(filePath);
      setContent(c); setOriginal(c);
      showToast('Reloaded from server', 'info');
    } catch (e: any) { handleError(e); }
    finally { setLoading(false); }
  };

  // ── Keyboard shortcut outside editor
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
      if (e.key === 'Escape' && !isDirty) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, isDirty, onClose]);

  // Popular languages for menu
  const LANGS = ['javascript','typescript','python','shell','json','yaml','html','css','markdown','sql','go','rust','php','java','cpp','plaintext'];

  const containerClass = maximized
    ? 'fixed inset-0 z-[9998] flex flex-col bg-[#1E1E1E]'
    : 'fixed inset-4 z-[9998] flex flex-col bg-[#1E1E1E] rounded-xl overflow-hidden shadow-2xl shadow-black/50';

  return (
    <div className={containerClass} style={{ fontFamily: "'JetBrains Mono', monospace" }}>

      {/* ── Title bar (VSCode style) ── */}
      <div className="flex items-center h-9 bg-[#3C3C3C] border-b border-[#252526] flex-shrink-0 select-none">
        {/* Tab */}
        <div className={`flex items-center gap-2 px-4 h-full border-r border-[#252526] text-[13px] min-w-0 ${
          isDirty ? 'bg-[#1E1E1E] text-[#CCCccc]' : 'bg-[#1E1E1E] text-[#D4D4D4]'
        }`}>
          <FileCode2 size={14} className="text-[#75BEFF] flex-shrink-0" />
          <span className="truncate max-w-[200px]">{filename}</span>
          {isDirty && <span className="w-2 h-2 rounded-full bg-[#E8E8E8] flex-shrink-0" title="Unsaved changes" />}
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-0.5 px-2">
          <button onClick={handleReload} disabled={loading}
            className="p-1.5 text-[#CCCCCC] hover:bg-white/10 rounded transition-colors" title="Reload from server (discards changes)">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setWordWrap(w => w === 'on' ? 'off' : 'on')}
            className={`p-1.5 rounded transition-colors ${wordWrap === 'on' ? 'bg-white/20 text-white' : 'text-[#CCCCCC] hover:bg-white/10'}`}
            title="Toggle word wrap (Alt+Z)">
            <WrapText size={14} />
          </button>
          <button onClick={() => setMinimap(m => !m)}
            className={`p-1.5 rounded transition-colors ${minimap ? 'text-[#CCCCCC] hover:bg-white/10' : 'text-[#888] hover:bg-white/10'}`}
            title="Toggle minimap">
            <AlignLeft size={14} />
          </button>
          <button onClick={() => setMaximized(m => !m)}
            className="p-1.5 text-[#CCCCCC] hover:bg-white/10 rounded transition-colors" title={maximized ? 'Restore' : 'Maximize'}>
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-[12px] font-bold transition-all ${
              isDirty
                ? 'bg-[#0E639C] hover:bg-[#1177BB] text-white shadow-sm'
                : 'bg-white/5 text-[#666] cursor-default'
            }`}
            title="Save (Ctrl+S)"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { if (isDirty && !window.confirm('Close without saving?')) return; onClose(); }}
            className="p-1.5 text-[#CCCCCC] hover:bg-red-500/70 hover:text-white rounded transition-colors ml-1" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Editor area ── */}
      <div className="flex-1 min-h-0 relative">
        {isBinary ? (
          /* Binary file — can't be edited as text */
          <div className="absolute inset-0 bg-[#1E1E1E] flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
              <FileCode2 size={32} className="text-[#75BEFF]" />
            </div>
            <div className="text-center">
              <p className="text-[#D4D4D4] text-[14px] font-semibold mb-1">{filename}</p>
              <p className="text-[#858585] text-[12px]">This file is a binary and cannot be edited as text.</p>
            </div>
            <button
              onClick={() => api.downloadFileBlob(filePath, filename).catch(() => {})}
              className="flex items-center gap-2 px-4 py-2 bg-[#0E639C] hover:bg-[#1177BB] text-white text-[13px] rounded-lg transition-colors"
            >
              <Download size={14} /> Download File
            </button>
          </div>
        ) : loading ? (
          <div className="absolute inset-0 bg-[#1E1E1E] flex flex-col items-center justify-center gap-3">
            <Loader2 size={28} className="animate-spin text-[#007ACC]" />
            <span className="text-[#CCCCCC] text-[13px]" style={{ fontFamily: 'inherit' }}>Loading {filename}…</span>
          </div>
        ) : loadError ? (
          <div className="absolute inset-0 bg-[#1E1E1E] flex flex-col items-center justify-center gap-3 p-8">
            <AlertTriangle size={32} className="text-[#F44747]" />
            <p className="text-[#F44747] text-[13px] text-center font-mono">{loadError}</p>
            <button onClick={handleReload} className="px-4 py-1.5 bg-[#0E639C] text-white text-[12px] rounded hover:bg-[#1177BB] transition-colors">
              Retry
            </button>
          </div>
        ) : (
          <Editor
            height="100%"
            language={currentLang}
            value={content}
            theme="kroomdrive-dark"
            onChange={v => setContent(v ?? '')}
            onMount={handleEditorMount}
            loading={<div className="w-full h-full bg-[#1E1E1E]" />}
            options={{
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
              fontSize,
              fontLigatures: true,
              lineHeight: 22,
              letterSpacing: 0.3,
              wordWrap,
              minimap: { enabled: minimap, scale: 1 },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              renderLineHighlight: 'all',
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              suggest: { showIcons: true, preview: true },
              quickSuggestions: true,
              autoClosingBrackets: 'always',
              autoClosingQuotes: 'always',
              formatOnPaste: true,
              tabSize: 2,
              insertSpaces: true,
              stickyScroll: { enabled: true },
              padding: { top: 12, bottom: 12 },
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
                useShadows: false,
              },
              overviewRulerBorder: false,
            }}
          />
        )}
      </div>

      {/* ── Status bar (VSCode style) ── */}
      <div className="h-[22px] bg-[#007ACC] flex items-center px-3 gap-4 flex-shrink-0 text-white select-none"
           style={{ fontSize: '12px' }}>
        {/* Left */}
        <div className="flex items-center gap-3">
          {/* Encoding */}
          <span className="opacity-80">UTF-8</span>
          {/* Line endings */}
          <span className="opacity-80">LF</span>
        </div>

        <div className="flex-1" />

        {/* Right */}
        <div className="flex items-center gap-4">
          {/* Dirty indicator */}
          {isDirty && (
            <span className="flex items-center gap-1 opacity-90">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              Unsaved
            </span>
          )}
          {!isDirty && !loading && (
            <span className="flex items-center gap-1 opacity-80">
              <Check size={11} /> Saved
            </span>
          )}
          {/* Cursor position */}
          <span className="opacity-90">Ln {cursorInfo.line}, Col {cursorInfo.col}</span>
          {/* Font size */}
          <div className="flex items-center gap-1 opacity-80">
            <button onClick={() => setFontSize(s => Math.max(10, s - 1))} className="hover:opacity-100 px-0.5">-</button>
            <span>{fontSize}px</span>
            <button onClick={() => setFontSize(s => Math.min(28, s + 1))} className="hover:opacity-100 px-0.5">+</button>
          </div>
          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(m => !m)}
              className="flex items-center gap-1 hover:bg-white/20 px-1.5 py-0.5 rounded transition-colors capitalize"
            >
              {currentLang}
              <ChevronDown size={10} />
            </button>
            {showLangMenu && (
              <div className="absolute bottom-7 right-0 bg-[#252526] border border-[#454545] rounded shadow-2xl w-44 max-h-64 overflow-y-auto z-10">
                {LANGS.map(l => (
                  <button key={l} onClick={() => { setCurrentLang(l); setShowLangMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-[12px] capitalize hover:bg-[#04395E] transition-colors ${currentLang === l ? 'text-[#4FC1FF]' : 'text-[#CCCCCC]'}`}>
                    {l === currentLang && <span className="mr-2">✓</span>}{l}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
