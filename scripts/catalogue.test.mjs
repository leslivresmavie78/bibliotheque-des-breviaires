import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { activeCriteria, withoutCriterion, publicationMatches } from '../dist/ui-core.js';
import { parseCSV, prepareBooks, normalize, filterBooks, searchCatalogue, parseAddedAt, audienceFor, awardKeys, awardOptions, publicationFor, coverFor, AUDIENCES } from '../dist/catalogue-core.js';

const csv = fs.readFileSync(new URL('../dist/catalogue.csv', import.meta.url), 'utf8');
const rows = parseCSV(csv);
const books = prepareBooks(rows);
const metadata = JSON.parse(fs.readFileSync(new URL('../dist/catalogue-meta.json', import.meta.url), 'utf8'));
const state = { q: '', author: '', genre: '', audience: '', age: '', rating: '', reviews: false, selection: false, sort: 'title' };
const coverResearch = fs.readdirSync(new URL('.', import.meta.url))
  .filter(name => /^cover-research-(?:\d{4}-\d{4}|homepage)\.json$/.test(name))
  .map(name => JSON.parse(fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')));
const researchedCovers = coverResearch.flatMap(research => research.books);

test('Les couvertures récupérées et recherchées restent liées aux bonnes fiches et aux bons tomes', () => {
  const publications = JSON.parse(fs.readFileSync(new URL('../dist/publication-years.json', import.meta.url), 'utf8'));
  const covers = JSON.parse(fs.readFileSync(new URL('../dist/book-covers.json', import.meta.url), 'utf8'));
  const illustrated = prepareBooks(rows, publications, covers);
  const researchedCount = coverResearch.reduce((total, research) => total + research.added_books, 0);
  assert.equal(new Set(researchedCovers.map(entry => entry._id)).size, researchedCount);
  assert.equal(Object.keys(covers.books).length, 1444 + researchedCount);
  assert.equal(illustrated.filter(book => book.cover).length, 1444 + researchedCount);
  assert.equal(illustrated.filter(book => book.cover?.source_type === 'bookcatalogue').length, 1440);
  assert.equal(illustrated.filter(book => book.cover?.source_type === 'bookcatalogue' && book.cover.width >= book.cover.height).length, 28);
  for (const [id, entry] of Object.entries(covers.books)) {
    const row = rows.find(row => row._id === id);
    assert.ok(row);
    assert.equal(coverFor(row, publicationFor(row, publications)?.year ?? null, covers), entry);
    const bytes = fs.readFileSync(new URL(`../dist/${entry.src}`, import.meta.url));
    if (entry.src.endsWith('.jpg')) assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8');
    else if (entry.src.endsWith('.png')) assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    else assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    if (entry.source_type) {
      assert.match(entry.src, new RegExp(`^book-covers/${entry.sha256}\\.(jpg|png|webp)$`));
      assert.equal(entry.series_details, row.series_details);
      if (entry.source_type !== 'bookcatalogue') {
        assert.ok(['publisher', 'bookseller', 'institution'].includes(entry.source_type));
        assert.equal(new URL(entry.source).protocol, 'https:');
        assert.equal(new URL(entry.image_source).protocol, 'https:');
        assert.ok(researchedCovers.some(researched => researched._id === id && researched.research_year === entry.research_year && researched.sha256 === entry.sha256));
      }
    } else {
      assert.equal(publicationFor(row, publications)?.year, 2026);
      assert.equal(new URL(entry.source).protocol, 'https:');
      assert.ok(entry.image_source.includes(row.isbn));
    }
  }
});

test('Une couverture ambiguë, mal identifiée ou extérieure au site ne remplace pas le livre', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../dist/book-covers.json', import.meta.url), 'utf8'));
  const id = Object.keys(data.books).find(id => data.books[id].source_type === 'bookcatalogue'), row = rows.find(row => row._id === id), entry = data.books[id];
  assert.equal(coverFor(row, null, data), entry);
  assert.equal(coverFor(row, 2026, {}), null);
  for (const change of [{ title: 'Un autre tome' }, { isbn: '9780000000002' }, { author_details: 'Autre, Auteur' }, { series_details: 'Autre série (7)' }]) assert.equal(coverFor({ ...row, ...change }, 2026, data), null);
  for (const change of [{ src: 'https://autre.site/couverture.jpg' }, { src: '../couverture.jpg' }, { src: 'book-covers/../autre.jpg' }, { sha256: '../autre' }, { _id: 'autre' }, { width: 0 }, { height: 5000 }]) assert.equal(coverFor(row, 2026, { ...data, books: { [id]: { ...entry, ...change } } }), null);
  assert.equal(coverFor(row, null, { ...data, schema_version: 999 }), null);
  assert.ok(prepareBooks(rows).every(book => book.cover === null));
});

test('Les couvertures avec ISBN à dix chiffres ou sans ISBN ne dépendent pas de l’année de parution', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../dist/book-covers.json', import.meta.url), 'utf8'));
  const unusual = Object.entries(data.books).filter(([, entry]) => entry.source_type === 'bookcatalogue' && !/^\d{13}$/.test(entry.isbn));
  assert.equal(unusual.length, 23);
  for (const [id, entry] of unusual) {
    const row = rows.find(row => row._id === id);
    assert.equal(coverFor(row, null, data), entry);
    assert.equal(coverFor(row, 1980, data), entry);
  }
});

