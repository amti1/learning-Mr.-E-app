import api from '../api.js';
import { $, on, delegate } from '../utils/dom.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';

let sessionId = null;
let currentQuestion = null;
let totalQuestions = 0;
let currentIndex = 0;
let startTime = 0;
let sessionXP = 0;
let flipped = false;

function getOptionText(opt) {
  if (typeof opt === 'string') return opt;
  if (opt && opt.text) return opt.text;
  return String(opt);
}

function getWord(q) {
  // Extract just the word from the prompt if it contains Arabic question format
  if (q.word) return q.word;
  const prompt = q.prompt || q.promptAr || '';
  const match = prompt.match(/"([^"]+)"/);
  if (match) return match[1];
  return prompt;
}

export async function renderPracticeSessionPage(params) {
  sessionId = params.id;

  try {
    const data = await api.nextQuestion(sessionId);
    if (data.complete) {
      return `<div class="page-content" style="display:flex;align-items:center;justify-content:center;min-height:60vh">
        <div class="card-glass" style="padding:2rem;text-align:center">
          <h2>No Questions Generated</h2>
          <p>We couldn't generate any questions for the selected options.</p>
          <button class="btn btn-primary" onclick="window.location.hash='#/practice'">Back</button>
        </div>
      </div>`;
    }
    currentQuestion = data.currentQuestion;
    totalQuestions = data.totalQuestions;
    currentIndex = data.currentIndex;
  } catch (err) {
    return `<div class="page-content" style="display:flex;align-items:center;justify-content:center;min-height:60vh">
      <div class="card-glass" style="padding:2rem;text-align:center"><h2>Error</h2><p>${err.message}</p>
      <button class="btn btn-primary" onclick="window.location.hash='#/practice'">Back</button></div></div>`;
  }

  return `
    <div class="practice-session-page">
      <div class="session-topbar">
        <button class="btn btn-secondary" id="session-quit-btn" style="font-weight:600">🏠 Main Menu</button>
        <div class="session-progress-info">
          <span id="session-index">${currentIndex + 1}</span> / <span id="session-total">${totalQuestions}</span>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <button class="btn btn-ghost btn-sm" id="session-shuffle-btn" title="Shuffle remaining questions">🔀</button>
          <div class="session-xp" id="session-xp">0 XP</div>
        </div>
      </div>
      <div class="session-progress-bar">
        <div class="session-progress-fill" id="session-progress-fill" style="width:${((currentIndex) / totalQuestions) * 100}%"></div>
      </div>
      <div class="session-content" id="session-content">
        ${renderCard(currentQuestion)}
      </div>
    </div>
  `;
}

export async function initPracticeSessionPage(params) {
  sessionId = params.id;
  sessionXP = 0;
  startTime = Date.now();
  flipped = false;
  bindListeners();

  on('#session-quit-btn', 'click', async () => {
    try { const r = await api.completeSession(sessionId); showComplete(r); } catch { navigate('/practice'); }
  });

  on('#session-shuffle-btn', 'click', async () => {
    try {
      await api.shuffleSession(sessionId);
      showToast('🔀 Questions shuffled!', 'success');
    } catch {
      showToast('Could not shuffle', 'error');
    }
  });
}

