const { db, getBusinessSettings } = require('./db');
const { logActivity, getProspectById } = require('./crm');
const crypto = require('node:crypto');

const MAX_FOLLOWUP_LIMIT = 3;

function uid(prefix = 'rem') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Generate personalized follow-up message draft
 */
function buildPersonalizedFollowUpDraft(prospect, intervalDays = 2, previousContext = '') {
  const b = getBusinessSettings();
  const name = prospect.display_name || prospect.username || 'there';
  const service = prospect.service_interested || 'our streaming services';

  if (intervalDays <= 2) {
    return `Hey ${name}, just wanted to follow up on my note from a couple days ago. Wanted to check if you had a moment to see if you're still exploring ${service}? No rush at all, just let me know if it's still on your radar.`;
  } else if (intervalDays <= 4) {
    return `Hi ${name}, hope your week is going smoothly! I put together a quick preview and can generate a free 24-hour test line for ${service} so you can check stability firsthand on your device. Let me know if you want the test credentials.`;
  } else {
    return `Hey ${name}, following up one last time regarding ${service}. If you ever need a reliable backup line or assistance down the road, feel free to reach out anytime here or on Telegram at ${b.telegram_handle}. Wishing you the best!`;
  }
}

/**
 * Schedule a follow-up reminder
 */
function scheduleReminder(prospectId, options = {}) {
  const prospect = getProspectById(prospectId);
  if (!prospect) {
    return { ok: false, error: 'Prospect not found' };
  }

  // Safety Safeguard 1: Do not follow up with contacts marked Not Interested or Archived
  if (prospect.status === 'not_interested' || prospect.status === 'archived' || prospect.stop_followup === 1) {
    return {
      ok: false,
      error: `Action Blocked: Contact is marked as "${prospect.status.replace(/_/g, ' ').toUpperCase()}" or has requested to stop. Safe business policy forbids scheduling follow-ups.`
    };
  }

  // Safety Safeguard 2: Check follow-up count limit
  const currentCount = prospect.followup_count || 0;
  if (currentCount >= MAX_FOLLOWUP_LIMIT) {
    return {
      ok: false,
      error: `Safety Limit Reached: You have already followed up with ${prospect.display_name || prospect.username} ${currentCount} times. To avoid being perceived as spam, further follow-ups are restricted.`
    };
  }

  // Prevent duplicate pending reminders for the same prospect
  const existingPending = db.prepare(`
    SELECT id, scheduled_for FROM reminders
    WHERE prospect_id = ? AND status = 'pending'
  `).get(prospectId);

  if (existingPending) {
    return {
      ok: false,
      error: `A follow-up is already pending for this contact scheduled for ${new Date(existingPending.scheduled_for).toLocaleDateString()}. Please edit or reschedule the existing reminder.`
    };
  }

  const {
    days = 2,
    custom_date = null,
    title = null,
    notes = '',
    custom_message = null
  } = options;

  let targetDate;
  if (custom_date) {
    targetDate = new Date(custom_date);
  } else {
    targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + Number(days));
  }

  const targetDateISO = targetDate.toISOString();
  const reminderTitle = title || `Follow-up with ${prospect.display_name || prospect.username} (${days}d check-in)`;
  const suggestedMessage = custom_message || buildPersonalizedFollowUpDraft(prospect, Number(days), prospect.last_message_summary || prospect.private_notes);

  const reminderId = uid('rem');

  db.prepare(`
    INSERT INTO reminders (
      id, prospect_id, scheduled_for, status, title, notes, suggested_message, created_at, updated_at
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    reminderId,
    prospectId,
    targetDateISO,
    reminderTitle,
    notes,
    suggestedMessage
  );

  // Increment follow-up count and update next_followup_at
  db.prepare(`
    UPDATE prospects SET
      next_followup_at = ?,
      followup_count = followup_count + 1,
      status = CASE WHEN status = 'new_contact' THEN 'conversation_started' ELSE status END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(targetDateISO, prospectId);

  logActivity(
    prospectId,
    'followup_scheduled',
    'Follow-up Reminder Scheduled',
    `Scheduled for ${targetDate.toLocaleDateString()} ${targetDate.toLocaleTimeString()}. Reason: ${reminderTitle}`
  );

  return {
    ok: true,
    reminder_id: reminderId,
    scheduled_for: targetDateISO,
    suggested_message: suggestedMessage,
    followup_count: currentCount + 1
  };
}

/**
 * Handle "Mark as Replied" workflow
 * When a prospect replies, pending follow-ups are marked as no longer needed,
 * status transitions to 'conversation_started' or 'interested', and Coach reply advice is generated.
 */
