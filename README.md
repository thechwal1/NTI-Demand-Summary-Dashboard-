# NTI Demand Summary Dashboard

This static dashboard runs on Netlify and stores users, authenticated sessions,
upload history, demand details, and the NTI item catalog in Netlify Database.

## Data persistence

- `db/schema.ts` defines the managed Postgres tables with Drizzle ORM.
- `netlify/functions/api.mts` provides authenticated data access at `/api/*`.
- `netlify/database/migrations/` contains the schema migration applied by Netlify.
- Existing browser-local data is imported once after the administrator signs in,
  when the corresponding server-side tables are still empty.

The database is provisioned automatically on the first Netlify connection. No
external database service or connection string is required.
