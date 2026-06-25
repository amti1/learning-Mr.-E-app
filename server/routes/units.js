import { Router } from 'express';
import { getDb } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET / - List all units (optional filter by category_id)
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { category_id } = req.query;

    let query = `
      SELECT u.*,
        c.name AS category_name, c.name_ar AS category_name_ar,
        (SELECT COUNT(*) FROM lessons l WHERE l.unit_id = u.id) AS lesson_count,
        (SELECT COUNT(*) FROM words w JOIN lessons l ON w.lesson_id = l.id WHERE l.unit_id = u.id) AS word_count
      FROM units u
      JOIN categories c ON u.category_id = c.id
    `;
    const params = [];

    if (category_id) {
      query += ' WHERE u.category_id = ?';
      params.push(category_id);
    }

    query += ' ORDER BY u.sort_order, u.id';

    const units = db.prepare(query).all(...params);
    res.json(units);
  } catch (err) {
    console.error('List units error:', err);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

/**
 * POST / - Create unit (admin/teacher only)
 */
router.post('/', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  try {
    const { category_id, name, name_ar, description, sort_order } = req.body;

    if (!category_id || !name) {
      return res.status(400).json({ error: 'category_id and name are required' });
    }

    const db = getDb();

    // Verify category exists
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const result = db.prepare(`
      INSERT INTO units (category_id, name, name_ar, description, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(category_id, name, name_ar || null, description || null, sort_order || 0);

    const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(unit);
  } catch (err) {
    console.error('Create unit error:', err);
    res.status(500).json({ error: 'Failed to create unit' });
  }
});

/**
 * GET /:id - Get unit with lessons
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();

    const unit = db.prepare(`
      SELECT u.*, c.name AS category_name, c.name_ar AS category_name_ar
      FROM units u
      JOIN categories c ON u.category_id = c.id
      WHERE u.id = ?
    `).get(req.params.id);

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const lessons = db.prepare(`
      SELECT l.*,
        (SELECT COUNT(*) FROM words w WHERE w.lesson_id = l.id) AS word_count
      FROM lessons l
      WHERE l.unit_id = ?
      ORDER BY l.sort_order, l.id
    `).all(unit.id);

    res.json({ ...unit, lessons });
  } catch (err) {
    console.error('Get unit error:', err);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

/**
 * PUT /:id - Update unit
 */
router.put('/:id', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  try {
    const { category_id, name, name_ar, description, sort_order } = req.body;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    db.prepare(`
      UPDATE units SET category_id = ?, name = ?, name_ar = ?, description = ?, sort_order = ?
      WHERE id = ?
    `).run(
      category_id ?? existing.category_id,
      name ?? existing.name,
      name_ar ?? existing.name_ar,
      description ?? existing.description,
      sort_order ?? existing.sort_order,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update unit error:', err);
    res.status(500).json({ error: 'Failed to update unit' });
  }
});

/**
 * DELETE /:id - Delete unit (admin only)
 */
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();

    const existing = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    db.prepare('DELETE FROM units WHERE id = ?').run(req.params.id);
    res.json({ message: 'Unit deleted successfully' });
  } catch (err) {
    console.error('Delete unit error:', err);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});

export default router;