function recordProspectReply(prospectId, replyContent = '') {
  const prospect = getProspectById(prospectId);
  if (!prospect) return { ok: false, error: 'Prospect not found' };

  // 1. Dismiss any pending reminders as no longer needed
  db.prepare(`
    UPDATE reminders SET
      status = 'completed',
      completed_at = CURRENT_TIMESTAMP,
      notes = notes || ' (Resolved: Prospect replied before reminder expired)',
      updated_at = CURRENT_TIMESTAMP
    WHERE prospect_id = ? AND status = 'pending'
  `).run(prospectId);

  // 2. Advance stage if appropriate
  let newStatus = prospect.status;
  if (newStatus === 'followup_due' || newStatus === 'new_contact' || newStatus === 'first_message_ready') {
    newStatus = 'conversation_started';
  }

  db.prepare(`
    UPDATE prospects SET
      status = ?,
      last_interaction_at = CURRENT_TIMESTAMP,
      last_message_summary = ?,
      next_followup_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newStatus, replyContent ? `Replied: "${replyContent.slice(0, 120)}"` : 'Prospect replied', prospectId);

  logActivity(
    prospectId,
    'message_received',
    'Prospect Replied',
    replyContent ? `Message: "${replyContent}"` : 'Prospect replied to outreach'
  );

  return {
    ok: true,
    message: 'Follow-up marked as completed. Prospect conversation updated.',
    new_status: newStatus
  };
}

/**
 * Query reminders categorized into: Today, Overdue, Upcoming, Completed
 */
function getReminders(filters = {}) {
  let query = `
    SELECT 
      r.id,
      r.prospect_id,
      r.scheduled_for,
      r.status,
      r.title,
      r.notes,
      r.suggested_message,
      r.completed_at,
      r.created_at,
      p.username,
      p.display_name,
      p.avatar_url,
      p.status as prospect_status,
      p.service_interested,
      p.source_community_name,
      p.private_notes,
      p.last_message_summary,
      p.followup_count
    FROM reminders r
    JOIN prospects p ON r.prospect_id = p.id
    WHERE 1=1
  `;

  const params = [];

  if (filters.prospect_id) {
    query += ' AND r.prospect_id = ?';
    params.push(filters.prospect_id);
  }

  if (filters.status && filters.status !== 'all') {
    query += ' AND r.status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY r.scheduled_for ASC';

  const rows = db.prepare(query).all(...params);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  return rows.map(r => {
    const dueDate = new Date(r.scheduled_for);
    let timingCategory = 'upcoming';

    if (r.status === 'completed' || r.status === 'cancelled') {
      timingCategory = 'completed';
    } else if (dueDate < startOfToday) {
      timingCategory = 'overdue';
    } else if (dueDate <= endOfToday) {
      timingCategory = 'today';
    }

    return {
      ...r,
      timing_category: timingCategory,
      is_overdue: r.status === 'pending' && dueDate < now,
      due_formatted: dueDate.toLocaleDateString() + ' ' + dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  });
}

/**
 * Reschedule reminder to a future date
 */
function rescheduleReminder(reminderId, days = 2, customDate = null) {
  const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminderId);
  if (!reminder) return { ok: false, error: 'Reminder not found' };

  let targetDate;
  if (customDate) {
    targetDate = new Date(customDate);
  } else {
    targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + Number(days));
  }

  const targetDateISO = targetDate.toISOString();

  db.prepare(`
    UPDATE reminders SET
      scheduled_for = ?,
      status = 'pending',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(targetDateISO, reminderId);

  db.prepare(`
    UPDATE prospects SET
      next_followup_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(targetDateISO, reminder.prospect_id);

  logActivity(
    reminder.prospect_id,
    'followup_scheduled',
    'Follow-up Rescheduled',
    `Rescheduled for ${targetDate.toLocaleDateString()}`
  );

  return { ok: true, reminder_id: reminderId, scheduled_for: targetDateISO };
}

/**
 * Mark reminder as completed
 */
function completeReminder(reminderId, notes = '') {
  const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminderId);
  if (!reminder) return { ok: false, error: 'Reminder not found' };

  db.prepare(`
    UPDATE reminders SET
      status = 'completed',
      completed_at = CURRENT_TIMESTAMP,
      notes = CASE WHEN ? != '' THEN notes || char(10) || ? ELSE notes END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(notes || '', notes || '', reminderId);

  db.prepare(`
    UPDATE prospects SET
      next_followup_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reminder.prospect_id);

  logActivity(
    reminder.prospect_id,
    'reminder_completed',
    'Follow-up Completed',
    notes || 'Message sent and follow-up marked as completed'
  );

  return { ok: true, reminder_id: reminderId };
}

/**
 * Dismiss or cancel reminder
 */
function cancelReminder(reminderId, reason = '') {
  const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminderId);
  if (!reminder) return { ok: false, error: 'Reminder not found' };

  db.prepare(`
    UPDATE reminders SET
      status = 'cancelled',
      notes = notes || ' [Dismissed: ' || ? || ']',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reason || 'Dismissed by user', reminderId);

  db.prepare(`
    UPDATE prospects SET
      next_followup_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reminder.prospect_id);

  return { ok: true, reminder_id: reminderId };
}

module.exports = {
  MAX_FOLLOWUP_LIMIT,
  scheduleReminder,
  recordProspectReply,
  getReminders,
  rescheduleReminder,
  completeReminder,
  cancelReminder,
  buildPersonalizedFollowUpDraft
};
