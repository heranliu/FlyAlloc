(() => {
  'use strict';
  const storageKey = 'flyalloc-theme';
  const root = document.documentElement;
  const normalize = value => value === 'light' ? 'light' : 'dark';
  const syncButtons = () => {
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === root.dataset.theme));
    });
  };
  const applyTheme = (value, persist = false) => {
    const theme = normalize(value);
    root.dataset.theme = theme;
    if (persist) {
      try { localStorage.setItem(storageKey, theme); } catch (_) { /* The current page still changes when storage is unavailable. */ }
    }
    syncButtons();
    window.dispatchEvent(new CustomEvent('flyalloc-theme-change', { detail: { theme } }));
  };
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(storageKey); } catch (_) { /* Default to dark. */ }
  applyTheme(savedTheme);
  const bindControls = () => {
    syncButtons();
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.addEventListener('click', () => applyTheme(button.dataset.themeChoice, true));
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindControls, { once: true });
  else bindControls();
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) applyTheme(event.newValue);
  });
})();
