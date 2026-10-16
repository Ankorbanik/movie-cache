const fs = require('fs');
const path = require('path');

const KEYS = (process.env.TMDB_KEYS || '').split(',').filter(Boolean);
const BASE = 'https://api.themoviedb.org/3';

const CATEGORIES = [
  { name: 'trending',   url: '/trending/all/week' },
  { name: 'popular',    url: '/movie/popular' },
  { name: 'top-rated',  url: '/movie/top_rated' },
  { name: 'upcoming',   url: '/movie/upcoming' },
  { name: 'netflix',    url: '/discover/tv?with_networks=213' },
  { name: 'anime-tv',   url: '/discover/tv?with_genres=16&with_original_language=ja' },
  { name: 'korean',     url: '/discover/tv?with_original_language=ko' },
  { name: 'chinese',    url: '/discover/tv?with_original_language=zh' },
  { name: 'hindi',      url: '/discover/movie?with_original_language=hi' },
  { name: 'bengali',    url: '/discover/movie?with_original_language=bn' },
  { name: 'marvel',     url: '/discover/movie?with_companies=420' },
  { name: 'dc',         url: '/discover/movie?with_companies=9993' },
  { name: 'ghibli',     url: '/discover/movie?with_companies=10342' },
  { name: 'a24',        url: '/discover/movie?with_companies=41077' },
  { name: 'action',     url: '/discover/movie?with_genres=28' },
  { name: 'comedy',     url: '/discover/movie?with_genres=35' },
  { name: 'horror',     url: '/discover/movie?with_genres=27' },
  { name: 'scifi',      url: '/discover/movie?with_genres=878' },
];

let keyIdx = 0;
function nextKey() {
  const idx = keyIdx % KEYS.length;
  const k = KEYS[keyIdx++ % KEYS.length];
  console.log(`Using key #${idx + 1}/${KEYS.length} ending ...${k.slice(-4)}`);
  return k;
}

async function fetchCategory(cat, page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const sep = cat.url.includes('?') ? '&' : '?';
    const url = `${BASE}${cat.url}${sep}api_key=${nextKey()}&page=${page || 1}`;
    try {
      const res = await fetch(url);
      if (res.status === 429) { await new Promise(r => setTimeout(r, 2000)); continue; }
      if (!res.ok) continue;
      return await res.json();
    } catch (e) { await new Promise(r => setTimeout(r, 1000)); }
  }
  return null;
}

(async () => {
  if (!KEYS.length) { console.error('No TMDB keys provided'); process.exit(1); }
  const dir = path.join(__dirname, '..', 'cache', 'tmdb', 'categories');
  fs.mkdirSync(dir, { recursive: true });

  for (const cat of CATEGORIES) {
    const data = await fetchCategory(cat);
    if (!data) { console.warn(`Failed: ${cat.name}`); continue; }
    fs.writeFileSync(path.join(dir, `${cat.name}.json`), JSON.stringify(data, null, 2));
    console.log(`OK ${cat.name}: ${data.results?.length || 0} items`);
    await new Promise(r => setTimeout(r, 300));
  }

  fs.writeFileSync(
    path.join(__dirname, '..', 'cache', 'tmdb', '_meta.json'),
    JSON.stringify({ updated: new Date().toISOString(), categories: CATEGORIES.map(c => c.name) }, null, 2)
  );

  console.log('TMDB sync complete!');
})();
