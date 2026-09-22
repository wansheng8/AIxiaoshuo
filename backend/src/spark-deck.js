const fs = require("fs");
const path = require("path");
const { ROOT } = require("./store");

const DECK_FILE = path.join(ROOT, "shared", "spark-deck.json");
const CHANNELS = ["male", "female", "common"];

function validCard(card) {
  if (!card || typeof card !== "object") return false;
  if (!CHANNELS.includes(card.channel)) return false;
  if (!["hook", "conflict", "edge"].every((key) => String(card[key] || "").trim())) return false;
  return Array.isArray(card.details) && card.details.some((item) => String(item || "").trim());
}

function loadDeck() {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(DECK_FILE, "utf8"));
  } catch (err) {
    throw new Error(`[moshu] 无法读取脑洞卡库 ${DECK_FILE}：${err.message}`);
  }
  return (Array.isArray(json.cards) ? json.cards : []).filter(validCard);
}

const CARDS = loadDeck();

function deckCards(channel) {
  if (channel === "common") return CARDS.filter((card) => card.channel === "common");
  return CARDS.filter((card) => card.channel === channel || card.channel === "common");
}

function exampleLine(card) {
  return JSON.stringify({
    hook: card.hook,
    conflict: card.conflict,
    edge: card.edge,
    details: card.details.slice(0, 4),
    tags: Array.isArray(card.tags) ? card.tags.slice(0, 3) : [],
  });
}

function examplesFor(channel, count = 2) {
  const want = Number.isFinite(count) && count > 0 ? Math.floor(count) : 2;
  const own = CHANNELS.includes(channel) && channel !== "common" ? CARDS.filter((card) => card.channel === channel) : [];
  const common = CARDS.filter((card) => card.channel === "common");
  const picked = [];
  for (const card of own.concat(common)) {
    if (picked.length >= want) break;
    if (picked.includes(card)) continue;
    picked.push(card);
  }
  return picked;
}

module.exports = { DECK_FILE, CHANNELS, loadDeck, deckCards, examplesFor };
