/**
 * OS Detection & Command Abstraction Layer
 *
 * Detects the remote OS type via SSH and provides the correct
 * shell commands for each platform:
 *   - linux       → standard GNU/Linux (Ubuntu, Debian, RHEL, etc.)
 *   - macos       → macOS / Darwin
 *   - synology    → Synology DSM (NAS)
 *   - qnap        → QNAP QTS/QuTS (NAS)
 *   - truenas     → TrueNAS / FreeNAS (FreeBSD-based)
 *   - freebsd     → FreeBSD generic
 *   - openwrt     → OpenWrt / embedded
 *   - posix       → safe fallback for unknown POSIX systems
 */

const { execCommand } = require('./ssh');
const db = require('./db');

// ─── Cache: serverId → { os, detectedAt } ───────────────────────────────────
const osCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // re-detect after 30 min

/**
 * Detect and return the OS type string for a server.
 * Results are cached per-server.
 * @param {string} serverId
 * @returns {Promise<string>} OS type key
 */
async function detectOS(serverId) {
  const cached = osCache.get(serverId);
  if (cached && Date.now() - cached.detectedAt < CACHE_TTL_MS) {
    return cached.os;
  }

  // Check DB first (persisted from last detection)
  const server = db.prepare('SELECT os_type FROM servers WHERE id = ?').get(serverId);
  if (server && server.os_type && server.os_type !== 'unknown') {
    osCache.set(serverId, { os: server.os_type, detectedAt: Date.now() });
    return server.os_type;
  }

  const os = await _runDetection(serverId);
  osCache.set(serverId, { os, detectedAt: Date.now() });

  // Persist to DB
  try {
    db.prepare('UPDATE servers SET os_type = ? WHERE id = ?').run(os, serverId);
  } catch (_) {
    // column might not exist yet on older DBs — handled in migration
  }

  console.log(`[OS Detect] Server ${serverId} → ${os}`);
  return os;
}

/**
 * Force re-detection (invalidate cache).
 */
function invalidateOSCache(serverId) {
  osCache.delete(serverId);
}

/**
 * Run the actual OS detection probes.
 */
async function _runDetection(serverId) {
  try {
    // Primary: uname -s gives OS kernel name
    const uname = await execCommand(serverId, 'uname -s 2>/dev/null || echo unknown').catch(() => 'unknown');
    const unameStr = uname.trim().toLowerCase();

    if (unameStr === 'darwin') return 'macos';
    if (unameStr === 'freebsd') {
      // Could be TrueNAS/FreeNAS
      const isTrueNAS = await execCommand(serverId, 'test -f /etc/version && cat /etc/version || echo ""').catch(() => '');
      if (isTrueNAS.toLowerCase().includes('truenas') || isTrueNAS.toLowerCase().includes('freenas')) {
        return 'truenas';
      }
      return 'freebsd';
    }

    if (unameStr === 'linux') {
      // Probe for NAS firmware signatures
      const [etc_issue, dsm_info, qnap_info, openwrt_info] = await Promise.all([
        execCommand(serverId, 'cat /etc/issue 2>/dev/null || echo ""').catch(() => ''),
        execCommand(serverId, 'cat /etc/synoinfo.conf 2>/dev/null | head -3 || echo ""').catch(() => ''),
        execCommand(serverId, 'cat /etc/qts_flavor 2>/dev/null || test -f /etc/default/qpkg.conf && echo "qnap" || echo ""').catch(() => ''),
        execCommand(serverId, 'cat /etc/openwrt_release 2>/dev/null || echo ""').catch(() => ''),
      ]);

      if (dsm_info && dsm_info.length > 0 && !dsm_info.includes('No such')) return 'synology';
      if (qnap_info && (qnap_info.includes('qnap') || qnap_info.includes('QTS'))) return 'qnap';
      if (openwrt_info && openwrt_info.includes('OpenWrt')) return 'openwrt';

      // Check /etc/os-release for distro hints
      const osRelease = await execCommand(serverId, 'cat /etc/os-release 2>/dev/null || echo ""').catch(() => '');
      const osLower = osRelease.toLowerCase();
      if (osLower.includes('truenas') || osLower.includes('freenas')) return 'truenas';
      if (osLower.includes('synology')) return 'synology';

      return 'linux';
    }

    // Last resort: try POSIX path check
    return 'posix';
  } catch (_) {
    return 'posix';
  }
}

// ─── OS-Aware Command Factory ────────────────────────────────────────────────

/**
 * Returns a Commands object with the correct shell commands for the detected OS.
 * All commands return strings ready to be passed to execCommand().
 */
