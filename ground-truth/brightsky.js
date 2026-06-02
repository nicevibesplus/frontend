// brightsky.js
// Fetches recent weather observations for a single DWD station.
//
// Exported:
//   fetchWeather(dwdStationId) → { temperature, ... } | null
//
// The returned object uses phenomenon names that match the `phenomenon`
// column in the sensors table, so feed-measurements.js can look up values
// without any extra mapping logic.

const BRIGHTSKY_API = 'https://api.brightsky.dev';

// Maps sensors.phenomenon values → Bright Sky field names.
// Extend this when you add new sensor types.
const PHENOMENON_TO_FIELD = {
  temperature:       'temperature',        // °C
  humidity:          'relative_humidity',  // %
  wind_speed:        'wind_speed',         // km/h
  wind_direction:    'wind_direction',     // °
  precipitation:     'precipitation',      // mm
  pressure:          'pressure_msl',       // hPa
  sunshine:          'sunshine',           // min
  visibility:        'visibility',         // m
};

/**
 * Fetches the most recent weather observation for a DWD station.
 * Looks back 2 hours to guarantee at least one data point.
 *
 * @param {string} dwdStationId  Zero-padded 5-digit DWD ID, e.g. "00044"
 * @returns {Object|null}  Flat object keyed by phenomenon name, or null on failure.
 *                         e.g. { temperature: 12.3, humidity: 78, … }
 */
export async function fetchWeather(dwdStationId) {
  const now         = new Date();
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);

  const url =
    `${BRIGHTSKY_API}/weather` +
    `?dwd_station_id=${dwdStationId}` +
    `&date=${twoHoursAgo.toISOString()}` +
    `&last_date=${now.toISOString()}` +
    `&tz=Europe/Berlin`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Bright Sky request failed for station ${dwdStationId}: ${response.status}`);
  }

  const data = await response.json();

  // Use the most recent record that has at least a temperature reading
  const recent = data.weather
    .filter(w => w.temperature !== null)
    .at(-1);

  if (!recent) return null;

  // Build a flat { phenomenon → value } object so the caller doesn't need
  // to know Bright Sky's internal field names
  const result = { timestamp: recent.timestamp };

  for (const [phenomenon, field] of Object.entries(PHENOMENON_TO_FIELD)) {
    const value = recent[field];
    if (value !== null && value !== undefined) {
      result[phenomenon] = value;
    }
  }

  return result;
}