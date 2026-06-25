import { $, on, delegate } from '../utils/dom.js';
import { playCorrect, playWrong } from '../utils/audio.js';

let currentHandler = null;

export function renderQuestion(question, currentIdx, total, options = {}) {
  if (!question) return '<div class="question-card card-glass"><p class="empty-state">No question available</p></div>';

  const { timed, timeLimit } = options;
  const progressPct = total > 0 ? Math.round(((currentIdx) / total) * 100) : 0;

  let questionHTML = '';

  switch (question.type) {
    case 'flashcard':
      questionHTML = renderFlashcard(question);
      break;
    case 'mcq':
      questionHTML = renderMCQ(question);
      break;
    case 'fill_blank':
      questionHTML = renderFillBlank(question);
      break;
    case 'typing':
      questionHTML = renderTyping(question);
      break;
    case 'true_false':
      questionHTML = renderTrueFalse(question);
      break;
    case 'matching':
      questionHTML = renderMatching(question);
      break;
    default:
      questionHTML = renderMCQ(question);
  }

  return `
    <div class="practice-header">
      <div class="practice-progress">
        <span class="practice-counter">${currentIdx + 1} / ${total}</span>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${progressPct}%"></div></div>
      </div>
      ${timed ? `<div class="practice-timer" id="practice-timer"><span class="timer-icon">⏱️</span><span id="timer-display">${timeLimit || 30}s</span></div>` : ''}
    </div>
    <div class="question-card card-glass" id="question-card">
      <div class="question-type-badge">${getTypeBadge(question.type)}</div>
      <div class="question-direction-badge">${getDirectionLabel(question.direction)}</div>
      ${questionHTML}
    </div>
    <div class="practice-actions">
      <button class="btn btn-ghost hint-btn" id="hint-btn" title="Get a hint">
        <span class="hint-icon">💡</span> Hint
      </button>
    </div>
    <div class="hint-display" id="hint-display" style="display:none"></div>
  `;
}

