import { getDb } from '../config/database.js';

/**
 * Gamification Engine
 * Handles XP, levels, streaks, achievements, and daily/weekly progress.
 */

// XP reward constants
const XP_REWARDS = {
  correct: 10,
  correct_with_hint: 5,
  wrong: 2, // participation XP
  streak_bonus: 20,
  perfect_session: 50,
  lesson_complete: 30,
};

/**
 * Award XP to a user.
 * @returns {{ newXP, newLevel, leveledUp, previousLevel }}
 */
export function awardXP(userId, amount, reason = 'practice') {
  const db = getDb();

  const gamification = db.prepare('SELECT * FROM user_gamification WHERE user_id = ?').get(userId);
  if (!gamification) {
    db.prepare('INSERT INTO user_gamification (user_id) VALUES (?)').run(userId);
    return awardXP(userId, amount, reason);
  }

  const previousXP = gamification.xp;
  const previousLevel = gamification.level;
  const newXP = previousXP + amount;
  const newLevel = getLevelForXP(newXP);
  const leveledUp = newLevel > previousLevel;

  db.prepare('UPDATE user_gamification SET xp = ?, level = ? WHERE user_id = ?')
    .run(newXP, newLevel, userId);

  return { newXP, newLevel, leveledUp, previousLevel };
}

/**
 * Check all achievements and unlock any newly earned ones.
 * @returns {Array} Newly unlocked achievements
 */
export function checkAchievements(userId) {
  const db = getDb();
  const newlyUnlocked = [];

  // Get all achievements not yet unlocked by this user
  const unearned = db.prepare(`
    SELECT a.* FROM achievements a
    WHERE a.id NOT IN (
      SELECT achievement_id FROM user_achievements WHERE user_id = ?
    )
  `).all(userId);

  if (unearned.length === 0) return [];

  // Gather user stats
  const stats = gatherUserStats(db, userId);

  for (const achievement of unearned) {
    if (isAchievementMet(achievement, stats)) {
      // Unlock the achievement
      db.prepare('INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)')
        .run(userId, achievement.id);

      // Award XP for the achievement
      awardXP(userId, achievement.xp_reward, `achievement:${achievement.id}`);

      newlyUnlocked.push(achievement);
    }
  }

  return newlyUnlocked;
}

/**
 * Update daily streak.
 * @returns {{ streak, longestStreak, isNewDay }}
 */
export function updateStreak(userId) {
  const db = getDb();

  const gamification = db.prepare('SELECT * FROM user_gamification WHERE user_id = ?').get(userId);
  if (!gamification) {
    db.prepare('INSERT INTO user_gamification (user_id) VALUES (?)').run(userId);
    return updateStreak(userId);
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const lastActivity = gamification.last_activity_date;

  let newStreak = gamification.current_streak;
  let isNewDay = false;

  if (lastActivity !== today) {
    isNewDay = true;

    if (lastActivity) {
      const lastDate = new Date(lastActivity);
      const todayDate = new Date(today);
      const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Consecutive day - extend streak
        newStreak += 1;
      } else if (diffDays > 1) {
        // Streak broken - reset
        newStreak = 1;
      }
    } else {
      // First activity ever
      newStreak = 1;
    }

    // Reset daily progress on new day
    let weeklyProgress = gamification.weekly_progress;

    // Check if it's a new week (Monday reset)
    const todayDay = new Date(today).getDay();
    if (todayDay === 1 && lastActivity) {
      const lastDay = new Date(lastActivity).getDay();
      if (lastDay !== 1) {
        weeklyProgress = 0;
      }
    }

    const longestStreak = Math.max(gamification.longest_streak, newStreak);

    db.prepare(`
      UPDATE user_gamification SET
        current_streak = ?, longest_streak = ?,
        last_activity_date = ?, daily_progress = 0,
        weekly_progress = ?
      WHERE user_id = ?
    `).run(newStreak, longestStreak, today, weeklyProgress, userId);

    return { streak: newStreak, longestStreak, isNewDay };
  }

  // Same day - no streak change
  return {
    streak: gamification.current_streak,
    longestStreak: gamification.longest_streak,
    isNewDay: false,
  };
}

/**
 * Update daily and weekly progress.
 */
export function updateDailyProgress(userId, questionsAnswered = 1) {
  const db = getDb();

  const gamification = db.prepare('SELECT * FROM user_gamification WHERE user_id = ?').get(userId);
  if (!gamification) return;

  const newDaily = gamification.daily_progress + questionsAnswered;
  const newWeekly = gamification.weekly_progress + questionsAnswered;

  const dailyGoalMet = newDaily >= gamification.daily_goal && gamification.daily_progress < gamification.daily_goal;
  const weeklyGoalMet = newWeekly >= gamification.weekly_goal && gamification.weekly_progress < gamification.weekly_goal;

  db.prepare(`
    UPDATE user_gamification SET daily_progress = ?, weekly_progress = ? WHERE user_id = ?
  `).run(newDaily, newWeekly, userId);

  return {
    dailyProgress: newDaily,
    weeklyProgress: newWeekly,
    dailyGoal: gamification.daily_goal,
    weeklyGoal: gamification.weekly_goal,
    dailyGoalMet,
    weeklyGoalMet,
  };
}

