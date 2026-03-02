# ForgeTheFutureHackathon
EnRoute proof of concept.

## Stack
- Node.js + Express (server + API)
- Elastic Cloud (Elasticsearch) for geo search + job storage
- HTML/CSS-first UI (static pages + vanilla JS)

## Prereqs
- Node.js `>=18`
- An Elasticsearch cluster (Elastic Cloud recommended)

## Setup
1. Configure env vars:
   - Copy `.env.example` to `.env`
   - Set either:
     - `ELASTICSEARCH_CLOUD_ID` + `ELASTICSEARCH_API_KEY`, or
     - `ELASTICSEARCH_NODE` (+ `ELASTICSEARCH_USERNAME`/`ELASTICSEARCH_PASSWORD` if needed)
   - Optional: set `GEOCODER_USER_AGENT` (used for address → coordinates)
   - Optional: set `GOOGLE_MAPS_API_KEY` (shows map on `/tradie`; restrict by HTTP referrer)
2. Install deps: `npm install`
3. Run locally: `npm run dev`
4. (Optional) Seed demo jobs: `npm run seed:demo`

Open `http://localhost:3000`.

### PowerShell (Windows)
- Dev: `.\run.ps1`
- Start: `.\run.ps1 -Mode start`
- Configure Elastic env: `.\scripts\setup-elastic-env.ps1 -Check`

### Bash (macOS/Linux/WSL/Git Bash)
- Dev: `./run.sh`
- Start: `./run.sh --mode start`

## Pages
- `GET /` home
- `GET /customer` post a job (address is geocoded, stored in Elasticsearch)
- `GET /tradie` map + find jobs nearby or along a route (uses Elasticsearch geo queries)
- `GET /jobs/:id` view a job

## API (optional)
- `GET /api/config`
- `POST /api/jobs` (send `address`, or `lat`+`lon`)
- `GET /api/jobs/nearby?address=...&radius=5km&skills=plumbing,electrical` (or `lat`+`lon`)
- `GET /api/geocode?q=123%20George%20St%2C%20Sydney%20NSW`
- `GET /api/jobs/route?start=...&destination=...&detourMinutes=5&skills=plumbing,electrical` (or coords)
- `POST /api/jobs/:id/accept`
