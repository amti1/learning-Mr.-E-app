import { Router } from 'express';
import { getDb } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET / - List all categories with unit count and word count
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();

    const categories = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM units u WHERE u.category_id = c.id) AS unit_count,
        (SELECT COUNT(*) FROM words w
         JOIN lessons l ON w.lesson_id = l.id
         JOIN units u ON l.unit_id = u.id
         WHERE u.category_id = c.id) AS word_count
      FROM categories c
      ORDER BY c.sort_order, c.id
    `).all();

    res.json(categories);
  } catch (err) {
    console.error('List categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * POST / - Create category (admin/teacher only)
 */
router.post('/', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  try {
    const { name, name_ar, description, icon, sort_order, parent_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const db = getDb();

    const result = db.prepare(`
      INSERT INTO categories (name, name_ar, description, icon, sort_order, parent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, name_ar || null, description || null, icon || '📚', sort_order || 0, parent_id || null);

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(category);
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

/**
 * GET /:id - Get category with units and lesson overview
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const units = db.prepare(`
      SELECT u.*,
        (SELECT COUNT(*) FROM lessons l WHERE l.unit_id = u.id) AS lesson_count,
        (SELECT COUNT(*) FROM words w JOIN lessons l ON w.lesson_id = l.id WHERE l.unit_id = u.id) AS word_count
      FROM units u
      WHERE u.category_id = ?
      ORDER BY u.sort_order, u.id
    `).all(category.id);

    // Get lessons for each unit
    const unitsWithLessons = units.map(unit => {
      const lessons = db.prepare(`
        SELECT l.*,
          (SELECT COUNT(*) FROM words w WHERE w.lesson_id = l.id) AS word_count
        FROM lessons l
        WHERE l.unit_id = ?
        ORDER BY l.sort_order, l.id
      `).all(unit.id);

      return { ...unit, lessons };
    });

    res.json({ ...category, units: unitsWithLessons });
  } catch (err) {
    console.error('Get category error:', err);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

/**
 * PUT /:id - Update category
 */
router.put('/:id', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  try {
    const { name, name_ar, description, icon, sort_order, parent_id } = req.body;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    db.prepare(`
      UPDATE categories SET
        name = ?, name_ar = ?, description = ?, icon = ?,
        sort_order = ?, parent_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name ?? existing.name,
      name_ar ?? existing.name_ar,
      description ?? existing.description,
      icon ?? existing.icon,
      sort_order ?? existing.sort_order,
      parent_id ?? existing.parent_id,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update category error:', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

/**
 * DELETE /:id - Delete category (admin only)
 */
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();

    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
