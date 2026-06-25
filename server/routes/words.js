import { Router } from 'express';
import { getDb } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { importCSV, importJSON, exportLessonWords } from '../services/importExport.js';

const router = Router();

// GET /api/words - List words with optional filters
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { lesson_id, category_id, unit_id, difficulty, search, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT w.*, l.name as lesson_name, l.name_ar as lesson_name_ar,
             u.name as unit_name, c.name as category_name
      FROM words w
      JOIN lessons l ON w.lesson_id = l.id
      JOIN units u ON l.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (lesson_id) { query += ' AND w.lesson_id = ?'; params.push(lesson_id); }
    if (unit_id) { query += ' AND l.unit_id = ?'; params.push(unit_id); }
    if (category_id) { query += ' AND u.category_id = ?'; params.push(category_id); }
    if (difficulty) { query += ' AND w.difficulty = ?'; params.push(difficulty); }
    if (search) { query += ' AND (w.word LIKE ? OR w.meaning LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    query += ' ORDER BY w.lesson_id, w.id LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const words = db.prepare(query).all(...params);

    // Fetch related data for each word
    const synonymStmt = db.prepare('SELECT * FROM word_synonyms WHERE word_id = ? ORDER BY sort_order');
    const antonymStmt = db.prepare('SELECT * FROM word_antonyms WHERE word_id = ? ORDER BY sort_order');
    const pluralStmt = db.prepare('SELECT * FROM word_plurals WHERE word_id = ?');
    const tagStmt = db.prepare('SELECT tag FROM word_tags WHERE word_id = ?');

    const enriched = words.map(w => ({
      ...w,
      synonyms: synonymStmt.all(w.id).map(s => s.synonym),
      antonyms: antonymStmt.all(w.id).map(a => a.antonym),
      plurals: pluralStmt.all(w.id).map(p => ({ form: p.plural_form, type: p.plural_type })),
      tags: tagStmt.all(w.id).map(t => t.tag),
    }));

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM words w JOIN lessons l ON w.lesson_id = l.id JOIN units u ON l.unit_id = u.id WHERE 1=1';
    const countParams = [];
    if (lesson_id) { countQuery += ' AND w.lesson_id = ?'; countParams.push(lesson_id); }
    if (unit_id) { countQuery += ' AND l.unit_id = ?'; countParams.push(unit_id); }
    if (category_id) { countQuery += ' AND u.category_id = ?'; countParams.push(category_id); }
    if (difficulty) { countQuery += ' AND w.difficulty = ?'; countParams.push(difficulty); }
    if (search) { countQuery += ' AND (w.word LIKE ? OR w.meaning LIKE ?)'; countParams.push(`%${search}%`, `%${search}%`); }

    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({ words: enriched, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) { next(err); }
});

// GET /api/words/:id - Get single word with all relations
router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const word = db.prepare(`
      SELECT w.*, l.name as lesson_name, l.name_ar as lesson_name_ar
      FROM words w JOIN lessons l ON w.lesson_id = l.id
      WHERE w.id = ?
    `).get(req.params.id);

    if (!word) return res.status(404).json({ error: 'Word not found' });

    word.synonyms = db.prepare('SELECT * FROM word_synonyms WHERE word_id = ? ORDER BY sort_order').all(word.id);
    word.antonyms = db.prepare('SELECT * FROM word_antonyms WHERE word_id = ? ORDER BY sort_order').all(word.id);
    word.plurals = db.prepare('SELECT * FROM word_plurals WHERE word_id = ?').all(word.id);
    word.tags = db.prepare('SELECT tag FROM word_tags WHERE word_id = ?').all(word.id).map(t => t.tag);
    word.confusionPairs = db.prepare(`
      SELECT cp.*, 
        CASE WHEN cp.word_id_1 = ? THEN w2.word ELSE w1.word END as confused_word,
        CASE WHEN cp.word_id_1 = ? THEN w2.id ELSE w1.id END as confused_word_id
      FROM confusion_pairs cp
      JOIN words w1 ON cp.word_id_1 = w1.id
      JOIN words w2 ON cp.word_id_2 = w2.id
      WHERE cp.word_id_1 = ? OR cp.word_id_2 = ?
    `).all(word.id, word.id, word.id, word.id);

    res.json(word);
  } catch (err) { next(err); }
});

