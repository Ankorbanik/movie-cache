/* ═══════════════════════════════════════════════════════════════
   manage-size.js — v10.5 (ULTIMATE SMART SPACE MANAGER)
   FIXED: Added Safe Buffer (Target size) & Better Error Handling
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════════════════════════
   ⚙️ CONFIGURATION
═══════════════════════════════════════════════════════════════ */
const MAX_SIZE_MB = 95;       // Hard limit (GitHub repo warning threshold)
const TARGET_SIZE_MB = 80;    // Safe zone (Delete until this size is reached)
const DELETE_CHUNK_MB = 20;   // Max amount to delete per run (to avoid timeouts)
const CACHE_ROOT = path.join(__dirname, '..', 'cache');

const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const TARGET_SIZE_BYTES = TARGET_SIZE_MB * 1024 * 1024;
const DELETE_CHUNK_BYTES = DELETE_CHUNK_MB * 1024 * 1024;

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
      // Skip .git and hidden folders
      if (file !== '.git' && !file.startsWith('.')) {
        getAllFilesInfo(fullPath, fileList);
      }
    } else if (file.endsWith('.json') && file !== '_meta.json' && !file.startsWith('.')) {
      // Skip empty/corrupt files
      if (stat.size === 0) {
        try { fs.unlinkSync(fullPath); } catch(e) {}
        continue;
      }

      const relativePath = path.relative(CACHE_ROOT, fullPath);
      const pathParts = relativePath.split(path.sep);
      const dbName = pathParts[0] || 'root';
      
      const isCategory = pathParts.includes('categories') || pathParts.includes('config');
      const isMedia = pathParts.includes('movies') || pathParts.includes('tv') || pathParts.includes('details');
      
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
function updateMetaFile(deletedCount, deletedSizeMB) {
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
    meta.last_cleanup_removed_mb = deletedSizeMB;
    meta.cache_status = finalSize <= MAX_SIZE_BYTES ? 'Healthy' : 'Warning';

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
  console.log('║   📊 CACHE SIZE MANAGEMENT — v10.5 (Smart Space Manager)      ║');
  console.log(`║   Max Limit: ${MAX_SIZE_MB} MB | Target Safe Zone: ${TARGET_SIZE_MB} MB       ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  if (!fs.existsSync(CACHE_ROOT)) {
    console.log('\n⚠️  Cache folder does not exist yet. Creating...');
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
    return;
  }

  let allFiles = getAllFilesInfo(CACHE_ROOT);
  let currentSize = getTotalSize(allFiles);
  let currentMB = (currentSize / 1024 / 1024).toFixed(2);

  showDatabaseBreakdown(allFiles);
  console.log(`\n📦 Total Cache Size: ${currentMB} MB`);

  // Check if we need to delete
  if (currentSize <= MAX_SIZE_BYTES) {
    console.log(`✅ Under ${MAX_SIZE_MB} MB limit. No action needed.`);
    return;
  }

  const overflowMB = ((currentSize - MAX_SIZE_BYTES) / 1024 / 1024).toFixed(2);
  console.log(`\n⚠️  OVER ${MAX_SIZE_MB} MB LIMIT by ${overflowMB} MB! Starting smart deletion to reach ${TARGET_SIZE_MB} MB...`);

  // Smart Sorting (Media first, then oldest)
  let filesToDelete = allFiles.sort((a, b) => {
    if (a.isMedia && !b.isMedia) return -1;
    if (!a.isMedia && b.isMedia) return 1;
    if (a.isCategory && !b.isCategory) return 1;
    if (!a.isCategory && b.isCategory) return -1;
    return a.mtime - b.mtime; 
  });

  let deletedSize = 0;
  let deletedCount = 0;
  let deletedFromDBs = {};
  let currentSimulatedSize = currentSize;

  for (const file of filesToDelete) {
    // Stop if we hit the deletion chunk limit (20 MB)
    if (deletedSize >= DELETE_CHUNK_BYTES) {
      console.log(`   🛑 Reached max deletion chunk limit (${DELETE_CHUNK_MB} MB).`);
      break;
    }
    // Stop when we reach the TARGET SIZE (75 MB), NOT just the max limit
    if (currentSimulatedSize <= TARGET_SIZE_BYTES) {
      console.log(`   🛑 Cache is now safely down to ~${TARGET_SIZE_MB} MB. Stopping.`);
      break;
    }

    try {
      fs.unlinkSync(file.path);
      deletedSize += file.size;
      currentSimulatedSize -= file.size;
      deletedCount++;
      
      const dbName = file.db.toUpperCase();
      const typeName = file.isMedia ? 'Media' : (file.isCategory ? 'Category' : 'List');
      const key = `${dbName} (${typeName})`;
      deletedFromDBs[key] = (deletedFromDBs[key] || 0) + 1;
    } catch(e) {
      console.log(`   ❌ Failed to delete: ${file.name} (${e.message})`);
    }
  }

  cleanupEmptyFolders(CACHE_ROOT);

  const newSize = getTotalSize(getAllFilesInfo(CACHE_ROOT));
  const newMB = (newSize / 1024 / 1024).toFixed(2);
  const deletedMB = (deletedSize / 1024 / 1024).toFixed(2);
  
  console.log(`\n🗑️  Deleted ${deletedCount} files (${deletedMB} MB)`);
  Object.keys(deletedFromDBs).forEach(key => {
    console.log(`      └─ ${key}: ${deletedFromDBs[key]} files`);
  });
  console.log(`📦 New total size: ${newMB} MB`);
  
  updateMetaFile(deletedCount, deletedMB);

  console.log(`✅ Size management complete! Ready for fresh sync.`);
})();
