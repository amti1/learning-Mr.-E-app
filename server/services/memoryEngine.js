import { getDb } from '../config/database.js';

/**
 * Enhanced SM-2 Spaced Repetition Engine
 * Manages memory strength, weakness scoring, and adaptive scheduling.
 */

/**
 * Main update function called after each answer.
 * @param {number} userId
 * @param {number} wordId
 * @param {number} quality - 0-5 (0-2 wrong, 3 barely, 4 good, 5 perfect)
 * @param {number} responseTimeMs
 * @param {boolean} usedHint
 * @returns {object} Updated progress record
 */
export function updateProgress(userId, wordId, quality, responseTimeMs, usedHint = false) {
  const db = getDb();

  // Get or create progress record
  let progress = db.prepare(
    'SELECT * FROM user_word_progress WHERE user_id = ? AND word_id = ?'
  ).get(userId, wordId);

  if (!progress) {
    db.prepare(
      'INSERT INTO user_word_progress (user_id, word_id) VALUES (?, ?)'
    ).run(userId, wordId);
    progress = db.prepare(
      'SELECT * FROM user_word_progress WHERE user_id = ? AND word_id = ?'
    ).get(userId, wordId);
  }

  const now = new Date().toISOString();
  const wasCorrect = quality >= 3;

  // --- SM-2 Core Algorithm ---
  let { ease_factor, interval_days, repetitions, stability } = progress;

  if (wasCorrect) {
    // Successful recall
    if (repetitions === 0) {
      interval_days = 0.5; // 12 hours for first success
    } else if (repetitions === 1) {
      interval_days = 1;
    } else if (repetitions === 2) {
      interval_days = 3;
    } else {
      interval_days = interval_days * ease_factor;
    }
    repetitions += 1;
  } else {
    // Failed recall - reset
    repetitions = 0;
    interval_days = 0.5; // Review again in 12 hours
  }

  // Update ease factor (SM-2 formula)
  ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ease_factor < 1.3) ease_factor = 1.3;
  if (ease_factor > 3.0) ease_factor = 3.0;

  // --- Stability update ---
  if (wasCorrect) {
    stability = stability * (1 + 0.1 * quality);
    if (stability > 20) stability = 20;
  } else {
    stability = Math.max(0.5, stability * 0.6);
  }

  // --- Counts ---
  const correct_count = wasCorrect ? progress.correct_count + 1 : progress.correct_count;
  const wrong_count = wasCorrect ? progress.wrong_count : progress.wrong_count + 1;
  const hint_count = usedHint ? progress.hint_count + 1 : progress.hint_count;
  const total_attempts = progress.total_attempts + 1;

  // --- Streak ---
  const streak = wasCorrect ? progress.streak + 1 : 0;

  // --- Average response time (running average) ---
  const avg_response_time = total_attempts === 1
    ? responseTimeMs
    : ((progress.avg_response_time * progress.total_attempts) + responseTimeMs) / total_attempts;

  // --- Weakness score ---
  // Based on error rate, hint dependency, and recent performance
  let weakness_score = 0;
  if (total_attempts > 0) {
    const errorRate = wrong_count / total_attempts;
    const hintRate = hint_count / total_attempts;
    weakness_score = (errorRate * 0.6) + (hintRate * 0.2);
  }
  // Boost weakness for recent failures
  if (!wasCorrect) {
    weakness_score = Math.min(1.0, weakness_score + 0.15);
  }
  // Hint usage penalty
  if (usedHint) {
    weakness_score = Math.min(1.0, weakness_score + 0.05);
  }
  // Reduce weakness for strong streaks
  if (streak >= 5) {
    weakness_score = Math.max(0, weakness_score - 0.1);
  }

  // --- Mastery score ---
  // Composite of accuracy, consistency (streak), and ease factor
  const accuracy = total_attempts > 0 ? correct_count / total_attempts : 0;
  const streakBonus = Math.min(streak / 10, 0.3);
  const easeBonus = Math.min((ease_factor - 1.3) / (3.0 - 1.3) * 0.2, 0.2);
  const mastery_score = Math.min(1.0, (accuracy * 0.5) + streakBonus + easeBonus);

  // --- Confidence estimate ---
  const confidence_estimate = calculateConfidence(
    correct_count, wrong_count, streak, stability, ease_factor
  );

  // --- Weak words get shorter intervals ---
  if (weakness_score > 0.3 && wasCorrect) {
    interval_days = Math.max(0.5, interval_days * 0.6);
  }

  // --- Calculate next review date ---
  const nextReviewDate = new Date();
  nextReviewDate.setTime(nextReviewDate.getTime() + interval_days * 24 * 60 * 60 * 1000);
  const next_review_at = nextReviewDate.toISOString();

  // --- Memory strength ---
  const memory_strength = calculateMemoryStrength({
    last_reviewed_at: now,
    stability,
    interval_days,
    repetitions,
    correct_count,
    wrong_count,
  });

  // Update the progress record
  db.prepare(`
    UPDATE user_word_progress SET
      ease_factor = ?, interval_days = ?, repetitions = ?,
      memory_strength = ?, stability = ?, weakness_score = ?,
      mastery_score = ?, correct_count = ?, wrong_count = ?,
      hint_count = ?, streak = ?, total_attempts = ?,
      avg_response_time = ?, confidence_estimate = ?,
      last_reviewed_at = ?, next_review_at = ?, last_quality = ?
    WHERE user_id = ? AND word_id = ?
  `).run(
    ease_factor, interval_days, repetitions,
    memory_strength, stability, weakness_score,
    mastery_score, correct_count, wrong_count,
    hint_count, streak, total_attempts,
    avg_response_time, confidence_estimate,
    now, next_review_at, quality,
    userId, wordId
  );

  return {
    ease_factor, interval_days, repetitions,
    memory_strength, stability, weakness_score,
    mastery_score, correct_count, wrong_count,
    hint_count, streak, total_attempts,
    avg_response_time, confidence_estimate,
    last_reviewed_at: now, next_review_at, last_quality: quality,
  };
}

