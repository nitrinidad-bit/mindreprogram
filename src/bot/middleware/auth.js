const User = require('../../models/User');
const Subscription = require('../../models/Subscription');

async function botAuth(ctx, next) {
  const chatId = ctx.chat.id;

  const user = await User.findByTelegramChatId(chatId);
  if (!user) {
    return ctx.reply(
      'No tienes una cuenta vinculada.\n\n' +
      '1. Registrate en la app web\n' +
      '2. Suscribete a un plan\n' +
      '3. Obtiene tu token de acceso\n' +
      '4. Usa `/vincular TU_TOKEN` aqui\n\n' +
      'O usa `/suscribir` para ver los planes.',
      { parse_mode: 'Markdown' }
    );
  }

  const subscription = await Subscription.findActiveByUser(user.id);
  if (!subscription) {
    return ctx.reply(
      'Tu suscripcion ha expirado o fue cancelada.\n' +
      'Usa `/suscribir` para renovar tu acceso.',
      { parse_mode: 'Markdown' }
    );
  }

  ctx.state.user = user;
  ctx.state.subscription = subscription;
  return next();
}

module.exports = { botAuth };
