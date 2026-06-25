import { getDb } from '../config/database.js';

/**
 * Context-Aware Hint Engine
 * Generates progressive hints for questions based on type and difficulty.
 */

/**
 * Generate a hint for a question.
 * @param {object} question - The question object
 * @param {object} word - The full word object
 * @param {number} hintLevel - 1 = subtle, 2 = moderate, 3 = strong
 * @returns {{ hint: string, type: string, eliminatedOption: string|null }}
 */
export function generateHint(question, word, hintLevel = 1) {
  const db = getDb();
  const direction = question.direction || 'word_to_meaning';
  const questionType = question.type || 'mcq';

  // Load full word data if not already loaded
  const fullWord = loadFullWord(word, db);

  let hint = '';
  let type = 'text';
  let eliminatedOption = null;

  switch (direction) {
    case 'word_to_meaning':
      ({ hint, type, eliminatedOption } = hintForMeaning(fullWord, question, hintLevel, questionType));
      break;
    case 'meaning_to_word':
      ({ hint, type, eliminatedOption } = hintForWord(fullWord, question, hintLevel, questionType));
      break;
    case 'word_to_synonym':
      ({ hint, type, eliminatedOption } = hintForSynonym(fullWord, question, hintLevel, questionType));
      break;
    case 'word_to_antonym':
      ({ hint, type, eliminatedOption } = hintForAntonym(fullWord, question, hintLevel, questionType));
      break;
    case 'word_to_plural':
      ({ hint, type, eliminatedOption } = hintForPlural(fullWord, question, hintLevel, questionType));
      break;
    case 'plural_to_singular':
      ({ hint, type, eliminatedOption } = hintForSingular(fullWord, question, hintLevel, questionType));
      break;
    default:
      ({ hint, type, eliminatedOption } = hintForMeaning(fullWord, question, hintLevel, questionType));
  }

  return { hint, type, eliminatedOption };
}

// ==================== Direction-Specific Hint Generators ====================

function hintForMeaning(word, question, level, questionType) {
  let hint = '';
  let type = 'text';
  let eliminatedOption = null;

  if (level === 1) {
    // Subtle: give semantic field or grammatical category
    if (word.grammatical_notes) {
      hint = `تلميح نحوي: ${word.grammatical_notes}`;
      type = 'grammar';
    } else if (word.tags && word.tags.length > 0) {
      hint = `المجال الدلالي: ${word.tags[0]}`;
      type = 'category';
    } else if (word.root) {
      hint = `الجذر: ${word.root}`;
      type = 'root';
    } else {
      hint = `عدد حروف المعنى: ${word.meaning ? word.meaning.length : '?'} حرف`;
      type = 'length';
    }
  } else if (level === 2) {
    // Moderate: give context clue or first word of meaning
    if (word.example_sentence) {
      hint = `سياق: "${word.example_sentence}"`;
      type = 'context';
    } else if (word.meaning) {
      const firstWord = word.meaning.split(' ')[0];
      hint = `المعنى يبدأ بـ: "${firstWord}..."`;
      type = 'partial';
    }

    // For MCQ: also eliminate one wrong option
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  } else {
    // Strong: show most of the meaning or the root + grammatical notes
    if (word.meaning) {
      const halfLength = Math.ceil(word.meaning.length / 2);
      hint = `المعنى: "${word.meaning.substring(0, halfLength)}..."`;
      type = 'strong_partial';
    }
    if (word.common_mistake) {
      hint += ` | خطأ شائع: ${word.common_mistake}`;
    }
    // For MCQ: eliminate two wrong options
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  }

  return { hint, type, eliminatedOption };
}

function hintForWord(word, question, level, questionType) {
  let hint = '';
  let type = 'text';
  let eliminatedOption = null;

  if (level === 1) {
    if (word.root) {
      hint = `الجذر: ${word.root}`;
      type = 'root';
    } else {
      hint = `الحرف الأول: "${word.word ? word.word[0] : '?'}"`;
      type = 'first_letter';
    }
  } else if (level === 2) {
    const wordText = word.word || '';
    hint = `الكلمة تبدأ بـ "${wordText.substring(0, 2)}..." وتتكوّن من ${wordText.length} حرف`;
    type = 'partial';
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  } else {
    const wordText = word.word || '';
    const halfLen = Math.ceil(wordText.length / 2);
    hint = `الكلمة: "${wordText.substring(0, halfLen)}..."`;
    type = 'strong_partial';
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  }

  return { hint, type, eliminatedOption };
}

