import { getDb } from '../config/database.js';
import { getDistractors } from './distractorEngine.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Question Generator Service
 * Generates diverse question types from word data.
 */

const SUPPORTED_TYPES = ['flashcard', 'mcq', 'fill_blank', 'typing', 'matching', 'true_false'];
const SUPPORTED_DIRECTIONS = [
  'word_to_meaning', 'meaning_to_word',
  'word_to_synonym', 'word_to_antonym',
  'word_to_plural', 'plural_to_singular',
  'mixed'
];

/**
 * Generate a single question from a word.
 */
export function generateQuestion(word, type = 'mcq', direction = 'word_to_meaning', difficulty = 3, userId = null) {
  const db = getDb();

  // Resolve 'mixed' direction
  if (direction === 'mixed') {
    direction = pickRandomDirection(word, db);
  }

  // Ensure word has related data loaded
  const fullWord = enrichWord(word, db);

  switch (type) {
    case 'flashcard':
      return generateFlashcard(fullWord, direction);
    case 'mcq':
      return generateMCQ(fullWord, direction, difficulty, userId, db);
    case 'fill_blank':
      return generateFillBlank(fullWord, direction);
    case 'typing':
      return generateTyping(fullWord, direction);
    case 'matching':
      return generateMatching(fullWord, direction, db);
    case 'true_false':
      return generateTrueFalse(fullWord, direction, db, userId);
    default:
      return generateMCQ(fullWord, direction, difficulty, userId, db);
  }
}

/**
 * Generate a batch of questions for a practice session.
 */
export function generateSessionQuestions(words, mode = 'practice', count = 10, userId = null, questionTypes = null, directions = null, isShuffle = true) {
  if (!words || words.length === 0) return [];

  const questions = [];
  const typeDistribution = questionTypes && questionTypes.length ? questionTypes : getTypeDistribution(mode);
  const directionPool = directions && directions.length ? directions : ['word_to_meaning', 'meaning_to_word', 'mixed'];

  // Loop to find valid questions without falling back
  let attempts = 0;
  let wordIndex = 0;
  
  while (questions.length < count && attempts < count * 10) {
    // If we've checked all available words, do not repeat them to fill the count! Just return what we have.
    if (wordIndex >= words.length) {
      break;
    }

    const word = words[wordIndex];
    const type = typeDistribution[questions.length % typeDistribution.length];
    
    // Filter direction pool based on word properties
    const validDirections = directionPool.filter(dir => {
      if (dir === 'word_to_synonym') return word.synonyms && word.synonyms.length > 0;
      if (dir === 'word_to_antonym') return word.antonyms && word.antonyms.length > 0;
      if (dir === 'word_to_plural') return (word.plurals && word.plurals.length > 0) || word.plural;
      if (dir === 'plural_to_singular') return word.singular;
      if (dir === 'word_to_intended') return !!word.intended_meaning;
      return dir === 'word_to_meaning' || dir === 'meaning_to_word' || dir === 'mixed';
    });

    // Only make a question if the word actually supports one of the requested directions!
    if (validDirections.length > 0) {
      let direction = validDirections[questions.length % validDirections.length];
      if (direction === 'mixed') {
         direction = ['word_to_meaning', 'meaning_to_word'][questions.length % 2];
      }

      const question = generateQuestion(word, type, direction, word.difficulty || 3, userId);
      if (question) {
        questions.push(question);
      }
    }
    
    wordIndex++;
    attempts++;
  }

  // Shuffle questions for variety if requested
  return isShuffle ? shuffleArray(questions) : questions;
}

// ==================== Internal Generators ====================

function generateFlashcard(word, direction) {
  const { prompt, promptAr, correctAnswer } = getPromptAndAnswer(word, direction);

  return {
    id: uuidv4(),
    type: 'flashcard',
    direction,
    prompt,
    promptAr: promptAr || prompt,
    correctAnswer,
    options: null,
    pairs: null,
    wordId: word.id,
    lessonId: word.lesson_id,
    difficulty: word.difficulty || 3,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    plurals: word.plurals ? word.plurals.map(p => typeof p === 'string' ? p : p.form) : null,
    singular: word.singular,
    intended_meaning: word.intended_meaning,
  };
}

