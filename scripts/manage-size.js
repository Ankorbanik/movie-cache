/* ═══════════════════════════════════════════════════════════════
   manage-size.js — v5.0 (ULTIMATE DYNAMIC EDITION)
   Dynamically scans ALL databases.
   Auto-detects new folders (TMDB, AniList, OMDb, etc.)
   Global 90 MB limit with smart oldest-file deletion.
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const MAX_SIZE_MB = 90;
const DELETE_CHUNK_MB = 10;
const CACHE_ROOT = path.join(__dirname, '..', 'cache');

const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;
const DELETE_CHUNK = DELETE_CHUNK_MB * 1024 * 1024;

/* ─────────────────────────────────────────────────────────────
   📋 Supported Databases (Future-Proof Reference)
───────────────────────────────────────────────────────────── */
const SUPPORTED_DATABASES = [
  'tmdb', 'anilist', 'omdb', 'tvmaze', 'watchmode', 
  'fanart', 'animedoc', 'simkl', 'thetvdb', 'jikan'
];

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
    } else if (file.endsWith('.json') && file !== '_meta.json') {
      // Extract the root DB folder name from the path (e.g., 'tmdb', 'anilist')
      const relativePath = path.relative(CACHE_ROOT, fullPath);
      const dbName = relativePath.split(path.sep)[0] || 'root';

      fileList.push({
        name: file,
        path: fullPath,
        db: dbName,
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
    if (!dbStats[file.db]) dbStats[file.db] = { size: 0, count: 0 };
    dbStats[file.db].size += file.size;
    dbStats[file.db].count++;
  });

  const sortedDbs = Object.keys(dbStats).sort((a, b) => dbStats[b].size - dbStats[a].size);

  if (sortedDbs.length === 0) {
    console.log('   (No files found)');
    return;
  }

  sortedDbs.forEach(dbName => {
    const stat = dbStats[dbName];
    const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
    const isSupported = SUPPORTED_DATABASES.includes(dbName.toLowerCase());
    const icon = isSupported ? '🔹' : '⚠️ ';
    const namePadded = dbName.toUpperCase().padEnd(12);
    
    console.log(`   ${icon} ${namePadded} : ${sizeMB} MB (${stat.count} files)`);
  });
}

/* ─────────────────────────────────────────────────────────────
   🚀 Main Execution
───────────────────────────────────────────────────────────── */
(function(){
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   📊 CACHE SIZE MANAGEMENT — v5.0 (Dynamic)                   ║');
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

  // ৪. সব ডাটাবেসের ফাইল একসাথে তারিখ অনুযায়ী সাজাও (পুরনো থেকে নতুন)
  allFiles.sort((a, b) => a.mtime - b.mtime);

  let deletedSize = 0;
  let deletedCount = 0;
  let deletedFromDBs = {};

  // ৫. ডিলিট করা (Dynamic tracking)
  for (const file of allFiles) {
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
  console.log(`✅ Size management complete!`);
  
})();
