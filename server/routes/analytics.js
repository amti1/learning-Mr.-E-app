import { Router } from 'express';
import { getDb } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { getUserErrorReport, getConfusionMatrix, getWeaknessProfile } from '../services/errorAnalysis.js';

const router = Router();

// GET /api/analytics/dashboard
router.get('/dashboard', authenticate, (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const totalWords = db.prepare('SELECT COUNT(*) as c FROM words').get().c;
    const progress = db.prepare('SELECT COUNT(*) as reviewed, SUM(CASE WHEN mastery_score >= 0.8 THEN 1 ELSE 0 END) as mastered, SUM(CASE WHEN weakness_score > 0.3 THEN 1 ELSE 0 END) as weak FROM user_word_progress WHERE user_id = ?').get(userId);
    const dueCount = db.prepare(`SELECT COUNT(*) as c FROM user_word_progress WHERE user_id = ? AND next_review_at <= datetime('now')`).get(userId).c;
    const gamification = db.prepare('SELECT * FROM user_gamification WHERE user_id = ?').get(userId) || { xp: 0, level: 1, current_streak: 0, daily_progress: 0, daily_goal: 20, weekly_progress: 0, weekly_goal: 100 };
    const recentSessions = db.prepare('SELECT * FROM practice_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 5').all(userId);
    const totalCorrect = db.prepare('SELECT COUNT(*) as c FROM review_log WHERE user_id = ? AND was_correct = 1').get(userId).c;
    const totalAnswered = db.prepare('SELECT COUNT(*) as c FROM review_log WHERE user_id = ?').get(userId).c;
    const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    res.json({
      totalWords,
      reviewedWords: progress.reviewed || 0,
      masteredWords: progress.mastered || 0,
      weakWords: progress.weak || 0,
      dueForReview: dueCount,
      accuracy,
      totalAnswered,
      gamification,
      recentSessions,
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/progress
router.get('/progress', authenticate, (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;

    const dailyStats = db.prepare(`
      SELECT DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct,
        ROUND(AVG(response_time_ms)) as avg_time
      FROM review_log WHERE user_id = ? AND created_at >= datetime('now', '-${days} days')
      GROUP BY DATE(created_at) ORDER BY date
    `).all(userId);

    res.json({ dailyStats, days });
  } catch (err) { next(err); }
});

// GET /api/analytics/weak-areas
router.get('/weak-areas', authenticate, (req, res, next) => {
  try {
    const report = getUserErrorReport(req.user.id);
    res.json(report);
  } catch (err) { next(err); }
});

// GET /api/analytics/confusion-matrix
router.get('/confusion-matrix', authenticate, (req, res, next) => {
  try {
    const { lesson_id } = req.query;
    const matrix = getConfusionMatrix(req.user.id, lesson_id ? parseInt(lesson_id) : null);
    res.json(matrix);
  } catch (err) { next(err); }
});

// GET /api/analytics/lesson-mastery
router.get('/lesson-mastery', authenticate, (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const lessons = db.prepare(`
      SELECT l.id, l.name, l.name_ar, c.name as category_name,
        COUNT(w.id) as total_words,
        COALESCE(AVG(uwp.mastery_score), 0) as avg_mastery,
        COALESCE(AVG(uwp.weakness_score), 0) as avg_weakness,
        SUM(CASE WHEN uwp.mastery_score >= 0.8 THEN 1 ELSE 0 END) as mastered_count
      FROM lessons l
      JOIN units u ON l.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      LEFT JOIN words w ON w.lesson_id = l.id
      LEFT JOIN user_word_progress uwp ON uwp.word_id = w.id AND uwp.user_id = ?
      GROUP BY l.id ORDER BY c.sort_order, u.sort_order, l.sort_order
    `).all(userId);

    res.json({ lessons });
  } catch (err) { next(err); }
});

// GET /api/analytics/report
router.get('/report', authenticate, (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const errorReport = getUserErrorReport(userId);
    const weaknessProfile = getWeaknessProfile(userId);
    const gamification = db.prepare('SELECT * FROM user_gamification WHERE user_id = ?').get(userId);

    const sessions = db.prepare(`
      SELECT COUNT(*) as total, SUM(correct_count) as correct, SUM(wrong_count) as wrong,
        ROUND(AVG(avg_response_time)) as avg_time, SUM(xp_earned) as total_xp
      FROM practice_sessions WHERE user_id = ? AND completed_at IS NOT NULL
    `).get(userId);

    res.json({ errorReport, weaknessProfile, gamification, sessionStats: sessions });
  } catch (err) { next(err); }
});

export default router;
