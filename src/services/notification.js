const cron = require('node-cron');
const { query } = require('../config/database');
const Meditation = require('../models/Meditation');
const User = require('../models/User');

let bot = null;

function getBot() {
  if (!bot) {
    const { getBot: getBotInstance } = require('../bot');
    bot = getBotInstance();
  }
  return bot;
}

async function sendTelegramMessage(chatId, message, options = {}) {
  const b = getBot();
  if (!b) return;

  try {
    await b.telegram.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      ...options,
    });
    return true;
  } catch (err) {
    console.error(`Failed to send Telegram message to ${chatId}:`, err.message);
    return false;
  }
}

async function logNotification(userId, type, title, message, meditationId = null) {
  await query(
    `INSERT INTO notifications (user_id, type, title, message, meditation_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title, message, meditationId]
  );
}

// ===== NOTIFICATION JOBS =====

// Daily meditation reminder (runs at user's preferred time, default 8am)
async function sendDailyReminders() {
  const users = await query(
    `SELECT u.id, u.telegram_chat_id, u.full_name, u.timezone,
            p.current_level, p.streak_days, p.last_session_at
     FROM users u
     JOIN user_progression p ON u.id = p.user_id
     WHERE u.telegram_chat_id IS NOT NULL
       AND (p.last_session_at IS NULL OR p.last_session_at::date < CURRENT_DATE)`
  );

  for (const user of users.rows) {
    const streakMsg = user.streak_days > 0
      ? `Tu racha de ${user.streak_days} dias esta en riesgo!`
      : 'Comienza una nueva racha hoy.';

    const duration = getDuration(user.current_level);

    const sent = await sendTelegramMessage(
      user.telegram_chat_id,
      `🧘 Buenos dias, *${user.full_name}*\n\n` +
      `${streakMsg}\n` +
      `Tu sesion de hoy: ${duration} minutos\n\n` +
      'Usa /meditar para comenzar.'
    );

    if (sent) {
      await logNotification(user.id, 'reminder', 'Recordatorio diario', streakMsg);
    }
  }
}

// Notify users when new meditations are published
async function notifyNewMeditations() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const newMeditations = await Meditation.getNewSince(oneDayAgo);

  if (newMeditations.length === 0) return;

  const users = await User.getAllWithTelegram();

  for (const meditation of newMeditations) {
    const msg =
      `🆕 *Nueva meditacion disponible!*\n\n` +
      `*${meditation.title}*\n` +
      `📂 ${meditation.category} | ⏱ ${meditation.duration_minutes} min | 🎯 Nivel ${meditation.unlock_level}\n\n` +
      `${meditation.description || ''}\n\n` +
      'Usa /meditar para escucharla.';

    for (const user of users) {
      await sendTelegramMessage(user.telegram_chat_id, msg);
      await logNotification(user.id, 'new_meditation', meditation.title, msg, meditation.id);
    }
  }
}

// Streak achievement notifications
async function sendStreakAchievements() {
  const milestones = [7, 14, 21, 30, 60, 90, 100, 365];

  const users = await query(
    `SELECT u.id, u.telegram_chat_id, u.full_name, p.streak_days
     FROM users u
     JOIN user_progression p ON u.id = p.user_id
     WHERE u.telegram_chat_id IS NOT NULL
       AND p.streak_days = ANY($1)`,
    [milestones]
  );

  const achievements = {
    7: '🥉 1 Semana de consistencia!',
    14: '🥈 2 Semanas de transformacion!',
    21: '🥇 21 dias - Se dice que un habito se forma en 21 dias!',
    30: '🏅 1 Mes completo! Tu cerebro esta cambiando.',
    60: '💎 60 dias! Neuroplasticidad en accion.',
    90: '🏆 90 dias! Has reprogramado patrones profundos.',
    100: '🌟 CENTURION! 100 dias de meditacion continua.',
    365: '👑 UN ANO COMPLETO! Eres una leyenda de la meditacion.',
  };

  for (const user of users.rows) {
    const msg =
      `🎉 *LOGRO DESBLOQUEADO!*\n\n` +
      `${achievements[user.streak_days]}\n\n` +
      `Racha actual: *${user.streak_days} dias*\n` +
      `Felicidades, ${user.full_name}! Sigue asi.`;

    await sendTelegramMessage(user.telegram_chat_id, msg);
    await logNotification(user.id, 'achievement', achievements[user.streak_days], msg);
  }
}

// Subscription expiry warning
async function sendExpiryWarnings() {
  const expiring = await query(
    `SELECT u.id, u.telegram_chat_id, u.full_name,
            s.tier, s.current_period_end
     FROM subscriptions s
     JOIN users u ON s.user_id = u.id
     WHERE s.status = 'active'
       AND s.current_period_end BETWEEN NOW() AND NOW() + INTERVAL '3 days'
       AND u.telegram_chat_id IS NOT NULL`
  );

  for (const sub of expiring.rows) {
    const daysLeft = Math.ceil((new Date(sub.current_period_end) - Date.now()) / (1000 * 60 * 60 * 24));

    await sendTelegramMessage(
      sub.telegram_chat_id,
      `⚠️ *Tu suscripcion ${sub.tier.toUpperCase()} expira en ${daysLeft} dia(s)*\n\n` +
      'Renueva para no perder tu racha ni tu progreso.\n' +
      'Usa /suscribir para ver opciones.'
    );
    await logNotification(sub.id, 'subscription', 'Suscripcion por expirar', `Expira en ${daysLeft} dias`);
  }
}

function getDuration(level) {
  const map = { 1: 5, 2: 8, 3: 10, 4: 15, 5: 15, 6: 15, 7: 25, 8: 25, 9: 25, 10: 40, 11: 40, 12: 60 };
  return map[level] || 5;
}

// ===== SCHEDULER =====

function startNotificationScheduler() {
  // Daily reminders at 8:00 AM (server time)
  cron.schedule('0 8 * * *', () => {
    console.log('Running daily reminders...');
    sendDailyReminders().catch(console.error);
  });

  // Check for new meditations every 6 hours
  cron.schedule('0 */6 * * *', () => {
    console.log('Checking for new meditations...');
    notifyNewMeditations().catch(console.error);
  });

  // Streak achievements daily at 9 PM
  cron.schedule('0 21 * * *', () => {
    console.log('Checking streak achievements...');
    sendStreakAchievements().catch(console.error);
  });

  // Expiry warnings daily at 10 AM
  cron.schedule('0 10 * * *', () => {
    console.log('Checking expiring subscriptions...');
    sendExpiryWarnings().catch(console.error);
  });

  console.log('Notification scheduler initialized with 4 cron jobs.');
}

module.exports = { startNotificationScheduler, sendTelegramMessage };
