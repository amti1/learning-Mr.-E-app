import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', '.data');
mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = join(DATA_DIR, 'database.sqlite');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initializeDatabase() {
  const db = getDb();

  // ===== CORE CONTENT TABLES =====

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_ar TEXT,
      description TEXT,
      icon TEXT DEFAULT '📚',
      sort_order INTEGER DEFAULT 0,
      parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      name_ar TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      name_ar TEXT,
      description TEXT,
      source_textbook TEXT,
      difficulty INTEGER DEFAULT 3 CHECK(difficulty BETWEEN 1 AND 5),
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      meaning TEXT,
      intended_meaning TEXT,
      root TEXT,
      singular TEXT,
      plural TEXT,
      difficulty INTEGER DEFAULT 3 CHECK(difficulty BETWEEN 1 AND 5),
      example_sentence TEXT,
      grammatical_notes TEXT,
      linguistic_notes TEXT,
      common_mistake TEXT,
      frequency_level INTEGER DEFAULT 3 CHECK(frequency_level BETWEEN 1 AND 5),
      exam_importance INTEGER DEFAULT 3 CHECK(exam_importance BETWEEN 1 AND 5),
      teacher_notes TEXT,
      custom_explanation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS word_synonyms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      synonym TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS word_antonyms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      antonym TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS word_plurals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      plural_form TEXT NOT NULL,
      plural_type TEXT
    );

    CREATE TABLE IF NOT EXISTS word_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      tag TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS confusion_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id_1 INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      word_id_2 INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      confusion_type TEXT,
      notes TEXT
    );

    -- ===== USER & AUTH TABLES =====

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'student' CHECK(role IN ('student', 'teacher', 'admin')),
      settings TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ===== LEARNING ENGINE TABLES =====

    CREATE TABLE IF NOT EXISTS user_word_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      ease_factor REAL DEFAULT 2.5,
      interval_days REAL DEFAULT 0,
      repetitions INTEGER DEFAULT 0,
      memory_strength REAL DEFAULT 0,
      stability REAL DEFAULT 1.0,
      weakness_score REAL DEFAULT 0,
      mastery_score REAL DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      hint_count INTEGER DEFAULT 0,
      streak INTEGER DEFAULT 0,
      total_attempts INTEGER DEFAULT 0,
      avg_response_time REAL DEFAULT 0,
      confidence_estimate REAL DEFAULT 0.5,
      last_reviewed_at DATETIME,
      next_review_at DATETIME,
      last_quality INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, word_id)
    );

    CREATE TABLE IF NOT EXISTS review_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      question_type TEXT NOT NULL,
      question_direction TEXT,
      quality INTEGER CHECK(quality BETWEEN 0 AND 5),
      response_time_ms INTEGER,
      used_hint INTEGER DEFAULT 0,
      hint_type TEXT,
      user_answer TEXT,
      correct_answer TEXT,
      was_correct INTEGER DEFAULT 0,
      distractor_ids TEXT,
      chosen_distractor_id INTEGER,
      session_id TEXT,
      mode TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS practice_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      lesson_ids TEXT,
      category_id INTEGER,
      total_questions INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      hint_count INTEGER DEFAULT 0,
      avg_response_time REAL DEFAULT 0,
      xp_earned INTEGER DEFAULT 0,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      settings TEXT DEFAULT '{}'
    );

    -- ===== GAMIFICATION TABLES =====

    CREATE TABLE IF NOT EXISTS user_gamification (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_activity_date DATE,
      daily_goal INTEGER DEFAULT 20,
      daily_progress INTEGER DEFAULT 0,
      weekly_goal INTEGER DEFAULT 100,
      weekly_progress INTEGER DEFAULT 0,
      total_words_mastered INTEGER DEFAULT 0,
      total_lessons_completed INTEGER DEFAULT 0,
      total_time_spent_min INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ar TEXT,
      description TEXT,
      icon TEXT DEFAULT '🏆',
      category TEXT DEFAULT 'general',
      requirement_type TEXT NOT NULL,
      requirement_value INTEGER DEFAULT 1,
      xp_reward INTEGER DEFAULT 50
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
      unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, achievement_id)
    );

    -- ===== INDEXES =====

    CREATE INDEX IF NOT EXISTS idx_words_lesson ON words(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);
    CREATE INDEX IF NOT EXISTS idx_words_meaning ON words(meaning);
    CREATE INDEX IF NOT EXISTS idx_words_root ON words(root);
    CREATE INDEX IF NOT EXISTS idx_word_synonyms_word ON word_synonyms(word_id);
    CREATE INDEX IF NOT EXISTS idx_word_antonyms_word ON word_antonyms(word_id);
    CREATE INDEX IF NOT EXISTS idx_word_plurals_word ON word_plurals(word_id);
    CREATE INDEX IF NOT EXISTS idx_word_tags_word ON word_tags(word_id);
    CREATE INDEX IF NOT EXISTS idx_word_tags_tag ON word_tags(tag);
    CREATE INDEX IF NOT EXISTS idx_user_word_progress_user ON user_word_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_word_progress_word ON user_word_progress(word_id);
    CREATE INDEX IF NOT EXISTS idx_user_word_progress_next_review ON user_word_progress(next_review_at);
    CREATE INDEX IF NOT EXISTS idx_review_log_user ON review_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_review_log_word ON review_log(word_id);
    CREATE INDEX IF NOT EXISTS idx_review_log_session ON review_log(session_id);
    CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON practice_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_lessons_unit ON lessons(unit_id);
    CREATE INDEX IF NOT EXISTS idx_units_category ON units(category_id);
  `);

  seedData(db);
  return db;
}

function seedData(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (count.c > 0) return;

  // ===== SEED ACHIEVEMENTS =====
  const achievements = [
    ['first_word', 'First Word', 'الكلمة الأولى', 'Answer your first question correctly', '🌟', 'milestone', 'correct_answers', 1, 25],
    ['ten_correct', 'Getting Started', 'بداية موفقة', 'Answer 10 questions correctly', '✅', 'milestone', 'correct_answers', 10, 50],
    ['fifty_correct', 'Knowledge Seeker', 'طالب العلم', 'Answer 50 questions correctly', '📖', 'milestone', 'correct_answers', 50, 100],
    ['hundred_correct', 'Scholar', 'عالِم', 'Answer 100 questions correctly', '🎓', 'milestone', 'correct_answers', 100, 200],
    ['streak_3', 'On Fire', 'مشتعل', '3-day streak', '🔥', 'streak', 'streak_days', 3, 75],
    ['streak_7', 'Week Warrior', 'محارب الأسبوع', '7-day streak', '⚡', 'streak', 'streak_days', 7, 150],
    ['streak_30', 'Monthly Master', 'بطل الشهر', '30-day streak', '🏆', 'streak', 'streak_days', 30, 500],
    ['perfect_session', 'Perfect Score', 'نتيجة مثالية', '100% in a session', '💯', 'performance', 'perfect_sessions', 1, 200],
    ['mastered_10', 'Word Collector', 'جامع الكلمات', 'Master 10 words', '📦', 'mastery', 'words_mastered', 10, 100],
    ['mastered_50', 'Vocabulary Builder', 'باني المفردات', 'Master 50 words', '🏗️', 'mastery', 'words_mastered', 50, 250],
    ['mastered_100', 'Vocabulary Expert', 'خبير المفردات', 'Master 100 words', '🏛️', 'mastery', 'words_mastered', 100, 500],
    ['level_5', 'Rising Star', 'نجم صاعد', 'Reach level 5', '⭐', 'level', 'level_reached', 5, 100],
    ['level_10', 'Shining Star', 'نجم لامع', 'Reach level 10', '🌟', 'level', 'level_reached', 10, 250],
  ];

  const insertAchievement = db.prepare('INSERT INTO achievements (id, name, name_ar, description, icon, category, requirement_type, requirement_value, xp_reward) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const a of achievements) insertAchievement.run(...a);

  // ===== SIMPLE STRUCTURE: Category → Unit → Lesson =====
  const catId = db.prepare('INSERT INTO categories (name, name_ar, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)').run('Reading Lessons', 'دروس القراءة', 'مفردات دروس القراءة', '📖', 1).lastInsertRowid;
  const unitId = db.prepare('INSERT INTO units (category_id, name, name_ar, sort_order) VALUES (?, ?, ?, ?)').run(catId, 'Unit 1', 'الوحدة الأولى', 1).lastInsertRowid;
  const lessonId = db.prepare('INSERT INTO lessons (unit_id, name, name_ar, description, sort_order) VALUES (?, ?, ?, ?, ?)').run(unitId, 'Al-Biruni', 'البيروني', 'درس قراءة: البيروني', 1).lastInsertRowid;

  // ===== ALL 74 WORDS FROM البيروني =====
  const insertWord = db.prepare('INSERT INTO words (lesson_id, word, meaning, difficulty) VALUES (?, ?, ?, ?)');
  const insertSyn = db.prepare('INSERT INTO word_synonyms (word_id, synonym, sort_order) VALUES (?, ?, ?)');
  const insertAnt = db.prepare('INSERT INTO word_antonyms (word_id, antonym, sort_order) VALUES (?, ?, ?)');
  const insertPlural = db.prepare('INSERT INTO word_plurals (word_id, plural_form) VALUES (?, ?)');

  const biruni = [
    { w: 'يتميز', m: 'يظهر فضله', syn: ['ينفرد'], ant: [], pl: [] },
    { w: 'أبرز', m: 'أظهر وأوضح وأشهر', syn: [], ant: ['أخفى'], pl: [] },
    { w: 'موكب', m: 'جماعة', syn: [], ant: [], pl: ['مواكب'] },
    { w: 'واسعي الأفق', m: 'كثير الاطلاع والمعرفة', syn: [], ant: [], pl: ['الآفاق'] },
    { w: 'تزدان', m: 'تحسن وتجمل', syn: [], ant: ['تقبح', 'تسوء', 'تشوه'], pl: [] },
    { w: 'تحوي', m: 'تشتمل وتضم', syn: [], ant: [], pl: [] },
    { w: 'أكابر', m: 'عظماء وبارزين', syn: [], ant: [], pl: [], sing: 'أكبر' },
    { w: 'الرفيع', m: 'الشريف والعالي القدر', syn: [], ant: ['الوضيع'], pl: [] },
    { w: 'الإقرار', m: 'الاعتراف والإثبات', syn: [], ant: ['الإنكار'], pl: [] },
    { w: 'مساهمة', m: 'مشاركة', syn: [], ant: ['مقاطعة'], pl: [] },
    { w: 'أنصفت', m: 'عدلت', syn: [], ant: ['ظلمت', 'جارت'], pl: [] },
    { w: 'الأغلبية الساحقة', m: 'الأكثرية المطلقة', syn: [], ant: [], pl: [] },
    { w: 'أعماها', m: 'غطى على بصرها', syn: [], ant: [], pl: [] },
    { w: 'الحقد', m: 'الكره', syn: [], ant: [], pl: ['أحقاد'] },
    { w: 'التعصب', m: 'التشدد', syn: [], ant: ['التسامح'], pl: [] },
    { w: 'فضل', m: 'إحسان ومزية', syn: [], ant: [], pl: ['فضول'] },
    { w: 'واتتها', m: 'سنحت لها، وتهيأت', syn: [], ant: ['عاكستها'], pl: [] },
    { w: 'نهلت', m: 'غرفت وأخذت', syn: [], ant: ['صدت', 'أعرضت'], pl: [] },
    { w: 'الإغريقي', m: 'اليوناني القديم', syn: [], ant: [], pl: [] },
    { w: 'نتصور', m: 'نتخيل', syn: [], ant: ['نتحقق', 'نتأكد'], pl: [] },
    { w: 'يؤهلها', m: 'يعدها', syn: [], ant: ['يعوقها'], pl: [] },
    { w: 'عُنيت', m: 'شغلت - اهتمت', syn: [], ant: ['أهملت'], pl: [] },
    { w: 'الزاهي', m: 'الناضر والناضج', syn: [], ant: ['الباهت'], pl: [] },
    { w: 'كيانها', m: 'ذاتها، أو وجودها', syn: [], ant: [], pl: ['كيانات'] },
    { w: 'يزدهي', m: 'يفتخر ويزهو', syn: [], ant: [], pl: [] },
    { w: 'آن', m: 'وقت وحين', syn: [], ant: [], pl: ['آونة'] },
    { w: 'سطعوا', m: 'أضاءوا، ولمعوا', syn: ['ظهروا'], ant: [], pl: [] },
    { w: 'الأعلى كعبًا', m: 'أرفع شأنًا', syn: [], ant: [], pl: ['أكعب', 'كعاب', 'كعوب'] },
    { w: 'الأرسخ', m: 'الأثبت', syn: [], ant: [], pl: [] },
    { w: 'ابن سينا', m: 'عالم وطبيب مسلم من بخارى اشتغل بالطب والفلسفة.', syn: [], ant: [], pl: [] },
    { w: 'ابن الهيثم', m: 'عالم موسوعي أسهم في البصريات والرياضيات والفلك', syn: [], ant: [], pl: [] },
    { w: 'الحقبة', m: 'المدة', syn: [], ant: [], pl: ['الحقب', 'الحقوب'] },
    { w: 'العواصم', m: 'حاضرة البلد', syn: [], ant: [], pl: [], sing: 'العاصمة' },
    { w: 'عمّر', m: 'عاش طويلاً', syn: [], ant: [], pl: [] },
    { w: 'الطبيعية', m: 'علوم تبحث في طبائع المادة', syn: [], ant: [], pl: [] },
    { w: 'ضاحية', m: 'ناحية ظاهرة خارج البلد', syn: [], ant: [], pl: ['ضواح'] },
    { w: 'حداثته', m: 'شبابه', syn: [], ant: [], pl: [] },
    { w: 'استقصي', m: 'تتبع', syn: [], ant: [], pl: [] },
    { w: 'أساطير', m: 'الأباطيل وأحاديث عجيبة', syn: [], ant: [], pl: [], sing: 'أسطورة' },
    { w: 'مقبولة', m: 'مرضية معقولة', syn: [], ant: ['مرذولة'], pl: [] },
    { w: 'يكافئه', m: 'يجازيه', syn: [], ant: ['يعاقبه'], pl: [] },
    { w: 'تنوء', m: 'تثقل وتميل', syn: [], ant: [], pl: [] },
    { w: 'بأحمالها', m: 'أثقال', syn: [], ant: [], pl: [], sing: 'حمل' },
    { w: 'التنجيم', m: 'توسعة', syn: [], ant: ['اختصار', 'تضييق'], pl: [] },
    { w: 'أفاد', m: 'اكتسب', syn: [], ant: [], pl: [] },
    { w: 'حذق', m: 'مهر', syn: [], ant: [], pl: [] },
    { w: 'الخالية', m: 'الماضية', syn: [], ant: ['الآتية'], pl: [] },
    { w: 'إفاضة', m: 'توسعة وزيادة', syn: [], ant: [], pl: [] },
    { w: 'الجماهر', m: 'جمهرة وهي من كل شيء معظمه', syn: [], ant: [], pl: [], sing: 'جمهرة' },
    { w: 'المشهور', m: 'المعروف', syn: [], ant: ['المغمور'], pl: [] },
    { w: 'متباينة', m: 'مختلفة', syn: [], ant: ['متشابهة'], pl: [] },
    { w: 'غاية', m: 'نهاية وآخر', syn: [], ant: [], pl: ['غايات', 'غاي'] },
    { w: 'نادرة', m: 'قليلة', syn: [], ant: ['منتشرة', 'كثيرة'], pl: [] },
    { w: 'محقق', m: 'باحث ومدقق', syn: [], ant: [], pl: [] },
    { w: 'حصرت', m: 'حددت وأحصيت', syn: [], ant: [], pl: [] },
    { w: 'مخطوط', m: 'مكتوب بخط اليد', syn: [], ant: [], pl: ['مخطوطات'] },
    { w: 'مفقود', m: 'ضائع', syn: [], ant: [], pl: [] },
    { w: 'جملة', m: 'مجموعة', syn: [], ant: [], pl: [] },
    { w: 'الأجرام', m: 'الجسم', syn: [], ant: [], pl: [], sing: 'جرم' },
    { w: 'تميز', m: 'انفرد', syn: [], ant: [], pl: [] },
    { w: 'فذة', m: 'متفردة', syn: [], ant: [], pl: ['أفذاذ', 'فزوز'] },
    { w: 'نادر', m: 'قليل', syn: [], ant: ['منتشر', 'كثير'], pl: [] },
    { w: 'متوقد', m: 'حاد وشديد', syn: [], ant: [], pl: [] },
    { w: 'مصابرة', m: 'المبالغة في الصبر', syn: [], ant: [], pl: [] },
    { w: 'المثابرة', m: 'المواظبة والمداومة', syn: [], ant: [], pl: [] },
    { w: 'جلد', m: 'صبر', syn: [], ant: ['جزع'], pl: [] },
    { w: 'نظير', m: 'مثيل ومساو', syn: [], ant: [], pl: ['نظراء'] },
    { w: 'الاستقراء', m: 'تتبع الجزئيات للوصول إلى النتيجة الكلية.', syn: [], ant: [], pl: [] },
    { w: 'زهد', m: 'إعراض وترك', syn: [], ant: [], pl: [] },
    { w: 'علو', m: 'ترفع', syn: [], ant: [], pl: [] },
    { w: 'الصغائر', m: 'التوافه أو ما ليس له قيمة.', syn: [], ant: [], pl: [], sing: 'الصغيرة' },
    { w: 'الاقتباسات', m: 'الاستفادات', syn: [], ant: [], pl: [], sing: 'الاقتباس' },
    { w: 'اعترافًا', m: '', syn: [], ant: ['جحودًا', 'نكرانًا'], pl: [] },
    { w: 'الشمول', m: 'العموم', syn: [], ant: [], pl: [] },
  ];

  const seedAll = db.transaction(() => {
    for (const item of biruni) {
      const r = insertWord.run(lessonId, item.w, item.m, 3);
      const wid = r.lastInsertRowid;
      item.syn.forEach((s, i) => insertSyn.run(wid, s, i));
      item.ant.forEach((a, i) => insertAnt.run(wid, a, i));
      item.pl.forEach(p => insertPlural.run(wid, p));
      // Store singular in the words table
      if (item.sing) {
        db.prepare('UPDATE words SET singular = ? WHERE id = ?').run(item.sing, wid);
      }
    }
  });
  seedAll();

  // Create default users
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)').run('admin', 'admin@app.com', hash, 'المدير', 'admin');
  const studentHash = bcrypt.hashSync('student123', 10);
  db.prepare('INSERT INTO users (username, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)').run('student', 'student@app.com', studentHash, 'طالب', 'student');
  db.prepare('INSERT INTO user_gamification (user_id) VALUES (?)').run(1);
  db.prepare('INSERT INTO user_gamification (user_id) VALUES (?)').run(2);

  console.log('✅ Database seeded with 74 البيروني words');
}

export default { getDb, initializeDatabase };
