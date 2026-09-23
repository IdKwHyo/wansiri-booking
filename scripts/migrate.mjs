import fs from 'node:fs/promises';
import postgres from 'postgres';
import {databaseTls} from '../supabase/database-tls.mjs';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.local first.');
const sql = postgres(process.env.DATABASE_URL, {prepare:false, max:1, ssl:databaseTls(process.env.DATABASE_URL)});
try {
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(504821)`;
    if ((await tx`SELECT to_regnamespace('clinic') AS name`)[0].name) {
      throw new Error('The clinic schema already exists. Initial migration was not repeated.');
    }
    await tx.unsafe(await fs.readFile(new URL('../supabase/migrations/001_clinic.sql', import.meta.url),'utf8'));
  });
  console.log('Clinic database created. Follow docs/DEPLOYMENT.md to add your first admin.');
} finally { await sql.end(); }
