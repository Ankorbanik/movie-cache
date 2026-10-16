/* ═══════════════════════════════════════════════════════════════
   manage-size.js
   Check movies cache size. If > 50 MB, delete oldest 5 MB.
   Runs BEFORE sync-all.js
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const MAX_SIZE_MB = 50;
const DELETE_CHUNK_MB = 5;
const MOVIES_DIR = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');

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

(function(){
  console.log('📊 Cache size check...');

  if (!fs.existsSync(MOVIES_DIR)) {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
    console.log('✅ Movies cache dir created (empty)');
    return;
  }

  const currentSize = getDirSize(MOVIES_DIR);
  const currentMB = (currentSize / 1024 / 1024).toFixed(2);
  console.log('📦 Current movies cache: ' + currentMB + ' MB');

  if (currentSize < MAX_SIZE) {
    console.log('✅ Under ' + MAX_SIZE_MB + ' MB limit. No deletion needed.');
    return;
  }

  console.log('⚠️  Over ' + MAX_SIZE_MB + ' MB! Deleting oldest ' + DELETE_CHUNK_MB + ' MB...');

  const files = getFilesSortedByAge(MOVIES_DIR);
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

  const newSize = getDirSize(MOVIES_DIR);
  const newMB = (newSize / 1024 / 1024).toFixed(2);
  console.log('🗑️  Deleted ' + deletedCount + ' files (' + (deletedSize/1024/1024).toFixed(2) + ' MB)');
  console.log('📦 New size: ' + newMB + ' MB');
  console.log('✅ Cleanup complete!');
})();
