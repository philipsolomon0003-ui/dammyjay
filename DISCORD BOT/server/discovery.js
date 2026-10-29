const { db } = require('./db');
const { resolveInvite, getBotGuilds, getGuildDetails, getGuildChannels, getChannelMessages } = require('./discord');
const { analyzeDiscussionBuyingSignals } = require('./ai');
const crypto = require('node:crypto');

// Target IPTV and streaming keyword dictionary with weighted relevance
const TARGET_COMMUNITY_KEYWORDS = [
  { term: 'iptv', weight: 30, reason: 'Explicit IPTV service, streaming, or reseller discussions' },
  { term: 'reseller', weight: 25, reason: 'Target reseller panel and bulk credit audience' },
  { term: 'rebrand', weight: 25, reason: 'Custom APK branding, Smarters Pro, and XCIPTV interest' },
  { term: 'rebranding', weight: 25, reason: 'App rebranding and white-label player requests' },
  { term: '1-stream', weight: 25, reason: '1-Stream panel infrastructure users' },
  { term: 'xtream', weight: 25, reason: 'Xtream Codes architecture community' },
  { term: 'smarters', weight: 20, reason: 'IPTV Smarters Pro userbase' },
  { term: 'xciptv', weight: 20, reason: 'XCIPTV player userbase' },
  { term: 'exoplayer', weight: 20, reason: 'ExoPlayer and Android TV custom dev discussions' },
  { term: 'restream', weight: 20, reason: 'Wholesale stream feeds and restreaming buyers' },
  { term: 'load balancer', weight: 20, reason: 'Streaming server optimization and Nginx tuning' },
  { term: 'stream', weight: 15, reason: 'Streaming media ecosystem' },
  { term: 'm3u', weight: 15, reason: 'Playlist and subscription users' },
  { term: 'firestick', weight: 10, reason: 'Firestick / Android TV deployment' }
];

/**
 * Calculate relevance score and plain English reasoning for communities
 */
function analyzeCommunityRelevance(name = '', description = '', memberCount = 0, presenceCount = 0) {
  const combined = `${name} ${description}`.toLowerCase();
  let score = 10;
  const reasons = [];

  for (const item of TARGET_COMMUNITY_KEYWORDS) {
    if (combined.includes(item.term)) {
      score += item.weight;
      if (!reasons.includes(item.reason)) {
        reasons.push(item.reason);
      }
    }
  }

  if (memberCount > 0 && presenceCount > 0) {
    const ratio = presenceCount / memberCount;
    if (ratio > 0.15 && memberCount > 100) {
      score += 15;
      reasons.push(`High active ratio: ${Math.round(ratio * 100)}% online (${presenceCount.toLocaleString()} active)`);
    } else if (memberCount > 1000) {
      score += 10;
      reasons.push(`Established community scale (${memberCount.toLocaleString()} total members)`);
    }
  }

  const finalScore = Math.min(Math.max(score, 10), 100);
  if (reasons.length === 0) {
    reasons.push('General media/tech community - requires review of public channel discussions');
  }

  return { score: finalScore, reasons };
}

/**
 * Discover community via official Discord invite code
 */
async function discoverFromInvite(inviteInput) {
  const res = await resolveInvite(inviteInput);
  if (!res.ok) return res;

  const d = res.data;
  const analysis = analyzeCommunityRelevance(d.name, d.description, d.member_count, d.presence_count);

  return {
    ok: true,
    data: {
      id: d.guild_id || `inv_${d.code}`,
      name: d.name,
      description: d.description,
      invite_code: d.code,
      invite_url: d.invite_url,
      icon_url: d.icon_url,
      banner_url: d.banner_url,
      member_count: d.member_count,
      presence_count: d.presence_count,
      source_type: 'official_invite',
      relevance_score: analysis.score,
      relevance_reasons: analysis.reasons,
      discovered_at: new Date().toISOString()
    }
  };
}

/**
 * Save community to research list
 */
