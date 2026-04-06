const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Progression = require('../models/Progression');
const TokenService = require('../services/token');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Email, password y nombre son requeridos' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'El email ya esta registrado' });
    }

    const user = await User.create({ email, password, fullName });

    // Create trial subscription
    const sub = await Subscription.create({
      userId: user.id,
      tier: 'basic',
      provider: null,
      providerSubId: null,
      providerCustomerId: null,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3-day trial
    });
    await Subscription.updateStatus(sub.id, 'trial');

    // Initialize progression
    await Progression.initForUser(user.id);

    const accessToken = TokenService.generateAccessToken(user, sub);
    const refreshToken = TokenService.generateRefreshToken(user);

    res.status(201).json({
      message: 'Cuenta creada exitosamente. Tienes 3 dias de prueba gratis.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
      accessToken,
      refreshToken,
      trial: {
        endsAt: sub.trial_ends_at || sub.current_period_end,
        tier: 'basic',
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y password son requeridos' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    const valid = await User.verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    const sub = await Subscription.findActiveByUser(user.id);
    const accessToken = TokenService.generateAccessToken(user, sub);
    const refreshToken = TokenService.generateRefreshToken(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        isAdmin: user.is_admin,
        telegramLinked: !!user.telegram_chat_id,
      },
      subscription: sub ? {
        tier: sub.tier,
        status: sub.status,
        expiresAt: sub.current_period_end,
      } : null,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token requerido' });
    }

    const decoded = TokenService.verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const sub = await Subscription.findActiveByUser(user.id);
    const newAccessToken = TokenService.generateAccessToken(user, sub);

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    return res.status(401).json({ error: 'Refresh token invalido' });
  }
});

// POST /api/auth/onboarding
router.post('/onboarding', authenticate, async (req, res, next) => {
  try {
    const { timezone, preferredVoice, assessmentType, assessmentAnswers } = req.body;

    const user = await User.updateOnboarding(req.user.sub, {
      timezone: timezone || 'America/Puerto_Rico',
      preferredVoice: preferredVoice || 'calm_female',
    });

    // Save assessment if provided
    if (assessmentType && assessmentAnswers) {
      const { query } = require('../config/database');
      const score = assessmentAnswers.reduce((sum, a) => sum + a, 0);

      // Recommend categories based on assessment
      let categories = [];
      if (assessmentType === 'ASRS' && score >= 14) categories.push('adhd', 'focus');
      if (assessmentType === 'PHQ9' && score >= 10) categories.push('depression', 'self_compassion');
      if (assessmentType === 'GAD7' && score >= 10) categories.push('anxiety', 'sleep');

      await query(
        `INSERT INTO assessments (user_id, assessment_type, score, answers, recommended_categories)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.sub, assessmentType, score, JSON.stringify(assessmentAnswers), categories]
      );

      // Unlock recommended categories
      for (const cat of categories) {
        await Progression.unlockCategory(req.user.sub, cat);
      }
    }

    res.json({
      message: 'Onboarding completado',
      user: {
        id: user.id,
        timezone: user.timezone,
        preferredVoice: user.preferred_voice,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    const sub = await Subscription.findActiveByUser(req.user.sub);
    const progression = await Progression.findByUser(req.user.sub);

    res.json({
      user,
      subscription: sub,
      progression,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/generate-bot-token - Generate a token for Telegram linking
router.post('/generate-bot-token', authenticate, async (req, res, next) => {
  try {
    const sub = await Subscription.findActiveByUser(req.user.sub);
    if (!sub) {
      return res.status(403).json({ error: 'Suscripcion activa requerida' });
    }

    const progression = await Progression.findByUser(req.user.sub);
    const botToken = await TokenService.generateBotToken(
      req.user.sub,
      sub.tier,
      progression?.categories_unlocked || ['adhd'],
      progression?.current_level || 1
    );

    res.json({
      botToken,
      instructions: 'Envia este mensaje a @TU_BOT en Telegram:',
      command: `/vincular ${botToken}`,
      expiresIn: '30 dias',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
