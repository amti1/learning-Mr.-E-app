import api from '../api.js';
import { $, on } from '../utils/dom.js';
import { renderStatGrid } from '../components/statsWidget.js';
import { renderLineChart, renderBarChart, renderDonutChart } from '../components/chartWidget.js';

export async function renderAnalyticsPage() {
  let dashboard, progress, weakAreas, lessonMastery;
  try { dashboard = await api.getDashboard(); } catch { dashboard = {}; }
  try { progress = await api.getProgress(30); } catch { progress = { dailyStats: [] }; }
  try { weakAreas = await api.getWeakAreas(); } catch { weakAreas = {}; }
  try { lessonMastery = await api.getLessonMastery(); } catch { lessonMastery = { lessons: [] }; }

  const g = dashboard.gamification || {};
  const accuracy = dashboard.accuracy || 0;
  const stats = [
    { icon: '🎯', label: 'Accuracy', value: `${accuracy}%` },
    { icon: '📝', label: 'Total Answered', value: dashboard.totalAnswered || 0 },
    { icon: '✅', label: 'Mastered', value: dashboard.masteredWords || 0 },
    { icon: '⚠️', label: 'Weak Words', value: dashboard.weakWords || 0 },
    { icon: '🔄', label: 'Due Reviews', value: dashboard.dueForReview || 0 },
    { icon: '⏱️', label: 'Time Spent', value: `${g.total_time_spent_min || 0}m` },
  ];

  const weakWords = (weakAreas.topWeakWords || []).slice(0, 10);
  const weakLessons = (weakAreas.topWeakLessons || []).slice(0, 5);
  const confusionHotspots = (weakAreas.confusionHotspots || []).slice(0, 5);
  const qTypePerf = weakAreas.questionTypePerformance || [];

  return `
    <div class="analytics-page page-content">
      <div class="page-header"><h1>📊 Analytics</h1><p class="text-muted">Your learning performance at a glance</p></div>
      ${renderStatGrid(stats)}
      <div class="charts-grid">
        <div class="chart-card card-glass"><h3>Accuracy Over Time</h3><div id="chart-accuracy" class="chart-container"></div></div>
        <div class="chart-card card-glass"><h3>Mastery Distribution</h3><div id="chart-mastery" class="chart-container"></div></div>
        <div class="chart-card card-glass"><h3>Performance by Question Type</h3><div id="chart-qtype" class="chart-container"></div></div>
      </div>
      <div class="analytics-sections">
        <div class="analytics-section card-glass">
          <h3>⚠️ Weakest Words</h3>
          ${weakWords.length ? `<div class="weak-list">${weakWords.map(w => `
            <div class="weak-item"><span class="weak-word">${w.word || ''}</span><span class="weak-meaning text-muted">${w.meaning || ''}</span>
            <div class="progress-bar progress-bar-sm"><div class="progress-bar-fill" style="width:${Math.round((w.weakness_score || 0) * 100)}%;background:var(--color-error)"></div></div></div>
          `).join('')}</div>` : '<p class="text-muted">No weak words yet — start practicing!</p>'}
        </div>
        <div class="analytics-section card-glass">
          <h3>📖 Lesson Mastery</h3>
          ${(lessonMastery.lessons || []).length ? `<div class="lesson-mastery-list">${(lessonMastery.lessons || []).map(l => `
            <div class="mastery-item"><span>${l.name_ar || l.name}</span><span class="text-muted">${l.mastered_count || 0}/${l.total_words || 0}</span>
            <div class="progress-bar progress-bar-sm"><div class="progress-bar-fill" style="width:${Math.round((l.avg_mastery || 0) * 100)}%;background:var(--color-success)"></div></div></div>
          `).join('')}</div>` : '<p class="text-muted">No data yet</p>'}
        </div>
        ${confusionHotspots.length ? `<div class="analytics-section card-glass"><h3>🔀 Confusion Hotspots</h3>
          <div class="confusion-list">${confusionHotspots.map(c => `<div class="confusion-item"><span class="badge">${c.word1 || ''}</span> ↔ <span class="badge">${c.word2 || ''}</span><span class="text-muted">${c.count || 0}x confused</span></div>`).join('')}</div>
        </div>` : ''}
      </div>
    </div>
  `;
}

export async function initAnalyticsPage() {
  let progress;
  try { progress = await api.getProgress(30); } catch { progress = { dailyStats: [] }; }
  const daily = progress.dailyStats || [];

  renderLineChart('chart-accuracy', {
    labels: daily.map(d => d.date ? d.date.slice(5) : ''),
    values: daily.map(d => d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0),
    color: '#00B4D8', label: 'Daily Accuracy %'
  });

  let dashboard;
  try { dashboard = await api.getDashboard(); } catch { dashboard = {}; }
  const mastered = dashboard.masteredWords || 0;
  const weak = dashboard.weakWords || 0;
  const learning = Math.max(0, (dashboard.reviewedWords || 0) - mastered - weak);
  const unseen = Math.max(0, (dashboard.totalWords || 0) - (dashboard.reviewedWords || 0));

  renderDonutChart('chart-mastery', {
    values: [mastered, learning, weak, unseen],
    labels: ['Mastered', 'Learning', 'Weak', 'New'],
    colors: ['#06D6A0', '#00B4D8', '#E63946', '#4A5568']
  }, { centerText: `${mastered}`, size: 200 });

  let weakAreas;
  try { weakAreas = await api.getWeakAreas(); } catch { weakAreas = {}; }
  const qtp = weakAreas.questionTypePerformance || [];
  if (qtp.length) {
    renderBarChart('chart-qtype', {
      labels: qtp.map(q => q.type || ''),
      values: qtp.map(q => q.accuracy || 0),
      colors: ['#00B4D8', '#FFB703', '#06D6A0', '#E63946', '#48CAE4', '#FF9F1C']
    });
  }
}
