import { getDb } from '../config/database.js';

/**
 * Smart Distractor Selection Engine
 * Generates plausible wrong options for MCQ questions.
 */

/**
 * Get distractors for a word.
 * @param {object} word - The target word object (must have id, lesson_id, meaning, root, word)
 * @param {string} field - Which field to generate distractors for: 'meaning', 'synonym', 'antonym', 'plural', 'word'
 * @param {number} count - Number of distractors needed
 * @param {number|null} userId - Optional user ID for historically confused words
 * @returns {Array<{text: string, wordId: number, source: string}>}
 */
export function getDistractors(word, field = 'meaning', count = 3, userId = null) {
  const db = getDb();
  const candidates = [];
  const usedTexts = new Set();
  const usedWordIds = new Set([word.id]);

  // Determine the correct answer text to exclude
  const correctAnswer = getCorrectAnswerText(word, field, db);
  if (correctAnswer) {
    usedTexts.add(normalizeText(correctAnswer));
  }

  // Strategy 1: Same lesson words (highest priority - most plausible)
  const sameLessonWords = db.prepare(`
    SELECT id, word, meaning, root, plural FROM words
    WHERE lesson_id = ? AND id != ?
    ORDER BY RANDOM()
  `).all(word.lesson_id, word.id);

  for (const w of sameLessonWords) {
    const text = getFieldText(w, field, db);
    if (text && !usedTexts.has(normalizeText(text)) && !usedWordIds.has(w.id)) {
      candidates.push({ text, wordId: w.id, source: 'same_lesson', score: 10 });
      usedTexts.add(normalizeText(text));
      usedWordIds.add(w.id);
    }
  }

  // Strategy 2: Confusion pairs
  const confusionPairs = db.prepare(`
    SELECT w.id, w.word, w.meaning, w.root, w.plural, w.lesson_id FROM confusion_pairs cp
    JOIN words w ON (w.id = CASE WHEN cp.word_id_1 = ? THEN cp.word_id_2 ELSE cp.word_id_1 END)
    WHERE cp.word_id_1 = ? OR cp.word_id_2 = ?
  `).all(word.id, word.id, word.id);

  for (const w of confusionPairs) {
    const text = getFieldText(w, field, db);
    if (text && !usedTexts.has(normalizeText(text)) && !usedWordIds.has(w.id)) {
      candidates.push({ text, wordId: w.id, source: 'confusion_pair', score: 9 });
      usedTexts.add(normalizeText(text));
      usedWordIds.add(w.id);
    }
  }

  // Strategy 3: Historically confused words (if user provided)
  if (userId) {
    const historicallyConfused = getHistoricallyConfused(userId, word.id);
    for (const hc of historicallyConfused) {
      const w = db.prepare('SELECT id, word, meaning, root, plural, lesson_id FROM words WHERE id = ?').get(hc.wordId);
      if (w) {
        const text = getFieldText(w, field, db);
        if (text && !usedTexts.has(normalizeText(text)) && !usedWordIds.has(w.id)) {
          candidates.push({ text, wordId: w.id, source: 'historically_confused', score: 8 });
          usedTexts.add(normalizeText(text));
          usedWordIds.add(w.id);
        }
      }
    }
  }

  // Strategy 4: Same category words
  const sameCategory = db.prepare(`
    SELECT w.id, w.word, w.meaning, w.root, w.plural, w.lesson_id FROM words w
    JOIN lessons l ON w.lesson_id = l.id
    JOIN units u ON l.unit_id = u.id
    WHERE u.category_id = (
      SELECT u2.category_id FROM lessons l2 JOIN units u2 ON l2.unit_id = u2.id WHERE l2.id = ?
    )
    AND w.id != ?
    ORDER BY RANDOM()
    LIMIT 20
  `).all(word.lesson_id, word.id);

  for (const w of sameCategory) {
    const text = getFieldText(w, field, db);
    if (text && !usedTexts.has(normalizeText(text)) && !usedWordIds.has(w.id)) {
      candidates.push({ text, wordId: w.id, source: 'same_category', score: 6 });
      usedTexts.add(normalizeText(text));
      usedWordIds.add(w.id);
    }
  }

  // Strategy 5: Same root words
  if (word.root) {
    const sameRoot = db.prepare(`
      SELECT id, word, meaning, root, plural, lesson_id FROM words
      WHERE root = ? AND id != ?
      ORDER BY RANDOM()
      LIMIT 10
    `).all(word.root, word.id);

    for (const w of sameRoot) {
      const text = getFieldText(w, field, db);
      if (text && !usedTexts.has(normalizeText(text)) && !usedWordIds.has(w.id)) {
        candidates.push({ text, wordId: w.id, source: 'same_root', score: 7 });
        usedTexts.add(normalizeText(text));
        usedWordIds.add(w.id);
      }
    }
  }

  // Strategy 6: Random fallback from all words
  if (candidates.length < count) {
    const randomWords = db.prepare(`
      SELECT id, word, meaning, root, plural, lesson_id FROM words
      WHERE id != ?
      ORDER BY RANDOM()
      LIMIT ?
    `).all(word.id, count * 3);

    for (const w of randomWords) {
      const text = getFieldText(w, field, db);
      if (text && !usedTexts.has(normalizeText(text)) && !usedWordIds.has(w.id)) {
        candidates.push({ text, wordId: w.id, source: 'random', score: 3 });
        usedTexts.add(normalizeText(text));
        usedWordIds.add(w.id);
      }
    }
  }

  // Sort by score (descending) and pick the top 'count' candidates
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, count);
}

