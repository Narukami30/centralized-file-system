/* ===== Toast Notification Utility ===== */
(function () {
  'use strict';

  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const ICONS = {
    success: 'ri-check-line',
    error: 'ri-close-circle-line',
    info: 'ri-information-line',
    warning: 'ri-alert-line'
  };

  /**
   * Show a toast notification.
   * @param {string} message - Text to display
   * @param {'success'|'error'|'info'|'warning'} type - Toast type
   * @param {number} [duration=3500] - Auto-dismiss in ms (0 = manual)
   */
  function showToast(message, type, duration) {
    type = type || 'info';
    duration = typeof duration === 'number' ? duration : 3500;

    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.setAttribute('role', 'status');
    el.innerHTML = '<i class="ri ' + (ICONS[type] || ICONS.info) + '"></i><span>' + escapeHtml(message) + '</span>';
    container.appendChild(el);

    if (duration > 0) {
      setTimeout(function () { dismissToast(el); }, duration);
    }
    return el;
  }

  function dismissToast(el) {
    if (!el || !el.parentNode) return;
    el.classList.add('toast-out');
    el.addEventListener('animationend', function () { el.remove(); });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.showToast = showToast;
})();