function generateMCQ(word, direction, difficulty, userId, db) {
  const { prompt, promptAr, correctAnswer, distractorField } = getPromptAndAnswer(word, direction);

  if (!correctAnswer) return generateFlashcard(word, direction);

  const distractors = getDistractors(word, distractorField, 3, userId);

  // Build options: correct answer + distractors
  const options = [
    { text: correctAnswer, isCorrect: true, wordId: word.id },
    ...distractors.map(d => ({ text: d.text, isCorrect: false, wordId: d.wordId })),
  ];

  // If we don't have enough options, fall back to flashcard
  if (options.length < 2) {
    return generateFlashcard(word, direction);
  }

  // Shuffle options
  const shuffledOptions = shuffleArray(options);

  return {
    id: uuidv4(),
    type: 'mcq',
    direction,
    prompt,
    promptAr: promptAr || prompt,
    correctAnswer,
    options: shuffledOptions.map(o => ({ text: o.text, wordId: o.wordId })),
    pairs: null,
    wordId: word.id,
    lessonId: word.lesson_id,
    difficulty: word.difficulty || 3,
    distractorIds: distractors.map(d => d.wordId),
  };
}

function generateFillBlank(word, direction) {
  let sentence = word.example_sentence || '';
  let blank = word.word;
  let correctAnswer = word.word;
  let prompt;

  if (sentence && sentence.includes(word.word)) {
    prompt = sentence.replace(word.word, '________');
  } else if (sentence) {
    // Show sentence as context with blank for the word
    prompt = `أكمل الفراغ: ${sentence.substring(0, 30)}... ________`;
  } else {
    // No example sentence; fall back to definition-based fill
    prompt = `ما الكلمة التي تعني: "${word.meaning}"؟`;
  }

  if (direction === 'meaning_to_word') {
    correctAnswer = word.word;
  } else if (direction === 'word_to_meaning') {
    correctAnswer = word.meaning;
    prompt = `ما معنى "${word.word}"؟ اكتب المعنى.`;
  }

  return {
    id: uuidv4(),
    type: 'fill_blank',
    direction,
    prompt,
    promptAr: prompt,
    correctAnswer,
    options: null,
    pairs: null,
    wordId: word.id,
    lessonId: word.lesson_id,
    difficulty: word.difficulty || 3,
    hint: word.root ? `الجذر: ${word.root}` : null,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    plurals: word.plurals ? word.plurals.map(p => typeof p === 'string' ? p : p.form) : null,
    singular: word.singular,
    intended_meaning: word.intended_meaning,
  };
}

function generateTyping(word, direction) {
  const { prompt, promptAr, correctAnswer } = getPromptAndAnswer(word, direction);

  return {
    id: uuidv4(),
    type: 'typing',
    direction,
    prompt,
    promptAr: promptAr || prompt,
    correctAnswer,
    options: null,
    pairs: null,
    wordId: word.id,
    lessonId: word.lesson_id,
    difficulty: word.difficulty || 3,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    plurals: word.plurals ? word.plurals.map(p => typeof p === 'string' ? p : p.form) : null,
    singular: word.singular,
    intended_meaning: word.intended_meaning,
  };
}

