import { Router } from 'express';
import { getDb } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * Optional auth middleware - attaches user if token present but doesn't require it.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  // Delegate to the real authenticate middleware; if it fails, just continue
  authenticate(req, res, (err) => {
    // If authenticate calls next with no error, user is set
    // If it would send a response, we intercept and just continue
    next();
  });
}

/**
 * GET / - List all lessons (optional filter by unit_id, category_id)
 */
router.get('/', optionalAuth, (req, res) => {
  try {
    const db = getDb();
    const { unit_id, category_id } = req.query;

    let query = `
      SELECT l.*,
        u.name AS unit_name, u.name_ar AS unit_name_ar,
        c.name AS category_name, c.name_ar AS category_name_ar,
        c.id AS category_id,
        (SELECT COUNT(*) FROM words w WHERE w.lesson_id = l.id) AS word_count
      FROM lessons l
      JOIN units u ON l.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
    `;
    const conditions = [];
    const params = [];

    if (unit_id) {
      conditions.push('l.unit_id = ?');
      params.push(unit_id);
    }
    if (category_id) {
      conditions.push('u.category_id = ?');
      params.push(category_id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY c.sort_order, u.sort_order, l.sort_order, l.id';

    let lessons = db.prepare(query).all(...params);

    // If user is authenticated, add mastery info
    if (req.user) {
      lessons = lessons.map(lesson => {
        const mastery = db.prepare(`
          SELECT
            COUNT(*) AS total_words_practiced,
            AVG(mastery_score) AS avg_mastery,
            SUM(CASE WHEN mastery_score >= 0.8 THEN 1 ELSE 0 END) AS mastered_count
          FROM user_word_progress p
          JOIN words w ON p.word_id = w.id
          WHERE p.user_id = ? AND w.lesson_id = ? AND p.total_attempts > 0
        `).get(req.user.id, lesson.id);

        return {
          ...lesson,
          user_mastery: mastery || null,
        };
      });
    }

    res.json(lessons);
  } catch (err) {
    console.error('List lessons error:', err);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

/**
 * POST / - Create lesson (admin/teacher only)
 */
router.post('/', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  try {
    const { unit_id, name, name_ar, description, source_textbook, difficulty, sort_order } = req.body;

    if (!unit_id || !name) {
      return res.status(400).json({ error: 'unit_id and name are required' });
    }

    const db = getDb();

    const unit = db.prepare('SELECT id FROM units WHERE id = ?').get(unit_id);
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const result = db.prepare(`
      INSERT INTO lessons (unit_id, name, name_ar, description, source_textbook, difficulty, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(unit_id, name, name_ar || null, description || null, source_textbook || null, difficulty || 3, sort_order || 0);

    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(lesson);
  } catch (err) {
    console.error('Create lesson error:', err);
    res.status(500).json({ error: 'Failed to create lesson' });
  }
});

/**
 * GET /:id - Get lesson with all words (including related data)
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();

    const lesson = db.prepare(`
      SELECT l.*, u.name AS unit_name, u.name_ar AS unit_name_ar,
             c.name AS category_name, c.name_ar AS category_name_ar, c.id AS category_id
      FROM lessons l
      JOIN units u ON l.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      WHERE l.id = ?
    `).get(req.params.id);

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const words = db.prepare('SELECT * FROM words WHERE lesson_id = ? ORDER BY sort_order, id').all(lesson.id);

    // Enrich each word with synonyms, antonyms, plurals, tags
    const enrichedWords = words.map(word => {
      const synonyms = db.prepare('SELECT * FROM word_synonyms WHERE word_id = ? ORDER BY sort_order').all(word.id);
      const antonyms = db.prepare('SELECT * FROM word_antonyms WHERE word_id = ? ORDER BY sort_order').all(word.id);
      const plurals = db.prepare('SELECT * FROM word_plurals WHERE word_id = ?').all(word.id);
      const tags = db.prepare('SELECT * FROM word_tags WHERE word_id = ?').all(word.id);

      return {
        ...word,
        synonyms: synonyms.map(s => s.synonym),
        antonyms: antonyms.map(a => a.antonym),
        plurals: plurals.map(p => ({ form: p.plural_form, type: p.plural_type })),
        tags: tags.map(t => t.tag),
      };
    });

    res.json({ ...lesson, words: enrichedWords });
  } catch (err) {
    console.error('Get lesson error:', err);
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

/**
 * PUT /:id - Update lesson
 */
router.put('/:id', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  try {
    const { unit_id, name, name_ar, description, source_textbook, difficulty, sort_order } = req.body;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    db.prepare(`
      UPDATE lessons SET
        unit_id = ?, name = ?, name_ar = ?, description = ?,
        source_textbook = ?, difficulty = ?, sort_order = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      unit_id ?? existing.unit_id,
      name ?? existing.name,
      name_ar ?? existing.name_ar,
      description ?? existing.description,
      source_textbook ?? existing.source_textbook,
      difficulty ?? existing.difficulty,
      sort_order ?? existing.sort_order,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Update lesson error:', err);
    res.status(500).json({ error: 'Failed to update lesson' });
  }
});

/**
 * DELETE /:id - Delete lesson (admin only)
 */
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();

    const existing = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    db.prepare('DELETE FROM lessons WHERE id = ?').run(req.params.id);
    res.json({ message: 'Lesson deleted successfully' });
  } catch (err) {
    console.error('Delete lesson error:', err);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

/**
 * POST /:id/duplicate - Duplicate a lesson with all its words
 */
router.post('/:id/duplicate', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  try {
    const db = getDb();

    const source = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
    if (!source) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const duplicateLesson = db.transaction(() => {
      // Create new lesson
      const result = db.prepare(`
        INSERT INTO lessons (unit_id, name, name_ar, description, source_textbook, difficulty, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        source.unit_id,
        source.name + ' (نسخة)',
        source.name_ar ? source.name_ar + ' (نسخة)' : null,
        source.description,
        source.source_textbook,
        source.difficulty,
        source.sort_order + 1
      );
      const newLessonId = result.lastInsertRowid;

      // Copy all words
      const words = db.prepare('SELECT * FROM words WHERE lesson_id = ?').all(source.id);

      for (const word of words) {
        const wordResult = db.prepare(`
          INSERT INTO words (lesson_id, word, meaning, root, singular, plural, difficulty,
            example_sentence, grammatical_notes, linguistic_notes, common_mistake,
            frequency_level, exam_importance, teacher_notes, custom_explanation, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newLessonId, word.word, word.meaning, word.root, word.singular, word.plural,
          word.difficulty, word.example_sentence, word.grammatical_notes,
          word.linguistic_notes, word.common_mistake, word.frequency_level,
          word.exam_importance, word.teacher_notes, word.custom_explanation,
          word.sort_order
        );
        const newWordId = wordResult.lastInsertRowid;

        // Copy synonyms
        const synonyms = db.prepare('SELECT * FROM word_synonyms WHERE word_id = ?').all(word.id);
        for (const syn of synonyms) {
          db.prepare('INSERT INTO word_synonyms (word_id, synonym, sort_order) VALUES (?, ?, ?)').run(newWordId, syn.synonym, syn.sort_order);
        }

        // Copy antonyms
        const antonyms = db.prepare('SELECT * FROM word_antonyms WHERE word_id = ?').all(word.id);
        for (const ant of antonyms) {
          db.prepare('INSERT INTO word_antonyms (word_id, antonym, sort_order) VALUES (?, ?, ?)').run(newWordId, ant.antonym, ant.sort_order);
        }

        // Copy plurals
        const plurals = db.prepare('SELECT * FROM word_plurals WHERE word_id = ?').all(word.id);
        for (const pl of plurals) {
          db.prepare('INSERT INTO word_plurals (word_id, plural_form, plural_type) VALUES (?, ?, ?)').run(newWordId, pl.plural_form, pl.plural_type);
        }

        // Copy tags
        const tags = db.prepare('SELECT * FROM word_tags WHERE word_id = ?').all(word.id);
        for (const tag of tags) {
          db.prepare('INSERT INTO word_tags (word_id, tag) VALUES (?, ?)').run(newWordId, tag.tag);
        }
      }

      return newLessonId;
    });

    const newLessonId = duplicateLesson();
    const newLesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(newLessonId);

    res.status(201).json(newLesson);
  } catch (err) {
    console.error('Duplicate lesson error:', err);
    res.status(500).json({ error: 'Failed to duplicate lesson' });
  }
});

/**
 * POST /merge - Merge multiple lessons into one
 */
router.post('/merge', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  try {
    const { lesson_ids, target_name, target_name_ar, target_unit_id } = req.body;

    if (!lesson_ids || !Array.isArray(lesson_ids) || lesson_ids.length < 2) {
      return res.status(400).json({ error: 'At least 2 lesson_ids are required' });
    }

    const db = getDb();

    // Verify all lessons exist
    const placeholders = lesson_ids.map(() => '?').join(',');
    const lessons = db.prepare(`SELECT * FROM lessons WHERE id IN (${placeholders})`).all(...lesson_ids);

    if (lessons.length !== lesson_ids.length) {
      return res.status(404).json({ error: 'One or more lessons not found' });
    }

    const mergeResult = db.transaction(() => {
      // Create the merged lesson
      const unitId = target_unit_id || lessons[0].unit_id;
      const result = db.prepare(`
        INSERT INTO lessons (unit_id, name, name_ar, description, difficulty, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        unitId,
        target_name || lessons.map(l => l.name).join(' + '),
        target_name_ar || null,
        'Merged from lessons: ' + lesson_ids.join(', '),
        Math.round(lessons.reduce((sum, l) => sum + l.difficulty, 0) / lessons.length),
        0
      );
      const newLessonId = result.lastInsertRowid;

      // Move all words to the new lesson
      for (const lessonId of lesson_ids) {
        db.prepare('UPDATE words SET lesson_id = ? WHERE lesson_id = ?').run(newLessonId, lessonId);
      }

      // Delete the old lessons (words are already moved)
      db.prepare(`DELETE FROM lessons WHERE id IN (${placeholders})`).run(...lesson_ids);

      return newLessonId;
    });

    const mergedLesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(mergeResult);
    const wordCount = db.prepare('SELECT COUNT(*) AS count FROM words WHERE lesson_id = ?').get(mergeResult);

    res.status(201).json({ ...mergedLesson, word_count: wordCount.count });
  } catch (err) {
    console.error('Merge lessons error:', err);
    res.status(500).json({ error: 'Failed to merge lessons' });
  }
});

export default router;
