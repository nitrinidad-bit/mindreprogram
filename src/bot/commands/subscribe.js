const { Markup } = require('telegraf');

module.exports = async (ctx) => {
  const msg =
    '💳 *Planes de Suscripcion MindReprogram*\n\n' +

    '📦 *BASICO* - $9.99/mes\n' +
    '• Niveles 1-6 (5 a 15 min)\n' +
    '• 5 categorias terapeuticas\n' +
    '• Progresion personalizada\n' +
    '• Bot de meditacion\n\n' +

    '⭐ *PREMIUM* - $19.99/mes\n' +
    '• Todos los niveles (1-12)\n' +
    '• Todas las categorias\n' +
    '• Meditaciones de 5 a 60 min\n' +
    '• Frecuencias binaurales\n' +
    '• Voz personalizable\n\n' +

    '👑 *PRO* - $39.99/mes\n' +
    '• Todo lo de Premium\n' +
    '• Bot terapeutico avanzado\n' +
    '• Sesiones generadas por IA\n' +
    '• Reportes detallados\n' +
    '• Acceso anticipado\n\n' +

    '_Todos los planes incluyen 3 dias de prueba gratis._\n' +
    `_Suscribete en:_ ${process.env.FRONTEND_URL || 'la app web'}`;

  ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.url('Suscribirme ahora', `${process.env.FRONTEND_URL || 'https://mindreprogram.com'}/pricing`)],
    ]),
  });
};
