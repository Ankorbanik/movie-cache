/* ═══════════════════════════════════════════════════════════════
   manage-size.js — v3.1
   90 MB limit, delete 10 MB chunks
   Checks both movies/ and tv/ folders
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const MAX_SIZE_MB = 90;
const DELETE_CHUNK_MB = 10;

const MOVIES_DIR = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');
const TV_DIR = path.join(__dirname, '..', 'cache', 'tmdb', 'tv');

const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;
const DELETE_CHUNK = DELETE_CHUNK_MB * 1024 * 1024;

function getDirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  fs.readdirSync(dir).forEach(function(f){
    const full = path.join(dir, f);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile()) total += stat.size;
    } catch(e){}
  });
  return total;
}

function getFilesSortedByAge(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(function(f){ return f.endsWith('.json'); })
    .map(function(f){
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { name: f, path: full, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort(function(a, b){ return a.mtime - b.mtime; });
}

function cleanupDir(dir, dirName) {
  console.log('\n📂 Checking ' + dirName + ' cache...');
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('   ✅ Created (empty)');
    return 0;
  }

  const currentSize = getDirSize(dir);
  const currentMB = (currentSize / 1024 / 1024).toFixed(2);
  console.log('   📦 Size: ' + currentMB + ' MB');

  if (currentSize < MAX_SIZE) {
    console.log('   ✅ Under ' + MAX_SIZE_MB + ' MB limit');
    return 0;
  }

  console.log('   ⚠️  OVER ' + MAX_SIZE_MB + ' MB! Deleting oldest ' + DELETE_CHUNK_MB + ' MB...');

  const files = getFilesSortedByAge(dir);
  let deletedSize = 0;
  let deletedCount = 0;

  for (const file of files) {
    if (deletedSize >= DELETE_CHUNK) break;
    try {
      fs.unlinkSync(file.path);
      deletedSize += file.size;
      deletedCount++;
    } catch(e){}
  }

  const newSize = getDirSize(dir);
  const newMB = (newSize / 1024 / 1024).toFixed(2);
  console.log('   🗑️  Deleted ' + deletedCount + ' files (' + (deletedSize/1024/1024).toFixed(2) + ' MB)');
  console.log('   📦 New size: ' + newMB + ' MB');
  return deletedCount;
}

(function(){
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   📊 CACHE SIZE MANAGEMENT — v3.1                            ║');
  console.log('║   Limit: ' + MAX_SIZE_MB + ' MB | Delete chunks: ' + DELETE_CHUNK_MB + ' MB                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const moviesDeleted = cleanupDir(MOVIES_DIR, 'Movies');
  const tvDeleted = cleanupDir(TV_DIR, 'TV Shows');

  console.log('\n📊 Total cleanup:');
  console.log('   Movies: ' + moviesDeleted + ' files deleted');
  console.log('   TV:     ' + tvDeleted + ' files deleted');
  console.log('✅ Size management complete!');
})();
