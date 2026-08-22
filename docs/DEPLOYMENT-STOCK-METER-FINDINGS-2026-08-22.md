# Deployment Stock/Meter Findings — 2026-08-22

## Read-only smoke evidence

Target deployment: https://itam-next-js-git-main-png-team.vercel.app/

At approximately 2026-08-22 04:29–04:30 GMT+7, the dashboard page rendered and showed Device 2,378 and active Device 2,151. The UI displayed the demo-mode banner.

The following browser-console requests were read-only:

| Endpoint | Status | Observed result |
|---|---:|---|
| `/api/stock-items?activeOnly=0&pageSize=5` | 200 | `data=[]`, `pagination.total=0`, stats all zero |
| `/api/stock-items?activeOnly=true&pageSize=5` | 500 | `Failed to fetch stock items` |
| `/api/meter?limit=5` | 500 | `Failed to fetch meter readings` |
| `/api/auth/me` | 401 | `Not authenticated`, `user=null` in this browser request |
| `/api/dashboard` | 500 | Prisma `meterReading.findMany()` failed with Supabase session-mode error: `EMAXCONNSESSION max clients reached ... pool_size: 15` |
| `/api/stock-items?page=1&pageSize=5` | 200 | `data=[]`, `pagination.total=0`, stats all zero |
| `/api/stock-items?activeOnly=1&pageSize=5` | 200 | `data=[]`, `pagination.total=0`, stats all zero |

Observed Vercel headers identify multiple fresh serverless requests with `server=Vercel`; deployment IDs were different per request, so no single deployment ID is treated as authoritative.

## Interpretation

The evidence no longer supports treating Meter 500 as only a stale-schema problem. The deployment also has a live database connection-capacity failure on `/api/dashboard`, and Stock returns an empty successful response on the same deployment. The leading deployment-level hypothesis is an incorrect or exhausted Supabase connection mode/URL, possibly combined with deployment code not yet containing the parity commit. This must be verified from Vercel project settings or by deploying the integration branch; secrets must not be copied into chat or documentation.

The `activeOnly=true` query form is not a supported canonical value in the inspected route, which parses `1` as true and other non-null values as false. It should not be used as a definitive database diagnosis. Canonical checks are `activeOnly=1` and `activeOnly=0`.

## Safety and governance

All checks above were read-only. No stock rows, meter readings, users, or configuration were modified. G3 Canary and Production remain blocked. B4 frozen files remain untouched.
