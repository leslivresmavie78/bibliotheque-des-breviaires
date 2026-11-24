import { parseCSV, prepareBooks, normalize, filterBooks, searchCatalogue, FAMILIES, AUDIENCES, AGE_RANGES } from './catalogue-core.js?v=7';
import { activeCriteria, withoutCriterion } from './ui-core.js?v=1';

const $ = id => document.getElementById(id);
const PAGE_SIZE = 24;
const STORAGE_KEY = 'breviaires-selection-v1';
const numberFormat = new Intl.NumberFormat('fr-FR');
const ratingFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const defaults = () => ({ q: '', author: '', genre: '', audience: '', age: '', rating: '', reviews: false, selection: false, sort: 'recent' });
let state = defaults(), browseState = null, books = [], byId = new Map(), filtered = [], page = 1, ready = false;
let selected = new Set(), debounce, toastTimer, activeBook = null, loading = false, restoreFocus = null, searchNotice = '';

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function icon(type) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('fill', 'none');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', type === 'bookmark' ? 'M6 4h12v17l-6-4-6 4V4Z' : 'M4 4h16v12H9l-5 4V4Z');
  path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.6'); path.setAttribute('stroke-linejoin', 'round');
  svg.append(path); return svg;
}

function notify(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3400);
}

function readSelection() {
  try {
    const values = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(values)) return new Set(values.filter(x => typeof x === 'string'));
  } catch { /* Une sélection reste utilisable si le stockage du navigateur est indisponible. */ }
  return new Set();
}
selected = readSelection();

function writeSelection() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected])); }
  catch { notify('Votre sélection est gardée pour cette visite. Copiez votre liste pour la conserver.'); }
}

function stateFromURL() {
  const params = new URLSearchParams(location.search);
  const next = defaults();
  for (const key of ['q', 'author']) next[key] = (params.get(key) || '').slice(0, 250);
  if (FAMILIES.some(([value]) => value === params.get('genre'))) next.genre = params.get('genre');
  if (AUDIENCES.some(([value]) => value === params.get('public'))) next.audience = params.get('public') || '';
  if (params.get('genre') === 'jeunesse' && !next.audience) next.audience = 'jeunesse';
  if (params.get('age') === 'unknown' || AGE_RANGES.some(([value]) => value === params.get('age'))) next.age = params.get('age');
  if (['4', '4.5'].includes(params.get('rating'))) next.rating = params.get('rating');
  if (['recent', 'title', 'author', 'rating'].includes(params.get('sort'))) next.sort = params.get('sort');
  next.reviews = params.get('reviews') === '1'; next.selection = params.get('selection') === '1';
  return next;
}

function syncURL() {
  const url = new URL(location.href); url.search = '';
  for (const key of ['q', 'author', 'genre', 'rating']) if (state[key]) url.searchParams.set(key, state[key]);
  if (state.audience) url.searchParams.set('public', state.audience);
  if (state.age) url.searchParams.set('age', state.age);
  if (state.reviews) url.searchParams.set('reviews', '1');
  if (state.selection) url.searchParams.set('selection', '1');
  if (state.sort !== 'recent') url.searchParams.set('sort', state.sort);
  history.replaceState(null, '', url);
}

function syncControls() {
  $('search').value = state.q; $('author').value = state.author; $('genre').value = state.genre;
  $('rating').value = state.rating; $('with-reviews').checked = state.reviews; $('sort').value = state.sort;
  $('age').value = state.age;
}

function updateSelectionCounter() {
  const count = [...selected].filter(id => byId.has(id)).length;
  $('selection-count').textContent = numberFormat.format(count);
  $('selection-nav').setAttribute('aria-label', `Ma liste, ${count} livre${count > 1 ? 's' : ''}`);
  $('selection-label').textContent = 'Ma liste';
  $('selection-count').hidden = false;
  return count;
}

function ratingElement(book, detail = false) {
  if (book.rating === null) return element('span', 'no-rating', 'Pas encore de note');
  const el = element('span', 'rating-value');
  el.setAttribute('aria-label', `Note du catalogue : ${ratingFormat.format(book.rating)} sur 5`);
  const star = element('span', 'rating-star', '★'); star.setAttribute('aria-hidden', 'true');
  el.append(star, document.createTextNode(`${ratingFormat.format(book.rating)} / 5`));
  if (detail) el.title = 'Note renseignée dans le catalogue de la bibliothèque';
  return el;
}

