const { db } = require('./db');
const { getEnv } = require('./env');
const crypto = require('node:crypto');

const DISCORD_OAUTH2_AUTH_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_OAUTH2_TOKEN_URL = 'https://discord.com/api/v10/oauth2/token';
const DISCORD_API_BASE = 'https://discord.com/api/v10';

// Official OAuth2 Scopes and why they are required
const OAUTH2_PERMISSIONS_EXPLANATION = [
  {
    scope: 'identify',
    purpose: 'Basic Identity & Profile Display',
    why: 'Allows the suite to securely display your Discord username, avatar, and unique ID so you know which account is active. Never requests your password or user token.'
  },
  {
    scope: 'guilds',
    purpose: 'Server Management & Authorization',
    why: 'Enables the suite to verify which servers you own or manage, making it easy to authorize your official business bot on servers where you have management rights.'
  }
];

// Bot Permissions and why they are required
const BOT_PERMISSIONS_EXPLANATION = [
  {
    name: 'View Channels',
    bit: 1024,
    why: 'Allows the bot to see public channels you designate for business research.'
  },
  {
    name: 'Read Message History',
    bit: 65536,
    why: 'Allows reviewing recent public conversations in selected channels to discover potential customer questions and streaming inquiries.'
  },
  {
    name: 'Send Messages',
    bit: 2048,
    why: 'Enables sending messages in authorized channels when you explicitly instruct the bot to respond.'
  },
  {
    name: 'Embed Links',
    bit: 16384,
    why: 'Allows formatted previews, demo links, and clean rich embeds.'
  }
];

/**
 * Retrieve OAuth2 configuration from environment variables or database settings
 */
function getOAuthConfig(customHost = null) {
  // Check environment variables first (.env / process.env), then database settings
  const envClientId = getEnv(['DISCORD_CLIENT_ID', 'DISCORD_APPLICATION_ID', 'CLIENT_ID']);
  const envClientSecret = getEnv(['DISCORD_CLIENT_SECRET', 'CLIENT_SECRET']);
  const envRedirectUri = getEnv(['DISCORD_REDIRECT_URI', 'REDIRECT_URI']);

  const clientIdRow = db.prepare("SELECT value FROM settings WHERE key = 'discord_client_id'").get();
  const clientSecretRow = db.prepare("SELECT value FROM settings WHERE key = 'discord_client_secret'").get();
  const redirectUriRow = db.prepare("SELECT value FROM settings WHERE key = 'discord_redirect_uri'").get();

  const clientId = (envClientId || (clientIdRow ? clientIdRow.value : '')).trim();
  const clientSecret = (envClientSecret || (clientSecretRow ? clientSecretRow.value : '')).trim();

  // If host provided, dynamic default matches running server
  let defaultRedirectUri = 'http://localhost:3000/api/auth/discord/callback';
  if (customHost) {
    const protocol = customHost.includes('localhost') || customHost.includes('127.0.0.1') ? 'http' : 'https';
    defaultRedirectUri = `${protocol}://${customHost}/api/auth/discord/callback`;
  }

  const redirectUri = (envRedirectUri || (redirectUriRow ? redirectUriRow.value : defaultRedirectUri)).trim();

  return {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    is_configured: Boolean(clientId && clientSecret),
    source: envClientId ? 'environment_file' : (clientIdRow ? 'database_settings' : 'none')
  };
}

/**
 * Strict validation of Discord OAuth2 configuration
 * Identifies the exact root causes of "Unknown Application" and user credential confusion
 */
