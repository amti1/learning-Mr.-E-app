export function renderProgressBar(current, total, label = '') {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return `
    <div class="progress-wrapper">
      ${label ? `<div class="progress-label"><span>${label}</span><span>${pct}%</span></div>` : ''}
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    </div>
  `;
}

export function renderMasteryBar(mastery) {
  const pct = Math.round((mastery || 0) * 100);
  let color = 'var(--color-error)';
  if (pct >= 80) color = 'var(--color-success)';
  else if (pct >= 50) color = 'var(--color-accent)';
  else if (pct >= 25) color = 'var(--color-warning)';

  return `<div class="progress-bar progress-bar-sm"><div class="progress-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
}

export function renderXPBar(currentXP, nextLevelXP, currentLevelXP = 0) {
  const progress = nextLevelXP > currentLevelXP ? ((currentXP - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100 : 100;
  return `
    <div class="xp-bar-wrapper">
      <div class="progress-bar progress-bar-xp">
        <div class="progress-bar-fill xp-fill" style="width:${Math.min(100, Math.round(progress))}%"></div>
      </div>
      <span class="xp-text">${currentXP} XP</span>
    </div>
  `;
}

export function renderMasteryStars(score) {
  const stars = score >= 0.9 ? 3 : score >= 0.7 ? 2 : score >= 0.4 ? 1 : 0;
  return '<span class="mastery-stars">' + '⭐'.repeat(stars) + '<span class="star-empty">' + '☆'.repeat(3 - stars) + '</span></span>';
}
