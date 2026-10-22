/* ═══════════════════════════════════════════════════════════════
   manage-size.js — v10.7 (BACKUP-AWARE AUTO-HEALING SPACE MANAGER)
   Compatible with: sync-all.js v10.6, backup-r2.js v1.0
   Features:
     • Auto-heal: deletes empty & corrupt JSON files
     • Auto-protect: essential category files + backup index
     • Backup recency check (warns if R2 backup is stale)
     • Stale-first priority (oldest 7+ days deleted first)
     • Per-source awareness (TMDB media vs categories)
     • Dry-run mode (DRY_RUN=1)
     • Env-overridable limits
     • Cleanup audit log (_cleanup_log.json)
     • Safe unlink with retries
     • Auto-scaled chunk deletion
     • Top-N largest deletions report
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════════════════════════
   ⚙️ CONFIGURATION (ENV OVERRIDABLE)
═══════════════════════════════════════════════════════════════ */
const MAX_SIZE_MB     = parseInt(process.env.MAX_SIZE_MB, 10)     || 95;
const TARGET_SIZE_MB  = parseInt(process.env.TARGET_SIZE_MB, 10)  || 80;
const DELETE_CHUNK_MB = parseInt(process.env.DELETE_CHUNK_MB, 10) || 20;
const DRY_RUN         = process.env.DRY_RUN === '1';
const VERBOSE         = process.env.VERBOSE === '1';
const CACHE_ROOT      = path.join(__dirname, '..', 'cache');

const MAX_SIZE_BYTES     = MAX_SIZE_MB * 1024 * 1024;
const TARGET_SIZE_BYTES  = TARGET_SIZE_MB * 1024 * 1024;
const DELETE_CHUNK_BYTES = DELETE_CHUNK_MB * 1024 * 1024;

// Files modified more recently than this are considered "in progress" (skip corrupt-check)
const IN_PROGRESS_MS = 60 * 1000; // 60 seconds

// Files older than this get deletion priority
const STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Backup index older than this triggers a warning
const BACKUP_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

/* ─────────────────────────────────────────────────────────────
   🛡️ METADATA FILES (never counted as categories)
───────────────────────────────────────────────────────────── */
const METADATA_FILES = new Set([
  '_meta.json',
  '_cleanup_log.json',
  '_backup_index.json'
]);

/* ─────────────────────────────────────────────────────────────
   🛡️ PROTECTED FILES — Never deleted (UI entry points)
───────────────────────────────────────────────────────────── */
const PROTECTED_PATHS = new Set([
  // Metadata
  ...METADATA_FILES,

  // TMDB — core navigation categories
  'tmdb/categories/trending-all.json',
  'tmdb/categories/trending-movies.json',
  'tmdb/categories/trending-tv.json',
  'tmdb/categories/trending-people.json',
  'tmdb/categories/popular-movies.json',
  'tmdb/categories/top-rated-movies.json',
  'tmdb/categories/popular-tv.json',
  'tmdb/categories/top-rated-tv.json',
  'tmdb/categories/upcoming-movies.json',
  'tmdb/categories/now-playing.json',
  'tmdb/categories/airing-today.json',
  'tmdb/categories/on-the-air.json',
  'tmdb/categories/latest-movies.json',
  'tmdb/categories/latest-tv.json',

  // AniList — essentials
  'anilist/trending.json',
  'anilist/popular.json',
  'anilist/top.json',
  'anilist/this-season.json',
  'anilist/upcoming.json',
  'anilist/airing.json',

  // TVmaze — essentials
  'tvmaze/schedule.json',
  'tvmaze/web-schedule.json',
  'tvmaze/shows.json',

  // Jikan — essentials
  'jikan/top-overall.json',
  'jikan/top-airing.json',
  'jikan/season-now.json',

  // Kitsu — essentials
  'kitsu/trending.json',
  'kitsu/popular.json',

  // TheTVDB — essentials
  'tvdb/latest-series.json',
  'tvdb/search-series.json'
]);

/* ─────────────────────────────────────────────────────────────
   📝 LOGGING
───────────────────────────────────────────────────────────── */
const LOG_FILE = path.join(CACHE_ROOT, '_cleanup_log.json');
const logEntries = [];

function log(msg, isDry = false) {
  const prefix = isDry ? '🧪 [DRY] ' : '';
  console.log(prefix + msg);
  logEntries.push({ time: new Date().toISOString(), message: msg });
}

