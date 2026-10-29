require('./env');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { db, getBusinessSettings, updateBusinessSettings, wipeAllUserData } = require('./db');
require('./seed_demo');
const discord = require('./discord');
const auth = require('./auth');
const discovery = require('./discovery');
const crm = require('./crm');
const ai = require('./ai');
const followups = require('./followups');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) {
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res, pathname) {
  let safePath = pathname === '/' ? '/index.html' : pathname;
  safePath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Access denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (!path.extname(pathname)) {
        return serveStatic(req, res, '/index.html');
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method;

  try {
    // ----------------------------------------------------
    // 1. BUSINESS PROFILE & SETTINGS (ELITE VISION GLOBAL)
    // ----------------------------------------------------
    if (pathname === '/api/business' && method === 'GET') {
      const settings = getBusinessSettings();
      return sendJson(res, 200, { ok: true, data: settings });
    }

    if (pathname === '/api/business' && method === 'POST') {
      const body = await parseJsonBody(req);
      const updated = updateBusinessSettings(body);
      return sendJson(res, 200, { ok: true, data: updated, message: 'Business settings updated.' });
    }

    // ----------------------------------------------------
    // 2. DISCORD AUTHENTICATION, STATUS & PERMISSIONS
    // ----------------------------------------------------
    if (pathname === '/api/auth/status' && method === 'GET') {
      const diagnostic = auth.getOAuthDiagnosticStatus(req.headers.host);
      return sendJson(res, 200, { ok: true, data: diagnostic });
    }

    if (pathname === '/api/auth/config' && method === 'GET') {
      const config = auth.getOAuthConfig(req.headers.host);
      const validation = auth.validateOAuthConfig(config);
      return sendJson(res, 200, {
        ok: true,
        is_configured: config.is_configured,
        is_valid: validation.valid,
        client_id: config.client_id,
        redirect_uri: config.redirect_uri,
        has_secret: Boolean(config.client_secret),
        validation: validation
      });
    }

    if (pathname === '/api/auth/config' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = auth.saveOAuthConfig(body);
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const session = auth.getActiveSession();
      return sendJson(res, 200, {
        ok: true,
        logged_in: Boolean(session),
        user: session
      });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      auth.clearSession();
      return sendJson(res, 200, { ok: true, message: 'Discord session disconnected.' });
    }

    if (pathname === '/api/auth/permissions-info' && method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        oauth2_scopes: auth.OAUTH2_PERMISSIONS_EXPLANATION,
        bot_permissions: auth.BOT_PERMISSIONS_EXPLANATION
      });
    }

    if (pathname === '/api/auth/discord/login' && method === 'GET') {
      const authResult = auth.getAuthorizationUrl(req.headers.host);
      
      // If OAuth configuration is missing or invalid, prevent redirecting to Discord's "Unknown Application" page
      if (!authResult.ok) {
        const acceptHeader = req.headers.accept || '';
        if (acceptHeader.includes('application/json') || url.searchParams.get('format') === 'json') {
          return sendJson(res, 400, authResult);
        }
        res.writeHead(302, {
          Location: `/?error=oauth_config_invalid&reason=${encodeURIComponent(authResult.error)}#connections`
        });
        return res.end();
      }

      // Valid configuration: safely redirect to official Discord OAuth2 authorization URL
      res.writeHead(302, { Location: authResult.url });
      return res.end();
    }

    if (pathname === '/api/auth/discord/callback' && method === 'GET') {
      const code = url.searchParams.get('code');
      const errorParam = url.searchParams.get('error');

      if (errorParam || !code) {
        res.writeHead(302, { Location: `/?error=${encodeURIComponent(errorParam || 'missing_code')}#connections` });
        return res.end();
      }

      const tokenRes = await auth.exchangeCodeForTokens(code, req.headers.host);
      if (!tokenRes.ok) {
        res.writeHead(302, { Location: `/?error=${encodeURIComponent(tokenRes.error)}#connections` });
        return res.end();
      }

      const accessToken = tokenRes.tokens.access_token;
      const profileRes = await auth.fetchDiscordProfile(accessToken);
      if (!profileRes.ok) {
        res.writeHead(302, { Location: `/?error=${encodeURIComponent(profileRes.error)}#connections` });
        return res.end();
      }

      const guildsRes = await auth.fetchUserGuilds(accessToken);
      const guilds = guildsRes.ok ? guildsRes.guilds : [];

      auth.createOrUpdateSession(profileRes.profile, tokenRes.tokens, guilds);

      res.writeHead(302, { Location: '/?auth=success#connections' });
      return res.end();
    }

    // ----------------------------------------------------
    // 3. DISCORD BOT & SERVER MANAGEMENT
    // ----------------------------------------------------
    if (pathname === '/api/discord/bot' && method === 'GET') {
      const botResult = await discord.getBotUser();
      return sendJson(res, botResult.ok ? 200 : 400, botResult);
    }

    if (pathname === '/api/discord/bot-invite-url' && method === 'GET') {
      const inviteUrl = discord.generateBotInviteUrl();
      return sendJson(res, 200, { ok: true, invite_url: inviteUrl });
    }

    if (pathname === '/api/discord/guilds' && method === 'GET') {
      const guildsResult = await discord.getBotGuilds();
      return sendJson(res, guildsResult.ok ? 200 : 400, guildsResult);
    }

    if (pathname === '/api/discord/workspace-guilds' && method === 'GET') {
      const guilds = discovery.getWorkspaceGuilds();
      return sendJson(res, 200, { ok: true, data: guilds });
    }

    const saveGuildMatch = pathname.match(/^\/api\/discord\/guilds\/([^\/]+)\/save$/);
    if (saveGuildMatch && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = discovery.saveAuthorizedGuild(body);
      return sendJson(res, 200, result);
    }

    const removeGuildMatch = pathname.match(/^\/api\/discord\/guilds\/([^\/]+)$/);
    if (removeGuildMatch && method === 'DELETE') {
      const result = discovery.removeAuthorizedGuild(removeGuildMatch[1]);
      return sendJson(res, 200, result);
    }

    const guildChannelsMatch = pathname.match(/^\/api\/discord\/guilds\/([^\/]+)\/channels$/);
    if (guildChannelsMatch && method === 'GET') {
      const result = await discord.getGuildChannels(guildChannelsMatch[1]);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    const monitoredChannelsMatch = pathname.match(/^\/api\/discord\/guilds\/([^\/]+)\/monitored-channels$/);
    if (monitoredChannelsMatch && method === 'GET') {
      const channels = discovery.getMonitoredChannels(monitoredChannelsMatch[1]);
      return sendJson(res, 200, { ok: true, data: channels });
    }
    if (monitoredChannelsMatch && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = discovery.setMonitoredChannels(monitoredChannelsMatch[1], body.channels || []);
      return sendJson(res, 200, result);
    }

    const toggleChannelMatch = pathname.match(/^\/api\/discord\/channels\/([^\/]+)\/permission$/);
    if (toggleChannelMatch && method === 'PATCH') {
      const body = await parseJsonBody(req);
      const result = discovery.toggleChannelPermission(toggleChannelMatch[1], body.is_allowed);
      return sendJson(res, 200, result);
    }

    const scanChannelMatch = pathname.match(/^\/api\/discord\/channels\/([^\/]+)\/scan$/);
    if (scanChannelMatch && method === 'POST') {
      const body = await parseJsonBody(req);
      const guildId = body.guild_id;
      const limit = body.limit || 50;
      const result = await discovery.scanChannelDiscussions(guildId, scanChannelMatch[1], limit);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (pathname === '/api/discord/channel-messages' && method === 'GET') {
      const filters = {
        guild_id: url.searchParams.get('guild_id'),
        channel_id: url.searchParams.get('channel_id'),
        search: url.searchParams.get('search'),
        min_score: url.searchParams.get('min_score')
      };
      const messages = discovery.searchChannelMessages(filters);
      return sendJson(res, 200, { ok: true, data: messages });
    }

    // ----------------------------------------------------
    // 4. AI RESEARCH ASSISTANT & COMMUNITY DISCOVERY
    // ----------------------------------------------------
    if (pathname === '/api/discovery/resolve-invite' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = await discovery.discoverFromInvite(body.invite);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (pathname === '/api/discovery/saved' && method === 'GET') {
      const filters = {
        search: url.searchParams.get('search'),
        status: url.searchParams.get('status')
      };
      const saved = discovery.getSavedCommunities(filters);
      return sendJson(res, 200, { ok: true, data: saved });
    }

    if (pathname === '/api/discovery/saved' && method === 'POST') {
      const body = await parseJsonBody(req);
      const saved = discovery.saveCommunity(body);
      return sendJson(res, 200, saved);
    }

    const deleteSavedMatch = pathname.match(/^\/api\/discovery\/saved\/([^\/]+)$/);
    if (deleteSavedMatch && method === 'DELETE') {
      const result = discovery.deleteCommunity(deleteSavedMatch[1]);
      return sendJson(res, 200, result);
    }

    // ----------------------------------------------------
    // 5. CONVERSATION WORKSPACE (CRM - 11 STAGES)
    // ----------------------------------------------------
    if (pathname === '/api/prospects' && method === 'GET') {
      const filters = {
        search: url.searchParams.get('search'),
        status: url.searchParams.get('status'),
        service: url.searchParams.get('service'),
        sort: url.searchParams.get('sort')
      };
      const list = crm.getProspects(filters);
      return sendJson(res, 200, { ok: true, data: list });
    }

    if (pathname === '/api/prospects' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = crm.saveProspect(body);
      return sendJson(res, 200, result);
    }

    const prospectDetailMatch = pathname.match(/^\/api\/prospects\/([^\/]+)$/);
    if (prospectDetailMatch && method === 'GET') {
      const prospect = crm.getProspectById(prospectDetailMatch[1]);
      if (!prospect) return sendJson(res, 404, { ok: false, error: 'Contact not found' });
      return sendJson(res, 200, { ok: true, data: prospect });
    }

    if (prospectDetailMatch && method === 'DELETE') {
      const result = crm.deleteProspect(prospectDetailMatch[1]);
      return sendJson(res, 200, result);
    }

    const prospectStatusMatch = pathname.match(/^\/api\/prospects\/([^\/]+)\/status$/);
    if (prospectStatusMatch && method === 'PATCH') {
      const body = await parseJsonBody(req);
      const result = crm.updateProspectStatus(prospectStatusMatch[1], body.status, body.reason);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    const prospectNoteMatch = pathname.match(/^\/api\/prospects\/([^\/]+)\/note$/);
    if (prospectNoteMatch && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = crm.addProspectNote(prospectNoteMatch[1], body.note);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (pathname === '/api/crm/stats' && method === 'GET') {
      const stats = crm.getCRMStats();
      return sendJson(res, 200, { ok: true, data: stats });
    }

    // ----------------------------------------------------
    // 6. SMART FOLLOW-UP SYSTEM
    // ----------------------------------------------------
    if (pathname === '/api/reminders' && method === 'GET') {
      const filters = {
        status: url.searchParams.get('status'),
        prospect_id: url.searchParams.get('prospect_id')
      };
      const list = followups.getReminders(filters);
      return sendJson(res, 200, { ok: true, data: list });
    }

    if (pathname === '/api/reminders/schedule' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = followups.scheduleReminder(body.prospect_id, body);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (pathname === '/api/reminders/record-reply' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = followups.recordProspectReply(body.prospect_id, body.reply_content);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    const completeReminderMatch = pathname.match(/^\/api\/reminders\/([^\/]+)\/complete$/);
    if (completeReminderMatch && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = followups.completeReminder(completeReminderMatch[1], body.notes);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    const postponeReminderMatch = pathname.match(/^\/api\/reminders\/([^\/]+)\/postpone$/);
    if (postponeReminderMatch && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = followups.rescheduleReminder(postponeReminderMatch[1], body.days || 2, body.custom_date);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    const deleteReminderMatch = pathname.match(/^\/api\/reminders\/([^\/]+)$/);
    if (deleteReminderMatch && method === 'DELETE') {
      const reason = url.searchParams.get('reason') || '';
      const result = followups.cancelReminder(deleteReminderMatch[1], reason);
      return sendJson(res, 200, result);
    }

    // ----------------------------------------------------
    // 7. AI MESSAGE WRITER
    // ----------------------------------------------------
    if (pathname === '/api/ai/write-message' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = await ai.generateMessageDraft(body);
      return sendJson(res, 200, result);
    }

    // ----------------------------------------------------
    // 8. AI CONVERSATION COACH
    // ----------------------------------------------------
    if (pathname === '/api/ai/coach' && method === 'POST') {
      const body = await parseJsonBody(req);
      const prospect = body.prospect || (body.prospect_id ? crm.getProspectById(body.prospect_id) : {});
      const messages = body.messages || [];
      const result = await ai.generateCoachAdvice(prospect, messages);
      return sendJson(res, 200, result);
    }

    // ----------------------------------------------------
    // 9. AI CHAT & RESEARCH COMMAND CENTER
    // ----------------------------------------------------
    if (pathname === '/api/ai/command-center' && method === 'POST') {
      const body = await parseJsonBody(req);
      const instruction = body.message || body.instruction || '';

      if (!instruction.trim()) {
        return sendJson(res, 400, { ok: false, error: 'Command prompt cannot be empty' });
      }

      // Gather live database context to feed into command center
      const crmStats = crm.getCRMStats();
      const context = {
        total_contacts: crmStats.total_contacts,
        followups_due_today: crmStats.followups_due_today,
        overdue_followups: crmStats.followups_overdue,
        converted_customers: crmStats.converted_customers
      };

      const result = await ai.processCommandCenterInstruction(instruction, context);

      // Save to chat history
      const userMsgId = `cmd_u_${Date.now()}`;
      const botMsgId = `cmd_a_${Date.now()}`;
      db.prepare('INSERT INTO chat_command_history (id, role, content) VALUES (?, ?, ?)').run(userMsgId, 'user', instruction);
      db.prepare('INSERT INTO chat_command_history (id, role, content) VALUES (?, ?, ?)').run(botMsgId, 'assistant', result.response);

      return sendJson(res, 200, {
        ok: true,
        response: result.response,
        source: result.source
      });
    }

    if (pathname === '/api/ai/command-center/history' && method === 'GET') {
      const history = db.prepare('SELECT * FROM chat_command_history ORDER BY created_at ASC LIMIT 50').all();
      return sendJson(res, 200, { ok: true, data: history });
    }

    // ----------------------------------------------------
    // 10. SYSTEM CONFIGURATION & DATA PRIVACY
    // ----------------------------------------------------
    if (pathname === '/api/settings' && method === 'GET') {
      const botTokenRow = db.prepare("SELECT value FROM settings WHERE key = 'discord_bot_token'").get();
      const geminiRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
      const openaiRow = db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get();

      const rawToken = botTokenRow ? botTokenRow.value : '';
      const maskedToken = rawToken ? `${rawToken.substring(0, 10)}...${rawToken.substring(rawToken.length - 4)}` : '';

      return sendJson(res, 200, {
        ok: true,
        has_bot_token: !!rawToken,
        masked_bot_token: maskedToken,
        has_gemini_key: !!(geminiRow && geminiRow.value),
        has_openai_key: !!(openaiRow && openaiRow.value)
      });
    }

    if (pathname === '/api/settings' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (body.discord_bot_token !== undefined) {
        discord.saveBotToken(body.discord_bot_token);
      }
      if (body.gemini_api_key !== undefined) {
        db.prepare(`
          INSERT INTO settings (key, value, updated_at)
          VALUES ('gemini_api_key', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(body.gemini_api_key.trim());
      }
      if (body.openai_api_key !== undefined) {
        db.prepare(`
          INSERT INTO settings (key, value, updated_at)
          VALUES ('openai_api_key', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(body.openai_api_key.trim());
      }
      return sendJson(res, 200, { ok: true, message: 'Settings saved successfully' });
    }

    // Data Wipe Requirement: Provide a way to delete stored contacts and research data
    if (pathname === '/api/system/wipe-data' && method === 'POST') {
      const result = wipeAllUserData();
      return sendJson(res, 200, result);
    }

    // ----------------------------------------------------
    // 11. STATIC FRONTEND SERVING
    // ----------------------------------------------------
    return serveStatic(req, res, pathname);

  } catch (err) {
    console.error('Server error:', err);
    return sendJson(res, 500, { ok: false, error: `Internal Server Error: ${err.message}` });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n============================================================`);
  console.log(` ELITE VISION GLOBAL - Personal Discord AI Business Assistant`);
  console.log(` Dashboard running on port: ${PORT}`);
  console.log(`============================================================\n`);
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    process.exit(0);
  });
});
