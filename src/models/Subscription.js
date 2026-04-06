const { query } = require('../config/database');

const Subscription = {
  async create({ userId, tier, provider, providerSubId, providerCustomerId, periodStart, periodEnd }) {
    const result = await query(
      `INSERT INTO subscriptions
        (user_id, tier, status, payment_provider, provider_subscription_id,
         provider_customer_id, current_period_start, current_period_end)
       VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, tier, provider, providerSubId, providerCustomerId, periodStart, periodEnd]
    );
    return result.rows[0];
  },

  async findActiveByUser(userId) {
    const result = await query(
      `SELECT * FROM subscriptions
       WHERE user_id = $1 AND status IN ('active', 'trial')
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0];
  },

  async findByProviderId(provider, providerSubId) {
    const result = await query(
      `SELECT s.*, u.email, u.full_name, u.telegram_chat_id
       FROM subscriptions s
       JOIN users u ON s.user_id = u.id
       WHERE s.payment_provider = $1 AND s.provider_subscription_id = $2`,
      [provider, providerSubId]
    );
    return result.rows[0];
  },

  async updateStatus(id, status) {
    const result = await query(
      `UPDATE subscriptions SET status = $2, cancelled_at = CASE WHEN $2 = 'cancelled' THEN NOW() ELSE cancelled_at END
       WHERE id = $1 RETURNING *`,
      [id, status]
    );
    return result.rows[0];
  },

  async renewPeriod(id, periodStart, periodEnd) {
    const result = await query(
      `UPDATE subscriptions SET current_period_start = $2, current_period_end = $3, status = 'active'
       WHERE id = $1 RETURNING *`,
      [id, periodStart, periodEnd]
    );
    return result.rows[0];
  },

  async getExpiringSoon(daysAhead = 3) {
    const result = await query(
      `SELECT s.*, u.telegram_chat_id, u.email
       FROM subscriptions s JOIN users u ON s.user_id = u.id
       WHERE s.status = 'active'
         AND s.current_period_end BETWEEN NOW() AND NOW() + ($1 || ' days')::INTERVAL`,
      [daysAhead]
    );
    return result.rows;
  },

  tierAccess(tier) {
    const tiers = { basic: 1, premium: 2, pro: 3 };
    return tiers[tier] || 0;
  },
};

module.exports = Subscription;
