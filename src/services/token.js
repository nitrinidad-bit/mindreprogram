const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const crypto = require('crypto');

const TokenService = {
  generateAccessToken(user, subscription) {
    const payload = {
      sub: user.id,
      email: user.email,
      tier: subscription?.tier || 'basic',
      isAdmin: user.is_admin,
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });
  },

  generateRefreshToken(user) {
    return jwt.sign(
      { sub: user.id, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );
  },

  verifyAccessToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
  },

  verifyRefreshToken(token) {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  },

  // Bot-specific: short-lived link token for Telegram validation
  async generateBotToken(userId, tier, categories, maxLevel) {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');

    await query(
      `INSERT INTO access_tokens (user_id, token_hash, tier, categories, max_level, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 days')`,
      [userId, hash, tier, categories, maxLevel]
    );

    return raw;
  },

  async validateBotToken(raw) {
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const result = await query(
      `SELECT at.*, u.email, u.full_name, u.telegram_chat_id
       FROM access_tokens at
       JOIN users u ON at.user_id = u.id
       WHERE at.token_hash = $1
         AND at.expires_at > NOW()
         AND at.is_revoked = FALSE`,
      [hash]
    );
    return result.rows[0] || null;
  },

  async revokeBotTokens(userId) {
    await query(
      'UPDATE access_tokens SET is_revoked = TRUE WHERE user_id = $1',
      [userId]
    );
  },
};

module.exports = TokenService;
