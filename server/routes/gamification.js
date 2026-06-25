import { Router } from 'express';
import { getDb } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { getLevelForXP, getXPForLevel, checkAchievements, updateStreak } from '../services/gamificationEngine.js';

const router = Router();

// GET /api/gamification/status
router.get('/status', authenticate, (req, res, next) => {
  try {
    const db = getDb();
    const gam = db.prepare('SELECT * FROM user_gamification WHERE user_id = ?').get(req.user.id);
    if (!gam) return res.json({ xp: 0, level: 1, current_streak: 0, daily_progress: 0, daily_goal: 20 });

    const nextLevelXP = getXPForLevel(gam.level + 1);
    const currentLevelXP = getXPForLevel(gam.level);

    res.json({
      ...gam,
      xpToNextLevel: nextLevelXP - gam.xp,
      xpInCurrentLevel: gam.xp - currentLevelXP,
      xpNeededForLevel: nextLevelXP - currentLevelXP,
      progressPercent: Math.round(((gam.xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100),
    });
  } catch (err) { next(err); }
});

// GET /api/gamification/achievements
router.get('/achievements', authenticate, (req, res, next) => {
  try {
    const db = getDb();
    const achievements = db.prepare(`
      SELECT a.*, ua.unlocked_at
      FROM achievements a
      LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
      ORDER BY a.category, a.requirement_value
    `).all(req.user.id);

    const unlocked = achievements.filter(a => a.unlocked_at);
    const locked = achievements.filter(a => !a.unlocked_at);

    res.json({ achievements, unlockedCount: unlocked.length, totalCount: achievements.length });
  } catch (err) { next(err); }
});

// POST /api/gamification/daily-check
router.post('/daily-check', authenticate, (req, res, next) => {
  try {
    const streakResult = updateStreak(req.user.id);
    const newAchievements = checkAchievements(req.user.id);
    res.json({ ...streakResult, newAchievements });
  } catch (err) { next(err); }
});

export default router;
