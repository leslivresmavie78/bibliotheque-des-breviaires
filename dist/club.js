export function setClubView(visible) {
  const view = document.getElementById('club-view');
  const nav = document.getElementById('club-nav');
  if (view) view.hidden = !visible;
  if (nav) {
    nav.classList.toggle('active', visible);
    nav.setAttribute('aria-pressed', String(visible));
  }
}
