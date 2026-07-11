const { createHash } = require("crypto");

function hashPassword(pw) {
  return createHash("sha256").update(String(pw), "utf8").digest("hex");
}

function stripSecret(match) {
  if (!match) return match;
  const { passwordHash, ...rest } = match;
  return rest;
}

function validatePassword(pw) {
  if (typeof pw !== "string") return "Password is required";
  const trimmed = pw.trim();
  if (trimmed.length < 4) return "Password must be at least 4 characters";
  if (trimmed.length > 64) return "Password must be at most 64 characters";
  return null;
}

module.exports = { hashPassword, stripSecret, validatePassword };