test('L’essai 2026 conserve ses quatre images et sa compatibilité avec l’ancien inventaire', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../dist/book-covers.json', import.meta.url), 'utf8'));
  for (const id of ['99', '102', '136', '3523']) {
    const row = rows.find(row => row._id === id), entry = data.books[id];
    assert.equal(coverFor(row, 2026, { cohort_year: 2026, books: { [id]: entry } }), entry);
    assert.equal(coverFor(row, 2025, data), null);
  }
});

test('Chaque lot annuel conserve ses sources et refuse les identités incomplètes', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../dist/book-covers.json', import.meta.url), 'utf8'));
  const research = JSON.parse(fs.readFileSync(new URL('./cover-research-2025-2024.json', import.meta.url), 'utf8'));
  assert.equal(research.added_books, 61);
  assert.deepEqual(research.added_by_research_year, { 2025: 29, 2024: 32 });
  assert.equal(new Set(research.books.map(entry => entry._id)).size, 61);
  for (const entry of researchedCovers) {
    const row = rows.find(row => row._id === entry._id);
    assert.deepEqual(coverFor(row, null, data), data.books[entry._id]);
    assert.deepEqual(coverFor(row, 1990, data), data.books[entry._id]);
    for (const change of [{ source_type: 'unknown' }, { source: '' }, { image_source: 'http://image.site/couverture.jpg' }, { _id: undefined }, { series_details: undefined }, { width: 100 }, { src: entry.image_source }]) {
      assert.equal(coverFor(row, null, { ...data, books: { [entry._id]: { ...entry, ...change } } }), null);
    }
  }
  for (const batch of coverResearch) {
    assert.equal(batch.added_books, batch.books.length);
    for (const entry of batch.deferred) {
      if (data.books[entry._id]) assert.ok(coverResearch.some(later => later !== batch && later.books.some(added => added._id === entry._id)));
    }
  }
});

