export function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’'`]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const ARTICLES = new Set(['l', 'd', 'le', 'la', 'les', 'un', 'une', 'a', 'au', 'aux', 'et']);
function words(value) { return normalize(value).split(' ').filter(Boolean); }
function queryWords(value) {
  const all = words(value), useful = all.filter(word => !ARTICLES.has(word));
  return useful.length ? useful : all;
}
function searchKey(value) { return queryWords(value).join(''); }

function editDistanceWithin(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return Infinity;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i), beforePrevious;
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let lowest = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      lowest = Math.min(lowest, current[j]);
    }
    if (lowest > limit) return Infinity;
    beforePrevious = previous; previous = current;
  }
  return previous[b.length] <= limit ? previous[b.length] : Infinity;
}

function createQuery(value, fuzzy = false) {
  const terms = queryWords(value);
  return terms.length ? { tokens: [...new Set(terms)], key: terms.join(''), fuzzy, cache: new Map() } : null;
}

function resolveQuery(books, value, authorOnly = false) {
  const query = createQuery(value);
  // Choisir le mode sur le catalogue entier : un filtre ne doit pas réintroduire des faux positifs.
  if (!query || books.some(book => Number.isFinite(queryScore(book, query, authorOnly)))) return query;
  return createQuery(value, true);
}

function wordCost(token, word, query) {
  const key = `${token}\0${word}`;
  if (query.cache.has(key)) return query.cache.get(key);
  let cost = Infinity;
  if (token === word) cost = 0;
  else if (token.length >= 3 && word.startsWith(token)) cost = 0.2;
  else if (token.length >= 4 && word.includes(token)) cost = 0.45;
  else if (query.fuzzy && token.length >= 4 && token.length <= 48 && !/^\d+$/.test(token)) {
    const distance = editDistanceWithin(token, word, token.length >= 7 ? 2 : 1);
    if (Number.isFinite(distance)) cost = distance + 0.6;
  }
  query.cache.set(key, cost); return cost;
}

function bestWordCost(token, candidates, query) {
  let best = Infinity;
  for (const word of candidates) {
    best = Math.min(best, wordCost(token, word, query));
    if (best === 0) break;
  }
  return best;
}

function queryScore(book, query, authorOnly = false) {
  if (!query) return 0;
  const primaryKey = authorOnly ? book.authorKey : book.titleKey;
  if (primaryKey === query.key) return -4;
  // Une saisie composée peut viser un titre entier, même avec une petite faute ("l home de").
  if ((query.fuzzy || !authorOnly && query.tokens.length > 1) && query.key.length >= 5 && query.key.length <= 64 && primaryKey.length <= 64 && /^\p{L}+$/u.test(query.key)) {
    const distance = editDistanceWithin(query.key, primaryKey, query.key.length >= 9 ? 2 : 1);
    if (Number.isFinite(distance)) return -3 + distance * 0.1;
  }
  if (query.key.length >= 4 && primaryKey.includes(query.key)) return -2;
  let score = 0;
  for (const token of query.tokens) {
    const cost = authorOnly ? bestWordCost(token, book.authorWords, query) : Math.min(
      bestWordCost(token, book.titleWords, query),
      bestWordCost(token, book.authorWords, query) + 0.2,
      bestWordCost(token, book.otherWords, query) + 0.7
    );
    if (!Number.isFinite(cost)) return Infinity;
    score += cost;
  }
  return score;
}

export function parseAddedAt(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, y, m, d, h = '0', min = '0', s = '0'] = match;
  const time = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
  const date = new Date(time);
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d) && date.getUTCHours() === Number(h) && date.getUTCMinutes() === Number(min) && date.getUTCSeconds() === Number(s) ? time : null;
}

export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || field === '') quoted = !quoted;
      else field += char;
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(cell => cell !== '')) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('Le fichier CSV contient un champ mal fermé.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) throw new Error('Le catalogue est vide.');
  const headers = rows.shift();
  for (const key of ['_id', 'title', 'author_details', 'genre']) {
    if (!headers.includes(key)) throw new Error('Le format du catalogue est incorrect.');
  }
  return rows.map(cells => Object.fromEntries(headers.map((key, index) => [key, cells[index] ?? ''])));
}

