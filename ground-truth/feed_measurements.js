// feed-measurements.js
// Reads active stations + their sensors from PostgreSQL, fetches current
// weather from Bright Sky for each station, and posts every sensor value
// to openSenseMap.
//
// Required .env keys:
//   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
//   POLL_INTERVAL_MS  – e.g. 900000 for 15 min (default: 15 min)
//
// Usage: node feed-measurements.js

import 'dotenv/config';
import { pool }         from './db.js';
import { fetchWeather } from './brightsky.js';

//const OPENSENSEMAP_API = 'https://api.opensensemap.org';
const OPENSENSEMAP_API = 'http://localhost:3000';  
//const OPENSENSEMAP_API = 'https://staging.opensensemap.org/api';

const INTERVAL_MS      = Number(process.env.POLL_INTERVAL_MS) || 15 * 60 * 1000;

// ── Database ──────────────────────────────────────────────────────────────────

/**
 * Loads all active stations with their boxes and sensors from the DB.
 * Returns one object per station, with sensors as a nested array.
 *
 * Shape:
 * [
 *   {
 *     dwdStationId: '00044',
 *     name: 'Großenkneten Niedersachsen',
 *     boxId: '…',
 *     boxToken: '…',
 *     sensors: [
 *       { sensorId: '…', phenomenon: 'temperature', unit: '°C' },
 *     ]
 *   },
 *   …
 * ]
 */
async function loadStations() {
  const { rows } = await pool.query(`
    SELECT
      st.dwd_station_id  AS "dwdStationId",
      st.name,
      sb.box_id          AS "boxId",
      sb.box_token       AS "boxToken",
      se.sensor_id       AS "sensorId",
      se.phenomenon,
      se.unit
    FROM   stations  st
    JOIN   senseboxes sb ON sb.dwd_station_id = st.dwd_station_id
    JOIN   sensors    se ON se.box_id          = sb.box_id
    WHERE  st.is_active = true
    ORDER  BY st.dwd_station_id, se.phenomenon
  `);

  // Group the flat rows into per-station objects with a sensors array
  const map = new Map();

  for (const row of rows) {
    if (!map.has(row.dwdStationId)) {
      map.set(row.dwdStationId, {
        dwdStationId: row.dwdStationId,
        name:         row.name,
        boxId:        row.boxId,
        boxToken:     row.boxToken,
        sensors:      [],
      });
    }
    map.get(row.dwdStationId).sensors.push({
      sensorId:   row.sensorId,
      phenomenon: row.phenomenon,
      unit:       row.unit,
    });
  }

  return [...map.values()];
}

// ── openSenseMap ──────────────────────────────────────────────────────────────

/**
 * Posts a single measurement to openSenseMap.
 *
 * @param {string} boxId
 * @param {string} sensorId
 * @param {number} value
 * @param {string} createdAt  UTC ISO 8601 string
 * @param {string} boxToken
 */
async function postMeasurements(boxId, measurements, boxToken) {
  const url = `${OPENSENSEMAP_API}/boxes/${boxId}/data`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':          'application/json',
      'x-osem-device-api-key': boxToken,
    },
    // Array format: [{ sensor: sensorId, value, createdAt }, …]
    body: JSON.stringify(measurements),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OSM POST failed (box ${boxId}): ${response.status} — ${errorText}`);
  }
}

// ── Per-station handler ───────────────────────────────────────────────────────

async function processStation(station) {
  const { dwdStationId, name, boxId, boxToken, sensors } = station;

  // One Bright Sky request covers all sensors for this station
  const weather = await fetchWeather(dwdStationId);

  if (!weather) {
    console.warn(`  [${name}] No weather data returned — skipping.`);
    return;
  }

  const createdAt = new Date(weather.timestamp).toISOString();

  const measurements = sensors
      .filter(({ phenomenon }) => {
        if (weather[phenomenon] === undefined) {
          console.warn(`  [${name}] No value for "${phenomenon}" — skipping sensor.`);
          return false;
        }
        return true;
      })
      .map(({ sensorId, phenomenon }) => ({
        sensor:    sensorId,
        value:     weather[phenomenon],
        createdAt,
      }));

    if (measurements.length === 0) return;

    await postMeasurements(boxId, measurements, boxToken);
    console.log(`  [${name}] Posted ${measurements.length} measurement(s) @ ${createdAt}`);
  }

// ── Main loop ─────────────────────────────────────────────────────────────────

async function run() {
  const label = new Date().toLocaleString('de-DE');

  // Re-query the DB on every run so newly registered stations are picked up
  // automatically without restarting the process
  let stations;
  try {
    stations = await loadStations();
  } catch (err) {
    console.error(`[${label}] ✘ Could not load stations from DB:`, err.message);
    return;
  }

  console.log(`\n[${label}] Running update for ${stations.length} station(s)…`);

  const outcomes = await Promise.allSettled(
    stations.map(s => processStation(s))
  );

  for (let i = 0; i < outcomes.length; i++) {
    if (outcomes[i].status === 'rejected') {
      console.error(`  ✘ [${stations[i].name}]`, outcomes[i].reason.message);
    }
  }
}

async function main() {
  // Verify DB connectivity before starting the loop
  try {
    await pool.query('SELECT 1');
    console.log('[DB]  Connected to PostgreSQL');
  } catch (err) {
    console.error('[DB]  Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  console.log(`Starting feeder. Interval: ${INTERVAL_MS / 60000} min.`);
  console.log('Stations are loaded from the DB on every run — no restart needed for new stations.\n');

  await run();
  setInterval(run, INTERVAL_MS);
}

main().catch(err => {
  console.error('✘ Fatal:', err.message);
  process.exit(1);
});