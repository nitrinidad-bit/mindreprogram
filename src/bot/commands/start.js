const User = require('../../models/User');

module.exports = async (ctx) => {
  const chatId = ctx.chat.id;
  const user = await User.findByTelegramChatId(chatId);

  if (user) {
    return ctx.reply(
      `Bienvenido de vuelta, *${user.full_name}*! 🧠\n\n` +
      'Tu cuenta ya esta vinculada.\n' +
      'Usa /meditar para comenzar tu sesion diaria.\n' +
      'Usa /progreso para ver tus estadisticas.',
      { parse_mode: 'Markdown' }
    );
  }

  ctx.reply(
    '🧠 *Bienvenido a MindReprogram*\n\n' +
    'Soy tu guia para reprogramar el subconsciente a traves de meditaciones terapeuticas personalizadas.\n\n' +
    '*Como empezar:*\n' +
    '1️⃣ Registrate en nuestra app web\n' +
    '2️⃣ Elige tu plan de suscripcion\n' +
    '3️⃣ Genera tu token de acceso\n' +
    '4️⃣ Vincula aqui con `/vincular TU_TOKEN`\n\n' +
    '*Que ofrecemos:*\n' +
    '• Meditaciones guiadas por categoria (ADHD, ansiedad, depresion, sueno...)\n' +
    '• Progresion gradual de 5 min a 1 hora\n' +
    '• Frecuencias binaurales para neuroplasticidad\n' +
    '• Seguimiento de tu estado emocional\n\n' +
    '_Tu mente tiene el poder de transformarse. Comienza hoy._',
    { parse_mode: 'Markdown' }
  );
};
