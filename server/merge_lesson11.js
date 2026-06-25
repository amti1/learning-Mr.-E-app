import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(DB_PATH);

const lessonData = {
  "الدرس": "غربة وحنين",
  "إجمالي_عدد_الكلمات": 59,
  "المفردات": [
    {"الكلمة": "اختلاف"}, {"الكلمة": "النهار"}, {"الكلمة": "الليل"}, {"الكلمة": "الصبا"}, {"الكلمة": "أنسى"}, {"الكلمة": "سنة"}, {"الكلمة": "ملاوة"}, {"الكلمة": "تصورات"}, {"الكلمة": "صفا"}, {"الكلمة": "صُورت"}, {"الكلمة": "مس"}, {"الكلمة": "عصفت"}, {"الكلمة": "الصبا"}, {"الكلمة": "اللعوب"},
    {"الكلمة": "لذة"}, {"الكلمة": "خُلس"}, {"الكلمة": "سلا"}, {"الكلمة": "هل سلا"}, {"الكلمة": "أسا"}, {"الكلمة": "جُرْح"}, {"الكلمة": "المُؤسي"}, {"الكلمة": "اذكرا"},
    {"الكلمة": "كلما"}, {"الكلمة": "رق"}, {"الكلمة": "العهد"}, {"الكلمة": "تقسى"}, {"الكلمة": "مستطار"}, {"الكلمة": "البواخر"}, {"الكلمة": "رنت"}, {"الكلمة": "عوت"}, {"الكلمة": "جَرْس"}, {"الكلمة": "راهب"}, {"الكلمة": "فطن"}, {"الكلمة": "ثرن"}, {"الكلمة": "شاعهن"}, {"الكلمة": "نقس"},
    {"الكلمة": "اليم"}, {"الكلمة": "مولع"}, {"الكلمة": "منع"}, {"الكلمة": "حبس"}, {"الكلمة": "حرام"}, {"الكلمة": "بلابل"}, {"الكلمة": "الدوح"}, {"الكلمة": "حلال"}, {"الكلمة": "الطير"}, {"الكلمة": "جنس"}, {"الكلمة": "دار"}, {"الكلمة": "أحق"}, {"الكلمة": "الأهل"}, {"الكلمة": "خبيث"}, {"الكلمة": "المذاهب"}, {"الكلمة": "رجس"}, {"الكلمة": "نَفَس"}, {"الكلمة": "مرجل"}, {"الكلمة": "شراع"}, {"الكلمة": "الفنار"}, {"الكلمة": "أرسى"}, {"الكلمة": "الثغر"}, {"الكلمة": "يد"}
  ]
};

function getOrCreateUnit() {
  const existingUnit = db.prepare('SELECT id FROM units LIMIT 1').get();
  if (existingUnit) return existingUnit.id;
  
  const existingCat = db.prepare('SELECT id FROM categories LIMIT 1').get();
  let catId = existingCat ? existingCat.id : db.prepare("INSERT INTO categories (name, name_ar) VALUES ('General', 'عام')").run().lastInsertRowid;
  
  return db.prepare("INSERT INTO units (category_id, name, name_ar) VALUES (?, 'Default Unit', 'الوحدة الافتراضية')").run(catId).lastInsertRowid;
}

const insertLessonStmt = db.prepare('INSERT INTO lessons (unit_id, name, name_ar, description) VALUES (?, ?, ?, ?)');
const updateWordStmt = db.prepare('UPDATE words SET meaning = COALESCE(?, meaning), intended_meaning = COALESCE(?, intended_meaning), linguistic_notes = COALESCE(?, linguistic_notes), singular = COALESCE(?, singular) WHERE id = ?');
const insertWordStmt = db.prepare('INSERT INTO words (lesson_id, word, meaning, intended_meaning, linguistic_notes, singular, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?)');

const insertAntonymStmt = db.prepare('INSERT INTO word_antonyms (word_id, antonym) VALUES (?, ?)');
const insertPluralStmt = db.prepare('INSERT INTO word_plurals (word_id, plural_form, plural_type) VALUES (?, ?, ?)');

