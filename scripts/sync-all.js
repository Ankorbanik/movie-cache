/* ═══════════════════════════════════════════════════════════════
   sync-all.js — v3.1 with FULL ROTATION LOGGING
   
   1. Fetch 27 categories from TMDB (List Cache)
   2. Fetch 100 movie details (Item Cache)
   3. Auto-check 50MB limit + delete oldest 5MB
   
   ✅ প্রতিটি API call-এ কোন key ব্যবহার হচ্ছে সেটি log হবে
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════════════════════════
   🔑 KEY MANAGEMENT
═══════════════════════════════════════════════════════════════ */
const KEYS = (process.env.TMDB_KEYS || '')
  .split(',')
  .map(function(k){ return k.trim(); })
  .filter(Boolean);

const BASE = 'https://api.themoviedb.org/3';
const MOVIES_PER_SYNC = 100;

/* ── Key Stats Tracker ── */
const keyStats = {
  usage: {},           // key → count
  failures: {},        // key → count
  lastUsed: null,
  currentIdx: 0
};

/* ── Key Masking (security — last 4 chars hide) ── */
function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

/* ── Round-Robin Key Picker ── */
let keyIdx = 0;
function nextKey() {
  if (!KEYS.length) {
    console.log('❌ No keys available!');
    return '';
  }
  const idx = keyIdx % KEYS.length;
  const key = KEYS[idx];
  keyIdx++;
  
  // Track usage
  keyStats.usage[key] = (keyStats.usage[key] || 0) + 1;
  keyStats.lastUsed = key;
  keyStats.currentIdx = idx + 1;
  
  // 🆕 Detailed rotation log
  const masked = maskKey(key);
  console.log('🔑 [ROTATION] Key #' + (idx + 1) + '/' + KEYS.length + 
              ' → ' + masked + 
              ' (used ' + keyStats.usage[key] + 'x)');
  
  return key;
}

/* ── Log key failure ── */
function logKeyFailure(key, status) {
  keyStats.failures[key] = (keyStats.failures[key] || 0) + 1;
  console.log('⚠️  [FAILURE] Key ' + maskKey(key) + 
              ' → HTTP ' + status + 
              ' (total fails: ' + keyStats.failures[key] + ')');
}

/* ═══════════════════════════════════════════════════════════════
   📋 CATEGORIES
═══════════════════════════════════════════════════════════════ */
const CATEGORIES = [
  { name: 'trending',    url: '/trending/all/week',                          icon: '🔥' },
  { name: 'popular',     url: '/movie/popular',                               icon: '⭐' },
  { name: 'top-rated',   url: '/movie/top_rated',                             icon: '🏆' },
  { name: 'upcoming',    url: '/movie/upcoming',                              icon: '📅' },
  { name: 'now-playing', url: '/movie/now_playing',                           icon: '🎬' },
  { name: 'netflix',     url: '/discover/tv?with_networks=213',               icon: '🎥' },
  { name: 'anime-tv',    url: '/discover/tv?with_genres=16&with_original_language=ja', icon: '🎌' },
  { name: 'korean',      url: '/discover/tv?with_original_language=ko',       icon: '🇰🇷' },
  { name: 'chinese',     url: '/discover/tv?with_original_language=zh',       icon: '🇨🇳' },
  { name: 'japanese',    url: '/discover/tv?with_original_language=ja',       icon: '🇯🇵' },
  { name: 'hindi',       url: '/discover/movie?with_original_language=hi',    icon: '🇮🇳' },
  { name: 'bengali',     url: '/discover/movie?with_original_language=bn',    icon: '🇧🇩' },
  { name: 'tamil',       url: '/discover/movie?with_original_language=ta',    icon: '🎭' },
  { name: 'telugu',      url: '/discover/movie?with_original_language=te',    icon: '🎭' },
  { name: 'marvel',      url: '/discover/movie?with_companies=420',           icon: '🦸' },
  { name: 'dc',          url: '/discover/movie?with_companies=9993',          icon: '🦇' },
  { name: 'ghibli',      url: '/discover/movie?with_companies=10342',         icon: '🌿' },
  { name: 'a24',         url: '/discover/movie?with_companies=41077',         icon: '🎞️' },
  { name: 'pixar',       url: '/discover/movie?with_companies=3',             icon: '🎈' },
  { name: 'disney',      url: '/discover/movie?with_companies=2',             icon: '🏰' },
  { name: 'action',      url: '/discover/movie?with_genres=28',               icon: '💥' },
  { name: 'comedy',      url: '/discover/movie?with_genres=35',               icon: '😂' },
  { name: 'horror',      url: '/discover/movie?with_genres=27',               icon: '👻' },
  { name: 'scifi',       url: '/discover/movie?with_genres=878',              icon: '🚀' },
  { name: 'romance',     url: '/discover/movie?with_genres=10749',            icon: '💕' },
  { name: 'thriller',    url: '/discover/movie?with_genres=53',               icon: '🔪' },
  { name: 'documentary', url: '/discover/movie?with_genres=99',               icon: '📖' },
];

