const { db, getBusinessSettings } = require('./db');

/**
 * Filter out robotic clichés, hyperbole, and spammy marketing filler
 */
function cleanNaturalEnglish(text) {
  if (!text) return '';
  return text
    .replace(/^["']|["']$/g, '')
    .replace(/I hope this (?:message|email) finds you well[.,]?\s*/gi, '')
    .replace(/Hope you(?:'re| are) having a (?:great|wonderful) (?:day|week)[.,]?\s*/gi, '')
    .replace(/In today's fast-paced (?:digital )?world[.,]?\s*/gi, '')
    .replace(/Look no further[.,!]?\s*/gi, '')
    .replace(/Are you ready to take your business to the next level\??\s*/gi, '')
    .replace(/game-changer/gi, 'solid upgrade')
    .replace(/delve into/gi, 'look into')
    .replace(/seamlessly/gi, 'smoothly')
    .replace(/pinnacle/gi, 'standard')
    .replace(/revolutionary/gi, 'proven')
    .replace(/unleash/gi, 'enable')
    .trim();
}

/**
 * Retrieve active API key and provider from database settings
 */
function getAIProviderConfig() {
  const geminiRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
  const geminiKey = geminiRow ? geminiRow.value.trim() : null;

  const openaiRow = db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get();
  const openaiKey = openaiRow ? openaiRow.value.trim() : null;

  return {
    gemini_key: geminiKey,
    openai_key: openaiKey,
    has_external_llm: Boolean(geminiKey || openaiKey)
  };
}

/**
 * Call external LLM (Gemini or OpenAI) with fallback to rule engine
 */
async function callLLM(systemInstruction, userPrompt, temperature = 0.65) {
  const config = getAIProviderConfig();

  // Try Gemini first if configured
  if (config.gemini_key) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.gemini_key}`;
      const payload = {
        contents: [
          { role: 'user', parts: [{ text: `${systemInstruction}\n\nUSER REQUEST:\n${userPrompt}` }] }
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: 800
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const json = await res.json();
        const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          return { ok: true, source: 'gemini_llm', text: candidateText.trim() };
        }
      }
    } catch (err) {
      console.warn('Gemini API call failed, falling back:', err.message);
    }
  }

  // Try OpenAI if configured
  if (config.openai_key) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openai_key}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          max_tokens: 800
        })
      });

      if (res.ok) {
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content;
        if (text) {
          return { ok: true, source: 'openai_llm', text: text.trim() };
        }
      }
    } catch (err) {
      console.warn('OpenAI API call failed, falling back:', err.message);
    }
  }

  return { ok: false, source: 'offline_synthesizer' };
}

/**
 * Generate context-aware system prompt describing ELITE VISION GLOBAL
 */
function buildBusinessContext() {
  const b = getBusinessSettings();
  return `
You are the personal AI business assistant for ${b.business_name}.
Owner business identity:
- Company: ${b.business_name}
- Official Telegram contact: ${b.telegram_handle}
- Services offered: ${b.services_description}

Official Listed Pricing:
- IPTV Subscriptions:
  * 1 Month: $${b.sub_1m}
  * 3 Months: $${b.sub_3m}
  * 6 Months: $${b.sub_6m}
  * 12 Months: $${b.sub_12m}
- Reseller Panel:
  * 120 Credits: $${b.reseller_120}
- App Rebranding:
  * With Reseller Panel: $${b.rebrand_with_panel}
  * Standalone / without panel: Mark as custom quote
- Application Development:
  * Policy: ${b.app_dev_policy} (Always ask for specific requirements and offer a tailored quote)
- Server Setup & Technical Solutions:
  * Policy: ${b.server_setup_policy}

STRICT PROFESSIONAL RULES:
1. Never invent or hallucinate unlisted prices. If a duration or service isn't listed above, explicitly state that a custom quote is required.
2. Do not assume every person is a customer. Be helpful, genuine, and conversational.
3. Natural, friendly, and professional tone in simple English.
4. ABSOLUTELY NO generic AI buzzwords, aggressive hard selling, exaggerated promises, or pushy spam.
5. Base personalization only on real information provided.
`;
}

/**
 * AI Message Writer: 8 distinct communication scenarios
 */
async function generateMessageDraft(options) {
  const {
    recipient_name = 'there',
    scenario = 'opening_interest', // 8 supported scenarios
    service_focus = 'IPTV Subscriptions',
    tone = 'conversational', // 'conversational', 'direct_business', 'technical_dev', 'brief'
    context_notes = '',
    channel_name = '',
    custom_instructions = ''
  } = options;

  const b = getBusinessSettings();
  const businessPrompt = buildBusinessContext();

  const scenarioDescriptions = {
    friend_request_accepted: 'First message after someone accepts my Discord friend request. Be polite, friendly, reference where we connected, and avoid rushing into a pitch.',
    opening_interest: 'Opening message based on the person\'s publicly expressed interests or relevant discussion in a Discord channel. Connect naturally to their stated topic.',
    reply_to_response: 'Reply to someone who responded to me. Keep the conversation moving forward naturally, answer any question they asked, and ask one relevant question.',
    explain_services: 'Explaining what ELITE VISION GLOBAL does when someone asks "What do you do?" or "What services do you offer?". Provide a clear, concise overview tailored to their context.',
    service_questions: 'Answering questions about subscriptions, reseller panels, app rebranding, or custom app dev using our exact business details and pricing.',
    handle_objections: 'Handling objections professionally (e.g., price objections, "I already have a supplier", "I am worried about freezing during sports matches"). Validate their concern calmly and offer a low-risk option like a demo or trial.',
    follow_up_unresponsive: 'Following up with someone who showed interest previously but stopped responding. Friendly, respectful, zero pressure, providing gentle value.',
    end_conversation_politely: 'Ending a conversation politely when someone states they are not interested or do not need services right now. Leave the door open warmly without being annoying.'
  };

  const systemInstruction = `
${businessPrompt}

Task: Write a single, ready-to-send Discord message for the scenario: "${scenario}".
Scenario details: ${scenarioDescriptions[scenario] || scenarioDescriptions.opening_interest}

Message Style Guidelines:
- Recipient: ${recipient_name}
- Service Focus: ${service_focus}
- Desired Tone: ${tone} (conversational, direct_business, technical_dev, brief)
- Channel / Community: ${channel_name || 'Discord server'}
- Context Notes: ${context_notes || 'None provided'}
- Additional Instructions: ${custom_instructions || 'Keep it concise and natural.'}
- Message Length: 2 to 4 sentences maximum.
- Output ONLY the message text. No subject line, no quotes, no markdown preamble.
`;

  const llmResult = await callLLM(systemInstruction, `Draft a ${tone} message for ${recipient_name} regarding ${service_focus}.`);

  if (llmResult.ok && llmResult.text) {
    return {
      ok: true,
      source: llmResult.source,
      draft: cleanNaturalEnglish(llmResult.text),
      scenario,
      tone
    };
  }

  // Fallback Rule Engine if offline
  let fallbackDraft = '';
  const name = recipient_name || 'there';

  switch (scenario) {
    case 'friend_request_accepted':
      fallbackDraft = `Hey ${name}, thanks for connecting! Saw your profile in ${channel_name || 'the Discord server'} and wanted to say hello. How are things going with your streaming setup?`;
      break;

    case 'explain_services':
      fallbackDraft = `Hey ${name}, at ELITE VISION GLOBAL we provide high-stability IPTV subscriptions ($15/mo up to $80/year), Xtream reseller panels with 120 credits for $350, and custom app rebranding like XCIPTV or Smarters Pro for $150 with a panel. We also build custom streaming apps and configure load-balanced servers. What are you currently running?`;
      break;

    case 'service_questions':
      if (service_focus.toLowerCase().includes('reseller')) {
        fallbackDraft = `Hey ${name}, for our reseller panel we provide 120 credits for $350 on an anti-freeze Xtream infrastructure with sub-reseller privileges and free 24h test lines. Happy to set up a test login so you can inspect the dashboard firsthand.`;
      } else if (service_focus.toLowerCase().includes('rebrand')) {
        fallbackDraft = `Hey ${name}, for app rebranding we customize XCIPTV or Smarters Pro with your logo, color palette, and hardcoded DNS portal for $150 when paired with a reseller panel. Sideloading is simple for Android and Firestick. Would you like to see a demo APK?`;
      } else {
        fallbackDraft = `Hey ${name}, our subscription pricing is $15 for 1 month, $35 for 3 months, $55 for 6 months, or $80 for a full year with 4K/FHD sports and zero-freeze servers. I can set you up with a quick test line if you want to test stream stability.`;
      }
      break;

    case 'handle_objections':
      fallbackDraft = `Totally understand, ${name}. Finding a reliable provider or panel is all about real-world stability during live sports. No need to commit to anything upfront—if you ever want to compare stream feeds or test our anti-freeze setup, I can set you up with a quick test line.`;
      break;

    case 'follow_up_unresponsive':
      fallbackDraft = `Hey ${name}, just wanted to check in and see if you were still exploring ${service_focus}? No rush or pressure at all, just wanted to make sure you had everything you needed.`;
      break;

    case 'end_conversation_politely':
      fallbackDraft = `Thanks for letting me know, ${name}! Really appreciate your time. If your needs change down the road or you ever need a backup feed, feel free to reach out anytime or find us on Telegram at ${b.telegram_handle}. Have a great week!`;
      break;

    case 'opening_interest':
    default:
      if (context_notes) {
        fallbackDraft = `Hey ${name}, saw your message regarding "${context_notes.slice(0, 80)}" in ${channel_name || 'the server'}. We handle that over at ELITE VISION GLOBAL. Happy to share some tips or send over a demo if it would be helpful.`;
      } else {
        fallbackDraft = `Hey ${name}, noticed your discussions around ${service_focus} in ${channel_name || 'Discord'}. If you're looking for stable connections or custom player setups, happy to connect and share notes.`;
      }
      break;
  }

  return {
    ok: true,
    source: 'rule_synthesizer',
    draft: cleanNaturalEnglish(fallbackDraft),
    scenario,
    tone
  };
}

/**
 * AI Conversation Coach: Comprehensive analysis & multi-tone reply generator
 */
async function generateCoachAdvice(prospect, messages = []) {
  const b = getBusinessSettings();
  const businessContext = buildBusinessContext();

  const prospectName = prospect.display_name || prospect.username || 'Contact';
  const stage = prospect.status || 'New Contact';
  const historyText = messages.length > 0
    ? messages.map(m => `${m.sender === 'user' ? 'Me' : prospectName}: ${m.content}`).join('\n')
    : `(No recorded message log yet. Prospect notes: ${prospect.private_notes || 'None'})`;

  const systemInstruction = `
${businessContext}

You are an expert AI Conversation Coach. The business owner is chatting with a Discord contact.
Analyze the exchange and provide strategic coaching in valid JSON format:
{
  "summary": "2-sentence plain English summary of what has happened so far",
  "detected_need": "What the other person appears to be asking for or experiencing",
  "recommended_next_step": "The single best next step to take right now",
  "recommended_reply": "Best primary response (natural, simple English, helpful, 2-3 sentences)",
  "alternative_reply_1": "Alternative reply with a different tone (e.g. direct and business-focused)",
  "alternative_reply_2": "Alternative reply with a different tone (e.g. casual & consultative)",
  "probing_questions": ["Question 1 to ask to clarify requirements", "Question 2 to understand their setup"],
  "relevant_services_info": "Specific ELITE VISION GLOBAL pricing or services that apply here",
  "warning_signs": "Key warnings on what NOT to say (e.g. do not push rebrands if they already have one, avoid sounding desperate, don't quote unlisted prices)"
}
`;

  const userPrompt = `
Prospect: ${prospectName}
Current Stage: ${stage}
Interests: ${prospect.stated_interests || 'General Streaming'}
Notes: ${prospect.private_notes || 'None'}
Conversation Transcript:
${historyText}
`;

  const llmResult = await callLLM(systemInstruction, userPrompt, 0.5);

  if (llmResult.ok && llmResult.text) {
    try {
      // Extract JSON from LLM response
      const jsonMatch = llmResult.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { ok: true, source: llmResult.source, advice: parsed };
      }
    } catch (e) {
      console.warn('Failed to parse LLM coach JSON, using fallback synthesizer');
    }
  }

  // Fallback intelligent coaching logic
  const detectedNeed = prospect.stated_interests || 'Looking for stable streaming solutions';
  const advice = {
    summary: `Active discussion with ${prospectName} at stage "${stage}". Focus is centered on ${detectedNeed}.`,
    detected_need: `Evaluating ${detectedNeed} and testing reliability before committing.`,
    recommended_next_step: `Offer a low-commitment test line or demo to verify stream/app quality firsthand without pushing a sale.`,
    recommended_reply: `Hey ${prospectName}, totally get where you're coming from. The best way to judge is testing the feeds on your own device. Happy to set you up with a free test line or demo so you can check stability yourself. What device do you use?`,
    alternative_reply_1: `Hi ${prospectName}, we have full packages ready for ${detectedNeed}. Our 1-month starts at $${b.sub_1m} and full year is $${b.sub_80 || 80}. Let me know if you would like to test our server stability first.`,
    alternative_reply_2: `Hey ${prospectName}, saw you were looking into this. We configure custom load-balanced feeds for this exact setup. If you want to check out our demo APK or test connection, just say the word.`,
    probing_questions: [
      `What device or video player do you or your clients primarily use (Firestick, Android, Smart TV)?`,
      `Are there specific sports channels, live events, or regions you require zero-buffer reliability for?`
    ],
    relevant_services_info: `Subscriptions ($${b.sub_1m}/1mo, $${b.sub_3m}/3mo, $${b.sub_6m}/6mo, $${b.sub_12m}/12mo), Reseller Panel 120 credits ($${b.reseller_120}), App Rebrand with panel ($${b.rebrand_with_panel}). Telegram: ${b.telegram_handle}`,
    warning_signs: `Do not push a multi-month subscription or expensive panel before they have tested stability. If they say they already have an app, ask what they like or dislike about it rather than immediately trying to sell a rebranding.`
  };

  return { ok: true, source: 'rule_synthesizer', advice };
}

/**
 * AI Discussion & Message Scanner: Detects customer requirements, questions, and buying signals
 */
function analyzeDiscussionBuyingSignals(content, authorName = 'User') {
  const lower = (content || '').toLowerCase();
  const buyingSignals = [];
  let score = 15;
  let detectedCategory = 'General Inquiry';

  // Check IPTV Subscriptions signals
  if (lower.includes('buffering') || lower.includes('freeze') || lower.includes('freezing') || lower.includes('lag')) {
    buyingSignals.push('Experiencing buffering/freezing with current provider');
    score += 30;
    detectedCategory = 'IPTV Subscriptions (Stability)';
  }
  if (lower.includes('test line') || lower.includes('trial') || lower.includes('free trial') || lower.includes('test link')) {
    buyingSignals.push('Explicitly asking for a test line or trial');
    score += 40;
    detectedCategory = 'IPTV Subscriptions (Trial Request)';
  }
  if (lower.includes('looking for iptv') || lower.includes('best iptv') || lower.includes('recommend iptv') || lower.includes('good provider')) {
    buyingSignals.push('Actively seeking a new IPTV provider recommendation');
    score += 35;
    detectedCategory = 'IPTV Subscriptions';
  }

  // Check Reseller Panel signals
  if (lower.includes('reseller panel') || lower.includes('reseller credits') || lower.includes('1-stream') || lower.includes('xtream codes') || lower.includes('become a reseller')) {
    buyingSignals.push('Inquiring about IPTV Reseller Panel and credit pricing');
    score += 40;
    detectedCategory = 'Reseller Panels';
  }

  // Check Rebranding signals
  if (lower.includes('rebrand') || lower.includes('custom apk') || lower.includes('smarters') || lower.includes('xciptv') || lower.includes('hardcode dns') || lower.includes('custom logo')) {
    buyingSignals.push('In need of custom IPTV app rebranding / APK hardcoding');
    score += 45;
    detectedCategory = 'App Rebranding';
  }

  // Check Custom App Dev signals
  if (lower.includes('custom app') || lower.includes('exoplayer') || lower.includes('app development') || lower.includes('multi-screen') || lower.includes('firestick app')) {
    buyingSignals.push('Exploring custom streaming client application development');
    score += 35;
    detectedCategory = 'App Development';
  }

  // Check Server Setup signals
  if (lower.includes('nginx') || lower.includes('load balancer') || lower.includes('server setup') || lower.includes('stream server') || lower.includes('transcoding')) {
    buyingSignals.push('Requires server optimization, stream load balancing, or setup');
    score += 35;
    detectedCategory = 'Server Setup';
  }

  const finalScore = Math.min(score, 100);
  const priority = finalScore >= 60 ? 'High' : (finalScore >= 35 ? 'Medium' : 'Low');

  return {
    relevance_score: finalScore,
    priority,
    category: detectedCategory,
    buying_signals: buyingSignals,
    summary: buyingSignals.length > 0
      ? `${authorName} is openly discussing: ${buyingSignals.join('; ')}.`
      : `${authorName} mentioned streaming topics in the channel.`
  };
}

/**
 * AI Command Center: Natural language assistant handling CRM and research queries
 */
async function processCommandCenterInstruction(instruction, context = {}) {
  const b = getBusinessSettings();
  const businessContext = buildBusinessContext();

  const systemInstruction = `
${businessContext}

You are the AI Command Center Assistant for ELITE VISION GLOBAL.
You have direct read access to the user's active CRM database, follow-ups, and Discord research.
Answer the owner's request directly, concisely, and actionably in simple English.
Available system context:
- Total Contacts in CRM: ${context.total_contacts || 0}
- Follow-ups Due Today: ${context.followups_due_today || 0}
- Overdue Follow-ups: ${context.overdue_followups || 0}
- Converted Customers: ${context.converted_customers || 0}
- Current Pricing: Subscriptions $${b.sub_1m}/1m, $${b.sub_3m}/3m, $${b.sub_6m}/6m, $${b.sub_12m}/12m; Reseller Panel 120 credits: $${b.reseller_120}; Rebrand with panel: $${b.rebrand_with_panel}; Telegram: ${b.telegram_handle}.

Guidelines:
- If asked to summarize server discussions or research, provide clear, bulleted takeaways.
- If asked to write messages or responses, provide natural, ready-to-use text without robotic filler.
- If asked about follow-ups or opportunities, highlight who to contact first and why.
- Only ask clarifying questions if critical info is missing. Otherwise, provide actionable recommendations immediately.
`;

  const llmResult = await callLLM(systemInstruction, instruction, 0.6);
  if (llmResult.ok && llmResult.text) {
    return { ok: true, source: llmResult.source, response: cleanNaturalEnglish(llmResult.text) };
  }

  // Fallback heuristic responses for common command center queries
  const lower = instruction.toLowerCase();
  let reply = '';

  if (lower.includes('follow-up') || lower.includes('due today')) {
    reply = `You currently have ${context.followups_due_today || 0} follow-up(s) due today and ${context.overdue_followups || 0} overdue. Check the Follow-up System tab to review personalized drafts and send check-ins.`;
  } else if (lower.includes('promising opportunities') || lower.includes('promising') || lower.includes('this week')) {
    reply = `Based on your CRM data, your most promising opportunities are prospects currently in "Interested" and "Price Discussed" stages. Prioritize contacts who requested reseller panel info and test lines, as they convert fastest when you offer a zero-risk 24-hour demo.`;
  } else if (lower.includes('price objection') || lower.includes('too expensive')) {
    reply = `When handling a price objection, avoid immediately discounting. Instead say: "Totally understand! Finding the right balance between price and server stability is key. Our servers use dedicated 10Gbps anti-freeze nodes so you don't lose streams during live sports. Happy to set up a quick test line so you can see if the stream quality is worth it for you."`;
  } else if (lower.includes('research') || lower.includes('communities')) {
    reply = `To discover high-value communities, check the AI Research Center. You can scan public invite links for reseller hubs, stream dev discords, and search authorized channels for members openly requesting trials or complaining about weekend buffering.`;
  } else {
    reply = `Understood. For ${b.business_name}, I recommend reaching out with a natural conversational tone, offering a 24-hour test line or demo APK, and confirming their device setup before pitching pricing. You can also explore the AI Message Writer or Conversation Coach for custom drafts.`;
  }

  return { ok: true, source: 'rule_synthesizer', response: reply };
}

module.exports = {
  cleanNaturalEnglish,
  buildBusinessContext,
  generateMessageDraft,
  generateCoachAdvice,
  analyzeDiscussionBuyingSignals,
  processCommandCenterInstruction
};