function bookmarkButton(book) {
  const button = element('button', 'bookmark-button'); button.type = 'button';
  const isSelected = selected.has(book.id);
  button.setAttribute('aria-pressed', String(isSelected));
  button.setAttribute('aria-label', `${isSelected ? 'Retirer de' : 'Ajouter à'} ma liste : ${book.title}`);
  button.title = isSelected ? 'Retirer de ma liste' : 'Ajouter à ma liste';
  button.append(icon('bookmark'), element('span', '', isSelected ? 'Retirer de ma liste' : 'Ajouter à ma liste'));
  button.addEventListener('click', event => { event.stopPropagation(); toggleSelection(book.id); });
  return button;
}

function toneFor(book) {
  return ['bd', 'polars', 'imaginaire', 'albums', 'documentaires', 'poesie'].find(x => book.families.includes(x)) || 'romans';
}

function awardBadge() {
  const badge = element('p', 'award-badge');
  const trophy = element('span', '', '🏆'); trophy.setAttribute('aria-hidden', 'true');
  badge.append(trophy, document.createTextNode('Prix littéraire'));
  return badge;
}

function makeCard(book) {
  const article = element('article', 'book-card'); article.dataset.tone = toneFor(book); article.dataset.bookId = book.id;
  article.append(element('p', 'book-category', book.category));
  if (book.awards.length) article.append(awardBadge());
  const heading = element('h3');
  heading.textContent = book.title;
  article.append(heading, element('p', 'book-author', book.authors.join(' · ')));
  article.append(element('p', `book-preview${book.summary ? '' : ' missing'}`, book.summary ? book.summary.replace(/\s+/g, ' ') : 'Résumé à venir dans le catalogue.'));
  const themes = element('div', 'book-themes');
  if (book.age) themes.append(element('span', 'theme-tag age-tag', book.age));
  else if (book.audience === 'jeunesse' || book.audience === 'ados') themes.append(element('span', 'theme-tag age-tag age-unknown', 'Âge non précisé'));
  article.append(themes);
  const meta = element('div', 'card-meta'); meta.append(ratingElement(book)); article.append(meta);
  const bottom = element('div', 'card-bottom');
  const open = element('button', 'primary-button card-open', 'Voir le livre'); open.type = 'button';
  open.setAttribute('aria-label', `Voir le livre : ${book.title}`);
  open.addEventListener('click', event => { event.stopPropagation(); openBook(book.id); });
  bottom.append(open, bookmarkButton(book)); article.append(bottom);
  article.addEventListener('click', event => { if (!event.target.closest('button, a, input')) openBook(book.id); });
  return article;
}

function renderChips() {
  const focusedAudience = document.activeElement?.closest('.audience-button')?.dataset.audience;
  const publicFragment = document.createDocumentFragment();
  for (const [value, label] of AUDIENCES) {
    const button = element('button', `audience-button${state.audience === value ? ' active' : ''}`, label); button.type = 'button';
    button.setAttribute('aria-pressed', String(state.audience === value)); button.dataset.audience = value;
    button.addEventListener('click', () => { clearTimeout(debounce); state = { ...defaults(), q: state.q, audience: value, selection: state.selection }; searchNotice = ''; page = 1; syncControls(); render(); });
    publicFragment.append(button);
  }
  $('audience-buttons').replaceChildren(publicFragment);
  if (focusedAudience !== undefined) [...$('audience-buttons').children].find(button => button.dataset.audience === focusedAudience)?.focus({ preventScroll: true });
}

function renderActiveCriteria() {
  const criteria = activeCriteria(state);
  $('active-criteria').hidden = !criteria.length;
  const fragment = document.createDocumentFragment();
  for (const { key, label } of criteria) {
    const button = element('button', 'criterion'); button.type = 'button';
    button.dataset.criterion = key;
    button.setAttribute('aria-label', `Retirer le critère : ${label}`);
    const mark = element('span', 'remove-mark', '×'); mark.setAttribute('aria-hidden', 'true');
    button.append(element('span', '', label), mark);
    button.addEventListener('click', () => {
      clearTimeout(debounce); state = withoutCriterion(state, key); searchNotice = ''; page = 1;
      syncControls(); render();
      ($('criteria-list').querySelector('button') || $('search')).focus({ preventScroll: true });
    });
    fragment.append(button);
  }
  $('criteria-list').replaceChildren(fragment);
}