export const FAMILIES = [
  ['romans', 'Romans & nouvelles'],
  ['polars', 'Polars & thrillers'],
  ['imaginaire', 'Fantasy & imaginaire'],
  ['bd', 'BD & mangas'],
  ['albums', 'Albums & contes'],
  ['documentaires', 'Documentaires & récits'],
  ['poesie', 'Poésie & théâtre'],
  ['autres', 'Autres genres'],
];

export function familiesFor(category) {
  const text = normalize(category);
  const families = [];
  if (/roman|nouvelle|saga|conte|fable/.test(text)) families.push('romans');
  if (/polic|polar|thriller|roman noir|suspense|enquete|espionnage/.test(text)) families.push('polars');
  if (/fantasy|fantasti|science fiction|romantasy|imaginaire|dystopi|merveilleux/.test(text)) families.push('imaginaire');
  if (/\bbd\b|bande dessinee|manga|comic|roman graphique/.test(text)) families.push('bd');
  if (/\balbums?\b|\bcontes?\b|\bfables?\b/.test(text)) families.push('albums');
  if (/document|biograph|memoire|temoignage|essai|guide|recit|encycloped|dictionnaire|histoire vraie|livre pratique|cuisine/.test(text)) families.push('documentaires');
  if (/poesie|poeme|theatre/.test(text)) families.push('poesie');
  return families.length ? families : ['autres'];
}

export const AUDIENCES = [['', 'Tous les livres'], ['adultes', 'Adultes'], ['ados', 'Ado'], ['jeunesse', 'Enfants']];
export const AGE_RANGES = [
  ['0-5', '0–5 ans', 0, 5],
  ['6-8', '6–8 ans', 6, 8],
  ['9-11', '9–11 ans', 9, 11],
  ['12-14', '12–14 ans', 12, 14],
  ['15-17', '15–17 ans', 15, 17],
  ['18+', '18 ans et plus', 18, Infinity],
];

export function audienceFor(category, minAge) {
  const text = normalize(category);
  if (minAge !== null && minAge >= 18) return 'adultes';
  if (/\badultes?\b/.test(text) && !/\bjeunes adultes\b/.test(text)) return 'adultes';
  if (/\bados?\b|\badolescent(?:e|es|s)?\b/.test(text)) return 'ados';
  if (minAge !== null && minAge >= 12) return 'ados';
  if (/\bjeunesse\b|\benfants?\b|\beveil\b|\btout petits?\b/.test(text) || minAge !== null && minAge < 12) return 'jeunesse';
  if (/\broman\b|\bromans\b|\bromance\b|\bromantique\b|\bromantasy\b|\bthriller\b|\bpolar\b|\bsaga\b|\bnouvelles?\b|\brecit\b|\btemoignage\b|\bbiographie\b|\bautobiographie\b|\bessai\b|\bdocumentaire\b|\bguide\b|\bpoesie\b|\btheatre\b/.test(text)) return 'adultes';
  return 'nonprecise';
}

export function ageMatches(book, range) {
  if (!range) return true;
  if (range === 'unknown') return book.minAge === null;
  const limits = AGE_RANGES.find(([value]) => value === range);
  return !!limits && book.minAge !== null && book.minAge >= limits[2] && book.minAge <= limits[3];
}

export function displayAuthor(raw) {
  const comma = raw.indexOf(',');
  return comma < 0 ? raw.trim() : `${raw.slice(comma + 1).trim()} ${raw.slice(0, comma).trim()}`.trim();
}

