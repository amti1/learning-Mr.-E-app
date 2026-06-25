const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];

export function toArabicDigits(num) {
  return String(num).replace(/\d/g, d => arabicDigits[parseInt(d)]);
}

export function formatNumber(n) {
  return new Intl.NumberFormat('ar-EG').format(n);
}

export function formatPercent(n) {
  return `${Math.round(n * 100)}%`;
}

export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatDateShort(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
}

export function formatTime(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function timeAgo(date) {
  if (!date) return '';
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  if (days < 7) return `منذ ${days} يوم`;
  if (days < 30) return `منذ ${Math.floor(days / 7)} أسبوع`;
  return formatDate(date);
}

export function truncate(str, len = 50) {
  if (!str || str.length <= len) return str || '';
  return str.substring(0, len) + '...';
}

export function pluralizeAr(count, singular, dual, plural) {
  if (count === 0) return `لا ${plural}`;
  if (count === 1) return `${singular} واحد`;
  if (count === 2) return `${dual || singular + 'ان'}`;
  if (count <= 10) return `${count} ${plural}`;
  return `${count} ${singular}`;
}

export function getMasteryLabel(score) {
  if (score >= 0.9) return { label: 'Mastered', labelAr: 'متقن', color: 'var(--color-success)', stars: 3 };
  if (score >= 0.7) return { label: 'Good', labelAr: 'جيد', color: 'var(--color-accent)', stars: 2 };
  if (score >= 0.4) return { label: 'Learning', labelAr: 'يتعلم', color: 'var(--color-warning)', stars: 1 };
  return { label: 'New', labelAr: 'جديد', color: 'var(--color-text-muted)', stars: 0 };
}

export function getDifficultyLabel(level) {
  const labels = { 1: 'Very Easy', 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Very Hard' };
  return labels[level] || 'Medium';
}
