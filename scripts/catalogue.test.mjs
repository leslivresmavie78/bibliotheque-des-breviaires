import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCSV, prepareBooks, normalize, filterBooks, searchCatalogue, parseAddedAt, audienceFor, AUDIENCES } from '../dist/catalogue-core.js';

const csv = fs.readFileSync(new URL('../dist/catalogue.csv', import.meta.url), 'utf8');
const rows = parseCSV(csv);
const books = prepareBooks(rows);
const metadata = JSON.parse(fs.readFileSync(new URL('../dist/catalogue-meta.json', import.meta.url), 'utf8'));
const state = { q: '', author: '', genre: '', audience: '', age: '', rating: '', reviews: false, selection: false, sort: 'title' };

test('Le CSV gère les virgules, guillemets, CRLF et champs multilignes', () => {
  const sample = '\uFEFF_id,title,author_details,genre,description\r\n1,"Un titre, deux mots","Nom, Prénom",Roman,"Une ligne\nPuis « un avis » et ""une citation""."\r\n';
  const [row] = parseCSV(sample);
  assert.equal(row.title, 'Un titre, deux mots');
  assert.equal(row.description, 'Une ligne\nPuis « un avis » et "une citation".');
  assert.throws(() => parseCSV('_id,title,author_details,genre\n1,"pas fermé'), /mal fermé/);
});

test('Toutes les fiches importées conservent identifiant, contenu et avis', () => {
  assert.equal(books.length, metadata.count);
  assert.equal(new Set(books.map(book => book.id)).size, rows.length);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(books[i].title, rows[i].title);
    assert.equal(books[i].summary, rows[i].description);
    assert.equal(books[i].reviews, rows[i].notes);
  }
});

test('Les champs de prêt, édition et langue ne sont pas publiés', () => {
  const allowed = ['_id', 'title', 'author_details', 'isbn', 'rating', 'series_details', 'pages', 'description', 'notes', 'genre', 'date_added', 'literary_awards'];
  assert.deepEqual(Object.keys(rows[0]), allowed);
  assert.ok(!csv.includes('loaned_to'));
  assert.ok(!Object.keys(rows[0]).includes('location'));
});

test('Les prix importés restent séparés et recherchables', () => {
  const sample = { author_details: 'Exemple, Auteur', genre: 'Roman adulte', description: '', notes: '', rating: '' };
  const fixture = prepareBooks([
    { ...sample, _id: 'plusieurs-prix', title: 'Livre primé', literary_awards: 'Prix des Libraires 2002\nGrand Prix des Lectrices de Elle 2002 — policier' },
    { ...sample, _id: 'sans-prix', title: 'Livre sans prix', literary_awards: '' },
    { ...sample, _id: 'goncourt', title: 'Autre livre primé', literary_awards: 'Prix Goncourt 2020' },
  ]);
  assert.deepEqual(fixture[0].awards, ['Prix des Libraires 2002', 'Grand Prix des Lectrices de Elle 2002 — policier']);
  assert.deepEqual(fixture[1].awards, []);
  const found = filterBooks(fixture, { ...state, q: 'Goncourt' }, new Set());
  assert.deepEqual(found.map(book => book.id), ['goncourt']);
  assert.ok(books.every(book => book.awards.every(award => !award.includes('\\n') && !award.includes('🏆'))));
});

test('Zéro signifie absence de note, jamais zéro étoile', () => {
  const fixture = prepareBooks(['0', '', '5', '4.5', 'inconnue', '8'].map((rating, index) => ({ _id: String(index), title: 'Exemple', author_details: 'Nom, Prénom', genre: 'Roman', pages: '', rating })));
  assert.deepEqual(fixture.map(book => book.rating), [null, null, 5, 4.5, null, null]);
  const rated = filterBooks(books, { ...state, rating: '4' }, new Set());
  assert.ok(rated.length > 0);
  assert.ok(rated.every(book => book.rating !== null && book.rating >= 4));
});

