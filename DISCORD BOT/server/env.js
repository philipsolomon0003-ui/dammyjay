const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.join(__dirname, '..', '.env');

/**
 * Load .env file into process.env if present
 */
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    return {};
  }

  try {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    const lines = content.split('\n');
    const parsed = {};

    for (const rawLine of lines) {
      const line = rawLine.trim();
      // Skip comments and empty lines
      if (!line || line.startsWith('#')) continue;

      const equalIndex = line.indexOf('=');
      if (equalIndex === -1) continue;

      const key = line.slice(0, equalIndex).trim();
      let value = line.slice(equalIndex + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      parsed[key] = value;
      // Only set in process.env if not already set by system
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }

    return parsed;
  } catch (err) {
    console.warn('Warning: Could not read .env file:', err.message);
    return {};
  }
}

/**
 * Helper to get an environment variable with fallback options
 */
function getEnv(keys, fallback = '') {
  const keyList = Array.isArray(keys) ? keys : [keys];
  for (const k of keyList) {
    if (process.env[k] && process.env[k].trim()) {
      return process.env[k].trim();
    }
  }
  return fallback;
}

// Automatically load on require
loadEnv();

module.exports = {
  loadEnv,
  getEnv,
  ENV_PATH
};
