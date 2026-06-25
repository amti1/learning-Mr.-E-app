import api from '../api.js';
import { $, on } from '../utils/dom.js';
import { showToast } from '../components/toast.js';
import { renderXPBar } from '../components/progressBar.js';
import { setMuted, isMuted } from '../utils/audio.js';

export async function renderProfilePage() {
  let user, gamStatus, achievements;
  try { user = await api.getProfile(); } catch { user = JSON.parse(localStorage.getItem('arabic_lp_user') || '{}'); }
  try { gamStatus = await api.getGamificationStatus(); } catch { gamStatus = {}; }
  try { achievements = await api.getAchievements(); } catch { achievements = { achievements: [], unlockedCount: 0, totalCount: 0 }; }

  const g = gamStatus;
  const unlocked = (achievements.achievements || []).filter(a => a.unlocked_at);
  const locked = (achievements.achievements || []).filter(a => !a.unlocked_at);

  return `
    <div class="profile-page page-content">
      <div class="page-header"><h1>👤 Profile</h1></div>
      <div class="profile-grid">
        <div class="profile-card card-glass">
          <div class="profile-avatar-lg">${(user.display_name || user.username || '?')[0]}</div>
          <h2>${user.display_name || user.username}</h2>
          <p class="text-muted">${user.role || 'student'} • Joined ${user.created_at ? new Date(user.created_at).toLocaleDateString() : ''}</p>
          <div class="profile-level">
            <span class="level-badge-lg">Level ${g.level || 1}</span>
            ${renderXPBar(g.xp || 0, ((g.level || 1) + 1) * 100, (g.level || 1) * 100)}
          </div>
          <div class="profile-stats-row">
            <div><strong>${g.current_streak || 0}</strong><br/>🔥 Streak</div>
            <div><strong>${g.total_words_mastered || 0}</strong><br/>✅ Mastered</div>
            <div><strong>${g.total_lessons_completed || 0}</strong><br/>📖 Lessons</div>
          </div>
        </div>
        <div class="settings-card card-glass">
          <h3>⚙️ Settings</h3>
          <form id="settings-form">
            <div class="input-group"><label>Display Name</label><input type="text" class="input" id="set-name" value="${user.display_name || ''}" /></div>
            <div class="input-group"><label>Daily Goal</label><input type="number" class="input" id="set-daily" value="${g.daily_goal || 20}" min="5" max="200" /></div>
            <div class="input-group"><label>Weekly Goal</label><input type="number" class="input" id="set-weekly" value="${g.weekly_goal || 100}" min="10" max="1000" /></div>
            <div class="input-group"><label>Theme</label>
              <div class="toggle-row"><span>Dark</span><label class="toggle-switch"><input type="checkbox" id="set-theme" ${(document.documentElement.getAttribute('data-theme') === 'light') ? 'checked' : ''} /><span class="toggle-slider"></span></label><span>Light</span></div>
            </div>
            <div class="input-group"><label>Sound Effects</label>
              <div class="toggle-row"><span>Off</span><label class="toggle-switch"><input type="checkbox" id="set-sound" ${!isMuted() ? 'checked' : ''} /><span class="toggle-slider"></span></label><span>On</span></div>
            </div>
            <button type="submit" class="btn btn-primary">Save Settings</button>
          </form>
        </div>
      </div>
      <div class="achievements-section">
        <h2>🏆 Achievements (${achievements.unlockedCount || 0}/${achievements.totalCount || 0})</h2>
        <div class="achievements-grid">
          ${unlocked.map(a => `<div class="achievement-card card-glass achievement-unlocked"><span class="achievement-icon">${a.icon}</span><strong>${a.name_ar || a.name}</strong><small>${a.description || ''}</small><span class="badge badge-success">+${a.xp_reward} XP</span></div>`).join('')}
          ${locked.map(a => `<div class="achievement-card card-glass achievement-locked"><span class="achievement-icon">${a.icon}</span><strong>${a.name_ar || a.name}</strong><small>${a.description || ''}</small><span class="badge">🔒 Locked</span></div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

export async function initProfilePage() {
  on('#settings-form', 'submit', async (e) => {
    e.preventDefault();
    try {
      await api.updateProfile({
        display_name: $('#set-name').value.trim(),
        daily_goal: parseInt($('#set-daily').value),
        weekly_goal: parseInt($('#set-weekly').value),
      });
      localStorage.setItem('arabic_lp_user', JSON.stringify({ ...JSON.parse(localStorage.getItem('arabic_lp_user') || '{}'), display_name: $('#set-name').value.trim() }));
      showToast('Settings saved!', 'success');
    } catch (e) { showToast('Failed to save', 'error'); }
  });

  on('#set-theme', 'change', (e) => {
    const theme = e.target.checked ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.textContent = theme === 'dark' ? '🌙' : '☀️';
  });

  on('#set-sound', 'change', (e) => setMuted(!e.target.checked));
}
