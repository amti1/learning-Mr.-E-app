import { Router } from 'express';
import { getDb } from '../config/database.js';

const router = Router();

// GET /api/search?q=...&type=...&limit=...&offset=...
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { q, type = 'all', limit = 30, offset = 0 } = req.query;
    if (!q || q.trim().length === 0) return res.json({ results: [], total: 0 });

    const searchTerm = `%${q.trim()}%`;
    const results = [];
    const lim = parseInt(limit);
    const off = parseInt(offset);

    if (type === 'all' || type === 'word') {
      const words = db.prepare(`
        SELECT w.id, w.word, w.meaning, w.root, w.plural, l.name as lesson_name, l.id as lesson_id, 'word' as match_type
        FROM words w JOIN lessons l ON w.lesson_id = l.id
        WHERE w.word LIKE ? LIMIT ? OFFSET ?
      `).all(searchTerm, lim, off);
      results.push(...words);
    }

    if (type === 'all' || type === 'meaning') {
      const meanings = db.prepare(`
        SELECT w.id, w.word, w.meaning, w.root, l.name as lesson_name, l.id as lesson_id, 'meaning' as match_type
        FROM words w JOIN lessons l ON w.lesson_id = l.id
        WHERE w.meaning LIKE ? LIMIT ? OFFSET ?
      `).all(searchTerm, lim, off);
      results.push(...meanings);
    }

    if (type === 'all' || type === 'synonym') {
      const syns = db.prepare(`
        SELECT w.id, w.word, w.meaning, ws.synonym as matched_value, l.name as lesson_name, l.id as lesson_id, 'synonym' as match_type
        FROM word_synonyms ws JOIN words w ON ws.word_id = w.id JOIN lessons l ON w.lesson_id = l.id
        WHERE ws.synonym LIKE ? LIMIT ? OFFSET ?
      `).all(searchTerm, lim, off);
      results.push(...syns);
    }

    if (type === 'all' || type === 'antonym') {
      const ants = db.prepare(`
        SELECT w.id, w.word, w.meaning, wa.antonym as matched_value, l.name as lesson_name, l.id as lesson_id, 'antonym' as match_type
        FROM word_antonyms wa JOIN words w ON wa.word_id = w.id JOIN lessons l ON w.lesson_id = l.id
        WHERE wa.antonym LIKE ? LIMIT ? OFFSET ?
      `).all(searchTerm, lim, off);
      results.push(...ants);
    }

    if (type === 'all' || type === 'root') {
      const roots = db.prepare(`
        SELECT w.id, w.word, w.meaning, w.root, l.name as lesson_name, l.id as lesson_id, 'root' as match_type
        FROM words w JOIN lessons l ON w.lesson_id = l.id
        WHERE w.root LIKE ? LIMIT ? OFFSET ?
      `).all(searchTerm, lim, off);
      results.push(...roots);
    }

    if (type === 'all' || type === 'plural') {
      const plurals = db.prepare(`
        SELECT w.id, w.word, w.meaning, wp.plural_form as matched_value, l.name as lesson_name, l.id as lesson_id, 'plural' as match_type
        FROM word_plurals wp JOIN words w ON wp.word_id = w.id JOIN lessons l ON w.lesson_id = l.id
        WHERE wp.plural_form LIKE ? LIMIT ? OFFSET ?
      `).all(searchTerm, lim, off);
      results.push(...plurals);
    }

    if (type === 'all' || type === 'lesson') {
      const lessons = db.prepare(`
        SELECT l.id, l.name, l.name_ar, l.description, u.name as unit_name, c.name as category_name, 'lesson' as match_type
        FROM lessons l JOIN units u ON l.unit_id = u.id JOIN categories c ON u.category_id = c.id
        WHERE l.name LIKE ? OR l.name_ar LIKE ? OR l.description LIKE ? LIMIT ? OFFSET ?
      `).all(searchTerm, searchTerm, searchTerm, lim, off);
      results.push(...lessons);
    }

    if (type === 'all' || type === 'tag') {
      const tags = db.prepare(`
        SELECT w.id, w.word, w.meaning, wt.tag as matched_value, l.name as lesson_name, l.id as lesson_id, 'tag' as match_type
        FROM word_tags wt JOIN words w ON wt.word_id = w.id JOIN lessons l ON w.lesson_id = l.id
        WHERE wt.tag LIKE ? LIMIT ? OFFSET ?
      `).all(searchTerm, lim, off);
      results.push(...tags);
    }

    // Deduplicate by id + match_type
    const seen = new Set();
    const unique = results.filter(r => {
      const key = `${r.id}-${r.match_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ results: unique.slice(0, lim), total: unique.length, query: q });
  } catch (err) { next(err); }
});

export default router;
