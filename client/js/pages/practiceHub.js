import api from '../api.js';
import { $, on } from '../utils/dom.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';

export async function renderPracticeHubPage() {
  let lessonsData;
  try { lessonsData = await api.getLessons(); } catch { lessonsData = { lessons: [] }; }
  const lessons = lessonsData.lessons || lessonsData || [];

  const poetryKeywords = ["غربة", "حنين", "المساء", "رثاء مي", "أهواك", "نفسي", "النسور"];
  const proseKeywords = ["التكافل", "كنيسة"];

  lessons.forEach(l => {
    let name = l.name_ar || l.name;
    if (poetryKeywords.some(k => name.includes(k))) {
      l.category = 'poetry';
    } else if (proseKeywords.some(k => name.includes(k))) {
      l.category = 'prose';
    } else {
      l.category = 'reading';
    }
  });

  return `
    <div class="practice-hub-page page-content" style="max-width:700px;margin:0 auto;padding:1.5rem;">

      <!-- Back to Main Menu — full width, prominent -->
      <button id="btn-main-menu" class="btn btn-secondary" style="width:100%;padding:1rem;font-size:1.1rem;font-weight:700;margin-bottom:2rem;border-radius:var(--radius-lg);">
        🏠 Back to Main Menu
      </button>

      <!-- Lesson Select -->
      <section style="margin-bottom:2rem;">
        <h2 style="margin-bottom:1rem;font-size:1.2rem;">📚 Select Lesson</h2>
        
        <div style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-bottom:1.5rem;">
          <button class="btn-filter active" data-filter="all" style="padding:0.6rem 1.2rem;border-radius:20px;font-weight:bold;background:var(--color-primary);border:2px solid var(--color-primary);color:white;cursor:pointer;transition:all 0.2s;">الكل</button>
          <button class="btn-filter" data-filter="reading" style="padding:0.6rem 1.2rem;border-radius:20px;font-weight:bold;background:transparent;border:2px solid #2b9348;color:#2b9348;cursor:pointer;transition:all 0.2s;">قراءة</button>
          <button class="btn-filter" data-filter="poetry" style="padding:0.6rem 1.2rem;border-radius:20px;font-weight:bold;background:transparent;border:2px solid #9d4edd;color:#9d4edd;cursor:pointer;transition:all 0.2s;">نصوص شعر</button>
          <button class="btn-filter" data-filter="prose" style="padding:0.6rem 1.2rem;border-radius:20px;font-weight:bold;background:transparent;border:2px solid #f77f00;color:#f77f00;cursor:pointer;transition:all 0.2s;">نثر</button>
        </div>

        <div id="lesson-select-grid" style="display:flex;flex-wrap:wrap;gap:0.75rem;">
          ${lessons.map((l, idx) => `
            <button class="lesson-select-card card-glass ${lessons.length === 1 || idx === 0 ? 'lesson-selected' : ''}"
              data-lesson-id="${l.id}"
              data-category="${l.category}"
              style="padding:0.75rem 1.25rem;border-radius:var(--radius-md);cursor:pointer;border:2px solid ${lessons.length === 1 || idx === 0 ? 'var(--color-primary)' : 'var(--color-border)'};font-size:1rem;background:var(--color-surface);transition:all 0.2s;">
              ${l.name_ar || l.name}
              <span style="margin-right:0.5rem;opacity:0.6;font-size:0.8rem;">${l.word_count || '?'} كلمة</span>
            </button>
          `).join('')}
          ${lessons.length === 0 ? '<p style="color:var(--color-text-muted)">لا توجد دروس. أضف كلمات أولاً.</p>' : ''}
        </div>
      </section>

      <!-- Settings -->
      <section style="margin-bottom:2rem;padding:1.25rem;border-radius:12px;border:2px solid rgba(255,255,255,0.12);background:rgba(17,29,53,0.7);">
        <h2 style="font-size:1.1rem;margin-bottom:1rem;">⚙️ Settings</h2>

        <label style="display:flex;align-items:center;gap:0.6rem;margin-bottom:1rem;cursor:pointer;font-size:1rem;">
          <input type="checkbox" id="setting-shuffle" checked style="width:20px;height:20px;accent-color:#7C6FFF;">
          🔀 Shuffle Question Order
        </label>

        <div>
          <p style="font-size:0.9rem;opacity:0.6;margin-bottom:0.6rem;">Question Types:</p>
          <div style="display:flex;flex-wrap:wrap;gap:0.75rem;">
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.4rem 0.8rem;border-radius:8px;background:rgba(255,255,255,0.08);">
              <input type="checkbox" id="setting-select-all" style="accent-color:#7C6FFF;"> تحديد الكل (Select All)
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.4rem 0.8rem;border-radius:8px;background:rgba(255,255,255,0.08);">
              <input type="checkbox" class="setting-dir" value="word_to_meaning" style="accent-color:#7C6FFF;"> المعنى
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.4rem 0.8rem;border-radius:8px;background:rgba(255,255,255,0.08);">
              <input type="checkbox" class="setting-dir" value="word_to_intended" style="accent-color:#7C6FFF;"> المراد
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.4rem 0.8rem;border-radius:8px;background:rgba(255,255,255,0.08);">
              <input type="checkbox" class="setting-dir" value="word_to_antonym" style="accent-color:#7C6FFF;"> المضاد
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.4rem 0.8rem;border-radius:8px;background:rgba(255,255,255,0.08);">
              <input type="checkbox" class="setting-dir" value="word_to_plural" style="accent-color:#7C6FFF;"> الجمع
            </label>
          </div>
        </div>
      </section>

      <!-- Mode Selection -->
      <section>
        <h2 style="font-size:1.1rem;margin-bottom:1rem;">🎯 Choose Mode</h2>
        <div style="display:flex;flex-direction:column;gap:0.75rem;">

          <button class="mode-start-btn card-glass" data-mode="flashcards"
            style="display:flex;align-items:center;gap:1rem;padding:1.2rem 1.5rem;border-radius:var(--radius-lg);cursor:pointer;border:2px solid transparent;text-align:right;width:100%;transition:border-color 0.2s;">
            <span style="font-size:2rem;">🗂️</span>
            <div>
              <div style="font-size:1.1rem;font-weight:700;">Flashcards</div>
              <div style="font-size:0.85rem;opacity:0.7;">اضغط لقلب البطاقة وتقييم معرفتك</div>
            </div>
          </button>

          <button class="mode-start-btn card-glass" data-mode="mcq"
            style="display:flex;align-items:center;gap:1rem;padding:1.2rem 1.5rem;border-radius:var(--radius-lg);cursor:pointer;border:2px solid transparent;text-align:right;width:100%;transition:border-color 0.2s;">
            <span style="font-size:2rem;">📝</span>
            <div>
              <div style="font-size:1.1rem;font-weight:700;">Multiple Choice</div>
              <div style="font-size:0.85rem;opacity:0.7;">اختر الإجابة الصحيحة من 4 خيارات</div>
            </div>
          </button>

          <button class="mode-start-btn card-glass" data-mode="write"
            style="display:flex;align-items:center;gap:1rem;padding:1.2rem 1.5rem;border-radius:var(--radius-lg);cursor:pointer;border:2px solid transparent;text-align:right;width:100%;transition:border-color 0.2s;">
            <span style="font-size:2rem;">✏️</span>
            <div>
              <div style="font-size:1.1rem;font-weight:700;">Write / Fill</div>
              <div style="font-size:0.85rem;opacity:0.7;">اكتب الإجابة من الذاكرة — الأصعب</div>
            </div>
          </button>

        </div>
      </section>

    </div>
  `;
}

