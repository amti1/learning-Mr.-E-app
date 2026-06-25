import { getDb } from '../config/database.js';

/**
 * Deep Error Analysis Service
 * Provides comprehensive mistake analysis and weakness profiling.
 */

/**
 * Full error analysis report for a user.
 */
export function getUserErrorReport(userId) {
  const db = getDb();

  return {
    topWeakWords: getTopWeakWords(db, userId),
    topWeakLessons: getTopWeakLessons(db, userId),
    confusionHotspots: getConfusionHotspots(db, userId),
    questionTypePerformance: getQuestionTypePerformance(db, userId),
    accuracyOverTime: getAccuracyOverTime(db, userId),
    hintDependency: getHintDependency(db, userId),
    improvementTrend: getImprovementTrend(db, userId),
    recommendedReview: getRecommendedReview(db, userId),
  };
}

/**
 * Get confusion matrix: which words get confused with which.
 */
export function getConfusionMatrix(userId, lessonId = null) {
  const db = getDb();

  let query = `
    SELECT rl.word_id, w1.word AS source_word, rl.chosen_distractor_id,
           w2.word AS confused_with, COUNT(*) AS times
    FROM review_log rl
    JOIN words w1 ON rl.word_id = w1.id
    LEFT JOIN words w2 ON rl.chosen_distractor_id = w2.id
    WHERE rl.user_id = ? AND rl.was_correct = 0 AND rl.chosen_distractor_id IS NOT NULL
  `;
  const params = [userId];

  if (lessonId) {
    query += ' AND w1.lesson_id = ?';
    params.push(lessonId);
  }

  query += `
    GROUP BY rl.word_id, rl.chosen_distractor_id
    ORDER BY times DESC
    LIMIT 50
  `;

  return db.prepare(query).all(...params);
}

/**
 * Get categorized weakness summary.
 */
export function getWeaknessProfile(userId) {
  const db = getDb();

  // Get overall stats
  const overall = db.prepare(`
    SELECT
      COUNT(*) AS total_words_attempted,
      SUM(CASE WHEN weakness_score > 0.5 THEN 1 ELSE 0 END) AS critical_weakness_count,
      SUM(CASE WHEN weakness_score > 0.3 AND weakness_score <= 0.5 THEN 1 ELSE 0 END) AS moderate_weakness_count,
      SUM(CASE WHEN weakness_score > 0 AND weakness_score <= 0.3 THEN 1 ELSE 0 END) AS mild_weakness_count,
      SUM(CASE WHEN mastery_score >= 0.8 THEN 1 ELSE 0 END) AS mastered_count,
      AVG(weakness_score) AS avg_weakness,
      AVG(mastery_score) AS avg_mastery,
      AVG(avg_response_time) AS avg_response_time
    FROM user_word_progress
    WHERE user_id = ? AND total_attempts > 0
  `).get(userId);

  // Weakness by difficulty level
  const byDifficulty = db.prepare(`
    SELECT w.difficulty,
           COUNT(*) AS word_count,
           AVG(p.weakness_score) AS avg_weakness,
           SUM(p.correct_count) AS total_correct,
           SUM(p.wrong_count) AS total_wrong
    FROM user_word_progress p
    JOIN words w ON p.word_id = w.id
    WHERE p.user_id = ? AND p.total_attempts > 0
    GROUP BY w.difficulty
    ORDER BY w.difficulty
  `).all(userId);

  // Weakness by question direction
  const byDirection = db.prepare(`
    SELECT question_direction,
           COUNT(*) AS total_answers,
           SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) AS correct,
           ROUND(AVG(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0.0 END) * 100, 1) AS accuracy_pct
    FROM review_log
    WHERE user_id = ? AND question_direction IS NOT NULL
    GROUP BY question_direction
    ORDER BY accuracy_pct ASC
  `).all(userId);

  // Speed profile
  const speedProfile = db.prepare(`
    SELECT
      SUM(CASE WHEN response_time_ms < 3000 THEN 1 ELSE 0 END) AS fast_answers,
      SUM(CASE WHEN response_time_ms BETWEEN 3000 AND 8000 THEN 1 ELSE 0 END) AS normal_answers,
      SUM(CASE WHEN response_time_ms > 8000 THEN 1 ELSE 0 END) AS slow_answers,
      AVG(response_time_ms) AS avg_time_ms
    FROM review_log
    WHERE user_id = ?
  `).get(userId);

  return {
    overall: overall || {},
    byDifficulty,
    byDirection,
    speedProfile: speedProfile || {},
  };
}

// ==================== Internal Functions ====================

function getTopWeakWords(db, userId) {
  return db.prepare(`
    SELECT p.word_id, w.word, w.meaning, w.lesson_id, l.name AS lesson_name,
           p.weakness_score, p.wrong_count, p.correct_count, p.total_attempts,
           p.streak, p.hint_count
    FROM user_word_progress p
    JOIN words w ON p.word_id = w.id
    JOIN lessons l ON w.lesson_id = l.id
    WHERE p.user_id = ? AND p.weakness_score > 0
    ORDER BY p.weakness_score DESC
    LIMIT 10
  `).all(userId);
}

