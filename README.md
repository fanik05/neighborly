# Neighborly — Hyperlocal Community Marketplace

A platform where neighbors **buy, sell, or loan** tools and goods nearby.

- 📍 **Geolocation** — find items near you (Leaflet + OpenStreetMap, PostgreSQL + PostGIS).
- 🖼️ **Image uploads** — listing photos on Cloudinary.
- 💬 **Real-time chat** — neighbor-to-neighbor messaging via Socket.io.
- 🔐 **Auth** — JWT email/password.

## Stack
TypeScript end-to-end · **PERN** — PostgreSQL + PostGIS · Express 5 · React 19 (Next.js 16 App Router) · Node.js
ORM: **Drizzle** · Socket.io · Cloudinary · Tailwind v4
Structured as an **npm workspaces monorepo** with a shared types package.

## Project layout
```
neighborly/
├── shared/   # @neighborly/shared — API contract types (client + server import these)
├── client/   # Next.js frontend
└── server/   # Express + Socket.io API + Drizzle/PostGIS (TypeScript via tsx)
```

## Getting started

```bash
# from the repo root — installs all workspaces at once
npm install

# start Postgres + PostGIS (Docker)
docker run -d --name neighborly-pg -p 5432:5432 \
  -e POSTGRES_USER=neighborly -e POSTGRES_PASSWORD=neighborly -e POSTGRES_DB=neighborly \
  postgis/postgis:16-3.4

# fill in credentials
cp server/.env.example server/.env          # DATABASE_URL, JWT_SECRET, CLOUDINARY_*, CLIENT_ORIGIN
cp client/.env.example client/.env.local    # NEXT_PUBLIC_API_URL / NEXT_PUBLIC_SOCKET_URL

# create the schema
npm run db:generate -w server               # then apply server/drizzle/*.sql (psql < ...)

# run (two terminals)
npm run dev:server   # http://localhost:5000  (start this first)
npm run dev:client   # http://localhost:3000
```

> macOS note: port 5000 is used by AirPlay Receiver — run with `PORT=5001` and point
> `client/.env.local` at `http://localhost:5001` (or disable AirPlay Receiver).

Useful: `npm run typecheck` and `npm run build` (both run across all workspaces).
Start the **server before the client**. Both must run for chat and geolocation to work.

## Build phases
- **Phase 1** — auth + item listings + Cloudinary image uploads ✅ scaffolded here.
- **Phase 2** — geolocation / "items near me" + Leaflet map ✅
- **Phase 3** — Socket.io chat + loan request workflow.

See `CLAUDE.md` for standing engineering conventions.
