import { getDb } from '../config/database.js';
import { parse } from 'csv-parse/sync';

/**
 * Import/Export Service
 * Handles CSV and JSON import/export of word data.
 */

/**
 * Import words from CSV string.
 * Expected columns: word, meaning, synonym, antonym, plural, root, difficulty, example_sentence
 * @returns {{ imported: number, errors: Array<{ row: number, message: string }> }}
 */
export function importCSV(csvString, lessonId) {
  const db = getDb();

  // Verify lesson exists
  const lesson = db.prepare('SELECT id FROM lessons WHERE id = ?').get(lessonId);
  if (!lesson) {
    throw new Error(`Lesson with id ${lessonId} not found`);
  }

  let records;
  try {
    records = parse(csvString, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    throw new Error(`CSV parse error: ${err.message}`);
  }

  let imported = 0;
  const errors = [];

  const insertWord = db.prepare(`
    INSERT INTO words (lesson_id, word, meaning, root, difficulty, example_sentence)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertSynonym = db.prepare('INSERT INTO word_synonyms (word_id, synonym, sort_order) VALUES (?, ?, ?)');
  const insertAntonym = db.prepare('INSERT INTO word_antonyms (word_id, antonym, sort_order) VALUES (?, ?, ?)');
  const insertPlural = db.prepare('INSERT INTO word_plurals (word_id, plural_form) VALUES (?, ?)');

  const importAll = db.transaction(() => {
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2; // 1-indexed, +1 for header

      try {
        if (!row.word || !row.word.trim()) {
          errors.push({ row: rowNum, message: 'Missing required field: word' });
          continue;
        }

        const difficulty = row.difficulty ? parseInt(row.difficulty, 10) : 3;
        if (difficulty < 1 || difficulty > 5 || isNaN(difficulty)) {
          errors.push({ row: rowNum, message: `Invalid difficulty: ${row.difficulty}` });
          continue;
        }

        const result = insertWord.run(
          lessonId,
          row.word.trim(),
          (row.meaning || '').trim() || null,
          (row.root || '').trim() || null,
          difficulty,
          (row.example_sentence || '').trim() || null
        );
        const wordId = result.lastInsertRowid;

        // Parse synonyms (comma-separated)
        if (row.synonym) {
          const synonyms = row.synonym.split(',').map(s => s.trim()).filter(Boolean);
          synonyms.forEach((syn, idx) => {
            insertSynonym.run(wordId, syn, idx);
          });
        }

        // Parse antonyms (comma-separated)
        if (row.antonym) {
          const antonyms = row.antonym.split(',').map(a => a.trim()).filter(Boolean);
          antonyms.forEach((ant, idx) => {
            insertAntonym.run(wordId, ant, idx);
          });
        }

        // Parse plurals (comma-separated)
        if (row.plural) {
          const plurals = row.plural.split(',').map(p => p.trim()).filter(Boolean);
          plurals.forEach(pl => {
            insertPlural.run(wordId, pl);
          });
        }

        imported++;
      } catch (err) {
        errors.push({ row: rowNum, message: err.message });
      }
    }
  });

  importAll();

  return { imported, errors };
}

/**
 * Import words from JSON array.
 * Each item can contain: word, meaning, root, singular, plural, difficulty,
 * example_sentence, grammatical_notes, linguistic_notes, common_mistake,
 * frequency_level, exam_importance, teacher_notes, custom_explanation,
 * synonyms: [], antonyms: [], plurals: [{ form, type }], tags: []
 */
export function importJSON(jsonData, lessonId) {
  const db = getDb();

  const lesson = db.prepare('SELECT id FROM lessons WHERE id = ?').get(lessonId);
  if (!lesson) {
    throw new Error(`Lesson with id ${lessonId} not found`);
  }

  let items;
  if (typeof jsonData === 'string') {
    try {
      items = JSON.parse(jsonData);
    } catch (err) {
      throw new Error(`JSON parse error: ${err.message}`);
    }
  } else {
    items = jsonData;
  }

  // Support Arabic-keyed JSON format: { الدرس, المفردات: [{ الكلمة, المعنى, المراد, المضاد, المفرد, الجمع, ملاحظات }] }
  if (!Array.isArray(items)) {
    if (items && Array.isArray(items['المفردات'])) {
      items = items['المفردات'];
    } else {
      throw new Error('JSON data must be an array or an object with المفردات array');
    }
  }

  // Map Arabic keys to English keys
  items = items.map(item => {
    if (item['الكلمة'] !== undefined) {
      return {
        word: item['الكلمة'] || '',
        meaning: item['المعنى'] || item['المراد'] || '',
        root: item['الجذر'] || null,
        singular: item['المفرد'] || null,
        plural: item['الجمع'] || null,
        difficulty: item['الصعوبة'] || 3,
        example_sentence: item['مثال'] || null,
        grammatical_notes: item['ملاحظات'] || null,
        synonyms: (item['المراد'] && item['المراد'] !== item['المعنى']) ? [item['المراد']] : [],
        antonyms: item['المضاد'] ? item['المضاد'].split(/[وو،,]/).map(s => s.trim()).filter(Boolean) : [],
        plurals: item['الجمع'] ? item['الجمع'].split(/[وو،,]/).map(s => s.trim()).filter(Boolean).map(f => ({ form: f })) : [],
        tags: item['الوسوم'] ? (Array.isArray(item['الوسوم']) ? item['الوسوم'] : [item['الوسوم']]) : [],
      };
    }
    return item;
  });

  let imported = 0;
  const errors = [];

  const insertWord = db.prepare(`
    INSERT INTO words (lesson_id, word, meaning, root, singular, plural, difficulty,
      example_sentence, grammatical_notes, linguistic_notes, common_mistake,
      frequency_level, exam_importance, teacher_notes, custom_explanation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSynonym = db.prepare('INSERT INTO word_synonyms (word_id, synonym, sort_order) VALUES (?, ?, ?)');
  const insertAntonym = db.prepare('INSERT INTO word_antonyms (word_id, antonym, sort_order) VALUES (?, ?, ?)');
  const insertPlural = db.prepare('INSERT INTO word_plurals (word_id, plural_form, plural_type) VALUES (?, ?, ?)');
  const insertTag = db.prepare('INSERT INTO word_tags (word_id, tag) VALUES (?, ?)');

  const importAll = db.transaction(() => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        if (!item.word || !item.word.trim()) {
          errors.push({ index: i, message: 'Missing required field: word' });
          continue;
        }

        const result = insertWord.run(
          lessonId,
          item.word.trim(),
          item.meaning || null,
          item.root || null,
          item.singular || null,
          item.plural || null,
          item.difficulty || 3,
          item.example_sentence || null,
          item.grammatical_notes || null,
          item.linguistic_notes || null,
          item.common_mistake || null,
          item.frequency_level || 3,
          item.exam_importance || 3,
          item.teacher_notes || null,
          item.custom_explanation || null
        );
        const wordId = result.lastInsertRowid;

        // Insert synonyms
        if (Array.isArray(item.synonyms)) {
          item.synonyms.forEach((syn, idx) => {
            if (typeof syn === 'string' && syn.trim()) {
              insertSynonym.run(wordId, syn.trim(), idx);
            }
          });
        }

        // Insert antonyms
        if (Array.isArray(item.antonyms)) {
          item.antonyms.forEach((ant, idx) => {
            if (typeof ant === 'string' && ant.trim()) {
              insertAntonym.run(wordId, ant.trim(), idx);
            }
          });
        }

        // Insert plurals
        if (Array.isArray(item.plurals)) {
          item.plurals.forEach(pl => {
            if (typeof pl === 'string' && pl.trim()) {
              insertPlural.run(wordId, pl.trim(), null);
            } else if (pl && pl.form) {
              insertPlural.run(wordId, pl.form.trim(), pl.type || null);
            }
          });
        }

        // Insert tags
        if (Array.isArray(item.tags)) {
          item.tags.forEach(tag => {
            if (typeof tag === 'string' && tag.trim()) {
              insertTag.run(wordId, tag.trim());
            }
          });
        }

        imported++;
      } catch (err) {
        errors.push({ index: i, message: err.message });
      }
    }
  });

  importAll();

  return { imported, errors };
}

