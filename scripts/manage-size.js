/* ═══════════════════════════════════════════════════════════════
   manage-size.js — v9.0 (ULTIMATE SMART DELETION ENGINE)
   Features:
   - Auto-detects all databases (TMDB, AniList, TVmaze, etc.)
   - Global 95 MB limit with 15 MB smart deletion.
   - Smart Priority: Deletes heavy Media (movies/tv) first, keeps 
     Categories & Config safe.
   - Auto-cleans empty folders.
   - Auto-updates _meta.json after cleanup.
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════════════════════════
   ⚙️ CONFIGURATION
═══════════════════════════════════════════════════════════════ */
const MAX_SIZE_MB = 95;       // Max allowed cache size (increased from 90 for v9.0 data)
const DELETE_CHUNK_MB = 15;   // Amount to delete when limit is exceeded
const CACHE_ROOT = path.join(__dirname, '..', 'cache');

const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;
const DELETE_CHUNK = DELETE_CHUNK_MB * 1024 * 1024;

/* ─────────────────────────────────────────────────────────────
   📂 Helper: Recursively get all JSON files & size
───────────────────────────────────────────────────────────── */
function getAllFilesInfo(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      getAllFilesInfo(fullPath, fileList); // Recursive scan
    } else if (file.endsWith('.json') && file !== '_meta.json' && !file.startsWith('.')) {
      // Skip empty files
      if (stat.size === 0) {
        try { fs.unlinkSync(fullPath); } catch(e) {}
        continue;
      }

      const relativePath = path.relative(CACHE_ROOT, fullPath);
      const pathParts = relativePath.split(path.sep);
      const dbName = pathParts[0] || 'root';
      
      // Smart Categorization
      const isCategory = relativePath.includes('categories') || relativePath.includes('config');
      
      // Heavy media files (movies/tv/details) can be deleted first
      const isMedia = relativePath.includes('movies') || 
                      relativePath.includes('tv') || 
                      relativePath.includes('details');
      
      fileList.push({
        name: file,
        path: fullPath,
        db: dbName,
        isCategory: isCategory,
        isMedia: isMedia,
        size: stat.size,
        mtime: stat.mtimeMs
      });
    }
  }
  return fileList;
}

function getTotalSize(files) {
  return files.reduce((acc, file) => acc + file.size, 0);
}

/* ─────────────────────────────────────────────────────────────
   📊 Helper: Show size of each database folder dynamically
───────────────────────────────────────────────────────────── */
function showDatabaseBreakdown(allFiles) {
  console.log('\n📁 Database Breakdown:');
  
  const dbStats = {};
  
  allFiles.forEach(file => {
    if (!dbStats[file.db]) dbStats[file.db] = { size: 0, count: 0, categories: 0, media: 0 };
    dbStats[file.db].size += file.size;
    dbStats[file.db].count++;
    if (file.isCategory) dbStats[file.db].categories++;
    if (file.isMedia) dbStats[file.db].media++;
  });

  const sortedDbs = Object.keys(dbStats).sort((a, b) => dbStats[b].size - dbStats[a].size);

  if (sortedDbs.length === 0) {
    console.log('   (No files found)');
    return;
  }

  sortedDbs.forEach(dbName => {
    const stat = dbStats[dbName];
    const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
    const namePadded = dbName.toUpperCase().padEnd(12);
    
    console.log(`   🔹 ${namePadded} : ${sizeMB} MB (${stat.count} files | ${stat.media} media | ${stat.categories} cats)`);
  });
}

/* ─────────────────────────────────────────────────────────────
   🧹 Helper: Cleanup empty folders
───────────────────────────────────────────────────────────── */
function cleanupEmptyFolders(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      cleanupEmptyFolders(fullPath);
      // If folder is empty now, remove it
      if (fs.readdirSync(fullPath).length === 0) {
        try { 
          fs.rmdirSync(fullPath); 
          console.log(`   🧹 Removed empty folder: ${path.relative(CACHE_ROOT, fullPath)}`);
        } catch(e) {}
      }
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   📝 Helper: Update _meta.json after deletion
───────────────────────────────────────────────────────────── */
function updateMetaFile(deletedCount, deletedSize) {
  const metaPath = path.join(CACHE_ROOT, '_meta.json');
  if (!fs.existsSync(metaPath)) return;

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const finalFiles = getAllFilesInfo(CACHE_ROOT);
    const finalSize = getTotalSize(finalFiles);
    
    meta.cache_size_mb = (finalSize / 1024 / 1024).toFixed(2);
    meta.total_files = finalFiles.length;
    meta.last_cleanup = new Date().toISOString();
    meta.last_cleanup_removed_files = deletedCount;
    meta.last_cleanup_removed_mb = (deletedSize / 1024 / 1024).toFixed(2);
    meta.cache_status = finalSize < MAX_SIZE ? 'Healthy' : 'Warning';

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    console.log(`   📝 Updated _meta.json -> New Size: ${meta.cache_size_mb} MB | Status: ${meta.cache_status}`);
  } catch(e) {
    console.log(`   ⚠️ Failed to update _meta.json: ${e.message}`);
  }
}