function getCommands(osType) {
  switch (osType) {
    case 'macos':    return new MacOSCommands();
    case 'synology': return new SynologyCommands();
    case 'qnap':     return new QNAPCommands();
    case 'truenas':  return new TrueNASCommands();
    case 'freebsd':  return new FreeBSDCommands();
    case 'openwrt':  return new OpenWrtCommands();
    case 'linux':
    default:         return new LinuxCommands();
  }
}

// ─── Base Commands (safe POSIX subset) ──────────────────────────────────────

class BaseCommands {
  /** Get disk usage stats. Returns parseable lines: "mount total_bytes used_bytes avail_bytes pct%" */
  diskStats() {
    return 'df -k / 2>/dev/null | tail -1';
  }

  /** Recursive directory size in bytes */
  dirSize(remotePath) {
    return `du -sk "${remotePath}" 2>/dev/null | awk '{print $1 * 1024}'`;
  }

  /** Count files recursively */
  fileCount(remotePath) {
    return `find "${remotePath}" -type f 2>/dev/null | wc -l | tr -d ' '`;
  }

  /** Move to trash dir */
  moveToTrash(remotePath, trashPath, trashDir) {
    return `mkdir -p "${trashDir}" && mv "${remotePath}" "${trashPath}"`;
  }

  /** Search files by name pattern */
  search(rootPath, query, maxDepth = 6) {
    const safe = query.replace(/"/g, '').replace(/'/g, '').replace(/[;|&`$]/g, '');
    return `find "${rootPath}" -maxdepth ${maxDepth} -iname "*${safe}*" 2>/dev/null | head -200`;
  }

  /** Extract archive */
  extract(zipPath, targetDir) {
    return `mkdir -p "${targetDir}" && unzip -o "${zipPath}" -d "${targetDir}" 2>/dev/null || tar -xf "${zipPath}" -C "${targetDir}"`;
  }

  /** Permanent delete */
  remove(remotePath) {
    return `rm -rf "${remotePath}"`;
  }
}

// ─── Linux (GNU) ─────────────────────────────────────────────────────────────

class LinuxCommands extends BaseCommands {
  diskStats() {
    // GNU df supports --output, giving clean columns in bytes
    return `df -B1 --output=source,size,used,avail,pcent 2>/dev/null | grep '^/' | head -20`;
  }

  dirSize(remotePath) {
    return `du -sb "${remotePath}" 2>/dev/null | cut -f1`;
  }

  /** Combined: size + file count in one SSH round-trip */
  folderInfo(remotePath) {
    return `du -sb "${remotePath}" 2>/dev/null; find "${remotePath}" -type f 2>/dev/null | wc -l`;
  }
}

// ─── macOS / Darwin ──────────────────────────────────────────────────────────

class MacOSCommands extends BaseCommands {
  diskStats() {
    // macOS df uses 512-byte blocks, no --output flag
    // Returns: Filesystem 512-blocks Used Available Capacity iused ifree %iused Mounted
    return `df -k 2>/dev/null | grep -v "^Filesystem" | grep -v "^map" | head -20`;
  }

  dirSize(remotePath) {
    // macOS du -s gives 512-byte blocks; use -sk for KB
    return `du -sk "${remotePath}" 2>/dev/null | awk '{print $1 * 1024}'`;
  }

  folderInfo(remotePath) {
    return `du -sk "${remotePath}" 2>/dev/null | awk '{print $1*1024}'; find "${remotePath}" -type f 2>/dev/null | wc -l | tr -d ' '`;
  }

  search(rootPath, query, maxDepth = 6) {
    const safe = query.replace(/"/g, '').replace(/'/g, '').replace(/[;|&`$]/g, '');
    // macOS find doesn't support -iname on old versions but does on modern
    return `find "${rootPath}" -maxdepth ${maxDepth} -iname "*${safe}*" 2>/dev/null | head -200`;
  }

  extract(zipPath, targetDir) {
    return `mkdir -p "${targetDir}" && unzip -o "${zipPath}" -d "${targetDir}" 2>/dev/null || tar -xf "${zipPath}" -C "${targetDir}"`;
  }
}

// ─── Synology DSM ────────────────────────────────────────────────────────────

class SynologyCommands extends BaseCommands {
  diskStats() {
    // Synology runs Linux but may not have --output; fall back to standard df
    return `df -B1 2>/dev/null | grep "^/dev" | head -20 || df -k 2>/dev/null | grep "^/dev" | head -20`;
  }

  dirSize(remotePath) {
    return `du -sb "${remotePath}" 2>/dev/null | cut -f1 || du -sk "${remotePath}" 2>/dev/null | awk '{print $1*1024}'`;
  }

  folderInfo(remotePath) {
    return `du -sb "${remotePath}" 2>/dev/null | cut -f1; find "${remotePath}" -type f 2>/dev/null | wc -l | tr -d ' '`;
  }

