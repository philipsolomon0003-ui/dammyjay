const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'iptv_crm.sqlite');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for high performance and integrity
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

function initSchema() {
  db.exec(`
    -- 1. Business Profile & Service Settings (ELITE VISION GLOBAL)
    CREATE TABLE IF NOT EXISTS business_settings (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL DEFAULT 'ELITE VISION GLOBAL',
      telegram_handle TEXT DEFAULT '@Iptvpross',
      sub_1m REAL DEFAULT 15,
      sub_3m REAL DEFAULT 35,
      sub_6m REAL DEFAULT 55,
      sub_12m REAL DEFAULT 80,
      reseller_120 REAL DEFAULT 350,
      rebrand_with_panel REAL DEFAULT 150,
      app_dev_policy TEXT DEFAULT 'Contact me for requirements and pricing quote',
      server_setup_policy TEXT DEFAULT 'Custom quote based on server load and nodes',
      services_description TEXT DEFAULT 'IPTV subscriptions, reseller panels, IPTV app rebranding, app development, server setup, and related business solutions.',
      custom_notes TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Communities / Discord Guilds saved for research
    CREATE TABLE IF NOT EXISTS communities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      invite_code TEXT,
      invite_url TEXT,
      icon_url TEXT,
      banner_url TEXT,
      member_count INTEGER DEFAULT 0,
      presence_count INTEGER DEFAULT 0,
      source_type TEXT DEFAULT 'invite',
      relevance_score INTEGER DEFAULT 0,
      relevance_reasons TEXT,
      tags TEXT,
      notes TEXT,
      status TEXT DEFAULT 'saved',
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Authorized Guilds (Servers the bot is permitted in)
    CREATE TABLE IF NOT EXISTS authorized_guilds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_url TEXT,
      banner_url TEXT,
      member_count INTEGER DEFAULT 0,
      permissions_bitfield TEXT,
      permissions_breakdown TEXT,
      is_monitored INTEGER DEFAULT 1,
      notes TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Monitored Channels (Specific channels the bot is allowed to read)
    CREATE TABLE IF NOT EXISTS monitored_channels (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type INTEGER DEFAULT 0,
      topic TEXT,
      is_allowed_to_read INTEGER DEFAULT 1,
      last_scanned_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Channel Messages (Discussions fetched from authorized channels)
    CREATE TABLE IF NOT EXISTS channel_messages (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      author_id TEXT,
      author_username TEXT,
      author_display_name TEXT,
      author_avatar TEXT,
      content TEXT,
      posted_at DATETIME,
      jump_url TEXT,
      relevance_score INTEGER DEFAULT 0,
      buying_signals TEXT,
      opportunity_summary TEXT,
      is_saved_to_crm INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. Prospects CRM (11 exact stages with distinction between Discord data vs manual notes)
    CREATE TABLE IF NOT EXISTS prospects (
      id TEXT PRIMARY KEY,
      discord_user_id TEXT UNIQUE,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      source_community_id TEXT,
      source_community_name TEXT,
      source_channel_id TEXT,
      source_channel_name TEXT,
      source_message_id TEXT,
      source_message_url TEXT,
      source_type TEXT DEFAULT 'authorized_channel_research',
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'new_contact',
      stated_interests TEXT,
      service_interested TEXT,
      private_notes TEXT,
      discord_data TEXT,
      last_interaction_at DATETIME,
      last_message_summary TEXT,
      next_suggested_action TEXT,
      next_followup_at DATETIME,
      followup_count INTEGER DEFAULT 0,
      stop_followup INTEGER DEFAULT 0,
      deal_value REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. Prospect Activity Timeline
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
    );

    -- 8. Follow-up Reminders
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL,
      scheduled_for DATETIME NOT NULL,
      status TEXT DEFAULT 'pending',
      title TEXT NOT NULL,
      notes TEXT,
      suggested_message TEXT,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
    );

    -- 9. Message Templates
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      service_category TEXT NOT NULL,
      purpose TEXT NOT NULL,
      tone TEXT DEFAULT 'conversational',
      subject TEXT,
      body TEXT NOT NULL,
      variables TEXT,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. Conversations & Message Threads
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL,
      channel_id TEXT,
      summary TEXT,
      unresolved_questions TEXT,
      key_interests TEXT,
      suggested_next_step TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- 11. AI Command Center Chat History
    CREATE TABLE IF NOT EXISTS chat_command_history (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. App Settings (Tokens, API keys, OAuth credentials)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 13. Discord OAuth2 Sessions
    CREATE TABLE IF NOT EXISTS discord_sessions (
      id TEXT PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      global_name TEXT,
      avatar TEXT,
      email TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at DATETIME,
      guilds TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure default ELITE VISION GLOBAL settings are present
  ensureBusinessSettings();

  // Safely check and add any missing columns in case of existing database migration
  migrateExistingColumns();
}

/**
 * Ensure business profile default settings row exists
 */
function ensureBusinessSettings() {
  const existing = db.prepare('SELECT id FROM business_settings WHERE id = ?').get('primary');
  if (!existing) {
    db.prepare(`
      INSERT INTO business_settings (
        id, business_name, telegram_handle,
        sub_1m, sub_3m, sub_6m, sub_12m,
        reseller_120, rebrand_with_panel,
        app_dev_policy, server_setup_policy, services_description
      ) VALUES (
        'primary', 'ELITE VISION GLOBAL', '@Iptvpross',
        15, 35, 55, 80,
        350, 150,
        'Contact me for requirements and pricing quote',
        'Custom quote based on server load and nodes',
        'IPTV subscriptions, reseller panels, IPTV app rebranding, app development, server setup, and related business solutions.'
      )
    `).run();
  }
}

/**
 * Migration helper to ensure newly required columns exist on older tables
 */
function migrateExistingColumns() {
  const checkAndAddColumn = (table, column, typeDef) => {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all();
      const colExists = cols.some(c => c.name === column);
      if (!colExists) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`);
      }
    } catch (e) {
      // Ignore migration errors if already matching
    }
  };

  // Check prospects table columns
  checkAndAddColumn('prospects', 'source_channel_id', 'TEXT');
  checkAndAddColumn('prospects', 'source_channel_name', 'TEXT');
  checkAndAddColumn('prospects', 'source_message_id', 'TEXT');
  checkAndAddColumn('prospects', 'source_message_url', 'TEXT');
  checkAndAddColumn('prospects', 'source_type', "TEXT DEFAULT 'authorized_channel_research'");
  checkAndAddColumn('prospects', 'date_added', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  checkAndAddColumn('prospects', 'stated_interests', 'TEXT');
  checkAndAddColumn('prospects', 'service_interested', 'TEXT');
  checkAndAddColumn('prospects', 'private_notes', 'TEXT');
  checkAndAddColumn('prospects', 'discord_data', 'TEXT');
  checkAndAddColumn('prospects', 'last_message_summary', 'TEXT');
  checkAndAddColumn('prospects', 'next_suggested_action', 'TEXT');
  checkAndAddColumn('prospects', 'followup_count', 'INTEGER DEFAULT 0');
  checkAndAddColumn('prospects', 'stop_followup', 'INTEGER DEFAULT 0');
}

