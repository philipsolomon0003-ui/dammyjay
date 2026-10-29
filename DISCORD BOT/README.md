# ELITE VISION GLOBAL — Personal Discord AI Business Assistant

A complete, functional AI-powered Discord business application developed for **ELITE VISION GLOBAL**.
The application is designed specifically for discovering potential IPTV & streaming customers, managing business conversations across 11 stages, writing natural human Discord messages, providing AI conversation coaching, and scheduling smart follow-up reminders—without self-bots, without fake metrics, and without unsolicited spam.

---

## 🚀 Key Business Capabilities

### 1. Connect Discord Account (Official OAuth2 & Bot APIs)
- **Secure Official Login**: Sign in via Discord OAuth2 (`identify`, `guilds` scopes) without ever revealing passwords or account tokens.
- **Built-in Pre-flight Diagnostic Guard**: Prevents Discord's "Unknown Application" error by verifying your Application ID format and registered redirect URL before redirecting.
- **Bot Authorization Link Generator**: Generates official bot invite URLs with verified permissions (`View Channels`, `Read Message History`, `Send Messages`, `Embed Links`).
- **Transparency & Safety**: Explains why each permission is requested. Zero self-botting.
- **Server Permission Inspector**: Displays authorized servers and the bot's permission status in each.

### 2. Server Management & Channel Monitor
- **Authorized Guild Directory**: View servers where the bot is a member with icons, member counts, and permissions.
- **Channel Access Control**: Choose specific text channels the bot is allowed to read.
- **Public Discussion Inspector**: Review real-time messages in authorized channels.
- **Message Search**: Search messages for streaming questions, complaints, or buying signals.
- **Workspace Control**: Add or remove servers from your research workspace at any time.

### 3. AI Research Assistant
- **Community Research**: Public invite link resolver with instant relevance scoring for IPTV, reseller panels, app rebranding, app dev, and streaming servers.
- **Buying Signal Detector**: Analyzes discussions for customer needs, questions, and buying signals (e.g., weekend sports buffering, trial requests, 120 credit inquiries, Smarters/XCIPTV APK rebrands).
- **Opportunity Ranking**: Ranks leads (High, Medium, Low) with plain English business reasoning.
- **Original Discord Message Links**: Includes deep links directly to the original message in Discord (`discord.com/channels/...`).
- **1-Click Save to CRM**: Convert any promising discussion or member into a tracked contact.

### 4. AI Message Writer
- **8 Tailored Communication Scenarios**:
  1. First messages after friend request accepted
  2. Opening messages based on publicly expressed interests or channel discussions
  3. Replies to people who respond
  4. Explaining services ("What do you do?")
  5. Answering questions about subscriptions, reseller panels, app rebranding, app dev
  6. Handling objections professionally (price objections, existing provider, stability doubt)
  7. Following up with people who showed interest but stopped responding
  8. Ending conversations politely when someone is not interested
- **Domain-Specific Knowledge (ELITE VISION GLOBAL)**:
  - Subscriptions: 1 month ($15), 3 months ($35), 6 months ($55), 12 months ($80)
  - Reseller panel: 120 credits for $350
  - App rebranding: $150 with reseller panel
  - App development: Custom quote policy
  - Server setup: Custom quote policy
  - Official Telegram: `@Iptvpross`
- **Natural, Human Writing**: Filters out robotic clichés, hyperbole, and spammy buzzwords.
- **Tone Controls**: Conversational, Direct & Professional, Technical & Consultative, Brief.

### 5. Conversation Workspace (11 Stages)
- **11 Exact Business Stages**:
  1. `New Contact`
  2. `Researching`
  3. `First Message Ready`
  4. `Conversation Started`
  5. `Interested`
  6. `Needs More Information`
  7. `Price Discussed`
  8. `Follow-up Due`
  9. `Converted Customer`
  10. `Not Interested`
  11. `Archived`
- **Distinction Between Verified Discord Data vs Private Notes**:
  - Blue Badge: Verified Discord metadata (Username, Discord User ID, Server, Channel, Message Jump Link).
  - Amber Badge: Private User Notes (manually entered deal notes, requirements, and device observations).
- **Dual View**: Kanban Board with stage counters + searchable Data Table.

### 6. Smart Follow-Up System
- **Reminder Scheduler**: Set follow-up reminders for 2 days, 3 days, 5 days, 7 days, or custom dates.
- **Personalized Auto-Drafts**: Follow-up message drafts prepared in advance incorporating prior context.
- **Reply Workflow**: "Mark as Replied" dismisses pending reminders, updates the contact's stage, and launches the AI Coach.
- **Stop Safeguards**: Moving a contact to `Not Interested` or `Archived` automatically cancels and locks all future follow-ups.
- **Spam Prevention Limit**: Alerts when a contact reaches max follow-up count (3 check-ins) to avoid being perceived as spam.
- **Human-in-the-Loop**: Reminders and drafts are created for human review before sending.