function generateMatching(word, direction, db) {
  // Get 3-5 additional words from the same lesson
  const peers = db.prepare(`
    SELECT w.*, ws.synonym, wa.antonym
    FROM words w
    LEFT JOIN word_synonyms ws ON w.id = ws.word_id AND ws.sort_order = 0
    LEFT JOIN word_antonyms wa ON w.id = wa.word_id AND wa.sort_order = 0
    WHERE w.lesson_id = ? AND w.id != ?
    ORDER BY RANDOM()
    LIMIT 5
  `).all(word.lesson_id, word.id);

  const pairWords = [word, ...peers].slice(0, 6);
  const pairs = pairWords.map(w => {
    const enriched = enrichWord(w, db);
    if (direction === 'word_to_synonym' && enriched.synonyms && enriched.synonyms.length > 0) {
      return { left: enriched.word, right: enriched.synonyms[0], wordId: enriched.id };
    } else if (direction === 'word_to_antonym' && enriched.antonyms && enriched.antonyms.length > 0) {
      return { left: enriched.word, right: enriched.antonyms[0], wordId: enriched.id };
    } else {
      return { left: enriched.word, right: enriched.meaning, wordId: enriched.id };
    }
  }).filter(p => p.left && p.right);

  if (pairs.length < 2) {
    return generateFlashcard(word, direction);
  }

  return {
    id: uuidv4(),
    type: 'matching',
    direction,
    prompt: 'طابق بين الكلمات والمعاني المناسبة',
    promptAr: 'طابق بين الكلمات والمعاني المناسبة',
    correctAnswer: null,
    options: null,
    pairs: shuffleArray(pairs),
    wordId: word.id,
    lessonId: word.lesson_id,
    difficulty: word.difficulty || 3,
  };
}

function generateTrueFalse(word, direction, db, userId) {
  const isTrue = Math.random() > 0.5;
  let statement;
  let correctAnswer;

  if (isTrue) {
    statement = buildTrueFalseStatement(word, direction, true);
    correctAnswer = 'true';
  } else {
    // Get a wrong meaning from a distractor
    const distractors = getDistractors(word, getDistractorFieldForDirection(direction), 1, userId);
    if (distractors.length > 0) {
      statement = buildTrueFalseStatementWithWrong(word, direction, distractors[0].text);
      correctAnswer = 'false';
    } else {
      statement = buildTrueFalseStatement(word, direction, true);
      correctAnswer = 'true';
    }
  }

  return {
    id: uuidv4(),
    type: 'true_false',
    direction,
    prompt: statement,
    promptAr: statement,
    correctAnswer,
    options: [
      { text: 'صحيح', value: 'true' },
      { text: 'خطأ', value: 'false' },
    ],
    pairs: null,
    wordId: word.id,
    lessonId: word.lesson_id,
    difficulty: word.difficulty || 3,
  };
}

// ==================== Helpers ====================

function getPromptAndAnswer(word, direction) {
  switch (direction) {
    case 'word_to_meaning':
      return {
        prompt: `ما معنى "${word.word}"؟`,
        promptAr: `ما معنى "${word.word}"؟`,
        correctAnswer: word.meaning,
        distractorField: 'meaning',
      };
    case 'meaning_to_word':
      return {
        prompt: `ما الكلمة التي تعني: "${word.meaning}"؟`,
        promptAr: `ما الكلمة التي تعني: "${word.meaning}"؟`,
        correctAnswer: word.word,
        distractorField: 'word',
      };
    case 'word_to_intended':
      return {
        prompt: `ما المراد بـ "${word.word}"؟`,
        promptAr: `ما المراد بـ "${word.word}"؟`,
        correctAnswer: word.intended_meaning,
        distractorField: 'intended_meaning',
      };
    case 'word_to_synonym':
      return {
        prompt: `ما مرادف "${word.word}"؟`,
        promptAr: `ما مرادف "${word.word}"؟`,
        correctAnswer: word.synonyms && word.synonyms.length > 0 ? word.synonyms[0] : word.meaning,
        distractorField: 'synonym',
      };
    case 'word_to_antonym':
      return {
        prompt: `ما ضد "${word.word}"؟`,
        promptAr: `ما ضد "${word.word}"؟`,
        correctAnswer: word.antonyms && word.antonyms.length > 0 ? word.antonyms[0] : null,
        distractorField: 'antonym',
      };
    case 'word_to_plural':
      return {
        prompt: `ما جمع "${word.word}"؟`,
        promptAr: `ما جمع "${word.word}"؟`,
        correctAnswer: word.plurals && word.plurals.length > 0 ? word.plurals[0] : word.plural,
        distractorField: 'plural',
      };
    case 'plural_to_singular':
      return {
        prompt: `ما مفرد "${word.plural || (word.plurals && word.plurals[0])}"؟`,
        promptAr: `ما مفرد "${word.plural || (word.plurals && word.plurals[0])}"؟`,
        correctAnswer: word.singular || word.word,
        distractorField: 'word',
      };
    default:
      return {
        prompt: `ما معنى "${word.word}"؟`,
        promptAr: `ما معنى "${word.word}"؟`,
        correctAnswer: word.meaning,
        distractorField: 'meaning',
      };
  }
}

