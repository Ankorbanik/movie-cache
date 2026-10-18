# 🎬 CineVault ULTIMATE Movie Cache (v7.0)

Automated multi-source cache system for **movienas** streaming platform.

## 🚀 How It Works

- **Every 2 hours**: GitHub Actions fetches fresh data from multiple sources.
- **Multi-Source Integration**:
  - 🎬 **TMDB** (Movies, TV, Anime)
  - 🌸 **AniList** (Anime)
  - 📺 **TVmaze** (TV Schedules)
- **Two Branches**:
  - `main` → Source code & scripts
  - `cache-data` → Auto-generated JSON files (force-pushed every 2h)
- **90 MB Global Limit**: Old files are automatically deleted in 10 MB chunks when the limit is reached (`manage-size.js`).
- **Zero Maintenance**: No manual work needed. Fully automated.

## 🏗️ Architecture (6-Layer Cache)
Browser (Blogger) ➔ Cloudflare Edge ➔ Upstash Redis ➔ Cloudflare KV ➔ GitHub (JSON) ➔ Live API

## ⚙️ Setup & Secrets

To make this work, add the following to your GitHub Repository Secrets:
1. `TMDB_KEYS` - (Required) 18 TMDB API keys, comma-separated.
2. `CLOUDFLARE_WORKER_URL` - (Optional) Your Cloudflare Worker URL for notifications.
3. `WORKER_SECRET` - (Optional) The secret token for your Cloudflare Worker.

*(Note: AniList and TVmaze do not require API keys.)*

## 📂 Cache Structure

```text
cache/
├── tmdb/
│   ├── categories/  (50+ JSON files)
│   ├── movies/      (Movie details)
│   └── tv/          (TV details)
├── anilist/
│   └── categories/  (Anime lists)
├── tvmaze/
│   └── categories/  (Daily TV Schedules)
└── _meta.json       (Cache stats & health)
