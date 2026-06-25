import { Router } from 'express';
import { getDb } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { generateQuestion, generateSessionQuestions } from '../services/questionGenerator.js';
import { updateProgress } from '../services/memoryEngine.js';
import { generateHint } from '../services/hintEngine.js';
import { awardXP, checkAchievements, updateStreak, updateDailyProgress } from '../services/gamificationEngine.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// In-memory session store
const activeSessions = new Map();

// POST /api/practice/start - Start a practice session
router.post('/start', authenticate, (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { mode = 'mixed', lessonIds = [], categoryId, settings = {} } = req.body;
    const { questionCount = 20, questionTypes = ['mcq', 'flashcard', 'fill_blank', 'typing'], directions = ['mixed'], difficulty, timed = false, timeLimit = 30 } = settings;

    // Gather words for this session
    let words = [];
    if (lessonIds && lessonIds.length > 0) {
      const placeholders = lessonIds.map(() => '?').join(',');
      words = db.prepare(`
        SELECT w.*, l.name as lesson_name FROM words w
        JOIN lessons l ON w.lesson_id = l.id
        WHERE w.lesson_id IN (${placeholders})
      `).all(...lessonIds);
    } else if (categoryId) {
      words = db.prepare(`
        SELECT w.*, l.name as lesson_name FROM words w
        JOIN lessons l ON w.lesson_id = l.id
        JOIN units u ON l.unit_id = u.id
        WHERE u.category_id = ?
      `).all(categoryId);
    } else {
      words = db.prepare(`SELECT w.*, l.name as lesson_name FROM words w JOIN lessons l ON w.lesson_id = l.id LIMIT 100`).all();
    }

    if (words.length === 0) {
      return res.status(400).json({ error: 'No words found for the selected lessons/category' });
    }

    // Enrich words with synonyms, antonyms, plurals
    const synStmt = db.prepare('SELECT synonym FROM word_synonyms WHERE word_id = ?');
    const antStmt = db.prepare('SELECT antonym FROM word_antonyms WHERE word_id = ?');
    const plurStmt = db.prepare('SELECT plural_form, plural_type FROM word_plurals WHERE word_id = ?');
    words = words.map(w => ({
      ...w,
      synonyms: synStmt.all(w.id).map(s => s.synonym),
      antonyms: antStmt.all(w.id).map(a => a.antonym),
      plurals: plurStmt.all(w.id).map(p => ({ form: p.plural_form, type: p.plural_type })),
    }));

    // Handle special modes
    let sessionWords = words;
    if (mode === 'weak_words') {
      const weakWords = db.prepare(`
        SELECT word_id, weakness_score FROM user_word_progress
        WHERE user_id = ? AND weakness_score > 0.2
        ORDER BY weakness_score DESC LIMIT ?
      `).all(userId, questionCount);
      const weakIds = new Set(weakWords.map(w => w.word_id));
      sessionWords = words.filter(w => weakIds.has(w.id));
      if (sessionWords.length === 0) sessionWords = words;
    } else if (mode === 'mistake_review') {
      const mistakeWords = db.prepare(`
        SELECT DISTINCT word_id FROM review_log
        WHERE user_id = ? AND was_correct = 0
        ORDER BY created_at DESC LIMIT ?
      `).all(userId, questionCount * 2);
      const mistakeIds = new Set(mistakeWords.map(w => w.word_id));
      sessionWords = words.filter(w => mistakeIds.has(w.id));
      if (sessionWords.length === 0) sessionWords = words;
    } else if (mode === 'smart_review') {
      const dueWords = db.prepare(`
        SELECT word_id FROM user_word_progress
        WHERE user_id = ? AND (next_review_at IS NULL OR next_review_at <= datetime('now'))
        ORDER BY weakness_score DESC, next_review_at ASC LIMIT ?
      `).all(userId, questionCount);
      const dueIds = new Set(dueWords.map(w => w.word_id));
      const filtered = words.filter(w => dueIds.has(w.id));
      sessionWords = filtered.length > 0 ? filtered : words;
    }

    // Generate questions
    const isShuffle = settings.shuffle !== false;
    const questions = generateSessionQuestions(sessionWords, mode, Math.min(questionCount, sessionWords.length * 3), userId, questionTypes, directions, isShuffle);

    // Create session in DB
    const sessionId = uuidv4();
    db.prepare(`
      INSERT INTO practice_sessions (id, user_id, mode, lesson_ids, category_id, total_questions, settings)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, userId, mode, JSON.stringify(lessonIds), categoryId || null, questions.length, JSON.stringify(settings));

    // Store in memory
    activeSessions.set(sessionId, {
      userId,
      questions,
      currentIndex: 0,
      answers: [],
      startedAt: Date.now(),
      timed,
      timeLimit,
      mode,
    });

    const firstQuestion = questions.length > 0 ? { ...questions[0], _index: 0 } : null;
    // Remove correct answer from sent data for MCQ
    if (firstQuestion && firstQuestion.type === 'mcq') {
      firstQuestion.correctAnswer = undefined;
    }

    res.json({
      sessionId,
      totalQuestions: questions.length,
      mode,
      timed,
      timeLimit,
      currentQuestion: firstQuestion,
      currentIndex: 0,
    });
  } catch (err) { next(err); }
});

// GET /api/practice/session/:sessionId/next - Get next question
router.get('/session/:sessionId/next', authenticate, (req, res, next) => {
  try {
    const session = activeSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found or expired' });
    if (session.userId !== req.user.id) return res.status(403).json({ error: 'Not your session' });

    if (session.currentIndex >= session.questions.length) {
      return res.json({ complete: true, message: 'Session complete' });
    }

    const question = { ...session.questions[session.currentIndex], _index: session.currentIndex };
    if (question.type === 'mcq') {
      question.correctAnswer = undefined;
    }

    res.json({
      currentQuestion: question,
      currentIndex: session.currentIndex,
      totalQuestions: session.questions.length,
      complete: false,
    });
  } catch (err) { next(err); }
});

// POST /api/practice/session/:sessionId/answer - Submit an answer
router.post('/session/:sessionId/answer', authenticate, (req, res, next) => {
  try {
    const db = getDb();
    const session = activeSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found or expired' });
    if (session.userId !== req.user.id) return res.status(403).json({ error: 'Not your session' });

    const { answer, responseTimeMs = 5000, usedHint = false } = req.body;
    const userId = req.user.id;

    if (session.currentIndex >= session.questions.length) {
      return res.json({ complete: true });
    }

    const question = session.questions[session.currentIndex];
    const correctAnswer = question.correctAnswer;

    // Check answer
    let isCorrect = false;
    if (question.type === 'flashcard') {
      // For flashcards, the answer is a self-rating (1-5)
      const rating = parseInt(answer);
      isCorrect = rating >= 3;
    } else if (question.type === 'matching') {
      // For matching, compare arrays
      isCorrect = JSON.stringify(answer) === JSON.stringify(correctAnswer);
    } else {
      // Normalize and compare
      const normalize = (s) => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
      const normalizedAnswer = normalize(answer);
      const normalizedCorrect = normalize(correctAnswer);

      if (Array.isArray(correctAnswer)) {
        isCorrect = correctAnswer.some(ca => normalize(ca) === normalizedAnswer);
      } else {
        isCorrect = normalizedAnswer === normalizedCorrect;
      }
    }

    // Calculate quality (0-5 for SM-2)
    let quality;
    if (question.type === 'flashcard') {
      quality = parseInt(answer) || 3;
    } else if (isCorrect) {
      if (usedHint) quality = 3;
      else if (responseTimeMs < 3000) quality = 5;
      else if (responseTimeMs < 8000) quality = 4;
      else quality = 3;
    } else {
      quality = usedHint ? 0 : 1;
    }

    // Update memory engine
    updateProgress(userId, question.wordId, quality, responseTimeMs, usedHint);

    // Award XP
    let xpAmount = isCorrect ? (usedHint ? 5 : 10) : 2;
    const xpResult = awardXP(userId, xpAmount, isCorrect ? 'correct_answer' : 'participation');

    // Log the review
    db.prepare(`
      INSERT INTO review_log (user_id, word_id, question_type, question_direction, quality,
        response_time_ms, used_hint, user_answer, correct_answer, was_correct, session_id, mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, question.wordId, question.type, question.direction, quality,
           responseTimeMs, usedHint ? 1 : 0, typeof answer === 'string' ? answer : JSON.stringify(answer),
           typeof correctAnswer === 'string' ? correctAnswer : JSON.stringify(correctAnswer),
           isCorrect ? 1 : 0, req.params.sessionId, session.mode);

    // Update session stats
    session.answers.push({ wordId: question.wordId, isCorrect, responseTimeMs, usedHint });
    session.currentIndex++;

    // Update daily progress
    updateDailyProgress(userId, 1);

    // Prepare next question
    let nextQuestion = null;
    const isComplete = session.currentIndex >= session.questions.length;
    if (!isComplete) {
      nextQuestion = { ...session.questions[session.currentIndex], _index: session.currentIndex };
      if (nextQuestion.type === 'mcq') {
        nextQuestion.correctAnswer = undefined;
      }
    }

    // Get word info for explanation
    const word = db.prepare('SELECT word, meaning FROM words WHERE id = ?').get(question.wordId);

    res.json({
      correct: isCorrect,
      correctAnswer: question.correctAnswer,
      explanation: word ? `${word.word} — ${word.meaning}` : null,
      xpEarned: xpAmount,
      newXP: xpResult.newXP,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.newLevel,
      currentIndex: session.currentIndex,
      totalQuestions: session.questions.length,
      complete: isComplete,
      nextQuestion,
    });
  } catch (err) { next(err); }
});