function vlog(msg) {
  if (VERBOSE) console.log(`   🔍 ${msg}`);
}

function saveLog() {
  if (DRY_RUN) return;
  try {
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
    let existing = [];
    if (fs.existsSync(LOG_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
        if (Array.isArray(raw)) existing = raw;
      } catch (e) { existing = []; }
    }
    const combined = [...existing, { time: new Date().toISOString(), entries: logEntries }]
      .filter(e => e && e.entries)
      .slice(-50);
    fs.writeFileSync(LOG_FILE, JSON.stringify(combined, null, 2));
  } catch (e) {
    console.log(`   ⚠️ Failed to save cleanup log: ${e.message}`);
  }
}

/* ─────────────────────────────────────────────────────────────
   🔧 SAFE FILE OPERATIONS
───────────────────────────────────────────────────────────── */
function safeStat(fullPath) {
  try { return fs.statSync(fullPath); } catch (e) { return null; }
}

function safeIsSymlink(fullPath) {
  try { return fs.lstatSync(fullPath).isSymbolicLink(); } catch (e) { return false; }
}

function safeUnlink(fullPath, maxRetries = 3) {
  if (DRY_RUN) return true;
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.unlinkSync(fullPath);
      return true;
    } catch (e) {
      if (e.code === 'ENOENT') return true;
      if (i === maxRetries - 1) return false;
      const wait = Date.now() + 50;
      while (Date.now() < wait) { /* busy wait 50ms */ }
    }
  }
  return false;
}

function isValidJSONFile(fullPath) {
  try {
    const raw = fs.readFileSync(fullPath, 'utf8');
    JSON.parse(raw);
    return true;
  } catch (e) {
    return false;
  }
}

/* ─────────────────────────────────────────────────────────────
   🩺 BACKUP RECENCY CHECK (soft warning, non-blocking)
───────────────────────────────────────────────────────────── */
function checkBackupFreshness() {
  const idxPath = path.join(CACHE_ROOT, '_backup_index.json');
  if (!fs.existsSync(idxPath)) {
    log(`\n⚠️  Backup index not found (${path.basename(idxPath)}) — R2 backup may not have run yet.`);
    log(`   → Files deleted now will NOT be recoverable from R2.`);
    log(`   → Run "node scripts/backup-r2.js" first for maximum safety.`);
    return;
  }

  const stat = safeStat(idxPath);
  if (!stat) return;

  const ageMs = Date.now() - stat.mtimeMs;
  const ageMin = Math.round(ageMs / 60000);

  if (ageMs > BACKUP_STALE_MS) {
    log(`\n⚠️  Backup index is ${ageMin} minutes old (stale > ${Math.round(BACKUP_STALE_MS / 60000)} min).`);
    log(`   → Deleting files now may exceed R2 backup coverage.`);
    log(`   → Consider re-running "node scripts/backup-r2.js".`);
  } else {
    log(`\n✅ Backup index is fresh (${ageMin} min old) — safe to delete.`);
  }
}

/* ─────────────────────────────────────────────────────────────
   📂 SCAN ALL FILES
───────────────────────────────────────────────────────────── */
function getAllFilesInfo(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;

  let entries;
  try { entries = fs.readdirSync(dir); }
  catch (e) { return fileList; }

  for (const name of entries) {
    if (name.startsWith('.')) continue;

    const fullPath = path.join(dir, name);
    const stat = safeStat(fullPath);
    if (!stat) continue;
    if (safeIsSymlink(fullPath)) continue;

    if (stat.isDirectory()) {
      if (name !== 'node_modules') {
        getAllFilesInfo(fullPath, fileList);
      }
      continue;
    }

    if (!name.endsWith('.json')) continue;

    const relativePath = path.relative(CACHE_ROOT, fullPath).replace(/\\/g, '/');
    if (PROTECTED_PATHS.has(relativePath)) continue;

    const pathParts = relativePath.split('/');
    const dbName = pathParts[0] || 'root';
    const isCategory = pathParts.includes('categories') || pathParts.includes('config');
    const isMedia    = pathParts.includes('movies')   || pathParts.includes('tv') || pathParts.includes('details');
    const ageMs      = Date.now() - stat.mtimeMs;
    const isStale    = ageMs > STALE_AGE_MS;
    const isFresh    = ageMs < IN_PROGRESS_MS;

    fileList.push({
      name,
      path: fullPath,
      relativePath,
      db: dbName,
      isCategory,
      isMedia,
      isStale,
      isFresh,
      size: stat.size,
      mtime: stat.mtimeMs
    });
  }
  return fileList;
}

