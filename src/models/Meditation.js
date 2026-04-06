const { query } = require('../config/database');

const Meditation = {
  async findById(id) {
    const result = await query(
      'SELECT * FROM meditations WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    return result.rows[0];
  },

  async findByCategory(category, { level = 12, tier = 'pro', limit = 20, offset = 0 }) {
    const tierMap = { basic: 1, premium: 2, pro: 3 };
    const tierNames = Object.keys(tierMap).filter(t => tierMap[t] <= tierMap[tier]);

    const result = await query(
      `SELECT * FROM meditations
       WHERE category = $1
         AND unlock_level <= $2
         AND min_tier = ANY($3)
         AND is_active = TRUE
         AND published_at IS NOT NULL
       ORDER BY unlock_level ASC, created_at DESC
       LIMIT $4 OFFSET $5`,
      [category, level, tierNames, limit, offset]
    );
    return result.rows;
  },

  async recommend({ categories, level, tier, excludeIds = [] }) {
    const tierMap = { basic: 1, premium: 2, pro: 3 };
    const tierNames = Object.keys(tierMap).filter(t => tierMap[t] <= tierMap[tier]);

    const result = await query(
      `SELECT * FROM meditations
       WHERE category = ANY($1)
         AND unlock_level <= $2
         AND min_tier = ANY($3)
         AND is_active = TRUE
         AND published_at IS NOT NULL
         AND ($4::uuid[] IS NULL OR id != ALL($4))
       ORDER BY
         CASE WHEN unlock_level = $2 THEN 0 ELSE 1 END,
         listen_count ASC,
         RANDOM()
       LIMIT 3`,
      [categories, level, tierNames, excludeIds.length > 0 ? excludeIds : null]
    );
    return result.rows;
  },

  async create(data) {
    const result = await query(
      `INSERT INTO meditations
        (title, description, category, duration_minutes, unlock_level, min_tier,
         audio_s3_key, thumbnail_s3_key, binaural_frequency, neural_target,
         tags, script, created_by, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        data.title, data.description, data.category, data.durationMinutes,
        data.unlockLevel, data.minTier, data.audioS3Key, data.thumbnailS3Key,
        data.binauralFrequency, data.neuralTarget, data.tags, data.script,
        data.createdBy, data.publishNow ? new Date() : null,
      ]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${idx}`);
      values.push(value);
      idx++;
    }
    values.push(id);

    const result = await query(
      `UPDATE meditations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  },

  async publish(id) {
    const result = await query(
      `UPDATE meditations SET published_at = NOW(), is_active = TRUE WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  async incrementListenCount(id) {
    await query(
      'UPDATE meditations SET listen_count = listen_count + 1 WHERE id = $1',
      [id]
    );
  },

  async getNewSince(since) {
    const result = await query(
      `SELECT * FROM meditations
       WHERE published_at > $1 AND is_active = TRUE
       ORDER BY published_at DESC`,
      [since]
    );
    return result.rows;
  },

  async getAll({ limit = 50, offset = 0, category, activeOnly = true }) {
    let sql = 'SELECT * FROM meditations WHERE 1=1';
    const params = [];
    let idx = 1;

    if (activeOnly) {
      sql += ` AND is_active = TRUE`;
    }
    if (category) {
      sql += ` AND category = $${idx}`;
      params.push(category);
      idx++;
    }
    sql += ` ORDER BY category, unlock_level ASC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  },
};

module.exports = Meditation;
