import api from '../api.js';
import { renderMasteryBar, renderMasteryStars } from '../components/progressBar.js';
import { navigate } from '../router.js';
import { delegate } from '../utils/dom.js';

export async function renderCategoriesPage() {
  let data;
  try { data = await api.getCategories(); } catch { data = { categories: [] }; }
  const categories = data.categories || data || [];

  const categoryCards = categories.map(cat => {
    const wordCount = cat.word_count || 0;
    const unitCount = cat.unit_count || 0;
    return `
      <div class="category-card card-glass card-interactive" data-cat-id="${cat.id}">
        <div class="category-icon">${cat.icon || '📚'}</div>
        <div class="category-info">
          <h3 class="category-name">${cat.name_ar || cat.name}</h3>
          <p class="category-desc">${cat.description || ''}</p>
          <div class="category-meta">
            <span class="badge">${unitCount} units</span>
            <span class="badge">${wordCount} words</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="categories-page page-content">
      <div class="page-header">
        <h1>📖 Categories</h1>
        <p class="text-muted">Choose a category to start learning</p>
      </div>
      <div class="categories-grid">
        ${categoryCards || '<p class="empty-state">No categories yet. Add content to get started.</p>'}
      </div>
      <div id="category-detail" style="display:none"></div>
    </div>
  `;
}

export async function initCategoriesPage() {
  delegate(document, 'click', '.category-card', async (e, el) => {
    const catId = el.dataset.catId;
    try {
      const cat = await api.getCategory(catId);
      const detail = document.getElementById('category-detail');
      if (!detail) return;

      const units = cat.units || [];
      detail.style.display = '';
      detail.innerHTML = `
        <div class="category-detail-content">
          <h2>${cat.icon || '📚'} ${cat.name_ar || cat.name}</h2>
          ${units.map(u => `
            <div class="unit-section card-glass">
              <h3>${u.name_ar || u.name}</h3>
              <div class="lessons-grid">
                ${(u.lessons || []).map(l => `
                  <div class="lesson-card card-interactive" data-lesson-id="${l.id}">
                    <div class="lesson-name">${l.name_ar || l.name}</div>
                    <div class="lesson-meta">
                      <span class="badge badge-sm">${l.word_count || 0} words</span>
                      <span class="difficulty-dots">${'●'.repeat(l.difficulty || 3)}${'○'.repeat(5 - (l.difficulty || 3))}</span>
                    </div>
                    <button class="btn btn-primary btn-sm lesson-practice-btn" data-lesson-id="${l.id}">Practice</button>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      detail.scrollIntoView({ behavior: 'smooth' });

      delegate(detail, 'click', '.lesson-card', (e2, el2) => {
        if (!e2.target.classList.contains('lesson-practice-btn')) {
          navigate(`/lessons/${el2.dataset.lessonId}`);
        }
      });
      delegate(detail, 'click', '.lesson-practice-btn', (e2, el2) => {
        navigate(`/practice`);
      });
    } catch (err) {
      console.error(err);
    }
  });
}