/**
 * Get words the user has historically confused with a given word.
 */
export function getHistoricallyConfused(userId, wordId) {
  const db = getDb();

  // Find wrong answers where the user chose a distractor for this word
  const wrongChoices = db.prepare(`
    SELECT chosen_distractor_id, COUNT(*) as times
    FROM review_log
    WHERE user_id = ? AND word_id = ? AND was_correct = 0 AND chosen_distractor_id IS NOT NULL
    GROUP BY chosen_distractor_id
    ORDER BY times DESC
    LIMIT 10
  `).all(userId, wordId);

  // Also find cases where this word was chosen as a wrong answer for other words
  const confusedWith = db.prepare(`
    SELECT word_id, COUNT(*) as times
    FROM review_log
    WHERE user_id = ? AND chosen_distractor_id = ? AND was_correct = 0
    GROUP BY word_id
    ORDER BY times DESC
    LIMIT 10
  `).all(userId, wordId);

  const results = [];
  const seen = new Set();

  for (const row of wrongChoices) {
    if (row.chosen_distractor_id && !seen.has(row.chosen_distractor_id)) {
      results.push({ wordId: row.chosen_distractor_id, times: row.times });
      seen.add(row.chosen_distractor_id);
    }
  }
  for (const row of confusedWith) {
    if (row.word_id && !seen.has(row.word_id)) {
      results.push({ wordId: row.word_id, times: row.times });
      seen.add(row.word_id);
    }
  }

  return results;
}

/**
 * Get the text of a field for a word for use as a distractor.
 */
function getFieldText(wordRow, field, db) {
  switch (field) {
    case 'meaning':
      return wordRow.meaning;
    case 'intended_meaning':
      return wordRow.intended_meaning;
    case 'word':
      return wordRow.word;
    case 'plural': {
      if (wordRow.plural) return wordRow.plural;
      const pl = db.prepare('SELECT plural_form FROM word_plurals WHERE word_id = ? LIMIT 1').get(wordRow.id);
      return pl ? pl.plural_form : null;
    }
    case 'synonym': {
      const syn = db.prepare('SELECT synonym FROM word_synonyms WHERE word_id = ? ORDER BY RANDOM() LIMIT 1').get(wordRow.id);
      return syn ? syn.synonym : wordRow.meaning;
    }
    case 'antonym': {
      const ant = db.prepare('SELECT antonym FROM word_antonyms WHERE word_id = ? ORDER BY RANDOM() LIMIT 1').get(wordRow.id);
      return ant ? ant.antonym : null;
    }
    default:
      return wordRow.meaning;
  }
}

/**
 * Get the correct answer text for the target word.
 */
function getCorrectAnswerText(word, field, db) {
  switch (field) {
    case 'meaning':
      return word.meaning;
    case 'intended_meaning':
      return word.intended_meaning;
    case 'word':
      return word.word;
    case 'plural': {
      if (word.plural) return word.plural;
      const pl = db.prepare('SELECT plural_form FROM word_plurals WHERE word_id = ? LIMIT 1').get(word.id);
      return pl ? pl.plural_form : null;
    }
    case 'synonym': {
      const syn = db.prepare('SELECT synonym FROM word_synonyms WHERE word_id = ? LIMIT 1').get(word.id);
      return syn ? syn.synonym : null;
    }
    case 'antonym': {
      const ant = db.prepare('SELECT antonym FROM word_antonyms WHERE word_id = ? LIMIT 1').get(word.id);
      return ant ? ant.antonym : null;
    }
    default:
      return word.meaning;
  }
}

/**
 * Normalize text for comparison (trim, collapse whitespace).
 */
function normalizeText(text) {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}
