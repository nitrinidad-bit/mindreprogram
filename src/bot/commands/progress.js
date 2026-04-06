const Progression = require('../../models/Progression');

const LEVEL_NAMES = {
  1: 'Despertar', 2: 'Semilla', 3: 'Raiz', 4: 'Brote',
  5: 'Tallo', 6: 'Flor', 7: 'Fruto', 8: 'Arbol',
  9: 'Bosque', 10: 'Montana', 11: 'Cielo', 12: 'Cosmos',
};

module.exports = async (ctx) => {
  const stats = await Progression.getStats(ctx.state.user.id);

  // Build progress bar
  const filled = Math.round((stats.level / 12) * 10);
  const progressBar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  let msg = `📊 *Tu Progreso - ${ctx.state.user.full_name}*\n\n`;

  msg += `🏅 Nivel: *${stats.level}/12* (${LEVEL_NAMES[stats.level]})\n`;
  msg += `[${progressBar}]\n\n`;

  msg += `⏱ Duracion actual: ${stats.currentDuration} min\n`;
  msg += `⏭ Proxima duracion: ${stats.nextDuration} min\n\n`;

  msg += `🔥 Racha actual: *${stats.streakDays} dias*\n`;
  msg += `🏆 Mejor racha: ${stats.longestStreak} dias\n`;
  msg += `📝 Total sesiones: ${stats.totalSessions}\n`;
  msg += `⏱ Tiempo total: ${Math.round(stats.totalMinutes / 60)}h ${stats.totalMinutes % 60}m\n`;
  msg += `📈 Consistencia: ${Math.round(stats.consistencyScore * 100)}%\n\n`;

  // Mood trend
  if (stats.moodTrend.length > 0) {
    msg += `*Tendencia de animo (ultimos dias):*\n`;
    stats.moodTrend.slice(0, 5).forEach(day => {
      const before = parseFloat(day.avg_mood_before).toFixed(1);
      const after = parseFloat(day.avg_mood_after).toFixed(1);
      const diff = (after - before).toFixed(1);
      const arrow = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
      msg += `${day.date}: ${before} → ${after} ${arrow}\n`;
    });
  }

  msg += `\n*Categorias desbloqueadas:* ${stats.categoriesUnlocked.join(', ')}`;

  ctx.reply(msg, { parse_mode: 'Markdown' });
};
