const express = require('express');
const router = express.Router();
const Meditation = require('../models/Meditation');
const Progression = require('../models/Progression');
const StorageService = require('../services/storage');
const { authenticate, requireSubscription } = require('../middleware/auth');

// GET /api/meditations - List available meditations for user
router.get('/', authenticate, requireSubscription(), async (req, res, next) => {
  try {
    const { category, limit = 20, offset = 0 } = req.query;
    const progression = await Progression.findByUser(req.user.sub);

    const filters = {
      level: progression?.current_level || 1,
      tier: req.subscription.tier,
      limit: parseInt(limit),
      offset: parseInt(offset),
    };

    let meditations;
    if (category) {
      // Check if user has this category unlocked
      if (progression && !progression.categories_unlocked.includes(category)) {
        return res.status(403).json({
          error: 'Categoria no desbloqueada',
          unlockedCategories: progression.categories_unlocked,
        });
      }
      meditations = await Meditation.findByCategory(category, filters);
    } else {
      meditations = await Meditation.getAll({
        limit: filters.limit,
        offset: filters.offset,
        category: null,
      });
    }

    res.json({
      meditations: meditations.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        category: m.category,
        durationMinutes: m.duration_minutes,
        unlockLevel: m.unlock_level,
        neuralTarget: m.neural_target,
        tags: m.tags,
        avgRating: parseFloat(m.avg_rating),
        isAccessible: m.unlock_level <= (progression?.current_level || 1),
      })),
      userLevel: progression?.current_level || 1,
      categoriesUnlocked: progression?.categories_unlocked || [],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/meditations/recommend - Get AI-recommended meditations
router.get('/recommend', authenticate, requireSubscription(), async (req, res, next) => {
  try {
    const progression = await Progression.findByUser(req.user.sub);
    if (!progression) {
      return res.status(404).json({ error: 'Completa el onboarding primero' });
    }

    const recommended = await Meditation.recommend({
      categories: progression.categories_unlocked,
      level: progression.current_level,
      tier: req.subscription.tier,
    });

    res.json({
      recommended: recommended.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        category: m.category,
        durationMinutes: m.duration_minutes,
        neuralTarget: m.neural_target,
      })),
      currentLevel: progression.current_level,
      suggestedDuration: Progression.getLevelDuration(progression.current_level),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/meditations/:id/stream - Get streaming URL
router.get('/:id/stream', authenticate, requireSubscription(), async (req, res, next) => {
  try {
    const meditation = await Meditation.findById(req.params.id);
    if (!meditation) {
      return res.status(404).json({ error: 'Meditacion no encontrada' });
    }

    // Check level access
    const progression = await Progression.findByUser(req.user.sub);
    if (meditation.unlock_level > (progression?.current_level || 1)) {
      return res.status(403).json({
        error: 'Nivel insuficiente para esta meditacion',
        requiredLevel: meditation.unlock_level,
        currentLevel: progression?.current_level || 1,
      });
    }

    // Check tier access
    const tierMap = { basic: 1, premium: 2, pro: 3 };
    if (tierMap[meditation.min_tier] > tierMap[req.subscription.tier]) {
      return res.status(403).json({
        error: `Requiere suscripcion ${meditation.min_tier}`,
        currentTier: req.subscription.tier,
      });
    }

    const streamUrl = await StorageService.getStreamUrl(meditation.audio_s3_key);
    await Meditation.incrementListenCount(meditation.id);

    res.json({
      streamUrl,
      expiresIn: 900, // 15 minutes
      meditation: {
        id: meditation.id,
        title: meditation.title,
        durationMinutes: meditation.duration_minutes,
        binauralFrequency: meditation.binaural_frequency,
        neuralTarget: meditation.neural_target,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/meditations/:id/complete - Record completed session
router.post('/:id/complete', authenticate, requireSubscription(), async (req, res, next) => {
  try {
    const { durationListened, moodBefore, moodAfter, rating } = req.body;

    const meditation = await Meditation.findById(req.params.id);
    if (!meditation) {
      return res.status(404).json({ error: 'Meditacion no encontrada' });
    }

    const completed = durationListened >= (meditation.duration_minutes * 60 * 0.8); // 80% = completed

    const result = await Progression.recordSession(req.user.sub, meditation.id, {
      durationListened,
      moodBefore,
      moodAfter,
      rating,
      completed,
    });

    const response = {
      completed,
      durationListened,
      moodImprovement: moodAfter && moodBefore ? moodAfter - moodBefore : null,
    };

    if (result.leveledUp) {
      response.levelUp = {
        message: `Felicidades! Has avanzado al nivel ${result.progression.current_level}`,
        newLevel: result.progression.current_level,
        newDuration: result.currentDuration,
      };
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// GET /api/meditations/categories
router.get('/categories', authenticate, async (req, res) => {
  const categories = [
    { id: 'adhd', name: 'ADHD', description: 'Enfoque, regulacion dopaminergica, atencion plena', icon: '🧠' },
    { id: 'depression', name: 'Depresion', description: 'Liberacion serotoninica, auto-compasion', icon: '🌅' },
    { id: 'anxiety', name: 'Ansiedad', description: 'Regulacion vagal, respiracion 4-7-8, grounding', icon: '🌊' },
    { id: 'trauma', name: 'Trauma', description: 'Somatic experiencing, ventana de tolerancia', icon: '🛡️' },
    { id: 'sleep', name: 'Sueno', description: 'Descanso delta, hipnosis para insomnio', icon: '🌙' },
    { id: 'focus', name: 'Enfoque', description: 'Estado de flujo, concentracion profunda', icon: '🎯' },
    { id: 'self_compassion', name: 'Auto-Compasion', description: 'Amor propio, aceptacion', icon: '💜' },
    { id: 'anger', name: 'Manejo de Ira', description: 'Regulacion emocional, calma interior', icon: '🔥' },
  ];
  res.json({ categories });
});

module.exports = router;
