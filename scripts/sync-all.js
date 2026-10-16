/* ═══════════════════════════════════════════════════════════════
   sync-all.js — v4.0 COMPREHENSIVE
   All content: Movies + TV + Anime + Drama + Web Series
   All languages + countries + genres
   90 MB limit, Cloudflare Worker ready
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════════════════════════
   🔑 KEY MANAGEMENT
═══════════════════════════════════════════════════════════════ */
const KEYS = (process.env.TMDB_KEYS || '')
  .split(',').map(function(k){ return k.trim(); }).filter(Boolean);

const BASE = 'https://api.themoviedb.org/3';
const MOVIES_PER_SYNC = 150;
const TV_PER_SYNC = 150;

/* ── Cloudflare Worker (optional — future) ── */
const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || '';
const WORKER_SECRET = process.env.WORKER_SECRET || '';

const keyStats = { usage: {}, failures: {} };

function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

let keyIdx = 0;
function nextKey() {
  if (!KEYS.length) return '';
  const idx = keyIdx % KEYS.length;
  const key = KEYS[idx];
  keyIdx++;
  keyStats.usage[key] = (keyStats.usage[key] || 0) + 1;
  console.log('🔑 [ROTATION] Key #' + (idx + 1) + '/' + KEYS.length + 
              ' → ' + maskKey(key) + ' (used ' + keyStats.usage[key] + 'x)');
  return key;
}

function logKeyFailure(key, status) {
  keyStats.failures[key] = (keyStats.failures[key] || 0) + 1;
  console.log('   ⚠️  [FAIL] ' + maskKey(key) + ' → HTTP ' + status);
}