// ── Direction metadata: label, color, icon ──────────────────
function getDirectionInfo(direction) {
  const map = {
    word_to_meaning:   { label: 'المعنى',    promptLabel: 'ما معنى:',           writeLabel: 'اكتب المعنى:',  color: '#4FC3F7', border: '2px solid #4FC3F7', bg: 'rgba(79,195,247,0.08)' },
    word_to_intended:  { label: 'المراد',    promptLabel: 'ما المراد بـ:',      writeLabel: 'اكتب المراد:',  color: '#EC407A', border: '2px solid #EC407A', bg: 'rgba(236,64,122,0.08)' },
    meaning_to_word:   { label: 'الكلمة',    promptLabel: 'ما الكلمة التي تعني:',writeLabel: 'اكتب الكلمة:', color: '#26C6DA', border: '2px solid #26C6DA', bg: 'rgba(38,198,218,0.08)' },
    word_to_synonym:   { label: 'المرادف',   promptLabel: 'ما مرادف:',           writeLabel: 'اكتب المرادف:',color: '#66BB6A', border: '2px solid #66BB6A', bg: 'rgba(102,187,106,0.08)' },
    word_to_antonym:   { label: 'المضاد',    promptLabel: 'ما مضاد:',            writeLabel: 'اكتب المضاد:', color: '#EF5350', border: '2px solid #EF5350', bg: 'rgba(239,83,80,0.08)'  },
    word_to_plural:    { label: 'الجمع',     promptLabel: 'ما جمع:',             writeLabel: 'اكتب الجمع:',  color: '#AB47BC', border: '2px solid #AB47BC', bg: 'rgba(171,71,188,0.08)' },
    plural_to_singular:{ label: 'المفرد',    promptLabel: 'ما مفرد:',            writeLabel: 'اكتب المفرد:', color: '#FFA726', border: '2px solid #FFA726', bg: 'rgba(255,167,38,0.08)' },
  };
  return map[direction] || { label: 'المعنى', promptLabel: 'ما معنى:', writeLabel: 'اكتب الإجابة:', color: '#4FC3F7', border: '2px solid #4FC3F7', bg: 'rgba(79,195,247,0.08)' };
}