function validateOAuthConfig(config = null) {
  const cfg = config || getOAuthConfig();
  const errors = [];
  const warnings = [];
  const fieldIssues = {
    client_id: null,
    client_secret: null,
    redirect_uri: null
  };

  const clientId = (cfg.client_id || '').trim();
  const clientSecret = (cfg.client_secret || '').trim();
  const redirectUri = (cfg.redirect_uri || '').trim();

  // 1. Client ID validation
  if (!clientId) {
    const msg = 'Discord OAuth2 Client ID is missing. You need your 18-20 digit Application ID from the Discord Developer Portal.';
    errors.push(msg);
    fieldIssues.client_id = msg;
  } else if (clientId.includes('.')) {
    // User accidentally entered a Bot Token (which has dots)
    const msg = 'The Client ID you entered appears to be a Discord Bot Token (it contains dots). The Client ID must be the 18-20 digit Application ID found under "General Information" in the Discord Developer Portal.';
    errors.push(msg);
    fieldIssues.client_id = msg;
  } else if (/^[a-f0-9]{32}$/i.test(clientId)) {
    // User accidentally entered a 32-character Client Secret
    const msg = 'The Client ID you entered appears to be a Client Secret (32 hex characters). The Client ID is the numeric Application ID.';
    errors.push(msg);
    fieldIssues.client_id = msg;
  } else if (/^[a-f0-9]{64}$/i.test(clientId)) {
    // User accidentally entered a 64-character Public Key
    const msg = 'The Client ID you entered appears to be a Public Key (64 characters). The Client ID is the 18-20 digit Application ID.';
    errors.push(msg);
    fieldIssues.client_id = msg;
  } else if (!/^\d{17,20}$/.test(clientId)) {
    const msg = `Invalid Client ID format: "${clientId}". Discord Application IDs are purely numeric strings with 17 to 20 digits.`;
    errors.push(msg);
    fieldIssues.client_id = msg;
  } else if (clientId === '123456789012345678' || clientId === '000000000000000000') {
    const msg = 'The Client ID is set to a placeholder number. Replace it with your authentic Application ID from Discord Developer Portal.';
    errors.push(msg);
    fieldIssues.client_id = msg;
  }

  // 2. Client Secret validation
  if (!clientSecret) {
    const msg = 'Discord OAuth2 Client Secret is missing. Under Discord Developer Portal -> your app -> "OAuth2" -> "General", copy or reset your Client Secret.';
    errors.push(msg);
    fieldIssues.client_secret = msg;
  } else if (/^\d{17,20}$/.test(clientSecret)) {
    // User accidentally entered numeric Application ID into Secret
    const msg = 'The Client Secret you entered is a numeric ID. You appear to have pasted the Application ID into the Client Secret field.';
    errors.push(msg);
    fieldIssues.client_secret = msg;
  } else if (clientSecret.includes('.')) {
    const msg = 'The Client Secret appears to be a Bot Token (contains dots). Paste your 32-character Client Secret from OAuth2 -> General.';
    errors.push(msg);
    fieldIssues.client_secret = msg;
  }

  // 3. Redirect URI validation
  if (!redirectUri) {
    const msg = 'Redirect URI is missing.';
    errors.push(msg);
    fieldIssues.redirect_uri = msg;
  } else {
    try {
      const parsedUrl = new URL(redirectUri);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        errors.push('Redirect URI must start with http:// or https://');
      }
      if (!parsedUrl.pathname.endsWith('/api/auth/discord/callback')) {
        warnings.push(`Warning: Redirect URI path should typically be "/api/auth/discord/callback". Current: "${parsedUrl.pathname}"`);
      }
    } catch (e) {
      errors.push(`Invalid Redirect URI format: ${e.message}`);
      fieldIssues.redirect_uri = 'Invalid URL format';
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fieldIssues,
    config: {
      client_id: clientId,
      has_secret: Boolean(clientSecret),
      redirect_uri: redirectUri,
      is_configured: Boolean(clientId && clientSecret)
    }
  };
}

/**
 * Save OAuth2 configuration into database settings
 */
function saveOAuthConfig({ client_id, client_secret, redirect_uri }) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  if (client_id !== undefined) stmt.run('discord_client_id', (client_id || '').trim());
  if (client_secret !== undefined) stmt.run('discord_client_secret', (client_secret || '').trim());
  if (redirect_uri !== undefined) stmt.run('discord_redirect_uri', (redirect_uri || '').trim());

  const current = getOAuthConfig();
  const validation = validateOAuthConfig(current);

  return {
    ok: true,
    config: current,
    validation
  };
}

/**
 * Generate Discord OAuth2 Authorization URL with pre-validation
 * Prevents redirecting to Discord's "Unknown Application" page if credentials are invalid
 */
function getAuthorizationUrl(customHost = null) {
  const config = getOAuthConfig(customHost);
  const validation = validateOAuthConfig(config);

  if (!validation.valid) {
    return {
      ok: false,
      error: validation.errors[0] || 'Discord OAuth2 is not properly configured.',
      validation
    };
  }

  const state = crypto.randomBytes(12).toString('hex');

  // Scopes: strictly 'identify' for account identity and 'guilds' for managing servers
  const params = new URLSearchParams({
    client_id: config.client_id,
    redirect_uri: config.redirect_uri,
    response_type: 'code',
    scope: 'identify guilds',
    prompt: 'consent',
    state: state
  });

  const url = `${DISCORD_OAUTH2_AUTH_URL}?${params.toString()}`;

  return {
    ok: true,
    url,
    state,
    config
  };
}

/**
 * Exchange OAuth2 Authorization Code for Access & Refresh Tokens
 */
