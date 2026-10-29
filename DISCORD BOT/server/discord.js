const { db } = require('./db');
const { getEnv } = require('./env');

const DISCORD_API_BASE = 'https://discord.com/api/v10';

// Core Discord Permissions Bitwise mapping
const DISCORD_PERMISSIONS = [
  { bit: 0x8n, name: 'Administrator', desc: 'Full administrative access on the server' },
  { bit: 0x400n, name: 'View Channels', desc: 'Allows the bot to view public text channels' },
  { bit: 0x800n, name: 'Send Messages', desc: 'Allows the bot to send messages in authorized channels' },
  { bit: 0x10000n, name: 'Read Message History', desc: 'Allows the bot to read previous messages for research' },
  { bit: 0x4000n, name: 'Embed Links', desc: 'Enables rich previews and formatted links' },
  { bit: 0x8000n, name: 'Attach Files', desc: 'Allows sending demo APK files or portfolio screenshots' },
  { bit: 0x40n, name: 'Add Reactions', desc: 'Allows reacting to messages' },
  { bit: 0x2000n, name: 'Manage Messages', desc: 'Allows organizing channel messages' }
];

/**
 * Retrieve saved bot token from environment or SQLite settings
 */
function getSavedBotToken() {
  const envToken = getEnv(['DISCORD_BOT_TOKEN', 'BOT_TOKEN']);
  if (envToken) return envToken;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'discord_bot_token'").get();
  return row ? row.value : null;
}

/**
 * Save or update bot token in SQLite settings
 */
function saveBotToken(token) {
  const trimmed = (token || '').trim();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('discord_bot_token', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(trimmed);
  return { success: true };
}

/**
 * Decode Discord permissions bitfield into a list of human-readable permissions
 */
function decodePermissions(bitfield) {
  if (!bitfield) return ['Basic Access'];
  try {
    const bitBigInt = BigInt(bitfield);
    const activePerms = [];
    for (const p of DISCORD_PERMISSIONS) {
      if ((bitBigInt & p.bit) === p.bit) {
        activePerms.push(p.name);
      }
    }
    return activePerms.length > 0 ? activePerms : ['View Channels (Default)'];
  } catch (err) {
    return ['Authorized Member'];
  }
}

/**
 * Generate official Discord Bot authorization / invite URL
 * Scopes: bot + applications.commands
 * Default permissions: View Channels (1024) + Send Messages (2048) + Read History (65536) = 68608
 */
function generateBotInviteUrl(clientId = null, permissions = '68608') {
  let targetId = clientId;
  if (!targetId) {
    const envClientId = getEnv(['DISCORD_CLIENT_ID', 'DISCORD_APPLICATION_ID', 'CLIENT_ID']);
    const clientRow = db.prepare("SELECT value FROM settings WHERE key = 'discord_client_id'").get();
    targetId = (envClientId || (clientRow ? clientRow.value : '')).trim();
  }

  if (!targetId || !/^\d{17,20}$/.test(targetId)) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: targetId,
    permissions: permissions.toString(),
    scope: 'bot applications.commands'
  });

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

/**
 * Standard fetch wrapper for Discord REST API v10 with rate-limit and error handling
 */
async function discordFetch(endpoint, token = null, options = {}) {
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'ELITE-VISION-GLOBAL-Suite/1.0.0 (https://discord.com)',
    ...(options.headers || {})
  };

  const authToken = token || getSavedBotToken();
  if (authToken) {
    const formattedToken = authToken.startsWith('Bot ') ? authToken : `Bot ${authToken}`;
    headers['Authorization'] = formattedToken;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${DISCORD_API_BASE}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after') || '2';
      return {
        ok: false,
        status: 429,
        error: `Discord API rate limited. Please retry in ${retryAfter} seconds.`,
        retryAfter: parseFloat(retryAfter)
      };
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      let msg = errorData.message || `Discord API request failed with status ${res.status}`;

      if (res.status === 401) {
        msg = 'Invalid or unauthorized Discord Bot Token. Please verify your token in Bot & API Setup.';
      } else if (res.status === 403) {
        if (errorData.code === 50001) {
          msg = 'Missing Access: The bot is not in this server or lacks required permissions.';
        } else if (errorData.code === 50013) {
          msg = 'Missing Permissions: The bot does not have permission to view or read messages in this channel.';
        }
      } else if (res.status === 404) {
        msg = 'Discord resource not found (invalid channel, expired invite, or deleted server).';
      }

      return {
        ok: false,
        status: res.status,
        code: errorData.code,
        error: msg,
        details: errorData
      };
    }

    const data = await res.json();
    return {
      ok: true,
      status: res.status,
      data
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: `Network error connecting to Discord API: ${err.message}`
    };
  }
}

/**
 * Clean and extract invite code from a URL or raw string
 */