function renderCard(q) {
  if (!q) return '<p>No question</p>';
  const type = q.type || q.questionType || 'flashcard';
  const word = getWord(q);
  const meaning = q.correctAnswer || '';
  const dir = getDirectionInfo(q.direction);

  const actionBar = `
    <div class="session-actions">
      <button class="btn btn-ghost btn-sm" id="btn-skip">⏭️ Skip</button>
      <button class="btn btn-ghost btn-sm" id="btn-hint">💡 Hint</button>
      <button class="btn btn-ghost btn-sm" id="btn-shuffle-inline" title="Shuffle remaining">🔀</button>
      <button class="btn btn-secondary btn-sm" id="btn-main-menu-inline">🏠 Practice Menu</button>
    </div>
    <div id="hint-display" style="display:none"></div>
  `;

  if (type === 'flashcard') {
    // Determine what's on front vs back based on direction
    const frontLabel = q.direction === 'meaning_to_word' ? 'المعنى' : 'الكلمة';
    const backLabel  = dir.label;

    return `
      <div class="flashcard-container" id="flashcard-container">
        <!-- Direction badge -->
        <div style="text-align:center;margin-bottom:0.75rem;">
          <span style="display:inline-block;padding:0.3rem 1rem;border-radius:20px;font-size:0.85rem;font-weight:700;background:${dir.bg};border:${dir.border};color:${dir.color};">
            ${dir.label}
          </span>
        </div>
        <div class="flashcard" id="flashcard" style="border:${dir.border}; position:relative; transform-style:preserve-3d; transition:transform 0.6s;">
          <div class="flashcard-front flashcard-face" id="flashcard-front" style="backface-visibility:hidden; -webkit-backface-visibility:hidden; position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--gradient-card); border-radius:12px;">
            <div class="flashcard-label" style="color:${dir.color};">${frontLabel}</div>
            <div class="flashcard-word">${word}</div>
            <div class="flashcard-hint">👆 اضغط لقلب البطاقة</div>
          </div>
          <div class="flashcard-back flashcard-face" id="flashcard-back" style="transform:rotateY(180deg); backface-visibility:hidden; -webkit-backface-visibility:hidden; position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--gradient-card); border-radius:12px;">
            <div class="flashcard-label" style="color:${dir.color};">${backLabel}</div>
            <div class="flashcard-meaning" style="color:${dir.color};">${meaning}</div>
            ${q.intended_meaning ? `<div class="flashcard-extra"><strong style="color:#EC407A;">المراد:</strong> ${q.intended_meaning}</div>` : ''}
            ${q.synonyms && q.synonyms.length ? `<div class="flashcard-extra"><strong style="color:#66BB6A;">المرادف:</strong> ${q.synonyms.join('، ')}</div>` : ''}
            ${q.antonyms && q.antonyms.length ? `<div class="flashcard-extra"><strong style="color:#EF5350;">المضاد:</strong> ${q.antonyms.join('، ')}</div>` : ''}
            ${q.plurals && q.plurals.length ? `<div class="flashcard-extra"><strong style="color:#AB47BC;">الجمع:</strong> ${q.plurals.join('، ')}</div>` : ''}
            ${q.singular ? `<div class="flashcard-extra"><strong style="color:#FFA726;">المفرد:</strong> ${q.singular}</div>` : ''}
          </div>
        </div>
        <div class="flashcard-rating" id="flashcard-rating" style="display:none">
          <div class="rating-buttons">
            <button class="btn btn-success rate-btn" data-rating="5">✅ أعرفها</button>
            <button class="btn btn-warning rate-btn" data-rating="3">🤔 جزئياً</button>
            <button class="btn btn-error rate-btn" data-rating="1">❌ لا أعرف</button>
          </div>
        </div>
        ${actionBar}
      </div>
    `;
  }

  if (type === 'mcq') {
    const options = (q.options || []).map(o => getOptionText(o));
    return `
      <div class="mcq-container">
        <!-- Direction badge -->
        <div style="text-align:center;margin-bottom:0.75rem;">
          <span style="display:inline-block;padding:0.3rem 1rem;border-radius:20px;font-size:0.85rem;font-weight:700;background:${dir.bg};border:${dir.border};color:${dir.color};">
            ${dir.label}
          </span>
        </div>
        <div class="mcq-prompt" style="border-bottom:${dir.border};padding-bottom:1rem;margin-bottom:1rem;">
          <div class="mcq-label" style="color:${dir.color};">${dir.promptLabel}</div>
          <div class="mcq-word">${word}</div>
        </div>
        <div class="mcq-options" id="mcq-options">
          ${options.map((text, i) => `
            <button class="mcq-option card-glass card-interactive" data-answer="${text}" data-idx="${i}">
              <span class="mcq-option-letter" style="background:${dir.bg};color:${dir.color};">${['أ', 'ب', 'ج', 'د'][i]}</span>
              <span class="mcq-option-text">${text}</span>
            </button>
          `).join('')}
        </div>
        <div id="mcq-feedback" style="display:none"></div>
        ${actionBar}
      </div>
    `;
  }

  if (type === 'fill_blank' || type === 'typing') {
    return `
      <div class="write-container">
        <!-- Direction badge -->
        <div style="text-align:center;margin-bottom:0.75rem;">
          <span style="display:inline-block;padding:0.3rem 1rem;border-radius:20px;font-size:0.85rem;font-weight:700;background:${dir.bg};border:${dir.border};color:${dir.color};">
            ${dir.label}
          </span>
        </div>
        <div class="write-prompt" style="border-bottom:${dir.border};padding-bottom:1rem;margin-bottom:1rem;">
          <div class="write-label" style="color:${dir.color};">${dir.writeLabel}</div>
          <div class="write-word">${word}</div>
        </div>
        <form id="write-form" class="write-form">
          <input type="text" class="input write-input" id="write-input" dir="rtl" placeholder="اكتب إجابتك هنا..." autofocus autocomplete="off" />
          <button type="submit" class="btn btn-primary btn-lg">إرسال</button>
        </form>
        <div id="write-feedback" style="display:none"></div>
        ${actionBar}
      </div>
    `;
  }

  return renderCard({ ...q, type: 'flashcard' });
}