/* ═══════════════════════════════════════════════════════════════
   📋 50+ CATEGORIES — All types, languages, countries
═══════════════════════════════════════════════════════════════ */
const CATEGORIES = [
  /* ── TRENDING (Mixed) ── */
  { name: 'trending-all',      url: '/trending/all/week',   type: 'mixed', icon: '🔥' },
  { name: 'trending-movies',   url: '/trending/movie/week', type: 'movie', icon: '🎬' },
  { name: 'trending-tv',       url: '/trending/tv/week',    type: 'tv',    icon: '📺' },
  { name: 'trending-day',      url: '/trending/all/day',    type: 'mixed', icon: '⚡' },

  /* ── MOVIES — Main lists ── */
  { name: 'popular-movies',    url: '/movie/popular',        type: 'movie', icon: '⭐' },
  { name: 'top-rated-movies',  url: '/movie/top_rated',      type: 'movie', icon: '🏆' },
  { name: 'upcoming-movies',   url: '/movie/upcoming',       type: 'movie', icon: '📅' },
  { name: 'now-playing-movies',url: '/movie/now_playing',    type: 'movie', icon: '🎥' },

  /* ── TV — Main lists ── */
  { name: 'popular-tv',        url: '/tv/popular',           type: 'tv',    icon: '⭐' },
  { name: 'top-rated-tv',      url: '/tv/top_rated',         type: 'tv',    icon: '🏆' },
  { name: 'airing-today',      url: '/tv/airing_today',      type: 'tv',    icon: '📡' },
  { name: 'on-the-air',        url: '/tv/on_the_air',        type: 'tv',    icon: '📻' },

  /* ── STREAMING PLATFORMS ── */
  { name: 'netflix',           url: '/discover/tv?with_networks=213',        type: 'tv', icon: '🎯' },
  { name: 'prime-video',       url: '/discover/tv?with_networks=1024',       type: 'tv', icon: '📦' },
  { name: 'disney-plus',       url: '/discover/tv?with_networks=2739',       type: 'tv', icon: '🏰' },
  { name: 'apple-tv-plus',     url: '/discover/tv?with_networks=2552',       type: 'tv', icon: '🍎' },
  { name: 'hbo',               url: '/discover/tv?with_networks=49',         type: 'tv', icon: '📺' },
  { name: 'hulu',              url: '/discover/tv?with_networks=453',        type: 'tv', icon: '🟢' },

  /* ── ANIME ── */
  { name: 'anime-trending',    url: '/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc', type: 'tv', icon: '🎌' },
  { name: 'anime-top-rated',   url: '/discover/tv?with_genres=16&with_original_language=ja&sort_by=vote_average.desc&vote_count.gte=500', type: 'tv', icon: '🌸' },
  { name: 'anime-movies',      url: '/discover/movie?with_genres=16&with_original_language=ja&sort_by=popularity.desc', type: 'movie', icon: '🎨' },
  { name: 'anime-airing',      url: '/discover/tv?with_genres=16&with_original_language=ja&air_date.gte=' + new Date().toISOString().split('T')[0], type: 'tv', icon: '📅' },

  /* ── ANIMATION (General) ── */
  { name: 'animation-movies',  url: '/discover/movie?with_genres=16&sort_by=popularity.desc', type: 'movie', icon: '🎭' },
  { name: 'animation-tv',      url: '/discover/tv?with_genres=16&sort_by=popularity.desc',    type: 'tv',    icon: '🎪' },

  /* ── INDIAN LANGUAGES ── */
  { name: 'hindi-movies',      url: '/discover/movie?with_original_language=hi&sort_by=popularity.desc', type: 'movie', icon: '🇮🇳' },
  { name: 'hindi-tv',          url: '/discover/tv?with_original_language=hi&sort_by=popularity.desc',    type: 'tv',    icon: '📺' },
  { name: 'bengali-movies',    url: '/discover/movie?with_original_language=bn&sort_by=popularity.desc', type: 'movie', icon: '🇧🇩' },
  { name: 'tamil-movies',      url: '/discover/movie?with_original_language=ta&sort_by=popularity.desc', type: 'movie', icon: '🎬' },
  { name: 'telugu-movies',     url: '/discover/movie?with_original_language=te&sort_by=popularity.desc', type: 'movie', icon: '🎬' },
  { name: 'kannada-movies',    url: '/discover/movie?with_original_language=kn&sort_by=popularity.desc', type: 'movie', icon: '🎬' },
  { name: 'malayalam-movies',  url: '/discover/movie?with_original_language=ml&sort_by=popularity.desc', type: 'movie', icon: '🎬' },
  { name: 'marathi-movies',    url: '/discover/movie?with_original_language=mr&sort_by=popularity.desc', type: 'movie', icon: '🎬' },
  { name: 'punjabi-movies',    url: '/discover/movie?with_original_language=pa&sort_by=popularity.desc', type: 'movie', icon: '🎬' },
  { name: 'urdu-movies',       url: '/discover/movie?with_original_language=ur&sort_by=popularity.desc', type: 'movie', icon: '🎬' },

  /* ── ASIAN DRAMAS ── */
  { name: 'korean-drama',      url: '/discover/tv?with_original_language=ko&sort_by=popularity.desc', type: 'tv', icon: '🇰🇷' },
  { name: 'korean-movies',     url: '/discover/movie?with_original_language=ko&sort_by=popularity.desc', type: 'movie', icon: '🎬' },
  { name: 'chinese-drama',     url: '/discover/tv?with_original_language=zh&sort_by=popularity.desc', type: 'tv', icon: '🇨🇳' },
  { name: 'japanese-drama',    url: '/discover/tv?with_original_language=ja&sort_by=popularity.desc&without_genres=16', type: 'tv', icon: '🇯🇵' },
  { name: 'japanese-movies',   url: '/discover/movie?with_original_language=ja&sort_by=popularity.desc&without_genres=16', type: 'movie', icon: '🎬' },
  { name: 'thai-drama',        url: '/discover/tv?with_original_language=th&sort_by=popularity.desc', type: 'tv', icon: '🇹🇭' },
  { name: 'turkish-drama',     url: '/discover/tv?with_original_language=tr&sort_by=popularity.desc', type: 'tv', icon: '🇹🇷' },
  { name: 'filipino-drama',    url: '/discover/tv?with_original_language=tl&sort_by=popularity.desc', type: 'tv', icon: '🇵🇭' },

  /* ── EUROPEAN / AMERICAN ── */
  { name: 'spanish-movies',    url: '/discover/movie?with_original_language=es&sort_by=popularity.desc', type: 'movie', icon: '🇪🇸' },
  { name: 'french-movies',     url: '/discover/movie?with_original_language=fr&sort_by=popularity.desc', type: 'movie', icon: '🇫🇷' },
  { name: 'german-movies',     url: '/discover/movie?with_original_language=de&sort_by=popularity.desc', type: 'movie', icon: '🇩🇪' },
  { name: 'italian-movies',    url: '/discover/movie?with_original_language=it&sort_by=popularity.desc', type: 'movie', icon: '🇮🇹' },
  { name: 'russian-movies',    url: '/discover/movie?with_original_language=ru&sort_by=popularity.desc', type: 'movie', icon: '🇷🇺' },

  /* ── GENRES (Movies) ── */
  { name: 'action-movies',     url: '/discover/movie?with_genres=28&sort_by=popularity.desc',     type: 'movie', icon: '💥' },
  { name: 'comedy-movies',     url: '/discover/movie?with_genres=35&sort_by=popularity.desc',     type: 'movie', icon: '😂' },
  { name: 'horror-movies',     url: '/discover/movie?with_genres=27&sort_by=popularity.desc',     type: 'movie', icon: '👻' },
  { name: 'scifi-movies',      url: '/discover/movie?with_genres=878&sort_by=popularity.desc',    type: 'movie', icon: '🚀' },
  { name: 'romance-movies',    url: '/discover/movie?with_genres=10749&sort_by=popularity.desc',  type: 'movie', icon: '💕' },
  { name: 'thriller-movies',   url: '/discover/movie?with_genres=53&sort_by=popularity.desc',     type: 'movie', icon: '🔪' },
  { name: 'documentary',       url: '/discover/movie?with_genres=99&sort_by=popularity.desc',     type: 'movie', icon: '📖' },
  { name: 'family-movies',     url: '/discover/movie?with_genres=10751&sort_by=popularity.desc',  type: 'movie', icon: '👨‍👩‍👧' },
  { name: 'mystery-movies',    url: '/discover/movie?with_genres=9648&sort_by=popularity.desc',   type: 'movie', icon: '🕵️' },
  { name: 'fantasy-movies',    url: '/discover/movie?with_genres=14&sort_by=popularity.desc',     type: 'movie', icon: '🧙' },
  { name: 'crime-movies',      url: '/discover/movie?with_genres=80&sort_by=popularity.desc',     type: 'movie', icon: '🚔' },
  { name: 'adventure-movies',  url: '/discover/movie?with_genres=12&sort_by=popularity.desc',     type: 'movie', icon: '🗺️' },
  { name: 'war-movies',        url: '/discover/movie?with_genres=10752&sort_by=popularity.desc',  type: 'movie', icon: '⚔️' },
  { name: 'history-movies',    url: '/discover/movie?with_genres=36&sort_by=popularity.desc',     type: 'movie', icon: '📜' },
  { name: 'western-movies',    url: '/discover/movie?with_genres=37&sort_by=popularity.desc',     type: 'movie', icon: '🤠' },

  /* ── GENRES (TV) ── */
  { name: 'action-tv',         url: '/discover/tv?with_genres=10759&sort_by=popularity.desc',     type: 'tv', icon: '💥' },
  { name: 'comedy-tv',         url: '/discover/tv?with_genres=35&sort_by=popularity.desc',        type: 'tv', icon: '😂' },
  { name: 'drama-tv',          url: '/discover/tv?with_genres=18&sort_by=popularity.desc',        type: 'tv', icon: '🎭' },
  { name: 'crime-tv',          url: '/discover/tv?with_genres=80&sort_by=popularity.desc',        type: 'tv', icon: '🚔' },
  { name: 'mystery-tv',        url: '/discover/tv?with_genres=9648&sort_by=popularity.desc',      type: 'tv', icon: '🕵️' },
  { name: 'scifi-tv',          url: '/discover/tv?with_genres=10765&sort_by=popularity.desc',     type: 'tv', icon: '🚀' },
  { name: 'documentary-tv',    url: '/discover/tv?with_genres=99&sort_by=popularity.desc',        type: 'tv', icon: '📖' },
  { name: 'family-tv',         url: '/discover/tv?with_genres=10751&sort_by=popularity.desc',     type: 'tv', icon: '👨‍👩‍👧' },

  /* ── STUDIOS / COMPANIES ── */
  { name: 'marvel',            url: '/discover/movie?with_companies=420&sort_by=popularity.desc',   type: 'movie', icon: '🦸' },
  { name: 'marvel-tv',         url: '/discover/tv?with_companies=420&sort_by=popularity.desc',      type: 'tv',    icon: '🦸' },
  { name: 'dc',                url: '/discover/movie?with_companies=9993&sort_by=popularity.desc',  type: 'movie', icon: '🦇' },
  { name: 'dc-tv',             url: '/discover/tv?with_companies=9993&sort_by=popularity.desc',     type: 'tv',    icon: '🦇' },
  { name: 'pixar',             url: '/discover/movie?with_companies=3&sort_by=popularity.desc',     type: 'movie', icon: '🎈' },
  { name: 'disney',            url: '/discover/movie?with_companies=2&sort_by=popularity.desc',     type: 'movie', icon: '🏰' },
  { name: 'ghibli',            url: '/discover/movie?with_companies=10342&sort_by=popularity.desc', type: 'movie', icon: '🌿' },
  { name: 'a24',               url: '/discover/movie?with_companies=41077&sort_by=popularity.desc', type: 'movie', icon: '🎞️' },
  { name: 'warner-bros',       url: '/discover/movie?with_companies=174&sort_by=popularity.desc',   type: 'movie', icon: '🎬' },
  { name: 'universal',         url: '/discover/movie?with_companies=33&sort_by=popularity.desc',    type: 'movie', icon: '🌍' },
  { name: 'paramount',         url: '/discover/movie?with_companies=4&sort_by=popularity.desc',     type: 'movie', icon: '⛰️' },
  { name: 'sony',              url: '/discover/movie?with_companies=5&sort_by=popularity.desc',     type: 'movie', icon: '🎮' },
  { name: 'lionsgate',         url: '/discover/movie?with_companies=1632&sort_by=popularity.desc',  type: 'movie', icon: '🦁' },
];

