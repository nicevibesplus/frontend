//process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// register-station.js
// Exports a single function: registerStation(station, pgClient, osmToken)
//
// What it does:
//   1. Creates a senseBox on openSenseMap for the given station
//   2. Writes the station, box, and sensor rows to PostgreSQL
//
// Parameters:
//   station   – { dwdStationId, name, lat, lon }
//   pgClient  – an already-connected node-postgres Client or PoolClient
//   osmToken  – openSenseMap Bearer token (from sign-in, not per-box)
//
// Returns:
//   { boxId, boxToken, temperatureSensorId }
//
// Required .env keys (consumed by the caller, not here):
//   OPENSENSEMAP_EMAIL, OPENSENSEMAP_PASSWORD  → used to get osmToken
//   PG_*                                       → used to create pgClient


//const OPENSENSEMAP_API = 'https://api.opensensemap.org';
const OPENSENSEMAP_API = 'http://localhost:3000/api';  // For testing against a local mock server instead of the real API
//const OPENSENSEMAP_API = 'https://staging.opensensemap.org/api/';


// ── openSenseMap ──────────────────────────────────────────────────────────────

async function createBox(station, osmToken) {
  console.log(`  [OSM] Creating box for "${station.name}" (DWD ${station.dwdStationId})…`);

  const res = await fetch(`${OPENSENSEMAP_API}/boxes`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${osmToken}`,
    },
    body: JSON.stringify({
      name:     station.name,
      exposure: 'outdoor',
      location: {
        lat:    station.lat,
        lng:    station.lon,
        height: 0,
      },
      sensors: [
        {
          id: "0", 
          title:      'Temperature',
          unit:       '°C',
          sensorType: 'DWD',
          icon:       'osem-thermometer',
        },
      ],
    }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    throw new Error(`OSM box creation failed: ${res.status} — ${JSON.stringify(data)}`);
  }

  const boxId      = data._id;
  const boxToken   = data.access_token;
  const tempSensor = data.sensors.find(s => s.title === 'Temperature');

  if (!boxToken) throw new Error(`OSM did not return an access_token for box ${boxId}`);
  if (!tempSensor) throw new Error(`OSM response missing Temperature sensor for box ${boxId}`);

  console.log(`  [OSM] ✔ Box created`);
  console.log(`         box_id:    ${boxId}`);
  console.log(`         sensor_id: ${tempSensor._id}`);
  console.log(`         token:     ${boxToken}`);

  return { boxId, boxToken, temperatureSensorId: tempSensor._id };
}

// ── PostgreSQL writes ─────────────────────────────────────────────────────────

async function writeToDatabase(station, boxId, boxToken, temperatureSensorId, pgClient) {
  console.log(`  [DB]  Writing to database…`);

  // Wrap all three inserts in a transaction so a partial failure leaves
  // no orphaned rows — either everything is saved or nothing is.
  await pgClient.query('BEGIN');

  try {
    // 1. stations
    await pgClient.query(
      `INSERT INTO stations (dwd_station_id, name, lat, lon, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (dwd_station_id) DO NOTHING`,
      [station.dwdStationId, station.name, station.lat, station.lon]
    );
    console.log(`  [DB]  ✔ stations row saved (${station.dwdStationId})`);

    // 2. senseboxes
    await pgClient.query(
      `INSERT INTO senseboxes (box_id, dwd_station_id, box_token)
       VALUES ($1, $2, $3)`,
      [boxId, station.dwdStationId, boxToken]
    );
    console.log(`  [DB]  ✔ senseboxes row saved (${boxId})`);

    // 3. sensors — one row per sensor; easily extended for humidity etc.
    await pgClient.query(
      `INSERT INTO sensors (sensor_id, box_id, phenomenon, unit)
       VALUES ($1, $2, $3, $4)`,
      [temperatureSensorId, boxId, 'temperature', '°C']
    );
    console.log(`  [DB]  ✔ sensors row saved (${temperatureSensorId})`);

    await pgClient.query('COMMIT');
    console.log(`  [DB]  ✔ Transaction committed`);

  } catch (err) {
    await pgClient.query('ROLLBACK');
    console.error(`  [DB]  ✘ Transaction rolled back:`, err.message);
    throw err;
  }
}

// ── Exported function ─────────────────────────────────────────────────────────

/**
 * Registers a single DWD station as an openSenseMap box and persists all
 * generated IDs and tokens to PostgreSQL.
 *
 * @param {{ dwdStationId: string, name: string, lat: number, lon: number }} station
 * @param {import('pg').Client | import('pg').PoolClient} pgClient
 * @param {string} osmToken  Bearer token from openSenseMap sign-in
 * @returns {Promise<{ boxId: string, boxToken: string, temperatureSensorId: string }>}
 */
export async function registerStation(station, pgClient, osmToken) {
  console.log(`\n── Registering station: ${station.name} (DWD ${station.dwdStationId})`);

  const { boxId, boxToken, temperatureSensorId } = await createBox(station, osmToken);
  await writeToDatabase(station, boxId, boxToken, temperatureSensorId, pgClient);

  console.log(`── ✔ Done: ${station.name}\n`);
  return { boxId, boxToken, temperatureSensorId };
}

// ── openSenseMap sign-in helper (exported for convenience) ───────────────────

/**
 * Signs in to openSenseMap and returns a Bearer token.
 * Call this once and pass the token to all registerStation() calls.
 */
export async function osmSignIn(email, password) {
  console.log(`[OSM] Signing in as ${email}…`);

  const res = await fetch(`${OPENSENSEMAP_API}/users/sign-in`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });

  const text = await res.text();

  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  
  if (!res.ok) throw new Error(`OSM sign-in failed: ${res.status} — ${JSON.stringify(data)}`);

  console.log(`[OSM] ✔ Signed in`);
  return data.token;
}