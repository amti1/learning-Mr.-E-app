export function renderStatCard(icon, label, value, trend = null) {
  const trendHtml = trend !== null ? `<span class="stat-trend ${trend >= 0 ? 'trend-up' : 'trend-down'}">${trend >= 0 ? '↑' : '↓'} ${Math.abs(trend)}%</span>` : '';
  return `
    <div class="stat-card card-glass">
      <div class="stat-icon">${icon}</div>
      <div class="stat-info">
        <div class="stat-value">${value}</div>
        <div class="stat-label">${label}</div>
      </div>
      ${trendHtml}
    </div>
  `;
}

export function renderStatGrid(stats) {
  return `<div class="stat-grid">${stats.map(s => renderStatCard(s.icon, s.label, s.value, s.trend)).join('')}</div>`;
}
