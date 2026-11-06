# Auth app

React/Vite frontend with an Express, Prisma, and PostgreSQL API.

## Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` when no environment file exists, then configure real secrets and database credentials. Keep database URLs and JWT secrets server-side; never give them a `VITE_` prefix.
3. Run `npm run db:generate` to generate Prisma Client. This requires access to Prisma's engine download host.
4. Run `npm run db:deploy` to apply the committed migrations using `DIRECT_URL`.
5. Run `npm run server` in one terminal and `npm start` in another.

Frontend: http://localhost:5173. API: http://localhost:5000/api.

`DATABASE_URL` uses Neon's pooled connection; `DIRECT_URL` uses its direct connection for migrations. Existing `.env` JWT secrets are preserved when configuring Neon.

## Security configuration

The password vault encrypts passwords with AES-256-GCM. Configure ENCRYPTION_KEY as 64 random hexadecimal characters and back it up securely; losing it makes vault passwords unrecoverable. The API validates browser `Origin` headers on auth POST routes, applies no-store and baseline security headers, and limits JSON bodies to 16 KB. Set `FRONTEND_URL` to the exact allowed origins and use distinct random token secrets of at least 32 characters. If deployed behind a trusted reverse proxy, set `TRUST_PROXY_HOPS` to its exact hop count so rate limits use client IP addresses safely. The built-in rate-limit store is in-memory and is suitable only for a single API process; use a shared store before running multiple instances.

## Verification

- `npm run build`: frontend TypeScript and production bundle.
- `npm run typecheck:server`: backend TypeScript; requires generated Prisma Client.
- `npm run check:auth`: focused checks with a mocked HTTP adapter for credential errors, refresh concurrency, Strict Mode startup, logout notifications, JWT expiry classification, unique refresh tokens, lifetimes, and hashing. This does not replace live database/API verification.

The initial schema migration is `prisma/migrations/20261105170000_init_auth/migration.sql`. The Neon plugin tested this schema on an isolated temporary branch. The tested migration was applied to the dedicated Neon Auth project main branch after confirmation; the temporary branch was removed. The plugin application includes a matching Prisma migration-history entry so later `prisma migrate deploy` calls recognize it.


Vault endpoints require a bearer access token: GET/POST /api/vault, PUT/DELETE /api/vault/:id, and GET /api/vault/generate-password. List responses omit ciphertext, IV, and authentication tags.
