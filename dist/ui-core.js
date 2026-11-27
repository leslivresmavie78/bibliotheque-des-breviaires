import { AUDIENCES, FAMILIES, AGE_RANGES, LITERARY_AWARDS, normalize } from './catalogue-core.js?v=20261127-covers3';

export function activeCriteria(state) {
  const criteria = [];
  const add = (key, label) => { if (state[key]) criteria.push({ key, label }); };
  add('q', `Recherche : ${state.q || ''}`);
  add('audience', AUDIENCES.find(([value]) => value === state.audience)?.[1] || state.audience);
  add('genre', FAMILIES.find(([value]) => value === state.genre)?.[1] || state.genre);
  add('author', `Auteur : ${state.author || ''}`);
  add('award', `Prix : ${{ any: 'tous les livres primés', other: 'autres prix' }[state.award] || LITERARY_AWARDS.find(([key]) => key === state.award)?.[1] || state.award}`);
  add('year', state.year === 'unknown' ? 'Première parution non renseignée' : `Première parution : ${state.year}`);
  add('age', state.age === 'unknown' ? 'Âge non renseigné' : AGE_RANGES.find(([value]) => value === state.age)?.[1] || state.age);
  add('rating', `Note : ${String(state.rating || '').replace('.', ',')} / 5 et plus`);
  add('reviews', 'Avec des avis');
  const defaultSort = state.selection ? 'title' : 'recent';
  if (state.sort && state.sort !== defaultSort) criteria.push({ key: 'sort', label: `Tri : ${{ recent: 'dernières arrivées', title: 'titre A à Z', author: 'auteur A à Z', rating: 'les mieux notés' }[state.sort] || state.sort}` });
  return criteria;
}

export function withoutCriterion(state, key) {
  if (!activeCriteria(state).some(criterion => criterion.key === key)) return { ...state };
  return { ...state, [key]: key === 'sort' ? state.selection ? 'title' : 'recent' : key === 'reviews' ? false : '' };
}

export function publicationMatches(publication, query = '') {
  const terms = normalize(query).split(' ').filter(Boolean);
  const text = normalize([
    publication.title, publication.intro, publication.lead, publication.body, publication.outro,
    ...(Array.isArray(publication.books) ? publication.books.flatMap(book => [book.title, book.author, book.text]) : []),
  ].filter(value => typeof value === 'string').join(' '));
  return terms.every(term => text.includes(term));
}

export function externalLinkLabel(value) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, '');
    return hostname === 'booknode.com' ? 'Découvrir sur Booknode' : `Consulter ${hostname}`;
  } catch { return 'Consulter le lien'; }
}
