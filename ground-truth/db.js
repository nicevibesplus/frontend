// db.js
// Exports a single shared pg Pool.
// Import this wherever you need a DB connection — both feed-measurements.js
// and sync-stations.js use the same pool rather than each managing their own.
//
// Required .env keys:
//   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD

import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host:     process.env.PGHOST,
  port:     Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE,
  user:     process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

// Surface connection errors immediately rather than silently at first query
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});