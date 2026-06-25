import { getDb } from '../config/database.js';

/**
 * Adaptive Learning Service
 * Adjusts difficulty, question types, and scheduling based on user performance.
 */

/**
 * Analyze user performance and return adaptive settings.
 */
export function getAdaptiveSettings(userId) {
  const db = getDb();

  const performance = getPerformanceProfile(db, userId);
  const suggestedDifficulty = calculateSuggestedDifficulty(performance);
  const suggestedQuestionTypes = getSuggestedQuestionTypes(db, userId, performance);
  const suggestedLessons = getSuggestedLessons(db, userId);
  const reviewIntensity = calculateReviewIntensity(performance);
  const distractorHardness = calculateDistractorHardness(performance);

  return {
    suggestedDifficulty,
    suggestedQuestionTypes,
    suggestedLessons,
    reviewIntensity,
    distractorHardness,
  };
}

/**
 * Mid-session difficulty adjustment based on session performance.
 * @param {number} userId
 * @param {{ correctCount, wrongCount, totalAnswered, avgResponseTime, currentDifficulty }} sessionPerformance
 * @returns {{ newDifficulty, adjustmentReason }}
 */
export function adjustSessionDifficulty(userId, sessionPerformance) {
  const { correctCount, wrongCount, totalAnswered, avgResponseTime, currentDifficulty } = sessionPerformance;

  if (totalAnswered < 3) {
    return { newDifficulty: currentDifficulty, adjustmentReason: 'Not enough data yet' };
  }

  const accuracy = totalAnswered > 0 ? correctCount / totalAnswered : 0;
  let newDifficulty = currentDifficulty;
  let adjustmentReason = 'No change needed';

  // Too easy: high accuracy + fast responses
  if (accuracy >= 0.9 && avgResponseTime < 4000) {
    newDifficulty = Math.min(5, currentDifficulty + 1);
    adjustmentReason = 'Increasing difficulty: high accuracy with fast responses';
  }
  // Easy: good accuracy
  else if (accuracy >= 0.8 && totalAnswered >= 5) {
    newDifficulty = Math.min(5, currentDifficulty + 0.5);
    adjustmentReason = 'Slightly increasing difficulty: consistently good performance';
  }
  // Too hard: low accuracy
  else if (accuracy < 0.4 && totalAnswered >= 5) {
    newDifficulty = Math.max(1, currentDifficulty - 1);
    adjustmentReason = 'Decreasing difficulty: accuracy below 40%';
  }
  // Hard: below-average accuracy
  else if (accuracy < 0.6 && totalAnswered >= 5) {
    newDifficulty = Math.max(1, currentDifficulty - 0.5);
    adjustmentReason = 'Slightly decreasing difficulty: below-average accuracy';
  }

  // Clamp to valid range
  newDifficulty = Math.max(1, Math.min(5, Math.round(newDifficulty)));

  return { newDifficulty, adjustmentReason };
}

// ==================== Internal Functions ====================

function getPerformanceProfile(db, userId) {
  // Overall stats
  const overall = db.prepare(`
    SELECT
      COUNT(*) AS total_reviews,
      SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) AS total_correct,
      ROUND(AVG(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0.0 END) * 100, 1) AS overall_accuracy,
      AVG(response_time_ms) AS avg_response_time,
      SUM(used_hint) AS total_hints
    FROM review_log
    WHERE user_id = ?
  `).get(userId);

  // Recent (last 7 days) stats
  const recent = db.prepare(`
    SELECT
      COUNT(*) AS total_reviews,
      ROUND(AVG(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0.0 END) * 100, 1) AS accuracy,
      AVG(response_time_ms) AS avg_response_time
    FROM review_log
    WHERE user_id = ? AND created_at >= DATE('now', '-7 days')
  `).get(userId);

  // Progress summary
  const progress = db.prepare(`
    SELECT
      COUNT(*) AS words_attempted,
      AVG(mastery_score) AS avg_mastery,
      AVG(weakness_score) AS avg_weakness,
      SUM(CASE WHEN mastery_score >= 0.8 THEN 1 ELSE 0 END) AS mastered_count
    FROM user_word_progress
    WHERE user_id = ? AND total_attempts > 0
  `).get(userId);

  return {
    overall: overall || { total_reviews: 0, total_correct: 0, overall_accuracy: 0, avg_response_time: 0, total_hints: 0 },
    recent: recent || { total_reviews: 0, accuracy: 0, avg_response_time: 0 },
    progress: progress || { words_attempted: 0, avg_mastery: 0, avg_weakness: 0, mastered_count: 0 },
  };
}

