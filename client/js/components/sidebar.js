import api from '../api.js';

export function renderSidebar(categories) {
  if (!categories || categories.length === 0) return '';
  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <h3>📚 Content</h3>
        <input type="text" class="input search-input-sm" id="sidebar-search" placeholder="Filter..." />
      </div>
      <div class="sidebar-content" id="sidebar-content">
        ${categories.map(cat => `
          <div class="sidebar-category" data-cat-id="${cat.id}">
            <div class="sidebar-cat-header" data-toggle="cat-${cat.id}">
              <span>${cat.icon || '📁'} ${cat.name_ar || cat.name}</span>
              <span class="sidebar-badge">${cat.word_count || 0}</span>
            </div>
            <div class="sidebar-cat-body" id="cat-${cat.id}" style="display:none">
              ${(cat.units || []).map(u => `
                <div class="sidebar-unit">
                  <div class="sidebar-unit-name">${u.name_ar || u.name}</div>
                  ${(u.lessons || []).map(l => `
                    <a href="#/lessons/${l.id}" class="sidebar-lesson">${l.name_ar || l.name} <span class="sidebar-badge-sm">${l.word_count || 0}</span></a>
                  `).join('')}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </aside>
  `;
}

export function initSidebar() {
  document.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const target = document.getElementById(el.dataset.toggle);
      if (target) target.style.display = target.style.display === 'none' ? '' : 'none';
    });
  });

  const search = document.getElementById('sidebar-search');
  if (search) {
    search.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.sidebar-lesson').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
}
