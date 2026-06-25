import api from '../api.js';
import { $, on, delegate } from '../utils/dom.js';
import { renderWordCard } from '../components/wordCard.js';
import { renderMasteryStars } from '../components/progressBar.js';
import { showImportModal } from '../components/importModal.js';
import { showToast } from '../components/toast.js';
import { confirmModal } from '../components/modal.js';
import { navigate } from '../router.js';

let currentLessonId = null;

export async function renderLessonPage(params) {
  currentLessonId = params.id;
  let lesson;
  try { lesson = await api.getLesson(params.id); } catch (e) { return `<div class="page-content"><p class="empty-state">Lesson not found</p></div>`; }

  const words = lesson.words || [];
  const user = JSON.parse(localStorage.getItem('arabic_lp_user') || '{}');
  const isAdmin = user.role === 'admin' || user.role === 'teacher';

  return `
    <div class="lesson-page page-content">
      <div class="page-header">
        <div>
          <button class="btn btn-ghost" onclick="window.location.hash='#/categories'">← Back</button>
          <h1>${lesson.name_ar || lesson.name}</h1>
          <p class="text-muted">${lesson.description || ''} ${lesson.source_textbook ? `• ${lesson.source_textbook}` : ''}</p>
          <div class="lesson-meta-badges">
            <span class="badge">Difficulty: ${'●'.repeat(lesson.difficulty || 3)}${'○'.repeat(5 - (lesson.difficulty || 3))}</span>
            <span class="badge badge-primary">${words.length} words</span>
          </div>
        </div>
        <div class="lesson-actions">
          <button class="btn btn-primary btn-lg" id="lesson-practice-btn">🎯 Practice This Lesson</button>
          ${isAdmin ? `
            <button class="btn btn-secondary" id="lesson-import-btn">📥 Import</button>
            <button class="btn btn-ghost" id="lesson-export-btn">📤 Export</button>
            <button class="btn btn-ghost" id="lesson-add-word-btn">➕ Add Word</button>
          ` : ''}
        </div>
      </div>

      <div class="word-table-container">
        <table class="word-table" id="word-table">
          <thead>
            <tr>
              <th class="th-word">Word</th>
              <th>Meaning</th>
              <th>Synonyms</th>
              <th>Antonyms</th>
              <th>Plural</th>
              <th>Root</th>
              ${isAdmin ? '<th>Actions</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${words.map(w => {
              const syns = (w.synonyms || []).map(s => typeof s === 'object' ? s.synonym : s);
              const ants = (w.antonyms || []).map(a => typeof a === 'object' ? a.antonym : a);
              const plrs = (w.plurals || []).map(p => typeof p === 'object' ? (p.plural_form || p.form) : p);
              return `
                <tr data-word-id="${w.id}">
                  <td class="td-word"><span class="word-text">${w.word}</span></td>
                  <td>${w.meaning || ''}</td>
                  <td>${syns.join('، ') || '—'}</td>
                  <td>${ants.join('، ') || '—'}</td>
                  <td>${w.plural || plrs.join('، ') || '—'}</td>
                  <td>${w.root || '—'}</td>
                  ${isAdmin ? `<td><button class="btn btn-ghost btn-sm delete-word-btn" data-word-id="${w.id}">🗑️</button></td>` : ''}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        ${words.length === 0 ? '<p class="empty-state">No words in this lesson yet. Import or add words to get started.</p>' : ''}
      </div>
    </div>
  `;
}

export async function initLessonPage(params) {
  on('#lesson-practice-btn', 'click', () => {
    sessionStorage.setItem('practice_lesson_ids', JSON.stringify([parseInt(params.id)]));
    navigate('/practice');
  });

  on('#lesson-import-btn', 'click', () => {
    showImportModal(parseInt(params.id), () => {
      navigate(`/lessons/${params.id}`); // Reload
    });
  });

  on('#lesson-export-btn', 'click', async () => {
    try {
      const data = await api.exportWords(params.id, 'json');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `lesson_${params.id}_words.json`; a.click();
      URL.revokeObjectURL(url);
      showToast('Exported successfully', 'success');
    } catch (e) { showToast('Export failed', 'error'); }
  });

  on('#lesson-add-word-btn', 'click', () => navigate('/words'));

  delegate(document, 'click', '.delete-word-btn', async (e, el) => {
    const wordId = el.dataset.wordId;
    const confirmed = await confirmModal('Delete Word', 'Are you sure you want to delete this word?');
    if (confirmed) {
      try {
        await api.deleteWord(wordId);
        showToast('Word deleted', 'success');
        navigate(`/lessons/${params.id}`);
      } catch (e) { showToast('Failed to delete', 'error'); }
    }
  });
}
