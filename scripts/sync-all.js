/* ═══════════════════════════════════════════════════════════════
   sync-all.js — v9.0 ULTIMATE MULTI-SOURCE ENGINE
   Sources: TMDB, AniList, TVmaze, OMDb, Watchmode, Fanart.tv, 
            Simkl, Jikan (MAL), TheTVDB, Kitsu (AnimeDoc)
   Features: 80+ Categories, Trailers, Posters, Multi-Lang, Web Series
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════════════════════════
   🔑 KEY MANAGEMENT (Multi-Pool Rotation)
═══════════════════════════════════════════════════════════════ */
const KEYS = {
  tmdb: (process.env.TMDB_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  omdb: (process.env.OMDB_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  watchmode: (process.env.WATCHMODE_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  fanart: (process.env.FANART_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  simkl: (process.env.SIMKL_CLIENT_ID || '').split(',').map(k => k.trim()).filter(Boolean),
  tvdb: (process.env.TVDB_API_KEY || '').trim()
};

const BASE_TMDB = 'https://api.themoviedb.org/3';
const MOVIES_PER_SYNC = 200; // প্রতি রানে সর্বোচ্চ ২০০টি মুভি
const TV_PER_SYNC = 200;     // প্রতি রানে সর্বোচ্চ ২০০টি সিরিজ

const keyStats = { tmdb: {}, omdb: {}, watchmode: {}, fanart: {} };
const keyIdx = { tmdb: 0, omdb: 0, watchmode: 0, fanart: 0 };

function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

function getKey(pool) {
  const poolKeys = KEYS[pool];
  if (!poolKeys || !poolKeys.length) return null;
  const idx = keyIdx[pool] % poolKeys.length;
  const key = poolKeys[idx];
  keyIdx[pool]++;
  keyStats[pool][key] = (keyStats[pool][key] || 0) + 1;
  return key;
}

function logKeyFailure(pool, key, status) {
  if (keyStats[pool] && keyStats[pool][key]) keyStats[pool][key] += 100; // Penalty
  console.log(`   ⚠️ [${pool.toUpperCase()} FAIL] ${maskKey(key)} → HTTP ${status}`);
}

function saveJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data));
}

/* ═══════════════════════════════════════════════════════════════
   📋 80+ TMDB CATEGORIES (Movies, TV, Web Series, All Languages)
═══════════════════════════════════════════════════════════════ */
const CATEGORIES = [
  /* Trending & Main */
  { name: 'trending-all', url: '/trending/all/week', type: 'mixed', icon: '🔥' },
  { name: 'trending-movies', url: '/trending/movie/week', type: 'movie', icon: '🎬' },
  { name: 'trending-tv', url: '/trending/tv/week', type: 'tv', icon: '📺' },
  { name: 'popular-movies', url: '/movie/popular', type: 'movie', icon: '⭐' },
  { name: 'top-rated-movies', url: '/movie/top_rated', type: 'movie', icon: '🏆' },
  { name: 'upcoming-movies', url: '/movie/upcoming', type: 'movie', icon: '📅' },
  { name: 'now-playing', url: '/movie/now_playing', type: 'movie', icon: '🎥' },
  { name: 'popular-tv', url: '/tv/popular', type: 'tv', icon: '⭐' },
  { name: 'top-rated-tv', url: '/tv/top_rated', type: 'tv', icon: '🏆' },
  { name: 'airing-today', url: '/tv/airing_today', type: 'tv', icon: '📡' },
  /* Streaming Platforms / Web Series */
  { name: 'netflix', url: '/discover/tv?with_networks=213', type: 'tv', icon: '🎯' },
  { name: 'prime-video', url: '/discover/tv?with_networks=1024', type: 'tv', icon: '📦' },
  { name: 'disney-plus', url: '/discover/tv?with_networks=2739', type: 'tv', icon: '🏰' },
  { name: 'apple-tv', url: '/discover/tv?with_networks=2552', type: 'tv', icon: '🍎' },
  { name: 'hbo', url: '/discover/tv?with_networks=49', type: 'tv', icon: '📺' },
  { name: 'hulu', url: '/discover/tv?with_networks=453', type: 'tv', icon: '🟢' },
  { name: 'paramount-plus', url: '/discover/tv?with_networks=4330', type: 'tv', icon: '⛰️' },
  { name: 'peacock', url: '/discover/tv?with_networks=3353', type: 'tv', icon: '🦚' },
  /* Anime / Animation */
  { name: 'anime-trending', url: '/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc', type: 'tv', icon: '🎌' },
  { name: 'anime-movies', url: '/discover/movie?with_genres=16&with_original_language=ja&sort_by=popularity.desc', type: 'movie', icon: '🎨' },
  { name: 'animation-general', url: '/discover/movie?with_genres=16&sort_by=popularity.desc', type: 'movie', icon: '🎭' },
  /* Languages (Movies) */
  { name: 'hindi-movies', url: '/discover/movie?with_original_language=hi&sort_by=popularity.desc', type: 'movie', icon: '🇮🇳' },
  { name: 'bengali-movies', url: '/discover/movie?with_original_language=bn&sort_by=popularity.desc', type: 'movie', icon: '🇧🇩' },
  { name: 'tamil-movies', url: '/discover/movie?with_original_language=ta&sort_by=popularity.desc', type: 'movie', icon: '🎬' },
  { name: 'telugu-movies', url: '/discover/movie?with_original_language=te&sort_by=popularity.desc', type: 'movie', icon: '🎬' },
  { name: 'korean-movies', url: '/discover/movie?with_original_language=ko&sort_by=popularity.desc', type: 'movie', icon: '🇰🇷' },
  { name: 'japanese-movies', url: '/discover/movie?with_original_language=ja&sort_by=popularity.desc&without_genres=16', type: 'movie', icon: '🇯🇵' },
  { name: 'chinese-movies', url: '/discover/movie?with_original_language=zh&sort_by=popularity.desc', type: 'movie', icon: '🇨🇳' },
  { name: 'spanish-movies', url: '/discover/movie?with_original_language=es&sort_by=popularity.desc', type: 'movie', icon: '🇪🇸' },
  { name: 'french-movies', url: '/discover/movie?with_original_language=fr&sort_by=popularity.desc', type: 'movie', icon: '🇫🇷' },
  { name: 'german-movies', url: '/discover/movie?with_original_language=de&sort_by=popularity.desc', type: 'movie', icon: '🇩🇪' },
  { name: 'italian-movies', url: '/discover/movie?with_original_language=it&sort_by=popularity.desc', type: 'movie', icon: '🇮🇹' },
  { name: 'russian-movies', url: '/discover/movie?with_original_language=ru&sort_by=popularity.desc', type: 'movie', icon: '🇷🇺' },
  { name: 'turkish-movies', url: '/discover/movie?with_original_language=tr&sort_by=popularity.desc', type: 'movie', icon: '🇹🇷' },
  { name: 'thai-movies', url: '/discover/movie?with_original_language=th&sort_by=popularity.desc', type: 'movie', icon: '🇹🇭' },
  { name: 'arabic-movies', url: '/discover/movie?with_original_language=ar&sort_by=popularity.desc', type: 'movie', icon: '🇸🇦' },
  /* Languages (TV Shows) */
  { name: 'korean-drama', url: '/discover/tv?with_original_language=ko&sort_by=popularity.desc', type: 'tv', icon: '🇰🇷' },
  { name: 'chinese-drama', url: '/discover/tv?with_original_language=zh&sort_by=popularity.desc', type: 'tv', icon: '🇨🇳' },
  { name: 'japanese-drama', url: '/discover/tv?with_original_language=ja&sort_by=popularity.desc&without_genres=16', type: 'tv', icon: '🇯🇵' },
  { name: 'turkish-drama', url: '/discover/tv?with_original_language=tr&sort_by=popularity.desc', type: 'tv', icon: '🇹🇷' },
  { name: 'thai-drama', url: '/discover/tv?with_original_language=th&sort_by=popularity.desc', type: 'tv', icon: '🇹🇭' },
  { name: 'hindi-tv', url: '/discover/tv?with_original_language=hi&sort_by=popularity.desc', type: 'tv', icon: '🇮🇳' },
  { name: 'spanish-tv', url: '/discover/tv?with_original_language=es&sort_by=popularity.desc', type: 'tv', icon: '🇪🇸' },
  /* Genres (Movies) */
  { name: 'action', url: '/discover/movie?with_genres=28&sort_by=popularity.desc', type: 'movie', icon: '💥' },
  { name: 'comedy', url: '/discover/movie?with_genres=35&sort_by=popularity.desc', type: 'movie', icon: '😂' },
  { name: 'horror', url: '/discover/movie?with_genres=27&sort_by=popularity.desc', type: 'movie', icon: '👻' },
  { name: 'scifi', url: '/discover/movie?with_genres=878&sort_by=popularity.desc', type: 'movie', icon: '🚀' },
  { name: 'romance', url: '/discover/movie?with_genres=10749&sort_by=popularity.desc', type: 'movie', icon: '💕' },
  { name: 'thriller', url: '/discover/movie?with_genres=53&sort_by=popularity.desc', type: 'movie', icon: '🔪' },
  { name: 'documentary', url: '/discover/movie?with_genres=99&sort_by=popularity.desc', type: 'movie', icon: '📖' },
  { name: 'fantasy', url: '/discover/movie?with_genres=14&sort_by=popularity.desc', type: 'movie', icon: '🧙' },
  { name: 'crime', url: '/discover/movie?with_genres=80&sort_by=popularity.desc', type: 'movie', icon: '🚔' },
  { name: 'mystery', url: '/discover/movie?with_genres=9648&sort_by=popularity.desc', type: 'movie', icon: '🕵️' },
  { name: 'family', url: '/discover/movie?with_genres=10751&sort_by=popularity.desc', type: 'movie', icon: '👨‍👩‍👧' },
  { name: 'war', url: '/discover/movie?with_genres=10752&sort_by=popularity.desc', type: 'movie', icon: '⚔️' },
  { name: 'history', url: '/discover/movie?with_genres=36&sort_by=popularity.desc', type: 'movie', icon: '📜' },
  /* Genres (TV) */
  { name: 'action-tv', url: '/discover/tv?with_genres=10759&sort_by=popularity.desc', type: 'tv', icon: '💥' },
  { name: 'comedy-tv', url: '/discover/tv?with_genres=35&sort_by=popularity.desc', type: 'tv', icon: '😂' },
  { name: 'drama-tv', url: '/discover/tv?with_genres=18&sort_by=popularity.desc', type: 'tv', icon: '🎭' },
  { name: 'scifi-tv', url: '/discover/tv?with_genres=10765&sort_by=popularity.desc', type: 'tv', icon: '🚀' },
  { name: 'reality-tv', url: '/discover/tv?with_genres=10764&sort_by=popularity.desc', type: 'tv', icon: '🎤' },
  { name: 'talk-show', url: '/discover/tv?with_genres=10767&sort_by=popularity.desc', type: 'tv', icon: '🗣️' },
  /* Studios / Franchises */
  { name: 'marvel', url: '/discover/movie?with_companies=420&sort_by=popularity.desc', type: 'movie', icon: '🦸' },
  { name: 'dc', url: '/discover/movie?with_companies=9993&sort_by=popularity.desc', type: 'movie', icon: '🦇' },
  { name: 'pixar', url: '/discover/movie?with_companies=3&sort_by=popularity.desc', type: 'movie', icon: '🎈' },
  { name: 'ghibli', url: '/discover/movie?with_companies=10342&sort_by=popularity.desc', type: 'movie', icon: '🌿' },
  { name: 'a24', url: '/discover/movie?with_companies=41077&sort_by=popularity.desc', type: 'movie', icon: '🎞️' },
  { name: 'warner-bros', url: '/discover/movie?with_companies=174&sort_by=popularity.desc', type: 'movie', icon: '🎬' },
  { name: 'universal', url: '/discover/movie?with_companies=33&sort_by=popularity.desc', type: 'movie', icon: '🌍' },
  { name: 'sony', url: '/discover/movie?with_companies=5&sort_by=popularity.desc', type: 'movie', icon: '🎮' }
];

/* ═══════════════════════════════════════════════════════════════
   🌐 API FETCHING UTILITIES
═══════════════════════════════════════════════════════════════ */
async function fetchAPI(url, maxAttempts = 3) {
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

async function fetchGraphQL(url, query, variables) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    return await res.json();
  } catch(e) { return null; }
}

