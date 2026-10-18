// Applies the saved colour theme before the page paints (no flash). Plain script, no module.
(function () {
  try {
    var t = localStorage.getItem('unw.theme');
    if (t && t !== 'lime') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