function getTopWeakLessons(db, userId) {
  return db.prepare(`
    SELECT l.id AS lesson_id, l.name, l.name_ar,
           COUNT(p.id) AS word_count,
           SUM(p.correct_count) AS total_correct,
           SUM(p.wrong_count) AS total_wrong,
           ROUND(
             CASE WHEN SUM(p.correct_count) + SUM(p.wrong_count) > 0
             THEN CAST(SUM(p.correct_count) AS REAL) / (SUM(p.correct_count) + SUM(p.wrong_count)) * 100
             ELSE 0 END, 1
           ) AS accuracy_pct,
           AVG(p.weakness_score) AS avg_weakness
    FROM user_word_progress p
    JOIN words w ON p.word_id = w.id
    JOIN lessons l ON w.lesson_id = l.id
    WHERE p.user_id = ? AND p.total_attempts > 0
    GROUP BY l.id
    ORDER BY accuracy_pct ASC
    LIMIT 10
  `).all(userId);
}

function getConfusionHotspots(db, userId) {
  return db.prepare(`
    SELECT rl.word_id, w1.word AS source_word, w1.meaning AS source_meaning,
           rl.chosen_distractor_id, w2.word AS confused_word, w2.meaning AS confused_meaning,
           COUNT(*) AS times
    FROM review_log rl
    JOIN words w1 ON rl.word_id = w1.id
    LEFT JOIN words w2 ON rl.chosen_distractor_id = w2.id
    WHERE rl.user_id = ? AND rl.was_correct = 0 AND rl.chosen_distractor_id IS NOT NULL
    GROUP BY rl.word_id, rl.chosen_distractor_id
    ORDER BY times DESC
    LIMIT 15
  `).all(userId);
}

function getQuestionTypePerformance(db, userId) {
  return db.prepare(`
    SELECT question_type,
           COUNT(*) AS total_answers,
           SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) AS correct,
           SUM(CASE WHEN was_correct = 0 THEN 1 ELSE 0 END) AS wrong,
           ROUND(AVG(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0.0 END) * 100, 1) AS accuracy_pct,
           ROUND(AVG(response_time_ms), 0) AS avg_time_ms,
           SUM(used_hint) AS hint_usage
    FROM review_log
    WHERE user_id = ?
    GROUP BY question_type
    ORDER BY accuracy_pct ASC
  `).all(userId);
}

function getAccuracyOverTime(db, userId) {
  return db.prepare(`
    SELECT DATE(created_at) AS date,
           COUNT(*) AS total_answers,
           SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) AS correct,
           ROUND(AVG(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0.0 END) * 100, 1) AS accuracy_pct,
           ROUND(AVG(response_time_ms), 0) AS avg_time_ms
    FROM review_log
    WHERE user_id = ? AND created_at >= DATE('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all(userId);
}

function getHintDependency(db, userId) {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_answers,
      SUM(used_hint) AS total_hints_used,
      ROUND(AVG(CASE WHEN used_hint = 1 THEN 1.0 ELSE 0.0 END) * 100, 1) AS hint_rate_pct,
      ROUND(AVG(CASE WHEN used_hint = 1 AND was_correct = 1 THEN 1.0
                      WHEN used_hint = 1 AND was_correct = 0 THEN 0.0
                      ELSE NULL END) * 100, 1) AS accuracy_with_hint_pct,
      ROUND(AVG(CASE WHEN used_hint = 0 AND was_correct = 1 THEN 1.0
                      WHEN used_hint = 0 AND was_correct = 0 THEN 0.0
                      ELSE NULL END) * 100, 1) AS accuracy_without_hint_pct
    FROM review_log
    WHERE user_id = ?
  `).get(userId);

  return stats || {};
}

function getImprovementTrend(db, userId) {
  // Compare last 7 days vs previous 7 days
  const recent = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) AS correct,
      ROUND(AVG(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0.0 END) * 100, 1) AS accuracy_pct,
      ROUND(AVG(response_time_ms), 0) AS avg_time_ms
    FROM review_log
    WHERE user_id = ? AND created_at >= DATE('now', '-7 days')
  `).get(userId);

  const older = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) AS correct,
      ROUND(AVG(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0.0 END) * 100, 1) AS accuracy_pct,
      ROUND(AVG(response_time_ms), 0) AS avg_time_ms
    FROM review_log
    WHERE user_id = ? AND created_at >= DATE('now', '-14 days') AND created_at < DATE('now', '-7 days')
  `).get(userId);

  const recentAccuracy = recent?.accuracy_pct || 0;
  const olderAccuracy = older?.accuracy_pct || 0;
  const trend = recentAccuracy - olderAccuracy;

  return {
    recent: recent || {},
    older: older || {},
    accuracyChange: trend,
    direction: trend > 0 ? 'improving' : trend < 0 ? 'declining' : 'stable',
    speedChange: (recent?.avg_time_ms || 0) - (older?.avg_time_ms || 0),
  };
}

function getRecommendedReview(db, userId) {
  // Words that need attention: high weakness, recently failed, or overdue
  return db.prepare(`
    SELECT p.word_id, w.word, w.meaning, w.lesson_id, l.name AS lesson_name,
           p.weakness_score, p.mastery_score, p.next_review_at, p.streak,
           p.wrong_count, p.correct_count
    FROM user_word_progress p
    JOIN words w ON p.word_id = w.id
    JOIN lessons l ON w.lesson_id = l.id
    WHERE p.user_id = ?
      AND (p.weakness_score > 0.2
           OR (p.next_review_at <= DATETIME('now') AND p.mastery_score < 0.5)
           OR p.last_quality <= 2)
    ORDER BY p.weakness_score DESC, p.next_review_at ASC
    LIMIT 20
  `).all(userId);
}