function getTotalSize(files) {
  return files.reduce((acc, f) => acc + f.size, 0);
}

function bytesToMB(b) { return (b / 1024 / 1024).toFixed(2); }

/* ─────────────────────────────────────────────────────────────
   📊 BREAKDOWN REPORT
───────────────────────────────────────────────────────────── */
function showDatabaseBreakdown(allFiles) {
  log('\n📁 Database Breakdown:');
  const dbStats = {};

  allFiles.forEach(file => {
    if (!dbStats[file.db]) {
      dbStats[file.db] = { size: 0, count: 0, categories: 0, media: 0, stale: 0 };
    }
    dbStats[file.db].size += file.size;
    dbStats[file.db].count++;
    if (file.isCategory) dbStats[file.db].categories++;
    if (file.isMedia)    dbStats[file.db].media++;
    if (file.isStale)    dbStats[file.db].stale++;
  });

  const sortedDbs = Object.keys(dbStats).sort((a, b) => dbStats[b].size - dbStats[a].size);

  if (sortedDbs.length === 0) {
    log('   (No files found)');
    return;
  }

  sortedDbs.forEach(dbName => {
    const s = dbStats[dbName];
    const name = dbName.toUpperCase().padEnd(12);
    const sizeMB = bytesToMB(s.size);
    log(`   🔹 ${name} : ${sizeMB} MB (${s.count} files | ${s.media} media | ${s.categories} cats | ${s.stale} stale)`);
  });
}

/* ─────────────────────────────────────────────────────────────
   🧹 CLEANUP EMPTY FOLDERS
───────────────────────────────────────────────────────────── */
function cleanupEmptyFolders(dir) {
  if (!fs.existsSync(dir)) return;
  let entries;
  try { entries = fs.readdirSync(dir); } catch (e) { return; }

  for (const name of entries) {
    const fullPath = path.join(dir, name);
    const stat = safeStat(fullPath);
    if (!stat || !stat.isDirectory()) continue;
    if (safeIsSymlink(fullPath)) continue;

    cleanupEmptyFolders(fullPath);

    try {
      if (fs.readdirSync(fullPath).length === 0) {
        if (DRY_RUN) {
          log(`   🧹 [DRY] Would remove empty folder: ${path.relative(CACHE_ROOT, fullPath)}`, true);
        } else {
          fs.rmdirSync(fullPath);
          log(`   🧹 Removed empty folder: ${path.relative(CACHE_ROOT, fullPath)}`);
        }
      }
    } catch (e) { /* ignore */ }
  }
}

/* ─────────────────────────────────────────────────────────────
   🩺 AUTO-HEAL (delete empty & corrupt files first)
   ⚠️ Never touches _backup_index.json or protected paths
───────────────────────────────────────────────────────────── */
function autoHeal(allFiles) {
  let healedCount = 0;
  let healedSize = 0;
  const details = [];

  for (const file of allFiles) {
    // Safety: never heal a protected path
    if (PROTECTED_PATHS.has(file.relativePath)) continue;

    let reason = null;

    if (file.size === 0) {
      reason = 'empty';
    } else if (!file.isFresh && file.size < 1024 * 1024) {
      if (!isValidJSONFile(file.path)) reason = 'corrupt';
    }

    if (reason) {
      const ok = safeUnlink(file.path);
      if (ok) {
        healedCount++;
        healedSize += file.size;
        details.push(`${file.relativePath} (${reason})`);
        log(`   🩹 Healed ${reason} file: ${file.relativePath}`, DRY_RUN);
      }
    }
  }

  if (healedCount > 0) {
    log(`\n🩺 Auto-heal: removed ${healedCount} empty/corrupt files (${bytesToMB(healedSize)} MB)`);
  } else {
    log('\n🩺 Auto-heal: no empty/corrupt files found.');
  }
  return { healedCount, healedSize };
}

