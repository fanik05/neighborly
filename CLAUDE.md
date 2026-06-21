# Neighborly — Hyperlocal Community Marketplace

PERN app where neighbors buy, sell, or loan tools/goods. Features: geolocation (Leaflet + OSM,
PostgreSQL + PostGIS), Cloudinary image uploads, Socket.io real-time chat. JWT email/password auth.

## Repo layout — npm workspaces monorepo (TypeScript throughout)
- `shared/` — `@neighborly/shared`: the API contract (types only, no runtime code). Single source of truth.
- `client/` — Next.js 16 (App Router, Turbopack) + React 19 + Tailwind v4. UI only; talks to server via REST + socket.io-client.
- `server/` — Express 5 + Socket.io + Drizzle ORM (PostgreSQL/PostGIS), TypeScript run via `tsx`. Owns all data and the WebSocket.
- Two processes: client on :3000, server on :5000. Postgres on :5432.

## Run commands (run from the repo root)
- Install everything: `npm install` (root — sets up all workspaces).
- Server: `npm run dev:server`  (tsx watch; or `cd server && npm run dev`)
- Client: `npm run dev:client`
- Typecheck: `npm run typecheck`  ·  Build: `npm run build`
- DB needs Postgres+PostGIS. Local container:
  `docker run -d --name neighborly-pg -p 5432:5432 -e POSTGRES_USER=neighborly -e POSTGRES_PASSWORD=neighborly -e POSTGRES_DB=neighborly postgis/postgis:16-3.4`
- Schema changes: edit `server/src/db/schema.ts`, then `npm run db:generate -w server` and apply the SQL
  in `server/drizzle/` (e.g. `psql < drizzle/XXXX.sql`). `db:push` works too but prompts on the PostGIS schemas.
- Start the server BEFORE the client. Both must run for chat/geo to work.

## Environment variables (never commit; keep `.env.example` updated)
- server/.env: `PORT, DATABASE_URL, JWT_SECRET, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET, CLIENT_ORIGIN`
- client/.env.local: `NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SOCKET_URL`

## Conventions (follow on EVERY change)
- API responses: success returns the resource/array directly; errors return `{ error: "msg" }`
  with a correct HTTP status. Throw/next to the central error middleware — never `res.send` ad-hoc errors.
- All write/owned routes go through `auth` middleware; check resource ownership before mutate/delete.
- Drizzle: define tables/indexes in `server/src/db/schema.ts`. Use FKs with `onDelete` for integrity.
  Never return `password_hash` — map rows through `db/mappers.ts` (toUserDTO/toItemDTO) which strip it.
- Geo: PostGIS `geometry(point, 4326)` columns, mode `xy` → `{x: lng, y: lat}`. Coordinates are ALWAYS
  `[longitude, latitude]` at the API boundary (GeoJSON order). Distance/radius queries use `::geography`
  casts (`ST_DWithin`, `<->`) so units are meters; keep a GiST index on every geometry column.
- Image uploads: multer memory storage → Cloudinary upload_stream. Store BOTH `url` and `publicId`;
  on item delete, destroy the Cloudinary assets by `publicId`.
- Socket.io: authenticate via JWT in the handshake (`auth.token`); never trust a client-supplied userId —
  use `socket.data.userId` set by the socket auth middleware. Persist every message to Postgres before emitting.
- Validate request bodies; return 400 on bad input. Hash passwords with bcrypt; sign JWTs with `JWT_SECRET`.
- Shared types: API shapes (Item/User/etc.) live ONCE in `@neighborly/shared` and are imported with
  `import type` on both sides. Keep that package types-only (no runtime values) so nothing needs a build.
  Don't redefine a contract type locally — extend or import the shared one.
- Server is ESM + NodeNext: relative imports use the `.js` extension even from `.ts` files.
- Keep files focused: one model/controller/route per resource. Reuse `lib/api.ts` on the client for fetches.
- Tailwind v4 (CSS-first): theme tokens live in `@theme` in `app/globals.css`, not a JS config.
  `@apply` only takes real utilities — never `@apply` another custom component class (group selectors instead).
- Never commit secrets, `.env`, or `node_modules`.

## Local gotchas
- macOS uses port 5000 for AirPlay Receiver. Run the server with `PORT=5001` (and match `NEXT_PUBLIC_*`)
  or turn off AirPlay Receiver in System Settings.
- Cloudinary image uploads need real credentials in `server/.env`; everything else runs without them.

## Definition of done for any feature
Run both servers and manually verify the new flow works end-to-end before claiming completion.