function render(resultBooks) {
  if (!ready) return;
  const count = updateSelectionCounter();
  const filterCount = [state.author, state.genre, state.audience, state.age, state.rating, state.reviews].filter(Boolean).length;
  const extraCount = [state.author, state.genre, state.age, state.rating, state.reviews, state.sort !== (state.selection ? 'title' : 'recent')].filter(Boolean).length;
  $('active-filter-count').textContent = extraCount ? `(${extraCount})` : '';
  $('reset-filters').hidden = !(state.q || filterCount || state.sort !== (state.selection ? 'title' : 'recent'));
  syncNavigation();
  document.body.classList.toggle('personal-list', state.selection);
  $('page-title').textContent = state.selection ? 'Ma liste' : 'Trouver un livre';
  $('catalogue-stamp').hidden = state.selection;
  $('audience-bar').hidden = state.selection;
  $('filter-toolbar').hidden = state.selection;
  $('filter-fields').hidden = state.selection;
  $('selection-actions').hidden = !count;
  $('catalogue-search').hidden = state.selection && !count;
  $('search-label').textContent = state.selection ? 'Rechercher dans ma liste' : 'Rechercher un titre, un auteur ou un thème';
  $('search').placeholder = state.selection ? 'Un titre ou un auteur de ma liste…' : 'Titre, auteur ou thème…';
  $('selection-tools').hidden = !state.selection; $('copy-selection').disabled = !count; $('print-selection').disabled = !count;
  $('results-heading').textContent = state.selection ? 'Vos livres' : state.q.trim() ? 'Résultats de recherche' : state.audience === 'jeunesse' ? 'Les livres pour enfants' : state.audience === 'ados' ? 'Les livres pour ado' : state.audience === 'adultes' ? 'Les livres pour adultes' : state.sort === 'recent' ? 'Dernières arrivées' : 'Tous les livres';
  $('sort-recent').textContent = state.q.trim() ? 'Les plus proches' : 'Dernières arrivées';
  $('search-notice').hidden = !searchNotice; $('search-notice').textContent = searchNotice;
  $('age-help').hidden = !state.age || state.age === 'unknown';
  if (state.age && state.age !== 'unknown') {
    const ageLabel = AGE_RANGES.find(([value]) => value === state.age)?.[1];
    $('age-help').textContent = `Âge minimum indiqué : ${ageLabel}. Les fiches sans âge précis ne sont pas incluses.`;
  }
  filtered = resultBooks || filterBooks(books, state, selected);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); page = Math.min(Math.max(page, 1), pages);
  $('results-count').textContent = `${numberFormat.format(filtered.length)} livre${filtered.length > 1 ? 's' : ''}${state.selection ? ' dans ma liste' : ''}`;
  const fragment = document.createDocumentFragment();
  for (const book of filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)) fragment.append(makeCard(book));
  $('book-grid').replaceChildren(fragment); $('book-grid').setAttribute('aria-busy', 'false');
  $('empty-state').hidden = filtered.length !== 0;
  const selectionEmpty = state.selection && !count;
  $('empty-title').textContent = selectionEmpty ? 'Votre liste est vide' : 'Aucun livre pour cette recherche';
  $('empty-description').textContent = selectionEmpty ? 'Dans le catalogue, choisissez « Ajouter à ma liste » sur les livres qui vous intéressent.' : 'Essayez avec moins de mots ou choisissez « Effacer les critères ».';
  $('empty-reset').textContent = selectionEmpty ? 'Choisir des livres' : state.selection ? 'Revoir toute ma liste' : 'Revoir tout le catalogue';
  $('pagination').hidden = pages <= 1;
  $('page-count').textContent = `Page ${page} sur ${numberFormat.format(pages)}`;
  $('previous-page').disabled = page <= 1; $('next-page').disabled = page >= pages;
  renderChips(); renderActiveCriteria(); syncURL();
}

function syncNavigation() {
  const visible = !$('catalogue-view').hidden;
  for (const [id, active] of [['catalogue-nav', visible && !state.selection], ['selection-nav', visible && state.selection]]) {
    $(id).classList.toggle('active', active); $(id).setAttribute('aria-pressed', String(active));
  }
}

