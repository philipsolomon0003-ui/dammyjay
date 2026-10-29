const { db } = require('./db');
const crypto = require('node:crypto');

// The 11 exact stages requested by the business owner
const CONVERSATION_STAGES = [
  { id: 'new_contact', label: 'New Contact', color: '#64748b' },
  { id: 'researching', label: 'Researching', color: '#0ea5e9' },
  { id: 'first_message_ready', label: 'First Message Ready', color: '#3b82f6' },
  { id: 'conversation_started', label: 'Conversation Started', color: '#8b5cf6' },
  { id: 'interested', label: 'Interested', color: '#10b981' },
  { id: 'needs_more_info', label: 'Needs More Information', color: '#f59e0b' },
  { id: 'price_discussed', label: 'Price Discussed', color: '#ec4899' },
  { id: 'followup_due', label: 'Follow-up Due', color: '#f97316' },
  { id: 'converted', label: 'Converted Customer', color: '#059669' },
  { id: 'not_interested', label: 'Not Interested', color: '#6b7280' },
  { id: 'archived', label: 'Archived', color: '#475569' }
];

function uid(prefix = 'prs') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Log activity for a prospect
 */
function logActivity(prospectId, type, title, description = '', metadata = null) {
  const id = uid('act');
  db.prepare(`
    INSERT INTO activities (id, prospect_id, type, title, description, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    id,
    prospectId,
    type,
    title,
    description,
    metadata ? JSON.stringify(metadata) : null
  );
  return id;
}

/**
 * Save or update prospect record
 */
function saveProspect(data) {
  let existing = null;
  if (data.id) {
    existing = db.prepare('SELECT * FROM prospects WHERE id = ?').get(data.id);
  } else if (data.discord_user_id) {
    existing = db.prepare('SELECT * FROM prospects WHERE discord_user_id = ?').get(data.discord_user_id);
  } else if (data.username) {
    existing = db.prepare('SELECT * FROM prospects WHERE LOWER(username) = LOWER(?)').get(data.username);
  }

  const statedInterests = Array.isArray(data.stated_interests)
    ? JSON.stringify(data.stated_interests)
    : (data.stated_interests || '[]');

  const discordData = data.discord_data
    ? (typeof data.discord_data === 'string' ? data.discord_data : JSON.stringify(data.discord_data))
    : JSON.stringify({
        verified_username: data.username,
        user_id: data.discord_user_id || null,
        server: data.source_community_name || null,
        channel: data.source_channel_name || null,
        message_url: data.source_message_url || null
      });

  if (existing) {
    // Update existing prospect
    db.prepare(`
      UPDATE prospects SET
        username = COALESCE(?, username),
        display_name = COALESCE(?, display_name),
        avatar_url = COALESCE(?, avatar_url),
        source_community_id = COALESCE(?, source_community_id),
        source_community_name = COALESCE(?, source_community_name),
        source_channel_id = COALESCE(?, source_channel_id),
        source_channel_name = COALESCE(?, source_channel_name),
        source_message_id = COALESCE(?, source_message_id),
        source_message_url = COALESCE(?, source_message_url),
        source_type = COALESCE(?, source_type),
        status = COALESCE(?, status),
        stated_interests = ?,
        service_interested = COALESCE(?, service_interested),
        private_notes = COALESCE(?, private_notes),
        discord_data = COALESCE(?, discord_data),
        last_interaction_at = COALESCE(?, last_interaction_at),
        last_message_summary = COALESCE(?, last_message_summary),
        next_suggested_action = COALESCE(?, next_suggested_action),
        next_followup_at = COALESCE(?, next_followup_at),
        deal_value = COALESCE(?, deal_value),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.username || null,
      data.display_name || null,
      data.avatar_url || null,
      data.source_community_id || null,
      data.source_community_name || null,
      data.source_channel_id || null,
      data.source_channel_name || null,
      data.source_message_id || null,
      data.source_message_url || null,
      data.source_type || null,
      data.status || null,
      statedInterests,
      data.service_interested || null,
      data.private_notes || null,
      discordData,
      data.last_interaction_at || null,
      data.last_message_summary || null,
      data.next_suggested_action || null,
      data.next_followup_at || null,
      data.deal_value !== undefined ? data.deal_value : null,
      existing.id
    );

    logActivity(
      existing.id,
      'status_change',
      'Contact profile updated',
      `Updated details. Status: ${data.status || existing.status}`
    );

    return {
      success: true,
      action: 'updated',
      id: existing.id,
      prospect: getProspectById(existing.id)
    };
  }

  // Insert new prospect
  const newId = uid('prs');
  const initialStatus = data.status || 'new_contact';

  db.prepare(`
    INSERT INTO prospects (
      id, discord_user_id, username, display_name, avatar_url,
      source_community_id, source_community_name, source_channel_id, source_channel_name,
      source_message_id, source_message_url, source_type,
      date_added, status, stated_interests, service_interested,
      private_notes, discord_data, last_interaction_at, last_message_summary,
      next_suggested_action, next_followup_at, deal_value, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      CURRENT_TIMESTAMP, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(
    newId,
    data.discord_user_id || null,
    data.username,
    data.display_name || data.username,
    data.avatar_url || null,
    data.source_community_id || null,
    data.source_community_name || 'Discord',
    data.source_channel_id || null,
    data.source_channel_name || null,
    data.source_message_id || null,
    data.source_message_url || null,
    data.source_type || 'authorized_channel_research',
    initialStatus,
    statedInterests,
    data.service_interested || 'IPTV Subscriptions',
    data.private_notes || '',
    discordData,
    data.last_interaction_at || null,
    data.last_message_summary || null,
    data.next_suggested_action || 'Review public interest & generate first message',
    data.next_followup_at || null,
    data.deal_value || 0
  );

  logActivity(
    newId,
    'note',
    'Contact Created',
    `Added to CRM via ${data.source_type || 'research'}. Stage: ${initialStatus}`
  );

  return {
    success: true,
    action: 'created',
    id: newId,
    prospect: getProspectById(newId)
  };
}

/**
 * Get single prospect by ID with activities and conversation history
 */
function getProspectById(id) {
  const row = db.prepare('SELECT * FROM prospects WHERE id = ?').get(id);
  if (!row) return null;

  const activities = db.prepare('SELECT * FROM activities WHERE prospect_id = ? ORDER BY created_at DESC LIMIT 30').all(id);
  const reminders = db.prepare('SELECT * FROM reminders WHERE prospect_id = ? ORDER BY scheduled_for DESC').all(id);
  
  // Format JSON fields
  return {
    ...row,
    stated_interests: JSON.parse(row.stated_interests || '[]'),
    discord_data: JSON.parse(row.discord_data || '{}'),
    activities,
    reminders
  };
}

/**
 * Query prospects with filtering, search, sorting
 */
function getProspects(filters = {}) {
  let query = 'SELECT * FROM prospects WHERE 1=1';
  const params = [];

  if (filters.status && filters.status !== 'all') {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  if (filters.service && filters.service !== 'all') {
    query += ' AND service_interested = ?';
    params.push(filters.service);
  }

  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    query += ' AND (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(private_notes) LIKE ? OR LOWER(source_community_name) LIKE ?)';
    params.push(term, term, term, term);
  }

  // Sorting
  switch (filters.sort) {
    case 'name_asc':
      query += ' ORDER BY display_name ASC';
      break;
    case 'last_interaction':
      query += ' ORDER BY last_interaction_at DESC NULLS LAST, created_at DESC';
      break;
    case 'deal_value_desc':
      query += ' ORDER BY deal_value DESC';
      break;
    case 'newest':
    default:
      query += ' ORDER BY created_at DESC';
      break;
  }

  const rows = db.prepare(query).all(...params);

  return rows.map(r => ({
    ...r,
    stated_interests: JSON.parse(r.stated_interests || '[]'),
    discord_data: JSON.parse(r.discord_data || '{}')
  }));
}

/**
 * Update prospect conversation stage
 */
function updateProspectStatus(id, newStatus, reason = '') {
  const valid = CONVERSATION_STAGES.some(s => s.id === newStatus);
  if (!valid) {
    return { ok: false, error: `Invalid conversation stage: ${newStatus}` };
  }

  const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(id);
  if (!prospect) return { ok: false, error: 'Prospect not found' };

  // If moved to Not Interested or Archived, cancel pending reminders and set stop_followup
  const isStopStage = newStatus === 'not_interested' || newStatus === 'archived';

  db.prepare(`
    UPDATE prospects SET
      status = ?,
      stop_followup = CASE WHEN ? = 1 THEN 1 ELSE stop_followup END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newStatus, isStopStage ? 1 : 0, id);

  if (isStopStage) {
    db.prepare(`
      UPDATE reminders SET
        status = 'cancelled',
        notes = notes || ' (Cancelled: Contact marked as Not Interested/Archived)',
        updated_at = CURRENT_TIMESTAMP
      WHERE prospect_id = ? AND status = 'pending'
    `).run(id);
  }

  logActivity(
    id,
    'status_change',
    `Stage changed to ${newStatus.replace(/_/g, ' ').toUpperCase()}`,
    reason || `Moved from ${prospect.status} to ${newStatus}`
  );

  return { ok: true, id, status: newStatus };
}