/* ─────────────────────────────────────────────────────────────
   📝 META UPDATE
───────────────────────────────────────────────────────────── */
function updateMetaFile(stats) {
  const metaPath = path.join(CACHE_ROOT, '_meta.json');
  if (!fs.existsSync(metaPath)) {
    log(`   ⚠️ _meta.json not found — skipping meta update.`);
    return;
  }

  if (DRY_RUN) {
    log(`   🧪 [DRY] Would update _meta.json`, true);
    return;
  }

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const finalFiles = getAllFilesInfo(CACHE_ROOT);
    const finalSize = getTotalSize(finalFiles);

    meta.cache_size_mb              = parseFloat(bytesToMB(finalSize));
    meta.total_files                = finalFiles.length;
    meta.last_cleanup               = new Date().toISOString();
    meta.last_cleanup_removed_files = stats.deletedCount || 0;
    meta.last_cleanup_removed_mb    = parseFloat(bytesToMB(stats.deletedSize || 0));
    meta.last_cleanup_healed_files  = stats.healedCount || 0;
    meta.cache_status = finalSize <= MAX_SIZE_BYTES ? 'Healthy' : 'Warning';
    meta.cache_version = '10.7';

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    log(`   📝 Updated _meta.json → ${meta.cache_size_mb} MB | Status: ${meta.cache_status}`);
  } catch (e) {
    log(`   ⚠️ Failed to update _meta.json: ${e.message}`);
  }
}

/* ─────────────────────────────────────────────────────────────
   🎯 SMART DELETION SORT
   Priority (highest = delete first):
     1. Stale media files (oldest first)
     2. Fresh media files (oldest first)
     3. Stale category files (oldest first)
     4. Fresh category files (oldest first)
   Protected files are excluded from scan entirely.
───────────────────────────────────────────────────────────── */
function deletionPriority(a, b) {
  const rank = (f) => {
    if (f.isMedia && f.isStale)  return 0;
    if (f.isMedia && !f.isStale) return 1;
    if (!f.isMedia && f.isStale) return 2;
    return 3;
  };
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  return a.mtime - b.mtime;
}

/* ─────────────────────────────────────────────────────────────
   📊 Top-N largest deletions report
───────────────────────────────────────────────────────────── */
function showTopDeletions(deletedFiles, n = 5) {
  if (!deletedFiles.length) return;
  const top = deletedFiles
    .slice()
    .sort((a, b) => b.size - a.size)
    .slice(0, n);
  log(`\n📊 Top ${top.length} largest deletions:`);
  top.forEach((f, i) => {
    log(`   ${i + 1}. ${f.relativePath} → ${bytesToMB(f.size)} MB`);
  });
}

