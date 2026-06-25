import { Router } from 'express';
import { getDb } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { getDueReviews, getWeakWords } from '../services/memoryEngine.js';

const router = Router();

// GET /api/review/due - Get due review items
router.get('/due', authenticate, (req, res, next) => {
  try {
    const { limit = 30 } = req.query;
    const dueWords = getDueReviews(req.user.id, parseInt(limit));
    res.json({ words: dueWords, count: dueWords.length });
  } catch (err) { next(err); }
});

// GET /api/review/weak-words - Get weakest words
router.get('/weak-words', authenticate, (req, res, next) => {
  try {
    const { limit = 20 } = req.query;
    const weak = getWeakWords(req.user.id, parseInt(limit));
    res.json({ words: weak, count: weak.length });
  } catch (err) { next(err); }
});

// GET /api/review/stats - Get review statistics
router.get('/stats', authenticate, (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const totalReviewed = db.prepare('SELECT COUNT(DISTINCT word_id) as count FROM user_word_progress WHERE user_id = ? AND total_attempts > 0').get(userId);
    const dueCount = db.prepare(`SELECT COUNT(*) as count FROM user_word_progress WHERE user_id = ? AND (next_review_at IS NULL OR next_review_at <= datetime('now'))`).get(userId);
    const masteredCount = db.prepare('SELECT COUNT(*) as count FROM user_word_progress WHERE user_id = ? AND mastery_score >= 0.8').get(userId);
    const weakCount = db.prepare('SELECT COUNT(*) as count FROM user_word_progress WHERE user_id = ? AND weakness_score > 0.3').get(userId);
    const totalWords = db.prepare('SELECT COUNT(*) as count FROM words').get();

    res.json({
      totalReviewed: totalReviewed.count,
      dueForReview: dueCount.count,
      mastered: masteredCount.count,
      weak: weakCount.count,
      totalWords: totalWords.count,
      unseenWords: totalWords.count - totalReviewed.count,
    });
  } catch (err) { next(err); }
});

export default router;
