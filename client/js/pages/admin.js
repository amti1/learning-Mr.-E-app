import api from '../api.js';
import { $, on, delegate } from '../utils/dom.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';
import { showImportModal } from '../components/importModal.js';
import { navigate } from '../router.js';
import { renderStatGrid } from '../components/statsWidget.js';

export async function renderAdminPage() {
  let stats, users;
  try { stats = await api.getAdminStats(); } catch { stats = {}; }
  try { users = await api.getAdminUsers(); } catch { users = { users: [] }; }

  const statCards = [
    { icon: '👥', label: 'Users', value: stats.totalUsers || 0 },
    { icon: '📚', label: 'Words', value: stats.totalWords || 0 },
    { icon: '📖', label: 'Lessons', value: stats.totalLessons || 0 },
    { icon: '📁', label: 'Categories', value: stats.totalCategories || 0 },
    { icon: '🎯', label: 'Sessions', value: stats.totalSessions || 0 },
    { icon: '📝', label: 'Reviews', value: stats.totalReviews || 0 },
  ];

  return `
    <div class="admin-page page-content">
      <div class="page-header"><h1>⚙️ Admin Panel</h1><p class="text-muted">Manage content and users</p></div>
      ${renderStatGrid(statCards)}
      <div class="admin-sections">
        <div class="admin-section card-glass">
          <h3>Quick Actions</h3>
          <div class="admin-actions-grid">
            <button class="btn btn-primary" id="admin-add-category">➕ Add Category</button>
            <button class="btn btn-secondary" id="admin-add-lesson">➕ Add Lesson</button>
            <button class="btn btn-accent" id="admin-add-word">➕ Add Word</button>
            <button class="btn btn-ghost" id="admin-import">📥 Import Words</button>
          </div>
        </div>
        <div class="admin-section card-glass">
          <h3>👥 Users</h3>
          <table class="word-table">
            <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Level</th><th>XP</th><th>Actions</th></tr></thead>
            <tbody>
              ${(users.users || []).map(u => `
                <tr>
                  <td>${u.display_name || u.username}</td>
                  <td>${u.email || '—'}</td>
                  <td><span class="badge ${u.role === 'admin' ? 'badge-primary' : u.role === 'teacher' ? 'badge-warning' : ''}">${u.role}</span></td>
                  <td>${u.level || 1}</td>
                  <td>${u.xp || 0}</td>
                  <td>
                    <select class="select select-sm role-select" data-user-id="${u.id}">
                      <option value="student" ${u.role === 'student' ? 'selected' : ''}>Student</option>
                      <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>Teacher</option>
                      <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export async function initAdminPage() {
  on('#admin-add-word', 'click', () => navigate('/words'));
  on('#admin-import', 'click', () => {
    showImportModal(1, () => showToast('Import complete', 'success'));
  });

  on('#admin-add-category', 'click', () => {
    showModal({
      title: 'Add Category', size: 'small',
      content: `<div class="input-group"><label>Name</label><input class="input" id="new-cat-name" /></div><div class="input-group"><label>Arabic Name</label><input class="input" id="new-cat-name-ar" dir="rtl" /></div><div class="input-group"><label>Icon (emoji)</label><input class="input" id="new-cat-icon" value="📚" /></div><div class="input-group"><label>Description</label><textarea class="textarea" id="new-cat-desc"></textarea></div>`,
      actions: [{ label: 'Create', className: 'btn btn-primary', id: 'create-cat-btn', onClick: async () => {
        try {
          await api.createCategory({ name: $('#new-cat-name').value, name_ar: $('#new-cat-name-ar').value, icon: $('#new-cat-icon').value, description: $('#new-cat-desc').value });
          hideModal(); showToast('Category created!', 'success'); navigate('/admin');
        } catch (e) { showToast(e.message, 'error'); }
      }}],
    });
  });

  on('#admin-add-lesson', 'click', async () => {
    let units;
    try { units = await api.getUnits(); } catch { units = { units: [] }; }
    const unitList = units.units || units || [];
    showModal({
      title: 'Add Lesson', size: 'small',
      content: `<div class="input-group"><label>Unit</label><select class="select" id="new-les-unit">${unitList.map(u => `<option value="${u.id}">${u.name_ar || u.name}</option>`).join('')}</select></div><div class="input-group"><label>Name</label><input class="input" id="new-les-name" /></div><div class="input-group"><label>Arabic Name</label><input class="input" id="new-les-name-ar" dir="rtl" /></div><div class="input-group"><label>Source Textbook</label><input class="input" id="new-les-book" /></div>`,
      actions: [{ label: 'Create', className: 'btn btn-primary', id: 'create-les-btn', onClick: async () => {
        try {
          await api.createLesson({ unit_id: parseInt($('#new-les-unit').value), name: $('#new-les-name').value, name_ar: $('#new-les-name-ar').value, source_textbook: $('#new-les-book').value });
          hideModal(); showToast('Lesson created!', 'success'); navigate('/admin');
        } catch (e) { showToast(e.message, 'error'); }
      }}],
    });
  });

  delegate(document, 'change', '.role-select', async (e, el) => {
    try {
      await api.updateUserRole(el.dataset.userId, el.value);
      showToast('Role updated', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });
}
