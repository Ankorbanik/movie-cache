/* ═══════════════════════════════════════════════════════════════
   sync-all.js — v7.0 COMPREHENSIVE MULTI-SOURCE
   Sources: TMDB (Movies/TV) + AniList (Anime) + TVmaze (TV Schedule)
   Keeps all previous features: 50+ Categories, Key Rotation, Logs
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
   📋 50+ TMDB CATEGORIES (Unchanged)
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
   🌐 API FETCH (TMDB & AniList)
═══════════════════════════════════════════════════════════════ */
async function fetchAPI(url, maxAttempts) {
  maxAttempts = maxAttempts || 4;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { await new Promise(r => setTimeout(r, 1500 * (i + 1))); continue; }
      if (res.status >= 500) { await new Promise(r => setTimeout(r, 1000)); continue; }
      if (res.status === 401 || res.status === 403) return { __error: res.status };
      if (!res.ok) return null;
      return await res.json();
    } catch(e) { await new Promise(r => setTimeout(r, 1000)); }
  }
  return null;
}

async function fetchAniList(query, variables) {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    return await res.json();
  } catch(e) { return null; }
}

function saveJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data));
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 1: FETCH ALL TMDB CATEGORIES
═══════════════════════════════════════════════════════════════ */
async function syncCategories() {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 1: Fetching ' + CATEGORIES.length + ' TMDB categories');
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
    
    const clean = data.results.filter(r => r.poster_path);
    saveJSON(path.join(dir, cat.name + '.json'), {
      results: clean, type: cat.type, updated: new Date().toISOString()
    });
    console.log('   ✅ Saved ' + clean.length + ' items');
    success++;

    clean.forEach(item => {
      let t = item.media_type || (cat.type === 'movie' ? 'movie' : (cat.type === 'tv' ? 'tv' : null));
      if (t === 'movie' && item.id) movieIds.add(item.id);
      else if (t === 'tv' && item.id) tvIds.add(item.id);
    });

    await new Promise(r => setTimeout(r, 250));
  }
  
  console.log('\n📊 TMDB List Cache Summary:');
  console.log('   ✅ Success: ' + success + '/' + CATEGORIES.length);
  console.log('   ❌ Failed:  ' + failed + '/' + CATEGORIES.length);
  console.log('   🎬 Movie IDs: ' + movieIds.size);
  console.log('   📺 TV IDs:    ' + tvIds.size);
  
  return { movieIds, tvIds };
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 2: FETCH TMDB DETAILS (Movie & TV)
═══════════════════════════════════════════════════════════════ */
async function syncMovieDetails(movieIds) {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 2A: Movie Details (up to ' + MOVIES_PER_SYNC + ')');
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');
  fs.mkdirSync(dir, { recursive: true });

  const ids = Array.from(movieIds).slice(0, MOVIES_PER_SYNC);
  let added = 0, skipped = 0, failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const filePath = path.join(dir, id + '.json');
    if (fs.existsSync(filePath)) { skipped++; continue; }

    console.log('[' + (i + 1) + '/' + ids.length + '] 🎬 Movie ' + id);
    const url = BASE + '/movie/' + id + '?api_key=' + nextKey() + '&append_to_response=credits,external_ids,watch/providers,similar,videos';
    const data = await fetchAPI(url);
    
    if (!data || data.__error || data.success === false) { failed++; continue; }
    saveJSON(filePath, data);
    console.log('   ✅ ' + (data.title || 'Unknown'));
    added++;
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('\n📊 Movie Item Cache: Added ' + added + ', Cached ' + skipped + ', Failed ' + failed);
  return added;
}

