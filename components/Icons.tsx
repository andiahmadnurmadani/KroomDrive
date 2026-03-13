
import React from 'react';
import { 
  Folder, 
  File, 
  FileText, 
  FileImage, 
  FileAudio, 
  FileVideo, 
  FileCode, 
  FileArchive,
  HardDrive,
  FileSpreadsheet,
  FileCog,
  FileBox,
  MonitorPlay
} from 'lucide-react';

export const KroomLogo: React.FC<{ className?: string }> = ({ className = "w-10 h-10" }) => (
  <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <mask id="eye-mask">
        <rect x="0" y="0" width="100" height="80" fill="white" />
        <circle cx="18" cy="40" r="4" fill="black" />
    </mask>
    
    <g mask="url(#eye-mask)" fill="currentColor">
        {/* Left Body: Rounded Rectangle */}
        <rect x="0" y="0" width="45" height="80" rx="22.5" />
        
        {/* Top Right Wing: Leaf shape */}
        <path d="M55 36V0H100C100 0 100 36 55 36Z" />
        
        {/* Bottom Right Wing: Leaf shape */}
        <path d="M55 44V80H100C100 80 100 44 55 44Z" />
    </g>
  </svg>
);

interface FileIconProps {
  type: 'folder' | 'file';
  name: string;
  className?: string;
}

export const FileIcon: React.FC<FileIconProps> = ({ type, name, className = "w-6 h-6" }) => {
  if (type === 'folder') {
    return <Folder className={`${className} text-primary-500 fill-primary-100`} />;
  }

  // Ensure name exists before split
  const ext = (name || '').split('.').pop()?.toLowerCase();

  switch (ext) {
    // Documents (PDF)
    case 'pdf':
      return <FileText className={`${className} text-red-500`} />;
    
    // Documents (Word)
    case 'doc':
    case 'docx':
    case 'rtf':
    case 'odt':
    case 'wps':
      return <FileText className={`${className} text-blue-600`} />;
    
    // Spreadsheets (Excel)
    case 'xls':
    case 'xlsx':
    case 'csv':
    case 'ods':
    case 'numbers':
      return <FileSpreadsheet className={`${className} text-green-600`} />;
    
    // Presentations (PowerPoint)
    case 'ppt':
    case 'pptx':
    case 'odp':
    case 'key':
      return <MonitorPlay className={`${className} text-orange-500`} />;
    
    // Text
    case 'txt':
    case 'md':
    case 'log':
    case 'ini':
    case 'cfg':
      return <FileText className={`${className} text-gray-500`} />;

    // Images
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
    case 'bmp':
    case 'tiff':
    case 'psd':
    case 'ai':
      return <FileImage className={`${className} text-purple-500`} />;

    // Audio
    case 'mp3':
    case 'wav':
    case 'ogg':
    case 'm4a':
    case 'flac':
    case 'aac':
    case 'wma':
      return <FileAudio className={`${className} text-pink-500`} />;

    // Video
    case 'mp4':
    case 'mkv':
    case 'mov':
    case 'webm':
    case 'avi':
    case 'wmv':
    case 'flv':
    case 'm4v':
      return <FileVideo className={`${className} text-red-600`} />;

    // Code / Web
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'html':
    case 'css':
    case 'scss':
    case 'json':
    case 'xml':
    case 'yaml':
    case 'yml':
    case 'php':
    case 'py':
    case 'java':
    case 'c':
    case 'cpp':
    case 'h':
    case 'cs':
    case 'rb':
    case 'go':
    case 'sql':
    case 'sh':
    case 'bat':
    case 'env':
      return <FileCode className={`${className} text-yellow-600`} />;

    // Archives
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
    case 'bz2':
    case 'xz':
    case 'iso':
      return <FileArchive className={`${className} text-orange-600`} />;

    // System / Executables
    case 'exe':
    case 'msi':
    case 'dll':
    case 'sys':
    case 'apk':
    case 'bin':
    case 'dmg':
    case 'pkg':
    case 'deb':
    case 'rpm':
      return <FileCog className={`${className} text-slate-500`} />;

    // 3D Models
    case 'obj':
    case 'fbx':
    case 'stl':
    case 'gltf':
    case 'glb':
    case 'blend':
      return <FileBox className={`${className} text-indigo-500`} />;

    // Fonts
    case 'ttf':
    case 'otf':
    case 'woff':
    case 'woff2':
      return <FileText className={`${className} text-teal-600`} />;

    default:
      return <File className={`${className} text-gray-400`} />;
  }
};

export const DriveIcon: React.FC<{className?: string}> = ({ className = "w-5 h-5" }) => (
  <HardDrive className={`${className} text-gray-600`} />
);
