require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const meditationRoutes = require('./routes/meditations');
const progressionRoutes = require('./routes/progression');
const adminRoutes = require('./routes/admin');
const { startBot } = require('./bot');
const { startNotificationScheduler } = require('./services/notification');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing - raw for webhooks, json for everything else
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/meditations', meditationRoutes);
app.use('/api/progression', progressionRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`MindReprogram API running on port ${PORT}`);

  // Start Telegram bot (skip if token is not configured)
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'pendiente') {
    try {
      startBot();
      console.log('Telegram bot started.');
    } catch (err) {
      console.error('Failed to start Telegram bot:', err.message);
    }
  } else {
    console.log('Telegram bot skipped (token not configured).');
  }

  // Start notification scheduler
  startNotificationScheduler();
  console.log('Notification scheduler started.');
});

module.exports = app;
