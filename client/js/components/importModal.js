import { $, on } from '../utils/dom.js';
import { showToast } from './toast.js';
import { hideModal, showModal } from './modal.js';
import api from '../api.js';

export function showImportModal(lessonId, onComplete) {
  showModal({
    title: 'Import Words',
    size: 'large',
    content: `
      <div class="import-modal-content">
        <div class="import-tabs">
          <button class="btn btn-secondary active" id="import-tab-paste" data-tab="paste">Paste Data</button>
          <button class="btn btn-ghost" id="import-tab-file" data-tab="file">Upload File</button>
        </div>
        <div id="import-paste-section">
          <div class="input-group">
            <label>Format</label>
            <select class="select" id="import-format">
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div class="input-group">
            <label>Data</label>
            <textarea class="textarea" id="import-data" rows="10" placeholder='JSON: [{"word":"كلمة","meaning":"word"}]&#10;CSV: word,meaning,synonym,antonym&#10;كلمة,word,مرادف,عكس' dir="auto"></textarea>
          </div>
        </div>
        <div id="import-file-section" style="display:none">
          <div class="file-upload-area" id="file-upload-area">
            <span class="file-upload-icon">📁</span>
            <p>Drop a CSV or JSON file here, or click to browse</p>
            <input type="file" id="import-file-input" accept=".csv,.json" style="display:none" />
          </div>
          <div id="file-name-display" style="display:none" class="badge badge-primary"></div>
        </div>
        <div id="import-preview" style="display:none;margin-top:1rem">
          <h4>Preview</h4>
          <div id="import-preview-content" class="import-preview-table"></div>
        </div>
        <div id="import-status" style="display:none;margin-top:1rem"></div>
      </div>
    `,
    actions: [
      { label: 'Cancel', className: 'btn btn-ghost', id: 'import-cancel', onClick: hideModal },
      { label: 'Import', className: 'btn btn-primary', id: 'import-submit', onClick: () => doImport(lessonId, onComplete) },
    ],
  });

  // Tab switching
  setTimeout(() => {
    on('#import-tab-paste', 'click', () => {
      $('#import-paste-section').style.display = '';
      $('#import-file-section').style.display = 'none';
      $('#import-tab-paste').className = 'btn btn-secondary active';
      $('#import-tab-file').className = 'btn btn-ghost';
    });
    on('#import-tab-file', 'click', () => {
      $('#import-paste-section').style.display = 'none';
      $('#import-file-section').style.display = '';
      $('#import-tab-file').className = 'btn btn-secondary active';
      $('#import-tab-paste').className = 'btn btn-ghost';
    });
    on('#file-upload-area', 'click', () => $('#import-file-input')?.click());
    on('#import-file-input', 'change', handleFileSelect);
  }, 100);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const display = $('#file-name-display');
  if (display) { display.textContent = file.name; display.style.display = 'inline-block'; }

  const reader = new FileReader();
  reader.onload = (ev) => {
    const content = ev.target.result;
    const format = file.name.endsWith('.csv') ? 'csv' : 'json';
    const formatSelect = $('#import-format');
    if (formatSelect) formatSelect.value = format;
    const dataArea = $('#import-data');
    if (dataArea) dataArea.value = content;
  };
  reader.readAsText(file);
}

async function doImport(lessonId, onComplete) {
  const format = $('#import-format')?.value || 'json';
  const data = $('#import-data')?.value?.trim();
  const statusEl = $('#import-status');

  if (!data) { showToast('Please enter or upload data', 'error'); return; }

  try {
    if (statusEl) { statusEl.style.display = ''; statusEl.innerHTML = '<div class="loading-spinner"></div> Importing...'; }
    const result = await api.bulkImport({ format, data, lessonId });
    showToast(`Imported ${result.imported || 0} words successfully!`, 'success');
    hideModal();
    if (onComplete) onComplete(result);
  } catch (err) {
    showToast(`Import failed: ${err.message}`, 'error');
    if (statusEl) statusEl.innerHTML = `<span class="text-error">Error: ${err.message}</span>`;
  }
}

export default { showImportModal };
