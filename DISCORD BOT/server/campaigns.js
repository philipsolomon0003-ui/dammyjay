const { db } = require('./db');
const crypto = require('node:crypto');

function uid(prefix = 'cmp') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Get all campaigns with prospect counts and calculated conversion rates
 */
function getCampaigns() {
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();

  return campaigns.map(c => {
    // Count associated prospects
    const counts = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'messaged' THEN 1 ELSE 0 END) as messaged,
        SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) as replied,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted
      FROM campaign_prospects
      WHERE campaign_id = ?
    `).get(c.id);

    const total = counts.total || 0;
    const converted = counts.converted || 0;
    const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

    return {
      ...c,
      phases: JSON.parse(c.phases || '[]'),
      metrics: {
        targeted: total,
        contacted: counts.messaged || 0,
        replied: counts.replied || 0,
        converted: converted,
        conversion_rate: conversionRate
      }
    };
  });
}

/**
 * Get a specific campaign by ID with associated prospects
 */
function getCampaignById(id) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!campaign) return null;

  const prospects = db.prepare(`
    SELECT 
      cp.campaign_id,
      cp.prospect_id,
      cp.phase_index,
      cp.status as campaign_prospect_status,
      cp.assigned_at,
      p.username,
      p.display_name,
      p.avatar_url,
      p.status as prospect_crm_status,
      p.source_community_name,
      p.business_interests
    FROM campaign_prospects cp
    JOIN prospects p ON cp.prospect_id = p.id
    WHERE cp.campaign_id = ?
    ORDER BY cp.assigned_at DESC
  `).all(id);

  return {
    ...campaign,
    phases: JSON.parse(campaign.phases || '[]'),
    prospects: prospects.map(p => ({
      ...p,
      business_interests: JSON.parse(p.business_interests || '[]')
    }))
  };
}

/**
 * Create a new outreach campaign
 */
function createCampaign(data) {
  const id = uid('cmp');
  const phases = Array.isArray(data.phases) ? JSON.stringify(data.phases) : JSON.stringify([
    { index: 0, name: 'Phase 1: Initial Hook & Demo', template_id: 'tpl-rebrand-1', delay_days: 0 },
    { index: 1, name: 'Phase 2: Portfolio Preview', template_id: 'tpl-followup-3d-value', delay_days: 3 },
    { index: 2, name: 'Phase 3: Final Follow-up', template_id: 'tpl-followup-2d', delay_days: 3 }
  ]);

  const metrics = JSON.stringify({
    targeted: 0,
    contacted: 0,
    replied: 0,
    converted: 0,
    conversion_rate: 0
  });

  db.prepare(`
    INSERT INTO campaigns (
      id, name, target_audience, target_service, status, description, phases, metrics, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    data.name,
    data.target_audience || 'All Relevant IPTV Prospects',
    data.target_service || 'rebranding',
    data.status || 'draft',
    data.description || '',
    phases,
    metrics
  );

  return { ok: true, id, campaign: getCampaignById(id) };
}

/**
 * Update a campaign
 */
function updateCampaign(id, data) {
  const existing = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(id);
  if (!existing) return { ok: false, error: 'Campaign not found' };

  const phases = data.phases ? (Array.isArray(data.phases) ? JSON.stringify(data.phases) : data.phases) : undefined;

  db.prepare(`
    UPDATE campaigns SET
      name = COALESCE(?, name),
      target_audience = COALESCE(?, target_audience),
      target_service = COALESCE(?, target_service),
      status = COALESCE(?, status),
      description = COALESCE(?, description),
      phases = COALESCE(?, phases),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.name || null,
    data.target_audience || null,
    data.target_service || null,
    data.status || null,
    data.description || null,
    phases || null,
    id
  );

  return { ok: true, campaign: getCampaignById(id) };
}

/**
 * Add prospects to a campaign
 */
function addProspectsToCampaign(campaignId, prospectIds = []) {
  const insert = db.prepare(`
    INSERT INTO campaign_prospects (campaign_id, prospect_id, phase_index, status, assigned_at)
    VALUES (?, ?, 0, 'targeted', CURRENT_TIMESTAMP)
    ON CONFLICT(campaign_id, prospect_id) DO NOTHING
  `);

  let added = 0;
  for (const pid of prospectIds) {
    const res = insert.run(campaignId, pid);
    if (res.changes > 0) added++;
  }

  return { ok: true, added_count: added };
}

/**
 * Update prospect progress in a campaign
 */
function updateCampaignProspectStatus(campaignId, prospectId, { phase_index, status }) {
  db.prepare(`
    UPDATE campaign_prospects SET
      phase_index = COALESCE(?, phase_index),
      status = COALESCE(?, status)
    WHERE campaign_id = ? AND prospect_id = ?
  `).run(
    phase_index !== undefined ? phase_index : null,
    status || null,
    campaignId,
    prospectId
  );

  return { ok: true };
}

/**
 * Delete a campaign
 */
function deleteCampaign(id) {
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
  return { ok: true };
}

module.exports = {
  getCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  addProspectsToCampaign,
  updateCampaignProspectStatus,
  deleteCampaign
};
