/**
 * ELITE VISION GLOBAL - Personal Discord AI Business Assistant
 * Frontend Controller & Application Engine
 */

class BusinessAssistantApp {
  constructor() {
    this.currentView = 'dashboard';
    this.crmViewMode = 'kanban';
    this.followupTab = 'today';
    this.selectedGuildId = null;
    this.selectedChannelId = null;
    this.activeProspectId = null;
    this.businessSettings = {};
    this.prospectsCache = [];
    this.remindersCache = [];
    this.scannedFindingsCache = [];
    this.userSession = null;
  }

  async init() {
    this.setupNavigation();
    await this.loadBusinessSettings();
    await this.checkAuthStatus();
    await this.loadBotStatus();
    await this.loadCRMStats();
    await this.loadProspects();
    await this.loadReminders();
    await this.loadSavedCommunities();
    await this.loadBotGuilds();
    await this.loadSettings();
    await this.checkOAuthDiagnostic();

    // Check URL parameters for OAuth status
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
      this.showToast('Successfully connected your Discord account!', 'success');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('error')) {
      const err = urlParams.get('error');
      const reason = urlParams.get('reason');
      if (err === 'oauth_config_invalid') {
        this.showToast(`Setup Required: ${reason || 'Discord Application ID is missing or invalid.'}`, 'warning');
        this.switchView('connections');
      } else {
        this.showToast(`Discord connection notice: ${err}`, 'warning');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // ----------------------------------------------------
  // NAVIGATION & VIEW SWITCHING
  // ----------------------------------------------------
  setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = item.getAttribute('data-view');
        if (view) this.switchView(view);
      });
    });
  }

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-view') === viewName);
    });

    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.remove('active');
    });

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active');
    }

    const titleMap = {
      'dashboard': 'Overview Dashboard',
      'connections': 'Discord Connections & Permissions',
      'servers': 'Server Management & Channel Monitor',
      'research': 'AI Research Assistant',
      'workspace': 'Conversation Workspace (CRM)',
      'messages': 'AI Message Writer',
      'followups': 'Smart Follow-Up System',
      'coach': 'AI Conversation Coach',
      'command-center': 'AI Chat & Command Center',
      'business': 'Business Profile & Pricing',
      'settings': 'AI Provider & Privacy Settings'
    };

    const titleEl = document.getElementById('pageTitle');
    if (titleEl) {
      titleEl.innerHTML = `<span>${titleMap[viewName] || 'Business Assistant'}</span>`;
    }

    // Refresh context when switching into views
    if (viewName === 'connections') this.checkOAuthDiagnostic();
    if (viewName === 'settings') this.loadSettings();
    if (viewName === 'workspace') this.loadProspects();
    if (viewName === 'followups') this.loadReminders();
    if (viewName === 'messages') this.populateProspectsDropdown();
    if (viewName === 'coach') this.populateCoachProspectsDropdown();
    if (viewName === 'servers') this.loadBotGuilds();
    if (viewName === 'dashboard') this.loadCRMStats();
  }

  // ----------------------------------------------------
  // BUSINESS SETTINGS
  // ----------------------------------------------------
  async loadBusinessSettings() {
    try {
      const res = await fetch('/api/business');
      const data = await res.json();
      if (data.ok && data.data) {
        this.businessSettings = data.data;
        this.populateBusinessSettingsForm(data.data);
      }
    } catch (err) {
      console.warn('Failed to load business settings:', err);
    }
  }

  populateBusinessSettingsForm(b) {
    const brandEl = document.getElementById('sidebarBrandName');
    if (brandEl) brandEl.innerText = b.business_name || 'ELITE VISION';

    if (document.getElementById('bizName')) document.getElementById('bizName').value = b.business_name || '';
    if (document.getElementById('bizTelegram')) document.getElementById('bizTelegram').value = b.telegram_handle || '';
    if (document.getElementById('bizServicesDesc')) document.getElementById('bizServicesDesc').value = b.services_description || '';
    if (document.getElementById('bizSub1m')) document.getElementById('bizSub1m').value = b.sub_1m || 15;
    if (document.getElementById('bizSub3m')) document.getElementById('bizSub3m').value = b.sub_3m || 35;
    if (document.getElementById('bizSub6m')) document.getElementById('bizSub6m').value = b.sub_6m || 55;
    if (document.getElementById('bizSub12m')) document.getElementById('bizSub12m').value = b.sub_12m || 80;
    if (document.getElementById('bizReseller120')) document.getElementById('bizReseller120').value = b.reseller_120 || 350;
    if (document.getElementById('bizRebrandPanel')) document.getElementById('bizRebrandPanel').value = b.rebrand_with_panel || 150;
    if (document.getElementById('bizAppDevPolicy')) document.getElementById('bizAppDevPolicy').value = b.app_dev_policy || '';
    if (document.getElementById('bizServerPolicy')) document.getElementById('bizServerPolicy').value = b.server_setup_policy || '';
  }

  async saveBusinessSettings() {
    const payload = {
      business_name: document.getElementById('bizName').value,
      telegram_handle: document.getElementById('bizTelegram').value,
      services_description: document.getElementById('bizServicesDesc').value,
      sub_1m: document.getElementById('bizSub1m').value,
      sub_3m: document.getElementById('bizSub3m').value,
      sub_6m: document.getElementById('bizSub6m').value,
      sub_12m: document.getElementById('bizSub12m').value,
      reseller_120: document.getElementById('bizReseller120').value,
      rebrand_with_panel: document.getElementById('bizRebrandPanel').value,
      app_dev_policy: document.getElementById('bizAppDevPolicy').value,
      server_setup_policy: document.getElementById('bizServerPolicy').value
    };

    try {
      const res = await fetch('/api/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        this.businessSettings = data.data;
        this.showToast('Business profile and pricing updated successfully!', 'success');
      }
    } catch (err) {
      this.showToast('Error saving business settings: ' + err.message, 'error');
    }
  }

  // ----------------------------------------------------
  // DISCORD AUTHENTICATION & BOT CONNECTION
  // ----------------------------------------------------
  async checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.ok && data.logged_in && data.user) {
        this.userSession = data.user;
        this.renderLoggedInUser(data.user);
      } else {
        this.renderLoggedOutUser();
      }
    } catch (err) {
      this.renderLoggedOutUser();
    }
  }

  renderLoggedInUser(u) {
    const loginBtn = document.getElementById('btnLoginDiscord');
    const profilePill = document.getElementById('userProfilePill');
    const avatarImg = document.getElementById('userAvatarImg');
    const displayName = document.getElementById('userDisplayNameText');

    if (loginBtn) loginBtn.style.display = 'none';
    if (profilePill) profilePill.style.display = 'flex';
    if (avatarImg && u.avatar) avatarImg.src = u.avatar;
    if (displayName) displayName.innerText = u.global_name || u.username;

    // Connections View elements
    const connAvatar = document.getElementById('connUserAvatar');
    const connUsername = document.getElementById('connUsername');
    const connUserId = document.getElementById('connUserId');
    const connStatusBadge = document.getElementById('connStatusBadge');
    const btnOAuthLogin = document.getElementById('btnOAuthLogin');
    const btnOAuthLogout = document.getElementById('btnOAuthLogout');

    if (connAvatar && u.avatar) connAvatar.src = u.avatar;
    if (connUsername) connUsername.innerText = `${u.global_name || u.username} (@${u.username})`;
    if (connUserId) connUserId.innerText = `Discord User ID: ${u.discord_user_id}`;
    if (connStatusBadge) connStatusBadge.innerHTML = '<span class="badge badge-green">Connected via OAuth2</span>';
    if (btnOAuthLogin) btnOAuthLogin.style.display = 'none';
    if (btnOAuthLogout) btnOAuthLogout.style.display = 'inline-flex';
  }

  renderLoggedOutUser() {
    const loginBtn = document.getElementById('btnLoginDiscord');
    const profilePill = document.getElementById('userProfilePill');
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (profilePill) profilePill.style.display = 'none';

    const connAvatar = document.getElementById('connUserAvatar');
    const connUsername = document.getElementById('connUsername');
    const connUserId = document.getElementById('connUserId');
    const connStatusBadge = document.getElementById('connStatusBadge');
    const btnOAuthLogin = document.getElementById('btnOAuthLogin');
    const btnOAuthLogout = document.getElementById('btnOAuthLogout');

    if (connAvatar) connAvatar.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
    if (connUsername) connUsername.innerText = 'Not Connected';
    if (connUserId) connUserId.innerText = 'Discord User ID: —';
    if (connStatusBadge) connStatusBadge.innerHTML = '<span class="badge badge-gray">Disconnected</span>';
    if (btnOAuthLogin) btnOAuthLogin.style.display = 'inline-flex';
    if (btnOAuthLogout) btnOAuthLogout.style.display = 'none';
  }

  async loginDiscordOAuth() {
    try {
      const res = await fetch('/api/auth/status');
      const json = await res.json();
      if (!json.ok || !json.data || !json.data.is_ready) {
        const errs = json?.data?.validation?.errors || ['Discord Application ID (Client ID) is not configured yet.'];
        this.showToast(`Cannot sign in: ${errs[0]}`, 'warning');
        this.switchView('connections');
        const alertBox = document.getElementById('oauthAlertBox');
        if (alertBox) {
          alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const input = document.getElementById('connClientId');
        if (input) input.focus();
        return;
      }
      window.location.href = '/api/auth/discord/login';
    } catch (e) {
      window.location.href = '/api/auth/discord/login';
    }
  }

  async checkOAuthDiagnostic() {
    try {
      const res = await fetch('/api/auth/status');
      const json = await res.json();
      if (!json.ok || !json.data) return;

      const data = json.data;
      const badge = document.getElementById('oauthReadinessBadge');
      const alertBox = document.getElementById('oauthAlertBox');
      const inputClientId = document.getElementById('connClientId');
      const inputRedirectUri = document.getElementById('connRedirectUri');

      if (inputRedirectUri && data.exact_redirect_uri) {
        inputRedirectUri.value = data.exact_redirect_uri;
      }

      if (inputClientId && data.validation && data.validation.details && data.validation.details.client_id) {
        if (!inputClientId.value) {
          inputClientId.value = data.validation.details.client_id;
          this.validateClientIdInput(inputClientId.value);
        }
      }

      if (data.is_ready) {
        if (badge) {
          badge.innerHTML = '<span class="badge badge-green">&#10003; Ready to Connect</span>';
        }
        if (alertBox) {
          alertBox.style.display = 'block';
          alertBox.style.background = 'rgba(34, 197, 94, 0.1)';
          alertBox.style.border = '1px solid rgba(34, 197, 94, 0.3)';
          alertBox.style.color = 'var(--accent-green)';
          alertBox.innerHTML = `
            <div style="font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
              <span>&#10003;</span> Discord OAuth2 Application Configured & Verified
            </div>
            <div style="font-size:12px; color:var(--text-secondary);">
              Application ID <code>${data.validation.details.client_id}</code> is verified. Click <strong>"Sign in with Discord"</strong> above to authenticate your personal account.
            </div>
          `;
        }
      } else {
        if (badge) {
          badge.innerHTML = '<span class="badge badge-amber">&#9888; Setup Required</span>';
        }
        if (alertBox) {
          alertBox.style.display = 'block';
          alertBox.style.background = 'rgba(245, 158, 11, 0.1)';
          alertBox.style.border = '1px solid rgba(245, 158, 11, 0.35)';
          alertBox.style.color = '#fde68a';

          const errorsHtml = (data.validation.errors || [])
            .map(err => `<li style="margin-bottom:3px;">${this.escapeHtml(err)}</li>`)
            .join('');

          alertBox.innerHTML = `
            <div style="font-weight:700; margin-bottom:6px; color:#fbbf24; display:flex; align-items:center; gap:6px;">
              <span>&#9888;</span> Action Required to Avoid "Unknown Application" Error
            </div>
            <div style="font-size:12px; margin-bottom:8px; color:var(--text-primary);">
              Discord rejects login requests unless your registered <strong>Application ID</strong> and <strong>Redirect URI</strong> are configured:
            </div>
            <ul style="margin:0 0 10px 18px; padding:0; font-size:12px; color:#fca5a5;">
              ${errorsHtml || '<li>Discord Application ID (Client ID) is missing or incomplete.</li>'}
            </ul>
            <div style="font-size:11.5px; background:rgba(0,0,0,0.3); padding:8px 10px; border-radius:4px; color:var(--text-secondary); line-height:1.45;">
              <strong>3-Minute Setup:</strong><br>
              1. Open <a href="https://discord.com/developers/applications" target="_blank" style="color:var(--accent-blue); text-decoration:underline;">Discord Developer Portal</a> &rarr; Your App &rarr; <em>General Information</em>.<br>
              2. Copy your 18-20 digit <strong>APPLICATION ID</strong> and paste it into the field below.<br>
              3. Go to <em>OAuth2 &rarr; Redirects</em> &rarr; Click <em>Add Redirect</em>, paste <code>${data.exact_redirect_uri}</code>, and click <em>Save Changes</em>.<br>
              4. Copy your <strong>Client Secret</strong> from <em>OAuth2 &rarr; General</em> and paste it below, then click <strong>"Save & Verify OAuth Configuration"</strong>.
            </div>
          `;
        }
      }
    } catch (e) {
      console.warn('OAuth diagnostic check failed:', e);
    }
  }

  validateClientIdInput(val) {
    const feedback = document.getElementById('clientIdFeedback');
    if (!feedback) return;
    const trimmed = (val || '').trim();

    if (!trimmed) {
      feedback.style.color = 'var(--text-muted)';
      feedback.innerHTML = 'Found under "General Information" &rarr; APPLICATION ID in Discord Developer Portal.';
      return;
    }

    if (trimmed.includes('.')) {
      feedback.style.color = 'var(--accent-red)';
      feedback.innerHTML = '&#9888; <strong>Warning:</strong> This looks like a Discord Bot Token (contains dots), not an Application ID! Paste the 18-20 digit Application ID from General Information.';
      return;
    }

    if (!/^\d+$/.test(trimmed)) {
      feedback.style.color = 'var(--accent-red)';
      feedback.innerHTML = '&#9888; Application ID must contain only digits (0-9). Found letters or special characters.';
      return;
    }

    if (trimmed === '123456789012345678' || trimmed === '1341234567890123456') {
      feedback.style.color = 'var(--accent-amber)';
      feedback.innerHTML = '&#9888; This is a sample placeholder ID. Replace it with your actual Discord Application ID.';
      return;
    }

    if (trimmed.length < 17 || trimmed.length > 21) {
      feedback.style.color = 'var(--accent-amber)';
      feedback.innerHTML = `&#8505; Discord IDs are typically 17&ndash;20 digits (current: ${trimmed.length} digits).`;
      return;
    }

    feedback.style.color = 'var(--accent-green)';
    feedback.innerHTML = '&#10003; Valid Discord Application ID format (Snowflake).';
  }

  validateClientSecretInput(val) {
    const feedback = document.getElementById('clientSecretFeedback');
    if (!feedback) return;
    const trimmed = (val || '').trim();

    if (!trimmed) {
      feedback.style.color = 'var(--text-muted)';
      feedback.innerHTML = 'Found under "OAuth2" &rarr; "General" in the Discord Developer Portal.';
      return;
    }

    if (trimmed.includes(' ')) {
      feedback.style.color = 'var(--accent-red)';
      feedback.innerHTML = '&#9888; Client Secret cannot contain spaces.';
      return;
    }

    if (trimmed.length === 32) {
      feedback.style.color = 'var(--accent-green)';
      feedback.innerHTML = '&#10003; Standard Discord Client Secret length (32 chars).';
      return;
    }

    feedback.style.color = 'var(--accent-amber)';
    feedback.innerHTML = `Current length: ${trimmed.length} characters (Discord secrets are typically 32 chars).`;
  }

  copyExactRedirectUri() {
    const input = document.getElementById('connRedirectUri') || document.getElementById('inputRedirectUri');
    const uri = input ? input.value : 'http://localhost:3000/api/auth/discord/callback';
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(uri).then(() => {
        this.showToast('Redirect URI copied to clipboard!', 'success');
      }).catch(() => {
        this.fallbackCopyText(uri);
      });
    } else {
      this.fallbackCopyText(uri);
    }
  }

  fallbackCopyText(text) {
    const temp = document.createElement('textarea');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand('copy');
      this.showToast('Redirect URI copied to clipboard!', 'success');
    } catch (e) {
      this.showToast('Please copy manually: ' + text, 'info');
    }
    document.body.removeChild(temp);
  }

  async saveConnOAuthConfig() {
    const clientId = (document.getElementById('connClientId')?.value || '').trim();
    const clientSecret = (document.getElementById('connClientSecret')?.value || '').trim();
    const redirectUri = (document.getElementById('connRedirectUri')?.value || '').trim();

    if (!clientId) {
      this.showToast('Please enter your Discord Application ID (Client ID)', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/auth/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri
        })
      });
      const data = await res.json();
      if (data.ok) {
        this.showToast('Discord OAuth configuration saved successfully!', 'success');
        const inClientId = document.getElementById('inputClientId');
        const inRedirectUri = document.getElementById('inputRedirectUri');
        if (inClientId) inClientId.value = clientId;
        if (inRedirectUri) inRedirectUri.value = redirectUri;

        await this.checkOAuthDiagnostic();
      } else {
        this.showToast('Error saving OAuth config: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (e) {
      this.showToast('Failed to save OAuth settings: ' + e.message, 'error');
    }
  }

  async logoutDiscordOAuth() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      this.userSession = null;
      this.renderLoggedOutUser();
      this.showToast('Discord account disconnected.', 'success');
    } catch (e) {
      this.showToast('Failed to disconnect: ' + e.message, 'error');
    }
  }

  async loadBotStatus() {
    try {
      const res = await fetch('/api/discord/bot');
      const data = await res.json();
      const dot = document.getElementById('botStatusDot');
      const text = document.getElementById('botStatusText');
      const details = document.getElementById('botDetailsBox');

      if (data.ok && data.data) {
        const b = data.data;
        if (dot) dot.classList.add('connected');
        if (text) text.innerText = `Bot: ${b.username}`;
        if (details) {
          details.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="https://cdn.discordapp.com/avatars/${b.id}/${b.avatar}.png" style="width:36px; height:36px; border-radius:50%;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
              <div>
                <div style="font-weight:700; color:white;">${b.username}#${b.discriminator || '0000'}</div>
                <div style="font-size:11.5px; color:var(--accent-green);">Active & Authorized on Discord</div>
              </div>
            </div>
            <div style="margin-top:10px; font-size:12px; color:var(--text-secondary);">
              Bot ID: <code>${b.id}</code>
            </div>
          `;
        }
      } else {
        if (dot) dot.classList.remove('connected');
        if (text) text.innerText = 'Bot: Not Connected';
        if (details) {
          details.innerHTML = '<div style="color:var(--accent-amber);">Bot token is not configured or invalid. Enter your token to authorize channel inspection.</div>';
        }
      }
    } catch (e) {
      console.warn('Bot status check error:', e);
    }
  }

  async saveBotToken() {
    const token = document.getElementById('inputBotToken').value.trim();
    if (!token) return this.showToast('Please enter a bot token', 'warning');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discord_bot_token: token })
      });
      const data = await res.json();
      if (data.ok) {
        this.showToast('Bot token saved! Verifying connection...', 'success');
        await this.loadBotStatus();
        await this.loadBotGuilds();
      }
    } catch (err) {
      this.showToast('Error saving bot token: ' + err.message, 'error');
    }
  }

  async openBotInvite() {
    try {
      const res = await fetch('/api/discord/bot-invite-url');
      const data = await res.json();
      if (data.ok && data.invite_url) {
        window.open(data.invite_url, '_blank');
      } else {
        this.showToast('Please enter and save your Discord Application ID (Client ID) above to generate the invite URL.', 'warning');
        this.switchView('connections');
        const input = document.getElementById('connClientId');
        if (input) {
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    } catch (e) {
      this.showToast('Failed to generate invite URL: ' + e.message, 'error');
    }
  }

  // ----------------------------------------------------
  // SERVER MANAGEMENT & CHANNEL MONITOR
  // ----------------------------------------------------
  async loadBotGuilds() {
    const container = document.getElementById('authorizedServersList');
    if (!container) return;

    try {
      const res = await fetch('/api/discord/guilds');
      const data = await res.json();

      if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
        const badge = document.getElementById('serverCountBadge');
        if (badge) badge.innerText = data.data.length;

        container.innerHTML = data.data.map(g => {
          const iconSrc = g.icon_url || 'https://cdn.discordapp.com/embed/avatars/1.png';
          const permsList = g.permissions_breakdown || ['Authorized'];
          return `
            <div class="server-item-card ${this.selectedGuildId === g.id ? 'active' : ''}" onclick="app.selectServer('${g.id}', '${encodeURIComponent(g.name)}')" style="padding:12px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:var(--radius-sm); cursor:pointer; display:flex; gap:12px; align-items:center;">
              <img src="${iconSrc}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
              <div style="flex:1; min-width:0;">
                <div style="font-size:13.5px; font-weight:700; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${g.name}</div>
                <div style="font-size:11.5px; color:var(--text-secondary);">${g.approximate_member_count ? g.approximate_member_count.toLocaleString() + ' members' : 'Bot member'}</div>
                <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">
                  ${permsList.slice(0, 2).map(p => `<span class="badge badge-blue" style="font-size:9.5px; padding:1px 5px;">${p}</span>`).join('')}
                </div>
              </div>
            </div>
          `;
        }).join('');

        // Auto select first server if none selected
        if (!this.selectedGuildId && data.data[0]) {
          this.selectServer(data.data[0].id, encodeURIComponent(data.data[0].name));
        }
      } else {
        container.innerHTML = `
          <div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:13px;">
            No authorized servers found. Add the bot to your server using "+ Add Bot to Another Server".
          </div>
        `;
      }
    } catch (e) {
      container.innerHTML = `<div style="color:var(--accent-red); font-size:12px;">Error loading servers: ${e.message}</div>`;
    }
  }

  refreshBotGuilds() {
    this.showToast('Refreshing Discord servers...', 'info');
    this.loadBotGuilds();
  }

  async selectServer(guildId, encodedName) {
    this.selectedGuildId = guildId;
    const serverName = decodeURIComponent(encodedName);

    const titleEl = document.getElementById('selectedServerTitle');
    const subEl = document.getElementById('selectedServerSub');
    const actionsEl = document.getElementById('selectedServerActions');
    const channelSection = document.getElementById('channelWhitelistSection');
    const scanBtn = document.getElementById('btnScanChannel');

    if (titleEl) titleEl.innerText = serverName;
    if (subEl) subEl.innerText = `Server ID: ${guildId} — Configure allowed channels below`;
    if (actionsEl) actionsEl.style.display = 'block';
    if (channelSection) channelSection.style.display = 'block';
    if (scanBtn) scanBtn.style.display = 'inline-flex';

    await this.loadServerChannels(guildId);
  }

  async loadServerChannels(guildId) {
    const container = document.getElementById('channelsCheckboxList');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-muted); font-size:12px;">Loading channels...</div>';

    try {
      const res = await fetch(`/api/discord/guilds/${guildId}/channels`);
      const data = await res.json();

      if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
        // Also fetch monitored channels status from DB
        const monRes = await fetch(`/api/discord/guilds/${guildId}/monitored-channels`);
        const monData = await monRes.json();
        const monMap = {};
        if (monData.ok && Array.isArray(monData.data)) {
          monData.data.forEach(c => { monMap[c.id] = c.is_allowed_to_read; });
        }

        container.innerHTML = data.data.map(ch => {
          const isAllowed = monMap[ch.id] !== undefined ? Boolean(monMap[ch.id]) : true;
          return `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 8px; background:var(--bg-card); border-radius:4px;">
              <span style="font-size:12.5px; font-weight:600; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"># ${ch.name}</span>
              <label class="switch">
                <input type="checkbox" ${isAllowed ? 'checked' : ''} onchange="app.toggleChannelPermission('${ch.id}', this.checked)">
                <span class="slider"></span>
              </label>
            </div>
          `;
        }).join('');

        // Set first channel as selected channel
        this.selectedChannelId = data.data[0].id;
        this.searchChannelMessages();
      } else {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:12px;">No text channels available or bot lacks View Channels permission.</div>';
      }
    } catch (e) {
      container.innerHTML = `<div style="color:var(--accent-red); font-size:12px;">Failed to load channels: ${e.message}</div>`;
    }
  }

  async toggleChannelPermission(channelId, isAllowed) {
    try {
      await fetch(`/api/discord/channels/${channelId}/permission`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_allowed: isAllowed })
      });
      this.showToast(`Channel reading ${isAllowed ? 'enabled' : 'restricted'}.`, 'success');
    } catch (e) {
      this.showToast('Error updating channel permission: ' + e.message, 'error');
    }
  }

  async scanCurrentChannelDiscussions() {
    if (!this.selectedGuildId || !this.selectedChannelId) {
      return this.showToast('Please select a server and channel first.', 'warning');
    }

    this.showToast('Scanning channel messages for buying signals & opportunities...', 'info');

    try {
      const res = await fetch(`/api/discord/channels/${this.selectedChannelId}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: this.selectedGuildId, limit: 50 })
      });
      const data = await res.json();

      if (data.ok) {
        this.showToast(`Scan complete: Found ${data.opportunities_found} potential opportunities!`, 'success');
        this.renderChannelMessages(data.findings);
        this.loadCRMStats();
      } else {
        this.showToast('Scan notice: ' + data.error, 'warning');
      }
    } catch (e) {
      this.showToast('Scan error: ' + e.message, 'error');
    }
  }

  async searchChannelMessages() {
    const query = document.getElementById('inputSearchMessages') ? document.getElementById('inputSearchMessages').value.trim() : '';
    try {
      const url = `/api/discord/channel-messages?guild_id=${this.selectedGuildId || ''}&search=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok && Array.isArray(data.data)) {
        this.renderChannelMessages(data.data);
      }
    } catch (e) {
      console.warn('Search channel messages failed:', e);
    }
  }

  renderChannelMessages(messages = []) {
    const container = document.getElementById('channelMessagesContainer');
    if (!container) return;

    if (messages.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">
          No messages found. Click "Scan Channel Messages" to inspect discussions.
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(m => {
      const authorName = m.author?.display_name || m.author_display_name || m.author?.username || m.author_username || 'Discord User';
      const authorAvatar = m.author?.avatar_url || m.author_avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
      const jumpUrl = m.jump_url || `https://discord.com/channels/${m.guild_id}/${m.channel_id}/${m.id || m.message_id}`;
      const signals = m.buying_signals || [];

      return `
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="${authorAvatar}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
              <div>
                <span style="font-size:13.5px; font-weight:700; color:white;">${authorName}</span>
                <span style="font-size:11px; color:var(--text-muted); margin-left:6px;">${new Date(m.posted_at || m.timestamp || Date.now()).toLocaleTimeString()}</span>
              </div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <span class="badge ${m.priority === 'High' ? 'badge-amber' : 'badge-blue'}">${m.priority || 'Opportunity'}</span>
              <a href="${jumpUrl}" target="_blank" class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:11px;">Open in Discord ↗</a>
              <button class="btn btn-primary btn-sm" style="padding:3px 8px; font-size:11px;" onclick="app.convertMessageToProspect('${encodeURIComponent(JSON.stringify(m))}')">+ Add to CRM</button>
            </div>
          </div>
          <div style="font-size:13.5px; color:#e2e8f0; line-height:1.5; margin-bottom:8px; white-space:pre-wrap;">${this.escapeHtml(m.content)}</div>
          ${signals.length > 0 ? `
            <div style="background:rgba(37,99,235,0.08); border-left:3px solid var(--accent-blue); padding:6px 10px; border-radius:3px; font-size:11.5px; color:var(--accent-cyan);">
              <strong>Detected Need:</strong> ${signals.join('; ')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  async convertMessageToProspect(encodedMessageJson) {
    try {
      const m = JSON.parse(decodeURIComponent(encodedMessageJson));
      const author = m.author || {
        id: m.author_id,
        username: m.author_username,
        display_name: m.author_display_name,
        avatar_url: m.author_avatar
      };

      const payload = {
        discord_user_id: author.id,
        username: author.username || 'user',
        display_name: author.display_name || author.username,
        avatar_url: author.avatar_url,
        source_community_name: document.getElementById('selectedServerTitle')?.innerText || 'Discord Server',
        source_message_url: m.jump_url,
        source_type: 'authorized_channel_research',
        status: 'new_contact',
        stated_interests: m.buying_signals || ['IPTV Inquiries'],
        service_interested: m.category || 'IPTV Subscriptions',
        private_notes: `Discovered from public discussion: "${m.content.slice(0, 150)}..."`
      };

      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Saved ${payload.display_name} to CRM!`, 'success');
        this.loadProspects();
        this.loadCRMStats();
      }
    } catch (e) {
      this.showToast('Error converting to contact: ' + e.message, 'error');
    }
  }

  async removeSelectedServerFromWorkspace() {
    if (!this.selectedGuildId) return;
    if (!confirm('Are you sure you want to remove this server from your research workspace?')) return;

    try {
      const res = await fetch(`/api/discord/guilds/${this.selectedGuildId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        this.showToast('Server removed from workspace.', 'success');
        this.selectedGuildId = null;
        this.loadBotGuilds();
      }
    } catch (e) {
      this.showToast('Error removing server: ' + e.message, 'error');
    }
  }

  // ----------------------------------------------------
  // AI RESEARCH ASSISTANT & COMMUNITY RESOLVER
  // ----------------------------------------------------
  async resolveInviteCode() {
    const input = document.getElementById('inputInviteCode').value.trim();
    if (!input) return this.showToast('Please enter an invite link or code', 'warning');

    const resultBox = document.getElementById('inviteResolveResult');
    resultBox.style.display = 'block';
    resultBox.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Resolving community via Discord official API...</div>';

    try {
      const res = await fetch('/api/discovery/resolve-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite: input })
      });
      const data = await res.json();

      if (data.ok && data.data) {
        const d = data.data;
        resultBox.innerHTML = `
          <div style="background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:16px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div style="display:flex; gap:14px; align-items:center;">
                <img src="${d.icon_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:48px; height:48px; border-radius:50%;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                <div>
                  <h4 style="font-size:16px; font-weight:700; color:white;">${d.name}</h4>
                  <div style="font-size:12.5px; color:var(--text-secondary);">${d.member_count.toLocaleString()} members (${d.presence_count.toLocaleString()} online)</div>
                </div>
              </div>
              <div style="text-align:right;">
                <span class="badge ${d.relevance_score >= 60 ? 'badge-amber' : 'badge-blue'}">${d.relevance_score}% IPTV Relevance</span>
                <button class="btn btn-primary btn-sm" style="margin-top:6px; display:block;" onclick="app.saveCommunityToWatchlist('${encodeURIComponent(JSON.stringify(d))}')">+ Save to Watchlist</button>
              </div>
            </div>
            <p style="font-size:13px; color:var(--text-secondary); margin:12px 0 8px;">${d.description || 'No description provided.'}</p>
            <div style="font-size:12px; color:var(--accent-cyan);">
              <strong>Relevance Rationale:</strong> ${d.relevance_reasons.join('; ')}
            </div>
          </div>
        `;
      } else {
        resultBox.innerHTML = `<div style="color:var(--accent-red); font-size:13px;">${data.error || 'Failed to resolve invite code'}</div>`;
      }
    } catch (e) {
      resultBox.innerHTML = `<div style="color:var(--accent-red); font-size:13px;">Error resolving invite: ${e.message}</div>`;
    }
  }

  async saveCommunityToWatchlist(encodedCommunityJson) {
    try {
      const c = JSON.parse(decodeURIComponent(encodedCommunityJson));
      const res = await fetch('/api/discovery/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c)
      });
      const data = await res.json();
      if (data.ok) {
        this.showToast('Community saved to research watchlist!', 'success');
        this.loadSavedCommunities();
      }
    } catch (e) {
      this.showToast('Error saving community: ' + e.message, 'error');
    }
  }

  async loadSavedCommunities() {
    const container = document.getElementById('savedCommunitiesList');
    if (!container) return;

    try {
      const res = await fetch('/api/discovery/saved');
      const data = await res.json();
      if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
        container.innerHTML = data.data.map(c => `
          <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:16px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
              <h4 style="font-size:14px; font-weight:700; color:white;">${c.name}</h4>
              <span class="badge badge-blue">${c.relevance_score}% Match</span>
            </div>
            <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">${c.member_count.toLocaleString()} members</div>
            <p style="font-size:12.5px; color:var(--text-secondary); line-height:1.4; margin-bottom:12px;">${c.description ? c.description.slice(0, 100) + '...' : 'Saved for research'}</p>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <a href="${c.invite_url}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:11.5px;">Join / Preview ↗</a>
              <button class="btn btn-danger btn-sm" style="padding:4px 8px; font-size:11px;" onclick="app.deleteSavedCommunity('${c.id}')">Remove</button>
            </div>
          </div>
        `).join('');
      } else {
        container.innerHTML = `
          <div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px; grid-column:1/-1;">
            No communities saved to watchlist yet.
          </div>
        `;
      }
    } catch (e) {
      console.warn('Failed to load saved communities:', e);
    }
  }

  async deleteSavedCommunity(id) {
    try {
      await fetch(`/api/discovery/saved/${id}`, { method: 'DELETE' });
      this.showToast('Removed community from watchlist.', 'success');
      this.loadSavedCommunities();
    } catch (e) {
      this.showToast('Failed to delete community: ' + e.message, 'error');
    }
  }

  // ----------------------------------------------------
  // CONVERSATION WORKSPACE (CRM - 11 STAGES)
  // ----------------------------------------------------
  async loadCRMStats() {
    try {
      const res = await fetch('/api/crm/stats');
      const data = await res.json();
      if (data.ok && data.data) {
        const s = data.data;
        if (document.getElementById('statTotalContacts')) document.getElementById('statTotalContacts').innerText = s.total_contacts;
        if (document.getElementById('statNewContacts')) document.getElementById('statNewContacts').innerText = `${s.new_contacts} new contacts`;
        if (document.getElementById('statOpenConvos')) document.getElementById('statOpenConvos').innerText = s.open_conversations;
        if (document.getElementById('statInterested')) document.getElementById('statInterested').innerText = s.interested;
        if (document.getElementById('statFollowupsDue')) document.getElementById('statFollowupsDue').innerText = s.followups_due_today;
        if (document.getElementById('statFollowupsOverdue')) document.getElementById('statFollowupsOverdue').innerText = `${s.followups_overdue} overdue`;
        if (document.getElementById('statConverted')) document.getElementById('statConverted').innerText = s.converted_customers;
        if (document.getElementById('statMonitoredChannels')) document.getElementById('statMonitoredChannels').innerText = s.monitored_channels;
        if (document.getElementById('statMonitoredServers')) document.getElementById('statMonitoredServers').innerText = `${s.monitored_servers} servers authorized`;

        const navBadge = document.getElementById('navContactCount');
        if (navBadge) {
          navBadge.innerText = s.total_contacts;
          navBadge.style.display = s.total_contacts > 0 ? 'inline-block' : 'none';
        }

        const navRem = document.getElementById('navReminderCount');
        if (navRem) {
          navRem.innerText = s.followups_due_today;
          navRem.style.display = s.followups_due_today > 0 ? 'inline-block' : 'none';
        }
      }
    } catch (e) {
      console.warn('Failed to load CRM stats:', e);
    }
  }

  async loadProspects() {
    const search = document.getElementById('crmSearchInput')?.value || '';
    const status = document.getElementById('crmFilterStage')?.value || 'all';
    const service = document.getElementById('crmFilterService')?.value || 'all';
    const sort = document.getElementById('crmSort')?.value || 'newest';

    try {
      const url = `/api/prospects?search=${encodeURIComponent(search)}&status=${status}&service=${service}&sort=${sort}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.ok && Array.isArray(data.data)) {
        this.prospectsCache = data.data;
        this.renderKanban(data.data);
        this.renderTable(data.data);
        this.renderDashboardRecentContacts(data.data.slice(0, 5));
        this.populateProspectsDropdown();
        this.populateCoachProspectsDropdown();
      }
    } catch (e) {
      console.warn('Failed to load prospects:', e);
    }
  }

  toggleCRMView(mode) {
    this.crmViewMode = mode;
    const kanbanBtn = document.getElementById('btnViewKanban');
    const tableBtn = document.getElementById('btnViewTable');
    const kanbanView = document.getElementById('crmKanbanView');
    const tableView = document.getElementById('crmTableView');

    if (mode === 'kanban') {
      kanbanBtn.style.background = 'var(--accent-blue)';
      kanbanBtn.style.color = 'white';
      tableBtn.style.background = 'transparent';
      tableBtn.style.color = 'var(--text-secondary)';
      kanbanView.style.display = 'flex';
      tableView.style.display = 'none';
    } else {
      tableBtn.style.background = 'var(--accent-blue)';
      tableBtn.style.color = 'white';
      kanbanBtn.style.background = 'transparent';
      kanbanBtn.style.color = 'var(--text-secondary)';
      tableView.style.display = 'block';
      kanbanView.style.display = 'none';
    }
  }

  renderKanban(prospects = []) {
    const container = document.getElementById('crmKanbanView');
    if (!container) return;

    const STAGES = [
      { id: 'new_contact', label: 'New Contact' },
      { id: 'researching', label: 'Researching' },
      { id: 'first_message_ready', label: 'First Message Ready' },
      { id: 'conversation_started', label: 'Conversation Started' },
      { id: 'interested', label: 'Interested' },
      { id: 'needs_more_info', label: 'Needs More Info' },
      { id: 'price_discussed', label: 'Price Discussed' },
      { id: 'followup_due', label: 'Follow-up Due' },
      { id: 'converted', label: 'Converted Customer' },
      { id: 'not_interested', label: 'Not Interested' },
      { id: 'archived', label: 'Archived' }
    ];

    container.innerHTML = STAGES.map(stage => {
      const stageProspects = prospects.filter(p => p.status === stage.id);
      return `
        <div class="kanban-column" id="col-${stage.id}">
          <div class="kanban-column-header">
            <span class="kanban-column-title">${stage.label}</span>
            <span class="kanban-column-count">${stageProspects.length}</span>
          </div>
          <div class="kanban-cards-container">
            ${stageProspects.map(p => this.renderKanbanCardHTML(p)).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  renderKanbanCardHTML(p) {
    const avatar = p.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const interests = p.stated_interests || [];
    return `
      <div class="kanban-card" onclick="app.openProspectDetail('${p.id}')">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <img src="${avatar}" style="width:24px; height:24px; border-radius:50%;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
          <div style="font-size:13px; font-weight:700; color:white; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${p.display_name || p.username}
          </div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">@${p.username} • ${p.source_community_name || 'Discord'}</div>
        <div style="font-size:11.5px; color:var(--accent-cyan); font-weight:600; margin-bottom:6px;">${p.service_interested || 'IPTV Subscriptions'}</div>
        ${p.private_notes ? `<div style="font-size:11.5px; color:var(--text-secondary); line-height:1.3; margin-bottom:6px;">${p.private_notes.slice(0, 60)}...</div>` : ''}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
          <span class="badge ${p.next_followup_at ? 'badge-amber' : 'badge-gray'}" style="font-size:10px;">
            ${p.next_followup_at ? 'Follow-up Set' : 'No Reminder'}
          </span>
          <span style="font-size:10px; color:var(--text-muted);">${new Date(p.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    `;
  }

  renderTable(prospects = []) {
    const tbody = document.getElementById('crmTableBody');
    if (!tbody) return;

    if (prospects.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No contacts matching criteria.</td></tr>';
      return;
    }

    tbody.innerHTML = prospects.map(p => `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <img src="${p.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:30px; height:30px; border-radius:50%;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
            <div>
              <div style="font-weight:700; color:white;">${p.display_name || p.username}</div>
              <div style="font-size:11px; color:var(--text-muted);">@${p.username}</div>
            </div>
          </div>
        </td>
        <td><span class="badge badge-blue">${p.status.replace(/_/g, ' ')}</span></td>
        <td style="color:var(--accent-cyan); font-weight:500;">${p.service_interested || '—'}</td>
        <td style="color:var(--text-secondary);">${p.source_community_name || 'Discord'}</td>
        <td style="color:var(--text-secondary); font-size:11.5px;">${p.last_interaction_at ? new Date(p.last_interaction_at).toLocaleDateString() : 'Never'}</td>
        <td>
          <div style="font-size:12px; color:white;">${p.next_suggested_action || 'Review conversation'}</div>
          ${p.next_followup_at ? `<div style="font-size:11px; color:var(--accent-amber);">Due: ${new Date(p.next_followup_at).toLocaleDateString()}</div>` : ''}
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="app.openProspectDetail('${p.id}')">View</button>
        </td>
      </tr>
    `).join('');
  }

  renderDashboardRecentContacts(contacts = []) {
    const list = document.getElementById('dashboardRecentContactsList');
    if (!list) return;

    if (contacts.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">No contacts added yet.</div>';
      return;
    }

    list.innerHTML = contacts.map(p => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border-color);">
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${p.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:32px; height:32px; border-radius:50%;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
          <div>
            <div style="font-weight:700; color:white; font-size:13px;">${p.display_name || p.username}</div>
            <div style="font-size:11px; color:var(--text-muted);">@${p.username} • ${p.source_community_name || 'Discord'}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge badge-blue" style="font-size:11px;">${p.status.replace(/_/g, ' ')}</span>
          <button class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:11px;" onclick="app.openProspectDetail('${p.id}')">Open</button>
        </div>
      </div>
    `).join('');
  }

  openAddProspectModal() {
    this.openModal('modalAddProspect');
  }

  async submitAddProspect() {
    const username = document.getElementById('addUsername').value.trim();
    if (!username) return this.showToast('Please enter a Discord username', 'warning');

    const payload = {
      username: username,
      display_name: document.getElementById('addDisplayName').value.trim() || username,
      discord_user_id: document.getElementById('addUserId').value.trim(),
      status: document.getElementById('addStage').value,
      service_interested: document.getElementById('addService').value,
      source_community_name: document.getElementById('addSourceCommunity').value.trim() || 'Direct Outreach',
      stated_interests: document.getElementById('addInterests').value.split(',').map(s => s.trim()).filter(Boolean),
      private_notes: document.getElementById('addNotes').value.trim()
    };

    try {
      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('Contact added to CRM!', 'success');
        this.closeModal('modalAddProspect');
        this.loadProspects();
        this.loadCRMStats();
      }
    } catch (e) {
      this.showToast('Failed to add contact: ' + e.message, 'error');
    }
  }

  async openProspectDetail(id) {
    this.activeProspectId = id;
    const body = document.getElementById('prospectDetailBody');
    body.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Loading contact details...</div>';
    this.openModal('modalProspectDetail');

    try {
      const res = await fetch(`/api/prospects/${id}`);
      const data = await res.json();

      if (data.ok && data.data) {
        const p = data.data;
        document.getElementById('detailAvatar').src = p.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
        document.getElementById('detailDisplayName').innerText = p.display_name || p.username;
        document.getElementById('detailUsername').innerText = `@${p.username} • Contact ID: ${p.id}`;

        const STAGES = [
          { id: 'new_contact', label: 'New Contact' },
          { id: 'researching', label: 'Researching' },
          { id: 'first_message_ready', label: 'First Message Ready' },
          { id: 'conversation_started', label: 'Conversation Started' },
          { id: 'interested', label: 'Interested' },
          { id: 'needs_more_info', label: 'Needs More Info' },
          { id: 'price_discussed', label: 'Price Discussed' },
          { id: 'followup_due', label: 'Follow-up Due' },
          { id: 'converted', label: 'Converted Customer' },
          { id: 'not_interested', label: 'Not Interested' },
          { id: 'archived', label: 'Archived' }
        ];

        body.innerHTML = `
          <!-- Verified Discord Data Box (Requirement 5) -->
          <div class="discord-data-box">
            <span class="discord-data-badge">Verified Discord Information</span>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:12.5px; color:var(--text-secondary);">
              <div>• <strong>Username:</strong> ${p.username}</div>
              <div>• <strong>User ID:</strong> ${p.discord_user_id || 'Not available'}</div>
              <div>• <strong>Server:</strong> ${p.source_community_name || 'Discord'}</div>
              <div>• <strong>Date Added:</strong> ${new Date(p.created_at).toLocaleDateString()}</div>
              <div>• <strong>Source:</strong> ${p.source_type}</div>
              <div>• <strong>Message Link:</strong> ${p.source_message_url ? `<a href="${p.source_message_url}" target="_blank" style="color:var(--accent-cyan);">Jump to Message ↗</a>` : 'Direct contact'}</div>
            </div>
          </div>

          <!-- Stage & Service Selector -->
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:16px;">
            <div class="form-group">
              <label class="form-label">Current Stage</label>
              <select class="form-control" onchange="app.updateProspectStatus('${p.id}', this.value)">
                ${STAGES.map(s => `<option value="${s.id}" ${p.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Service Interested In</label>
              <input type="text" class="form-control" value="${p.service_interested || ''}" disabled>
            </div>
          </div>

          <!-- Stated Interests & Next Action -->
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:16px;">
            <div>
              <label class="form-label">Stated Interests</label>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${(p.stated_interests || []).map(i => `<span class="badge badge-blue">${i}</span>`).join('') || '<span style="color:var(--text-muted); font-size:12px;">None stated</span>'}
              </div>
            </div>
            <div>
              <label class="form-label">Next Suggested Action</label>
              <div style="font-size:13px; color:var(--accent-cyan); font-weight:600;">${p.next_suggested_action || 'Review public interest & generate first message'}</div>
            </div>
          </div>

          <!-- Private Notes Box (Clearly Distinguished) -->
          <div class="private-notes-box">
            <span class="private-notes-badge">My Private Notes (Manual User Notes)</span>
            <div style="font-size:13px; color:white; line-height:1.5; white-space:pre-wrap; margin-bottom:10px;">
              ${p.private_notes || 'No private notes entered yet.'}
            </div>
            <div style="display:flex; gap:8px;">
              <input type="text" class="form-control" id="inputNewNote" placeholder="Add an observation or deal note...">
              <button class="btn btn-secondary btn-sm" onclick="app.addPrivateNoteToCurrentProspect()">Add Note</button>
            </div>
          </div>

          <!-- Activity History -->
          <div>
            <label class="form-label">Interaction History (${p.activities?.length || 0})</label>
            <div style="max-height:180px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
              ${(p.activities || []).map(a => `
                <div style="font-size:12px; padding:6px 10px; background:var(--bg-tertiary); border-radius:4px; border-left:2px solid var(--accent-blue);">
                  <div style="font-weight:600; color:white;">${a.title} • <span style="font-weight:400; color:var(--text-muted);">${new Date(a.created_at).toLocaleString()}</span></div>
                  <div style="color:var(--text-secondary); margin-top:2px;">${a.description || ''}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    } catch (e) {
      body.innerHTML = `<div style="color:var(--accent-red);">Error loading contact: ${e.message}</div>`;
    }
  }

  async updateProspectStatus(id, newStatus) {
    try {
      const res = await fetch(`/api/prospects/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.ok) {
        this.showToast(`Stage updated to ${newStatus.replace(/_/g, ' ')}`, 'success');
        this.loadProspects();
        this.loadCRMStats();
      }
    } catch (e) {
      this.showToast('Failed to update stage: ' + e.message, 'error');
    }
  }

  async addPrivateNoteToCurrentProspect() {
    const note = document.getElementById('inputNewNote')?.value.trim();
    if (!note || !this.activeProspectId) return;

    try {
      const res = await fetch(`/api/prospects/${this.activeProspectId}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note })
      });
      const data = await res.json();
      if (data.ok) {
        this.showToast('Note added!', 'success');
        this.openProspectDetail(this.activeProspectId);
      }
    } catch (e) {
      this.showToast('Error adding note: ' + e.message, 'error');
    }
  }

  async deleteCurrentProspect() {
    if (!this.activeProspectId) return;
    if (!confirm('Are you sure you want to delete this contact and their conversation history?')) return;

    try {
      await fetch(`/api/prospects/${this.activeProspectId}`, { method: 'DELETE' });
      this.showToast('Contact deleted.', 'success');
      this.closeModal('modalProspectDetail');
      this.loadProspects();
      this.loadCRMStats();
    } catch (e) {
      this.showToast('Failed to delete contact: ' + e.message, 'error');
    }
  }

  // ----------------------------------------------------
  // AI MESSAGE WRITER
  // ----------------------------------------------------
  populateProspectsDropdown() {
    const sel = document.getElementById('msgSelectProspect');
    if (!sel) return;

    const currentVal = sel.value;
    sel.innerHTML = '<option value="">-- Choose from CRM --</option>' +
      this.prospectsCache.map(p => `<option value="${p.id}">${p.display_name || p.username} (${p.status.replace(/_/g, ' ')})</option>`).join('');

    if (currentVal) sel.value = currentVal;
  }

  onMessageProspectSelect() {
    const sel = document.getElementById('msgSelectProspect');
    const prospect = this.prospectsCache.find(p => p.id === sel.value);
    if (prospect) {
      document.getElementById('msgRecipientName').value = prospect.display_name || prospect.username;
      if (prospect.service_interested) {
        document.getElementById('msgServiceFocus').value = prospect.service_interested;
      }
      if (prospect.private_notes) {
        document.getElementById('msgContextNotes').value = prospect.private_notes;
      }
    }
  }

  async generateAIMessage(customInstructions = '') {
    const recipient = document.getElementById('msgRecipientName').value.trim() || 'there';
    const scenario = document.getElementById('msgScenario').value;
    const service = document.getElementById('msgServiceFocus').value;
    const tone = document.getElementById('msgTone').value;
    const notes = document.getElementById('msgContextNotes').value.trim();

    const draftTextEl = document.getElementById('msgDraftText');
    draftTextEl.innerHTML = '<span style="color:var(--accent-cyan);">Generating natural, conversational Discord message...</span>';

    try {
      const res = await fetch('/api/ai/write-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_name: recipient,
          scenario: scenario,
          service_focus: service,
          tone: tone,
          context_notes: notes,
          custom_instructions: customInstructions
        })
      });
      const data = await res.json();
      if (data.ok) {
        draftTextEl.innerText = data.draft;
      } else {
        draftTextEl.innerText = 'Could not generate message draft: ' + data.error;
      }
    } catch (e) {
      draftTextEl.innerText = 'Error generating message: ' + e.message;
    }
  }

  adjustMessageTone(mode) {
    let instruction = '';
    if (mode === 'shorter') instruction = 'Make the draft shorter, more concise, and under 2 sentences.';
    if (mode === 'casual') instruction = 'Make the tone more casual, relaxed, and conversational.';
    if (mode === 'professional') instruction = 'Make the tone direct, professional, and business-oriented.';
    this.generateAIMessage(instruction);
  }

  copyMessageDraft() {
    const text = document.getElementById('msgDraftText').innerText;
    if (!text || text.includes('Generating natural')) return;
    navigator.clipboard.writeText(text);
    this.showToast('Message copied to clipboard!', 'success');
  }

  openMessageWriterForCurrentProspect() {
    this.closeModal('modalProspectDetail');
    this.switchView('messages');
    if (this.activeProspectId) {
      const sel = document.getElementById('msgSelectProspect');
      if (sel) {
        sel.value = this.activeProspectId;
        this.onMessageProspectSelect();
      }
    }
  }

  // ----------------------------------------------------
  // SMART FOLLOW-UP SYSTEM
  // ----------------------------------------------------
  setFollowupTab(tab) {
    this.followupTab = tab;
    ['today', 'overdue', 'upcoming', 'completed'].forEach(t => {
      const btn = document.getElementById(`tabFollowup${t.charAt(0).toUpperCase() + t.slice(1)}`);
      if (btn) {
        btn.className = (t === tab) ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
      }
    });
    this.renderReminders();
  }

  async loadReminders() {
    try {
      const res = await fetch('/api/reminders');
      const data = await res.json();
      if (data.ok && Array.isArray(data.data)) {
        this.remindersCache = data.data;
        this.updateRemindersCounters();
        this.renderReminders();
        this.renderDashboardReminders();
      }
    } catch (e) {
      console.warn('Failed to load reminders:', e);
    }
  }

  updateRemindersCounters() {
    const today = this.remindersCache.filter(r => r.timing_category === 'today' && r.status === 'pending').length;
    const overdue = this.remindersCache.filter(r => r.timing_category === 'overdue' && r.status === 'pending').length;
    const upcoming = this.remindersCache.filter(r => r.timing_category === 'upcoming' && r.status === 'pending').length;
    const completed = this.remindersCache.filter(r => r.status === 'completed' || r.status === 'cancelled').length;

    if (document.getElementById('countFollowupToday')) document.getElementById('countFollowupToday').innerText = today;
    if (document.getElementById('countFollowupOverdue')) document.getElementById('countFollowupOverdue').innerText = overdue;
    if (document.getElementById('countFollowupUpcoming')) document.getElementById('countFollowupUpcoming').innerText = upcoming;
    if (document.getElementById('countFollowupCompleted')) document.getElementById('countFollowupCompleted').innerText = completed;
  }

  renderReminders() {
    const container = document.getElementById('remindersCardGrid');
    if (!container) return;

    const filtered = this.remindersCache.filter(r => {
      if (this.followupTab === 'completed') return r.status === 'completed' || r.status === 'cancelled';
      return r.timing_category === this.followupTab && r.status === 'pending';
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:40px; color:var(--text-muted); font-size:13.5px;">
          No follow-ups in the "${this.followupTab}" category.
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(r => `
      <div class="card" style="border-left:4px solid ${r.is_overdue ? 'var(--accent-red)' : 'var(--accent-blue)'};">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <img src="${r.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:36px; height:36px; border-radius:50%;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
            <div>
              <div style="font-weight:700; color:white; font-size:14px;">${r.display_name || r.username}</div>
              <div style="font-size:11.5px; color:var(--text-secondary);">@${r.username} • Stage: ${r.prospect_status.replace(/_/g, ' ')} • Follow-up #${r.followup_count || 1}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <span class="badge ${r.is_overdue ? 'badge-red' : 'badge-amber'}">${r.due_formatted}</span>
          </div>
        </div>

        <div style="font-size:13px; font-weight:600; color:white; margin-bottom:6px;">${r.title}</div>
        
        <!-- Suggested Message Draft Preview -->
        <div style="background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:12px; margin:10px 0;">
          <div style="font-size:11px; font-weight:700; color:var(--accent-cyan); text-transform:uppercase; margin-bottom:4px;">Prepared Follow-Up Draft:</div>
          <div style="font-size:13px; color:#e2e8f0; line-height:1.45; white-space:pre-wrap;">${this.escapeHtml(r.suggested_message || '')}</div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${this.escapeHtml(r.suggested_message || '').replace(/'/g, "\\'")}'); app.showToast('Copied draft!', 'success');">Copy Draft</button>
            <button class="btn btn-secondary btn-sm" onclick="app.postponeReminderPrompt('${r.id}')">Reschedule (2 Days)</button>
            <button class="btn btn-primary btn-sm" onclick="app.markFollowupAsReplied('${r.prospect_id}')">Mark as Replied</button>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-success btn-sm" onclick="app.completeReminder('${r.id}')">Mark Sent & Done</button>
            <button class="btn btn-danger btn-sm" onclick="app.dismissReminder('${r.id}')">Dismiss</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  renderDashboardReminders() {
    const list = document.getElementById('dashboardRemindersList');
    if (!list) return;

    const due = this.remindersCache.filter(r => (r.timing_category === 'today' || r.timing_category === 'overdue') && r.status === 'pending').slice(0, 5);

    if (due.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">No follow-ups due today.</div>';
      return;
    }

    list.innerHTML = due.map(r => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border-color);">
        <div>
          <div style="font-weight:700; color:white; font-size:13px;">${r.display_name || r.username}</div>
          <div style="font-size:11.5px; color:var(--text-secondary);">${r.title}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="badge ${r.is_overdue ? 'badge-red' : 'badge-amber'}">${r.due_formatted}</span>
          <button class="btn btn-primary btn-sm" style="padding:2px 8px; font-size:11px;" onclick="app.switchView('followups')">Review</button>
        </div>
      </div>
    `).join('');
  }

  openScheduleReminderForCurrentProspect() {
    if (!this.activeProspectId) return;
    const prospect = this.prospectsCache.find(p => p.id === this.activeProspectId);
    this.openScheduleReminderModal(this.activeProspectId, prospect?.display_name || prospect?.username);
  }

  openScheduleReminderForCurrentMessage() {
    const sel = document.getElementById('msgSelectProspect');
    const prospectId = sel ? sel.value : null;
    if (prospectId) {
      const p = this.prospectsCache.find(x => x.id === prospectId);
      this.openScheduleReminderModal(prospectId, p?.display_name || p?.username);
    } else {
      this.showToast('Please select a contact from the CRM dropdown first.', 'warning');
    }
  }

  openNewReminderModal() {
    if (this.prospectsCache.length === 0) {
      return this.showToast('Please add contacts to CRM first before scheduling follow-ups.', 'warning');
    }
    const first = this.prospectsCache[0];
    this.openScheduleReminderModal(first.id, first.display_name || first.username);
  }

  openScheduleReminderModal(prospectId, prospectName) {
    this.closeModal('modalProspectDetail');
    document.getElementById('reminderProspectId').value = prospectId;
    document.getElementById('reminderProspectName').value = prospectName || 'Contact';
    document.getElementById('reminderTitle').value = `Follow-up with ${prospectName} (2d check-in)`;
    document.getElementById('reminderSuggestedDraft').value = `Hey ${prospectName}, just following up on my previous note to see if you had a moment to explore our streaming solutions? No rush at all, just let me know if it's still on your radar.`;
    this.openModal('modalScheduleReminder');
  }

  onReminderIntervalChange() {
    const val = document.getElementById('reminderInterval').value;
    const customGroup = document.getElementById('customDateGroup');
    if (customGroup) customGroup.style.display = (val === 'custom') ? 'block' : 'none';
  }

  async submitScheduleReminder() {
    const prospectId = document.getElementById('reminderProspectId').value;
    const interval = document.getElementById('reminderInterval').value;
    const title = document.getElementById('reminderTitle').value.trim();
    const message = document.getElementById('reminderSuggestedDraft').value.trim();
    const customDate = document.getElementById('reminderCustomDate')?.value;

    const payload = {
      prospect_id: prospectId,
      days: interval === 'custom' ? null : Number(interval),
      custom_date: interval === 'custom' ? customDate : null,
      title: title,
      custom_message: message
    };

    try {
      const res = await fetch('/api/reminders/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        this.showToast('Follow-up reminder scheduled!', 'success');
        this.closeModal('modalScheduleReminder');
        this.loadReminders();
        this.loadCRMStats();
      } else {
        this.showToast('Schedule blocked: ' + data.error, 'warning');
      }
    } catch (e) {
      this.showToast('Error scheduling reminder: ' + e.message, 'error');
    }
  }

  async markFollowupAsReplied(prospectId) {
    const replySnippet = prompt('Enter a brief note or snippet of their reply (optional):');
    try {
      const res = await fetch('/api/reminders/record-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospectId, reply_content: replySnippet || '' })
      });
      const data = await res.json();
      if (data.ok) {
        this.showToast('Follow-up cleared! Prospect conversation updated.', 'success');
        this.loadReminders();
        this.loadProspects();
        this.loadCRMStats();
      }
    } catch (e) {
      this.showToast('Failed to record reply: ' + e.message, 'error');
    }
  }

  async postponeReminderPrompt(id) {
    try {
      const res = await fetch(`/api/reminders/${id}/postpone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 2 })
      });
      const data = await res.json();
      if (data.ok) {
        this.showToast('Postponed for 2 days.', 'success');
        this.loadReminders();
        this.loadCRMStats();
      }
    } catch (e) {
      this.showToast('Error postponing: ' + e.message, 'error');
    }
  }

  async completeReminder(id) {
    try {
      const res = await fetch(`/api/reminders/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Follow-up message sent and completed' })
      });
      const data = await res.json();
      if (data.ok) {
        this.showToast('Follow-up marked as completed.', 'success');
        this.loadReminders();
        this.loadCRMStats();
      }
    } catch (e) {
      this.showToast('Error completing follow-up: ' + e.message, 'error');
    }
  }

  async dismissReminder(id) {
    if (!confirm('Are you sure you want to dismiss this reminder?')) return;
    try {
      await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
      this.showToast('Reminder dismissed.', 'success');
      this.loadReminders();
      this.loadCRMStats();
    } catch (e) {
      this.showToast('Error dismissing: ' + e.message, 'error');
    }
  }

  // ----------------------------------------------------
  // AI CONVERSATION COACH
  // ----------------------------------------------------
  populateCoachProspectsDropdown() {
    const sel = document.getElementById('coachSelectProspect');
    if (!sel) return;

    const currentVal = sel.value;
    sel.innerHTML = '<option value="">-- Choose from CRM --</option>' +
      this.prospectsCache.map(p => `<option value="${p.id}">${p.display_name || p.username}</option>`).join('');

    if (currentVal) sel.value = currentVal;
  }

  onCoachProspectSelect() {
    const sel = document.getElementById('coachSelectProspect');
    const prospect = this.prospectsCache.find(p => p.id === sel.value);
    if (prospect) {
      const transcript = document.getElementById('coachTranscriptInput');
      transcript.value = `Client: ${prospect.display_name || prospect.username}\nInterests: ${prospect.stated_interests?.join(', ') || 'Streaming'}\nNotes: ${prospect.private_notes || 'None'}`;
    }
  }

  openCoachForCurrentProspect() {
    this.closeModal('modalProspectDetail');
    this.switchView('coach');
    if (this.activeProspectId) {
      const sel = document.getElementById('coachSelectProspect');
      if (sel) {
        sel.value = this.activeProspectId;
        this.onCoachProspectSelect();
      }
    }
  }

  async analyzeCoachConversation() {
    const transcript = document.getElementById('coachTranscriptInput').value.trim();
    const sel = document.getElementById('coachSelectProspect');
    const prospect = this.prospectsCache.find(p => p.id === sel.value) || {};

    const output = document.getElementById('coachAdviceOutput');
    output.innerHTML = '<div class="card"><div style="color:var(--accent-cyan); font-size:13.5px;">Analyzing conversation and formulating tactical replies...</div></div>';

    try {
      const res = await fetch('/api/ai/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect: prospect,
          messages: [{ sender: 'prospect', content: transcript }]
        })
      });
      const data = await res.json();

      if (data.ok && data.advice) {
        const a = data.advice;
        output.innerHTML = `
          <!-- Summary & Intent -->
          <div class="card">
            <span class="card-title" style="margin-bottom:8px;">Situation Analysis</span>
            <p style="font-size:13.5px; color:#e2e8f0; line-height:1.5; margin-bottom:8px;">${a.summary}</p>
            <div style="font-size:12.5px; color:var(--accent-cyan);"><strong>Detected Need:</strong> ${a.detected_need}</div>
            <div style="font-size:12.5px; color:var(--accent-green); margin-top:4px;"><strong>Recommended Next Step:</strong> ${a.recommended_next_step}</div>
          </div>

          <!-- Recommended Reply -->
          <div class="card" style="border-left:4px solid var(--accent-blue);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span class="card-title" style="color:var(--accent-blue);">Recommended Reply</span>
              <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${this.escapeHtml(a.recommended_reply).replace(/'/g, "\\'")}'); app.showToast('Copied reply!', 'success');">Copy Text</button>
            </div>
            <div style="background:var(--bg-tertiary); padding:14px; border-radius:var(--radius-sm); font-size:14px; color:white; line-height:1.5;">
              ${this.escapeHtml(a.recommended_reply)}
            </div>
          </div>

          <!-- Alternative Tones -->
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
            <div class="card">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:13px; font-weight:700; color:white;">Alternative Tone 1 (Direct)</span>
                <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${this.escapeHtml(a.alternative_reply_1).replace(/'/g, "\\'")}'); app.showToast('Copied!', 'success');">Copy</button>
              </div>
              <div style="font-size:13px; color:var(--text-secondary); line-height:1.4;">${this.escapeHtml(a.alternative_reply_1)}</div>
            </div>

            <div class="card">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:13px; font-weight:700; color:white;">Alternative Tone 2 (Casual)</span>
                <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${this.escapeHtml(a.alternative_reply_2).replace(/'/g, "\\'")}'); app.showToast('Copied!', 'success');">Copy</button>
              </div>
              <div style="font-size:13px; color:var(--text-secondary); line-height:1.4;">${this.escapeHtml(a.alternative_reply_2)}</div>
            </div>
          </div>

          <!-- Discovery Questions to Ask -->
          <div class="card">
            <span class="card-title" style="margin-bottom:8px;">Probing Questions to Clarify Needs</span>
            <ul style="padding-left:20px; font-size:13px; color:var(--text-secondary); line-height:1.6;">
              ${(a.probing_questions || []).map(q => `<li>${q}</li>`).join('')}
            </ul>
          </div>

          <!-- Warning Signs -->
          <div class="card" style="border-left:4px solid var(--accent-red); background:rgba(239, 68, 68, 0.05);">
            <span class="card-title" style="color:var(--accent-red); margin-bottom:6px;">Warning Signs & What NOT to Say</span>
            <p style="font-size:13px; color:#fca5a5; line-height:1.5;">${a.warning_signs}</p>
          </div>
        `;
      }
    } catch (e) {
      output.innerHTML = `<div class="card"><div style="color:var(--accent-red);">Coaching error: ${e.message}</div></div>`;
    }
  }

  // ----------------------------------------------------
  // AI CHAT & COMMAND CENTER
  // ----------------------------------------------------
  sendQuickCommand(text) {
    const input = document.getElementById('inputCommandChat');
    if (input) {
      input.value = text;
      this.sendCommandMessage();
    }
  }

  async sendCommandMessage() {
    const input = document.getElementById('inputCommandChat');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    const container = document.getElementById('chatMessagesContainer');
    
    // Append User Bubble
    const userDiv = document.createElement('div');
    userDiv.className = 'chat-bubble user';
    userDiv.innerText = text;
    container.appendChild(userDiv);

    // Append Assistant Loading Bubble
    const botDiv = document.createElement('div');
    botDiv.className = 'chat-bubble assistant';
    botDiv.innerText = 'Thinking and processing CRM database...';
    container.appendChild(botDiv);
    container.scrollTop = container.scrollHeight;

    try {
      const res = await fetch('/api/ai/command-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: text })
      });
      const data = await res.json();
      if (data.ok) {
        botDiv.innerText = data.response;
      } else {
        botDiv.innerText = 'Sorry, could not process instruction: ' + data.error;
      }
    } catch (e) {
      botDiv.innerText = 'Error connecting to Command Center: ' + e.message;
    }
    container.scrollTop = container.scrollHeight;
  }

  // ----------------------------------------------------
  // SETTINGS & DATA PRIVACY
  // ----------------------------------------------------
  async loadSettings() {
    try {
      const authConfigRes = await fetch('/api/auth/config');
      const authConfig = await authConfigRes.json();
      if (authConfig.ok) {
        if (document.getElementById('inputClientId')) document.getElementById('inputClientId').value = authConfig.client_id || '';
        if (document.getElementById('inputRedirectUri')) document.getElementById('inputRedirectUri').value = authConfig.redirect_uri || '';
        if (document.getElementById('connClientId') && !document.getElementById('connClientId').value) {
          document.getElementById('connClientId').value = authConfig.client_id || '';
        }
        if (document.getElementById('connRedirectUri')) {
          document.getElementById('connRedirectUri').value = authConfig.redirect_uri || 'http://localhost:3000/api/auth/discord/callback';
        }
      }

      const settingsRes = await fetch('/api/settings');
      const settings = await settingsRes.json();
      if (settings.ok && settings.masked_bot_token) {
        if (document.getElementById('inputBotToken')) document.getElementById('inputBotToken').placeholder = `Configured (${settings.masked_bot_token})`;
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  }

  async saveOAuthConfig() {
    const clientId = document.getElementById('inputClientId').value.trim();
    const clientSecret = document.getElementById('inputClientSecret').value.trim();
    const redirectUri = document.getElementById('inputRedirectUri').value.trim();

    try {
      const res = await fetch('/api/auth/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri
        })
      });
      const data = await res.json();
      if (data.ok) {
        this.showToast('OAuth2 application settings saved!', 'success');
        const connClientId = document.getElementById('connClientId');
        const connRedirectUri = document.getElementById('connRedirectUri');
        if (connClientId) connClientId.value = clientId;
        if (connRedirectUri) connRedirectUri.value = redirectUri;
        await this.checkOAuthDiagnostic();
      }
    } catch (e) {
      this.showToast('Failed to save OAuth settings: ' + e.message, 'error');
    }
  }

  async saveAPISettings() {
    const gemini = document.getElementById('inputGeminiKey').value.trim();
    const openai = document.getElementById('inputOpenAIKey').value.trim();

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: gemini, openai_api_key: openai })
      });
      const data = await res.json();
      if (data.ok) {
        this.showToast('AI Provider keys saved successfully!', 'success');
      }
    } catch (e) {
      this.showToast('Error saving AI keys: ' + e.message, 'error');
    }
  }

  exportCRMData() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({
      business: this.businessSettings,
      contacts: this.prospectsCache,
      reminders: this.remindersCache,
      exported_at: new Date().toISOString()
    }, null, 2));

    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `elite_vision_crm_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    this.showToast('Backup JSON downloaded!', 'success');
  }

  openWipeDataModal() {
    this.openModal('modalWipeData');
  }

  async confirmWipeAllData() {
    try {
      const res = await fetch('/api/system/wipe-data', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        this.showToast('All contacts and research data wiped.', 'success');
        this.closeModal('modalWipeData');
        await this.loadCRMStats();
        await this.loadProspects();
        await this.loadReminders();
        await this.loadSavedCommunities();
      }
    } catch (e) {
      this.showToast('Error wiping data: ' + e.message, 'error');
    }
  }

  // ----------------------------------------------------
  // UI HELPERS (Modals, Toasts)
  // ----------------------------------------------------
  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('show');
  }

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

// Global App Instance
const app = new BusinessAssistantApp();
window.app = app;
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