test('Une autre édition conserve la fiche du catalogue, avec un ISBN court ou une référence OCLC', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../dist/book-covers.json', import.meta.url), 'utf8'));
  for (const id of ['419', '450', '452', '574', '139', '2863', '1545', '2481']) {
    const row = rows.find(row => row._id === id), entry = data.books[id];
    assert.equal(coverFor(row, null, data), entry);
    assert.equal(entry.isbn, row.isbn);
    for (const change of [{ title: 'Autre livre' }, { author_details: 'Autre auteur' }, { series_details: 'Autre tome (2)' }, { isbn: '9780000000002' }]) {
      assert.equal(coverFor({ ...row, ...change }, null, data), null);
    }
  }
  assert.match(data.books['419'].isbn, /^\d{9}X$/);
  assert.equal(data.books['419'].cover_isbn, '9782253082132');
  assert.notEqual(data.books['450'].isbn, data.books['450'].cover_isbn);
  assert.equal(data.books['574'].source_type, 'institution');
  assert.equal(data.books['574'].source, 'https://www.normandielivre.fr/parutions-des-auteurs-en-normandie-10-de-fevrier-a-avril-2023/');
  const row = rows.find(row => row._id === '2481'), entry = data.books['2481'];
  assert.equal(entry.isbn, 'OCLC:670298309');
  assert.equal(entry.cover_isbn, '9782092582060');
  for (const cover_isbn of [undefined, '', 'autre']) {
    assert.equal(coverFor(row, null, { ...data, books: { ...data.books, '2481': { ...entry, cover_isbn } } }), null);
  }
});

test('Naissance, mois et singulier gardent leur libellé et rejoignent le filtre des tout-petits', () => {
  for (const [label, expected] of [['Dès la naissance', 0], ['Dès 18 mois', 1.5], ['Dès 1 an', 1]]) {
    const [book] = prepareBooks([{ ...rows[0], genre: `Album jeunesse | ${label} | Famille • Découverte • Animaux` }]);
    assert.equal(book.age, label);
    assert.equal(book.minAge, expected);
    assert.deepEqual(book.themes, ['Famille', 'Découverte', 'Animaux']);
    assert.equal(book.audience, 'jeunesse');
    assert.equal(filterBooks([book], { ...state, age: '0-5' }, new Set()).length, 1);
    assert.equal(filterBooks([book], { ...state, age: 'unknown' }, new Set()).length, 0);
    assert.equal(filterBooks([book], { ...state, age: '18+' }, new Set()).length, 0);
  }
});

test('Un âge exprimé par un intervalle garde son libellé et filtre sur son minimum', () => {
  const [book] = prepareBooks([{ ...rows[0], genre: 'Roman ado historique | Dès 12–13 ans | Enquête • Histoire • Amitié' }]);
  assert.equal(book.age, 'Dès 12–13 ans');
  assert.equal(book.minAge, 12);
  assert.equal(filterBooks([book], { ...state, age: '12-14' }, new Set()).length, 1);
  assert.equal(filterBooks([book], { ...state, age: 'unknown' }, new Set()).length, 0);
});

test('Les prix principaux ne se confondent pas avec leurs variantes ou une mention d’auteur', () => {
  assert.deepEqual(awardKeys(['Prix Goncourt 2020']), ['goncourt']);
  assert.deepEqual(awardKeys(['Prix Goncourt des Lycéens 2020']), ['goncourt-lyceens']);
  assert.deepEqual(awardKeys(['Prix Goncourt du premier roman 2026']), ['goncourt-premier-roman']);
  assert.deepEqual(awardKeys(['Prix Renaudot 2024', 'Prix Renaudot des lycéens 2018']), ['renaudot', 'renaudot-lyceens']);
  assert.deepEqual(awardKeys(['Prix Femina étranger 2013', 'Prix Médicis étranger 2019']), ['femina-etranger', 'medicis-etranger']);
  assert.deepEqual(awardKeys(['L’auteur a reçu le Prix Goncourt pour un autre livre']), ['other']);
  assert.ok(!awardOptions(books).some(([key]) => key === 'inexistant'));
  for (const key of ['goncourt', 'renaudot', 'any']) assert.ok(awardOptions(books).some(([value]) => value === key));
});

