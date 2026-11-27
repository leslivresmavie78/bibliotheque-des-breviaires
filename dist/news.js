import { publicationMatches, externalLinkLabel } from './ui-core.js?v=5';
import { setClubView } from './club.js?v=2';

const CATEGORY_LABELS = { theme: 'Thème', coeur: 'Coup de cœur', auteur: 'Focus auteur', alerte: 'Actualité', actualite: 'Actualité littéraire', nouveautes: 'Nouveautés', vie: 'Vie de la bibliothèque' };
const parisWeekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' });

export function publicationCategory(publication) {
  return Object.hasOwn(CATEGORY_LABELS, publication.type) ? publication.type : 'theme';
}

// La fin concerne la mise en avant. Elle ne supprime jamais une publication des archives.
export function publishedPublications(publications, now = Date.now()) {
  const seen = new Set();
  return publications.filter(publication => {
    if (!publication || typeof publication.id !== 'string' || !publication.id || typeof publication.title !== 'string' || !publication.title.trim()) return false;
    const start = Date.parse(publication.starts_at), end = Date.parse(publication.ends_at);
    return publication.status !== 'draft' && publication.draft !== true && publication.published !== false && Number.isFinite(start) && Number.isFinite(end) && start < end && start <= now;
  }).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)).filter(publication => {
    if (seen.has(publication.id)) return false;
    seen.add(publication.id); return true;
  });
}

export function featuredPublications(publications, now = Date.now()) {
  const published = publishedPublications(publications, now).filter(publication => publication.archive_only !== true);
  const active = published.filter(publication => now < Date.parse(publication.ends_at));
  const alerts = active.filter(publication => publicationCategory(publication) === 'alerte');
  const featured = {
    theme: alerts.find(publication => publication.highlight === true) || active.find(publication => publicationCategory(publication) === 'theme') || alerts[0],
    coeur: published.find(publication => publicationCategory(publication) === 'coeur'),
    auteur: published.find(publication => publicationCategory(publication) === 'auteur'),
  };
  return Object.fromEntries(Object.entries(featured).filter(([, publication]) => publication));
}

export function defaultPublicationCategory(featured, now = Date.now()) {
  const preferred = ['Fri', 'Sat', 'Sun'].includes(parisWeekday.format(now)) ? 'coeur' : 'theme';
  return featured[preferred] ? preferred : ['theme', 'coeur', 'auteur'].find(category => featured[category]);
}

export function currentPublication(publications, now = Date.now()) {
  const featured = featuredPublications(publications, now);
  return featured[defaultPublicationCategory(featured, now)];
}

export function filterPublications(publications, category, now = Date.now(), query = '') {
  return publishedPublications(publications, now).filter(publication =>
    (category === 'all' || publicationCategory(publication) === category || (category === 'theme' && publicationCategory(publication) === 'alerte')) && publicationMatches(publication, query));
}

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

