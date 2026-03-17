function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function deny(req, res, message, options = {}) {
  const mode = options.mode || "json";
  if (mode === "redirect") {
    if (req.setFlash) req.setFlash("error", message || "Unauthorized");
    return res.redirect("/auth/login");
  }
  return res.status(options.statusCode || 403).json({ success: false, message: message || "Unauthorized" });
}

function requireActive(options = {}) {
  return function activeMiddleware(req, res, next) {
    if (!req.actor) {
      return deny(req, res, "Unauthorized", { mode: options.mode, statusCode: 401 });
    }
    if (req.actor.active === false) {
      return deny(req, res, "Account is deactivated", { mode: options.mode, statusCode: 403 });
    }
    // Check suspended status
    if (req.actor.status === "suspended") {
      if (req.actor.suspendedUntil && req.actor.suspendedUntil <= new Date()) {
        // Auto-reactivate expired suspension
        req.actor.status = "active";
        req.actor.suspendedReason = "";
        req.actor.suspendedUntil = null;
        req.actor.save().catch(() => {});
      } else {
        const msg = req.actor.suspendedUntil
          ? `Account is suspended until ${req.actor.suspendedUntil.toLocaleDateString()}`
          : "Account is suspended";
        return deny(req, res, msg, { mode: options.mode, statusCode: 403 });
      }
    }
    return next();
  };
}

function requireRole(allowedRoles = [], options = {}) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return function roleMiddleware(req, res, next) {
    if (!req.actor) {
      return deny(req, res, "Unauthorized", { mode: options.mode, statusCode: 401 });
    }
    if (!roles.includes(req.actor.role)) {
      return deny(req, res, options.message || "Unauthorized", { mode: options.mode, statusCode: 403 });
    }
    return next();
  };
}

function requireActorMatchesField(fieldPath, options = {}) {
  return function actorMatchMiddleware(req, res, next) {
    if (!req.actor) {
      return deny(req, res, "Unauthorized", { mode: options.mode, statusCode: 401 });
    }

    const value = getByPath(req, fieldPath);
    if (typeof value !== "string" || !value.trim()) {
      return deny(req, res, options.missingMessage || "Missing identity field", { mode: options.mode, statusCode: 400 });
    }

    if (value.trim().toLowerCase() !== String(req.actor.email || "").toLowerCase()) {
      return deny(req, res, options.message || "Identity mismatch", { mode: options.mode, statusCode: 403 });
    }

    return next();
  };
}

module.exports = {
  requireActive,
  requireRole,
  requireActorMatchesField
};
