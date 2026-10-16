/* ═══════════════════════════════════════════════════════════════
   sync-all.js
   1. Fetch 27 categories from TMDB (List Cache)
   2. Fetch 100 movie details (Item Cache)
   3. Auto-check 50MB limit
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const KEYS = (process.env.TMDB_KEYS || '').split(',').map(function(k){ return k.trim(); }).filter(Boolean);
const BASE = 'https://api.themoviedb.org/3';

const MOVIES_PER_SYNC = 100;

const CATEGORIES = [
  { name: 'trending',    url: '/trending/all/week' },
  { name: 'popular',     url: '/movie/popular' },
  { name: 'top-rated',   url: '/movie/top_rated' },
  { name: 'upcoming',    url: '/movie/upcoming' },
  { name: 'now-playing', url: '/movie/now_playing' },
  { name: 'netflix',     url: '/discover/tv?with_networks=213' },
  { name: 'anime-tv',    url: '/discover/tv?with_genres=16&with_original_language=ja' },
  { name: 'korean',      url: '/discover/tv?with_original_language=ko' },
  { name: 'chinese',     url: '/discover/tv?with_original_language=zh' },
  { name: 'japanese',    url: '/discover/tv?with_original_language=ja' },
  { name: 'hindi',       url: '/discover/movie?with_original_language=hi' },
  { name: 'bengali',     url: '/discover/movie?with_original_language=bn' },
  { name: 'tamil',       url: '/discover/movie?with_original_language=ta' },
  { name: 'telugu',      url: '/discover/movie?with_original_language=te' },
  { name: 'marvel',      url: '/discover/movie?with_companies=420' },
  { name: 'dc',          url: '/discover/movie?with_companies=9993' },
  { name: 'ghibli',      url: '/discover/movie?with_companies=10342' },
  { name: 'a24',         url: '/discover/movie?with_companies=41077' },
  { name: 'pixar',       url: '/discover/movie?with_companies=3' },
  { name: 'disney',      url: '/discover/movie?with_companies=2' },
  { name: 'action',      url: '/discover/movie?with_genres=28' },
  { name: 'comedy',      url: '/discover/movie?with_genres=35' },
  { name: 'horror',      url: '/discover/movie?with_genres=27' },
  { name: 'scifi',       url: '/discover/movie?with_genres=878' },
  { name: 'romance',     url: '/discover/movie?with_genres=10749' },
  { name: 'thriller',    url: '/discover/movie?with_genres=53' },
  { name: 'documentary', url: '/discover/movie?with_genres=99' },
];

let keyIdx = 0;
function nextKey() {
  if (!KEYS.length) return '';
  return KEYS[keyIdx++ % KEYS.length];
}

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

async function syncCategories() {
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'categories');
  fs.mkdirSync(dir, { recursive: true });

  const allMovieIds = new Set();

  for (const cat of CATEGORIES) {
    const sep = cat.url.indexOf('?') > -1 ? '&' : '?';
    const url = BASE + cat.url + sep + 'api_key=' + nextKey() + '&page=1';
    const data = await fetchAPI(url);
    if (!data || !data.results) {
      console.warn('⚠️  ' + cat.name + ': no data');
      continue;
    }
    const clean = data.results.filter(function(r){ return r.poster_path; });
    saveJSON(path.join(dir, cat.name + '.json'), {
      results: clean,
      updated: new Date().toISOString()
    });
    console.log('✅ ' + cat.name + ': ' + clean.length + ' items');

    clean.forEach(function(item){
      if (item.media_type !== 'tv' && item.id) allMovieIds.add(item.id);
    });

    await new Promise(function(r){ setTimeout(r, 250); });
  }
  return allMovieIds;
}

async function syncMovieDetails(movieIds) {
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');
  fs.mkdirSync(dir, { recursive: true });

  const ids = Array.from(movieIds).slice(0, MOVIES_PER_SYNC);
  let added = 0;
  let skipped = 0;

  for (const id of ids) {
    const filePath = path.join(dir, id + '.json');
    if (fs.existsSync(filePath)) {
      skipped++;
      continue;
    }

    const url = BASE + '/movie/' + id + '?api_key=' + nextKey() + '&append_to_response=credits,external_ids,watch/providers';
    const data = await fetchAPI(url);
    if (!data) continue;

    saveJSON(filePath, data);
    added++;
    await new Promise(function(r){ setTimeout(r, 200); });
  }

  console.log('\n📽️  Item Cache: ' + added + ' new added, ' + skipped + ' already cached');
}

function checkAndCleanup() {
  const MOVIES_DIR = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');
  const MAX_SIZE = 50 * 1024 * 1024;
  const DELETE_CHUNK = 5 * 1024 * 1024;

  if (!fs.existsSync(MOVIES_DIR)) return;

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

  const size = getSize();
  console.log('\n📦 Movies cache size: ' + (size/1024/1024).toFixed(2) + ' MB');

  if (size < MAX_SIZE) {
    console.log('✅ Under 50 MB limit');
    return;
  }

  console.log('⚠️  Over 50 MB! Deleting oldest 5 MB...');

  const files = fs.readdirSync(MOVIES_DIR)
    .filter(function(f){ return f.endsWith('.json'); })
    .map(function(f){
      const full = path.join(MOVIES_DIR, f);
      const stat = fs.statSync(full);
      return { path: full, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort(function(a, b){ return a.mtime - b.mtime; });

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

  const newSize = getSize();
  console.log('🗑️  Deleted ' + deletedCount + ' files (' + (deletedSize/1024/1024).toFixed(2) + ' MB)');
  console.log('📦 New size: ' + (newSize/1024/1024).toFixed(2) + ' MB');
}

(async function(){
  if (!KEYS.length) {
    console.error('❌ No TMDB keys provided');
    process.exit(1);
  }

  console.log('🚀 Starting sync...\n');

  const movieIds = await syncCategories();
  console.log('\n📋 Total unique movie IDs: ' + movieIds.size);

  await syncMovieDetails(movieIds);
  checkAndCleanup();

  const metaPath = path.join(__dirname, '..', 'cache', '_meta.json');
  const moviesDir = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');
  saveJSON(metaPath, {
    updated: new Date().toISOString(),
    categories: CATEGORIES.length,
    total_movies: fs.existsSync(moviesDir) ? fs.readdirSync(moviesDir).length : 0
  });

  console.log('\n🎉 Sync complete!');
})();
