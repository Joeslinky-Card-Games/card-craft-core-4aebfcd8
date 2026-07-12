// Chat message helpers: input sanitization, profanity censoring,
// and spam filtering for /matches/{id}/chat.

const MAX_LEN = 200;
const MAX_STORED = 100;

// Bad-word roots, matched as substrings against a normalized form of each
// token (lowercased, leetspeak mapped to letters, non-letters stripped,
// repeated letters collapsed). This catches "fuckkkkk", "f.u.c.k",
// "sh1t", "@sshole", "n1gg3r", etc.
//
// Categories: profanity, slurs (racism, homophobia, transphobia,
// ableism, xenophobia, antisemitism), sexual content.
const BAD_WORDS = [
  // General profanity
  "fuck", "fuk", "fck", "phuck", "shit", "sht", "bullshit", "bitch", "biatch",
  "bastard", "asshole", "arsehole", "dumbass", "jackass", "dipshit",
  "cunt", "twat", "wanker", "bollocks", "bugger", "prick", "douche",
  "goddamn", "piss", "pissed",
  // Sexual / anatomy
  "cock", "dick", "dickhead", "penis", "pussy", "vagina", "cum", "jizz",
  "boner", "boobs", "boob", "tits", "titty", "titties", "nipple",
  "sex", "sexy", "porn", "porno", "orgasm", "masturbate", "masturbation",
  "jerkoff", "handjob", "blowjob", "bj", "rimjob", "anal", "anus",
  "buttfuck", "buttplug", "dildo", "vibrator", "fleshlight",
  "horny", "kinky", "milf", "gilf", "hentai", "incest",
  "slut", "whore", "hoe", "skank", "thot", "hooker", "escort",
  "erection", "ejaculate", "ejaculation", "creampie", "gangbang", "bukkake",
  // Rape / abuse
  "rape", "rapist", "molest", "molester", "pedo", "pedophile", "paedophile",
  // Racism
  "nigger", "nigga", "niglet", "coon", "spic", "spik", "chink", "gook",
  "kike", "sheeny", "wetback", "beaner", "raghead", "towelhead", "sandnigger",
  "jigaboo", "porchmonkey", "tarbaby", "pickaninny", "golliwog",
  "cracker", "honky", "gringo", "abo", "abbo", "boong",
  // Antisemitism
  "kike", "hymie", "yid", "heeb",
  // Homophobia / transphobia
  "faggot", "fag", "faggy", "dyke", "homo", "queer", "poof", "poofter",
  "tranny", "shemale", "ladyboy", "trap",
  // Ableism
  "retard", "retarded", "tard", "spaz", "spastic", "mongoloid", "cripple",
  "midget", "gimp",
  // Nazi / hate
  "nazi", "hitler", "heil", "kkk",
  // Self-harm / violence
  "kys", "kysrf", "killyourself", "suicide",
];

// Leet / homoglyph normalization. Maps digits and symbols to plausible
// letters so "f\u00fcck", "sh1t", "@ss", "$hit" all normalize.
const LEET_MAP = {
  "0": "o", "1": "i", "2": "z", "3": "e", "4": "a", "5": "s",
  "6": "g", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "|": "i", "\u00a3": "l",
  "\u00e0": "a", "\u00e1": "a", "\u00e2": "a", "\u00e3": "a", "\u00e4": "a", "\u00e5": "a",
  "\u00e8": "e", "\u00e9": "e", "\u00ea": "e", "\u00eb": "e",
  "\u00ec": "i", "\u00ed": "i", "\u00ee": "i", "\u00ef": "i",
  "\u00f2": "o", "\u00f3": "o", "\u00f4": "o", "\u00f5": "o", "\u00f6": "o",
  "\u00f9": "u", "\u00fa": "u", "\u00fb": "u", "\u00fc": "u",
  "\u00fd": "y", "\u00ff": "y",
  "\u00e7": "c", "\u00f1": "n",
};

function normalize(str) {
  // Lowercase, apply leet map, strip non-letters. Does NOT collapse repeats;
  // repetition tolerance lives in the per-word regexes below.
  let out = "";
  for (const ch of String(str).toLowerCase()) {
    const mapped = LEET_MAP[ch] ?? ch;
    if (mapped >= "a" && mapped <= "z") out += mapped;
  }
  return out;
}

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// For each bad word, allow each letter to repeat: "fuck" -> /f+u+c+k+/.
// Short words (≤3 letters after dedupe of collapsed form) must match the
// whole normalized token — otherwise "hoe" flags "shoe", "fag" flags
// "flagon", etc. Longer words match as a substring.
const BAD_PATTERNS = (() => {
  const seen = new Set();
  const shortExact = [];
  const longSub = [];
  for (const w of BAD_WORDS) {
    const n = normalize(w);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    const src = n.split("").map((c) => esc(c) + "+").join("");
    if (n.length <= 3) shortExact.push(new RegExp("^" + src + "$"));
    else longSub.push(new RegExp(src));
  }
  return { shortExact, longSub };
})();

function normalizedIsBad(n) {
  if (!n) return false;
  if (BAD_PATTERNS.shortExact.some((r) => r.test(n))) return true;
  if (BAD_PATTERNS.longSub.some((r) => r.test(n))) return true;
  return false;
}

function tokenHasBadWord(token) {
  return normalizedIsBad(normalize(token));
}

function censorToken(token) {
  const first = token[0];
  const rest = "*".repeat(Math.max(1, token.length - 1));
  return /[A-Za-z]/.test(first) ? first + rest : "*".repeat(token.length);
}

function censorProfanity(text) {
  // Pass 1: per-token censor for normal cases.
  let out = text.replace(/\S+/g, (token) => (tokenHasBadWord(token) ? censorToken(token) : token));
  // Pass 2: catch spaced-out attempts like "f u c k" or "s h i t" by
  // normalizing the whole line and, if that contains a bad word, censoring
  // the letter-run region. Simplest and safest: if the fully-normalized
  // message is bad but pass 1 didn't already star everything, replace all
  // remaining alphabetic runs with stars.
  if (normalizedIsBad(normalize(out))) {
    out = out.replace(/[A-Za-z]+/g, (w) => censorToken(w));
  }
  return out;
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