test('Le filtre d’un prix compose avec le public, la note et Ma liste', () => {
  const goncourt = filterBooks(books, { ...state, award: 'goncourt' }, new Set());
  assert.ok(goncourt.length > 10);
  assert.ok(goncourt.every(book => book.awards.some(award => /^prix goncourt \d{4}/.test(normalize(award)))));
  const selected = new Set(goncourt.slice(0, 2).map(book => book.id));
  const found = filterBooks(books, { ...state, award: 'goncourt', selection: true, audience: 'adultes' }, selected);
  assert.deepEqual(new Set(found.map(book => book.id)), selected);
  const any = filterBooks(books, { ...state, award: 'any' }, new Set());
  assert.equal(any.length, books.filter(book => book.awards.length).length);
  const rated = filterBooks(books, { ...state, award: 'renaudot', rating: '4.5' }, new Set());
  assert.ok(rated.every(book => book.awardKeys.includes('renaudot') && book.rating >= 4.5));
});

test('La première parution est liée à l’œuvre et ne provient jamais de sa réédition', () => {
  const row = { ...rows[0], _id: 'date', title: 'Un roman', isbn: '9782253000006', author_details: 'Exemple, Auteur', date_published: '2025-02-01' };
  const entry = { isbn: row.isbn, title: row.title, author_details: row.author_details, year: 1980, source: 'https://openlibrary.org/works/OL1W' };
  const data = { books: { date: entry } };
  assert.equal(publicationFor(row, data).year, 1980);
  assert.equal(prepareBooks([row], data)[0].publicationYear, 1980);
  assert.equal(prepareBooks([row])[0].publicationYear, null);
  for (const change of [{ isbn: 'autre' }, { title: 'Un autre livre' }, { author_details: 'Un autre auteur' }]) assert.equal(publicationFor({ ...row, ...change }, data), null);
  for (const change of [{ year: 9999 }, { year: '1980' }, { source: 'javascript:alert(1)' }]) assert.equal(publicationFor(row, { books: { date: { ...entry, ...change } } }), null);
});

test('L’année de première parution filtre précisément et les années absentes restent identifiables', () => {
  const fixtureRows = ['ancien', 'recent', 'inconnu'].map((id, i) => ({ ...rows[0], _id: id, title: id, isbn: String(i), literary_awards: 'Prix Goncourt 2020' }));
  const data = { books: Object.fromEntries(fixtureRows.slice(0, 2).map((row, i) => [row._id, { isbn: row.isbn, title: row.title, author_details: row.author_details, year: i ? 2020 : 1980, source: 'https://openlibrary.org/works/OL1W' }])) };
  const fixture = prepareBooks(fixtureRows, data);
  assert.deepEqual(filterBooks(fixture, { ...state, year: '1980', award: 'goncourt' }, new Set()).map(book => book.id), ['ancien']);
  assert.deepEqual(filterBooks(fixture, { ...state, year: 'unknown' }, new Set()).map(book => book.id), ['inconnu']);
  const criteria = activeCriteria({ ...state, sort: 'recent', year: '1980', award: 'goncourt' });
  assert.deepEqual(criteria.map(item => item.label), ['Prix : Goncourt', 'Première parution : 1980']);
  const next = withoutCriterion({ ...state, year: '1980', award: 'goncourt', selection: true }, 'award');
  assert.equal(next.year, '1980'); assert.equal(next.award, ''); assert.equal(next.selection, true);
});

test('Les années publiées ont une source et correspondent encore exactement aux livres du catalogue', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../dist/publication-years.json', import.meta.url), 'utf8'));
  const current = new Map(rows.map(row => [row._id, row]));
  for (const [id, entry] of Object.entries(data.books)) {
    assert.ok(current.has(id), `Livre absent : ${id}`);
    assert.equal(publicationFor(current.get(id), data)?.year, entry.year, `Identité ou année invalide : ${id}`);
  }
  const dated = prepareBooks(rows, data);
  assert.equal(dated.filter(book => book.publicationYear !== null).length, Object.keys(data.books).length);
  assert.equal(dated.find(book => book.id === '3152').publicationYear, 2024);
  assert.equal(dated.find(book => book.id === '3523').publicationYear, 2026);
  assert.equal(dated.find(book => book.id === '1106').publicationYear, 1986);
});

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