test('La recherche tolère accents, ordre du nom et ponctuation', () => {
  assert.equal(normalize('DÉSENCHANTÉES !'), 'desenchantees');
  const found = filterBooks(books, { ...state, q: 'desenchantees vareille' }, new Set());
  assert.equal(found.length, 1);
  assert.equal(found[0].title, 'Désenchantées');
  const first = filterBooks(books, { ...state, author: 'Vareille Marie' }, new Set());
  const second = filterBooks(books, { ...state, author: 'marie vareille' }, new Set());
  assert.ok(first.length > 0); assert.deepEqual(first, second);
});

test('L’Homme-dé arrive en tête malgré une apostrophe oubliée ou une petite faute', () => {
  for (const q of ["l'homme dé", 'L’HOMME-DE', 'lhomme de', 'l home de', 'rhineart', 'rhinehatr']) {
    const found = filterBooks(books, { ...state, q, sort: 'recent' }, new Set());
    assert.equal(found[0]?.id, '948', q);
  }
  const original = rows.find(row => row._id === '948');
  assert.equal(books.find(book => book.id === '948').title, original.title);
  assert.equal(normalize('Cœur'), 'coeur');
});

test('Une recherche de titre peut sortir d’un rayon qui masquait le livre, sans élargir Ma liste', () => {
  const childState = { ...state, q: "l'homme dé", audience: 'jeunesse', sort: 'recent' };
  const strict = filterBooks(books, childState, new Set());
  assert.ok(strict.length > 0, 'Le rayon peut contenir des correspondances moins pertinentes');
  assert.ok(!strict.some(book => book.id === '948'));
  const result = searchCatalogue(books, childState, new Set(), { relaxFilters: true });
  assert.equal(result.broadened, true);
  assert.equal(result.state.audience, '');
  assert.equal(result.books[0].id, '948');
  const deliberate = searchCatalogue(books, childState, new Set());
  assert.equal(deliberate.broadened, false);
  assert.deepEqual(deliberate.books, strict);
  const selection = searchCatalogue(books, { ...childState, selection: true }, new Set(['3430']), { relaxFilters: true });
  assert.equal(selection.broadened, false);
  assert.deepEqual(selection.books, []);
  const noResult = searchCatalogue(books, { ...childState, q: 'zzzintrouvablezz' }, new Set(), { relaxFilters: true });
  assert.equal(noResult.broadened, false);
  assert.equal(noResult.state.audience, 'jeunesse');
});

test('Les dernières arrivées suivent la date d’ajout et le tri alphabétique reste disponible', () => {
  const recent = filterBooks(books, { ...state, sort: 'recent' }, new Set());
  assert.equal(recent.length, books.length);
  for (let i = 1; i < recent.length; i++) assert.ok(recent[i - 1].addedAt >= recent[i].addedAt);
  const fixture = prepareBooks([
    { ...rows[0], _id: 'old', title: 'A ancien', date_added: '2020-01-01 10:00:00', last_update_date: '2026-11-22 18:00:00' },
    { ...rows[0], _id: 'new', title: 'Z nouveau', date_added: '2026-11-21 10:00:00', last_update_date: '2026-11-21 10:00:00' },
    { ...rows[0], _id: 'unknown', title: 'Date inconnue', date_added: '' },
    { ...rows[0], _id: 'invalid', title: 'Date invalide', date_added: '2026-02-30' },
  ]);
  const sorted = filterBooks(fixture, { ...state, sort: 'recent' }, new Set());
  assert.deepEqual(sorted.slice(0, 2).map(book => book.id), ['new', 'old']);
  assert.ok(sorted.slice(2).every(book => book.addedAt === null));
  assert.equal(filterBooks(fixture, state, new Set())[0].id, 'old');
  assert.equal(parseAddedAt('2026-11-22 14:56:43'), Date.UTC(2026, 10, 22, 14, 56, 43));
  for (const invalid of ['', 'inconnue', '2026-02-30', '2026-13-01', '2026-11-22 25:00:00']) assert.equal(parseAddedAt(invalid), null);
});

