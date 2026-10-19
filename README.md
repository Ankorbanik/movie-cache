# 🎬 CineVault ULTIMATE Movie Cache (v9.0)

Automated multi-source cache system for the **movienas** streaming platform.

## 🚀 How It Works

- **Every 2 hours**: GitHub Actions fetches fresh data from multiple sources.
- **10 Multi-Source Integrations**:
  - 🎬 **TMDB** (Movies, TV, Web Series, 80+ Categories)
  - 🌸 **AniList** (Anime + Trailers)
  - 📺 **TVmaze** (Daily TV Schedules)
  - ⭐ **OMDb** (IMDb Ratings & Details - *Enriched into TMDB files*)
  - 🍿 **Watchmode** (Streaming Availability - *Enriched into TMDB files*)
  - 🎨 **Fanart.tv** (HD Backgrounds & Logos - *Enriched into TMDB files*)
  - 📊 **Simkl** (Trending Data)
  - 🎌 **Jikan** (MyAnimeList Top & Airing Anime)
  - 🦊 **Kitsu** (Trending Anime)
  - 📺 **TheTVDB** (Latest Series Updates)
- **Two Branches**:
  - `main` → Source code, scripts, and GitHub Actions workflow
  - `cache-data` → Auto-generated JSON files (force-pushed every 2h)
- **95 MB Global Limit with Smart Deletion**: 
  - When cache reaches 95 MB, the script automatically deletes **15 MB** of the oldest data.
  - **Smart Priority**: Deletes heavy media details (`movies/`, `tv/`) first and protects essential `categories/` files.
- **Zero Maintenance**: Fully automated.

## 🏗️ Architecture (6-Layer Cache)
Browser (Blogger) ➔ Cloudflare Edge ➔ Upstash Redis ➔ Cloudflare KV ➔ GitHub (JSON) ➔ Live API

## ⚙️ Setup & Secrets

To make this work, add the following to your GitHub Repository Secrets:

**Required:**
1. `TMDB_KEYS` - 18 TMDB API keys, comma-separated.
2. `OMDB_KEYS` - 18 OMDb API keys, comma-separated.
3. `WATCHMODE_KEYS` - 18 Watchmode API keys, comma-separated.
4. `FANART_KEYS` - 18 Fanart.tv API keys, comma-separated.

**Optional:**
5. `SIMKL_CLIENT_ID` - Simkl Client ID (if you have one).
6. `TVDB_API_KEY` - TheTVDB API Key (if you have one).
7. `CLOUDFLARE_WORKER_URL` - Your Cloudflare Worker URL for sync notifications.
8. `WORKER_SECRET` - The secret token for your Cloudflare Worker.

*(Note: AniList, TVmaze, Jikan, and Kitsu do not require API keys.)*

## 📂 Cache Structure

```text
cache/
├── tmdb/
│   ├── categories/  (80+ JSON files of movies, tv, web series)
│   ├── movies/      (Movie details enriched with OMDb, Watchmode, Fanart)
│   └── tv/          (TV details enriched with OMDb, Watchmode, Fanart)
├── anilist/
│   └── categories/  (Anime lists + trailer data)
├── tvmaze/
│   └── schedule.json (Daily TV Schedules)
├── jikan/
│   ├── top.json     (MyAnimeList Top Anime)
│   └── airing.json  (Currently Airing Anime)
├── kitsu/
│   └── trending.json (Trending Anime)
├── simkl/
│   └── trending.json (Trending Movies - if configured)
├── tvdb/
│   └── latest.json  (Latest TV Series - if configured)
└── _meta.json       (Cache stats, health, and last cleanup info)