function toggleSelection(id) {
  const focusedButton = document.activeElement?.closest('.bookmark-button');
  const wasSelected = selected.has(id);
  if (wasSelected) selected.delete(id); else selected.add(id);
  writeSelection(); render();
  if (activeBook) updateDetailSelection();
  else if (focusedButton) {
    const replacement = [...document.querySelectorAll('.book-card')].find(card => card.dataset.bookId === id)?.querySelector('.bookmark-button');
    (replacement || $('selection-nav')).focus({ preventScroll: true });
  }
  notify(wasSelected ? 'Livre retiré de votre liste.' : 'Livre ajouté à votre liste.');
}

function updateDetailSelection() {
  const button = $('detail-selection');
  if (!button || !activeBook) return;
  const saved = selected.has(activeBook.id); button.setAttribute('aria-pressed', String(saved));
  button.replaceChildren(icon('bookmark'), document.createTextNode(saved ? 'Retirer de ma liste' : 'Ajouter à ma liste'));
}

function addTextSection(target, heading, value, missing, review = false) {
  const section = element('section', 'detail-section'); section.append(element('h3', '', heading));
  if (!value) section.append(element('p', 'missing', missing));
  else for (const paragraph of value.split(/\n\s*\n/).filter(x => x.trim())) section.append(element('p', review ? 'review-paragraph' : '', paragraph.trim()));
  target.append(section);
}

function openBook(id) {
  const book = byId.get(id); if (!book) return;
  restoreFocus = document.activeElement; activeBook = book;
  const header = element('div', 'detail-header');
  header.append(element('p', 'detail-category', [book.category, book.age].filter(Boolean).join(' · ')));
  if (!book.age && (book.audience === 'jeunesse' || book.audience === 'ados')) header.append(element('p', 'detail-age-note', 'Âge conseillé non renseigné dans le catalogue.'));
  const title = element('h2', '', book.title); title.id = 'detail-title'; header.append(title, element('p', 'detail-authors', book.authors.join(' · ')));
  if (book.awards.length) header.append(awardBadge());
  const meta = element('div', 'detail-meta'); meta.append(ratingElement(book, true));
  if (book.rating) meta.append(element('span', '', 'Note du catalogue'));
  header.append(meta);
  const body = element('div', 'detail-body');
  const actions = element('div', 'detail-actions');
  const save = element('button', 'primary-button'); save.type = 'button'; save.id = 'detail-selection';
  save.addEventListener('click', () => toggleSelection(book.id));
  const share = element('button', 'secondary-button', 'Copier le lien du livre'); share.type = 'button';
  share.addEventListener('click', () => copyText(bookURL(book), 'Lien du livre copié.'));
  actions.append(save, share); body.append(actions);
  if (book.series && !/^french\s+[ée]dition$/i.test(book.series.trim())) body.append(element('p', 'detail-series', `Série : ${book.series.replace(/\s*\(?french\s+[ée]dition\)?\s*/ig, ' ').trim()}`));
  if (book.themes.length) {
    const themes = element('div', 'book-themes');
    for (const theme of book.themes) themes.append(element('span', 'theme-tag', theme));
    body.append(themes);
  }
  if (book.awards.length) {
    const section = element('section', 'detail-section award-section'); section.append(element('h3', '', 'Prix littéraires'));
    const list = element('ul', 'award-list');
    for (const award of book.awards) list.append(element('li', '', award));
    section.append(list); body.append(section);
  }
  addTextSection(body, 'Le résumé', book.summary, 'Le résumé de ce livre n’est pas encore renseigné.');
  addTextSection(body, 'Les avis', book.reviews, 'Aucun avis renseigné pour le moment.', true);
  body.append(element('p', 'detail-source', 'Résumé, note et avis repris du catalogue de la Bibliothèque des Bréviaires. Pour connaître la disponibilité du livre, renseignez-vous à la bibliothèque.'));
  $('detail-content').replaceChildren(header, body); updateDetailSelection();
  const url = new URL(location.href); url.hash = `livre=${encodeURIComponent(id)}`; history.replaceState(null, '', url);
  document.body.classList.add('dialog-open');
  if (!$('book-dialog').open) $('book-dialog').showModal();
  $('book-dialog').scrollTop = 0; $('close-dialog').focus({ preventScroll: true });
}

