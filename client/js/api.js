const BASE_URL = window.location.origin;
const TOKEN_KEY = 'arabic_lp_token';
const USER_KEY = 'arabic_lp_user';

let token = localStorage.getItem(TOKEN_KEY);

function setToken(t) { token = t; if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
function getToken() { return token; }
function clearToken() { token = null; localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);

  if (res.status === 401) {
    clearToken();
    window.location.hash = '#/login';
    throw new Error('Session expired');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const put = (path, body) => request('PUT', path, body);
const del = (path) => request('DELETE', path);

const api = {
  setToken, getToken, clearToken,

  // Auth
  login: (username, password) => post('/api/auth/login', { username, password }),
  register: (data) => post('/api/auth/register', data),
  getProfile: () => get('/api/auth/profile'),
  updateProfile: (data) => put('/api/auth/profile', data),

  // Categories
  getCategories: () => get('/api/categories'),
  getCategory: (id) => get(`/api/categories/${id}`),
  createCategory: (data) => post('/api/categories', data),
  updateCategory: (id, data) => put(`/api/categories/${id}`, data),
  deleteCategory: (id) => del(`/api/categories/${id}`),

  // Units
  getUnits: (categoryId) => get(`/api/units${categoryId ? `?category_id=${categoryId}` : ''}`),
  createUnit: (data) => post('/api/units', data),
  updateUnit: (id, data) => put(`/api/units/${id}`, data),
  deleteUnit: (id) => del(`/api/units/${id}`),

  // Lessons
  getLessons: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return get(`/api/lessons${q ? '?' + q : ''}`);
  },
  getLesson: (id) => get(`/api/lessons/${id}`),
  createLesson: (data) => post('/api/lessons', data),
  updateLesson: (id, data) => put(`/api/lessons/${id}`, data),
  deleteLesson: (id) => del(`/api/lessons/${id}`),
  duplicateLesson: (id) => post(`/api/lessons/${id}/duplicate`),

  // Words
  getWords: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return get(`/api/words${q ? '?' + q : ''}`);
  },
  getWord: (id) => get(`/api/words/${id}`),
  createWord: (data) => post('/api/words', data),
  updateWord: (id, data) => put(`/api/words/${id}`, data),
  deleteWord: (id) => del(`/api/words/${id}`),
  bulkImport: (data) => post('/api/words/bulk-import', data),
  exportWords: (lessonId, format = 'json') => get(`/api/words/export?lesson_id=${lessonId}&format=${format}`),

  // Practice
  startPractice: (data) => post('/api/practice/start', data),
  nextQuestion: (sessionId) => get(`/api/practice/session/${sessionId}/next`),
  submitAnswer: (sessionId, data) => post(`/api/practice/session/${sessionId}/answer`, data),
  getHint: (sessionId, level = 1) => get(`/api/practice/session/${sessionId}/hint?level=${level}`),
  shuffleSession: (sessionId) => post(`/api/practice/session/${sessionId}/shuffle`),
  completeSession: (sessionId) => post(`/api/practice/session/${sessionId}/complete`),

  // Review
  getDueReviews: () => get('/api/review/due'),
  getWeakWords: () => get('/api/review/weak-words'),
  getReviewStats: () => get('/api/review/stats'),

  // Analytics
  getDashboard: () => get('/api/analytics/dashboard'),
  getProgress: (days = 30) => get(`/api/analytics/progress?days=${days}`),
  getWeakAreas: () => get('/api/analytics/weak-areas'),
  getConfusionMatrix: (lessonId) => get(`/api/analytics/confusion-matrix${lessonId ? `?lesson_id=${lessonId}` : ''}`),
  getLessonMastery: () => get('/api/analytics/lesson-mastery'),
  getReport: () => get('/api/analytics/report'),

  // Search
  search: (q, type = 'all') => get(`/api/search?q=${encodeURIComponent(q)}&type=${type}`),

  // Gamification
  getGamificationStatus: () => get('/api/gamification/status'),
  getAchievements: () => get('/api/gamification/achievements'),
  dailyCheck: () => post('/api/gamification/daily-check'),

  // Admin
  getAdminStats: () => get('/api/admin/stats'),
  getAdminUsers: () => get('/api/admin/users'),
  updateUserRole: (id, role) => put(`/api/admin/users/${id}/role`, { role }),
};

export default api;