// POST /api/words - Create word with related data
router.post('/', authenticate, requireRole('admin', 'teacher'), (req, res, next) => {
  try {
    const db = getDb();
    const { word, meaning, root, singular, plural, difficulty, lesson_id, example_sentence,
            grammatical_notes, linguistic_notes, common_mistake, frequency_level,
            exam_importance, teacher_notes, custom_explanation, synonyms, antonyms, plurals, tags } = req.body;

    if (!word || !lesson_id) return res.status(400).json({ error: 'word and lesson_id are required' });

    const result = db.prepare(`
      INSERT INTO words (lesson_id, word, meaning, root, singular, plural, difficulty, example_sentence,
        grammatical_notes, linguistic_notes, common_mistake, frequency_level, exam_importance, teacher_notes, custom_explanation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(lesson_id, word, meaning || null, root || null, singular || null, plural || null,
           difficulty || 3, example_sentence || null, grammatical_notes || null,
           linguistic_notes || null, common_mistake || null, frequency_level || 3,
           exam_importance || 3, teacher_notes || null, custom_explanation || null);

    const wordId = result.lastInsertRowid;

    if (synonyms && Array.isArray(synonyms)) {
      const stmt = db.prepare('INSERT INTO word_synonyms (word_id, synonym, sort_order) VALUES (?, ?, ?)');
      synonyms.forEach((s, i) => stmt.run(wordId, s, i));
    }
    if (antonyms && Array.isArray(antonyms)) {
      const stmt = db.prepare('INSERT INTO word_antonyms (word_id, antonym, sort_order) VALUES (?, ?, ?)');
      antonyms.forEach((a, i) => stmt.run(wordId, a, i));
    }
    if (plurals && Array.isArray(plurals)) {
      const stmt = db.prepare('INSERT INTO word_plurals (word_id, plural_form, plural_type) VALUES (?, ?, ?)');
      plurals.forEach(p => stmt.run(wordId, p.form || p, p.type || null));
    }
    if (tags && Array.isArray(tags)) {
      const stmt = db.prepare('INSERT INTO word_tags (word_id, tag) VALUES (?, ?)');
      tags.forEach(t => stmt.run(wordId, t));
    }

    res.status(201).json({ id: wordId, message: 'Word created' });
  } catch (err) { next(err); }
});

// PUT /api/words/:id - Update word
router.put('/:id', authenticate, requireRole('admin', 'teacher'), (req, res, next) => {
  try {
    const db = getDb();
    const wordId = req.params.id;
    const { word, meaning, root, singular, plural, difficulty, lesson_id, example_sentence,
            grammatical_notes, linguistic_notes, common_mistake, frequency_level,
            exam_importance, teacher_notes, custom_explanation, synonyms, antonyms, plurals, tags } = req.body;

    const existing = db.prepare('SELECT id FROM words WHERE id = ?').get(wordId);
    if (!existing) return res.status(404).json({ error: 'Word not found' });

    db.prepare(`
      UPDATE words SET word=COALESCE(?,word), meaning=COALESCE(?,meaning), root=COALESCE(?,root),
        singular=COALESCE(?,singular), plural=COALESCE(?,plural), difficulty=COALESCE(?,difficulty),
        lesson_id=COALESCE(?,lesson_id), example_sentence=COALESCE(?,example_sentence),
        grammatical_notes=COALESCE(?,grammatical_notes), linguistic_notes=COALESCE(?,linguistic_notes),
        common_mistake=COALESCE(?,common_mistake), frequency_level=COALESCE(?,frequency_level),
        exam_importance=COALESCE(?,exam_importance), teacher_notes=COALESCE(?,teacher_notes),
        custom_explanation=COALESCE(?,custom_explanation), updated_at=CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(word, meaning, root, singular, plural, difficulty, lesson_id, example_sentence,
           grammatical_notes, linguistic_notes, common_mistake, frequency_level,
           exam_importance, teacher_notes, custom_explanation, wordId);

    // Replace related data if provided
    if (synonyms !== undefined) {
      db.prepare('DELETE FROM word_synonyms WHERE word_id = ?').run(wordId);
      if (Array.isArray(synonyms)) {
        const stmt = db.prepare('INSERT INTO word_synonyms (word_id, synonym, sort_order) VALUES (?, ?, ?)');
        synonyms.forEach((s, i) => stmt.run(wordId, s, i));
      }
    }
    if (antonyms !== undefined) {
      db.prepare('DELETE FROM word_antonyms WHERE word_id = ?').run(wordId);
      if (Array.isArray(antonyms)) {
        const stmt = db.prepare('INSERT INTO word_antonyms (word_id, antonym, sort_order) VALUES (?, ?, ?)');
        antonyms.forEach((a, i) => stmt.run(wordId, a, i));
      }
    }
    if (plurals !== undefined) {
      db.prepare('DELETE FROM word_plurals WHERE word_id = ?').run(wordId);
      if (Array.isArray(plurals)) {
        const stmt = db.prepare('INSERT INTO word_plurals (word_id, plural_form, plural_type) VALUES (?, ?, ?)');
        plurals.forEach(p => stmt.run(wordId, p.form || p, p.type || null));
      }
    }
    if (tags !== undefined) {
      db.prepare('DELETE FROM word_tags WHERE word_id = ?').run(wordId);
      if (Array.isArray(tags)) {
        const stmt = db.prepare('INSERT INTO word_tags (word_id, tag) VALUES (?, ?)');
        tags.forEach(t => stmt.run(wordId, t));
      }
    }

    res.json({ message: 'Word updated' });
  } catch (err) { next(err); }
});

// DELETE /api/words/:id
router.delete('/:id', authenticate, requireRole('admin', 'teacher'), (req, res, next) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM words WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Word not found' });
    res.json({ message: 'Word deleted' });
  } catch (err) { next(err); }
});

// POST /api/words/bulk-import
router.post('/bulk-import', authenticate, requireRole('admin', 'teacher'), (req, res, next) => {
  try {
    const { format, data, lessonId } = req.body;
    if (!data || !lessonId) return res.status(400).json({ error: 'data and lessonId are required' });

    let result;
    if (format === 'csv') {
      result = importCSV(data, lessonId);
    } else {
      result = importJSON(typeof data === 'string' ? JSON.parse(data) : data, lessonId);
    }
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/words/export
router.get('/export', (req, res, next) => {
  try {
    const { lesson_id, format = 'json' } = req.query;
    if (!lesson_id) return res.status(400).json({ error: 'lesson_id is required' });
    const result = exportLessonWords(parseInt(lesson_id), format);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=words_lesson_${lesson_id}.csv`);
      res.send(result);
    } else {
      res.json(result);
    }
  } catch (err) { next(err); }
});

export default router;