test('Les filtres se combinent et la sélection reste limitée aux livres choisis', () => {
  const found = filterBooks(books, { ...state, genre: 'polars', rating: '4', reviews: true }, new Set());
  assert.ok(found.length > 10);
  assert.ok(found.every(book => book.families.includes('polars') && book.rating >= 4 && book.reviews));
  const ids = new Set([books[10].id, books[25].id]);
  const selection = filterBooks(books, { ...state, selection: true }, ids);
  assert.equal(selection.length, 2);
  assert.ok(selection.every(book => ids.has(book.id)));
  assert.deepEqual(filterBooks(books, { ...state, q: 'zzzintrouvablezz' }, ids), []);
});

test('Le tri des notes place les fiches sans note après les fiches notées', () => {
  const sorted = filterBooks(books, { ...state, sort: 'rating' }, new Set());
  assert.equal(sorted[0].rating, 5); assert.equal(sorted.at(-1).rating, null);
  for (let i = 1; i < sorted.length; i++) assert.ok((sorted[i - 1].rating ?? -1) >= (sorted[i].rating ?? -1));
});

test('Un identifiant dupliqué est refusé au lieu de fusionner des livres', () => {
  assert.throws(() => prepareBooks([rows[0], rows[0]]), /en double/);
});

test('Les publics ne se déduisent pas des mots adoption, adolescence ou album photo', () => {
  assert.equal(audienceFor('Récit d’adoption', null), 'adultes');
  assert.equal(audienceFor('Récit autobiographique d’adolescence', null), 'adultes');
  assert.equal(audienceFor('Album photographique', null), 'nonprecise');
  assert.equal(audienceFor('Roman adolescent d’espionnage', null), 'ados');
  assert.equal(audienceFor('Documentaire jeunesse historique', null), 'jeunesse');
  assert.equal(audienceFor('Roman ado', 11), 'ados');
  assert.equal(audienceFor('Roman jeunesse', 12), 'ados');
  assert.equal(audienceFor('Roman ado', 18), 'adultes');
});

test('Jeunesse, ados et âges se filtrent séparément, sans attribuer un âge absent', () => {
  const youths = filterBooks(books, { ...state, audience: 'jeunesse' }, new Set());
  const teens = filterBooks(books, { ...state, audience: 'ados' }, new Set());
  assert.ok(youths.length > 100 && teens.length > 50);
  assert.ok(!youths.some(book => teens.some(teen => teen.id === book.id)));
  assert.ok(![...youths, ...teens].some(book => book.minAge >= 18));
  const childAge = filterBooks(books, { ...state, audience: 'jeunesse', age: '6-8' }, new Set());
  assert.ok(childAge.length > 10);
  assert.ok(childAge.every(book => book.minAge >= 6 && book.minAge <= 8));
  const doc = prepareBooks([{ ...rows[0], _id: 'doc-sans-age', genre: 'Documentaire jeunesse historique | Antiquité • Société • Histoire' }])[0];
  assert.equal(doc.minAge, null);
  assert.equal(doc.audience, 'jeunesse');
  assert.ok(doc.families.includes('documentaires'));
  assert.ok(!teens.includes(doc));
  assert.ok(!filterBooks([doc], { ...state, age: '6-8' }, new Set()).length);
  assert.equal(filterBooks([doc], { ...state, age: 'unknown' }, new Set()).length, 1);
  assert.ok(!books.find(book => book.id === '768').audience.match(/jeunesse|ados/));
});

test('Les quatre publics sont nommés comme demandé et Adultes retrouve les rayons généraux', () => {
  assert.deepEqual(AUDIENCES.map(([, label]) => label), ['Tous les livres', 'Adultes', 'Ado', 'Enfants']);
  assert.equal(audienceFor('Roman policier historique', null), 'adultes');
  assert.equal(audienceFor('Roman jeunesse', 9), 'jeunesse');
  assert.equal(audienceFor('Roman ado', 13), 'ados');
  assert.equal(audienceFor('Genre non renseigné', null), 'nonprecise');
  const adults = filterBooks(books, { ...state, audience: 'adultes' }, new Set());
  assert.ok(adults.length > 1000);
  assert.ok(!adults.some(book => book.audience === 'jeunesse' || book.audience === 'ados'));
  assert.ok(adults.some(book => book.id === '3430'));
});
