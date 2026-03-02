# ForgeTheFutureHackathon
One More Job Proof of concept.

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
2. Install deps: `npm install`
3. Run locally: `npm run dev`

Open `http://localhost:3000`.

### PowerShell (Windows)
- Dev: `.\run.ps1`
- Start: `.\run.ps1 -Mode start`
- Configure Elastic env: `.\scripts\setup-elastic-env.ps1 -Check`

## Pages
- `GET /` home
- `GET /customer` post a job (address is geocoded, stored in Elasticsearch)
- `GET /tradie` find nearby jobs (use “Send my location” + Elasticsearch geo distance query)
- `GET /jobs/:id` view a job

## API (optional)
- `POST /api/jobs` (send `address`, or `lat`+`lon`)
- `GET /api/jobs/nearby?lat=...&lon=...&radius=5km&skills=plumbing,electrical`
- `POST /api/jobs/:id/accept`
