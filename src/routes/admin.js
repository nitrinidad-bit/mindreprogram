const express = require('express');
const router = express.Router();
const Meditation = require('../models/Meditation');
const StorageService = require('../services/storage');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { query } = require('../config/database');

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(requireAdmin);

// GET /api/admin/dashboard - Admin overview
router.get('/dashboard', async (req, res, next) => {
  try {
    const [users, subs, sessions, meditations] = await Promise.all([
      query('SELECT COUNT(*) as total FROM users'),
      query(`SELECT tier, status, COUNT(*) as count FROM subscriptions GROUP BY tier, status`),
      query(`SELECT COUNT(*) as total, SUM(duration_listened) as total_seconds
             FROM meditation_sessions WHERE started_at > NOW() - INTERVAL '30 days'`),
      query('SELECT COUNT(*) as total FROM meditations WHERE is_active = TRUE'),
    ]);

    res.json({
      totalUsers: parseInt(users.rows[0].total),
      subscriptions: subs.rows,
      last30Days: {
        totalSessions: parseInt(sessions.rows[0].total),
        totalHours: Math.round((parseInt(sessions.rows[0].total_seconds) || 0) / 3600),
      },
      totalMeditations: parseInt(meditations.rows[0].total),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/meditations - Create new meditation
router.post('/meditations', async (req, res, next) => {
  try {
    const {
      title, description, category, durationMinutes,
      unlockLevel, minTier, filename, binauralFrequency,
      neuralTarget, tags, script, publishNow,
    } = req.body;

    if (!title || !category || !durationMinutes) {
      return res.status(400).json({ error: 'Campos requeridos: title, category, durationMinutes' });
    }

    // For Google Drive mode: admin sends audioUrl (Drive link) directly
    // For S3 mode: admin sends filename, we generate upload URL
    let audioS3Key;
    let uploadUrl = null;

    if (process.env.STORAGE_MODE === 'gdrive') {
      if (!req.body.audioUrl) {
        return res.status(400).json({
          error: 'En modo Google Drive, envia audioUrl con el link de Drive',
          example: 'https://drive.google.com/uc?id=TU_FILE_ID&export=download',
        });
      }
      audioS3Key = req.body.audioUrl;
    } else {
      if (!filename) {
        return res.status(400).json({ error: 'filename es requerido en modo S3' });
      }
      audioS3Key = StorageService.generateKey(category, filename);
      uploadUrl = await StorageService.getUploadUrl(audioS3Key);
    }

    const meditation = await Meditation.create({
      title,
      description,
      category,
      durationMinutes,
      unlockLevel: unlockLevel || 1,
      minTier: minTier || 'basic',
      audioS3Key,
      thumbnailS3Key: null,
      binauralFrequency,
      neuralTarget: neuralTarget || 'alpha',
      tags: tags || [],
      script,
      createdBy: req.user.sub,
      publishNow: publishNow || false,
    });

    const response = {
      message: 'Meditacion creada exitosamente.',
      meditation,
    };

    if (uploadUrl) {
      response.uploadUrl = uploadUrl;
      response.uploadInstructions = 'PUT request al uploadUrl con el archivo MP3 como body y Content-Type: audio/mpeg';
    }

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/meditations/:id - Update meditation
router.put('/meditations/:id', async (req, res, next) => {
  try {
    const meditation = await Meditation.update(req.params.id, req.body);
    if (!meditation) {
      return res.status(404).json({ error: 'Meditacion no encontrada' });
    }
    res.json({ meditation });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/meditations/:id/publish - Publish meditation
router.post('/meditations/:id/publish', async (req, res, next) => {
  try {
    const meditation = await Meditation.publish(req.params.id);
    if (!meditation) {
      return res.status(404).json({ error: 'Meditacion no encontrada' });
    }

    res.json({
      message: 'Meditacion publicada. Las notificaciones se enviaran automaticamente.',
      meditation,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/meditations - List all meditations (including inactive)
router.get('/meditations', async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, category } = req.query;
    const meditations = await Meditation.getAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      category,
      activeOnly: false,
    });
    res.json({ meditations });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users - List users with subscription info
router.get('/users', async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.telegram_username, u.created_at,
              s.tier, s.status as sub_status,
              p.current_level, p.total_sessions, p.streak_days
       FROM users u
       LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status IN ('active', 'trial')
       LEFT JOIN user_progression p ON u.id = p.user_id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), parseInt(offset)]
    );
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
