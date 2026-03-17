const crypto = require("crypto");

const SESSION_COOKIE_NAME = "cfs_sid";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const sessions = new Map();

function createSession() {
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, {
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return sid;
}

function getSession(sid) {
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  return session;
}

function setSessionFlash(sid, flash) {
  if (!sid || !flash) return;
  const session = getSession(sid);
  if (!session) return;
  session.flash = flash;
  sessions.set(sid, session);
}

function updateSession(sid, patch = {}) {
  if (!sid || !patch || typeof patch !== "object") return null;
  const session = getSession(sid);
  if (!session) return null;
  const updated = { ...session, ...patch };
  sessions.set(sid, updated);
  return updated;
}

function destroySession(sid) {
  if (!sid) return;
  sessions.delete(sid);
}

function consumeSessionFlash(sid) {
  if (!sid) return null;
  const session = getSession(sid);
  if (!session || !session.flash) return null;
  const flash = session.flash;
  delete session.flash;
  sessions.set(sid, session);
  return flash;
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== "string") return cookies;

  cookieHeader.split(";").forEach((part) => {
    const [rawName, ...rawValueParts] = part.split("=");
    const name = (rawName || "").trim();
    const value = rawValueParts.join("=").trim();
    if (!name) return;
    cookies[name] = decodeURIComponent(value || "");
  });

  return cookies;
}

module.exports = {
  SESSION_COOKIE_NAME,
  createSession,
  getSession,
  updateSession,
  destroySession,
  setSessionFlash,
  consumeSessionFlash,
  parseCookies
};
