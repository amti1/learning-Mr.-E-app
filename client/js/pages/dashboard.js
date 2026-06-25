import api from '../api.js';
import { renderStatGrid } from '../components/statsWidget.js';
import { renderProgressBar, renderXPBar } from '../components/progressBar.js';
import { navigate } from '../router.js';
import { on, delegate } from '../utils/dom.js';
import { timeAgo } from '../utils/format.js';

export async function renderDashboardPage() {
  let data;
  try { data = await api.getDashboard(); } catch { data = {}; }

  const user = JSON.parse(localStorage.getItem('arabic_lp_user') || '{}');
  const g = data.gamification || {};
  const accuracy = data.accuracy || 0;

  const stats = [
    { icon: '📚', label: 'Total Words', value: data.totalWords || 0 },
    { icon: '✅', label: 'Mastered', value: data.masteredWords || 0 },
    { icon: '⚠️', label: 'Weak Words', value: data.weakWords || 0 },
    { icon: '🔄', label: 'Due for Review', value: data.dueForReview || 0 },
    { icon: '🎯', label: 'Accuracy', value: `${accuracy}%` },
    { icon: '📝', label: 'Total Answered', value: data.totalAnswered || 0 },
  ];

  const recentSessions = (data.recentSessions || []).map(s => `
    <div class="session-item card-glass">
      <div class="session-mode">${getModeIcon(s.mode)} ${s.mode}</div>
      <div class="session-stats">${s.correct_count || 0}/${s.total_questions || 0} correct</div>
      <div class="session-time">${timeAgo(s.started_at)}</div>
    </div>
  `).join('') || '<p class="text-muted">No sessions yet. Start practicing!</p>';

  return `
    <div class="dashboard-page page-content">
      <div class="page-header">
        <div>
          <h1>Welcome back, ${user.display_name || user.username || 'Student'} 👋</h1>
          <p class="text-muted">Ready to learn some Arabic today?</p>
        </div>
        <div class="header-badges" style="display:flex;align-items:center;gap:1rem;">
          <div class="streak-display ${g.current_streak > 0 ? 'streak-active' : ''}">
            <span class="streak-fire-lg">🔥</span>
            <span class="streak-num">${g.current_streak || 0}</span>
            <span class="streak-label">day streak</span>
          </div>
          <button id="btn-logout" class="btn btn-outline" style="padding:0.5rem 1rem;border-color:rgba(255,255,255,0.2);font-size:0.9rem;">
            🚪 Sign Out
          </button>
        </div>
      </div>

      <div class="dashboard-level-bar">
        <div class="level-info">
          <span class="level-badge-lg">Level ${g.level || 1}</span>
          ${renderXPBar(g.xp || 0, ((g.level || 1) + 1) * 100, (g.level || 1) * 100)}
        </div>
      </div>

      <div class="dashboard-goals">
        <div class="goal-card card-glass">
          <h3>📅 Daily Goal</h3>
          ${renderProgressBar(g.daily_progress || 0, g.daily_goal || 20, `${g.daily_progress || 0} / ${g.daily_goal || 20} questions`)}
        </div>
        <div class="goal-card card-glass">
          <h3>📆 Weekly Goal</h3>
          ${renderProgressBar(g.weekly_progress || 0, g.weekly_goal || 100, `${g.weekly_progress || 0} / ${g.weekly_goal || 100} questions`)}
        </div>
      </div>

      ${renderStatGrid(stats)}

      <div class="dashboard-actions">
        <button class="btn btn-primary btn-lg action-card" id="dash-practice">
          <span class="action-icon">🎯</span>
          <span>Start Practice</span>
        </button>
        <button class="btn btn-accent btn-lg action-card" id="dash-review">
          <span class="action-icon">🔄</span>
          <span>Review Weak Words (${data.weakWords || 0})</span>
        </button>
        <button class="btn btn-secondary btn-lg action-card" id="dash-categories">
          <span class="action-icon">📖</span>
          <span>Browse Categories</span>
        </button>
      </div>

      <div class="dashboard-recent">
        <h2>Recent Sessions</h2>
        <div class="session-list">${recentSessions}</div>
      </div>
    </div>
  `;
}

export async function initDashboardPage() {
  on('#dash-practice', 'click', () => navigate('/practice'));
  on('#dash-review', 'click', () => navigate('/practice'));
  on('#dash-categories', 'click', () => navigate('/categories'));

  on('#btn-logout', 'click', () => {
    import('../api.js').then(m => {
      m.default.clearToken();
      window.location.hash = '#/login';
      window.location.reload(); // Force full reload to clear all state
    });
  });

  // Daily check
  try { await api.dailyCheck(); } catch { /* silent */ }
}

function getModeIcon(mode) {
  const icons = { flashcards: '🗂️', mcq: '📝', mixed: '🔀', smart_review: '🧠', weak_words: '⚠️', cram: '⚡', timed: '⏱️', exam: '📋', boss_battle: '🐉', survival: '🛡️', marathon: '🏃' };
  return icons[mode] || '📝';
}
