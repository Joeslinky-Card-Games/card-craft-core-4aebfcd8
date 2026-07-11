// Chat message helpers: input sanitization, profanity censoring,
// and spam filtering for /matches/{id}/chat.

const MAX_LEN = 200;
const MAX_STORED = 100;

// Small curated list. Keep additions in lowercase; matched case-insensitively
// as whole words. This is intentionally conservative — the goal is to
// prevent casual abuse, not to be a comprehensive filter.
const BAD_WORDS = [
  "fuck", "fucking", "fucker", "motherfucker",
  "shit", "shitty", "bullshit",
  "bitch", "bastard",
  "asshole", "arsehole", "dickhead",
  "cunt", "twat",
  "faggot", "fag",
  "nigger", "nigga",
  "retard", "retarded",
  "slut", "whore",
  "cock", "dick", "prick",
  "pussy",
];

function censorProfanity(text) {
  return text.replace(/[A-Za-z]{3,}/g, (word) => {
    const lower = word.toLowerCase();
    if (!BAD_WORDS.includes(lower)) return word;
    if (word.length <= 2) return word;
    return word[0] + "*".repeat(word.length - 1);
  });
}

function sanitizeText(raw) {
  if (typeof raw !== "string") return null;
  // Strip zero-width + control chars, collapse whitespace, trim.
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (cleaned.length > MAX_LEN) return cleaned.slice(0, MAX_LEN);
  return cleaned;
}

// Reject bare-URL spam. Users can still reference sites in natural language;
// this only blocks messages that look primarily like a link.
function looksLikeUrl(text) {
  return /\bhttps?:\/\/\S+/i.test(text) || /\b[a-z0-9-]+\.(com|net|org|io|xyz|gg|co|ru|cn|info)\b/i.test(text);
}

// Returns { ok: true, text } or { ok: false, reason }.
function acceptMessage({ existing, userId, text, now }) {
  const clean = sanitizeText(text);
  if (!clean) return { ok: false, reason: "Message is empty" };
  if (looksLikeUrl(clean)) return { ok: false, reason: "Links aren't allowed in table chat" };

  const mine = (existing || []).filter((m) => m.userId === userId);

  // 1s cooldown between messages from the same user.
  const last = mine[mine.length - 1];
  if (last && now - last.at < 1000) {
    return { ok: false, reason: "You're sending messages too fast" };
  }
  // Max 5 messages in the last 10 seconds.
  const recent = mine.filter((m) => now - m.at < 10_000);
  if (recent.length >= 5) {
    return { ok: false, reason: "Slow down — too many messages" };
  }
  // Dedupe: reject if identical to any of the last 3 messages from this user.
  const dupes = mine.slice(-3);
  if (dupes.some((m) => m.text.toLowerCase() === censorProfanity(clean).toLowerCase())) {
    return { ok: false, reason: "Duplicate message" };
  }

  return { ok: true, text: censorProfanity(clean) };
}

function appendMessage(existing, msg) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  list.push(msg);
  if (list.length > MAX_STORED) list.splice(0, list.length - MAX_STORED);
  return list;
}

module.exports = { acceptMessage, appendMessage, censorProfanity, sanitizeText, MAX_LEN, MAX_STORED };