# LEAPS Scanner — Project Context

## What This App Does
Scans large-cap stocks for post-dip LEAP (Long-Term Equity Anticipation Partnerships) options opportunities. Results are scored and displayed in a sortable table with priority alerts.

## Live URL
https://leaps-scanner.vercel.app

## GitHub
https://github.com/Piolit79/leaps-scanner

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Vercel serverless functions (TypeScript)
- **Database**: Supabase (`scan_results`, `scan_runs` tables)
- **Deployment**: Vercel

## Key Files
| File | Purpose |
|------|---------|
| `src/App.tsx` | Main component — filter state, scan triggering, auto-refresh (60s) |
| `src/components/FilterPanel.tsx` | 8 filter categories (market cap, DTE, delta, dip, OI, IV) |
| `src/components/ResultsTable.tsx` | Sortable table — 23 fields, score bars, trigger badges, priority alerts |
| `api/scan.ts` | POST — triggers a new scan, merges config, logs to Supabase (300s timeout) |
| `api/results.ts` | GET — fetches latest scan results from Supabase |
| `api/cron-scan.ts` | Cron-triggered scan endpoint (bearer token auth) |
| `api/lib/` | Core scan logic (runScan function) |

## Filter Categories
Market cap ranges, Days-to-expiration (DTE), Delta approximation, Dip severity, Single-day drop, Open interest minimum (default 500), Implied volatility

## Result Scoring
- Score scale: 0–14
- Color coding: green ≥10, yellow ≥8, blue otherwise
- Trigger badges: EPS Gap, 1-Day, 52w Hi, 30-Day
- Priority alerts (triangle icon) and manual review flags (eye icon)

## Last Session — 2026-03-05
- Session was accidentally closed before we could document what was being worked on
- **Pick up**: Ask user what specific feature/bug we were working on

## Notes
- Results auto-refresh every 60 seconds via React Query
- Scan takes 2–4 minutes to complete
- Default min open interest: 500