/* ─────────────────────────────────────────────────────────────
   🚀 Main Execution
───────────────────────────────────────────────────────────── */
(function(){
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   📊 CACHE SIZE MANAGEMENT — v9.0 (Smart Ultimate)            ║');
  console.log('║   Limit: ' + MAX_SIZE_MB + ' MB | Delete chunks: ' + DELETE_CHUNK_MB + ' MB                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  if (!fs.existsSync(CACHE_ROOT)) {
    console.log('\n⚠️  Cache folder does not exist yet. Creating...');
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
    return;
  }

  // ১. সব ফাইল স্ক্যান করো
  let allFiles = getAllFilesInfo(CACHE_ROOT);
  let currentSize = getTotalSize(allFiles);
  let currentMB = (currentSize / 1024 / 1024).toFixed(2);

  // ২. বর্তমান অবস্থা দেখাও
  showDatabaseBreakdown(allFiles);
  console.log(`\n📦 Total Cache Size: ${currentMB} MB`);

  // ৩. লিমিট চেক
  if (currentSize < MAX_SIZE) {
    console.log(`✅ Under ${MAX_SIZE_MB} MB limit. No action needed.`);
    return;
  }

  console.log(`\n⚠️  OVER ${MAX_SIZE_MB} MB LIMIT! Deleting oldest ${DELETE_CHUNK_MB} MB...`);

  /* 
   * ৪. স্মার্ট ডিলিট প্রায়োরিটি সর্টিং:
   * Priority 1: Media files (movies/tv) -> oldest first
   * Priority 2: Lists (trending, popular) -> oldest first
   * Priority 3: Categories/Config -> oldest first (only if absolutely necessary)
   */
  let filesToDelete = allFiles.sort((a, b) => {
    // First, prioritize media (isMedia = true) over others (isMedia = false)
    if (a.isMedia && !b.isMedia) return -1;
    if (!a.isMedia && b.isMedia) return 1;
    
    // Second, keep categories safe (isCategory = true) go to the very end
    if (a.isCategory && !b.isCategory) return 1;
    if (!a.isCategory && b.isCategory) return -1;
    
    // Finally, sort by oldest time
    return a.mtime - b.mtime;
  });

  let deletedSize = 0;
  let deletedCount = 0;
  let deletedFromDBs = {};

  // ৫. ফাইল ডিলিট করা
  for (const file of filesToDelete) {
    if (deletedSize >= DELETE_CHUNK) break;
    try {
      fs.unlinkSync(file.path);
      deletedSize += file.size;
      deletedCount++;
      
      const dbName = file.db.toUpperCase();
      const typeName = file.isMedia ? 'Media' : (file.isCategory ? 'Category' : 'List');
      const key = `${dbName} (${typeName})`;
      deletedFromDBs[key] = (deletedFromDBs[key] || 0) + 1;

    } catch(e) {
      console.log(`   ❌ Failed to delete: ${file.name} (${e.message})`);
    }
  }

  // ৬. খালি ফোল্ডার পরিষ্কার করা
  cleanupEmptyFolders(CACHE_ROOT);

  // ৭. ফাইনাল রিপোর্ট
  const newSize = getTotalSize(getAllFilesInfo(CACHE_ROOT));
  const newMB = (newSize / 1024 / 1024).toFixed(2);
  
  console.log(`\n🗑️  Deleted ${deletedCount} files (${(deletedSize/1024/1024).toFixed(2)} MB)`);
  Object.keys(deletedFromDBs).forEach(key => {
    console.log(`      └─ ${key}: ${deletedFromDBs[key]} files`);
  });
  console.log(`📦 New total size: ${newMB} MB`);
  
  // ৮. মেটা ফাইল আপডেট
  updateMetaFile(deletedCount, deletedSize);

  console.log(`✅ Size management complete!`);
  
})();