/**
 * Get words due for review, ordered by priority.
 */
export function getDueReviews(userId, limit = 20) {
  const db = getDb();
  const now = new Date().toISOString();

  const rows = db.prepare(`
    SELECT p.*, w.word, w.meaning, w.lesson_id, w.difficulty, w.exam_importance,
           l.name AS lesson_name, l.name_ar AS lesson_name_ar
    FROM user_word_progress p
    JOIN words w ON p.word_id = w.id
    JOIN lessons l ON w.lesson_id = l.id
    WHERE p.user_id = ? AND p.next_review_at <= ?
    ORDER BY p.weakness_score DESC,
             p.next_review_at ASC,
             w.exam_importance DESC
    LIMIT ?
  `).all(userId, now, limit);

  return rows.map(row => ({
    ...row,
    overdueDays: calculateOverdueDays(row.next_review_at),
    priority: getReviewPriority(row),
  }));
}

/**
 * Get words with highest weakness_score.
 */
export function getWeakWords(userId, limit = 20) {
  const db = getDb();

  return db.prepare(`
    SELECT p.*, w.word, w.meaning, w.lesson_id, w.difficulty, w.root,
           w.exam_importance, l.name AS lesson_name, l.name_ar AS lesson_name_ar
    FROM user_word_progress p
    JOIN words w ON p.word_id = w.id
    JOIN lessons l ON w.lesson_id = l.id
    WHERE p.user_id = ? AND p.weakness_score > 0
    ORDER BY p.weakness_score DESC, p.wrong_count DESC
    LIMIT ?
  `).all(userId, limit);
}

/**
 * Calculate memory strength using exponential decay model.
 * Returns a value between 0 and 1.
 */
export function calculateMemoryStrength(progress) {
  const { last_reviewed_at, stability, repetitions, correct_count, wrong_count } = progress;

  if (!last_reviewed_at || repetitions === 0) {
    return 0;
  }

  const lastReview = new Date(last_reviewed_at);
  const now = new Date();
  const elapsedDays = (now - lastReview) / (1000 * 60 * 60 * 24);

  // Exponential decay: R = e^(-t/S) where t=elapsed time, S=stability
  const effectiveStability = Math.max(0.5, stability);
  const retention = Math.exp(-elapsedDays / effectiveStability);

  // Boost from accuracy
  const totalAttempts = correct_count + wrong_count;
  const accuracyBoost = totalAttempts > 0
    ? (correct_count / totalAttempts) * 0.1
    : 0;

  return Math.min(1.0, Math.max(0, retention + accuracyBoost));
}

/**
 * Calculate review priority score. Higher = more urgent.
 */
export function getReviewPriority(progress) {
  const overdueDays = calculateOverdueDays(progress.next_review_at);
  const weaknessWeight = (progress.weakness_score || 0) * 40;
  const overdueWeight = Math.min(overdueDays, 30) * 2;
  const importanceWeight = (progress.exam_importance || 3) * 3;

  // Factor in memory strength decay
  const memStrength = progress.memory_strength || 0;
  const decayWeight = (1 - memStrength) * 15;

  return weaknessWeight + overdueWeight + importanceWeight + decayWeight;
}

/**
 * Calculate confidence estimate from various signals.
 */
function calculateConfidence(correctCount, wrongCount, streak, stability, easeFactor) {
  const total = correctCount + wrongCount;
  if (total === 0) return 0.5;

  const accuracy = correctCount / total;
  const streakFactor = Math.min(streak / 10, 0.2);
  const stabilityFactor = Math.min(stability / 10, 0.2);
  const easeFactor2 = Math.min((easeFactor - 1.3) / 1.7 * 0.1, 0.1);

  return Math.min(1.0, Math.max(0, accuracy * 0.5 + streakFactor + stabilityFactor + easeFactor2));
}

/**
 * Calculate how many days overdue a review is.
 */
function calculateOverdueDays(nextReviewAt) {
  if (!nextReviewAt) return 0;
  const reviewDate = new Date(nextReviewAt);
  const now = new Date();
  const diff = (now - reviewDate) / (1000 * 60 * 60 * 24);
  return Math.max(0, diff);
}