/**
 * Append a private user note to a prospect
 */
function addProspectNote(id, noteText) {
  if (!noteText || !noteText.trim()) {
    return { ok: false, error: 'Note text cannot be empty' };
  }

  const row = db.prepare('SELECT private_notes FROM prospects WHERE id = ?').get(id);
  if (!row) return { ok: false, error: 'Prospect not found' };

  const timestamp = new Date().toLocaleString();
  const formattedNote = `[${timestamp}] ${noteText.trim()}`;
  const updatedNotes = row.private_notes ? `${row.private_notes}\n\n${formattedNote}` : formattedNote;

  db.prepare(`
    UPDATE prospects SET
      private_notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(updatedNotes, id);

  logActivity(id, 'note', 'Private Note Added', noteText.trim());

  return { ok: true, private_notes: updatedNotes };
}

/**
 * Delete a single prospect and related activities/reminders
 */
function deleteProspect(id) {
  db.prepare('DELETE FROM reminders WHERE prospect_id = ?').run(id);
  db.prepare('DELETE FROM activities WHERE prospect_id = ?').run(id);
  db.prepare('DELETE FROM conversations WHERE prospect_id = ?').run(id);
  db.prepare('DELETE FROM prospects WHERE id = ?').run(id);
  return { ok: true, message: 'Prospect removed from workspace' };
}

/**
 * Real, authentic CRM overview metrics (no fake numbers)
 */
function getCRMStats() {
  const totalContacts = db.prepare('SELECT COUNT(*) as c FROM prospects').get().c;
  const newContacts = db.prepare("SELECT COUNT(*) as c FROM prospects WHERE status = 'new_contact'").get().c;
  const researching = db.prepare("SELECT COUNT(*) as c FROM prospects WHERE status = 'researching'").get().c;
  const firstMessageReady = db.prepare("SELECT COUNT(*) as c FROM prospects WHERE status = 'first_message_ready'").get().c;
  const conversationStarted = db.prepare("SELECT COUNT(*) as c FROM prospects WHERE status = 'conversation_started'").get().c;
  const interested = db.prepare("SELECT COUNT(*) as c FROM prospects WHERE status = 'interested'").get().c;
  const needsMoreInfo = db.prepare("SELECT COUNT(*) as c FROM prospects WHERE status = 'needs_more_info'").get().c;
  const priceDiscussed = db.prepare("SELECT COUNT(*) as c FROM prospects WHERE status = 'price_discussed'").get().c;
  const followupDue = db.prepare("SELECT COUNT(*) as c FROM prospects WHERE status = 'followup_due'").get().c;
  const converted = db.prepare("SELECT COUNT(*) as c FROM prospects WHERE status = 'converted'").get().c;
  const notInterested = db.prepare("SELECT COUNT(*) as c FROM prospects WHERE status = 'not_interested'").get().c;
  const archived = db.prepare("SELECT COUNT(*) as c FROM prospects WHERE status = 'archived'").get().c;

  // Reminders metrics
  const nowISO = new Date().toISOString();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const endOfDayISO = endOfDay.toISOString();

  const followupsDueToday = db.prepare(`
    SELECT COUNT(*) as c FROM reminders
    WHERE status = 'pending' AND scheduled_for <= ?
  `).get(endOfDayISO).c;

  const followupsOverdue = db.prepare(`
    SELECT COUNT(*) as c FROM reminders
    WHERE status = 'pending' AND scheduled_for < ?
  `).get(nowISO).c;

  const monitoredServersCount = db.prepare('SELECT COUNT(*) as c FROM authorized_guilds WHERE is_monitored = 1').get().c;
  const monitoredChannelsCount = db.prepare('SELECT COUNT(*) as c FROM monitored_channels WHERE is_allowed_to_read = 1').get().c;

  return {
    total_contacts: totalContacts,
    new_contacts: newContacts,
    researching: researching,
    first_message_ready: firstMessageReady,
    open_conversations: conversationStarted,
    interested: interested,
    needs_more_info: needsMoreInfo,
    price_discussed: priceDiscussed,
    followup_due: followupDue,
    converted_customers: converted,
    not_interested: notInterested,
    archived: archived,
    followups_due_today: followupsDueToday,
    followups_overdue: followupsOverdue,
    monitored_servers: monitoredServersCount,
    monitored_channels: monitoredChannelsCount,
    stages: CONVERSATION_STAGES
  };
}

module.exports = {
  CONVERSATION_STAGES,
  saveProspect,
  getProspectById,
  getProspects,
  updateProspectStatus,
  addProspectNote,
  deleteProspect,
  logActivity,
  getCRMStats
};
