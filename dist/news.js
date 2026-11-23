export function currentPublication(publications, now = Date.now()) {
  return publications.find(publication => {
    const start = Date.parse(publication.starts_at), end = Date.parse(publication.ends_at);
    return Number.isFinite(start) && Number.isFinite(end) && start < end && start <= now && now < end;
  });
}

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

async function initNews() {
  const banner = document.getElementById('news-banner');
  const dialog = document.getElementById('news-dialog');
  const content = document.getElementById('news-content');
  if (!banner || !dialog || !content) return;
  let publications = [], returnFocus = null;

  function showPublication(publication, rememberLocation = true) {
    returnFocus = document.activeElement;
    const header = node('header', 'news-dialog-header');
    const title = node('h2', '', publication.title); title.id = 'news-detail-title';
    header.append(node('p', 'news-kicker', publication.period), title, node('p', '', publication.lead));
    const body = node('div', 'news-dialog-body');
    body.append(node('p', 'news-intro', publication.intro));
    for (const book of publication.books) {
      const section = node('section', 'news-book');
      section.append(node('h3', '', book.title), node('p', 'news-book-author', book.author), node('p', 'news-book-text', book.text));
      const actions = node('div', 'news-book-actions');
      const link = node('a', 'primary-button', 'Voir la fiche du livre');
      link.href = `#livre=${encodeURIComponent(book.id)}`;
      link.setAttribute('aria-label', `Voir la fiche : ${book.title}`);
      link.addEventListener('click', () => dialog.close());
      actions.append(link);
      if (book.booknode) {
        const external = new URL(book.booknode);
        if (external.protocol === 'https:' && external.hostname === 'booknode.com') {
          const booknode = node('a', 'news-booknode', 'Lire sur Booknode');
          booknode.href = external.href; booknode.target = '_blank'; booknode.rel = 'noopener noreferrer';
          booknode.setAttribute('aria-label', `Booknode : ${book.title} (nouvel onglet)`);
          actions.append(booknode);
        }
      }
      section.append(actions); body.append(section);
    }
    body.append(node('p', 'news-outro', publication.outro), node('p', 'news-signoff', publication.venue), node('p', 'news-signoff', publication.signoff));
    content.replaceChildren(header, body);
    if (rememberLocation) {
      const url = new URL(location.href); url.hash = `actualite=${publication.id}`;
      history.replaceState(null, '', url);
    }
    document.body.classList.add('news-open');
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    document.getElementById('close-news').focus({ preventScroll: true });
  }

  function showFromHash() {
    if (!location.hash.startsWith('#actualite=')) return;
    const id = location.hash.slice('#actualite='.length);
    const publication = publications.find(item => item.id === id);
    if (publication) showPublication(publication, false);
  }

  function renderBanner() {
    const publication = currentPublication(publications);
    banner.hidden = !publication;
    if (!publication) { banner.replaceChildren(); return; }
    const copy = node('div', 'news-banner-copy');
    const title = node('h2', '', publication.title); title.id = 'news-title';
    copy.append(node('p', 'news-kicker', publication.label), title, node('p', 'news-summary', publication.summary));
    const button = node('button', 'primary-button', `Voir les ${publication.books.length} livres`); button.type = 'button';
    button.addEventListener('click', () => showPublication(publication));
    banner.replaceChildren(copy, button);
  }

  document.getElementById('close-news').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('news-open');
    if (location.hash.startsWith('#actualite=')) {
      const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url);
    }
    if (!document.querySelector('dialog[open]') && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  window.addEventListener('hashchange', showFromHash);
  try {
    const response = await fetch(new URL('./actualites.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data.publications)) return;
    publications = data.publications;
    renderBanner(); showFromHash();
    // Retirer l'encart à échéance, même si la page reste ouverte.
    let displayedId = currentPublication(publications)?.id;
    setInterval(() => {
      const nextId = currentPublication(publications)?.id;
      if (nextId !== displayedId) { displayedId = nextId; renderBanner(); }
    }, 60000);
  } catch { /* Une actualité indisponible ne bloque pas la consultation des livres. */ }
}

if (typeof document !== 'undefined') initNews();
