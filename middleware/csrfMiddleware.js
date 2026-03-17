/**
 * CSRF Protection Middleware
 * Provides Cross-Site Request Forgery protection using double-submit cookie pattern
 */

const crypto = require("crypto");
const { encrypt, decrypt } = require("../utils/encryption");

const CSRF_COOKIE_NAME = "cfs_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a CSRF token
 * @returns {string} - Secure random token
 */
function generateCsrfToken() {
  const token = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
  const timestamp = Date.now().toString(36);
  return `${token}.${timestamp}`;
}

/**
 * Validate CSRF token age
 * @param {string} token - CSRF token with timestamp
 * @returns {boolean}
 */
function isTokenValid(token) {
  if (!token || typeof token !== "string") return false;
  
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  
  const timestamp = parseInt(parts[1], 36);
  if (isNaN(timestamp)) return false;
  
  return (Date.now() - timestamp) < CSRF_TOKEN_MAX_AGE_MS;
}

/**
 * Set CSRF cookie
 * @param {object} res - Express response object
 * @param {string} token - CSRF token
 */
function setCsrfCookie(res, token) {
  const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; SameSite=Strict; Max-Age=86400${secureCookie}`
  );
}

/**
 * Parse cookies from header
 * @param {string} cookieHeader - Cookie header string
 * @returns {object}
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(";").forEach(cookie => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name && rest.length) {
      try {
        cookies[name] = decodeURIComponent(rest.join("="));
      } catch {
        cookies[name] = rest.join("=");
      }
    }
  });
  
  return cookies;
}

/**
 * CSRF Protection Middleware
 * - Generates and attaches CSRF token for GET/HEAD/OPTIONS requests
 * - Validates CSRF token for state-changing methods (POST, PUT, DELETE, PATCH)
 */
function csrfProtection(options = {}) {
  const ignorePaths = options.ignorePaths || [];
  const ignoreMethods = ["GET", "HEAD", "OPTIONS"];
  
  return function csrfMiddleware(req, res, next) {
    const cookies = parseCookies(req.headers.cookie || "");
    
    // Skip CSRF for certain paths (like API endpoints with their own auth)
    const shouldSkip = ignorePaths.some(p => {
      if (typeof p === "string") return req.path.startsWith(p);
      if (p instanceof RegExp) return p.test(req.path);
      return false;
    });
    
    if (shouldSkip) {
      return next();
    }
    
    // For safe methods, just ensure a token exists
    if (ignoreMethods.includes(req.method)) {
      let token = cookies[CSRF_COOKIE_NAME];
      
      // Generate new token if missing or expired
      if (!token || !isTokenValid(token)) {
        token = generateCsrfToken();
        setCsrfCookie(res, token);
      }
      
      // Attach token to response locals for templates
      res.locals.csrfToken = token;
      req.csrfToken = () => token;
      
      return next();
    }
    
    // For state-changing methods, validate the token
    const cookieToken = cookies[CSRF_COOKIE_NAME];
    const headerToken = req.headers[CSRF_HEADER_NAME] || req.headers[CSRF_HEADER_NAME.toLowerCase()];
    const bodyToken = req.body && req.body._csrf;
    const queryToken = req.query && req.query._csrf;
    
    const submittedToken = headerToken || bodyToken || queryToken;
    
    // Validate tokens match and are not expired
    if (!cookieToken || !submittedToken) {
      return res.status(403).json({
        success: false,
        message: "CSRF token missing"
      });
    }
    
    if (cookieToken !== submittedToken) {
      return res.status(403).json({
        success: false,
        message: "CSRF token mismatch"
      });
    }
    
    if (!isTokenValid(cookieToken)) {
      return res.status(403).json({
        success: false,
        message: "CSRF token expired"
      });
    }
    
    // Generate new token after successful validation (token rotation)
    const newToken = generateCsrfToken();
    setCsrfCookie(res, newToken);
    res.locals.csrfToken = newToken;
    req.csrfToken = () => newToken;
    
    return next();
  };
}

/**
 * Get CSRF token for AJAX requests
 */
function csrfTokenEndpoint(req, res) {
  const token = req.csrfToken ? req.csrfToken() : generateCsrfToken();
  setCsrfCookie(res, token);
  res.json({ csrfToken: token });
}

module.exports = {
  csrfProtection,
  csrfTokenEndpoint,
  generateCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
