const { Markup } = require('telegraf');
const Meditation = require('../../models/Meditation');
const Progression = require('../../models/Progression');
const StorageService = require('../../services/storage');

// Temporary storage for active sessions (in production, use Redis)
const activeSessions = new Map();

const meditateCommand = async (ctx) => {
  const progression = await Progression.findByUser(ctx.state.user.id);
  if (!progression) {
    await Progression.initForUser(ctx.state.user.id);
  }

  const unlocked = progression?.categories_unlocked || ['adhd'];

  const categoryLabels = {
    adhd: '🧠 ADHD',
    depression: '🌅 Depresion',
    anxiety: '🌊 Ansiedad',
    trauma: '🛡️ Trauma',
    sleep: '🌙 Sueno',
    focus: '🎯 Enfoque',
    self_compassion: '💜 Auto-Compasion',
    anger: '🔥 Ira',
  };

  // Build category buttons (2 per row)
  const buttons = [];
  for (let i = 0; i < unlocked.length; i += 2) {
    const row = [Markup.button.callback(categoryLabels[unlocked[i]] || unlocked[i], `cat_${unlocked[i]}`)];
    if (unlocked[i + 1]) {
      row.push(Markup.button.callback(categoryLabels[unlocked[i + 1]] || unlocked[i + 1], `cat_${unlocked[i + 1]}`));
    }
    buttons.push(row);
  }

  const duration = Progression.getLevelDuration(progression?.current_level || 1);

  ctx.reply(
    `🧘 *Hora de meditar*\n\n` +
    `Nivel: ${progression?.current_level || 1}/12\n` +
    `Duracion sugerida: ${duration} min\n` +
    `Racha: ${progression?.streak_days || 0} dias\n\n` +
    'Elige una categoria:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    }
  );
};

// Show meditations for a specific category
meditateCommand.byCategory = async (ctx, category) => {
  ctx.answerCbQuery();

  const progression = await Progression.findByUser(ctx.state.user.id);
  const meditations = await Meditation.recommend({
    categories: [category],
    level: progression?.current_level || 1,
    tier: ctx.state.subscription.tier,
  });

  if (meditations.length === 0) {
    return ctx.editMessageText(
      'No hay meditaciones disponibles para esta categoria y nivel.\n' +
      'Sigue practicando para desbloquear mas contenido.'
    );
  }

  let msg = `*Meditaciones de ${category.toUpperCase()}:*\n\n`;
  const buttons = [];

  meditations.forEach((m, i) => {
    msg += `${i + 1}. *${m.title}*\n`;
    msg += `   ⏱ ${m.duration_minutes} min | 🎯 ${m.neural_target}\n`;
    msg += `   ${m.description || ''}\n\n`;
    buttons.push([Markup.button.callback(`▶️ ${m.title.substring(0, 30)}`, `play_${m.id}`)]);
  });

  ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons),
  });
};

// Play a meditation - send streaming link
meditateCommand.play = async (ctx, meditationId) => {
  ctx.answerCbQuery('Preparando tu sesion...');

  const meditation = await Meditation.findById(meditationId);
  if (!meditation) {
    return ctx.reply('Meditacion no encontrada.');
  }

  // Check level
  const progression = await Progression.findByUser(ctx.state.user.id);
  if (meditation.unlock_level > (progression?.current_level || 1)) {
    return ctx.reply(
      `Esta meditacion requiere nivel ${meditation.unlock_level}.\n` +
      `Tu nivel actual: ${progression?.current_level || 1}\n\n` +
      'Sigue practicando para desbloquear mas contenido.'
    );
  }

  // Get streaming URL
  const streamUrl = await StorageService.getStreamUrl(meditation.audio_s3_key);
  await Meditation.incrementListenCount(meditationId);

  // Store active session
  activeSessions.set(`${ctx.state.user.id}_${meditationId}`, {
    startedAt: Date.now(),
    durationMinutes: meditation.duration_minutes,
  });

  const msg =
    `🎧 *${meditation.title}*\n\n` +
    `⏱ Duracion: ${meditation.duration_minutes} minutos\n` +
    `🧠 Objetivo neural: ${meditation.neural_target}\n` +
    (meditation.binaural_frequency ? `🔊 Frecuencia binaural: ${meditation.binaural_frequency}Hz\n` : '') +
    `\n🔗 [Escuchar meditacion](${streamUrl})\n\n` +
    `_El enlace expira en 15 minutos._\n` +
    `_Cuando termines, presiona el boton de abajo._`;

  ctx.reply(msg, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✅ Termine la sesion', `done_${meditationId}`)],
    ]),
  });
};

// Mark session as complete
meditateCommand.complete = async (ctx, meditationId) => {
  ctx.answerCbQuery();

  const sessionKey = `${ctx.state.user.id}_${meditationId}`;
  const session = activeSessions.get(sessionKey);
  const durationListened = session
    ? Math.floor((Date.now() - session.startedAt) / 1000)
    : 0;

  activeSessions.delete(sessionKey);

  // Ask for mood rating
  ctx.editMessageText(
    '¿Como te sientes despues de la sesion?\n\n' +
    'Califica del 1 (mal) al 5 (excelente):',
    Markup.inlineKeyboard([
      [1, 2, 3, 4, 5].map(n =>
        Markup.button.callback(
          ['😟', '😐', '🙂', '😊', '🤩'][n - 1],
          `mood_${meditationId}_${n * 2}` // Map 1-5 to 2,4,6,8,10 scale
        )
      ),
    ])
  );
};

// Record mood after session
meditateCommand.recordMood = async (ctx, meditationId, moodAfter) => {
  ctx.answerCbQuery();

  const meditation = await Meditation.findById(meditationId);
  const durationListened = (meditation?.duration_minutes || 5) * 60; // Assume full completion

  const result = await Progression.recordSession(ctx.state.user.id, meditationId, {
    durationListened,
    moodBefore: null,
    moodAfter,
    rating: Math.ceil(moodAfter / 2),
    completed: true,
  });

  let msg = '✅ *Sesion registrada*\n\n';
  msg += `Estado de animo: ${moodAfter}/10\n`;

  if (result.leveledUp) {
    msg += `\n🎉 *NIVEL ${result.progression.current_level} DESBLOQUEADO!*\n`;
    msg += `Nueva duracion de sesion: ${result.currentDuration} minutos\n`;
    msg += 'Se han desbloqueado nuevas meditaciones para ti.\n';
  }

  const progression = await Progression.findByUser(ctx.state.user.id);
  msg += `\n🔥 Racha: ${progression?.streak_days || 0} dias`;
  msg += `\n📊 Total sesiones: ${progression?.total_sessions || 0}`;
  msg += `\n⏱ Minutos totales: ${progression?.total_minutes || 0}`;
  msg += '\n\n_Nos vemos manana. La constancia es la clave._';

  ctx.editMessageText(msg, { parse_mode: 'Markdown' });
};

module.exports = meditateCommand;
