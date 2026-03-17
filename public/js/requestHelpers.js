(function () {
  // CSRF token management
  let cachedCsrfToken = null;

  function getCsrfTokenFromCookie() {
    const match = document.cookie.match(/cfs_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getCsrfToken() {
    if (cachedCsrfToken) return cachedCsrfToken;
    cachedCsrfToken = getCsrfTokenFromCookie();
    return cachedCsrfToken;
  }

  // Refresh CSRF token from server
  async function refreshCsrfToken() {
    try {
      const response = await fetch('/csrf-token', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        cachedCsrfToken = data.csrfToken;
        return cachedCsrfToken;
      }
    } catch (e) {
      console.warn('Failed to refresh CSRF token:', e);
    }
    return getCsrfTokenFromCookie();
  }

  function redirectToLogin(redirect) {
    const target = redirect || '/auth/login?reason=timeout';
    if (typeof window !== 'undefined' && window.location && window.location.href !== target) {
      window.location.href = target;
    }
  }

  function shouldHandleTimeout(responseStatus, payload) {
    return responseStatus === 401 && payload && payload.reason === 'timeout';
  }

  function shouldHandleUnauthorized(responseStatus) {
    return responseStatus === 401;
  }

  function shouldHandleCsrfError(responseStatus, payload) {
    return responseStatus === 403 && payload && payload.message && payload.message.includes('CSRF');
  }

  function normalizeRequestOptions(options = {}) {
    const normalized = { ...options };
    const headers = { ...(normalized.headers || {}) };

    if (!headers.Accept) {
      headers.Accept = 'application/json';
    }
    if (!headers['X-Requested-With']) {
      headers['X-Requested-With'] = 'XMLHttpRequest';
    }

    // Add CSRF token for state-changing methods
    const method = (normalized.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
    }

    normalized.headers = headers;
    return normalized;
  }

  async function requestJson(url, options = {}, retryOnCsrf = true) {
    const response = await fetch(url, normalizeRequestOptions(options));
    const contentType = response.headers.get('content-type') || '';
    let payload;

    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      payload = { success: false, message: `Request failed (${response.status})` };
    }

    // Handle CSRF errors by refreshing token and retrying once
    if (shouldHandleCsrfError(response.status, payload) && retryOnCsrf) {
      await refreshCsrfToken();
      return requestJson(url, options, false);
    }

    if (shouldHandleUnauthorized(response.status)) {
      redirectToLogin((payload && payload.redirect) || '/auth/login?reason=timeout');
      if (shouldHandleTimeout(response.status, payload)) {
        throw new Error(payload.message || 'Session expired due to inactivity. Please log in again.');
      }
      throw new Error((payload && payload.message) || 'Unauthorized. Please log in again.');
    }

    // Update cached CSRF token from response if available
    const newCsrfCookie = getCsrfTokenFromCookie();
    if (newCsrfCookie) {
      cachedCsrfToken = newCsrfCookie;
    }

    return payload;
  }

  function postNoBody(url) {
    return requestJson(url, { method: 'POST' });
  }

  function postJson(url, payload) {
    return requestJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  // Add CSRF token to FormData for file uploads
  function appendCsrfToFormData(formData) {
    const csrfToken = getCsrfToken();
    if (csrfToken && !formData.has('_csrf')) {
      formData.append('_csrf', csrfToken);
    }
    return formData;
  }

  window.RequestHelpers = {
    requestJson,
    postNoBody,
    postJson,
    redirectToLogin,
    shouldHandleTimeout,
    shouldHandleUnauthorized,
    getCsrfToken,
    refreshCsrfToken,
    appendCsrfToFormData
  };
})();