/**
 * Get ELITE VISION GLOBAL business settings
 */
function getBusinessSettings() {
  ensureBusinessSettings();
  const row = db.prepare('SELECT * FROM business_settings WHERE id = ?').get('primary');
  return row || {
    business_name: 'ELITE VISION GLOBAL',
    telegram_handle: '@Iptvpross',
    sub_1m: 15,
    sub_3m: 35,
    sub_6m: 55,
    sub_12m: 80,
    reseller_120: 350,
    rebrand_with_panel: 150,
    app_dev_policy: 'Contact me for requirements and pricing quote',
    server_setup_policy: 'Custom quote based on server load and nodes',
    services_description: 'IPTV subscriptions, reseller panels, IPTV app rebranding, app development, server setup, and related business solutions.'
  };
}

/**
 * Update ELITE VISION GLOBAL business settings
 */
function updateBusinessSettings(data) {
  ensureBusinessSettings();
  const stmt = db.prepare(`
    UPDATE business_settings SET
      business_name = COALESCE(?, business_name),
      telegram_handle = COALESCE(?, telegram_handle),
      sub_1m = COALESCE(?, sub_1m),
      sub_3m = COALESCE(?, sub_3m),
      sub_6m = COALESCE(?, sub_6m),
      sub_12m = COALESCE(?, sub_12m),
      reseller_120 = COALESCE(?, reseller_120),
      rebrand_with_panel = COALESCE(?, rebrand_with_panel),
      app_dev_policy = COALESCE(?, app_dev_policy),
      server_setup_policy = COALESCE(?, server_setup_policy),
      services_description = COALESCE(?, services_description),
      custom_notes = COALESCE(?, custom_notes),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 'primary'
  `);

  stmt.run(
    data.business_name !== undefined ? data.business_name.trim() : null,
    data.telegram_handle !== undefined ? data.telegram_handle.trim() : null,
    data.sub_1m !== undefined ? Number(data.sub_1m) : null,
    data.sub_3m !== undefined ? Number(data.sub_3m) : null,
    data.sub_6m !== undefined ? Number(data.sub_6m) : null,
    data.sub_12m !== undefined ? Number(data.sub_12m) : null,
    data.reseller_120 !== undefined ? Number(data.reseller_120) : null,
    data.rebrand_with_panel !== undefined ? Number(data.rebrand_with_panel) : null,
    data.app_dev_policy !== undefined ? data.app_dev_policy.trim() : null,
    data.server_setup_policy !== undefined ? data.server_setup_policy.trim() : null,
    data.services_description !== undefined ? data.services_description.trim() : null,
    data.custom_notes !== undefined ? data.custom_notes.trim() : null
  );

  return getBusinessSettings();
}

/**
 * Wipe all stored contacts and research data (Requirement: provide a way to delete stored contacts and research data)
 */
function wipeAllUserData() {
  db.exec(`
    DELETE FROM channel_messages;
    DELETE FROM monitored_channels;
    DELETE FROM reminders;
    DELETE FROM activities;
    DELETE FROM conversation_messages;
    DELETE FROM conversations;
    DELETE FROM prospects;
    DELETE FROM communities;
    DELETE FROM chat_command_history;
  `);
  return { ok: true, message: 'All stored contacts, messages, and research findings have been wiped successfully.' };
}

initSchema();

module.exports = {
  db,
  initSchema,
  getBusinessSettings,
  updateBusinessSettings,
  wipeAllUserData
};
