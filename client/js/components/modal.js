import { $, on } from '../utils/dom.js';

let modalOverlay = null;

function ensureOverlay() {
  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'modal-overlay';
    modalOverlay.className = 'modal-overlay';
    modalOverlay.innerHTML = '<div class="modal" id="modal-box"></div>';
    document.body.appendChild(modalOverlay);

    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) hideModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay.classList.contains('modal-visible')) hideModal();
    });
  }
  return modalOverlay;
}

export function showModal({ title, content, actions = [], size = 'medium', onClose } = {}) {
  const overlay = ensureOverlay();
  const box = $('#modal-box');
  const sizeClass = size === 'large' ? 'modal-lg' : size === 'small' ? 'modal-sm' : '';

  box.className = `modal ${sizeClass}`;
  box.innerHTML = `
    <div class="modal-header">
      <h3>${title || ''}</h3>
      <button class="btn btn-ghost btn-icon modal-close-btn" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">${content || ''}</div>
    ${actions.length ? `<div class="modal-footer">${actions.map(a =>
      `<button class="btn ${a.className || 'btn-primary'}" id="${a.id || ''}">${a.label}</button>`
    ).join('')}</div>` : ''}
  `;

  overlay.classList.add('modal-visible');
  overlay._onClose = onClose;

  on('#modal-close-btn', 'click', hideModal);
  actions.forEach(a => {
    if (a.id && a.onClick) on(`#${a.id}`, 'click', a.onClick);
  });
}

export function hideModal() {
  if (modalOverlay) {
    modalOverlay.classList.remove('modal-visible');
    if (modalOverlay._onClose) modalOverlay._onClose();
  }
}

export function confirmModal(title, message) {
  return new Promise(resolve => {
    showModal({
      title,
      content: `<p>${message}</p>`,
      actions: [
        { label: 'Cancel', className: 'btn btn-ghost', id: 'confirm-no', onClick: () => { hideModal(); resolve(false); } },
        { label: 'Confirm', className: 'btn btn-danger', id: 'confirm-yes', onClick: () => { hideModal(); resolve(true); } },
      ],
    });
  });
}

export default { showModal, hideModal, confirmModal };