function renderFlashcard(q) {
  return `
    <div class="flashcard" id="flashcard">
      <div class="flashcard-front" id="flashcard-front">
        <div class="flashcard-prompt">${q.prompt}</div>
        <button class="btn btn-primary" id="flip-btn">Show Answer</button>
      </div>
      <div class="flashcard-back" id="flashcard-back" style="display:none">
        <div class="flashcard-answer">${q.correctAnswer}</div>
        <div class="flashcard-rating">
          <p>How well did you know this?</p>
          <div class="rating-buttons">
            <button class="btn btn-danger answer-btn" data-answer="1" data-quality="1">Again 😣</button>
            <button class="btn btn-warning answer-btn" data-answer="2" data-quality="2">Hard 😕</button>
            <button class="btn btn-secondary answer-btn" data-answer="3" data-quality="3">Good 🙂</button>
            <button class="btn btn-success answer-btn" data-answer="4" data-quality="4">Easy 😊</button>
            <button class="btn btn-primary answer-btn" data-answer="5" data-quality="5">Perfect ✨</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMCQ(q) {
  const options = q.options || [];
  return `
    <div class="mcq-question">
      <div class="question-prompt">${q.prompt}</div>
      <div class="mcq-options" id="mcq-options">
        ${options.map((opt, i) => `
          <button class="option-btn answer-btn" data-answer="${escapeAttr(opt)}" data-index="${i}" id="opt-${i}">
            <span class="option-letter">${['أ', 'ب', 'ج', 'د'][i]}</span>
            <span class="option-text">${opt}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderFillBlank(q) {
  return `
    <div class="fill-blank-question">
      <div class="question-prompt">${q.prompt}</div>
      <div class="fill-input-wrap">
        <input type="text" class="input fill-input" id="fill-input" placeholder="اكتب الإجابة..." dir="rtl" autocomplete="off" />
        <button class="btn btn-primary answer-btn" id="submit-fill">Submit</button>
      </div>
    </div>
  `;
}

function renderTyping(q) {
  return `
    <div class="typing-question">
      <div class="question-prompt">${q.prompt}</div>
      <div class="fill-input-wrap">
        <input type="text" class="input fill-input" id="typing-input" placeholder="اكتب الإجابة..." dir="rtl" autocomplete="off" />
        <button class="btn btn-primary answer-btn" id="submit-typing">Submit</button>
      </div>
    </div>
  `;
}

function renderTrueFalse(q) {
  return `
    <div class="tf-question">
      <div class="question-prompt">${q.prompt}</div>
      <div class="tf-options">
        <button class="option-btn answer-btn tf-btn" data-answer="true">✓ True / صحيح</button>
        <button class="option-btn answer-btn tf-btn" data-answer="false">✗ False / خطأ</button>
      </div>
    </div>
  `;
}

function renderMatching(q) {
  const pairs = q.pairs || [];
  const shuffledRight = [...pairs.map(p => p.right)].sort(() => Math.random() - 0.5);
  return `
    <div class="matching-question">
      <div class="question-prompt">${q.prompt || 'Match the items'}</div>
      <div class="matching-grid">
        <div class="matching-left">
          ${pairs.map((p, i) => `<div class="match-item match-left-item" data-idx="${i}">${p.left}</div>`).join('')}
        </div>
        <div class="matching-right">
          ${shuffledRight.map((r, i) => `<div class="match-item match-right-item answer-btn" data-value="${escapeAttr(r)}" data-idx="${i}">${r}</div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

export function initQuestionListeners(question, onAnswer) {
  currentHandler = onAnswer;

  if (question.type === 'flashcard') {
    on('#flip-btn', 'click', () => {
      const front = $('#flashcard-front');
      const back = $('#flashcard-back');
      if (front) front.style.display = 'none';
      if (back) { back.style.display = 'block'; back.classList.add('animate-fadeIn'); }
    });
  }

  // MCQ options
  delegate('#question-card', 'click', '.answer-btn', (e, target) => {
    const answer = target.dataset.answer;
    if (!answer && answer !== '') return;

    // For MCQ, show correct/wrong
    if (question.type === 'mcq') {
      const allOpts = document.querySelectorAll('.option-btn');
      allOpts.forEach(btn => btn.disabled = true);
      // We'll get feedback from the server
    }

    if (onAnswer) onAnswer(answer);
  });

  // Fill blank / typing submit
  on('#submit-fill', 'click', () => {
    const input = $('#fill-input');
    if (input && input.value.trim()) onAnswer(input.value.trim());
  });
  on('#submit-typing', 'click', () => {
    const input = $('#typing-input');
    if (input && input.value.trim()) onAnswer(input.value.trim());
  });

  // Enter key for text inputs
  on('#fill-input', 'keydown', (e) => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) onAnswer(v); } });
  on('#typing-input', 'keydown', (e) => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) onAnswer(v); } });

  // Keyboard shortcuts for MCQ
  document.addEventListener('keydown', handleKeyboard);

  // Focus input if text question
  setTimeout(() => {
    const input = $('#fill-input') || $('#typing-input');
    if (input) input.focus();
  }, 100);
}

function handleKeyboard(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const key = e.key;
  if (['1', '2', '3', '4'].includes(key)) {
    const btn = $(`#opt-${parseInt(key) - 1}`);
    if (btn && !btn.disabled) btn.click();
  }
  if (key === 'h' || key === 'H') {
    const hintBtn = $('#hint-btn');
    if (hintBtn) hintBtn.click();
  }
}

export function showAnswerFeedback(isCorrect, correctAnswer) {
  const card = $('#question-card');
  if (!card) return;

  if (isCorrect) {
    card.classList.add('correct-flash');
    playCorrect();
  } else {
    card.classList.add('wrong-shake');
    playWrong();
  }

  // For MCQ, highlight correct and wrong
  const opts = document.querySelectorAll('.option-btn');
  opts.forEach(btn => {
    if (btn.dataset.answer === correctAnswer) btn.classList.add('option-correct');
    else if (btn.classList.contains('option-selected')) btn.classList.add('option-wrong');
  });
}

export function cleanupQuestionListeners() {
  document.removeEventListener('keydown', handleKeyboard);
}

function getTypeBadge(type) {
  const badges = {
    flashcard: '🗂️ Flashcard',
    mcq: '📝 MCQ',
    fill_blank: '✏️ Fill Blank',
    typing: '⌨️ Typing',
    true_false: '✓✗ True/False',
    matching: '🔗 Matching'
  };
  return badges[type] || type;
}

function getDirectionLabel(dir) {
  const labels = {
    word_to_meaning: 'Word → Meaning',
    meaning_to_word: 'Meaning → Word',
    word_to_synonym: 'Word → Synonym',
    word_to_antonym: 'Word → Antonym',
    word_to_plural: 'Singular → Plural',
    plural_to_singular: 'Plural → Singular',
  };
  return labels[dir] || '';
}

function escapeAttr(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default { renderQuestion, initQuestionListeners, showAnswerFeedback, cleanupQuestionListeners };