function saveCommunity(data) {
  const reasons = Array.isArray(data.relevance_reasons)
    ? JSON.stringify(data.relevance_reasons)
    : (data.relevance_reasons || '[]');

  const tags = Array.isArray(data.tags)
    ? JSON.stringify(data.tags)
    : (data.tags || '[]');

  db.prepare(`
    INSERT INTO communities (
      id, name, description, invite_code, invite_url, icon_url, banner_url,
      member_count, presence_count, source_type, relevance_score, relevance_reasons,
      tags, notes, status, discovered_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      invite_url = excluded.invite_url,
      icon_url = excluded.icon_url,
      member_count = excluded.member_count,
      presence_count = excluded.presence_count,
      relevance_score = excluded.relevance_score,
      relevance_reasons = excluded.relevance_reasons,
      tags = excluded.tags,
      notes = COALESCE(excluded.notes, notes),
      status = COALESCE(excluded.status, status),
      updated_at = CURRENT_TIMESTAMP
  `).run(
    data.id,
    data.name,
    data.description || '',
    data.invite_code || '',
    data.invite_url || '',
    data.icon_url || null,
    data.banner_url || null,
    data.member_count || 0,
    data.presence_count || 0,
    data.source_type || 'official_invite',
    data.relevance_score || 0,
    reasons,
    tags,
    data.notes || '',
    data.status || 'saved'
  );

  return { ok: true, id: data.id };
}

/**
 * Get saved research communities
 */