### 7. AI Conversation Coach
- **Tactical Analysis**: Short summary of the exchange and what the prospect is actually asking for.
- **Next Best Move**: Clear recommendation on what to do next.
- **3 Distinct Reply Options**:
  - 1 Recommended response
  - 2 Alternative responses with different tones (Direct vs Casual)
- **Probing Questions**: Non-pushy discovery questions to uncover requirements.
- **Warning Signs**: Red flags and guidance on what NOT to say.

### 8. AI Chat & Research Command Center
- Live conversational command interface with live access to your CRM database.
- Quick prompts:
  - *"Find my follow-ups due today"*
  - *"Summarize my most promising opportunities this week"*
  - *"Prepare a professional response to a price objection"*
  - *"Research communities that may be relevant to my business"*

### 9. Business Profile & Service Settings
- Completely editable pricing table in the dashboard.
- Update subscription prices, reseller credits, rebranding fees, and contact details without code modifications.

### 10. Privacy, Security & Data Management
- Export complete CRM data as JSON at any time.
- Wipe Stored Data button to safely delete contacts and research data.
- Never asks for Discord account passwords. No self-bots.

---

## ⚡ Quick Start

### 1. Launch the Application
Run `start.bat` or execute in your terminal:
```powershell
.\run.cmd server\index.js
```
Open your browser to:
**[http://localhost:3000](http://localhost:3000)**

---

## 🛠️ Discord OAuth2 Setup Guide (How to Avoid "Unknown Application")

Discord displays **"Unknown Application"** (HTTP 404 / Error 10002) whenever the application ID passed in the OAuth2 login link is missing, invalid, or does not exist in Discord's developer registry.

Follow this simple 4-step guide to connect your Discord account smoothly:

### Step 1: Open the Discord Developer Portal
1. Go to **[https://discord.com/developers/applications](https://discord.com/developers/applications)**.
2. Sign in with your standard Discord account.
3. Click on your application (or click **"New Application"**, enter the name **`ELITE VISION GLOBAL`**, and click **Create**).

### Step 2: Get your Application ID (Client ID)
1. On the left menu, click **General Information**.
2. Look for **APPLICATION ID** (an 18–20 digit number such as `134567890123456789`).
3. Click the **Copy** button.
   > ⚠️ **IMPORTANT**: Do NOT confuse the **Application ID** with your **Bot Token** or **Public Key**!
   > - **Application ID**: 18–20 numbers only (e.g. `1341234567890123456`).
   > - **Bot Token**: Contains dots (`.`) and letters (e.g. `MTM0...dfg.xyz`).
   > - **Public Key**: 64 hexadecimal characters.

### Step 3: Register the Redirect URL in Discord
1. On the left menu, click **OAuth2** (or **OAuth2 -> General**).
2. Look for the **Redirects** section.
3. Click **Add Redirect**.
4. Paste the EXACT Redirect URI:
   ```
   http://localhost:3000/api/auth/discord/callback
   ```
   *(Ensure no trailing spaces, no typos, and correct port 3000).*
5. Click the green **Save Changes** bar that appears at the bottom of the screen.

### Step 4: Get your Client Secret & Save into Application
1. Still on the **OAuth2** page, find **Client Secret**.
2. Click **Reset Secret** (or **Copy** if you already have it saved).
3. Open your application dashboard at `http://localhost:3000` and go to **Discord Connections**.
4. In the **Discord OAuth2 Application Settings** card:
   - Paste your numeric **Application ID**.
   - Paste your 32-character **Client Secret**.
   - Confirm the Redirect URI is `http://localhost:3000/api/auth/discord/callback`.
   - Click **Save & Verify OAuth Configuration**.
5. Once the badge turns green (**Ready to Connect**), click **"Sign in with Discord"**!

---

## 🤖 Discord Bot Setup (Server & Channel Monitor)

1. In the [Discord Developer Portal](https://discord.com/developers/applications), click on the **Bot** tab on the left menu.
2. Under **Privileged Gateway Intents**, enable:
   - ✅ **Server Members Intent**
   - ✅ **Message Content Intent**
3. Click **Save Changes**.
4. Click **Reset Token** under the Bot username and copy the bot token.
5. In your application dashboard under **Discord Connections** -> **Official Discord Bot Connection**, paste your token and click **Save & Verify Bot**.
6. Use the **Add Bot to a Server** button to invite the bot to your community or testing server with read-only permissions.
