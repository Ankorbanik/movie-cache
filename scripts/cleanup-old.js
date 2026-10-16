const fs = require('fs');
const path = require('path');

const MAX_AGE_DAYS = 7;
const cacheRoot = path.join(__dirname, '..', 'cache');

function walk(dir) {
  const files = [];
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  });
  return files;
}

const now = Date.now();
let removed = 0;
walk(cacheRoot).forEach(file => {
  if (file.includes('_meta') || file.includes('config') || file.endsWith('.gitkeep')) return;
  const age = (now - fs.statSync(file).mtimeMs) / (1000 * 60 * 60 * 24);
  if (age > MAX_AGE_DAYS) { fs.unlinkSync(file); removed++; }
});

console.log(`Cleanup: removed ${removed} old files`);