function bindListeners() {
  startTime = Date.now();
  flipped = false;
  let type = currentQuestion?.type || currentQuestion?.questionType || 'flashcard';
  if (type !== 'flashcard' && type !== 'mcq' && type !== 'fill_blank' && type !== 'typing') {
    type = 'flashcard'; // Fallback to match renderCard
  }

  // Skip button
  on('#btn-skip', 'click', async () => {
    await submitAndNext('__skip__');
  });

  // Inline Practice Hub button (always visible inside card)
  on('#btn-main-menu-inline', 'click', () => navigate('/practice'));

  // Inline Shuffle button
  on('#btn-shuffle-inline', 'click', async () => {
    try {
      await api.shuffleSession(sessionId);
      showToast('🔀 Questions shuffled!', 'success');
    } catch {
      showToast('Could not shuffle', 'error');
    }
  });

  // Hint button
  on('#btn-hint', 'click', async () => {
    const hintEl = document.getElementById('hint-display');
    if (!hintEl) return;
    try {
      const hint = await api.getHint(sessionId, 1);
      hintEl.style.display = '';
      hintEl.innerHTML = `<div class="hint-card card-glass" style="margin-top:1rem;padding:0.75rem;text-align:center;direction:rtl">💡 ${hint.hint || hint.message || 'فكر جيداً...'}</div>`;
    } catch {
      // Build local hint from word data
      const q = currentQuestion;
      let hintText = '';
      if (q.correctAnswer) hintText = `الحرف الأول: ${q.correctAnswer[0]}`;
      hintEl.style.display = '';
      hintEl.innerHTML = `<div class="hint-card card-glass" style="margin-top:1rem;padding:0.75rem;text-align:center;direction:rtl">💡 ${hintText || 'لا يوجد تلميح'}</div>`;
    }
  });

  if (type === 'flashcard') {
    on('#flashcard', 'click', () => {
      const card = document.getElementById('flashcard');
      const rating = document.getElementById('flashcard-rating');
      if (!card) return;

      flipped = !flipped;
      if (flipped) {
        card.classList.add('flipped');
        if (rating && rating.style.display === 'none') {
          rating.style.display = '';
          rating.style.animation = 'fadeIn 0.4s forwards';
        }
      } else {
        card.classList.remove('flipped');
      }
    });
    // Use on() with the specific container instead of delegate on document to avoid leaks
    on('#flashcard-rating', 'click', async (e) => {
      const btn = e.target.closest('.rate-btn');
      if (!btn) return;
      const rating = parseInt(btn.dataset.rating);
      await submitAndNext(rating >= 4 ? (currentQuestion.correctAnswer || '') : '__wrong__', rating);
    });
  }

  if (type === 'mcq') {
    on('#mcq-options', 'click', async (e) => {
      const el = e.target.closest('.mcq-option');
      if (!el || el.classList.contains('mcq-disabled')) return;
      document.querySelectorAll('.mcq-option').forEach(o => o.classList.add('mcq-disabled'));
      await submitAndNext(el.dataset.answer);
    });
  }

  if (type === 'fill_blank' || type === 'typing') {
    on('#write-form', 'submit', async (e) => {
      e.preventDefault();
      const input = $('#write-input');
      if (!input || !input.value.trim()) return;
      input.disabled = true;
      await submitAndNext(input.value.trim());
    });
  }
}

async function submitAndNext(answer, selfRating) {
  try {
    const result = await api.submitAnswer(sessionId, {
      answer,
      responseTimeMs: Date.now() - startTime,
      selfRating,
    });

    showFeedback(result);
    sessionXP += (result.xpEarned || 0);
    const xpEl = $('#session-xp');
    if (xpEl) { xpEl.textContent = `${sessionXP} XP`; }

    const fill = document.getElementById('session-progress-fill');
    if (fill) fill.style.width = `${((currentIndex + 1) / totalQuestions) * 100}%`;

    setTimeout(async () => {
      if (result.complete) { await completeSession(); }
      else { await loadNext(); }
    }, result.correct ? 600 : 1400);
  } catch (err) {
    showToast(err.message, 'error');
    setTimeout(() => loadNext(), 800);
  }
}

