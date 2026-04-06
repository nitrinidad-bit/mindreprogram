const { query, getClient } = require('../config/database');

const LEVEL_DURATIONS = {
  1: 5, 2: 8, 3: 10, 4: 15, 5: 15, 6: 15,
  7: 25, 8: 25, 9: 25, 10: 40, 11: 40, 12: 60,
};

// Sessions needed to level up (consistency-based)
const SESSIONS_TO_LEVEL_UP = {
  1: 3, 2: 4, 3: 5, 4: 5, 5: 6, 6: 7,
  7: 7, 8: 8, 9: 9, 10: 10, 11: 12, 12: Infinity,
};

const Progression = {
  async findByUser(userId) {
    const result = await query(
      'SELECT * FROM user_progression WHERE user_id = $1',
      [userId]
    );
    return result.rows[0];
  },

  async initForUser(userId) {
    const result = await query(
      `INSERT INTO user_progression (user_id, categories_unlocked)
       VALUES ($1, '{adhd}')
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [userId]
    );
    return result.rows[0];
  },

  async recordSession(userId, meditationId, { durationListened, moodBefore, moodAfter, rating, completed }) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Record the session
      await client.query(
        `INSERT INTO meditation_sessions
          (user_id, meditation_id, duration_listened, completed, mood_before, mood_after, rating, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $4 THEN NOW() ELSE NULL END)`,
        [userId, meditationId, durationListened, completed, moodBefore, moodAfter, rating]
      );

      if (!completed) {
        await client.query('COMMIT');
        return { leveledUp: false };
      }

      // Update progression
      const durationMinutes = Math.floor(durationListened / 60);
      const prog = await client.query(
        `UPDATE user_progression SET
          total_minutes = total_minutes + $2,
          total_sessions = total_sessions + 1,
          last_session_at = NOW(),
          streak_days = CASE
            WHEN last_session_at::date = CURRENT_DATE - INTERVAL '1 day' THEN streak_days + 1
            WHEN last_session_at::date = CURRENT_DATE THEN streak_days
            ELSE 1
          END,
          longest_streak = GREATEST(longest_streak, CASE
            WHEN last_session_at::date = CURRENT_DATE - INTERVAL '1 day' THEN streak_days + 1
            ELSE streak_days
          END)
         WHERE user_id = $1
         RETURNING *`,
        [userId, durationMinutes]
      );

      const progression = prog.rows[0];

      // Check for level up
      let leveledUp = false;
      const sessionsNeeded = SESSIONS_TO_LEVEL_UP[progression.current_level];
      const sessionsAtLevel = await client.query(
        `SELECT COUNT(*) as count FROM meditation_sessions
         WHERE user_id = $1 AND completed = TRUE
         AND started_at > (
           SELECT COALESCE(next_level_unlocks_at, created_at)
           FROM user_progression WHERE user_id = $1
         )`,
        [userId]
      );

      if (parseInt(sessionsAtLevel.rows[0].count) >= sessionsNeeded && progression.current_level < 12) {
        const newLevel = progression.current_level + 1;
        await client.query(
          `UPDATE user_progression SET
            current_level = $2,
            next_level_unlocks_at = NOW(),
            consistency_score = LEAST(1.0, consistency_score + 0.05)
           WHERE user_id = $1`,
          [userId, newLevel]
        );
        leveledUp = true;
        progression.current_level = newLevel;
      }

      // Update consistency score
      const recentDays = await client.query(
        `SELECT COUNT(DISTINCT started_at::date) as active_days
         FROM meditation_sessions
         WHERE user_id = $1 AND started_at > NOW() - INTERVAL '30 days'`,
        [userId]
      );
      const consistency = Math.min(1.0, parseInt(recentDays.rows[0].active_days) / 30);
      await client.query(
        'UPDATE user_progression SET consistency_score = $2 WHERE user_id = $1',
        [userId, consistency]
      );

      await client.query('COMMIT');

      return {
        leveledUp,
        progression: { ...progression, consistency_score: consistency },
        currentDuration: LEVEL_DURATIONS[progression.current_level],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getStats(userId) {
    const [progression, recentSessions, moodTrend] = await Promise.all([
      query('SELECT * FROM user_progression WHERE user_id = $1', [userId]),
      query(
        `SELECT ms.*, m.title, m.category
         FROM meditation_sessions ms
         JOIN meditations m ON ms.meditation_id = m.id
         WHERE ms.user_id = $1
         ORDER BY ms.started_at DESC LIMIT 10`,
        [userId]
      ),
      query(
        `SELECT DATE(started_at) as date,
                AVG(mood_before) as avg_mood_before,
                AVG(mood_after) as avg_mood_after
         FROM meditation_sessions
         WHERE user_id = $1 AND mood_before IS NOT NULL AND mood_after IS NOT NULL
         GROUP BY DATE(started_at)
         ORDER BY date DESC LIMIT 30`,
        [userId]
      ),
    ]);

    const prog = progression.rows[0];
    return {
      level: prog?.current_level || 1,
      totalMinutes: prog?.total_minutes || 0,
      totalSessions: prog?.total_sessions || 0,
      streakDays: prog?.streak_days || 0,
      longestStreak: prog?.longest_streak || 0,
      consistencyScore: parseFloat(prog?.consistency_score || 0),
      currentDuration: LEVEL_DURATIONS[prog?.current_level || 1],
      nextDuration: LEVEL_DURATIONS[Math.min(12, (prog?.current_level || 1) + 1)],
      categoriesUnlocked: prog?.categories_unlocked || ['adhd'],
      recentSessions: recentSessions.rows,
      moodTrend: moodTrend.rows,
    };
  },

  async unlockCategory(userId, category) {
    const result = await query(
      `UPDATE user_progression
       SET categories_unlocked = array_append(categories_unlocked, $2)
       WHERE user_id = $1 AND NOT ($2 = ANY(categories_unlocked))
       RETURNING *`,
      [userId, category]
    );
    return result.rows[0];
  },

  getLevelDuration(level) {
    return LEVEL_DURATIONS[level] || 5;
  },
};

module.exports = Progression;