async function syncTVDetails(tvIds) {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 2B: TV Details (up to ' + TV_PER_SYNC + ')');
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'tv');
  fs.mkdirSync(dir, { recursive: true });

  const ids = Array.from(tvIds).slice(0, TV_PER_SYNC);
  let added = 0, skipped = 0, failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const filePath = path.join(dir, id + '.json');
    if (fs.existsSync(filePath)) { skipped++; continue; }

    console.log('[' + (i + 1) + '/' + ids.length + '] 📺 TV ' + id);
    const url = BASE + '/tv/' + id + '?api_key=' + nextKey() + '&append_to_response=credits,external_ids,watch/providers,similar,videos';
    const data = await fetchAPI(url);
    
    if (!data || data.__error || data.success === false) { failed++; continue; }
    saveJSON(filePath, data);
    console.log('   ✅ ' + (data.name || 'Unknown'));
    added++;
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('\n📊 TV Item Cache: Added ' + added + ', Cached ' + skipped + ', Failed ' + failed);
  return added;
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 3: SYNC ANILIST (Anime - No Key Needed)
═══════════════════════════════════════════════════════════════ */
async function syncAniList() {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 3: Syncing AniList (Anime)');
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'anilist', 'categories');
  fs.mkdirSync(dir, { recursive: true });

  const animeCategories = [
    { name: 'trending-anime', sort: 'TRENDING_DESC', type: 'ANIME' },
    { name: 'popular-anime', sort: 'POPULARITY_DESC', type: 'ANIME' },
    { name: 'top-anime', sort: 'SCORE_DESC', type: 'ANIME' },
    { name: 'anime-movies', sort: 'POPULARITY_DESC', type: 'ANIME', format: 'MOVIE' }
  ];

  const query = `query($page:Int,$perPage:Int,$sort:[MediaSort],$type:MediaType,$format:MediaFormat){Page(page:$page,perPage:$perPage){media(sort:$sort,type:$type,format:$format,isAdult:false){id title{romaji english native}coverImage{large extraLarge}bannerImage averageScore popularity startDate{year}format genres description episodes duration status studios{edges{node{name}}}}}}`;

  for (const cat of animeCategories) {
    const variables = { page: 1, perPage: 30, sort: [cat.sort], type: cat.type };
    if (cat.format) variables.format = cat.format;

    const data = await fetchAniList(query, variables);
    if (data && data.data && data.data.Page && data.data.Page.media) {
      const clean = data.data.Page.media;
      saveJSON(path.join(dir, cat.name + '.json'), {
        results: clean, type: 'anime', source: 'anilist', updated: new Date().toISOString()
      });
      console.log('   ✅ AniList: ' + cat.name + ' (' + clean.length + ' items)');
    } else {
      console.log('   ❌ AniList Failed: ' + cat.name);
    }
    await new Promise(r => setTimeout(r, 1000)); // Respect AniList rate limit
  }
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 4: SYNC TVMAZE (TV Schedule - No Key Needed)
═══════════════════════════════════════════════════════════════ */
async function syncTVmaze() {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 4: Syncing TVmaze (Daily Schedule)');
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'tvmaze', 'categories');
  fs.mkdirSync(dir, { recursive: true });

  try {
    const res = await fetch('https://api.tvmaze.com/schedule');
    if (res.ok) {
      const schedule = await res.json();
      const cleanSchedule = schedule.map(item => ({
        id: item.id,
        show_id: item.show.id,
        show_name: item.show.name,
        show_image: item.show.image ? item.show.image.medium : null,
        season: item.season,
        episode: item.number,
        episode_name: item.name,
        airdate: item.airdate,
        airtime: item.airtime,
        summary: item.summary ? item.summary.replace(/<[^>]+>/g, '') : null
      }));
      saveJSON(path.join(dir, 'daily-schedule.json'), {
        results: cleanSchedule, type: 'schedule', source: 'tvmaze', updated: new Date().toISOString()
      });
      console.log('   ✅ TVmaze: daily-schedule (' + cleanSchedule.length + ' items)');
    }
  } catch (e) {
    console.log('   ❌ TVmaze Failed: ' + e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ☁️ STEP 5: PUSH TO CLOUDFLARE WORKER (Optional)
═══════════════════════════════════════════════════════════════ */
async function pushToWorker() {
  if (!WORKER_URL) {
    console.log('\n☁️  Cloudflare Worker: NOT configured (skipping)');
    return;
  }
  
  console.log('\n' + '═'.repeat(65));
  console.log('☁️  STEP 5: Pushing to Cloudflare Worker');
  console.log('═'.repeat(65));
  
  try {
    const metaPath = path.join(__dirname, '..', 'cache', '_meta.json');
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
    
    const res = await fetch(WORKER_URL + '/sync-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + WORKER_SECRET },
      body: JSON.stringify({ event: 'sync-complete', meta: meta, timestamp: new Date().toISOString() })
    });
    
    if (res.ok) console.log('✅ Worker notified successfully');
  } catch(e) {
    console.log('⚠️  Worker notify failed: ' + e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   📊 KEY REPORT
═══════════════════════════════════════════════════════════════ */
function printKeyReport() {
  console.log('\n' + '═'.repeat(65));
  console.log('🔑 TMDB KEY ROTATION REPORT');
  console.log('═'.repeat(65));
  if (!KEYS.length) return;
  
  const totalUsage = Object.values(keyStats.usage).reduce((a, b) => a + b, 0);
  console.log('📊 Total API calls: ' + totalUsage);
  console.log('🔑 Total keys:      ' + KEYS.length);
  console.log('📈 Average/key:     ' + (totalUsage / KEYS.length).toFixed(1));
  console.log('');
  
  KEYS.forEach((key, idx) => {
    const usage = keyStats.usage[key] || 0;
    const fails = keyStats.failures[key] || 0;
    const bar = '█'.repeat(Math.min(usage, 30));
    let status = usage === 0 ? '💤' : (fails > 0 ? '⚠️ ' : '✅');
    console.log(status + ' #' + String(idx + 1).padStart(2, '0') + ' ' + maskKey(key) + ' → ' + String(usage).padStart(3) + ' calls ' + bar);
  });
  
  const usages = KEYS.map(k => keyStats.usage[k] || 0);
  const diff = Math.max(...usages) - Math.min(...usages);
  if (diff <= 2) console.log('\n✅ ROTATION PERFECT');
  else if (diff <= 5) console.log('\n✅ ROTATION GOOD');
  else console.log('\n⚠️  ROTATION UNEVEN');
}

/* ═══════════════════════════════════════════════════════════════
   🚀 MAIN EXECUTION
═══════════════════════════════════════════════════════════════ */
(async function(){
  const startTime = Date.now();
  
  console.log('╔' + '═'.repeat(63) + '╗');
  console.log('║' + ' '.repeat(10) + '🎬 CINEVAULT MULTI-SOURCE SYNC v7.0' + ' '.repeat(18) + '║');
  console.log('║' + ' '.repeat(8) + 'TMDB • AniList • TVmaze • Future Ready' + ' '.repeat(15) + '║');
  console.log('╚' + '═'.repeat(63) + '╝');
  
  if (!KEYS.length) {
    console.error('❌ No TMDB keys!');
    process.exit(1);
  }

  try {
    // ১. TMDB ডাটা সিঙ্ক (ক্যাটাগরি + ডিটেইলস)
    const { movieIds, tvIds } = await syncCategories();
    const movieAdded = await syncMovieDetails(movieIds);
    const tvAdded = await syncTVDetails(tvIds);
    
    // ২. AniList ডাটা সিঙ্ক
    await syncAniList();
    
    // ৩. TVmaze ডাটা সিঙ্ক
    await syncTVmaze();

    // ৪. মেটা ডাটা সেভ
    const metaPath = path.join(__dirname, '..', 'cache', '_meta.json');
    saveJSON(metaPath, {
      updated: new Date().toISOString(),
      version: '7.0',
      sources: ['tmdb', 'anilist', 'tvmaze'],
      tmdb_categories: CATEGORIES.length,
      movies_added_this_sync: movieAdded,
      tv_added_this_sync: tvAdded,
      total_api_calls: Object.values(keyStats.usage).reduce((a, b) => a + b, 0)
    });
    
    await pushToWorker();
    printKeyReport();
    
    console.log('\n🎉 ALL SOURCES SYNC COMPLETE in ' + ((Date.now() - startTime) / 1000).toFixed(1) + 's');
    
  } catch(err) {
    console.error('\n❌ FATAL: ' + err.message);
    process.exit(1);
  }
})();