// Les prix principaux restent distincts de leurs variantes (lycéens, étranger, premier roman).
export const LITERARY_AWARDS = [
  ['goncourt', 'Goncourt', /^prix goncourt(?: \d{4}|$)/],
  ['goncourt-lyceens', 'Goncourt des lycéens', /^prix goncourt des lyceens\b/],
  ['goncourt-premier-roman', 'Goncourt du premier roman', /^prix goncourt du premier roman\b/],
  ['renaudot', 'Renaudot', /^prix renaudot(?: \d{4}|$)/],
  ['renaudot-lyceens', 'Renaudot des lycéens', /^prix renaudot des lyceens\b/],
  ['femina', 'Femina', /^prix femina(?: \d{4}|$)/],
  ['femina-etranger', 'Femina étranger', /^prix femina etranger\b/],
  ['femina-lyceens', 'Femina des lycéens', /^prix femina des lyceens\b/],
  ['medicis', 'Médicis', /^prix medicis(?: \d{4}|$)/],
  ['medicis-etranger', 'Médicis étranger', /^prix medicis etranger\b/],
  ['interallie', 'Interallié', /^prix interallie\b/],
  ['academie-francaise', 'Grand Prix du roman de l’Académie française', /^grand prix du roman de l academie francaise\b/],
  ['libraires', 'Prix des libraires', /^prix des libraires(?: \d{4}|$)/],
  ['livre-poche', 'Prix des lecteurs du Livre de Poche', /^(?:grand )?prix des lecteurs du livre de poche\b/],
  ['fnac', 'Prix du roman Fnac', /^prix (?:du roman )?fnac\b/],
  ['maison-presse', 'Prix Maison de la Presse', /^prix (?:maison|des maisons) de la presse\b/],
  ['livre-inter', 'Prix du Livre Inter', /^prix du livre inter(?: \d{4}|$)/],
  ['elle', 'Prix des lectrices de Elle', /^(?:grand )?prix des lectrices de elle\b/],
  ['rtl-lire', 'Prix RTL-Lire', /^(?:grand )?prix rtl lire\b/],
  ['sorcieres', 'Prix Sorcières', /^prix sorcieres\b/],
  ['incorruptibles', 'Prix des Incorruptibles', /^prix des incorruptibles\b/],
  ['pulitzer', 'Prix Pulitzer', /^prix pulitzer\b/],
];

export function awardKeys(awards) {
  return [...new Set(awards.map(award => LITERARY_AWARDS.find(([, , pattern]) => pattern.test(normalize(award)))?.[0] || 'other'))];
}

export function awardOptions(books) {
  const present = new Set(books.flatMap(book => book.awardKeys));
  return [['any', 'Tous les livres primés'], ...LITERARY_AWARDS.filter(([key]) => present.has(key)).map(([key, label]) => [key, label]), ...(present.has('other') ? [['other', 'Autres prix']] : [])];
}

export function publicationFor(row, data) {
  const entry = data?.books?.[row._id];
  if (!entry || entry.isbn !== row.isbn || entry.title !== row.title || entry.author_details !== row.author_details || !Number.isInteger(entry.year) || entry.year < 1450 || entry.year > new Date().getFullYear()) return null;
  try { if (new URL(entry.source).protocol !== 'https:') return null; } catch { return null; }
  return entry;
}