/* ═══════════════════════════════════════════════════════════════
   🌐 API FETCH WITH RETRY
═══════════════════════════════════════════════════════════════ */
async function fetchAPI(url, maxAttempts) {
  maxAttempts = maxAttempts || 4;
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      
      if (res.status === 429) {
        console.log('   ⏸️  Rate limited (429) — waiting ' + (1.5 * (i + 1)).toFixed(1) + 's...');
        await new Promise(function(r){ setTimeout(r, 1500 * (i + 1)); });
        continue;
      }
      
      if (res.status >= 500) {
        console.log('   ⏸️  Server error (' + res.status + ') — retrying...');
        await new Promise(function(r){ setTimeout(r, 1000); });
        continue;
      }
      
      if (res.status === 401 || res.status === 403) {
        console.log('   ❌ Auth failed (' + res.status + ') — bad key');
        return { __error: res.status };
      }
      
      if (!res.ok) {
        console.log('   ❌ HTTP ' + res.status);
        return null;
      }
      
      return await res.json();
      
    } catch(e) {
      console.log('   ⚠️  Network error: ' + e.message);
      await new Promise(function(r){ setTimeout(r, 1000); });
    }
  }
  
  console.log('   ❌ All ' + maxAttempts + ' attempts failed');
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   💾 SAVE JSON
═══════════════════════════════════════════════════════════════ */
function saveJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data));
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 1: FETCH CATEGORIES (List Cache)
═══════════════════════════════════════════════════════════════ */
async function syncCategories() {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 1: Fetching List Cache (27 categories)');
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'categories');
  fs.mkdirSync(dir, { recursive: true });

  const allMovieIds = new Set();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const progress = '[' + (i + 1) + '/' + CATEGORIES.length + ']';
    console.log('\n' + progress + ' ' + cat.icon + ' ' + cat.name.toUpperCase());
    
    const sep = cat.url.indexOf('?') > -1 ? '&' : '?';
    const key = nextKey();
    const url = BASE + cat.url + sep + 'api_key=' + key + '&page=1';
    
    const data = await fetchAPI(url);
    
    if (!data || !data.results) {
      if (data && data.__error) {
        logKeyFailure(key, data.__error);
      }
      console.log('   ❌ Failed: no data');
      failCount++;
      continue;
    }
    
    const clean = data.results.filter(function(r){ return r.poster_path; });
    
    saveJSON(path.join(dir, cat.name + '.json'), {
      results: clean,
      updated: new Date().toISOString()
    });
    
    console.log('   ✅ Saved ' + clean.length + ' items');
    successCount++;

    clean.forEach(function(item){
      if (item.media_type !== 'tv' && item.id) allMovieIds.add(item.id);
    });

    await new Promise(function(r){ setTimeout(r, 250); });
  }
  
  console.log('\n📊 List Cache Summary:');
  console.log('   ✅ Success: ' + successCount + '/' + CATEGORIES.length);
  console.log('   ❌ Failed:  ' + failCount + '/' + CATEGORIES.length);
  console.log('   🎬 Unique movie IDs: ' + allMovieIds.size);
  
  return allMovieIds;
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 2: FETCH MOVIE DETAILS (Item Cache)
═══════════════════════════════════════════════════════════════ */
async function syncMovieDetails(movieIds) {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 2: Fetching Item Cache (up to ' + MOVIES_PER_SYNC + ' movies)');
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');
  fs.mkdirSync(dir, { recursive: true });

  const ids = Array.from(movieIds).slice(0, MOVIES_PER_SYNC);
  console.log('📋 Processing ' + ids.length + ' movie IDs...\n');
  
  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const progress = '[' + (i + 1) + '/' + ids.length + ']';
    const filePath = path.join(dir, id + '.json');
    
    // Skip if cached
    if (fs.existsSync(filePath)) {
      skipped++;
      if (i % 10 === 0 || i === ids.length - 1) {
        console.log(progress + ' ⏭️  Movie ' + id + ' (cached)');
      }
      continue;
    }

    console.log('\n' + progress + ' 🎬 Fetching movie ' + id);
    const key = nextKey();
    const url = BASE + '/movie/' + id + 
                '?api_key=' + key + 
                '&append_to_response=credits,external_ids,watch/providers';
    
    const data = await fetchAPI(url);
    
    if (!data || data.__error) {
      if (data && data.__error) {
        logKeyFailure(key, data.__error);
      }
      console.log('   ❌ Failed');
      failed++;
      continue;
    }

    saveJSON(filePath, data);
    console.log('   ✅ Saved: ' + (data.title || 'Unknown'));
    added++;
    
    await new Promise(function(r){ setTimeout(r, 200); });
  }

  console.log('\n📊 Item Cache Summary:');
  console.log('   ✅ New added:   ' + added);
  console.log('   ⏭️  Already cached: ' + skipped);
  console.log('   ❌ Failed:      ' + failed);
}

