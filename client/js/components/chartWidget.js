export function renderLineChart(containerId, data, options = {}) {
  setTimeout(() => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const canvas = document.createElement('canvas');
    canvas.width = container.clientWidth || 600;
    canvas.height = options.height || 250;
    canvas.style.width = '100%';
    canvas.style.height = (options.height || 250) + 'px';
    container.innerHTML = '';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    drawLineChart(ctx, canvas.width, canvas.height, data, options);
  }, 50);
}

function drawLineChart(ctx, w, h, data, opts) {
  const { labels = [], values = [], color = '#00B4D8', label = '' } = data;
  if (values.length === 0) { drawEmpty(ctx, w, h); return; }

  const pad = { top: 30, right: 20, bottom: 40, left: 50 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const max = Math.max(...values, 1);
  const min = 0;

  // Background
  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(max - (max / 4) * i), pad.left - 8, y + 4);
  }

  // X labels
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(labels.length / 8));
  labels.forEach((l, i) => {
    if (i % step === 0) {
      const x = pad.left + (cw / Math.max(1, values.length - 1)) * i;
      ctx.fillText(l, x, h - 10);
    }
  });

  // Line
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  values.forEach((v, i) => {
    const x = pad.left + (cw / Math.max(1, values.length - 1)) * i;
    const y = pad.top + ch - (v / max) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
  gradient.addColorStop(0, color + '40');
  gradient.addColorStop(1, color + '00');
  ctx.lineTo(pad.left + cw, pad.top + ch);
  ctx.lineTo(pad.left, pad.top + ch);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Dots
  values.forEach((v, i) => {
    const x = pad.left + (cw / Math.max(1, values.length - 1)) * i;
    const y = pad.top + ch - (v / max) * ch;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  // Title
  if (label) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, pad.left, 16);
  }
}

export function renderBarChart(containerId, data, options = {}) {
  setTimeout(() => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const canvas = document.createElement('canvas');
    canvas.width = container.clientWidth || 600;
    canvas.height = options.height || 250;
    canvas.style.width = '100%';
    canvas.style.height = (options.height || 250) + 'px';
    container.innerHTML = '';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    drawBarChart(ctx, canvas.width, canvas.height, data, options);
  }, 50);
}

function drawBarChart(ctx, w, h, data, opts) {
  const { labels = [], values = [], colors = [], label = '' } = data;
  if (values.length === 0) { drawEmpty(ctx, w, h); return; }

  const pad = { top: 30, right: 20, bottom: 50, left: 50 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const max = Math.max(...values, 1);
  const barW = Math.min(40, cw / values.length - 8);
  const defaultColors = ['#00B4D8', '#FFB703', '#06D6A0', '#E63946', '#48CAE4', '#FF9F1C'];

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(max - (max / 4) * i), pad.left - 8, y + 4);
  }

  // Bars
  values.forEach((v, i) => {
    const x = pad.left + (cw / values.length) * i + (cw / values.length - barW) / 2;
    const barH = (v / max) * ch;
    const y = pad.top + ch - barH;
    const color = (colors && colors[i]) || defaultColors[i % defaultColors.length];

    // Bar with rounded top
    ctx.fillStyle = color;
    ctx.beginPath();
    const r = Math.min(4, barW / 2);
    ctx.moveTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.arcTo(x + barW, y, x + barW, y + r, r);
    ctx.lineTo(x + barW, pad.top + ch);
    ctx.lineTo(x, pad.top + ch);
    ctx.closePath();
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i] || '', x + barW / 2, h - 10);
  });
}

export function renderDonutChart(containerId, data, options = {}) {
  setTimeout(() => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const canvas = document.createElement('canvas');
    const size = Math.min(container.clientWidth || 200, options.size || 200);
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    container.innerHTML = '';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    drawDonut(ctx, size, data, options);
  }, 50);
}

function drawDonut(ctx, size, data, opts) {
  const { values = [], labels = [], colors = [] } = data;
  const total = values.reduce((s, v) => s + v, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 10, innerR = r * 0.6;
  const defaultColors = ['#06D6A0', '#FFB703', '#00B4D8', '#E63946', '#48CAE4'];

  let startAngle = -Math.PI / 2;
  values.forEach((v, i) => {
    const sweep = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, startAngle + sweep);
    ctx.arc(cx, cy, innerR, startAngle + sweep, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = colors[i] || defaultColors[i % defaultColors.length];
    ctx.fill();
    startAngle += sweep;
  });

  // Center text
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (opts.centerText) ctx.fillText(opts.centerText, cx, cy);
}

function drawEmpty(ctx, w, h) {
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('No data yet', w / 2, h / 2);
}

export default { renderLineChart, renderBarChart, renderDonutChart };