db.transaction(() => {
  const unitId = getOrCreateUnit();

  const lessonTitle = lessonData["الدرس"];
  
  let lessonId;
  const existingLesson = db.prepare('SELECT id FROM lessons WHERE name = ?').get(lessonTitle);
  
  if (existingLesson) {
    lessonId = existingLesson.id;
    console.log(`Lesson "${lessonTitle}" already exists with ID ${lessonId}. Proceeding to add/update words safely...`);
  } else {
    const lessonResult = insertLessonStmt.run(unitId, lessonTitle, lessonTitle, '');
    lessonId = lessonResult.lastInsertRowid;
    console.log(`Created lesson "${lessonTitle}" with ID ${lessonId}.`);
  }

  for (const item of lessonData["المفردات"]) {
    // Only pass values if they are explicitly present in the JSON, otherwise null
    let meaning = item["المعنى"] !== undefined ? (item["المعنى"] === '-' ? '' : item["المعنى"].trim()) : null;
    let intended = (item["المراد المخصص"] !== undefined || item["المراد"] !== undefined) ? 
        ((item["المراد المخصص"] || item["المراد"] || "") === '-' ? '' : (item["المراد المخصص"] || item["المراد"] || "").trim()) : null;
    let notes = item["ملاحظات"] !== undefined ? item["ملاحظات"].trim() : null;
    let singular = item["المفرد"] !== undefined ? (item["المفرد"] === '-' ? '' : item["المفرد"].trim()) : null;
    
    const existingWord = db.prepare('SELECT id FROM words WHERE lesson_id = ? AND word = ?').get(lessonId, item["الكلمة"]);
    
    let wordId;
    if (existingWord) {
      wordId = existingWord.id;
      // Only update fields that were provided (nulls will be coalesced to existing values in SQL)
      updateWordStmt.run(meaning, intended, notes, singular, wordId);
      
      // We only delete and re-insert antonyms/plurals if they were provided in this JSON
      if (item["المضاد"] !== undefined) {
         db.prepare('DELETE FROM word_antonyms WHERE word_id = ?').run(wordId);
         const splitItems = (str) => { if(!str || str === '-') return []; return str.split(/[-،,]/).map(s => s.trim()).filter(s => s && s !== '-'); };
         let antonyms = splitItems(item["المضاد"]);
         for (const ant of antonyms) { insertAntonymStmt.run(wordId, ant); }
      }
      
      if (item["الجمع"] !== undefined) {
         db.prepare('DELETE FROM word_plurals WHERE word_id = ?').run(wordId);
         const splitItems = (str) => { if(!str || str === '-') return []; return str.split(/[-،,]/).map(s => s.trim()).filter(s => s && s !== '-'); };
         let plurals = splitItems(item["الجمع"]);
         for (const pl of plurals) { insertPluralStmt.run(wordId, pl, 'Standard'); }
      }
      
    } else {
      // It's a new word. Insert with whatever fields are provided (null becomes '')
      const wordResult = insertWordStmt.run(lessonId, item["الكلمة"], meaning || '', intended || '', notes || '', singular || '', 3);
      wordId = wordResult.lastInsertRowid;
      
      const splitItems = (str) => { if(!str || str === '-') return []; return str.split(/[-،,]/).map(s => s.trim()).filter(s => s && s !== '-'); };
      
      if (item["المضاد"] !== undefined) {
          let antonyms = splitItems(item["المضاد"]);
          for (const ant of antonyms) { insertAntonymStmt.run(wordId, ant); }
      }
      if (item["الجمع"] !== undefined) {
          let plurals = splitItems(item["الجمع"]);
          for (const pl of plurals) { insertPluralStmt.run(wordId, pl, 'Standard'); }
      }
    }
  }
})();

console.log(`Successfully merged new words for lesson ${lessonData["الدرس"]}!`);