test('Vareille retrouve ses livres sans ajouter oreille, abeille ou Mireille', () => {
  const expected = new Set(books.filter(book => book.authors.includes('Marie Vareille')).map(book => book.id));
  assert.ok(expected.size > 0);
  for (const q of ['Vareille', 'VAREILLE', 'Marie Vareille', 'Vareille Marie']) {
    for (const sort of ['recent', 'title', 'author', 'rating']) {
      const found = filterBooks(books, { ...state, q, sort }, new Set());
      assert.deepEqual(new Set(found.map(book => book.id)), expected, `${q}, ${sort}`);
    }
  }
  const byAuthor = filterBooks(books, { ...state, author: 'Vareille' }, new Set());
  assert.deepEqual(new Set(byAuthor.map(book => book.id)), expected);
});

test('Les filtres et Ma liste ne remplacent pas un auteur trouvé par un mot ressemblant', () => {
  const fixture = prepareBooks([
    { ...rows[0], _id: 'auteur', title: 'Un roman', author_details: 'Vareille, Marie', genre: 'Roman adulte' },
    { ...rows[0], _id: 'oreille', title: 'L’Oreille cassée', author_details: 'Hergé', genre: 'BD jeunesse | Dès 8 ans | Aventure • Enquête • Voyage' },
  ]);
  const children = { ...state, q: 'Vareille', audience: 'jeunesse' };
  assert.deepEqual(filterBooks(fixture, children, new Set()), []);
  assert.deepEqual(filterBooks(fixture, { ...state, q: 'Vareille', selection: true }, new Set(['oreille'])), []);
  assert.deepEqual(filterBooks(fixture, { ...children, q: '', author: 'Vareille' }, new Set()), []);
  const wider = searchCatalogue(fixture, children, new Set(), { relaxFilters: true });
  assert.equal(wider.broadened, true);
  assert.deepEqual(wider.books.map(book => book.id), ['auteur']);
});