/**
 * Calculate level from XP. Level N requires N*100 cumulative XP.
 * Level 1: 0-99, Level 2: 100-299, Level 3: 300-599, etc.
 * Sum of 1..N * 100 = N*(N+1)*50
 * Solve: N*(N+1)*50 <= xp for largest N.
 */
export function getLevelForXP(xp) {
  if (xp < 100) return 1;
  // Solve N^2 + N - xp/50 <= 0
  // N = floor((-1 + sqrt(1 + 4*xp/50)) / 2)
  const n = Math.floor((-1 + Math.sqrt(1 + (4 * xp) / 50)) / 2);
  return Math.max(1, n);
}

/**
 * Calculate cumulative XP needed for a given level.
 */
export function getXPForLevel(level) {
  return level * (level + 1) * 50;
}

/**
 * Get XP reward constants.
 */
export function getXPRewards() {
  return { ...XP_REWARDS };
}

// ==================== Internal Functions ====================

function gatherUserStats(db, userId) {
  // Total correct answers
  const reviewStats = db.prepare(`
    SELECT
      SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) AS correct_answers,
      COUNT(*) AS total_answers
    FROM review_log WHERE user_id = ?
  `).get(userId);

  // Streak info
  const gamification = db.prepare('SELECT * FROM user_gamification WHERE user_id = ?').get(userId);

  // Session stats
  const sessionStats = db.prepare(`
    SELECT
      COUNT(*) AS total_sessions,
      SUM(CASE WHEN correct_count = total_questions AND total_questions > 0 THEN 1 ELSE 0 END) AS perfect_sessions,
      SUM(CASE WHEN hint_count = 0 AND total_questions > 0 THEN 1 ELSE 0 END) AS no_hint_sessions
    FROM practice_sessions
    WHERE user_id = ? AND completed_at IS NOT NULL
  `).get(userId);

  // Mastered words count
  const masteryStats = db.prepare(`
    SELECT COUNT(*) AS words_mastered FROM user_word_progress
    WHERE user_id = ? AND mastery_score >= 0.8
  `).get(userId);

  // Fast answers (< 3000ms and correct)
  const fastAnswers = db.prepare(`
    SELECT COUNT(*) AS count FROM review_log
    WHERE user_id = ? AND response_time_ms < 3000 AND was_correct = 1
  `).get(userId);

  // Lessons completed (sessions)
  const lessonsCompleted = db.prepare(`
    SELECT COUNT(DISTINCT lesson_ids) AS count FROM practice_sessions
    WHERE user_id = ? AND completed_at IS NOT NULL
  `).get(userId);

  // Check for special achievements
  const currentHour = new Date().getHours();
  const nightPractice = currentHour >= 0 && currentHour < 5 ? 1 : 0;
  const earlyPractice = currentHour >= 4 && currentHour < 7 ? 1 : 0;

  // Modes tried
  const modesTried = db.prepare(`
    SELECT COUNT(DISTINCT mode) AS count FROM practice_sessions WHERE user_id = ?
  `).get(userId);

  // Words recovered (went from weakness > 0.5 to mastery > 0.8)
  const wordsRecovered = db.prepare(`
    SELECT COUNT(*) AS count FROM user_word_progress
    WHERE user_id = ? AND mastery_score >= 0.8 AND wrong_count > 3
  `).get(userId);

  // Boss battles
  const bossBattles = db.prepare(`
    SELECT COUNT(*) AS count FROM practice_sessions
    WHERE user_id = ? AND mode = 'boss_battle' AND completed_at IS NOT NULL
  `).get(userId);

  // Survival mode
  const survivalStats = db.prepare(`
    SELECT MAX(total_questions) AS max_questions FROM practice_sessions
    WHERE user_id = ? AND mode = 'survival' AND completed_at IS NOT NULL
  `).get(userId);

  // Marathon
  const marathonStats = db.prepare(`
    SELECT COUNT(*) AS count FROM practice_sessions
    WHERE user_id = ? AND mode = 'marathon' AND total_questions >= 50 AND completed_at IS NOT NULL
  `).get(userId);

  // Daily/weekly goal met
  const dailyGoalMet = gamification && gamification.daily_progress >= gamification.daily_goal ? 1 : 0;
  const weeklyGoalMet = gamification && gamification.weekly_progress >= gamification.weekly_goal ? 1 : 0;

  return {
    correct_answers: reviewStats?.correct_answers || 0,
    total_answers: reviewStats?.total_answers || 0,
    streak_days: gamification?.current_streak || 0,
    level_reached: gamification?.level || 1,
    perfect_sessions: sessionStats?.perfect_sessions || 0,
    no_hint_sessions: sessionStats?.no_hint_sessions || 0,
    words_mastered: masteryStats?.words_mastered || 0,
    fast_answers: fastAnswers?.count || 0,
    lessons_completed: lessonsCompleted?.count || 0,
    night_practice: nightPractice,
    early_practice: earlyPractice,
    modes_tried: modesTried?.count || 0,
    word_recovered: wordsRecovered?.count || 0,
    boss_battles: bossBattles?.count || 0,
    survival_30: (survivalStats?.max_questions || 0) >= 30 ? 1 : 0,
    marathon_50: marathonStats?.count || 0,
    daily_goal_met: dailyGoalMet,
    weekly_goal_met: weeklyGoalMet,
  };
}

function isAchievementMet(achievement, stats) {
  const value = stats[achievement.requirement_type];
  if (value === undefined || value === null) return false;
  return value >= achievement.requirement_value;
}