function calculateSuggestedDifficulty(performance) {
  const recentAccuracy = performance.recent.accuracy || 0;
  const overallAccuracy = performance.overall.overall_accuracy || 0;
  const avgMastery = performance.progress.avg_mastery || 0;

  // Use weighted average of recent and overall accuracy
  const effectiveAccuracy = performance.recent.total_reviews > 10
    ? recentAccuracy * 0.7 + overallAccuracy * 0.3
    : overallAccuracy;

  if (effectiveAccuracy >= 90) return 5;
  if (effectiveAccuracy >= 80) return 4;
  if (effectiveAccuracy >= 65) return 3;
  if (effectiveAccuracy >= 50) return 2;
  return 1;
}

function getSuggestedQuestionTypes(db, userId, performance) {
  // Get performance per question type
  const typePerf = db.prepare(`
    SELECT question_type,
           COUNT(*) AS total,
           ROUND(AVG(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0.0 END) * 100, 1) AS accuracy
    FROM review_log
    WHERE user_id = ?
    GROUP BY question_type
    ORDER BY accuracy ASC
  `).all(userId);

  // Focus on weak question types
  const weakTypes = typePerf
    .filter(t => t.accuracy < 70 && t.total >= 5)
    .map(t => t.question_type);

  // Mix of weak types + standard types
  const standard = ['mcq', 'typing', 'fill_blank'];
  const suggested = [...new Set([...weakTypes, ...standard])];

  return suggested.length > 0 ? suggested : standard;
}

function getSuggestedLessons(db, userId) {
  // Lessons with lowest accuracy or highest weakness
  return db.prepare(`
    SELECT l.id, l.name, l.name_ar,
           COUNT(p.id) AS word_count,
           AVG(p.weakness_score) AS avg_weakness,
           ROUND(
             CASE WHEN SUM(p.correct_count) + SUM(p.wrong_count) > 0
             THEN CAST(SUM(p.correct_count) AS REAL) / (SUM(p.correct_count) + SUM(p.wrong_count)) * 100
             ELSE 0 END, 1
           ) AS accuracy_pct
    FROM user_word_progress p
    JOIN words w ON p.word_id = w.id
    JOIN lessons l ON w.lesson_id = l.id
    WHERE p.user_id = ? AND p.total_attempts > 0
    GROUP BY l.id
    HAVING avg_weakness > 0.2 OR accuracy_pct < 70
    ORDER BY avg_weakness DESC, accuracy_pct ASC
    LIMIT 5
  `).all(userId);
}

function calculateReviewIntensity(performance) {
  const avgWeakness = performance.progress.avg_weakness || 0;
  const recentAccuracy = performance.recent.accuracy || 0;
  const totalReviews = performance.recent.total_reviews || 0;

  // High weakness or low accuracy → intensive
  if (avgWeakness > 0.4 || (recentAccuracy < 50 && totalReviews >= 10)) {
    return 'intensive';
  }
  // Low activity or moderate weakness → normal
  if (avgWeakness > 0.2 || totalReviews < 5) {
    return 'normal';
  }
  // Good performance → light
  return 'light';
}

function calculateDistractorHardness(performance) {
  const accuracy = performance.recent.accuracy || performance.overall.overall_accuracy || 0;

  if (accuracy >= 85) return 'hard';
  if (accuracy >= 60) return 'medium';
  return 'easy';
}
