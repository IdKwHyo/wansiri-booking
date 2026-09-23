# Clinic API v1

Base: `/api/v1`. Responses are JSON and `Cache-Control: no-store`. Every endpoint verifies a Supabase session and an active entry in `clinic.staff`. Requests cannot authenticate through the old ChatGPT identity headers. `settings` writes and `examples` require the admin role. No patient data is sent to third-party model services unless the operator configures the server model; even then only the query/schema is sent, not database rows.

| Method | Route | Purpose |
|---|---|---|
| GET | `/meta` | Clinic settings, authenticated user, Bangkok date/time |
| GET | `/patients?q=HN-or-name` | Up to 20 matched patients |
| GET | `/patients/:id` | Patient and most recent 100 visits |
| PATCH | `/patients/:id` | Explicit demographic edit; body `{patient,version}` |
| GET | `/availability?date=YYYY-MM-DD&exclude=appointment-id` | Occupancy counts by time; exclude optional |
| POST | `/appointments/search` | `{filters,offset}`; up to 100 visits, total count and normalized filters |
| POST | `/appointments` | New booking for existing or new patient |
| GET | `/appointments/:id` | One joined appointment/patient record |
| PATCH | `/appointments/:id` | Full visit update with current `version`; patient ID cannot change |
| PATCH | `/settings` | `{open,close,capacity,version}` |
| GET | `/events?after=sequence` | Event feed; ascending, up to 100; use `nextCursor` |
| GET | `/events?entityId=id` | Most recent 30 change-history entries |
| POST | `/assistant` | Interpret query only; never mutate records |
| POST | `/examples` | Add four fictional patients only when directory is empty |

## Create

```json
{
  "patient": {"hn":"000123", "name":"Example Patient", "dob":"1990-01-15", "sex":"Not specified"},
  "date":"2026-10-01", "time":"10:30", "arrival":null,
  "service":"General consultation", "followup":true, "tags":["General"],
  "status":"booked", "seen":false, "remarks":"Interpreter requested",
  "requestId":"a-new-UUID-v4-generated-once-for-this-submit"
}
```

Use `patientId` instead of `patient` for a returning patient. A new request UUID is required; keep it unchanged when retrying the same creation. The example UUID text is descriptive: supply a real UUID. For updates include `version`, send `patientId`, and omit `patient`. All supplied fields are validated; unknown fields are rejected.

Statuses: `booked`, `waiting`, `diagnosed`, `home`, `cancelled`, `no_show`. Waiting requires arrival and not-seen; diagnosed and home require arrival and doctor-seen. Home is an explicit staff action. A no-show cannot have arrival or doctor-seen. Cancelled appointments retain history and release slot capacity.

## Search

```json
{"filters":{"dateFrom":"2026-10-01","dateTo":"2026-10-07","timeField":"arrival","timeTo":"09:59","seen":false,"followup":true,"casesAny":["General","Mobility"]},"offset":0}
```

All filters combine with AND, except entries in `casesAny` and `statuses` combine with OR within their field. Cases match the service text or individual tags by literal substring; remarks use `remarks`. Bounds are inclusive. Supported filter keys are defined in `lib/contracts.ts`. No raw SQL, arbitrary columns, or model-selected access scopes are supported.

Quick search is deterministic and intentionally limited; unknown conditions require clarification. Hosted model output uses the same validation and query path. POST `/assistant` accepts `{query, quick?}`; provider interpretation is performed only on the server. Set `GROQ_API_KEY` to enable the default cloud model.

## Errors / concurrency

- 400: invalid fields, status contradiction or invalid interpretation
- 401: missing/expired session or unapproved/revoked staff account
- 403: cross-origin mutation or insufficient staff role
- 404: unknown record
- 409: capacity, HN collision, stale version, incompatible settings, or conflicting request retry
- 503: database or model unavailable

On 409, reload the current record; never blindly resubmit a stale update. New booking plus patient insert and event are atomic. Transactional SQL guards cover concurrent requests. Prepared queries execute in Postgres transactions. Writes acquire a clinic-wide transaction advisory lock before checking capacity and applying mutations. Parameterized SQL escapes wildcard search characters so user input is literal text.

## Future automation

Persist the event cursor and de-duplicate by event `id`. Events include `sequence`, `id`, `type`, `entityId`, `actor`, and `at`; fetch the current appointment for its details. Store your consumer's checkpoint separately. No webhook delivery worker is enabled in this release. Add integrations using `lib/service.ts` so capacity and consistency checks are shared, and keep delivery retries outside request handling. For external machines, configure a verified service identity at the authentication boundary; never reuse unverified identity headers as credentials.