function getSavedCommunities(filters = {}) {
  let query = 'SELECT * FROM communities WHERE 1=1';
  const params = [];

  if (filters.status && filters.status !== 'all') {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  if (filters.search) {
    query += ' AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(notes) LIKE ?)';
    const term = `%${filters.search.toLowerCase()}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY relevance_score DESC, updated_at DESC';
  const rows = db.prepare(query).all(...params);

  return rows.map(r => ({
    ...r,
    relevance_reasons: JSON.parse(r.relevance_reasons || '[]'),
    tags: JSON.parse(r.tags || '[]')
  }));
}

/**
 * Delete community from research list
 */
function deleteCommunity(id) {
  db.prepare('DELETE FROM communities WHERE id = ?').run(id);
  return { ok: true };
}

/**
 * Save an authorized server into the workspace
 */
function saveAuthorizedGuild(guild) {
  const perms = Array.isArray(guild.permissions_breakdown)
    ? JSON.stringify(guild.permissions_breakdown)
    : (guild.permissions_breakdown || '[]');

  db.prepare(`
    INSERT INTO authorized_guilds (
      id, name, icon_url, banner_url, member_count, permissions_bitfield,
      permissions_breakdown, is_monitored, notes, added_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      icon_url = excluded.icon_url,
      member_count = excluded.member_count,
      permissions_bitfield = excluded.permissions_bitfield,
      permissions_breakdown = excluded.permissions_breakdown,
      is_monitored = 1
  `).run(
    guild.id,
    guild.name,
    guild.icon_url || null,
    guild.banner_url || null,
    guild.approximate_member_count || guild.member_count || 0,
    guild.permissions_bitfield || '',
    perms,
    guild.notes || ''
  );

  return { ok: true, id: guild.id };
}

/**
 * Remove an authorized server from workspace
 */
function removeAuthorizedGuild(guildId) {
  db.prepare('DELETE FROM authorized_guilds WHERE id = ?').run(guildId);
  db.prepare('DELETE FROM monitored_channels WHERE guild_id = ?').run(guildId);
  db.prepare('DELETE FROM channel_messages WHERE guild_id = ?').run(guildId);
  return { ok: true, message: 'Server removed from research workspace.' };
}

/**
 * Get all authorized servers in workspace
 */
function getWorkspaceGuilds() {
  const rows = db.prepare('SELECT * FROM authorized_guilds ORDER BY added_at DESC').all();
  return rows.map(r => ({
    ...r,
    permissions_breakdown: JSON.parse(r.permissions_breakdown || '[]')
  }));
}

/**
 * Save or update allowed channels for an authorized server
 */
function setMonitoredChannels(guildId, channels = []) {
  const insert = db.prepare(`
    INSERT INTO monitored_channels (id, guild_id, name, type, topic, is_allowed_to_read)
    VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      topic = excluded.topic,
      is_allowed_to_read = 1
  `);

  for (const ch of channels) {
    insert.run(ch.id, guildId, ch.name, ch.type || 0, ch.topic || '');
  }

  return { ok: true, count: channels.length };
}

/**
 * Get monitored channels for a server
 */
function getMonitoredChannels(guildId) {
  return db.prepare('SELECT * FROM monitored_channels WHERE guild_id = ? ORDER BY name ASC').all(guildId);
}

/**
 * Toggle channel read permission
 */
function toggleChannelPermission(channelId, isAllowed) {
  db.prepare(`
    UPDATE monitored_channels SET
      is_allowed_to_read = ?,
      last_scanned_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(isAllowed ? 1 : 0, channelId);

  return { ok: true, channel_id: channelId, is_allowed_to_read: isAllowed ? 1 : 0 };
}

/**
 * Scan an authorized channel for public discussions, customer questions, and buying signals
 */
async function scanChannelDiscussions(guildId, channelId, limit = 50) {
  // 1. Verify channel is allowed to be read
  const channelRow = db.prepare('SELECT * FROM monitored_channels WHERE id = ?').get(channelId);
  if (channelRow && channelRow.is_allowed_to_read === 0) {
    return {
      ok: false,
      error: 'Access Restricted: This channel is marked as disallowed in your workspace channel permissions.'
    };
  }

  // 2. Fetch messages using official Discord API
  const messagesResult = await getChannelMessages(channelId, limit);
  if (!messagesResult.ok) {
    return messagesResult;
  }

  const rawMessages = messagesResult.data || [];
  const analyzedFindings = [];

  const insertMsg = db.prepare(`
    INSERT INTO channel_messages (
      id, guild_id, channel_id, author_id, author_username, author_display_name,
      author_avatar, content, posted_at, jump_url, relevance_score, buying_signals,
      opportunity_summary, is_saved_to_crm, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      relevance_score = excluded.relevance_score,
      buying_signals = excluded.buying_signals,
      opportunity_summary = excluded.opportunity_summary
  `);

  for (const m of rawMessages) {
    // Skip bot messages for customer research
    if (m.author?.is_bot) continue;
    if (!m.content || m.content.trim().length < 4) continue;

    const analysis = analyzeDiscussionBuyingSignals(m.content, m.author.display_name || m.author.username);
    const buyingSignalsJSON = JSON.stringify(analysis.buying_signals);

    insertMsg.run(
      m.id,
      guildId,
      channelId,
      m.author.id,
      m.author.username,
      m.author.display_name,
      m.author.avatar_url,
      m.content,
      m.timestamp,
      m.jump_url,
      analysis.relevance_score,
      buyingSignalsJSON,
      analysis.summary
    );

    analyzedFindings.push({
      message_id: m.id,
      guild_id: guildId,
      channel_id: channelId,
      author: m.author,
      content: m.content,
      posted_at: m.timestamp,
      jump_url: m.jump_url,
      relevance_score: analysis.relevance_score,
      priority: analysis.priority,
      category: analysis.category,
      buying_signals: analysis.buying_signals,
      opportunity_summary: analysis.summary
    });
  }

  // Update last scanned timestamp
  db.prepare('UPDATE monitored_channels SET last_scanned_at = CURRENT_TIMESTAMP WHERE id = ?').run(channelId);

  // Sort by relevance score descending
  analyzedFindings.sort((a, b) => b.relevance_score - a.relevance_score);

  return {
    ok: true,
    channel_id: channelId,
    total_scanned: rawMessages.length,
    opportunities_found: analyzedFindings.length,
    findings: analyzedFindings
  };
}

/**
 * Search stored channel messages by keyword, server, or category
 */
function searchChannelMessages(filters = {}) {
  let query = 'SELECT * FROM channel_messages WHERE 1=1';
  const params = [];

  if (filters.guild_id) {
    query += ' AND guild_id = ?';
    params.push(filters.guild_id);
  }

  if (filters.channel_id) {
    query += ' AND channel_id = ?';
    params.push(filters.channel_id);
  }

  if (filters.search) {
    query += ' AND (LOWER(content) LIKE ? OR LOWER(author_username) LIKE ? OR LOWER(opportunity_summary) LIKE ?)';
    const term = `%${filters.search.toLowerCase()}%`;
    params.push(term, term, term);
  }

  if (filters.min_score) {
    query += ' AND relevance_score >= ?';
    params.push(Number(filters.min_score));
  }

  query += ' ORDER BY relevance_score DESC, posted_at DESC LIMIT 100';

  const rows = db.prepare(query).all(...params);
  return rows.map(r => ({
    ...r,
    buying_signals: JSON.parse(r.buying_signals || '[]'),
    priority: r.relevance_score >= 60 ? 'High' : (r.relevance_score >= 35 ? 'Medium' : 'Low')
  }));
}

module.exports = {
  discoverFromInvite,
  saveCommunity,
  getSavedCommunities,
  deleteCommunity,
  saveAuthorizedGuild,
  removeAuthorizedGuild,
  getWorkspaceGuilds,
  setMonitoredChannels,
  getMonitoredChannels,
  toggleChannelPermission,
  scanChannelDiscussions,
  searchChannelMessages
};