/* ═══════════════════════════════════════════════════════════════
   🌐 API FETCH
═══════════════════════════════════════════════════════════════ */
async function fetchAPI(url, maxAttempts) {
  maxAttempts = maxAttempts || 4;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await new Promise(function(r){ setTimeout(r, 1500 * (i + 1)); });
        continue;
      }
      if (res.status >= 500) {
        await new Promise(function(r){ setTimeout(r, 1000); });
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        return { __error: res.status };
      }
      if (!res.ok) return null;
      return await res.json();
    } catch(e) {
      await new Promise(function(r){ setTimeout(r, 1000); });
    }
  }
  return null;
}

function saveJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data));
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 1: FETCH ALL CATEGORIES
═══════════════════════════════════════════════════════════════ */
async function syncCategories() {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 1: Fetching ' + CATEGORIES.length + ' categories');
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'categories');
  fs.mkdirSync(dir, { recursive: true });

  const movieIds = new Set();
  const tvIds = new Set();
  let success = 0, failed = 0;

  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const progress = '[' + (i + 1) + '/' + CATEGORIES.length + ']';
    console.log('\n' + progress + ' ' + cat.icon + ' ' + cat.name.toUpperCase());
    
    const sep = cat.url.indexOf('?') > -1 ? '&' : '?';
    const key = nextKey();
    const url = BASE + cat.url + sep + 'api_key=' + key + '&page=1';
    
    const data = await fetchAPI(url);
    
    if (!data || !data.results) {
      if (data && data.__error) logKeyFailure(key, data.__error);
      console.log('   ❌ Failed');
      failed++;
      continue;
    }
    
    const clean = data.results.filter(function(r){ return r.poster_path; });
    saveJSON(path.join(dir, cat.name + '.json'), {
      results: clean,
      type: cat.type,
      updated: new Date().toISOString()
    });
    console.log('   ✅ Saved ' + clean.length + ' items');
    success++;

    /* Collect IDs by type */
    clean.forEach(function(item){
      let t = item.media_type;
      if (!t) t = cat.type === 'movie' ? 'movie' : (cat.type === 'tv' ? 'tv' : null);
      if (t === 'movie' && item.id) movieIds.add(item.id);
      else if (t === 'tv' && item.id) tvIds.add(item.id);
    });

    await new Promise(function(r){ setTimeout(r, 250); });
  }
  
  console.log('\n📊 List Cache Summary:');
  console.log('   ✅ Success: ' + success + '/' + CATEGORIES.length);
  console.log('   ❌ Failed:  ' + failed + '/' + CATEGORIES.length);
  console.log('   🎬 Movie IDs: ' + movieIds.size);
  console.log('   📺 TV IDs:    ' + tvIds.size);
  
  return { movieIds, tvIds };
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 2A: FETCH MOVIE DETAILS
═══════════════════════════════════════════════════════════════ */
async function syncMovieDetails(movieIds) {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 2A: Movie Details (up to ' + MOVIES_PER_SYNC + ')');
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');
  fs.mkdirSync(dir, { recursive: true });

  const ids = Array.from(movieIds).slice(0, MOVIES_PER_SYNC);
  console.log('📋 Processing ' + ids.length + ' movies...\n');
  
  let added = 0, skipped = 0, failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const progress = '[' + (i + 1) + '/' + ids.length + ']';
    const filePath = path.join(dir, id + '.json');
    
    if (fs.existsSync(filePath)) {
      skipped++;
      continue;
    }

    console.log(progress + ' 🎬 Movie ' + id);
    const key = nextKey();
    const url = BASE + '/movie/' + id + '?api_key=' + key + 
                '&append_to_response=credits,external_ids,watch/providers,similar,videos';
    
    const data = await fetchAPI(url);
    
    if (!data || data.__error || data.success === false) {
      if (data && data.__error) logKeyFailure(key, data.__error);
      console.log('   ❌ Failed');
      failed++;
      continue;
    }

    saveJSON(filePath, data);
    console.log('   ✅ ' + (data.title || 'Unknown'));
    added++;
    await new Promise(function(r){ setTimeout(r, 200); });
  }

  console.log('\n📊 Movie Item Cache:');
  console.log('   ✅ Added:   ' + added);
  console.log('   ⏭️  Cached:  ' + skipped);
  console.log('   ❌ Failed:  ' + failed);
  
  return added;
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 2B: FETCH TV DETAILS
═══════════════════════════════════════════════════════════════ */
async function syncTVDetails(tvIds) {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 2B: TV Details (up to ' + TV_PER_SYNC + ')');
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'tv');
  fs.mkdirSync(dir, { recursive: true });

  const ids = Array.from(tvIds).slice(0, TV_PER_SYNC);
  console.log('📋 Processing ' + ids.length + ' TV shows...\n');
  
  let added = 0, skipped = 0, failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const progress = '[' + (i + 1) + '/' + ids.length + ']';
    const filePath = path.join(dir, id + '.json');
    
    if (fs.existsSync(filePath)) {
      skipped++;
      continue;
    }

    console.log(progress + ' 📺 TV ' + id);
    const key = nextKey();
    const url = BASE + '/tv/' + id + '?api_key=' + key + 
                '&append_to_response=credits,external_ids,watch/providers,similar,videos';
    
    const data = await fetchAPI(url);
    
    if (!data || data.__error || data.success === false) {
      if (data && data.__error) logKeyFailure(key, data.__error);
      console.log('   ❌ Failed');
      failed++;
      continue;
    }

    saveJSON(filePath, data);
    console.log('   ✅ ' + (data.name || 'Unknown'));
    added++;
    await new Promise(function(r){ setTimeout(r, 200); });
  }

  console.log('\n📊 TV Item Cache:');
  console.log('   ✅ Added:   ' + added);
  console.log('   ⏭️  Cached:  ' + skipped);
  console.log('   ❌ Failed:  ' + failed);
  
  return added;
}