export function prepareBooks(rows, publicationData = {}) {
  const ids = new Set();
  return rows.map(row => {
    if (!row._id || !row.title || ids.has(row._id)) throw new Error('Le catalogue contient un identifiant absent ou en double.');
    ids.add(row._id);
    const authors = row.author_details.split('|').map(x => x.trim()).filter(Boolean).map(displayAuthor);
    const genreParts = row.genre.split('|').map(x => x.trim()).filter(Boolean);
    const category = genreParts.shift() || 'Genre non renseigné';
    const age = genreParts.find(x => /^d[eè]s\s+\d/i.test(x)) || '';
    const ageNumber = age.match(/^d[eè]s\s+(\d+)(?:\s*[–—-]\s*\d+)?\s*ans?\b/i);
    const minAge = ageNumber ? Number(ageNumber[1]) : null;
    const themes = genreParts.filter(x => x !== age).flatMap(x => x.split('•')).map(x => x.trim()).filter(Boolean);
    const ratingNumber = Number((row.rating || '').replace(',', '.'));
    const rating = Number.isFinite(ratingNumber) && ratingNumber > 0 && ratingNumber <= 5 ? ratingNumber : null;
    const book = { id: row._id, title: row.title, authors, sortAuthor: row.author_details.split('|')[0], category, age, minAge, audience: audienceFor(category, minAge), themes, rating, series: row.series_details || '', pages: /^\d+$/.test(row.pages) && Number(row.pages) > 0 ? Number(row.pages) : null, summary: row.description || '', reviews: row.notes || '', isbn: row.isbn || '', addedAt: parseAddedAt(row.date_added), awards: (row.literary_awards || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean) };
    book.awardKeys = awardKeys(book.awards);
    const publication = publicationFor(row, publicationData);
    book.publicationYear = publication?.year ?? null;
    book.publicationSource = publication?.source || '';
    book.families = familiesFor(category);
    book.search = normalize([book.title, row.author_details, ...authors, row.genre, book.series].join(' '));
    book.titleWords = [...new Set(words(book.title))]; book.titleKey = searchKey(book.title);
    book.authorWords = [...new Set(words([row.author_details, ...authors].join(' ')))]; book.authorKey = searchKey(authors.join(' '));
    book.otherWords = [...new Set(words([row.genre, book.series, book.isbn, ...book.awards].join(' ')))];
    return book;
  });
}

export function filterBooks(books, state, selected) {
  const query = resolveQuery(books, state.q), authorQuery = resolveQuery(books, state.author, true), filtered = [];
  for (const book of books) {
    if (state.genre && !book.families.includes(state.genre) || state.audience && book.audience !== state.audience || !ageMatches(book, state.age) || state.rating && (book.rating === null || book.rating < Number(state.rating)) || state.reviews && !book.reviews || state.selection && !selected.has(book.id)) continue;
    if (state.award && (state.award === 'any' ? !book.awards.length : !book.awardKeys.includes(state.award))) continue;
    if (state.year && (state.year === 'unknown' ? book.publicationYear !== null : book.publicationYear !== Number(state.year))) continue;
    if (!Number.isFinite(queryScore(book, authorQuery, true))) continue;
    const score = queryScore(book, query);
    if (Number.isFinite(score)) filtered.push({ book, score });
  }
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  filtered.sort((left, right) => {
    const a = left.book, b = right.book;
    if (state.sort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1) || collator.compare(a.title, b.title);
    if (state.sort === 'author') return collator.compare(a.sortAuthor || '', b.sortAuthor || '') || collator.compare(a.title, b.title);
    if (state.sort !== 'title') {
      if (query && left.score !== right.score) return left.score - right.score;
      const dateDifference = (b.addedAt ?? -Infinity) - (a.addedAt ?? -Infinity);
      if (dateDifference && Number.isFinite(dateDifference)) return dateDifference;
      if (a.addedAt === null && b.addedAt !== null) return 1;
      if (b.addedAt === null && a.addedAt !== null) return -1;
    }
    return collator.compare(a.title, b.title) || collator.compare(a.id, b.id);
  });
  return filtered.map(entry => entry.book);
}

export function searchCatalogue(books, state, selected, { relaxFilters = false } = {}) {
  const found = filterBooks(books, state, selected);
  if (!relaxFilters || state.selection || searchKey(state.q).length < 4 || ![state.author, state.genre, state.audience, state.age, state.rating, state.reviews].some(Boolean)) return { books: found, state, broadened: false };
  const widerState = { ...state, author: '', genre: '', audience: '', age: '', rating: '', award: '', year: '', reviews: false };
  const widerBooks = filterBooks(books, widerState, selected), key = searchKey(state.q);
  const exactTitleIsHidden = widerBooks.some(book => book.titleKey === key) && !found.some(book => book.titleKey === key);
  return widerBooks.length && (!found.length || exactTitleIsHidden) ? { books: widerBooks, state: widerState, broadened: true } : { books: found, state, broadened: false };
}
