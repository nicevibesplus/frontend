// register-stations-run.js
// Example caller for register-station.js.
// Run this manually whenever you want to register a batch of new stations.
//
// Required .env keys:
//   OPENSENSEMAP_EMAIL, OPENSENSEMAP_PASSWORD
//   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD

import 'dotenv/config';
import pg from 'pg';
import { osmSignIn, registerStation } from './register_station.js';

const { Client } = pg;

// ── Stations to register ──────────────────────────────────────────────────────
// Add entries here; remove any already in the database.

const STATIONS = [
  //{ dwdStationId: '00044', name: 'Großenkneten Niedersachsen',    lat: 52.9336, lon:  8.2370 },
  //{ dwdStationId: '00073', name: 'Aldersbach-Kramersepp Bayern',  lat: 48.6183, lon: 13.0620 },
  { dwdStationId: '00078', name: 'Testing Alfhausen Niedersachsen',       lat: 52.4853, lon:  7.9125 },
];

async function main() {
  const pgClient = new Client();
  await pgClient.connect();
  console.log('[DB]  Connected to PostgreSQL\n');

  const osmToken = await osmSignIn(
    process.env.OPENSENSEMAP_EMAIL,
    process.env.OPENSENSEMAP_PASSWORD,
  );

  for (const station of STATIONS) {
    await registerStation(station, pgClient, osmToken);
  }

  await pgClient.end();
  console.log('[DB]  Connection closed. All done.');
}

main().catch(err => {
  console.error('✘ Fatal:', err.message);
  process.exit(1);
});