function hintForSynonym(word, question, level, questionType) {
  let hint = '';
  let type = 'text';
  let eliminatedOption = null;

  if (level === 1) {
    hint = `فكّر في كلمة قريبة من معنى "${word.word}"`;
    type = 'broad_category';
  } else if (level === 2) {
    hint = `معنى الكلمة: "${word.meaning}"، ابحث عن كلمة مشابهة`;
    type = 'meaning_clue';
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  } else {
    if (word.synonyms && word.synonyms.length > 1) {
      hint = `من المرادفات أيضًا: "${word.synonyms[word.synonyms.length - 1]}"`;
    } else {
      hint = `المعنى الدقيق: "${word.meaning}"`;
    }
    type = 'strong_clue';
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  }

  return { hint, type, eliminatedOption };
}

function hintForAntonym(word, question, level, questionType) {
  let hint = '';
  let type = 'text';
  let eliminatedOption = null;

  if (level === 1) {
    hint = `فكّر في عكس معنى "${word.word}"`;
    type = 'direction';
  } else if (level === 2) {
    hint = `معنى الكلمة: "${word.meaning}"، الضد هو عكس هذا المعنى`;
    type = 'meaning_contrast';
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  } else {
    if (word.antonyms && word.antonyms.length > 0) {
      const answer = word.antonyms[0];
      hint = `الضد يبدأ بحرف "${answer[0]}"`;
    } else {
      hint = `فكّر في النقيض التام لـ "${word.meaning}"`;
    }
    type = 'strong_clue';
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  }

  return { hint, type, eliminatedOption };
}

function hintForPlural(word, question, level, questionType) {
  let hint = '';
  let type = 'text';
  let eliminatedOption = null;

  if (level === 1) {
    // Give pattern type
    if (word.pluralTypes && word.pluralTypes.length > 0) {
      hint = `نوع الجمع: ${word.pluralTypes[0]}`;
      type = 'pattern_type';
    } else if (word.grammatical_notes) {
      hint = `ملاحظة صرفية: ${word.grammatical_notes}`;
      type = 'grammar';
    } else {
      hint = `فكّر في وزن جمع التكسير المناسب`;
      type = 'general';
    }
  } else if (level === 2) {
    const plural = word.plural || (word.plurals && word.plurals[0]) || '';
    if (plural) {
      hint = `الجمع يبدأ بـ "${plural.substring(0, 2)}..."`;
      type = 'partial';
    } else {
      hint = `الجذر: ${word.root || 'غير معروف'}`;
      type = 'root';
    }
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  } else {
    const plural = word.plural || (word.plurals && word.plurals[0]) || '';
    if (plural) {
      const halfLen = Math.ceil(plural.length / 2);
      hint = `الجمع: "${plural.substring(0, halfLen)}..."`;
      type = 'strong_partial';
    }
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  }

  return { hint, type, eliminatedOption };
}

function hintForSingular(word, question, level, questionType) {
  let hint = '';
  let type = 'text';
  let eliminatedOption = null;

  if (level === 1) {
    if (word.root) {
      hint = `الجذر: ${word.root}`;
      type = 'root';
    } else {
      hint = `فكّر في المفرد من هذا الجمع`;
      type = 'general';
    }
  } else if (level === 2) {
    const singular = word.singular || word.word || '';
    hint = `المفرد يبدأ بـ "${singular.substring(0, 2)}..."`;
    type = 'partial';
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  } else {
    const singular = word.singular || word.word || '';
    const halfLen = Math.ceil(singular.length / 2);
    hint = `المفرد: "${singular.substring(0, halfLen)}..."`;
    type = 'strong_partial';
    if (questionType === 'mcq' && question.options) {
      eliminatedOption = eliminateOneOption(question);
    }
  }

  return { hint, type, eliminatedOption };
}

// ==================== Helpers ====================

function loadFullWord(word, db) {
  if (word._hintLoaded) return word;

  const synonyms = db.prepare('SELECT synonym FROM word_synonyms WHERE word_id = ? ORDER BY sort_order').all(word.id).map(r => r.synonym);
  const antonyms = db.prepare('SELECT antonym FROM word_antonyms WHERE word_id = ? ORDER BY sort_order').all(word.id).map(r => r.antonym);
  const pluralRows = db.prepare('SELECT plural_form, plural_type FROM word_plurals WHERE word_id = ?').all(word.id);
  const plurals = pluralRows.map(r => r.plural_form);
  const pluralTypes = pluralRows.map(r => r.plural_type).filter(Boolean);
  const tags = db.prepare('SELECT tag FROM word_tags WHERE word_id = ?').all(word.id).map(r => r.tag);

  return {
    ...word,
    synonyms,
    antonyms,
    plurals,
    pluralTypes,
    tags,
    _hintLoaded: true,
  };
}

/**
 * Eliminate one wrong option from MCQ choices.
 * Returns the text of the eliminated option.
 */
function eliminateOneOption(question) {
  if (!question.options || question.options.length <= 2) return null;

  // Find wrong options
  const wrongOptions = question.options.filter(
    o => o.text !== question.correctAnswer
  );

  if (wrongOptions.length === 0) return null;

  // Pick a random wrong option to eliminate
  const eliminated = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
  return eliminated.text;
}