// GET /api/practice/session/:sessionId/hint
router.get('/session/:sessionId/hint', authenticate, (req, res, next) => {
  try {
    const db = getDb();
    const session = activeSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId !== req.user.id) return res.status(403).json({ error: 'Not your session' });

    const question = session.questions[session.currentIndex];
    if (!question) return res.status(400).json({ error: 'No current question' });

    const word = db.prepare('SELECT * FROM words WHERE id = ?').get(question.wordId);
    const hintLevel = parseInt(req.query.level) || 1;
    const hint = generateHint(question, word, hintLevel);

    res.json(hint);
  } catch (err) { next(err); }
});

// POST /api/practice/session/:sessionId/shuffle - Shuffle remaining questions
router.post('/session/:sessionId/shuffle', authenticate, (req, res, next) => {
  try {
    const session = activeSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId !== req.user.id) return res.status(403).json({ error: 'Not your session' });

    const answered = session.questions.slice(0, session.currentIndex);
    const remaining = session.questions.slice(session.currentIndex);

    // Fisher-Yates shuffle on remaining
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    session.questions = [...answered, ...remaining];
    res.json({ shuffled: true, remainingCount: remaining.length });
  } catch (err) { next(err); }
});

// POST /api/practice/session/:sessionId/complete
router.post('/session/:sessionId/complete', authenticate, (req, res, next) => {
  try {
    const db = getDb();
    const session = activeSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const userId = req.user.id;
    const answers = session.answers;
    const totalQuestions = answers.length;
    const correctCount = answers.filter(a => a.isCorrect).length;
    const wrongCount = totalQuestions - correctCount;
    const hintCount = answers.filter(a => a.usedHint).length;
    const avgResponseTime = totalQuestions > 0 ? answers.reduce((s, a) => s + a.responseTimeMs, 0) / totalQuestions : 0;
    const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0;
    const timeSpent = Date.now() - session.startedAt;

    // Session completion XP bonus
    let bonusXP = 30; // Lesson complete bonus
    if (accuracy === 1.0 && totalQuestions >= 5) bonusXP += 50; // Perfect session
    const xpResult = awardXP(userId, bonusXP, 'session_complete');

    // Update streak
    const streakResult = updateStreak(userId);

    // Update session in DB
    db.prepare(`
      UPDATE practice_sessions SET correct_count=?, wrong_count=?, hint_count=?,
        avg_response_time=?, xp_earned=?, completed_at=CURRENT_TIMESTAMP, total_questions=?
      WHERE id = ?
    `).run(correctCount, wrongCount, hintCount, avgResponseTime,
           answers.reduce((s, a) => s + (a.isCorrect ? 10 : 2), 0) + bonusXP,
           totalQuestions, req.params.sessionId);

    // Check achievements
    const newAchievements = checkAchievements(userId);

    // Get weak words from this session
    const wrongWordIds = answers.filter(a => !a.isCorrect).map(a => a.wordId);
    let weakWords = [];
    if (wrongWordIds.length > 0) {
      const placeholders = wrongWordIds.map(() => '?').join(',');
      weakWords = db.prepare(`SELECT id, word, meaning FROM words WHERE id IN (${placeholders})`).all(...wrongWordIds);
    }

    // Clean up session
    activeSessions.delete(req.params.sessionId);

    res.json({
      sessionId: req.params.sessionId,
      totalQuestions,
      correctCount,
      wrongCount,
      hintCount,
      accuracy: Math.round(accuracy * 100),
      avgResponseTime: Math.round(avgResponseTime),
      timeSpent,
      xpEarned: answers.reduce((s, a) => s + (a.isCorrect ? 10 : 2), 0) + bonusXP,
      bonusXP,
      streak: streakResult.streak,
      newAchievements,
      weakWords,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.newLevel,
    });
  } catch (err) { next(err); }
});

export default router;
