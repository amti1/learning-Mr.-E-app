import api from '../api.js';
import { $, on, delegate } from '../utils/dom.js';
import { navigate } from '../router.js';

export async function renderSearchPage() {
  return `
    <div class="search-page page-content">
      <div class="page-header"><h1>🔍 Search</h1></div>
      <div class="search-bar-large">
        <input type="text" class="input search-input-lg" id="search-input" placeholder="Search words, meanings, synonyms, antonyms, roots..." dir="auto" autofocus />
      </div>
      <div class="search-filters" id="search-filters">
        <button class="btn btn-sm btn-primary search-type-btn active" data-type="all">All</button>
        <button class="btn btn-sm btn-ghost search-type-btn" data-type="word">Words</button>
        <button class="btn btn-sm btn-ghost search-type-btn" data-type="meaning">Meanings</button>
        <button class="btn btn-sm btn-ghost search-type-btn" data-type="synonym">Synonyms</button>
        <button class="btn btn-sm btn-ghost search-type-btn" data-type="antonym">Antonyms</button>
        <button class="btn btn-sm btn-ghost search-type-btn" data-type="root">Roots</button>
        <button class="btn btn-sm btn-ghost search-type-btn" data-type="plural">Plurals</button>
        <button class="btn btn-sm btn-ghost search-type-btn" data-type="lesson">Lessons</button>
        <button class="btn btn-sm btn-ghost search-type-btn" data-type="tag">Tags</button>
      </div>
      <div id="search-results" class="search-results"></div>
    </div>
  `;
}

let searchTimeout = null;
let currentType = 'all';

export async function initSearchPage() {
  on('#search-input', 'input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => doSearch(e.target.value), 300);
  });

  delegate(document, 'click', '.search-type-btn', (e, el) => {
    document.querySelectorAll('.search-type-btn').forEach(b => { b.classList.remove('btn-primary', 'active'); b.classList.add('btn-ghost'); });
    el.classList.remove('btn-ghost'); el.classList.add('btn-primary', 'active');
    currentType = el.dataset.type;
    const input = $('#search-input');
    if (input && input.value.trim()) doSearch(input.value);
  });

  delegate(document, 'click', '.result-lesson-link', (e, el) => {
    navigate(`/lessons/${el.dataset.lessonId}`);
  });
}

async function doSearch(query) {
  const results = document.getElementById('search-results');
  if (!results) return;
  if (!query || query.trim().length < 1) { results.innerHTML = '<p class="text-muted" style="text-align:center;margin-top:2rem">Type to search...</p>'; return; }

  try {
    const data = await api.search(query.trim(), currentType);
    const items = data.results || [];
    if (items.length === 0) {
      results.innerHTML = '<p class="empty-state">No results found</p>';
      return;
    }
    results.innerHTML = items.map(r => {
      if (r.match_type === 'lesson') {
        return `<div class="search-result card-glass"><div class="result-type badge">📖 Lesson</div><div class="result-content"><strong>${r.name_ar || r.name}</strong><span class="text-muted"> — ${r.category_name || ''}</span></div><button class="btn btn-sm btn-primary result-lesson-link" data-lesson-id="${r.id}">View</button></div>`;
      }
      return `
        <div class="search-result card-glass">
          <div class="result-type badge badge-sm">${getMatchIcon(r.match_type)}</div>
          <div class="result-content">
            <strong class="result-word">${r.word || ''}</strong>
            <span class="result-meaning text-muted">${r.meaning || ''}</span>
            ${r.matched_value ? `<span class="badge badge-sm">${r.match_type}: ${r.matched_value}</span>` : ''}
          </div>
          <div class="result-actions">
            <span class="text-muted result-lesson-name">${r.lesson_name || ''}</span>
            <button class="btn btn-sm btn-ghost result-lesson-link" data-lesson-id="${r.lesson_id}">View Lesson</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    results.innerHTML = `<p class="text-muted">Search error: ${e.message}</p>`;
  }
}

function getMatchIcon(type) {
  const icons = { word: '📝', meaning: '💡', synonym: '🔄', antonym: '↔️', root: '🌳', plural: '📚', tag: '🏷️', lesson: '📖' };
  return `${icons[type] || '🔍'} ${type}`;
}
