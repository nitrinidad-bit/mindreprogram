const { Telegraf, Markup } = require('telegraf');
const startCommand = require('./commands/start');
const meditateCommand = require('./commands/meditate');
const progressCommand = require('./commands/progress');
const subscribeCommand = require('./commands/subscribe');
const { botAuth } = require('./middleware/auth');

let bot;

function startBot() {
  bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

  // Global error handler
  bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('Ocurrio un error. Por favor intenta de nuevo.');
  });

  // Public commands (no auth required)
  bot.start(startCommand);
  bot.command('ayuda', (ctx) => {
    ctx.reply(
      '🧠 *MindReprogram Bot* - Comandos disponibles:\n\n' +
      '`/start` - Iniciar y vincular tu cuenta\n' +
      '`/vincular <token>` - Vincular con tu token de acceso\n' +
      '`/meditar` - Recibir meditacion recomendada\n' +
      '`/categorias` - Ver categorias disponibles\n' +
      '`/progreso` - Ver tu progreso y estadisticas\n' +
      '`/suscribir` - Ver planes de suscripcion\n' +
      '`/ayuda` - Mostrar esta ayuda\n\n' +
      '_Recuerda: tu viaje de transformacion es unico. Cada sesion cuenta._',
      { parse_mode: 'Markdown' }
    );
  });

  // Token linking (public - this is how users authenticate)
  bot.command('vincular', async (ctx) => {
    const token = ctx.message.text.split(' ')[1];
    if (!token) {
      return ctx.reply(
        'Para vincular tu cuenta, usa:\n`/vincular TU_TOKEN`\n\n' +
        'Obtiene tu token en la app web despues de suscribirte.',
        { parse_mode: 'Markdown' }
      );
    }

    const TokenService = require('../services/token');
    const User = require('../models/User');

    const tokenData = await TokenService.validateBotToken(token);
    if (!tokenData) {
      return ctx.reply('Token invalido o expirado. Genera uno nuevo desde la app.');
    }

    await User.linkTelegram(
      tokenData.user_id,
      ctx.chat.id,
      ctx.from.username
    );

    ctx.reply(
      `Cuenta vinculada exitosamente, ${tokenData.full_name}! 🎉\n\n` +
      `Suscripcion: *${tokenData.tier.toUpperCase()}*\n` +
      `Categorias: ${tokenData.categories.join(', ')}\n\n` +
      'Usa /meditar para comenzar tu sesion.',
      { parse_mode: 'Markdown' }
    );
  });

  // Authenticated commands
  bot.command('meditar', botAuth, meditateCommand);
  bot.command('categorias', botAuth, async (ctx) => {
    const Progression = require('../models/Progression');
    const progression = await Progression.findByUser(ctx.state.user.id);
    const unlocked = progression?.categories_unlocked || [];

    const categoryInfo = {
      adhd: { name: 'ADHD', emoji: '🧠' },
      depression: { name: 'Depresion', emoji: '🌅' },
      anxiety: { name: 'Ansiedad', emoji: '🌊' },
      trauma: { name: 'Trauma', emoji: '🛡️' },
      sleep: { name: 'Sueno', emoji: '🌙' },
      focus: { name: 'Enfoque', emoji: '🎯' },
      self_compassion: { name: 'Auto-Compasion', emoji: '💜' },
      anger: { name: 'Ira', emoji: '🔥' },
    };

    let msg = '*Tus categorias:*\n\n';
    for (const [id, info] of Object.entries(categoryInfo)) {
      const status = unlocked.includes(id) ? '✅' : '🔒';
      msg += `${status} ${info.emoji} ${info.name}\n`;
    }
    msg += '\n_Las categorias se desbloquean segun tu evaluacion y progreso._';

    ctx.reply(msg, { parse_mode: 'Markdown' });
  });
  bot.command('progreso', botAuth, progressCommand);
  bot.command('suscribir', subscribeCommand);

  // Callback queries (inline button responses)
  bot.on('callback_query', botAuth, async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith('cat_')) {
      const category = data.replace('cat_', '');
      return meditateCommand.byCategory(ctx, category);
    }

    if (data.startsWith('play_')) {
      const meditationId = data.replace('play_', '');
      return meditateCommand.play(ctx, meditationId);
    }

    if (data.startsWith('done_')) {
      const meditationId = data.replace('done_', '');
      return meditateCommand.complete(ctx, meditationId);
    }

    if (data.startsWith('mood_')) {
      const [, meditationId, mood] = data.split('_');
      return meditateCommand.recordMood(ctx, meditationId, parseInt(mood));
    }

    ctx.answerCbQuery();
  });

  // Launch bot
  bot.launch();

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}

function getBot() {
  return bot;
}

module.exports = { startBot, getBot };
