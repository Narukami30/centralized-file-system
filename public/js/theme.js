/* ===== Theme Toggle — unified dark-mode switcher ===== */
(function initAppTheme() {
  'use strict';
  var storageKey = 'app-theme';
  var toggleBtn = document.getElementById('themeToggleBtn');

  function applyTheme(mode) {
    var dark = mode === 'dark';
    document.body.classList.toggle('dark-mode', dark);
    if (toggleBtn) {
      toggleBtn.innerHTML = dark
        ? '<i class="ri-sun-line"></i> Light Mode'
        : '<i class="ri-moon-line"></i> Dark Mode';
    }
  }

  applyTheme(localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      var next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
      localStorage.setItem(storageKey, next);
      applyTheme(next);
    });
  }
})();
