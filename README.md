# 🎬 CineVault Movie Cache

Automated cache system for movie streaming site.

## How it works

- **Every 2 hours**: GitHub Actions fetches fresh data from TMDB
- **Two caches**: 
  - `cache-data` branch → JSON files (auto-generated)
  - Categories list + Movie details
- **50 MB limit**: Old files auto-deleted when limit reached
- **Zero maintenance**: No manual work needed

## Setup

1. Add `TMDB_KEYS` secret (18 keys, comma-separated)
2. Enable Actions
3. Done!

## Access from Blogger

- Categories: `https://raw.githubusercontent.com/USER/movie-cache/cache-data/cache/tmdb/categories/trending.json`
- Movie: `https://raw.githubusercontent.com/USER/movie-cache/cache-data/cache/tmdb/movies/{id}.json`
