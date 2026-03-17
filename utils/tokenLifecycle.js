const crypto = require("crypto");
const RefreshToken = require("../models/RefreshToken");
const RevokedToken = require("../models/RevokedToken");
const {
  REFRESH_TTL_SECONDS,
  setRefreshCookie,
  clearRefreshCookie,
  decodeAccessTokenUnsafe
} = require("./jwtAuth");

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function makeRawToken() {
  return crypto.randomBytes(64).toString("base64url");
}

function buildRequestContext(req) {
  return {
    ipAddress: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").slice(0, 255),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500)
  };
}

async function issueRefreshToken(req, res, userId, familyId = crypto.randomUUID()) {
  const rawToken = makeRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
  const context = buildRequestContext(req);

  await RefreshToken.create({
    userId,
    tokenHash,
    familyId,
    expiresAt,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });

  setRefreshCookie(res, rawToken);
  return { rawToken, tokenHash, familyId, expiresAt };
}

async function revokeRefreshToken(rawToken, reason = "logout") {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  return RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: reason } },
    { new: true }
  );
}

async function revokeRefreshFamily(familyId, reason = "token-reuse-detected") {
  if (!familyId) return;
  await RefreshToken.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: reason } }
  );
}

async function rotateRefreshToken(req, res, rawToken) {
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const existing = await RefreshToken.findOne({ tokenHash });
  if (!existing) {
    clearRefreshCookie(res);
    return null;
  }

  if (existing.revokedAt) {
    await revokeRefreshFamily(existing.familyId, "refresh-token-replay");
    clearRefreshCookie(res);
    return null;
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    await RefreshToken.updateOne(
      { _id: existing._id },
      { $set: { revokedAt: new Date(), revokeReason: "expired" } }
    );
    clearRefreshCookie(res);
    return null;
  }

  const replacement = await issueRefreshToken(req, res, existing.userId, existing.familyId);
  await RefreshToken.updateOne(
    { _id: existing._id, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        revokeReason: "rotated",
        replacedByHash: replacement.tokenHash
      }
    }
  );

  return {
    userId: String(existing.userId),
    familyId: existing.familyId
  };
}

async function revokeAccessTokenByPayload(payload, reason = "logout") {
  if (!payload || !payload.jti || !payload.exp) return;
  const expiresAt = new Date(payload.exp * 1000);
  if (expiresAt.getTime() <= Date.now()) return;

  await RevokedToken.updateOne(
    { jti: payload.jti },
    {
      $setOnInsert: {
        jti: payload.jti,
        userId: payload.sub || undefined,
        reason,
        expiresAt
      }
    },
    { upsert: true }
  );
}

async function revokeAccessTokenFromRaw(rawToken, reason = "logout") {
  const payload = decodeAccessTokenUnsafe(rawToken);
  await revokeAccessTokenByPayload(payload, reason);
}

async function isAccessTokenRevoked(jti) {
  if (!jti) return false;
  const found = await RevokedToken.findOne({ jti }).lean();
  return !!found;
}

module.exports = {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeRefreshFamily,
  revokeAccessTokenByPayload,
  revokeAccessTokenFromRaw,
  isAccessTokenRevoked
};