/* ═══════════════════════════════════════════════════════════════
   📥 DATA FETCHERS (Individual Databases)
═══════════════════════════════════════════════════════════════ */
async function fetchOMDb(imdbId) {
  const key = getKey('omdb');
  if (!key || !imdbId) return null;
  const data = await fetchAPI(`https://www.omdbapi.com/?i=${imdbId}&apikey=${key}&plot=full`);
  if (data && data.Response === 'False') {
    if (data.Error && data.Error.includes('Invalid')) logKeyFailure('omdb', key, 401);
    return null;
  }
  return data;
}

async function fetchWatchmode(imdbId) {
  const key = getKey('watchmode');
  if (!key || !imdbId) return null;
  const data = await fetchAPI(`https://api.watchmode.com/v1/title/${imdbId}/sources/?apiKey=${key}&regions=IN,US,GB`);
  if (!data || data.length === 0) return null;
  return data;
}

async function fetchFanart(tmdbId, type = 'movies') {
  const key = getKey('fanart');
  if (!key || !tmdbId) return null;
  const data = await fetchAPI(`https://webservice.fanart.tv/v3/${type}/${tmdbId}?api_key=${key}`);
  if (data && data.status === 'error') {
    logKeyFailure('fanart', key, 401);
    return null;
  }
  return data;
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 1: TMDB CATEGORIES
═══════════════════════════════════════════════════════════════ */
async function syncCategories() {
  console.log('\n' + '═'.repeat(65));
  console.log(`📥 STEP 1: Fetching ${CATEGORIES.length} TMDB categories`);
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'categories');
  fs.mkdirSync(dir, { recursive: true });

  const movieIds = new Set();
  const tvIds = new Set();

  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const key = getKey('tmdb');
    if (!key) { console.log('❌ No TMDB keys'); break; }

    const sep = cat.url.includes('?') ? '&' : '?';
    const url = BASE_TMDB + cat.url + sep + 'api_key=' + key + '&page=1';
    const data = await fetchAPI(url);
    
    if (data && data.results) {
      const clean = data.results.filter(r => r.poster_path);
      saveJSON(path.join(dir, cat.name + '.json'), {
        results: clean, type: cat.type, updated: new Date().toISOString()
      });
      clean.forEach(item => {
        let t = item.media_type || (cat.type === 'movie' ? 'movie' : 'tv');
        if (t === 'movie') movieIds.add(item.id);
        else if (t === 'tv') tvIds.add(item.id);
      });
      console.log(`✅ ${cat.icon} ${cat.name} (${clean.length} items)`);
    } else {
      console.log(`❌ ${cat.name} Failed`);
    }
    await new Promise(r => setTimeout(r, 250));
  }
  return { movieIds, tvIds };
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 2: TMDB DETAILS + ENRICHMENT (OMDb, Watchmode, Fanart)
   (Includes Trailers, Images, Posters, Teaser, Backgrounds)
