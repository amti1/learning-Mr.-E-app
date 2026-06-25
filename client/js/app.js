import api from './api.js';
import router, { registerRoute, initRouter, navigate } from './router.js';
import { renderNavbar, initNavbar } from './components/navbar.js';
import { $ } from './utils/dom.js';

// Pages
import { renderLoginPage, initLoginPage } from './pages/login.js';
import { renderDashboardPage, initDashboardPage } from './pages/dashboard.js';
import { renderCategoriesPage, initCategoriesPage } from './pages/categories.js';
import { renderLessonPage, initLessonPage } from './pages/lessonView.js';
import { renderWordManagerPage, initWordManagerPage } from './pages/wordManager.js';
import { renderPracticeHubPage, initPracticeHubPage } from './pages/practiceHub.js';
import { renderPracticeSessionPage, initPracticeSessionPage } from './pages/practiceSession.js';
import { renderAnalyticsPage, initAnalyticsPage } from './pages/analytics.js';
import { renderSearchPage, initSearchPage } from './pages/search.js';
import { renderProfilePage, initProfilePage } from './pages/profile.js';
import { renderAdminPage, initAdminPage } from './pages/admin.js';

// Register all routes
registerRoute('/login', { render: renderLoginPage, init: initLoginPage, title: 'Login' });
registerRoute('/register', { render: renderLoginPage, init: initLoginPage, title: 'Register' });
registerRoute('/dashboard', { render: renderDashboardPage, init: initDashboardPage, title: 'Dashboard' });
registerRoute('/categories', { render: renderCategoriesPage, init: initCategoriesPage, title: 'Categories' });
registerRoute('/lessons/:id', { render: renderLessonPage, init: initLessonPage, title: 'Lesson' });
registerRoute('/words', { render: renderWordManagerPage, init: initWordManagerPage, title: 'Word Manager' });
registerRoute('/practice', { render: renderPracticeHubPage, init: initPracticeHubPage, title: 'Practice' });
registerRoute('/practice/session/:id', { render: renderPracticeSessionPage, init: initPracticeSessionPage, title: 'Practice Session' });
registerRoute('/analytics', { render: renderAnalyticsPage, init: initAnalyticsPage, title: 'Analytics' });
registerRoute('/search', { render: renderSearchPage, init: initSearchPage, title: 'Search' });
registerRoute('/profile', { render: renderProfilePage, init: initProfilePage, title: 'Profile' });
registerRoute('/admin', { render: renderAdminPage, init: initAdminPage, title: 'Admin' });

// App initialization
document.addEventListener('DOMContentLoaded', async () => {
  // Apply saved theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const app = document.getElementById('app');
  const loading = document.getElementById('app-loading');

  // Check if user is logged in
  const token = api.getToken();
  const user = JSON.parse(localStorage.getItem('arabic_lp_user') || 'null');

  if (token && user) {
    // Render app shell with navbar
    app.innerHTML = `
      ${renderNavbar(user)}
      <main id="main-content" class="main-content"></main>
    `;
    initNavbar();
  } else {
    // No navbar for login page
    app.innerHTML = `<main id="main-content" class="main-content"></main>`;
  }

  // Hide loading
  if (loading) loading.style.display = 'none';
  app.style.display = '';

  // Listen for auth changes to update shell
  window.addEventListener('hashchange', () => {
    const path = (window.location.hash || '').replace('#', '');
    const currentToken = api.getToken();
    const currentUser = JSON.parse(localStorage.getItem('arabic_lp_user') || 'null');
    const nav = document.getElementById('main-navbar');

    if (currentToken && currentUser && !nav) {
      // User just logged in — add navbar
      app.innerHTML = `${renderNavbar(currentUser)}<main id="main-content" class="main-content"></main>`;
      initNavbar();
    } else if (!currentToken && nav) {
      // User just logged out — remove navbar
      app.innerHTML = `<main id="main-content" class="main-content"></main>`;
    }
  });

  // Start router
  initRouter();

  // Default route
  if (!window.location.hash) {
    navigate(token ? '/dashboard' : '/login');
  }
});