async function exchangeCodeForTokens(code, customHost = null) {
  const config = getOAuthConfig(customHost);
  const validation = validateOAuthConfig(config);

  if (!validation.valid) {
    return {
      ok: false,
      error: `OAuth2 Configuration Error: ${validation.errors.join('; ')}`
    };
  }

  const params = new URLSearchParams({
    client_id: config.client_id,
    client_secret: config.client_secret,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: config.redirect_uri
  });

  try {
    const res = await fetch(DISCORD_OAUTH2_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    const data = await res.json();
    if (!res.ok) {
      let friendlyError = data.error_description || data.error || 'Failed to exchange authorization code.';

      if (data.error === 'invalid_client') {
        friendlyError = 'Invalid Client ID or Client Secret. Please verify your Application ID and Client Secret in Discord Developer Portal.';
      } else if (data.error === 'invalid_grant') {
        friendlyError = 'The Discord authorization code has expired or was already used. Please click Login again.';
      } else if (data.error === 'redirect_uri_mismatch') {
        friendlyError = `Redirect URI Mismatch: The registered redirect URI in Discord Developer Portal does not match: ${config.redirect_uri}`;
      }

      return {
        ok: false,
        error: friendlyError,
        raw: data
      };
    }

    return { ok: true, tokens: data };
  } catch (err) {
    return { ok: false, error: `Network error exchanging OAuth code with Discord: ${err.message}` };
  }
}

/**
 * Fetch authenticated Discord user profile
 */
async function fetchDiscordProfile(accessToken) {
  try {
    const res = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.message || 'Failed to fetch user profile' };
    }

    return { ok: true, profile: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Fetch user's joined Discord servers (guilds)
 */
async function fetchUserGuilds(accessToken) {
  try {
    const res = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.message || 'Failed to fetch user guilds' };
    }

    return { ok: true, guilds: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Save or update Discord session in database
 */
function createOrUpdateSession(profile, tokens = {}, guilds = []) {
  const sessionId = 'session_primary';
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const avatarUrl = profile.id && profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5)}.png`;

  db.prepare(`
    INSERT INTO discord_sessions (
      id, discord_user_id, username, global_name, avatar, email,
      access_token, refresh_token, expires_at, guilds, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      discord_user_id = excluded.discord_user_id,
      username = excluded.username,
      global_name = excluded.global_name,
      avatar = excluded.avatar,
      email = excluded.email,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      guilds = excluded.guilds,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    sessionId,
    profile.id,
    profile.username,
    profile.global_name || profile.username,
    avatarUrl,
    profile.email || null,
    tokens.access_token || null,
    tokens.refresh_token || null,
    expiresAt,
    JSON.stringify(guilds || [])
  );

  return getActiveSession();
}

/**
 * Get current active Discord session
 */
function getActiveSession() {
  const row = db.prepare('SELECT * FROM discord_sessions WHERE id = ?').get('session_primary');
  if (!row) return null;

  return {
    ...row,
    guilds: JSON.parse(row.guilds || '[]')
  };
}

/**
 * Log out active Discord session
 */
function clearSession() {
  db.prepare('DELETE FROM discord_sessions WHERE id = ?').run('session_primary');
  return { ok: true };
}

/**
 * Beginner-friendly diagnostic report explaining exact steps for Discord Developer Portal
 */
function getOAuthDiagnosticStatus(reqHost = 'localhost:3000') {
  const config = getOAuthConfig(reqHost);
  const validation = validateOAuthConfig(config);

  const exactRedirectUri = config.redirect_uri;

  const setupSteps = [
    {
      step: 1,
      title: 'Open Discord Developer Portal',
      instruction: 'Go to https://discord.com/developers/applications and log in with your Discord account.',
      action_url: 'https://discord.com/developers/applications'
    },
    {
      step: 2,
      title: 'Select or Create Your Application',
      instruction: 'Click on your existing application (or click "New Application", name it "ELITE VISION GLOBAL" or your preferred name, and click Create).'
    },
    {
      step: 3,
      title: 'Copy Your Application ID (Client ID)',
      instruction: 'Go to "General Information" on the left menu. Find "APPLICATION ID", click "Copy", and paste it into the Client ID field in this dashboard.',
      note: 'The Application ID is a 18-20 digit number (e.g. 1341234567890123456). DO NOT copy your Public Key or Bot Token.'
    },
    {
      step: 4,
      title: 'Copy or Reset Your Client Secret',
      instruction: 'Go to "OAuth2" -> "General" on the left menu. Under "CLIENT SECRET", click "Reset Secret" or copy the 32-character secret key, and paste it into this dashboard.'
    },
    {
      step: 5,
      title: 'Register the Exact Redirect URI',
      instruction: `In Discord Developer Portal under "OAuth2" -> "Redirects", click "Add Redirect" and add this EXACT URL:\n${exactRedirectUri}`,
      exact_redirect_uri: exactRedirectUri,
      note: 'Must match character-for-character including http:// and the exact port number (e.g. 3000).'
    },
    {
      step: 6,
      title: 'Save Changes on Discord',
      instruction: 'Click the green "Save Changes" bar at the bottom of the Discord Developer Portal page.'
    }
  ];

  return {
    is_ready: validation.valid,
    validation,
    exact_redirect_uri: exactRedirectUri,
    setup_steps: setupSteps
  };
}

module.exports = {
  OAUTH2_PERMISSIONS_EXPLANATION,
  BOT_PERMISSIONS_EXPLANATION,
  getOAuthConfig,
  validateOAuthConfig,
  saveOAuthConfig,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  fetchDiscordProfile,
  fetchUserGuilds,
  createOrUpdateSession,
  getActiveSession,
  clearSession,
  getOAuthDiagnosticStatus
};