test('Les titres et thèmes précis écartent les voisins, et une faute reste rattrapable', () => {
  const fixture = prepareBooks([
    { ...rows[0], _id: 'abeille', title: 'L’abeille', author_details: 'Fuhr, Ute', genre: 'Documentaire jeunesse | Dès 3 ans | Nature • Écologie • Insectes' },
    { ...rows[0], _id: 'oreille', title: 'L’Oreille cassée', author_details: 'Hergé', genre: 'BD | Aventure • Enquête • Voyage' },
  ]);
  for (const q of ['abeille', 'ecologie']) assert.deepEqual(filterBooks(fixture, { ...state, q }, new Set()).map(book => book.id), ['abeille']);
  assert.equal(filterBooks(books, { ...state, q: 'Vareile', sort: 'recent' }, new Set())[0]?.authors[0], 'Marie Vareille');
  assert.deepEqual(filterBooks(fixture, { ...state, q: 'zzzintrouvablezz' }, new Set()), []);
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

// Les communications sont indépendantes du CSV : périodes, archives et priorités.
const { publicationCategory, publishedPublications, featuredPublications, defaultPublicationCategory, filterPublications } = await import('../dist/news.js');
const newsNow = Date.parse('2026-11-24T12:00:00+01:00');
const newsFixture = (id, type = 'theme', extra = {}) => ({ id, title: id, type, starts_at: '2026-11-23T00:00:00+01:00', ends_at: '2026-11-27T00:00:00+01:00', ...extra });

test('Les critères affichés décrivent la recherche sans confondre le tri et la liste personnelle', () => {
  const personal = { ...state, selection: true, sort: 'title' };
  assert.deepEqual(activeCriteria(personal), []);
  const criteria = activeCriteria({ ...state, sort: 'recent', q: 'Grimaldi', audience: 'adultes', genre: 'polars', age: '18+', rating: '4.5', reviews: true });
  assert.deepEqual(criteria.map(item => item.key), ['q', 'audience', 'genre', 'age', 'rating', 'reviews']);
  assert.equal(criteria.find(item => item.key === 'audience').label, 'Adultes');
  assert.equal(criteria.find(item => item.key === 'rating').label, 'Note : 4,5 / 5 et plus');
});

test('Retirer un seul critère conserve les autres choix et la limite de Ma liste', () => {
  const original = { ...state, q: 'amour', selection: true, genre: 'polars', author: 'Bussi', sort: 'rating' };
  const next = withoutCriterion(original, 'genre');
  assert.equal(next.genre, ''); assert.equal(next.author, 'Bussi'); assert.equal(next.q, 'amour'); assert.equal(next.selection, true);
  assert.equal(original.genre, 'polars');
  assert.equal(withoutCriterion(original, 'sort').sort, 'title');
  assert.equal(withoutCriterion({ ...state, sort: 'rating' }, 'sort').sort, 'recent');
  assert.equal(withoutCriterion({ ...state, reviews: true }, 'reviews').reviews, false);
});

test('La recherche des communications retrouve accents, plusieurs mots et les auteurs des livres associés', () => {
  const item = newsFixture('hiver', 'coeur', { title: 'Les fêtes de Noël', body: 'Une pause avec un livre.', books: [{ title: 'D’autres printemps', author: 'Virginie Grimaldi' }] });
  assert.equal(publicationMatches(item, 'NOEL fêtes'), true);
  assert.equal(publicationMatches(item, 'grimaldi printemps'), true);
  assert.equal(publicationMatches(item, 'pause livre'), true);
  assert.equal(publicationMatches(item, 'Bussi'), false);
  assert.equal(publicationMatches(item, '   '), true);
});

test('La recherche des archives respecte les rubriques et exclut les brouillons et les dates futures', () => {
  const items = [newsFixture('noel-coeur', 'coeur'), newsFixture('noel-theme', 'theme'), newsFixture('noel-brouillon', 'coeur', { draft: true }), newsFixture('noel-futur', 'coeur', { starts_at: '2026-12-01T00:00:00+01:00', ends_at: '2026-12-02T00:00:00+01:00' })];
  assert.deepEqual(filterPublications(items, 'coeur', newsNow, 'Noël').map(item => item.id), ['noel-coeur']);
  assert.deepEqual(filterPublications(items, 'all', newsNow, 'Noël').map(item => item.id), ['noel-coeur', 'noel-theme']);
  assert.deepEqual(filterPublications(items, 'all', newsNow, 'introuvable'), []);
});

test('Une publication existante sans rubrique reste un thème et conserve son lien', () => {
  const legacy = newsFixture('ancienne-communication'); delete legacy.type;
  assert.equal(publicationCategory(legacy), 'theme');
  assert.equal(publishedPublications([legacy], newsNow)[0].id, 'ancienne-communication');
});

test('Les brouillons, les communications futures et les périodes invalides sont exclus des archives et du bandeau', () => {
  const items = [newsFixture('valide'), newsFixture('brouillon', 'coeur', { status: 'draft' }), newsFixture('draft', 'auteur', { draft: true }), newsFixture('non-publie', 'theme', { published: false }), newsFixture('futur', 'coeur', { starts_at: '2026-11-26T00:00:00+01:00' }), newsFixture('date-invalide', 'auteur', { starts_at: 'invalide' }), newsFixture('inversee', 'theme', { ends_at: '2026-11-22T00:00:00+01:00' }), null];
  assert.deepEqual(publishedPublications(items, newsNow).map(item => item.id), ['valide']);
  assert.deepEqual(Object.values(featuredPublications(items, newsNow)).map(item => item.id), ['valide']);
});

test('La fin de période retire le thème du bandeau mais garde son texte et son lien dans les archives', () => {
  const legacy = newsFixture('lien-partage');
  const atEnd = Date.parse(legacy.ends_at);
  assert.deepEqual(featuredPublications([legacy], atEnd), {});
  assert.equal(publishedPublications([legacy], atEnd)[0], legacy);
  assert.equal(featuredPublications([legacy], atEnd - 1).theme, legacy);
});

test('Le dernier coup de cœur et le dernier focus restent accessibles jusqu’à leur remplacement', () => {
  const oldHeart = newsFixture('coeur-ancien', 'coeur', { starts_at: '2026-11-01T00:00:00+01:00', ends_at: '2026-11-04T00:00:00+01:00' });
  const focus = newsFixture('focus', 'auteur', { starts_at: '2026-11-02T00:00:00+01:00', ends_at: '2026-11-20T00:00:00+01:00' });
  assert.deepEqual(featuredPublications([oldHeart, focus], newsNow), { coeur: oldHeart, auteur: focus });
  const newHeart = newsFixture('coeur-nouveau', 'coeur');
  assert.equal(featuredPublications([newHeart, oldHeart, focus], newsNow).coeur, newHeart);
  assert.deepEqual(filterPublications([newHeart, oldHeart, focus], 'coeur', newsNow).map(item => item.id), ['coeur-nouveau', 'coeur-ancien']);
});

test('La priorité du vendredi au dimanche suit l’heure de Paris, y compris à minuit', () => {
  const choices = { theme: {}, coeur: {}, auteur: {} };
  assert.equal(defaultPublicationCategory(choices, Date.parse('2026-11-26T22:59:59Z')), 'theme');
  assert.equal(defaultPublicationCategory(choices, Date.parse('2026-11-26T23:00:00Z')), 'coeur');
  assert.equal(defaultPublicationCategory(choices, Date.parse('2026-11-29T22:59:59Z')), 'coeur');
  assert.equal(defaultPublicationCategory(choices, Date.parse('2026-11-29T23:00:00Z')), 'theme');
  assert.equal(defaultPublicationCategory(choices, Date.parse('2027-07-01T22:00:00Z')), 'coeur');
  assert.equal(defaultPublicationCategory({ auteur: {} }, newsNow), 'auteur');
  assert.equal(defaultPublicationCategory({}, newsNow), undefined);
});

test('Une alerte ne remplace pas un thème actif sauf priorité explicite', () => {
  const theme = newsFixture('lundi'); const alert = newsFixture('alerte', 'alerte');
  assert.equal(featuredPublications([alert, theme], newsNow).theme, theme);
  assert.equal(featuredPublications([alert], newsNow).theme, alert);
  const priority = { ...alert, highlight: true };
  assert.equal(featuredPublications([theme, priority], newsNow).theme, priority);
});

test('Les archives se trient par publication, conservent les anciens textes et filtrent chaque rubrique', () => {
  const old = newsFixture('ancien', 'theme', { starts_at: '2026-10-01T00:00:00+02:00', ends_at: '2026-10-05T00:00:00+02:00' });
  const heart = newsFixture('coeur', 'coeur'); const author = newsFixture('auteur', 'auteur', { starts_at: '2026-11-24T00:00:00+01:00' });
  const alert = newsFixture('alerte', 'alerte', { starts_at: '2026-11-20T00:00:00+01:00' });
  const items = [old, heart, author, alert];
  assert.deepEqual(filterPublications(items, 'all', newsNow).map(item => item.id), ['auteur', 'coeur', 'alerte', 'ancien']);
  assert.deepEqual(filterPublications(items, 'theme', newsNow).map(item => item.id), ['alerte', 'ancien']);
  assert.deepEqual(filterPublications(items, 'auteur', newsNow).map(item => item.id), ['auteur']);
  assert.equal(items[0], old);
});
