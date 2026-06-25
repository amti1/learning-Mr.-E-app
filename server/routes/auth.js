import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../config/database.js';
import { authenticate, JWT_SECRET } from '../middleware/auth.js';

const router = Router();

/**
 * POST /register - Create a new user
 */
router.post('/register', (req, res) => {
  try {
    const { username, email, password, display_name } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = getDb();

    // Check if username/email already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR (email = ? AND email IS NOT NULL)').get(username, email || null);
    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const password_hash = bcrypt.hashSync(password, 10);

    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, display_name, role)
      VALUES (?, ?, ?, ?, 'student')
    `).run(username, email || null, password_hash, display_name || username);

    const userId = result.lastInsertRowid;

    // Create gamification row
    db.prepare('INSERT INTO user_gamification (user_id) VALUES (?)').run(userId);

    // Generate JWT
    const token = jwt.sign({ userId, username, role: 'student' }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      token,
      user: {
        id: userId,
        username,
        email: email || null,
        display_name: display_name || username,
        role: 'student',
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /login - Authenticate user
 */
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        settings: user.settings ? JSON.parse(user.settings) : {},
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /profile - Get current user profile
 */
router.get('/profile', authenticate, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, email, display_name, role, settings, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const gamification = db.prepare('SELECT * FROM user_gamification WHERE user_id = ?').get(user.id);

    res.json({
      ...user,
      settings: user.settings ? JSON.parse(user.settings) : {},
      gamification: gamification || null,
    });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * PUT /profile - Update profile
 */
router.put('/profile', authenticate, (req, res) => {
  try {
    const { display_name, settings, daily_goal } = req.body;
    const db = getDb();

    if (display_name !== undefined) {
      db.prepare('UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(display_name, req.user.id);
    }

    if (settings !== undefined) {
      const settingsStr = typeof settings === 'string' ? settings : JSON.stringify(settings);
      db.prepare('UPDATE users SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(settingsStr, req.user.id);
    }

    if (daily_goal !== undefined) {
      const goal = parseInt(daily_goal, 10);
      if (goal > 0) {
        db.prepare('UPDATE user_gamification SET daily_goal = ? WHERE user_id = ?')
          .run(goal, req.user.id);
      }
    }

    const updatedUser = db.prepare(
      'SELECT id, username, email, display_name, role, settings FROM users WHERE id = ?'
    ).get(req.user.id);

    res.json({
      ...updatedUser,
      settings: updatedUser.settings ? JSON.parse(updatedUser.settings) : {},
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