function extractInviteCode(input) {
  if (!input) return null;
  const cleaned = input.trim();
  const match = cleaned.match(/(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)?([a-zA-Z0-9\-_]+)/);
  return match ? match[1] : cleaned;
}

/**
 * Resolve an invite code using Discord's official public API
 */
async function resolveInvite(inviteInput) {
  const code = extractInviteCode(inviteInput);
  if (!code) {
    return { ok: false, error: 'Invalid invite format provided.' };
  }

  const result = await discordFetch(`/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`, null);
  if (!result.ok) {
    return result;
  }

  const d = result.data;
  const guild = d.guild || {};

  const iconUrl = guild.id && guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
    : null;

  const bannerUrl = guild.id && guild.banner
    ? `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.png`
    : null;

  return {
    ok: true,
    data: {
      guild_id: guild.id,
      name: guild.name,
      description: guild.description || 'No public description provided by server admins.',
      code: d.code,
      invite_url: `https://discord.gg/${d.code}`,
      icon_url: iconUrl,
      banner_url: bannerUrl,
      member_count: d.approximate_member_count || 0,
      presence_count: d.approximate_presence_count || 0,
      verification_level: guild.verification_level,
      features: guild.features || [],
      nsfw: guild.nsfw || false,
      channel: d.channel ? { id: d.channel.id, name: d.channel.name } : null,
      inviter: d.inviter ? { id: d.inviter.id, username: d.inviter.username } : null,
      expires_at: d.expires_at || null
    }
  };
}

/**
 * Verify current bot token and return bot user profile
 */
async function getBotUser(token = null) {
  return await discordFetch('/users/@me', token);
}

/**
 * List all guilds (servers) the authorized bot is currently in
 */
async function getBotGuilds(token = null) {
  const result = await discordFetch('/users/@me/guilds?with_counts=true', token);
  if (result.ok && Array.isArray(result.data)) {
    // Enrich with permissions breakdown and icons
    result.data = result.data.map(g => {
      const iconUrl = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null;
      const permissionsList = decodePermissions(g.permissions);
      return {
        id: g.id,
        name: g.name,
        icon_url: iconUrl,
        banner_url: g.banner ? `https://cdn.discordapp.com/banners/${g.id}/${g.banner}.png` : null,
        owner: g.owner,
        permissions_bitfield: g.permissions,
        permissions_breakdown: permissionsList,
        approximate_member_count: g.approximate_member_count || 0,
        approximate_presence_count: g.approximate_presence_count || 0,
        features: g.features || []
      };
    });
  }
  return result;
}

/**
 * Get detailed information for a specific guild
 */
async function getGuildDetails(guildId, token = null) {
  const result = await discordFetch(`/guilds/${guildId}?with_counts=true`, token);
  if (result.ok) return result;
  return await discordFetch(`/guilds/${guildId}/preview`, token);
}

/**
 * Fetch channels for an authorized guild
 * Filters to text and announcement channels (types 0, 5)
 */
async function getGuildChannels(guildId, token = null) {
  const result = await discordFetch(`/guilds/${guildId}/channels`, token);
  if (result.ok && Array.isArray(result.data)) {
    // Filter for text (0), announcement (5), or forum (15) channels
    const readableChannels = result.data
      .filter(ch => ch.type === 0 || ch.type === 5 || ch.type === 15)
      .map(ch => ({
        id: ch.id,
        guild_id: ch.guild_id,
        name: ch.name,
        type: ch.type,
        topic: ch.topic || '',
        position: ch.position,
        parent_id: ch.parent_id
      }))
      .sort((a, b) => a.position - b.position);

    return { ok: true, data: readableChannels };
  }
  return result;
}

/**
 * Fetch messages from an authorized channel
 */
async function getChannelMessages(channelId, limit = 50, token = null) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const result = await discordFetch(`/channels/${channelId}/messages?limit=${safeLimit}`, token);
  if (result.ok && Array.isArray(result.data)) {
    const formatted = result.data.map(m => {
      const author = m.author || {};
      const avatarUrl = author.avatar
        ? `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5)}.png`;

      return {
        id: m.id,
        channel_id: m.channel_id,
        content: m.content || '',
        timestamp: m.timestamp,
        author: {
          id: author.id,
          username: author.username,
          display_name: author.global_name || author.username,
          avatar_url: avatarUrl,
          is_bot: Boolean(author.bot)
        },
        jump_url: `https://discord.com/channels/${m.guild_id || '@me'}/${m.channel_id}/${m.id}`,
        attachments: m.attachments || []
      };
    });

    return { ok: true, data: formatted };
  }
  return result;
}

module.exports = {
  DISCORD_PERMISSIONS,
  getSavedBotToken,
  saveBotToken,
  decodePermissions,
  generateBotInviteUrl,
  discordFetch,
  extractInviteCode,
  resolveInvite,
  getBotUser,
  getBotGuilds,
  getGuildDetails,
  getGuildChannels,
  getChannelMessages
};