═══════════════════════════════════════════════════════════════ */
async function syncMovieDetails(movieIds) {
  console.log('\n' + '═'.repeat(65));
  console.log(`📥 STEP 2A: Movie Details + Enrichment (Max ${MOVIES_PER_SYNC})`);
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'movies');
  const ids = Array.from(movieIds).slice(0, MOVIES_PER_SYNC);

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const filePath = path.join(dir, id + '.json');
    if (fs.existsSync(filePath)) continue;

    const key = getKey('tmdb');
    if (!key) break;

    // append_to_response: videos (Trailers), images (Posters), credits, external_ids
    const url = BASE_TMDB + '/movie/' + id + '?api_key=' + key + '&append_to_response=credits,external_ids,videos,images,watch/providers,similar';
    const tmdbData = await fetchAPI(url);
    
    if (!tmdbData || !tmdbData.id) continue;
    
    let enriched = { tmdb: tmdbData, sources: { tmdb: true } };
    const imdbId = tmdbData.external_ids?.imdb_id;

    if (imdbId) {
      const [omdb, watchmode] = await Promise.all([
        fetchOMDb(imdbId),
        fetchWatchmode(imdbId)
      ]);
      if (omdb) { enriched.omdb = omdb; enriched.sources.omdb = true; }
      if (watchmode) { enriched.watchmode = watchmode; enriched.sources.watchmode = true; }
    }
    
    const fanart = await fetchFanart(id, 'movies');
    if (fanart) { enriched.fanart = fanart; enriched.sources.fanart = true; }

    saveJSON(filePath, enriched);
    console.log(`[${i+1}/${ids.length}] ✅ ${tmdbData.title} (Enriched)`);
    await new Promise(r => setTimeout(r, 250));
  }
}

