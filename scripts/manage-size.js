/* ═══════════════════════════════════════════════════════════════
   manage-size.js — v8.0 (ULTIMATE SMART DELETION)
   Features:
   - Auto-detects all databases (TMDB, AniList, etc.)
   - Global 90 MB limit with 10 MB smart deletion.
   - Protects 'categories' folders (they are tiny & essential).
   - Auto-updates _meta.json after cleanup.
   - Ignore hidden and 0-byte files.
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const MAX_SIZE_MB = 90;
const DELETE_CHUNK_MB = 10;
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
      const isCategory = relativePath.includes('categories');

      fileList.push({
        name: file,
        path: fullPath,
        db: dbName,
        isCategory: isCategory,
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
    if (!dbStats[file.db]) dbStats[file.db] = { size: 0, count: 0, categories: 0 };
    dbStats[file.db].size += file.size;
    dbStats[file.db].count++;
    if (file.isCategory) dbStats[file.db].categories++;
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
    
    console.log(`   🔹 ${namePadded} : ${sizeMB} MB (${stat.count} files | ${stat.categories} categories)`);
  });
}

/* ─────────────────────────────────────────────────────────────
   📝 Helper: Update _meta.json after deletion
───────────────────────────────────────────────────────────── */
function updateMetaFile() {
  const metaPath = path.join(CACHE_ROOT, '_meta.json');
  if (!fs.existsSync(metaPath)) return;

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const finalFiles = getAllFilesInfo(CACHE_ROOT);
    const finalSize = getTotalSize(finalFiles);
    
    meta.cache_size_mb = (finalSize / 1024 / 1024).toFixed(2);
    meta.total_files = finalFiles.length;
    meta.last_cleanup = new Date().toISOString();

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    console.log(`   📝 Updated _meta.json with new size: ${meta.cache_size_mb} MB`);
  } catch(e) {
    console.log(`   ⚠️ Failed to update _meta.json: ${e.message}`);
  }
}

/* ─────────────────────────────────────────────────────────────
   🚀 Main Execution
───────────────────────────────────────────────────────────── */
(function(){
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   📊 CACHE SIZE MANAGEMENT — v8.0 (Smart Ultimate)            ║');
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

  // ৪. স্মার্ট সর্টিং: ক্যাটাগরি ফাইল ব্যাকআপে রাখো, আগে বড় ফাইল (Movies/TV) ডিলিট করো
  // প্রথমে ক্যাটাগরি বাদে বাকি ফাইলগুলোকে পুরনো থেকে নতুন সাজাও
  let filesToDelete = allFiles.filter(f => !f.isCategory).sort((a, b) => a.mtime - b.mtime);
  
  // যদি ক্যাটাগরি বাদে যথেষ্ট ফাইল না থাকে, তবে ক্যাটাগরিগুলোকেও লিস্টে যোগ করো
  if (filesToDelete.length === 0) {
    filesToDelete = allFiles.sort((a, b) => a.mtime - b.mtime);
  }

  let deletedSize = 0;
  let deletedCount = 0;
  let deletedFromDBs = {};

  // ৫. ডিলিট করা
  for (const file of filesToDelete) {
    if (deletedSize >= DELETE_CHUNK) break;
    try {
      fs.unlinkSync(file.path);
      deletedSize += file.size;
      deletedCount++;
      
      const dbName = file.db.toUpperCase();
      deletedFromDBs[dbName] = (deletedFromDBs[dbName] || 0) + 1;

    } catch(e) {
      console.log(`   ❌ Failed to delete: ${file.name} (${e.message})`);
    }
  }

  // ৬. ফাইনাল রিপোর্ট
  const newSize = getTotalSize(getAllFilesInfo(CACHE_ROOT));
  const newMB = (newSize / 1024 / 1024).toFixed(2);
  
  console.log(`\n🗑️  Deleted ${deletedCount} files (${(deletedSize/1024/1024).toFixed(2)} MB)`);
  Object.keys(deletedFromDBs).forEach(db => {
    console.log(`      └─ ${db}: ${deletedFromDBs[db]} files`);
  });
  console.log(`📦 New total size: ${newMB} MB`);
  
  // ৭. মেটা ফাইল আপডেট
  updateMetaFile();

  console.log(`✅ Size management complete!`);
  
})();
