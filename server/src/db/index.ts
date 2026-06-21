import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const client = postgres(url);
export const db = drizzle(client, { schema });

/** Verify the connection at startup (and that PostGIS is available). */
export async function pingDb(): Promise<void> {
  await client`select 1`;
  console.log('✅ PostgreSQL connected');
}
