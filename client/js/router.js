import api from './api.js';

const routes = {};
let currentPage = null;
let mainContainer = null;

export function registerRoute(path, { render, init, title }) {
  routes[path] = { render, init, title };
}

export function navigate(path) {
  window.location.hash = '#' + path;
}

function matchRoute(hash) {
  const path = hash.replace('#', '') || '/dashboard';

  // Exact match first
  if (routes[path]) return { route: routes[path], params: {}, path };

  // Pattern matching for :id params
  for (const [pattern, route] of Object.entries(routes)) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    let match = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { route, params, path };
  }

  return null;
}

async function handleRoute() {
  const hash = window.location.hash || '#/dashboard';

  // Auth guard
  const publicRoutes = ['/login', '/register'];
  const path = hash.replace('#', '') || '/dashboard';
  if (!publicRoutes.includes(path) && !api.getToken()) {
    window.location.hash = '#/login';
    return;
  }
  if (publicRoutes.includes(path) && api.getToken()) {
    window.location.hash = '#/dashboard';
    return;
  }

  const matched = matchRoute(hash);
  if (!matched) {
    if (mainContainer) mainContainer.innerHTML = '<div class="page-content flex-center" style="min-height:60vh"><h2>Page Not Found</h2></div>';
    return;
  }

  const { route, params } = matched;

  if (!mainContainer) mainContainer = document.getElementById('main-content');
  if (!mainContainer) return;

  // Page transition
  mainContainer.classList.add('page-exit');
  await new Promise(r => setTimeout(r, 150));

  try {
    const html = await route.render(params);
    mainContainer.innerHTML = html;
    mainContainer.classList.remove('page-exit');
    mainContainer.classList.add('page-enter');
    setTimeout(() => mainContainer.classList.remove('page-enter'), 300);

    if (route.title) document.title = `${route.title} — عربي`;
    if (route.init) await route.init(params);

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === hash);
    });

    currentPage = path;
  } catch (err) {
    console.error('Route error:', err);
    mainContainer.innerHTML = `<div class="page-content flex-center" style="min-height:60vh"><div class="card-glass" style="padding:2rem;text-align:center"><h2>⚠️ Error</h2><p>${err.message}</p></div></div>`;
    mainContainer.classList.remove('page-exit');
  }
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

export function getCurrentPath() {
  return (window.location.hash || '#/dashboard').replace('#', '');
}

export default { registerRoute, navigate, initRouter, getCurrentPath };
