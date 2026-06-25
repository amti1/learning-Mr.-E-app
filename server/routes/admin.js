import { Router } from 'express';
import { getDb } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/admin/stats
router.get('/stats', authenticate, requireRole('admin', 'teacher'), (req, res, next) => {
  try {
    const db = getDb();
    res.json({
      totalUsers: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
      totalWords: db.prepare('SELECT COUNT(*) as c FROM words').get().c,
      totalLessons: db.prepare('SELECT COUNT(*) as c FROM lessons').get().c,
      totalCategories: db.prepare('SELECT COUNT(*) as c FROM categories').get().c,
      totalSessions: db.prepare('SELECT COUNT(*) as c FROM practice_sessions').get().c,
      totalReviews: db.prepare('SELECT COUNT(*) as c FROM review_log').get().c,
    });
  } catch (err) { next(err); }
});

// GET /api/admin/users
router.get('/users', authenticate, requireRole('admin'), (req, res, next) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.id, u.username, u.email, u.display_name, u.role, u.created_at,
        g.xp, g.level, g.current_streak
      FROM users u LEFT JOIN user_gamification g ON u.id = g.user_id
      ORDER BY u.created_at DESC
    `).all();
    res.json({ users });
  } catch (err) { next(err); }
});

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', authenticate, requireRole('admin'), (req, res, next) => {
  try {
    const db = getDb();
    const { role } = req.body;
    if (!['student', 'teacher', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
    res.json({ message: 'Role updated' });
  } catch (err) { next(err); }
});

export default router;
