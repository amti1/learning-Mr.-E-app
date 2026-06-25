import { renderMasteryStars } from './progressBar.js';

export function renderWordCard(word, options = {}) {
  const { showMastery = false, compact = false, mastery = 0 } = options;
  const synonyms = word.synonyms || [];
  const antonyms = word.antonyms || [];
  const tags = word.tags || [];

  if (compact) {
    return `
      <div class="word-card-compact card-glass" data-word-id="${word.id}">
        <div class="word-card-word">${word.word}</div>
        <div class="word-card-meaning">${word.meaning || ''}</div>
        ${showMastery ? `<div class="word-card-mastery">${renderMasteryStars(mastery)}</div>` : ''}
      </div>
    `;
  }

  return `
    <div class="word-card card-glass" data-word-id="${word.id}">
      <div class="word-card-header">
        <span class="word-card-word">${word.word}</span>
        ${word.root ? `<span class="word-card-root badge">${word.root}</span>` : ''}
        ${showMastery ? renderMasteryStars(mastery) : ''}
      </div>
      <div class="word-card-meaning">${word.meaning || ''}</div>
      ${synonyms.length ? `<div class="word-card-row"><span class="word-card-label">Synonyms:</span> ${synonyms.join('، ')}</div>` : ''}
      ${antonyms.length ? `<div class="word-card-row"><span class="word-card-label">Antonyms:</span> ${antonyms.join('، ')}</div>` : ''}
      ${word.plural ? `<div class="word-card-row"><span class="word-card-label">Plural:</span> ${word.plural}</div>` : ''}
      ${word.example_sentence ? `<div class="word-card-example">"${word.example_sentence}"</div>` : ''}
      ${tags.length ? `<div class="word-card-tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
      <div class="word-card-meta">
        ${'●'.repeat(word.difficulty || 3)}${'○'.repeat(5 - (word.difficulty || 3))}
      </div>
    </div>
  `;
}

export default { renderWordCard };