function bookURL(book) {
  const url = new URL(location.href); url.search = ''; url.hash = `livre=${encodeURIComponent(book.id)}`; return url.href;
}

function finishClose() {
  document.body.classList.remove('dialog-open'); activeBook = null;
  if (location.hash.startsWith('#livre=')) { const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url); }
  const nextFocus = restoreFocus?.isConnected && restoreFocus.getClientRects().length ? restoreFocus : $('catalogue-view').hidden ? $('publications-title') : $('search');
  if (!document.querySelector('dialog[open]')) nextFocus?.focus({ preventScroll: true });
}

async function copyText(text, message) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard');
    await navigator.clipboard.writeText(text); notify(message);
  } catch {
    const field = element('textarea'); field.value = text; field.setAttribute('aria-label', 'Texte à copier');
    field.style.cssText = 'position:fixed;left:10px;top:10px;width:1px;height:1px;opacity:0';
    const host = $('book-dialog').open ? $('book-dialog') : document.body; host.append(field); field.focus(); field.select();
    const copied = document.execCommand('copy'); field.remove();
    if (copied) notify(message);
    else {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob);
      const link = element('a'); link.href = url; link.download = 'ma-selection-breviaires.txt'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Le texte a été téléchargé pour que vous puissiez le conserver.');
    }
  }
}

function selectedBooks() { return filterBooks(books, { ...defaults(), selection: true, sort: 'title' }, selected); }

function resetCatalogue() {
  clearTimeout(debounce); state = defaults(); browseState = null; searchNotice = ''; page = 1; syncControls(); render();
}

function setMode(selection) {
  clearTimeout(debounce);
  if (selection === state.selection) { if (selection && !selected.size) return; }
  searchNotice = '';
  if (selection && !state.selection) { browseState = { ...state }; state = { ...defaults(), selection: true, sort: 'title' }; }
  else if (!selection && state.selection) { state = browseState ? { ...browseState } : defaults(); browseState = null; }
  else if (!selection) { resetCatalogue(); return; }
  page = 1; syncControls(); render();
}

function refreshFromInputs(expand = false) {
  clearTimeout(debounce);
  if (expand !== true || state.q !== $('search').value) searchNotice = '';
  state.q = $('search').value; state.author = $('author').value; state.genre = $('genre').value;
  state.rating = $('rating').value; state.reviews = $('with-reviews').checked; state.sort = $('sort').value;
  state.age = $('age').value;
  if (!ready) return;
  const result = searchCatalogue(books, state, selected, { relaxFilters: expand === true });
  if (result.broadened) { state = result.state; syncControls(); searchNotice = 'Recherche élargie à tous les livres pour retrouver votre titre.'; }
  page = 1; render(result.books);
}