/* ═══════════════════════════════════════════════════════════════
   🗑️ STEP 3: SIZE CHECK
═══════════════════════════════════════════════════════════════ */
function checkAndCleanup() {
  console.log('\n' + '═'.repeat(65));
  console.log('📦 STEP 3: Size Check (90 MB limit)');
  console.log('═'.repeat(65));
  
  const MAX_SIZE = 90 * 1024 * 1024;
  const DELETE_CHUNK = 10 * 1024 * 1024;
  const dirs = [
    { path: path.join(__dirname, '..', 'cache', 'tmdb', 'movies'), label: 'Movies' },
    { path: path.join(__dirname, '..', 'cache', 'tmdb', 'tv'), label: 'TV' }
  ];

  let totalSize = 0;
  let totalDeleted = 0;

  dirs.forEach(function(d){
    if (!fs.existsSync(d.path)) return;
    
    function getSize() {
      let total = 0;
      fs.readdirSync(d.path).forEach(function(f){
        try {
          const stat = fs.statSync(path.join(d.path, f));
          if (stat.isFile()) total += stat.size;
        } catch(e){}
      });
      return total;
    }

    const size = getSize();
    totalSize += size;
    const sizeMB = (size / 1024 / 1024).toFixed(2);
    console.log('\n📂 ' + d.label + ': ' + sizeMB + ' MB');

    if (size < MAX_SIZE) {
      console.log('   ✅ Under limit');
      return;
    }

    console.log('   ⚠️  OVER! Deleting oldest ' + (DELETE_CHUNK/1024/1024) + ' MB...');
    
    const files = fs.readdirSync(d.path)
      .filter(function(f){ return f.endsWith('.json'); })
      .map(function(f){
        const full = path.join(d.path, f);
        const stat = fs.statSync(full);
        return { path: full, size: stat.size, mtime: stat.mtimeMs };
      })
      .sort(function(a, b){ return a.mtime - b.mtime; });

    let deleted = 0, count = 0;
    for (const file of files) {
      if (deleted >= DELETE_CHUNK) break;
      try {
        fs.unlinkSync(file.path);
        deleted += file.size;
        count++;
      } catch(e){}
    }
    totalDeleted += count;
    console.log('   🗑️  Deleted ' + count + ' files (' + (deleted/1024/1024).toFixed(2) + ' MB)');
  });

  console.log('\n📊 Total size: ' + (totalSize / 1024 / 1024).toFixed(2) + ' MB');
  console.log('🗑️  Total deleted: ' + totalDeleted + ' files');
  
  return { size: totalSize, deleted: totalDeleted };
}