/**
 * Export all words in a lesson as JSON or CSV.
 */
export function exportLessonWords(lessonId, format = 'json') {
  const db = getDb();

  const words = db.prepare(`
    SELECT * FROM words WHERE lesson_id = ? ORDER BY sort_order, id
  `).all(lessonId);

  const enrichedWords = words.map(w => enrichWordForExport(db, w));

  if (format === 'csv') {
    return wordsToCSV(enrichedWords);
  }

  return enrichedWords;
}

/**
 * Export all words in the database.
 */
export function exportAllWords(format = 'json') {
  const db = getDb();

  const words = db.prepare(`
    SELECT w.*, l.name AS lesson_name, l.name_ar AS lesson_name_ar,
           u.name AS unit_name, c.name AS category_name
    FROM words w
    JOIN lessons l ON w.lesson_id = l.id
    JOIN units u ON l.unit_id = u.id
    JOIN categories c ON u.category_id = c.id
    ORDER BY c.sort_order, u.sort_order, l.sort_order, w.sort_order, w.id
  `).all();

  const enrichedWords = words.map(w => enrichWordForExport(db, w));

  if (format === 'csv') {
    return wordsToCSV(enrichedWords);
  }

  return enrichedWords;
}

// ==================== Internal Functions ====================

function enrichWordForExport(db, word) {
  const synonyms = db.prepare('SELECT synonym FROM word_synonyms WHERE word_id = ? ORDER BY sort_order').all(word.id).map(r => r.synonym);
  const antonyms = db.prepare('SELECT antonym FROM word_antonyms WHERE word_id = ? ORDER BY sort_order').all(word.id).map(r => r.antonym);
  const plurals = db.prepare('SELECT plural_form, plural_type FROM word_plurals WHERE word_id = ?').all(word.id);
  const tags = db.prepare('SELECT tag FROM word_tags WHERE word_id = ?').all(word.id).map(r => r.tag);

  return {
    ...word,
    synonyms,
    antonyms,
    plurals: plurals.map(p => ({ form: p.plural_form, type: p.plural_type })),
    tags,
  };
}

function wordsToCSV(words) {
  if (words.length === 0) return '';

  const headers = [
    'word', 'meaning', 'root', 'singular', 'plural', 'difficulty',
    'example_sentence', 'grammatical_notes', 'common_mistake',
    'frequency_level', 'exam_importance', 'synonym', 'antonym', 'tags'
  ];

  const rows = words.map(w => {
    return [
      escapeCSV(w.word),
      escapeCSV(w.meaning),
      escapeCSV(w.root),
      escapeCSV(w.singular),
      escapeCSV(w.plural),
      w.difficulty || 3,
      escapeCSV(w.example_sentence),
      escapeCSV(w.grammatical_notes),
      escapeCSV(w.common_mistake),
      w.frequency_level || 3,
      w.exam_importance || 3,
      escapeCSV(w.synonyms ? w.synonyms.join(', ') : ''),
      escapeCSV(w.antonyms ? w.antonyms.join(', ') : ''),
      escapeCSV(w.tags ? w.tags.join(', ') : ''),
    ].join(',');
  });

  return headers.join(',') + '\n' + rows.join('\n');
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
