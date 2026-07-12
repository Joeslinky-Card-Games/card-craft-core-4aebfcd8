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
  "damn", "goddamn", "hell", "crap", "piss", "pissed",
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
  // Lowercase, apply leet map, strip non-letters, collapse repeated letters.
  let out = "";
  const lower = str.toLowerCase();
  for (const ch of lower) {
    const mapped = LEET_MAP[ch] ?? ch;
    if (mapped >= "a" && mapped <= "z") out += mapped;
  }
  // Collapse runs of 3+ identical letters to 2, then any duplicate to single
  // for matching purposes ("fuuuck" -> "fuck", "asss" -> "as"). We collapse
  // fully to single to be aggressive.
  return out.replace(/(.)\1+/g, "$1");
}

// Precompute normalized bad-word roots (collapsed to unique letters too).
const BAD_NORM = Array.from(new Set(BAD_WORDS.map((w) => normalize(w)).filter(Boolean)));

function tokenHasBadWord(token) {
  const n = normalize(token);
  if (!n) return false;
  return BAD_NORM.some((bad) => n.includes(bad));
}

function messageHasBadWord(text) {
  // Catches spaced-out attempts like "f u c k" by normalizing the whole
  // message (which strips spaces entirely).
  const n = normalize(text);
  if (!n) return false;
  return BAD_NORM.some((bad) => n.includes(bad));
}

function censorProfanity(text) {
  // Censor per token so surrounding words stay readable.
  return text.replace(/\S+/g, (token) => {
    if (!tokenHasBadWord(token)) return token;
    // Keep first letter if it's a letter, star the rest.
    const first = token[0];
    if (/[A-Za-z]/.test(first)) return first + "*".repeat(Math.max(1, token.length - 1));
    return "*".repeat(token.length);
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