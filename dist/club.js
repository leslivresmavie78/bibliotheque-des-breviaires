const dialog = document.getElementById('club-dialog');
const entry = document.getElementById('club-entry');
const close = document.getElementById('close-club');

if (dialog && entry && close) {
  const syncClub = () => {
    if (location.hash === '#club-lecture') {
      if (!dialog.open) {
        document.body.classList.add('club-open');
        dialog.showModal();
        dialog.scrollTop = 0;
        close.focus({ preventScroll: true });
      }
    } else if (dialog.open) dialog.close();
  };

  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('club-open');
    if (location.hash === '#club-lecture') {
      const url = new URL(location.href);
      url.hash = 'selections';
      history.replaceState(null, '', url);
    }
    if (!document.querySelector('dialog[open]') && entry.getClientRects().length) entry.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  window.addEventListener('hashchange', syncClub);
  window.addEventListener('popstate', syncClub);
  syncClub();
}