function pickRandomDirection(word, db) {
  const available = ['word_to_meaning', 'meaning_to_word'];

  const syns = db.prepare('SELECT COUNT(*) as c FROM word_synonyms WHERE word_id = ?').get(word.id);
  if (syns.c > 0) available.push('word_to_synonym');

  const ants = db.prepare('SELECT COUNT(*) as c FROM word_antonyms WHERE word_id = ?').get(word.id);
  if (ants.c > 0) available.push('word_to_antonym');

  const plurs = db.prepare('SELECT COUNT(*) as c FROM word_plurals WHERE word_id = ?').get(word.id);
  if (plurs.c > 0) {
    available.push('word_to_plural');
    if (word.singular) available.push('plural_to_singular');
  }

  return available[Math.floor(Math.random() * available.length)];
}

function enrichWord(word, db) {
  if (word._enriched) return word;

  const synonyms = db.prepare('SELECT synonym FROM word_synonyms WHERE word_id = ? ORDER BY sort_order').all(word.id).map(r => r.synonym);
  const antonyms = db.prepare('SELECT antonym FROM word_antonyms WHERE word_id = ? ORDER BY sort_order').all(word.id).map(r => r.antonym);
  const plurals = db.prepare('SELECT plural_form FROM word_plurals WHERE word_id = ?').all(word.id).map(r => r.plural_form);
  const tags = db.prepare('SELECT tag FROM word_tags WHERE word_id = ?').all(word.id).map(r => r.tag);

  return {
    ...word,
    synonyms,
    antonyms,
    plurals,
    tags,
    _enriched: true,
  };
}

function buildTrueFalseStatement(word, direction, isTrue) {
  if (direction === 'word_to_meaning' || direction === 'meaning_to_word') {
    return `"${word.word}" تعني "${word.meaning}"`;
  }
  if (direction === 'word_to_synonym' && word.synonyms && word.synonyms.length > 0) {
    return `"${word.synonyms[0]}" مرادف لـ "${word.word}"`;
  }
  return `"${word.word}" تعني "${word.meaning}"`;
}

function buildTrueFalseStatementWithWrong(word, direction, wrongText) {
  if (direction === 'word_to_meaning' || direction === 'meaning_to_word') {
    return `"${word.word}" تعني "${wrongText}"`;
  }
  if (direction === 'word_to_synonym') {
    return `"${wrongText}" مرادف لـ "${word.word}"`;
  }
  return `"${word.word}" تعني "${wrongText}"`;
}

function getDistractorFieldForDirection(direction) {
  const map = {
    word_to_meaning: 'meaning',
    meaning_to_word: 'word',
    word_to_synonym: 'synonym',
    word_to_antonym: 'antonym',
    word_to_plural: 'plural',
    plural_to_singular: 'word',
  };
  return map[direction] || 'meaning';
}

function getTypeDistribution(mode) {
  switch (mode) {
    case 'flashcards':
      return ['flashcard'];
    case 'mcq':
      return ['mcq'];
    case 'write':
      return ['fill_blank', 'typing'];
    case 'review':
      return ['mcq', 'mcq', 'typing', 'fill_blank', 'true_false'];
    case 'exam':
      return ['mcq', 'typing', 'fill_blank', 'typing', 'mcq'];
    case 'boss_battle':
      return ['mcq', 'typing', 'fill_blank', 'matching', 'true_false', 'typing'];
    case 'survival':
      return ['mcq', 'mcq', 'true_false', 'mcq'];
    case 'marathon':
      return ['mcq', 'typing', 'fill_blank', 'true_false', 'matching', 'mcq'];
    case 'practice':
    default:
      return ['flashcard', 'mcq', 'mcq', 'fill_blank', 'true_false', 'typing'];
  }
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