function showFeedback(result) {
  const type = currentQuestion?.type || 'flashcard';

  if (type === 'mcq') {
    document.querySelectorAll('.mcq-option').forEach(o => {
      const oText = o.dataset.answer;
      if (oText === result.correctAnswer) o.classList.add('mcq-correct');
      else if (!result.correct && oText === result.userAnswer) o.classList.add('mcq-wrong');
    });
    const fb = document.getElementById('mcq-feedback');
    if (fb) { fb.style.display = ''; fb.innerHTML = result.correct ? `<div class="feedback-correct">✅ صحيح!</div>` : `<div class="feedback-wrong">❌ خطأ — الإجابة: <strong>${result.correctAnswer}</strong></div>`; }
  }

  if (type === 'fill_blank' || type === 'typing') {
    const fb = document.getElementById('write-feedback');
    if (fb) { fb.style.display = ''; fb.innerHTML = result.correct ? `<div class="feedback-correct">✅ صحيح!</div>` : `<div class="feedback-wrong">❌ خطأ — الإجابة: <strong>${result.correctAnswer}</strong></div>`; }
  }
}

async function loadNext() {
  try {
    const data = await api.nextQuestion(sessionId);
    if (data.complete) { await completeSession(); return; }
    currentQuestion = data.currentQuestion;
    currentIndex = data.currentIndex;
    totalQuestions = data.totalQuestions;
    const content = $('#session-content');
    const idxEl = $('#session-index');
    if (content) { content.innerHTML = renderCard(currentQuestion); bindListeners(); }
    if (idxEl) idxEl.textContent = currentIndex + 1;
  } catch { await completeSession(); }
}

async function completeSession() {
  try { const r = await api.completeSession(sessionId); showComplete(r); }
  catch { navigate('/practice'); }
}

function showComplete(result) {
  const el = document.querySelector('.practice-session-page') || $('#session-content');
  if (!el) { navigate('/dashboard'); return; }
  const acc = result.accuracy || 0;
  const grade = acc >= 90 ? 'A+' : acc >= 80 ? 'A' : acc >= 70 ? 'B' : acc >= 60 ? 'C' : 'D';
  const gc = acc >= 80 ? 'var(--color-success)' : acc >= 60 ? 'var(--color-accent)' : 'var(--color-error)';

  el.innerHTML = `
    <div class="session-complete">
      <div class="complete-card card-glass">
        <h1>🎉 انتهت الجلسة!</h1>
        <div class="complete-grade" style="color:${gc}">${grade}</div>
        <div class="complete-stats">
          <div class="complete-stat"><span class="complete-stat-value">${result.correctCount || 0}/${result.totalQuestions || 0}</span><span class="complete-stat-label">صحيح</span></div>
          <div class="complete-stat"><span class="complete-stat-value">${acc}%</span><span class="complete-stat-label">دقة</span></div>
          <div class="complete-stat"><span class="complete-stat-value">+${result.xpEarned || sessionXP}</span><span class="complete-stat-label">XP</span></div>
        </div>
        ${(result.weakWords?.length) ? `<div class="complete-weak"><h3>⚠️ كلمات تحتاج مراجعة</h3><div class="weak-word-list">${result.weakWords.map(w => `<span class="badge badge-warning">${w.word || w}</span>`).join(' ')}</div></div>` : ''}
        <div class="complete-actions">
          <button class="btn btn-primary btn-lg" id="c-again">🔄 تدرب مرة أخرى</button>
          <button class="btn btn-secondary btn-lg" id="c-dash">🏠 الرئيسية</button>
        </div>
      </div>
    </div>
  `;
  on('#c-again', 'click', () => navigate('/practice'));
  on('#c-dash', 'click', () => navigate('/dashboard'));
}
