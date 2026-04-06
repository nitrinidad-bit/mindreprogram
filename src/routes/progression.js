const express = require('express');
const router = express.Router();
const Progression = require('../models/Progression');
const { authenticate, requireSubscription } = require('../middleware/auth');

// GET /api/progression - Get user's full progression stats
router.get('/', authenticate, requireSubscription(), async (req, res, next) => {
  try {
    const stats = await Progression.getStats(req.user.sub);

    res.json({
      ...stats,
      levelMap: {
        1: { duration: 5, name: 'Despertar' },
        2: { duration: 8, name: 'Semilla' },
        3: { duration: 10, name: 'Raiz' },
        4: { duration: 15, name: 'Brote' },
        5: { duration: 15, name: 'Tallo' },
        6: { duration: 15, name: 'Flor' },
        7: { duration: 25, name: 'Fruto' },
        8: { duration: 25, name: 'Arbol' },
        9: { duration: 25, name: 'Bosque' },
        10: { duration: 40, name: 'Montana' },
        11: { duration: 40, name: 'Cielo' },
        12: { duration: 60, name: 'Cosmos' },
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/progression/assessment - Submit periodic assessment
router.post('/assessment', authenticate, async (req, res, next) => {
  try {
    const { type, answers } = req.body;

    if (!['PHQ9', 'GAD7', 'ASRS'].includes(type)) {
      return res.status(400).json({ error: 'Tipo de evaluacion invalido' });
    }
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: 'Respuestas deben ser un array' });
    }

    const score = answers.reduce((sum, a) => sum + a, 0);

    // Determine recommended categories
    let categories = [];
    let severity = 'minimal';

    if (type === 'PHQ9') {
      if (score >= 20) { severity = 'severe'; categories = ['depression', 'self_compassion', 'sleep']; }
      else if (score >= 15) { severity = 'moderately_severe'; categories = ['depression', 'self_compassion']; }
      else if (score >= 10) { severity = 'moderate'; categories = ['depression']; }
      else if (score >= 5) { severity = 'mild'; categories = ['depression']; }
    } else if (type === 'GAD7') {
      if (score >= 15) { severity = 'severe'; categories = ['anxiety', 'sleep', 'trauma']; }
      else if (score >= 10) { severity = 'moderate'; categories = ['anxiety', 'sleep']; }
      else if (score >= 5) { severity = 'mild'; categories = ['anxiety']; }
    } else if (type === 'ASRS') {
      if (score >= 14) { severity = 'likely_adhd'; categories = ['adhd', 'focus']; }
    }

    const { query } = require('../config/database');
    await query(
      `INSERT INTO assessments (user_id, assessment_type, score, answers, recommended_categories)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.sub, type, score, JSON.stringify(answers), categories]
    );

    // Unlock recommended categories
    for (const cat of categories) {
      await Progression.unlockCategory(req.user.sub, cat);
    }

    res.json({
      type,
      score,
      severity,
      recommendedCategories: categories,
      message: categories.length > 0
        ? `Se han desbloqueado las categorias: ${categories.join(', ')}`
        : 'Tu evaluacion no sugiere categorias adicionales en este momento.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