  moveToTrash(remotePath, trashPath, trashDir) {
    // Synology has /volume1/@Recycle but we use our own trash dir
    return `mkdir -p "${trashDir}" && mv "${remotePath}" "${trashPath}"`;
  }
}

// ─── QNAP QTS ────────────────────────────────────────────────────────────────

class QNAPCommands extends BaseCommands {
  diskStats() {
    return `df -k 2>/dev/null | grep "^/dev" | head -20`;
  }

  dirSize(remotePath) {
    return `du -sk "${remotePath}" 2>/dev/null | awk '{print $1*1024}'`;
  }

  folderInfo(remotePath) {
    return `du -sk "${remotePath}" 2>/dev/null | awk '{print $1*1024}'; find "${remotePath}" -type f 2>/dev/null | wc -l | tr -d ' '`;
  }
}

// ─── TrueNAS / FreeNAS (FreeBSD-based) ──────────────────────────────────────

class TrueNASCommands extends BaseCommands {
  diskStats() {
    // FreeBSD df — no -B1, use -k and convert
    return `df -k 2>/dev/null | grep "^/dev\\|^zroot\\|^tank\\|^data" | head -20`;
  }

  dirSize(remotePath) {
    // BSD du — no --si; -s -k gives KB
    return `du -sk "${remotePath}" 2>/dev/null | awk '{print $1*1024}'`;
  }

  folderInfo(remotePath) {
    return `du -sk "${remotePath}" 2>/dev/null | awk '{print $1*1024}'; find "${remotePath}" -type f 2>/dev/null | wc -l | tr -d ' '`;
  }

  extract(zipPath, targetDir) {
    return `mkdir -p "${targetDir}" && unzip -o "${zipPath}" -d "${targetDir}" 2>/dev/null || tar -xzf "${zipPath}" -C "${targetDir}" 2>/dev/null || tar -xf "${zipPath}" -C "${targetDir}"`;
  }
}

// ─── FreeBSD Generic ─────────────────────────────────────────────────────────

class FreeBSDCommands extends TrueNASCommands {
  diskStats() {
    return `df -k 2>/dev/null | grep "^/dev" | head -20`;
  }
}

// ─── OpenWrt / Embedded ──────────────────────────────────────────────────────

class OpenWrtCommands extends BaseCommands {
  diskStats() {
    return `df -k 2>/dev/null | grep "^/dev\\|^overlayfs\\|^tmpfs" | head -10`;
  }

  dirSize(remotePath) {
    // OpenWrt may have busybox du without -b flag
    return `du -sk "${remotePath}" 2>/dev/null | awk '{print $1*1024}'`;
  }

  folderInfo(remotePath) {
    return `du -sk "${remotePath}" 2>/dev/null | awk '{print $1*1024}'; find "${remotePath}" -type f 2>/dev/null | wc -l`;
  }
}

// ─── Parser Helpers ──────────────────────────────────────────────────────────

/**
 * Parse df output into { mount, total, used, free, usedPercent } entries.
 * Handles both GNU (--output) and BSD/macOS (standard) df formats.
 */
function parseDfOutput(output, osType, serverHost) {
  const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('Filesystem'));
  const results = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);

    try {
      if (osType === 'linux') {
        // GNU df -B1 --output: source size used avail pcent
        if (parts.length < 5) continue;
        const [source, size, used, avail, pct] = parts;
        results.push({
          drive: `${serverHost}:${source}`,
          total: parseInt(size) || 0,
          used: parseInt(used) || 0,
          free: parseInt(avail) || 0,
          usedPercent: pct || '0%',
        });
      } else {
        // BSD/macOS/others: df -k → values in KB blocks
        // Columns: Filesystem 1K-blocks Used Available Capacity Mounted
        // or:      Filesystem 1K-blocks Used Available Use% Mounted  (some Linux)
        if (parts.length < 5) continue;
        const source = parts[0];
        const totalKB = parseInt(parts[1]) || 0;
        const usedKB = parseInt(parts[2]) || 0;
        const availKB = parseInt(parts[3]) || 0;
        const pctStr = parts[4] || parts[5] || '0%';
        results.push({
          drive: `${serverHost}:${source}`,
          total: totalKB * 1024,
          used: usedKB * 1024,
          free: availKB * 1024,
          usedPercent: pctStr.replace('%', '') + '%',
        });
      }
    } catch (_) {
      // malformed line — skip
    }
  }

  return results;
}

/**
 * Parse folderInfo output → { totalBytes, files }
 */
function parseFolderInfo(output) {
  const lines = output.split('\n').filter(Boolean);
  const totalBytes = parseInt(lines[0]) || 0;
  const files = parseInt(lines[1]) || 0;
  return { totalBytes, files, totalGB: (totalBytes / (1024 ** 3)).toFixed(2) };
}

module.exports = {
  detectOS,
  invalidateOSCache,
  getCommands,
  parseDfOutput,
  parseFolderInfo,
};