/* ═══════════════════════════════════════════════════════════════
   🗑️ STEP 3: SIZE CHECK + CLEANUP
═══════════════════════════════════════════════════════════════ */
function checkAndCleanup() {
  console.log('\n' + '═'.repeat(65));
  console.log('📦 STEP 3: Size Check + Cleanup');
  console.log('═'.repeat(65));
  
  const MOVIES_DIR = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');
  const MAX_SIZE = 50 * 1024 * 1024;
  const DELETE_CHUNK = 5 * 1024 * 1024;

  if (!fs.existsSync(MOVIES_DIR)) {
    console.log('ℹ️  No movies directory yet');
    return { size: 0, deleted: 0 };
  }

  function getSize() {
    let total = 0;
    fs.readdirSync(MOVIES_DIR).forEach(function(f){
      try {
        const stat = fs.statSync(path.join(MOVIES_DIR, f));
        if (stat.isFile()) total += stat.size;
      } catch(e){}
    });
    return total;
  }

  function getFileCount() {
    return fs.readdirSync(MOVIES_DIR).filter(function(f){ 
      return f.endsWith('.json'); 
    }).length;
  }

  const size = getSize();
  const count = getFileCount();
  const sizeMB = (size / 1024 / 1024).toFixed(2);
  const percent = ((size / MAX_SIZE) * 100).toFixed(1);
  
  console.log('📊 Current size:  ' + sizeMB + ' MB (' + percent + '% of 50 MB)');
  console.log('📁 Total movies:  ' + count + ' files');

  if (size < MAX_SIZE) {
    console.log('✅ Under 50 MB limit — no deletion needed');
    return { size: size, deleted: 0 };
  }

  console.log('\n⚠️  OVER 50 MB LIMIT! Starting cleanup...');
  console.log('🗑️  Will delete oldest files until 5 MB freed');

  const files = fs.readdirSync(MOVIES_DIR)
    .filter(function(f){ return f.endsWith('.json'); })
    .map(function(f){
      const full = path.join(MOVIES_DIR, f);
      const stat = fs.statSync(full);
      return { path: full, name: f, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort(function(a, b){ return a.mtime - b.mtime; });  // oldest first

  let deletedSize = 0;
  let deletedCount = 0;

  for (const file of files) {
    if (deletedSize >= DELETE_CHUNK) break;
    try {
      fs.unlinkSync(file.path);
      deletedSize += file.size;
      deletedCount++;
      console.log('   🗑️  Deleted: ' + file.name);
    } catch(e){}
  }

  const newSize = getSize();
  const newSizeMB = (newSize / 1024 / 1024).toFixed(2);
  const newCount = getFileCount();
  
  console.log('\n📊 Cleanup Complete:');
  console.log('   🗑️  Deleted:   ' + deletedCount + ' files (' + (deletedSize/1024/1024).toFixed(2) + ' MB)');
  console.log('   📦 New size:   ' + newSizeMB + ' MB');
  console.log('   📁 New count:  ' + newCount + ' files');
  
  return { size: newSize, deleted: deletedCount };
}

/* ═══════════════════════════════════════════════════════════════
   📊 FINAL KEY ROTATION REPORT
═══════════════════════════════════════════════════════════════ */
function printKeyReport() {
  console.log('\n' + '═'.repeat(65));
  console.log('🔑 KEY ROTATION REPORT');
  console.log('═'.repeat(65));
  
  if (!KEYS.length) {
    console.log('❌ No keys configured');
    return;
  }
  
  const totalUsage = Object.values(keyStats.usage).reduce(function(a, b){ return a + b; }, 0);
  
  console.log('📊 Total API calls: ' + totalUsage);
  console.log('🔑 Total keys:      ' + KEYS.length);
  console.log('📈 Average/key:     ' + (totalUsage / KEYS.length).toFixed(1) + ' calls');
  console.log('');
  console.log('Per-key breakdown:');
  console.log('────────────────────────────────────────────────────────────');
  
  KEYS.forEach(function(key, idx){
    const usage = keyStats.usage[key] || 0;
    const fails = keyStats.failures[key] || 0;
    const masked = maskKey(key);
    const bar = '█'.repeat(Math.min(usage, 30));
    
    let status = '✅';
    if (fails > 0) status = '⚠️ ';
    if (usage === 0) status = '💤';
    
    console.log(
      status + ' #' + String(idx + 1).padStart(2, '0') + 
      ' ' + masked + 
      ' → ' + String(usage).padStart(3) + ' calls' +
      (fails > 0 ? ' (' + fails + ' fails)' : '') +
      ' ' + bar
    );
  });
  
  console.log('────────────────────────────────────────────────────────────');
  
  // Check if rotation is fair
  const usages = KEYS.map(function(k){ return keyStats.usage[k] || 0; });
  const maxUsage = Math.max.apply(null, usages);
  const minUsage = Math.min.apply(null, usages);
  const diff = maxUsage - minUsage;
  
  console.log('');
  if (diff <= 2) {
    console.log('✅ ROTATION PERFECT — All keys used evenly!');
  } else if (diff <= 5) {
    console.log('✅ ROTATION GOOD — Keys used fairly evenly');
  } else {
    console.log('⚠️  ROTATION UNEVEN — Some keys used more than others');
  }
  
  console.log('   Max: ' + maxUsage + ', Min: ' + minUsage + ', Diff: ' + diff);
}

/* ═══════════════════════════════════════════════════════════════
   🚀 MAIN
═══════════════════════════════════════════════════════════════ */
(async function(){
  const startTime = Date.now();
  
  console.log('╔' + '═'.repeat(63) + '╗');
  console.log('║' + ' '.repeat(15) + '🎬 CINEVAULT SYNC ENGINE' + ' '.repeat(24) + '║');
  console.log('║' + ' '.repeat(15) + '   v3.1 — Full Logging   ' + ' '.repeat(24) + '║');
  console.log('╚' + '═'.repeat(63) + '╝');
  console.log('');
  console.log('⏰ Started:    ' + new Date().toISOString());
  console.log('🔑 TMDB Keys:  ' + KEYS.length + ' loaded');
  console.log('📁 Working:    ' + __dirname);
  console.log('');
  
  if (!KEYS.length) {
    console.error('❌ FATAL: No TMDB keys provided!');
    console.error('   Set TMDB_KEYS env variable with comma-separated keys');
    process.exit(1);
  }

  try {
    // Step 1: Categories
    const movieIds = await syncCategories();
    
    // Step 2: Movie Details
    await syncMovieDetails(movieIds);
    
    // Step 3: Size Management
    const sizeResult = checkAndCleanup();
    
    // Save meta
    const metaPath = path.join(__dirname, '..', 'cache', '_meta.json');
    const moviesDir = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');
    const categoriesDir = path.join(__dirname, '..', 'cache', 'tmdb', 'categories');
    
    saveJSON(metaPath, {
      updated: new Date().toISOString(),
      version: '3.1',
      categories: CATEGORIES.length,
      total_movies: fs.existsSync(moviesDir) ? fs.readdirSync(moviesDir).length : 0,
      movies_size_mb: (sizeResult.size / 1024 / 1024).toFixed(2),
      keys_used: Object.keys(keyStats.usage).length,
      keys_total: KEYS.length,
      total_api_calls: Object.values(keyStats.usage).reduce(function(a, b){ return a + b; }, 0)
    });
    
    // Final Report
    printKeyReport();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n' + '═'.repeat(65));
    console.log('🎉 SYNC COMPLETE!');
    console.log('═'.repeat(65));
    console.log('⏱️  Duration:      ' + duration + ' seconds');
    console.log('📦 Cache size:    ' + (sizeResult.size / 1024 / 1024).toFixed(2) + ' MB');
    console.log('🗑️  Files deleted: ' + sizeResult.deleted);
    console.log('📊 Categories:    ' + CATEGORIES.length);
    console.log('');
    
  } catch(err) {
    console.error('\n❌ FATAL ERROR:');
    console.error(err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
