import { playAchievement } from '../utils/audio.js';

let achievementQueue = [];
let isShowing = false;

export function showAchievement(achievement) {
  achievementQueue.push(achievement);
  if (!isShowing) showNext();
}

export function showAchievements(achievements) {
  if (!achievements || achievements.length === 0) return;
  achievements.forEach(a => achievementQueue.push(a));
  if (!isShowing) showNext();
}

function showNext() {
  if (achievementQueue.length === 0) { isShowing = false; return; }
  isShowing = true;
  const ach = achievementQueue.shift();

  const popup = document.createElement('div');
  popup.className = 'achievement-popup';
  popup.innerHTML = `
    <div class="achievement-popup-inner">
      <div class="achievement-icon-large">${ach.icon || '🏆'}</div>
      <div class="achievement-info">
        <div class="achievement-title">Achievement Unlocked!</div>
        <div class="achievement-name">${ach.name_ar || ach.name}</div>
        <div class="achievement-desc">${ach.description || ''}</div>
        <div class="achievement-xp">+${ach.xp_reward || 0} XP</div>
      </div>
    </div>
  `;

  document.body.appendChild(popup);
  playAchievement();

  requestAnimationFrame(() => popup.classList.add('achievement-visible'));

  setTimeout(() => {
    popup.classList.remove('achievement-visible');
    popup.classList.add('achievement-hiding');
    setTimeout(() => {
      popup.remove();
      showNext();
    }, 500);
  }, 4000);
}

export default { showAchievement, showAchievements };