/* ═══════════════════════════════════════════════════════════════
   ☁️ STEP 4: PUSH TO CLOUDFLARE WORKER (Optional)
═══════════════════════════════════════════════════════════════ */
async function pushToWorker() {
  if (!WORKER_URL) {
    console.log('\n☁️  Cloudflare Worker: NOT configured (skipping)');
    return;
  }
  
  console.log('\n' + '═'.repeat(65));
  console.log('☁️  STEP 4: Pushing to Cloudflare Worker');
  console.log('═'.repeat(65));
  console.log('URL: ' + WORKER_URL);
  
  try {
    const metaPath = path.join(__dirname, '..', 'cache', '_meta.json');
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
    
    const res = await fetch(WORKER_URL + '/sync-notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + WORKER_SECRET
      },
      body: JSON.stringify({
        event: 'sync-complete',
        meta: meta,
        timestamp: new Date().toISOString()
      })
    });
    
    if (res.ok) {
      console.log('✅ Worker notified successfully');
    } else {
      console.log('⚠️  Worker responded with HTTP ' + res.status);
    }
  } catch(e) {
    console.log('⚠️  Worker notify failed: ' + e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   📊 KEY REPORT
═══════════════════════════════════════════════════════════════ */
function printKeyReport() {
  console.log('\n' + '═'.repeat(65));
  console.log('🔑 KEY ROTATION REPORT');
  console.log('═'.repeat(65));
  
  if (!KEYS.length) return;
  
  const totalUsage = Object.values(keyStats.usage).reduce(function(a, b){ return a + b; }, 0);
  
  console.log('📊 Total API calls: ' + totalUsage);
  console.log('🔑 Total keys:      ' + KEYS.length);
  console.log('📈 Average/key:     ' + (totalUsage / KEYS.length).toFixed(1));
  console.log('');
  
  KEYS.forEach(function(key, idx){
    const usage = keyStats.usage[key] || 0;
    const fails = keyStats.failures[key] || 0;
    const bar = '█'.repeat(Math.min(usage, 30));
    let status = '✅';
    if (fails > 0) status = '⚠️ ';
    if (usage === 0) status = '💤';
    console.log(status + ' #' + String(idx + 1).padStart(2, '0') + ' ' + 
                maskKey(key) + ' → ' + String(usage).padStart(3) + ' calls' +
                (fails > 0 ? ' (' + fails + ' fails)' : '') + ' ' + bar);
  });
  
  const usages = KEYS.map(function(k){ return keyStats.usage[k] || 0; });
  const diff = Math.max.apply(null, usages) - Math.min.apply(null, usages);
  
  console.log('');
  if (diff <= 2) console.log('✅ ROTATION PERFECT');
  else if (diff <= 5) console.log('✅ ROTATION GOOD');
  else console.log('⚠️  ROTATION UNEVEN');
  console.log('   Diff: ' + diff);
}

/* ═══════════════════════════════════════════════════════════════
   🚀 MAIN
═══════════════════════════════════════════════════════════════ */
(async function(){
  const startTime = Date.now();
  
  console.log('╔' + '═'.repeat(63) + '╗');
  console.log('║' + ' '.repeat(12) + '🎬 CINEVAULT SYNC ENGINE v4.0' + ' '.repeat(22) + '║');
  console.log('║' + ' '.repeat(12) + '   All Content • All Languages   ' + ' '.repeat(22) + '║');
  console.log('╚' + '═'.repeat(63) + '╝');
  console.log('⏰ Started: ' + new Date().toISOString());
  console.log('🔑 Keys:    ' + KEYS.length);
  console.log('📚 Categories: ' + CATEGORIES.length);
  console.log('💾 Limit:  90 MB (delete chunks: 10 MB)');
  console.log('☁️  Worker: ' + (WORKER_URL ? 'Connected' : 'Not configured'));
  console.log('');
  
  if (!KEYS.length) {
    console.error('❌ No TMDB keys!');
    process.exit(1);
  }

  try {
    const { movieIds, tvIds } = await syncCategories();
    const movieAdded = await syncMovieDetails(movieIds);
    const tvAdded = await syncTVDetails(tvIds);
    const sizeResult = checkAndCleanup();
    
    /* Meta */
    const metaPath = path.join(__dirname, '..', 'cache', '_meta.json');
    const moviesDir = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');
    const tvDir = path.join(__dirname, '..', 'cache', 'tmdb', 'tv');
    
    saveJSON(metaPath, {
      updated: new Date().toISOString(),
      version: '4.0',
      categories: CATEGORIES.length,
      total_movies: fs.existsSync(moviesDir) ? fs.readdirSync(moviesDir).length : 0,
      total_tv: fs.existsSync(tvDir) ? fs.readdirSync(tvDir).length : 0,
      movies_added_this_sync: movieAdded,
      tv_added_this_sync: tvAdded,
      cache_size_mb: (sizeResult.size / 1024 / 1024).toFixed(2),
      keys_total: KEYS.length,
      total_api_calls: Object.values(keyStats.usage).reduce(function(a, b){ return a + b; }, 0)
    });
    
    await pushToWorker();
    printKeyReport();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n' + '═'.repeat(65));
    console.log('🎉 SYNC COMPLETE!');
    console.log('═'.repeat(65));
    console.log('⏱️  Duration:      ' + duration + 's');
    console.log('🎬 Movies added:  ' + movieAdded);
    console.log('📺 TV added:      ' + tvAdded);
    console.log('📦 Total cache:   ' + (sizeResult.size / 1024 / 1024).toFixed(2) + ' MB');
    console.log('🗑️  Deleted:       ' + sizeResult.deleted + ' files');
    console.log('📊 Categories:    ' + CATEGORIES.length);
    
  } catch(err) {
    console.error('\n❌ FATAL: ' + err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
