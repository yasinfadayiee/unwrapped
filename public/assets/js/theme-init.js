// Applies the saved colour theme before the page paints (no flash). Plain script, no module.
(function () {
  try {
    var t = localStorage.getItem('unw.theme');
    if (t && t !== 'lime') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
  // Scroll-reveal content is only hidden while JS can show it again: without
  // this class (no JS) or if site.js never starts, everything stays visible.
  var html = document.documentElement;
  html.classList.add('js');
  setTimeout(function () {
    if (!html.classList.contains('reveal-ready')) html.classList.remove('js');
  }, 4000);
})();
