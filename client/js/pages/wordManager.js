import api from '../api.js';
import { $, on } from '../utils/dom.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';

export async function renderWordManagerPage() {
  let lessonsData;
  try { lessonsData = await api.getLessons(); } catch { lessonsData = { lessons: [] }; }
  const lessons = lessonsData.lessons || lessonsData || [];

  return `
    <div class="word-manager-page page-content">
      <div class="page-header">
        <h1>➕ Add / Edit Word</h1>
        <p class="text-muted">Add new vocabulary to a lesson</p>
      </div>

      <div class="word-form-card card-glass">
        <form id="word-form">
          <div class="form-grid">
            <div class="input-group">
              <label for="wf-lesson">Lesson *</label>
              <select class="select" id="wf-lesson" required>
                <option value="">Select a lesson...</option>
                ${lessons.map(l => `<option value="${l.id}">${l.name_ar || l.name} (${l.name})</option>`).join('')}
              </select>
            </div>
            <div class="input-group">
              <label for="wf-word">Word (الكلمة) *</label>
              <input type="text" class="input" id="wf-word" required dir="rtl" placeholder="أدخل الكلمة" />
            </div>
            <div class="input-group">
              <label for="wf-meaning">Meaning (المعنى)</label>
              <input type="text" class="input" id="wf-meaning" dir="rtl" placeholder="المعنى" />
            </div>
            <div class="input-group">
              <label for="wf-root">Root (الجذر)</label>
              <input type="text" class="input" id="wf-root" dir="rtl" placeholder="مثال: ك ت ب" />
            </div>
            <div class="input-group">
              <label for="wf-singular">Singular (المفرد)</label>
              <input type="text" class="input" id="wf-singular" dir="rtl" />
            </div>
            <div class="input-group">
              <label for="wf-plural">Plural (الجمع)</label>
              <input type="text" class="input" id="wf-plural" dir="rtl" />
            </div>
            <div class="input-group">
              <label for="wf-synonyms">Synonyms (المرادف) — comma separated</label>
              <input type="text" class="input" id="wf-synonyms" dir="rtl" placeholder="مرادف١، مرادف٢" />
            </div>
            <div class="input-group">
              <label for="wf-antonyms">Antonyms (المضاد) — comma separated</label>
              <input type="text" class="input" id="wf-antonyms" dir="rtl" placeholder="مضاد١، مضاد٢" />
            </div>
            <div class="input-group">
              <label for="wf-example">Example Sentence</label>
              <input type="text" class="input" id="wf-example" dir="rtl" placeholder="جملة مثال" />
            </div>
            <div class="input-group">
              <label for="wf-difficulty">Difficulty</label>
              <select class="select" id="wf-difficulty">
                <option value="1">1 — Very Easy</option>
                <option value="2">2 — Easy</option>
                <option value="3" selected>3 — Medium</option>
                <option value="4">4 — Hard</option>
                <option value="5">5 — Very Hard</option>
              </select>
            </div>
            <div class="input-group">
              <label for="wf-notes">Notes (ملاحظات)</label>
              <textarea class="textarea" id="wf-notes" dir="rtl" rows="2"></textarea>
            </div>
            <div class="input-group">
              <label for="wf-tags">Tags — comma separated</label>
              <input type="text" class="input" id="wf-tags" placeholder="tag1, tag2" />
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg" id="wf-submit">Add Word</button>
            <button type="reset" class="btn btn-ghost">Clear</button>
          </div>
          <div id="wf-status" style="display:none;margin-top:1rem"></div>
        </form>
      </div>
    </div>
  `;
}

export async function initWordManagerPage() {
  on('#word-form', 'submit', async (e) => {
    e.preventDefault();
    const btn = $('#wf-submit');
    const statusEl = $('#wf-status');

    const data = {
      lesson_id: parseInt($('#wf-lesson').value),
      word: $('#wf-word').value.trim(),
      meaning: $('#wf-meaning').value.trim() || null,
      root: $('#wf-root').value.trim() || null,
      singular: $('#wf-singular').value.trim() || null,
      plural: $('#wf-plural').value.trim() || null,
      difficulty: parseInt($('#wf-difficulty').value),
      example_sentence: $('#wf-example').value.trim() || null,
      grammatical_notes: $('#wf-notes').value.trim() || null,
      synonyms: $('#wf-synonyms').value.split(/[،,]/).map(s => s.trim()).filter(Boolean),
      antonyms: $('#wf-antonyms').value.split(/[،,]/).map(s => s.trim()).filter(Boolean),
      tags: $('#wf-tags').value.split(/[،,]/).map(s => s.trim()).filter(Boolean),
    };

    if (!data.lesson_id || !data.word) {
      showToast('Lesson and word are required', 'error');
      return;
    }

    try {
      btn.disabled = true; btn.textContent = 'Adding...';
      await api.createWord(data);
      showToast(`Added "${data.word}" successfully!`, 'success');
      $('#word-form').reset();
      statusEl.style.display = '';
      statusEl.innerHTML = `<span class="text-success">✅ Word added! <a href="#/lessons/${data.lesson_id}">View Lesson</a></span>`;
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Add Word';
    }
  });
}
