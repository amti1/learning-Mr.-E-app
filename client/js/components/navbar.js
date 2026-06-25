import api from '../api.js';
import { navigate } from '../router.js';
import { $, on } from '../utils/dom.js';

export function renderNavbar(user) {
  const isAdmin = user && (user.role === 'admin' || user.role === 'teacher');
  if (!user) return '';

  return `
    <nav class="navbar" id="main-navbar">
      <div class="navbar-inner">
        <div class="navbar-brand">
          <button class="btn btn-ghost btn-icon hamburger-btn" id="hamburger-btn">☰</button>
          <a href="#/dashboard" class="brand-link">
            <span class="brand-icon">📚</span>
            <span class="brand-text">عربي</span>
          </a>
        </div>
        <div class="navbar-links" id="navbar-links">
          <a href="#/dashboard" class="nav-link" data-route="/dashboard">🏠 Dashboard</a>
          <a href="#/categories" class="nav-link" data-route="/categories">📖 Categories</a>
          <a href="#/practice" class="nav-link" data-route="/practice">🎯 Practice</a>
          <a href="#/analytics" class="nav-link" data-route="/analytics">📊 Analytics</a>
          <a href="#/search" class="nav-link" data-route="/search">🔍 Search</a>
          ${isAdmin ? '<a href="#/admin" class="nav-link" data-route="/admin">⚙️ Admin</a>' : ''}
        </div>
        <div class="navbar-actions">
          <button class="btn btn-ghost btn-icon theme-toggle" id="theme-toggle" title="Toggle theme">🌙</button>
          <div class="streak-badge" id="streak-badge" title="Daily streak">
            <span class="streak-fire">🔥</span>
            <span class="streak-count" id="streak-count">0</span>
          </div>
          <div class="level-badge" id="level-badge" title="Your level">
            <span class="level-number" id="level-number">1</span>
          </div>
          <div class="user-menu" id="user-menu">
            <button class="btn btn-ghost user-menu-btn" id="user-menu-btn">
              <span class="user-avatar">${(user.display_name || user.username || '?')[0]}</span>
              <span class="user-name">${user.display_name || user.username}</span>
            </button>
            <div class="dropdown-menu" id="user-dropdown">
              <a href="#/profile" class="dropdown-item">👤 Profile</a>
              <button class="dropdown-item" id="logout-btn">🚪 Logout</button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;
}

export function initNavbar() {
  on('#theme-toggle', 'click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    const btn = $('#theme-toggle');
    if (btn) btn.textContent = next === 'dark' ? '🌙' : '☀️';
  });

  on('#user-menu-btn', 'click', () => {
    const dd = $('#user-dropdown');
    if (dd) dd.classList.toggle('dropdown-visible');
  });

  on('#logout-btn', 'click', () => {
    api.clearToken();
    navigate('/login');
  });

  on('#hamburger-btn', 'click', () => {
    const links = $('#navbar-links');
    if (links) links.classList.toggle('navbar-links-open');
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#user-menu')) {
      const dd = $('#user-dropdown');
      if (dd) dd.classList.remove('dropdown-visible');
    }
  });

  // Load gamification stats
  loadNavStats();
}

async function loadNavStats() {
  try {
    const data = await api.getGamificationStatus();
    const streakEl = $('#streak-count');
    const levelEl = $('#level-number');
    if (streakEl) streakEl.textContent = data.current_streak || 0;
    if (levelEl) levelEl.textContent = data.level || 1;
  } catch (e) { /* silent */ }
}