async function initNews() {
  const $ = id => document.getElementById(id);
  const dialog = $('news-dialog'), content = $('news-content');
  if (!dialog || !content) return;
  let publications = [], returnFocus = null, returnHash = '', archiveCategory = 'all', loaded = false;
  let openedId = null, archiveSignature = '', unavailable = false, archiveQuery = '', archiveDebounce;
  const returnOrigins = new Map();

  function setView(archives, focus = false) {
    const club = location.hash === '#club-lecture';
    $('catalogue-view').hidden = archives || club; $('publications-view').hidden = !archives || club;
    $('publications-nav').classList.toggle('active', archives && !club);
    $('publications-nav').setAttribute('aria-pressed', String(archives && !club));
    setClubView(club);
    document.dispatchEvent(new Event('catalogue-view-change'));
    const title = club ? 'club-title' : 'publications-title';
    document.querySelector('.skip-link').href = club ? '#club-title' : archives ? '#publications-title' : '#results';
    if (focus) $(title).focus({ preventScroll: true });
  }

  function setHash(hash, push = false) {
    const url = new URL(location.href); url.hash = hash;
    history[push ? 'pushState' : 'replaceState'](null, '', url);
  }

  function paragraph(target, className, value) {
    if (value) target.append(node('p', className, value));
  }

  function archiveText(target, text) {
    for (const value of text.split(/\n\s*\n/)) {
      const paragraph = node('p', 'news-archive-paragraph');
      let start = 0;
      for (const match of value.matchAll(/https:\/\/[^\s<>]+/g)) {
        const url = match[0].replace(/[),.;!?]+$/, '');
        paragraph.append(document.createTextNode(value.slice(start, match.index)));
        const label = externalLinkLabel(url);
        const link = node('a', '', label); link.href = url;
        link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', `${label} (nouvel onglet)`);
        paragraph.append(link); start = match.index + url.length;
      }
      paragraph.append(document.createTextNode(value.slice(start))); target.append(paragraph);
    }
  }

  function showPublication(publication, rememberLocation = true) {
    if (openedId === publication.id && dialog.open) return;
    if (!dialog.open) {
      returnFocus = document.activeElement;
      returnHash = !rememberLocation && returnOrigins.has(publication.id) ? returnOrigins.get(publication.id) : $('catalogue-view').hidden ? '#selections' : '';
      returnOrigins.set(publication.id, returnHash);
    }
    openedId = publication.id;
    const header = node('header', 'news-dialog-header');
    const title = node('h2', '', publication.title); title.id = 'news-detail-title';
    paragraph(header, 'news-kicker', publication.period); header.append(title); paragraph(header, '', publication.lead);
    const body = node('div', 'news-dialog-body');
    const linkedBooks = (Array.isArray(publication.books) ? publication.books : []).filter(book => book.id);
    if (linkedBooks.length) {
      const quickBooks = node('div', 'news-quick-books');
      const quickLink = (book, label, className = '') => {
        const link = node('a', className, label); link.href = `#livre=${encodeURIComponent(book.id)}`;
        link.setAttribute('aria-label', `Voir le livre au catalogue : ${book.title}`);
        link.addEventListener('click', () => { setView(false); dialog.close(); });
        return link;
      };
      if (linkedBooks.length === 1) quickBooks.append(quickLink(linkedBooks[0], 'Voir le livre au catalogue', 'primary-button'));
      else {
        const details = node('details'), summary = node('summary', '', `Voir les ${linkedBooks.length} livres au catalogue`), list = node('ul');
        for (const book of linkedBooks) { const item = node('li'); item.append(quickLink(book, book.title)); list.append(item); }
        details.append(summary, list); quickBooks.append(details);
      }
      body.append(quickBooks);
    }
    if (publication.archive_only === true) {
      paragraph(body, 'news-archive-note', 'Archive : les rendez-vous, horaires et annonces de ce message se rapportent à sa date de publication.');
      paragraph(body, 'news-editorial-note', publication.editorial_note);
    }
    paragraph(body, 'news-intro', publication.intro);
    if (typeof publication.body === 'string') archiveText(body, publication.body);
    if (Array.isArray(publication.images) && publication.images.length) {
      const gallery = node('div', 'news-archive-images');
      for (const visual of publication.images) {
        if (!/^\.\/archive-wa-[a-zA-Z0-9-]+\.jpg$/.test(visual.src) || !visual.alt) continue;
        const link = node('a', 'news-archive-image'); link.href = visual.src;
        link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', `Agrandir : ${visual.alt} (nouvel onglet)`);
        const image = document.createElement('img'); image.src = visual.src;
        image.alt = visual.alt; image.loading = 'lazy'; image.decoding = 'async';
        if (visual.width > 0 && visual.height > 0) { image.width = visual.width; image.height = visual.height; }
        link.append(image); gallery.append(link);
      }
      body.append(gallery);
    }
    if (publication.body && publication.books?.length) body.append(node('h3', 'news-related-title', 'Retrouver les livres dans le catalogue'));
    for (const book of Array.isArray(publication.books) ? publication.books : []) {
      const section = node('section', 'news-book');
      section.append(node('h3', '', book.title)); paragraph(section, 'news-book-author', book.author); paragraph(section, 'news-book-text', book.text);
      paragraph(section, 'news-book-notice', book.notice);
      const actions = node('div', 'news-book-actions');
      if (book.id) {
        const link = node('a', 'primary-button', 'Voir la fiche du livre');
        link.href = `#livre=${encodeURIComponent(book.id)}`;
        link.setAttribute('aria-label', `Voir la fiche : ${book.title}`);
        link.addEventListener('click', () => { setView(false); dialog.close(); });
        actions.append(link);
      }
      try {
        const external = new URL(book.booknode);
        if (external.protocol === 'https:' && external.hostname === 'booknode.com') {
          const booknode = node('a', 'news-booknode', 'Lire sur Booknode');
          booknode.href = external.href; booknode.target = '_blank'; booknode.rel = 'noopener noreferrer';
          booknode.setAttribute('aria-label', `Booknode : ${book.title} (nouvel onglet)`); actions.append(booknode);
        }
      } catch { /* Un lien externe manquant ou incorrect ne masque pas la sélection. */ }
      section.append(actions); body.append(section);
    }
    paragraph(body, 'news-outro', publication.outro); paragraph(body, 'news-signoff', publication.venue); paragraph(body, 'news-signoff', publication.signoff);
    content.replaceChildren(header, body);
    if (rememberLocation) setHash(`actualite=${encodeURIComponent(publication.id)}`, true);
    document.body.classList.add('news-open');
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0; $('close-news').focus({ preventScroll: true });
  }

  function showFromHash() {
    if (location.hash.startsWith('#actualite=')) {
      if (!loaded) return;
      let id; try { id = decodeURIComponent(location.hash.slice('#actualite='.length)); } catch { id = ''; }
      const publication = publishedPublications(publications).find(item => item.id === id);
      if (publication) showPublication(publication, false);
      else {
        if (dialog.open) dialog.close();
        setView(true); $('publications-empty').hidden = false;
        $('publications-empty').textContent = 'Cette communication n’est pas disponible pour le moment.';
      }
      return;
    }
    if (dialog.open) dialog.close();
    setView(['#selections', '#publications-title', '#club-lecture'].includes(location.hash));
  }

  function renderArchives() {
    const visible = filterPublications(publications, archiveCategory, Date.now(), archiveQuery), fragment = document.createDocumentFragment();
    for (const publication of visible) {
      const article = node('article', 'publication-row'), copy = node('div', 'publication-copy');
      const category = publicationCategory(publication);
      copy.append(node('p', 'publication-category', category === 'alerte' && publication.label ? publication.label : CATEGORY_LABELS[category]), node('h2', '', publication.title));
      paragraph(copy, 'publication-period', publication.period);
      const link = node('a', 'publication-read', 'Lire'); link.href = `#actualite=${encodeURIComponent(publication.id)}`;
      link.setAttribute('aria-label', `Lire la communication : ${publication.title}`);
      link.addEventListener('click', event => { event.preventDefault(); showPublication(publication); });
      article.append(copy, link); fragment.append(article);
    }
    $('publications-list').replaceChildren(fragment);
    $('publications-count').textContent = `${visible.length} communication${visible.length > 1 ? 's' : ''}`;
    $('publications-empty').hidden = !!visible.length;
    $('publications-empty').textContent = unavailable ? 'Les communications n’ont pas pu être chargées. Réessayez en actualisant la page.' : archiveQuery.trim() ? 'Aucun message ne correspond. Essayez un autre mot ou choisissez la rubrique « Toutes ».' : 'Aucune communication dans cette rubrique pour le moment.';
    $('clear-publication-search').hidden = !archiveQuery;
    const searchLabel = $('publication-search-label');
    if (searchLabel) searchLabel.textContent = archiveQuery.trim() ? `Recherche : ${archiveQuery.trim()}` : 'Rechercher';
    for (const button of $('publication-filters').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.category === archiveCategory));
  }

  function refreshPublications() {
    const nextArchive = publishedPublications(publications).map(publication => publication.id).join('|');
    if (nextArchive !== archiveSignature) { archiveSignature = nextArchive; renderArchives(); }
  }

  $('publications-nav').addEventListener('click', () => { if (location.hash !== '#selections') setHash('selections', true); setView(true, true); });
  $('club-nav').addEventListener('click', () => { if (location.hash !== '#club-lecture') setHash('club-lecture', true); setView(false, true); });
  document.addEventListener('show-catalogue', () => { setHash(''); setView(false); });
  $('publication-filters').addEventListener('click', event => {
    const button = event.target.closest('button[data-category]'); if (!button) return;
    archiveCategory = button.dataset.category; renderArchives();
  });
  const searchArchives = () => { clearTimeout(archiveDebounce); archiveQuery = $('publication-search').value.slice(0, 250); renderArchives(); };
  $('publication-search').addEventListener('input', () => { clearTimeout(archiveDebounce); archiveDebounce = setTimeout(searchArchives, 220); });
  $('publication-search-form').addEventListener('submit', event => { event.preventDefault(); searchArchives(); });
  $('clear-publication-search').addEventListener('click', () => { $('publication-search').value = ''; searchArchives(); $('publication-search').focus(); });
  $('close-news').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('news-open'); openedId = null;
    if (location.hash.startsWith('#actualite=')) { setHash(returnHash); setView(returnHash === '#selections'); }
    if (!document.querySelector('dialog[open]') && returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  window.addEventListener('hashchange', showFromHash); window.addEventListener('popstate', showFromHash);
  document.addEventListener('visibilitychange', () => { if (loaded && !document.hidden) refreshPublications(); });
  showFromHash();
  try {
    const response = await fetch(new URL('./actualites.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error('Communications indisponibles');
    const data = await response.json(); if (!Array.isArray(data.publications)) throw new Error('Format des communications incorrect');
    publications = data.publications;
  } catch { unavailable = true; /* Le catalogue reste consultable. */ }
  loaded = true; refreshPublications(); renderArchives(); showFromHash();
  // Les publications déjà commencées restent accessibles après leur période.
  setInterval(refreshPublications, 60000);
}

if (typeof document !== 'undefined') initNews();