async function loadCatalogue() {
  if (loading) return; loading = true; ready = false;
  $('load-error').hidden = true; $('book-grid').setAttribute('aria-busy', 'true'); $('results-count').textContent = 'Le catalogue se prépare…';
  try {
    const response = await fetch(new URL('./catalogue.csv', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Catalogue : ${response.status}`);
    books = prepareBooks(parseCSV(await response.text())); byId = new Map(books.map(book => [book.id, book]));
    selected = new Set([...selected].filter(id => byId.has(id)));
    const authors = [...new Set(books.flatMap(book => book.authors))].sort(new Intl.Collator('fr', { sensitivity: 'base' }).compare);
    const authorOptions = document.createDocumentFragment(); for (const author of authors) { const option = element('option'); option.value = author; authorOptions.append(option); }
    $('authors').replaceChildren(authorOptions);
    const genreOptions = document.createDocumentFragment(); const all = element('option', '', 'Tous les genres'); all.value = ''; genreOptions.append(all);
    for (const [value, label] of FAMILIES) { const option = element('option', '', label); option.value = value; genreOptions.append(option); }
    $('genre').replaceChildren(genreOptions); $('total-books').textContent = numberFormat.format(books.length);
    const ageOptions = document.createDocumentFragment(); const anyAge = element('option', '', 'Tous les âges'); anyAge.value = ''; ageOptions.append(anyAge);
    for (const [value, label] of [...AGE_RANGES, ['unknown', 'Âge non renseigné']]) { const option = element('option', '', label); option.value = value; ageOptions.append(option); }
    $('age').replaceChildren(ageOptions);
    state = stateFromURL(); syncControls(); ready = true; render();
    if (location.hash.startsWith('#livre=')) { const id = decodeURIComponent(location.hash.slice(7)); if (byId.has(id)) openBook(id); else notify('Ce livre ne figure plus dans le catalogue.'); }
    fetch(new URL('./catalogue-meta.json', import.meta.url), { cache: 'no-cache' }).then(response => response.ok ? response.json() : null).then(metadata => {
      if (metadata?.imported_on && /^\d{4}-\d{2}-\d{2}$/.test(metadata.imported_on)) {
        const [year, month, day] = metadata.imported_on.split('-'); $('catalogue-date').textContent = `Catalogue mis en ligne le ${day}-${month}-${year}.`;
      }
    }).catch(() => {});
  } catch (error) {
    console.error(error); $('book-grid').replaceChildren(); $('book-grid').setAttribute('aria-busy', 'false');
    $('load-error').hidden = false; $('empty-state').hidden = true; $('pagination').hidden = true;
    $('results-count').textContent = 'Catalogue momentanément indisponible';
  } finally { loading = false; }
}

$('search-form').addEventListener('submit', event => { event.preventDefault(); refreshFromInputs(true); });
for (const id of ['search', 'author']) $(id).addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => refreshFromInputs(id === 'search'), 220); });
for (const id of ['genre', 'age', 'rating', 'with-reviews', 'sort']) $(id).addEventListener('change', refreshFromInputs);
$('reset-filters').addEventListener('click', () => { const selection = state.selection; state = { ...defaults(), selection, sort: selection ? 'title' : 'recent' }; searchNotice = ''; page = 1; syncControls(); render(); });
$('empty-reset').addEventListener('click', () => {
  if (state.selection && updateSelectionCounter()) {
    state = { ...defaults(), selection: true, sort: 'title' }; searchNotice = ''; page = 1; syncControls(); render();
  } else resetCatalogue();
});
$('catalogue-nav').addEventListener('click', () => {
  const fromPublications = $('catalogue-view').hidden;
  document.dispatchEvent(new Event('show-catalogue'));
  if (fromPublications && !state.selection) render(); else setMode(false);
});
$('selection-nav').addEventListener('click', () => {
  document.dispatchEvent(new Event('show-catalogue')); setMode(true);
});
document.addEventListener('catalogue-view-change', syncNavigation);
$('toggle-filters').addEventListener('click', () => { const open = $('search-form').classList.toggle('filters-open'); $('toggle-filters').setAttribute('aria-expanded', String(open)); });
for (const [id, delta] of [['previous-page', -1], ['next-page', 1]]) $(id).addEventListener('click', () => { page += delta; render(); $('results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); $('results').focus({ preventScroll: true }); });
$('close-dialog').addEventListener('click', () => $('book-dialog').close());
$('book-dialog').addEventListener('close', finishClose);
$('book-dialog').addEventListener('click', event => { if (event.target === $('book-dialog')) { const r = $('book-dialog').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('book-dialog').close(); } });
$('copy-selection').addEventListener('click', () => { const list = selectedBooks(); copyText(`Ma liste · Bibliothèque des Bréviaires\n\n${list.map(book => `• ${book.title} — ${book.authors.join(', ')}`).join('\n')}\n\nCette liste ne réserve pas les livres.`, 'Votre liste a été copiée.'); });
$('print-selection').addEventListener('click', () => {
  const title = element('h1', '', 'Ma liste de livres');
  const list = element('ol'); for (const book of selectedBooks()) { const li = element('li', '', book.title); li.append(element('span', '', book.authors.join(' · '))); list.append(li); }
  $('print-content').replaceChildren(title, element('p', '', 'Bibliothèque des Bréviaires · ASLB'), list, element('p', '', 'Présentez cette liste lors de votre visite. Elle ne constitue pas une réservation.')); window.print();
});
$('reload').addEventListener('click', loadCatalogue);
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { selected = readSelection(); render(); if (activeBook) updateDetailSelection(); } });
window.addEventListener('popstate', () => { clearTimeout(debounce); state = stateFromURL(); searchNotice = ''; page = 1; syncControls(); render(); });
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#livre=')) { const book = byId.get(decodeURIComponent(location.hash.slice(7))); if (book) openBook(book.id); } else if ($('book-dialog').open) $('book-dialog').close(); });
loadCatalogue();
