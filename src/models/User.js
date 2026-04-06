const { query } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = {
  async create({ email, password, fullName }) {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name, telegram_chat_id, is_admin, created_at`,
      [email, passwordHash, fullName]
    );
    return result.rows[0];
  },

  async findByEmail(email) {
    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  },

  async findById(id) {
    const result = await query(
      `SELECT id, email, full_name, telegram_chat_id, telegram_username,
              timezone, preferred_voice, onboarding_completed, is_admin, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  },

  async findByTelegramChatId(chatId) {
    const result = await query(
      'SELECT * FROM users WHERE telegram_chat_id = $1',
      [chatId]
    );
    return result.rows[0];
  },

  async linkTelegram(userId, chatId, username) {
    const result = await query(
      `UPDATE users SET telegram_chat_id = $2, telegram_username = $3
       WHERE id = $1 RETURNING *`,
      [userId, chatId, username]
    );
    return result.rows[0];
  },

  async updateOnboarding(userId, data) {
    const result = await query(
      `UPDATE users SET timezone = $2, preferred_voice = $3, onboarding_completed = TRUE
       WHERE id = $1 RETURNING *`,
      [userId, data.timezone, data.preferredVoice]
    );
    return result.rows[0];
  },

  async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  async getAllWithTelegram() {
    const result = await query(
      'SELECT id, telegram_chat_id, timezone FROM users WHERE telegram_chat_id IS NOT NULL'
    );
    return result.rows;
  },
};

module.exports = User;