/* ─────────────────────────────────────────────────────────────
   🚀 MAIN EXECUTION
───────────────────────────────────────────────────────────── */
(function main() {
  const startTime = Date.now();

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   📊 CACHE SIZE MANAGER — v10.7 (Backup-Aware)                ║');
  console.log(`║   Max: ${String(MAX_SIZE_MB).padStart(3)} MB  |  Target: ${String(TARGET_SIZE_MB).padStart(3)} MB  |  Chunk: ${String(DELETE_CHUNK_MB).padStart(3)} MB     ║`);
  console.log(`║   Mode: ${DRY_RUN ? 'DRY-RUN (no changes)' : 'LIVE (will modify files)   '}                             ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  if (!fs.existsSync(CACHE_ROOT)) {
    log('\n⚠️  Cache folder does not exist yet. Creating...');
    if (!DRY_RUN) fs.mkdirSync(CACHE_ROOT, { recursive: true });
    saveLog();
    return;
  }

  /* ─── Step 1: Scan ─── */
  let allFiles = getAllFilesInfo(CACHE_ROOT);
  let currentSize = getTotalSize(allFiles);
  let currentMB = bytesToMB(currentSize);
  const protectedCount = PROTECTED_PATHS.size - METADATA_FILES.size;

  showDatabaseBreakdown(allFiles);
  log(`\n📦 Total Cache Size: ${currentMB} MB (${allFiles.length} files, ${protectedCount} protected categories + ${METADATA_FILES.size} metadata)`);

  /* ─── Step 2: Backup recency check (soft warning) ─── */
  checkBackupFreshness();

  /* ─── Step 3: Auto-heal empty/corrupt files ─── */
  const healStats = autoHeal(allFiles);

  /* ─── Step 4: Re-scan after heal ─── */
  allFiles = getAllFilesInfo(CACHE_ROOT);
  currentSize = getTotalSize(allFiles);
  currentMB = bytesToMB(currentSize);

  /* ─── Step 5: Check limit ─── */
  if (currentSize <= MAX_SIZE_BYTES) {
    log(`\n✅ Under ${MAX_SIZE_MB} MB limit (${currentMB} MB). No deletion needed.`);
    updateMetaFile({ deletedCount: 0, deletedSize: 0, healedCount: healStats.healedCount });
    saveLog();
    log(`\n🏁 Done in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    return;
  }

  const overflowBytes = currentSize - MAX_SIZE_BYTES;
  log(`\n⚠️  OVER ${MAX_SIZE_MB} MB LIMIT by ${bytesToMB(overflowBytes)} MB!`);
  log(`   Target: delete until ≤ ${TARGET_SIZE_MB} MB`);

  /* ─── Step 6: Auto-scale chunk if needed ─── */
  const neededBytes = currentSize - TARGET_SIZE_BYTES;
  const effectiveChunkBytes = Math.max(DELETE_CHUNK_BYTES, Math.ceil(neededBytes * 1.15));
  log(`   Effective deletion chunk: ${bytesToMB(effectiveChunkBytes)} MB`);

  /* ─── Step 7: Sort & delete ─── */
  let filesToDelete = allFiles.slice().sort(deletionPriority);

  let deletedSize = 0;
  let deletedCount = 0;
  let failedCount = 0;
  const deletedByType = {};
  const deletedFilesList = [];
  let currentSimulatedSize = currentSize;

  for (const file of filesToDelete) {
    if (deletedSize >= effectiveChunkBytes) {
      log(`   🛑 Reached deletion chunk limit (${bytesToMB(effectiveChunkBytes)} MB).`);
      break;
    }
    if (currentSimulatedSize <= TARGET_SIZE_BYTES) {
      log(`   🛑 Reached safe target size (${TARGET_SIZE_MB} MB). Stopping.`);
      break;
    }

    const ok = safeUnlink(file.path);
    if (ok) {
      deletedSize += file.size;
      currentSimulatedSize -= file.size;
      deletedCount++;
      deletedFilesList.push(file);
      const key = `${file.db.toUpperCase()} (${file.isMedia ? 'media' : 'category'}${file.isStale ? ', stale' : ''})`;
      deletedByType[key] = (deletedByType[key] || 0) + 1;
      if (DRY_RUN || VERBOSE) {
        log(`   ${DRY_RUN ? '🧪 [DRY] Would delete' : '🗑️ Deleting'}: ${file.relativePath} (${bytesToMB(file.size)} MB)`, DRY_RUN);
      }
    } else {
      failedCount++;
      log(`   ❌ Failed to delete: ${file.relativePath}`);
    }
  }

  /* ─── Step 8: Cleanup empty folders ─── */
  cleanupEmptyFolders(CACHE_ROOT);

  /* ─── Step 9: Final report ─── */
  const finalFiles = getAllFilesInfo(CACHE_ROOT);
  const newSize = getTotalSize(finalFiles);
  const newMB = bytesToMB(newSize);
  const deletedMB = bytesToMB(deletedSize);

  log(`\n🗑️  Deleted ${deletedCount} files (${deletedMB} MB)`);
  if (failedCount > 0) log(`   ⚠️  ${failedCount} file(s) failed to delete (locked or already gone)`);
  Object.keys(deletedByType).sort().forEach(key => {
    log(`      └─ ${key}: ${deletedByType[key]} files`);
  });
  log(`📦 New total size: ${newMB} MB`);

  /* ─── Step 10: Top-N largest deletions ─── */
  showTopDeletions(deletedFilesList, 5);

  /* ─── Step 11: Update meta ─── */
  updateMetaFile({ deletedCount, deletedSize, healedCount: healStats.healedCount });

  /* ─── Step 12: Final status ─── */
  if (newSize > MAX_SIZE_BYTES) {
    log(`\n⚠️  Still over ${MAX_SIZE_MB} MB by ${bytesToMB(newSize - MAX_SIZE_BYTES)} MB.`);
    log(`   → Re-run this script or increase DELETE_CHUNK_MB env var.`);
  } else {
    log(`\n✅ Size management complete! Cache is healthy (${newMB} MB ≤ ${MAX_SIZE_MB} MB).`);
  }

  saveLog();
  log(`\n🏁 Done in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  console.log('\n' + '═'.repeat(65));
})();