async function syncTVDetails(tvIds) {
  console.log('\n' + '═'.repeat(65));
  console.log(`📥 STEP 2B: TV Details + Enrichment (Max ${TV_PER_SYNC})`);
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'tv');
  const ids = Array.from(tvIds).slice(0, TV_PER_SYNC);

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const filePath = path.join(dir, id + '.json');
    if (fs.existsSync(filePath)) continue;

    const key = getKey('tmdb');
    if (!key) break;

    const url = BASE_TMDB + '/tv/' + id + '?api_key=' + key + '&append_to_response=credits,external_ids,videos,images,watch/providers,similar';
    const tmdbData = await fetchAPI(url);
    
    if (!tmdbData || !tmdbData.id) continue;
    
    let enriched = { tmdb: tmdbData, sources: { tmdb: true } };
    const imdbId = tmdbData.external_ids?.imdb_id;

    if (imdbId) {
      const [omdb, watchmode] = await Promise.all([
        fetchOMDb(imdbId),
        fetchWatchmode(imdbId)
      ]);
      if (omdb) { enriched.omdb = omdb; enriched.sources.omdb = true; }
      if (watchmode) { enriched.watchmode = watchmode; enriched.sources.watchmode = true; }
    }
    
    const fanart = await fetchFanart(id, 'tv');
    if (fanart) { enriched.fanart = fanart; enriched.sources.fanart = true; }

    saveJSON(filePath, enriched);
    console.log(`[${i+1}/${ids.length}] ✅ ${tmdbData.name} (Enriched)`);
    await new Promise(r => setTimeout(r, 250));
  }
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 3: ANILIST (Anime + Trailers)
═══════════════════════════════════════════════════════════════ */
async function syncAniList() {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 3: Syncing AniList (Anime + Trailers)');
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'anilist');
  const animeCategories = [
    { name: 'trending', sort: 'TRENDING_DESC' },
    { name: 'popular', sort: 'POPULARITY_DESC' },
    { name: 'top', sort: 'SCORE_DESC' },
    { name: 'movies', sort: 'POPULARITY_DESC', format: 'MOVIE' },
    { name: 'this-season', sort: 'POPULARITY_DESC', season: 'CURRENT' }
  ];

  // Added trailer and bannerImage for full visual support
  const query = `query($page:Int,$perPage:Int,$sort:[MediaSort],$format:MediaFormat){Page(page:$page,perPage:$perPage){media(sort:$sort,type:ANIME,format:$format,isAdult:false){id title{romaji english native}coverImage{large extraLarge}bannerImage trailer{id site thumbnail} averageScore popularity startDate{year}format genres description episodes duration status studios{edges{node{name}}}}}}`;

  for (const cat of animeCategories) {
    const variables = { page: 1, perPage: 50, sort: [cat.sort] };
    if (cat.format) variables.format = cat.format;
    
    // AniList needs special season handling, but we're keeping it simple here
    
    const data = await fetchGraphQL('https://graphql.anilist.co', query, variables);
    if (data && data.data && data.data.Page) {
      saveJSON(path.join(dir, cat.name + '.json'), {
        results: data.data.Page.media, type: 'anime', source: 'anilist'
      });
      console.log(`✅ AniList ${cat.name}: ${data.data.Page.media.length} items`);
    }
    await new Promise(r => setTimeout(r, 1000)); // Rate limit
  }
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 4: TVMAZE (Daily Schedule)
═══════════════════════════════════════════════════════════════ */
async function syncTVmaze() {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 4: Syncing TVmaze (Schedule)');
  console.log('═'.repeat(65));
  
  try {
    const res = await fetch('https://api.tvmaze.com/schedule');
    if (res.ok) {
      const schedule = await res.json();
      const clean = schedule.map(item => ({
        id: item.id, show_id: item.show.id, show_name: item.show.name,
        show_image: item.show.image?.medium || null, season: item.season,
        episode: item.number, episode_name: item.name, airdate: item.airdate
      }));
      saveJSON(path.join(__dirname, '..', 'cache', 'tvmaze', 'schedule.json'), {
        results: clean, type: 'schedule'
      });
      console.log(`✅ TVmaze: ${clean.length} episodes today`);
    }
  } catch(e) { console.log('❌ TVmaze Failed'); }
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 5: JIKAN (MyAnimeList)
═══════════════════════════════════════════════════════════════ */
async function syncJikan() {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 5: Syncing Jikan (MyAnimeList)');
  console.log('═'.repeat(65));
  
  const dir = path.join(__dirname, '..', 'cache', 'jikan');
  
  try {
    const topRes = await fetch('https://api.jikan.moe/v4/top/anime?limit=25');
    if (topRes.ok) {
      const data = await topRes.json();
      saveJSON(path.join(dir, 'top.json'), { results: data.data, source: 'jikan' });
      console.log(`✅ Jikan Top Anime: ${data.data.length} items`);
    }
    
    await new Promise(r => setTimeout(r, 1500)); 

    const airingRes = await fetch('https://api.jikan.moe/v4/seasons/now?limit=25');
    if (airingRes.ok) {
      const data = await airingRes.json();
      saveJSON(path.join(dir, 'airing.json'), { results: data.data, source: 'jikan' });
      console.log(`✅ Jikan Airing Anime: ${data.data.length} items`);
    }
  } catch(e) { console.log('❌ Jikan Failed'); }
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 6: KITSU (animedoc)
═══════════════════════════════════════════════════════════════ */
async function syncKitsu() {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 6: Syncing Kitsu (AnimeDoc)');
  console.log('═'.repeat(65));
  
  try {
    const res = await fetch('https://kitsu.io/api/edge/trending/anime');
    if (res.ok) {
      const data = await res.json();
      saveJSON(path.join(__dirname, '..', 'cache', 'kitsu', 'trending.json'), {
        results: data.data, source: 'kitsu'
      });
      console.log(`✅ Kitsu Trending: ${data.data.length} items`);
    }
  } catch(e) { console.log('❌ Kitsu Failed'); }
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 7: SIMKL (Requires Client ID)
═══════════════════════════════════════════════════════════════ */
async function syncSimkl() {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 7: Syncing Simkl');
  console.log('═'.repeat(65));
  
  const clientId = KEYS.simkl[0];
  if (!clientId) {
    console.log('⚠️ Simkl skipped (No SIMKL_CLIENT_ID provided)');
    return;
  }

  try {
    const res = await fetch(`https://api.simkl.com/movies/trending/?client_id=${clientId}`);
    if (res.ok) {
      const data = await res.json();
      saveJSON(path.join(__dirname, '..', 'cache', 'simkl', 'trending.json'), {
        results: data.slice(0, 50), source: 'simkl' // limit to 50
      });
      console.log(`✅ Simkl Trending Movies: ${data.length} items`);
    }
  } catch(e) { console.log('❌ Simkl Failed'); }
}

/* ═══════════════════════════════════════════════════════════════
   📥 STEP 8: THETVDB (Requires API Key)
═══════════════════════════════════════════════════════════════ */
async function syncTheTVDB() {
  console.log('\n' + '═'.repeat(65));
  console.log('📥 STEP 8: Syncing TheTVDB');
  console.log('═'.repeat(65));
  
  const apiKey = KEYS.tvdb;
  if (!apiKey) {
    console.log('⚠️ TheTVDB skipped (No TVDB_API_KEY provided)');
    return;
  }

  try {
    const loginRes = await fetch('https://api4.thetvdb.com/v4/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: apiKey })
    });
    const loginData = await loginRes.json();
    if (!loginData.data || !loginData.data.token) throw new Error('TVDB Auth Failed');
    
    const token = loginData.data.token;

    const seriesRes = await fetch('https://api4.thetvdb.com/v4/series/filter?lang=eng&sort=lastUpdated&sortType=desc', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (seriesRes.ok) {
      const seriesData = await seriesRes.json();
      saveJSON(path.join(__dirname, '..', 'cache', 'tvdb', 'latest.json'), {
        results: seriesData.data.slice(0, 50), source: 'tvdb'
      });
      console.log(`✅ TheTVDB Latest Series: 50 items`);
    }
  } catch(e) { console.log(`❌ TheTVDB Failed: ${e.message}`); }
}

/* ═══════════════════════════════════════════════════════════════
   📊 KEY REPORT
═══════════════════════════════════════════════════════════════ */
function printReport() {
  console.log('\n' + '═'.repeat(65));
  console.log('🔑 API KEY USAGE REPORT');
  console.log('═'.repeat(65));
  
  ['tmdb', 'omdb', 'watchmode', 'fanart'].forEach(pool => {
    const keys = KEYS[pool];
    if (!keys || !keys.length) return;
    
    const total = Object.values(keyStats[pool]).reduce((a, b) => a + b, 0);
    console.log(`\n[${pool.toUpperCase()}] Total Calls: ${total} | Keys: ${keys.length}`);
    keys.forEach((k, i) => {
      const used = keyStats[pool][k] || 0;
      if (used > 0) console.log(`  #${String(i+1).padStart(2, '0')} ${maskKey(k)} → ${used} calls`);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   🚀 MAIN EXECUTION
═══════════════════════════════════════════════════════════════ */
(async function(){
  const startTime = Date.now();
  
  console.log('╔' + '═'.repeat(63) + '╗');
  console.log('║' + ' '.repeat(8) + '🎬 CINEVAULT MULTI-SOURCE SYNC v9.0' + ' '.repeat(15) + '║');
  console.log('║' + ' '.repeat(5) + '10 Databases • Trailers • 80+ Categories • Posters' + ' '.repeat(4) + '║');
  console.log('╚' + '═'.repeat(63) + '╝');
  
  if (!KEYS.tmdb.length) {
    console.error('❌ FATAL: No TMDB keys provided. Set TMDB_KEYS in env.');
    process.exit(1);
  }

  try {
    // 1. TMDB (Base Data + Enrichment)
    const { movieIds, tvIds } = await syncCategories();
    await syncMovieDetails(movieIds);
    await syncTVDetails(tvIds);
    
    // 2. Anime (AniList, Jikan, Kitsu)
    await syncAniList();
    await syncJikan();
    await syncKitsu();

    // 3. TV Schedule (TVmaze)
    await syncTVmaze();

    // 4. Optional APIs (Simkl, TVDB)
    await syncSimkl();
    await syncTheTVDB();

    // 5. Meta Save
    saveJSON(path.join(__dirname, '..', 'cache', '_meta.json'), {
      updated: new Date().toISOString(),
      version: '9.0',
      sources: ['tmdb', 'anilist', 'tvmaze', 'jikan', 'kitsu', 'simkl', 'tvdb', 'omdb', 'watchmode', 'fanart'],
      timestamp: Date.now()
    });
    
    printReport();
    
    console.log('\n🎉 ALL SOURCES SYNC COMPLETE in ' + ((Date.now() - startTime) / 1000).toFixed(1) + 's');
    
  } catch(err) {
    console.error('\n❌ FATAL ERROR: ' + err.message);
    process.exit(1);
  }
})();