export async function initPracticeHubPage() {
  // Main menu button
  on('#btn-main-menu', 'click', () => navigate('/dashboard'));

  // Filter logic
  const filterBtns = document.querySelectorAll('.btn-filter');
  const lessonCards = document.querySelectorAll('.lesson-select-card');
  
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state and styles
      filterBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = b.style.borderColor;
      });
      
      btn.classList.add('active');
      btn.style.background = btn.style.borderColor;
      btn.style.color = 'white';

      const filter = btn.dataset.filter;
      
      let firstVisible = null;
      lessonCards.forEach(card => {
        if (filter === 'all' || card.dataset.category === filter) {
          card.style.display = 'block';
          if (!firstVisible) firstVisible = card;
        } else {
          card.style.display = 'none';
        }
        // Deselect all
        card.style.borderColor = 'var(--color-border)';
        card.classList.remove('lesson-selected');
      });

      // Auto-select the first visible one
      if (firstVisible) {
        firstVisible.classList.add('lesson-selected');
        firstVisible.style.borderColor = 'var(--color-primary)';
      }
    });
  });

  // Lesson selection
  lessonCards.forEach(card => {
    card.addEventListener('click', () => {
      lessonCards.forEach(c => {
        c.style.borderColor = 'var(--color-border)';
        c.classList.remove('lesson-selected');
      });
      card.classList.add('lesson-selected');
      card.style.borderColor = 'var(--color-primary)';
    });
  });

  // Select All functionality
  const selectAllCb = document.getElementById('setting-select-all');
  const dirCbs = document.querySelectorAll('.setting-dir');
  
  if (selectAllCb) {
    selectAllCb.addEventListener('change', (e) => {
      dirCbs.forEach(cb => cb.checked = e.target.checked);
    });

    dirCbs.forEach(cb => {
      cb.addEventListener('change', () => {
        const allChecked = Array.from(dirCbs).every(c => c.checked);
        selectAllCb.checked = allChecked;
      });
    });
  }

  // Mode buttons
  document.querySelectorAll('.mode-start-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--color-primary)'; });
    btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'transparent'; });

    btn.addEventListener('click', async () => {
      const modeId = btn.dataset.mode;
      const selectedLesson = document.querySelector('.lesson-select-card.lesson-selected');

      if (!selectedLesson) {
        showToast('اختر درساً أولاً', 'warning');
        return;
      }

      const lessonId = parseInt(selectedLesson.dataset.lessonId);
      const isShuffle = document.getElementById('setting-shuffle')?.checked ?? true;
      const selectedDirs = [...document.querySelectorAll('.setting-dir:checked')].map(cb => cb.value);
      
      if (selectedDirs.length === 0) {
        showToast('الرجاء اختيار نوع واحد على الأقل من الأسئلة', 'warning');
        return;
      }

      const directions = selectedDirs;

      btn.disabled = true;
      btn.style.opacity = '0.7';

      try {
        const result = await api.startPractice({
          mode: modeId,
          lessonIds: [lessonId],
          settings: {
            questionCount: 999,
            questionTypes: modeId === 'flashcards' ? ['flashcard'] : modeId === 'mcq' ? ['mcq'] : ['fill_blank'],
            directions,
            shuffle: isShuffle,
          },
        });
        navigate(`/practice/session/${result.sessionId}`);
      } catch (err) {
        showToast(`فشل البدء: ${err.message}`, 'error');
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });
  });
}
