require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const http = require('http');
const express = require('express');
const db = require('./database');
const srs = require('./srs');
const config = require('./config');
const { loadAllDecks } = require('./cardLoader');
const { t } = require('./i18n');

// ─── Bot Token ───
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) { console.error('❌ Set TELEGRAM_BOT_TOKEN in .env'); process.exit(1); }

const PORT = process.env.PORT || 3000;
const BOT_URL = process.env.BOT_URL;

const bot = new TelegramBot(TOKEN, { webHook: { port: PORT } });

// ─── Caches ───
const sessions = new Map();
const userLangCache = new Map();
const processedCallbacks = new Set();
const userState = new Map(); // conversation state for adding cards/decks

// ─── Init ───
function init() {
  console.log('🚀 Starting HanV Bot...');
  const allDecks = loadAllDecks();
  for (const [, cards] of Object.entries(allDecks)) db.importCards(cards);
  const decks = db.getAllDecks();
  console.log(`✅ ${decks.map(d => `${d.deck}:${d.count}`).join(' | ')} cards`);
  startNotificationScheduler();
  console.log('🤖 Bot ready!');
}

// ─── Helpers ───
function getLang(userId) {
  if (userLangCache.has(userId)) return userLangCache.get(userId);
  const u = db.getDb().prepare('SELECT language FROM users WHERE user_id = ?').get(userId);
  const lang = u ? u.language : 'uz';
  userLangCache.set(userId, lang);
  return lang;
}

function setLang(userId, lang) {
  userLangCache.set(userId, lang);
  db.getDb().prepare('UPDATE users SET language = ? WHERE user_id = ?').run(lang, userId);
}

function bar(pct, len = 12) {
  const f = Math.round((pct / 100) * len);
  return '▓'.repeat(f) + '░'.repeat(len - f);
}

function backBtn(lang) {
  return [{ text: `◀️ ${lang === 'ru' ? 'Назад' : lang === 'en' ? 'Back' : 'Orqaga'}`, callback_data: 'main' }];
}

async function edit(chatId, msgId, text, opts = {}) {
  try {
    await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...opts });
  } catch (e) {
    if (e.message && (e.message.includes('not modified') || e.message.includes('not found'))) return;
    try { await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...opts }); } catch (_) {}
  }
}

async function send(chatId, text, opts = {}) {
  return bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...opts });
}

// Card padding
const P = 'ㅤ';
const PAD = `${P}\n`;
const WIDE = `${P.repeat(15)}`;

// Parse "front-back" or "front\tback" pairs from text
function parsePairs(text) {
  const lines = text.split('\n');
  const pairs = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Try tab, then dash, then colon
    let parts = null;
    if (trimmed.includes('\t')) parts = trimmed.split('\t');
    else if (trimmed.includes('-')) { const i = trimmed.indexOf('-'); parts = [trimmed.substring(0, i), trimmed.substring(i + 1)]; }
    else if (trimmed.includes(':')) { const i = trimmed.indexOf(':'); parts = [trimmed.substring(0, i), trimmed.substring(i + 1)]; }
    if (parts && parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      pairs.push({ front: parts[0].trim(), back: parts[1].trim() });
    }
  }
  return pairs;
}

// ═══════════════════════════════════
//  COMMANDS
// ═══════════════════════════════════

bot.onText(/\/start/, (msg) => {
  userState.delete(msg.from.id);
  db.getOrCreateUser(msg.from);
  sendMainMenu(msg.chat.id, msg.from.id, null);
});

bot.onText(/\/study/, (msg) => { userState.delete(msg.from.id); startStudy(msg.chat.id, msg.from, null); });
bot.onText(/\/decks/, (msg) => { userState.delete(msg.from.id); sendDecks(msg.chat.id, msg.from.id, null); });
bot.onText(/\/stats/, (msg) => { userState.delete(msg.from.id); sendStats(msg.chat.id, msg.from.id, null); });
bot.onText(/\/settings/, (msg) => { userState.delete(msg.from.id); sendSettings(msg.chat.id, msg.from.id, null); });

bot.onText(/\/help/, (msg) => {
  userState.delete(msg.from.id);
  const lang = getLang(msg.from.id);
  send(msg.chat.id, `<b>${t(lang, 'helpTitle')}</b>\n\n${t(lang, 'helpText')}`,
    { reply_markup: { inline_keyboard: [backBtn(lang)] } });
});

bot.onText(/\/search (.+)/, (msg, match) => {
  const q = match[1].toLowerCase().trim();
  const results = db.getDb().prepare(
    `SELECT * FROM cards WHERE LOWER(front) LIKE ? OR LOWER(back) LIKE ? LIMIT 15`
  ).all(`%${q}%`, `%${q}%`);
  const lang = getLang(msg.from.id);
  if (!results.length) {
    send(msg.chat.id, `⚠️ "${q}" — not found`, { reply_markup: { inline_keyboard: [backBtn(lang)] } });
    return;
  }
  let text = `🔍 <b>"${q}"</b>\n\n`;
  for (const c of results) text += `🇰🇷 <b>${c.front}</b>  ➜  🇺🇿 ${c.back}\n`;
  send(msg.chat.id, text, { reply_markup: { inline_keyboard: [backBtn(lang)] } });
});

bot.onText(/\/cancel/, (msg) => {
  userState.delete(msg.from.id);
  const lang = getLang(msg.from.id);
  send(msg.chat.id, t(lang, 'cancelled'), { reply_markup: { inline_keyboard: [backBtn(lang)] } });
});

// ═══════════════════════════════════
//  MAIN MENU
// ═══════════════════════════════════

async function sendMainMenu(chatId, userId, msgId) {
  const lang = getLang(userId);
  const s = db.getStudyQueueSummary(userId);
  const text =
    `<b>${t(lang, 'botTitle')}</b>\n\n` +
    `${t(lang, 'newLabel')}: <b>${s.newCards}</b>   ` +
    `${t(lang, 'learnLabel')}: <b>${s.learning}</b>   ` +
    `${t(lang, 'reviewLabel')}: <b>${s.due}</b>`;
  const kb = {
    inline_keyboard: [
      [{ text: t(lang, 'studyBtn'), callback_data: 'study' }],
      [{ text: t(lang, 'decksBtn'), callback_data: 'decks' }, { text: t(lang, 'statsBtn'), callback_data: 'stats' }],
      [{ text: t(lang, 'settingsBtn'), callback_data: 'settings' }, { text: t(lang, 'helpBtn'), callback_data: 'help' }]
    ]
  };
  if (msgId) await edit(chatId, msgId, text, { reply_markup: kb });
  else await send(chatId, text, { reply_markup: kb });
}

// ═══════════════════════════════════
//  STUDY SESSION
// ═══════════════════════════════════

function startStudy(chatId, user, msgId) {
  db.getOrCreateUser(user);
  const userId = user.id;
  const lang = getLang(userId);
  const s = db.getStudyQueueSummary(userId);
  if (s.total === 0) {
    const text = `<b>${t(lang, 'allDone')}</b>\n\n${t(lang, 'allDoneMsg')}\n${t(lang, 'comeBack')}`;
    if (msgId) edit(chatId, msgId, text, { reply_markup: { inline_keyboard: [backBtn(lang)] } });
    else send(chatId, text, { reply_markup: { inline_keyboard: [backBtn(lang)] } });
    return;
  }
  const queue = [];
  const due = db.getDueCards(userId, 200);
  for (const c of due) queue.push({ cid: c.card_id, f: c.front, b: c.back, dk: c.deck, isNew: false, uc: c });
  const nc = db.getNewCards(userId, s.newCards);
  for (const c of nc) queue.push({ cid: c.card_id, f: c.front, b: c.back, dk: c.deck, isNew: true, uc: null });
  sessions.set(userId, { q: queue, i: 0, t0: Date.now(), tc: Date.now(), rev: 0 });
  showCard(chatId, userId, msgId);
}

function showCard(chatId, userId, msgId) {
  const se = sessions.get(userId);
  if (!se || se.i >= se.q.length) { finishSession(chatId, userId, msgId); return; }
  const lang = getLang(userId);
  const item = se.q[se.i];
  se.tc = Date.now();
  const left = se.q.length - se.i;
  const tag = item.isNew ? '🆕' : '🔄';
  const text =
    `${tag}  <b>${t(lang, 'deck')} ${item.dk}</b>   ${left} ${t(lang, 'remaining')}\n` +
    PAD + PAD + PAD + PAD +
    `      <b>${item.f}</b>\n` +
    PAD + PAD + PAD + PAD + `${WIDE}`;
  const kb = { inline_keyboard: [
    [{ text: t(lang, 'showAnswer'), callback_data: 'ans' }],
    [{ text: t(lang, 'skip'), callback_data: 'skip' }, { text: '◀️', callback_data: 'quit' }]
  ]};
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

function showAns(chatId, userId, msgId) {
  const se = sessions.get(userId);
  if (!se) return;
  const item = se.q[se.i];
  const pv = srs.getIntervalPreview(item.uc);
  const text =
    PAD + PAD + PAD +
    `      <b>${item.f}</b>\n` +
    PAD + PAD +
    `      <b>${item.b}</b>\n` +
    PAD + PAD + PAD + `${WIDE}`;
  const kb = { inline_keyboard: [
    [
      { text: `🔴 ${pv.AGAIN}`, callback_data: 'r:1' },
      { text: `🟠 ${pv.HARD}`, callback_data: 'r:2' },
      { text: `🟢 ${pv.GOOD}`, callback_data: 'r:3' },
      { text: `🔵 ${pv.EASY}`, callback_data: 'r:4' },
    ],
    [{ text: '◀️', callback_data: 'quit' }]
  ]};
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

function rateCard(chatId, userId, rating, msgId) {
  const se = sessions.get(userId);
  if (!se) return;
  const item = se.q[se.i];
  const secs = Math.round((Date.now() - se.tc) / 1000);
  const result = srs.scheduleCard(item.uc, rating);
  db.upsertUserCard(userId, item.cid, {
    state: result.state, ease_factor: result.ease_factor,
    interval: result.interval, repetitions: result.repetitions,
    learning_step: result.learning_step, due_date: result.due_date,
    lapses: result.lapses, is_correct: result.is_correct
  });
  db.updateDailyStats(userId, item.isNew, result.is_correct, secs);
  db.updateUserStudyTime(userId);
  if (rating === config.RATING.AGAIN) {
    se.q.push({ ...item, isNew: false, uc: {
      state: result.state, ease_factor: result.ease_factor,
      interval: result.interval, repetitions: result.repetitions,
      learning_step: result.learning_step, lapses: result.lapses
    }});
  }
  se.i++; se.rev++;
  showCard(chatId, userId, msgId);
}

function finishSession(chatId, userId, msgId) {
  const se = sessions.get(userId);
  if (!se) { sendMainMenu(chatId, userId, msgId); return; }
  const lang = getLang(userId);
  const totalSec = Math.round((Date.now() - se.t0) / 1000);
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  const stats = db.getUserStats(userId);
  const acc = stats.today.reviews_done > 0 ? Math.round((stats.today.correct_count / stats.today.reviews_done) * 100) : 0;
  let motiv = stats.streak >= 7 ? t(lang, 'motivGreat') : stats.streak >= 3 ? t(lang, 'motivGood') : t(lang, 'motivStart');
  sessions.delete(userId);
  const text =
    `<b>${t(lang, 'sessionDone')}</b>\n\n` +
    `${t(lang, 'reviewed')}:  <b>${se.rev}</b>\n` +
    `${t(lang, 'time')}:  <b>${m}m ${s}s</b>\n` +
    `${t(lang, 'accuracy')}:  <b>${acc}%</b>  ${bar(acc)}\n` +
    `${t(lang, 'streak')}:  <b>${stats.streak} ${t(lang, 'days')}</b>\n\n` + motiv;
  const kb = { inline_keyboard: [[{ text: t(lang, 'studyBtn'), callback_data: 'study' }], backBtn(lang)] };
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// ═══════════════════════════════════
//  DECKS (with management buttons)
// ═══════════════════════════════════

function sendDecks(chatId, userId, msgId) {
  const lang = getLang(userId);
  const ds = db.getDeckStats(userId);
  let text = `<b>${t(lang, 'decksTitle')}</b>\n\n`;
  for (const d of ds) {
    const icon = d.is_active ? '✅' : '⬜';
    const p = d.studied_cards || 0;
    const pct = d.total_cards > 0 ? Math.round((p / d.total_cards) * 100) : 0;
    text += `${icon}  <b>${d.deck}</b>  ${bar(pct)} ${pct}%\n`;
    text += `       ${p}/${d.total_cards} ${t(lang, 'learned')}  · ${d.mature_cards || 0} ${t(lang, 'mastered')}\n\n`;
  }
  const kb = { inline_keyboard: [
    ...ds.map(d => [{ text: `${d.is_active ? '✅' : '⬜'} ${d.deck}`, callback_data: `td:${d.deck}` }]),
    [{ text: t(lang, 'newDeckBtn'), callback_data: 'newdeck' }, { text: t(lang, 'addCardsBtn'), callback_data: 'addcards' }],
    [{ text: t(lang, 'deleteDeckBtn'), callback_data: 'deldeck' }, { text: t(lang, 'viewCards'), callback_data: 'viewdeck' }],
    backBtn(lang)
  ]};
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// ═══════════════════════════════════
//  DECK MANAGEMENT FLOWS
// ═══════════════════════════════════

// --- Create New Deck ---
function promptNewDeck(chatId, userId, msgId) {
  const lang = getLang(userId);
  userState.set(userId, { action: 'new_deck' });
  const text = `<b>${t(lang, 'newDeckBtn')}</b>\n\n${t(lang, 'enterDeckName')}`;
  const kb = { inline_keyboard: [[{ text: t(lang, 'cancel'), callback_data: 'decks' }]] };
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// --- Add Cards: Select Deck ---
function promptSelectDeckForAdd(chatId, userId, msgId) {
  const lang = getLang(userId);
  const allDecks = db.getAllDecks();
  const text = `<b>${t(lang, 'addCardsBtn')}</b>\n\n${t(lang, 'selectDeck')}`;
  const kb = { inline_keyboard: [
    ...allDecks.map(d => [{ text: `📚 ${d.deck} (${d.count})`, callback_data: `acd:${d.deck}` }]),
    [{ text: t(lang, 'cancel'), callback_data: 'decks' }]
  ]};
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// --- Add Cards: Select Method ---
function promptAddMethod(chatId, userId, deck, msgId) {
  const lang = getLang(userId);
  const text = `<b>${t(lang, 'addCardsBtn')}</b>\n\n📚 ${t(lang, 'deck')}: <b>${deck}</b>\n\n${t(lang, 'addMethod')}`;
  const kb = { inline_keyboard: [
    [{ text: t(lang, 'addOneByOne'), callback_data: `am:1:${deck}` }],
    [{ text: t(lang, 'addPasteList'), callback_data: `am:2:${deck}` }],
    [{ text: t(lang, 'addSendFile'), callback_data: `am:3:${deck}` }],
    [{ text: t(lang, 'cancel'), callback_data: 'decks' }]
  ]};
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// --- One by One: Ask Front ---
function promptCardFront(chatId, userId, deck, msgId) {
  const lang = getLang(userId);
  userState.set(userId, { action: 'add_front', deck });
  const text = `📚 <b>${deck}</b>\n\n${t(lang, 'enterFront')}`;
  const kb = { inline_keyboard: [[{ text: t(lang, 'cancel'), callback_data: 'decks' }]] };
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// --- One by One: Ask Back ---
function promptCardBack(chatId, userId, deck, front, msgId) {
  const lang = getLang(userId);
  userState.set(userId, { action: 'add_back', deck, front });
  const text = `📚 <b>${deck}</b>\n\n🇰🇷 <b>${front}</b>\n\n${t(lang, 'enterBack')}`;
  const kb = { inline_keyboard: [[{ text: t(lang, 'cancel'), callback_data: 'decks' }]] };
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// --- Paste List ---
function promptPasteList(chatId, userId, deck, msgId) {
  const lang = getLang(userId);
  userState.set(userId, { action: 'paste_list', deck });
  const text = `📚 <b>${deck}</b>\n\n${t(lang, 'pasteListHint')}`;
  const kb = { inline_keyboard: [[{ text: t(lang, 'cancel'), callback_data: 'decks' }]] };
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// --- Send File ---
function promptSendFile(chatId, userId, deck, msgId) {
  const lang = getLang(userId);
  userState.set(userId, { action: 'send_file', deck });
  const text = `📚 <b>${deck}</b>\n\n${t(lang, 'sendFileHint')}`;
  const kb = { inline_keyboard: [[{ text: t(lang, 'cancel'), callback_data: 'decks' }]] };
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// --- Delete Deck: Select ---
function promptDeleteDeck(chatId, userId, msgId) {
  const lang = getLang(userId);
  const allDecks = db.getAllDecks();
  const text = `<b>${t(lang, 'deleteDeckBtn')}</b>\n\n${t(lang, 'selectDeck')}`;
  const kb = { inline_keyboard: [
    ...allDecks.map(d => [{ text: `🗑 ${d.deck} (${d.count})`, callback_data: `dcd:${d.deck}` }]),
    [{ text: t(lang, 'cancel'), callback_data: 'decks' }]
  ]};
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// --- View Cards in Deck ---
function promptViewDeck(chatId, userId, msgId) {
  const lang = getLang(userId);
  const allDecks = db.getAllDecks();
  const text = `<b>${t(lang, 'viewCards')}</b>\n\n${t(lang, 'selectDeck')}`;
  const kb = { inline_keyboard: [
    ...allDecks.map(d => [{ text: `📚 ${d.deck} (${d.count})`, callback_data: `vd:${d.deck}:0` }]),
    [{ text: t(lang, 'cancel'), callback_data: 'decks' }]
  ]};
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

function showDeckCards(chatId, userId, deck, page, msgId) {
  const lang = getLang(userId);
  const cards = db.getCardsByDeck(deck);
  const perPage = 20;
  const totalPages = Math.ceil(cards.length / perPage);
  const start = page * perPage;
  const pageCards = cards.slice(start, start + perPage);

  let text = `<b>📚 ${deck}</b>  (${cards.length} ${t(lang, 'cards')})\n\n`;
  for (let i = 0; i < pageCards.length; i++) {
    text += `${start + i + 1}. <b>${pageCards[i].front}</b> — ${pageCards[i].back}\n`;
  }
  text += `\n📄 ${page + 1}/${totalPages}`;

  const navBtns = [];
  if (page > 0) navBtns.push({ text: '⬅️', callback_data: `vd:${deck}:${page - 1}` });
  if (page < totalPages - 1) navBtns.push({ text: '➡️', callback_data: `vd:${deck}:${page + 1}` });

  const kb = { inline_keyboard: [
    navBtns.length > 0 ? navBtns : [],
    [{ text: t(lang, 'addCardsBtn'), callback_data: `acd:${deck}` }],
    backBtn(lang)
  ].filter(r => r.length > 0) };

  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// ═══════════════════════════════════
//  STATS
// ═══════════════════════════════════

function sendStats(chatId, userId, msgId) {
  const lang = getLang(userId);
  const s = db.getUserStats(userId);
  const todayAcc = s.today.reviews_done > 0 ? Math.round((s.today.correct_count / s.today.reviews_done) * 100) : 0;
  const totalAcc = s.total_reviews > 0 ? Math.round((s.total_correct / s.total_reviews) * 100) : 0;
  const learned = s.total_cards || 0;
  const pct = s.totalAvailableCards > 0 ? Math.round((learned / s.totalAvailableCards) * 100) : 0;

  let text = `<b>${t(lang, 'statsTitle')}</b>\n\n`;
  text += `${t(lang, 'streak')}:  <b>${s.streak} ${t(lang, 'days')}</b>\n\n`;
  text += `<b>${t(lang, 'today')}:</b>\n`;
  text += `  ${t(lang, 'newCards')}: ${s.today.new_cards_studied || 0}   ${t(lang, 'reviews')}: ${s.today.reviews_done || 0}\n`;
  text += `  ${t(lang, 'correct')}: ${s.today.correct_count || 0}   ${t(lang, 'wrong')}: ${s.today.wrong_count || 0}   ${t(lang, 'accuracy')}: ${todayAcc}%\n\n`;
  text += `<b>${t(lang, 'overall')}:</b>\n`;
  text += `  ${t(lang, 'totalLearned')}: ${learned}/${s.totalAvailableCards}\n`;
  text += `  ⭐ ${t(lang, 'mastered')}: ${s.mature_cards || 0}\n`;
  text += `  ${t(lang, 'accuracy')}: ${totalAcc}%\n\n`;
  text += `<b>${t(lang, 'progress')}:</b>\n  ${bar(pct, 15)} ${pct}%`;
  if (s.last7Days.length > 0) {
    text += `\n\n<b>${t(lang, 'last7')}:</b>\n`;
    const mx = Math.max(...s.last7Days.map(d => d.reviews_done), 1);
    for (const d of s.last7Days) {
      const b = Math.round((d.reviews_done / mx) * 8);
      text += `  <code>${d.date.substring(5)}</code> ${'█'.repeat(b)}${'░'.repeat(8 - b)} ${d.reviews_done}\n`;
    }
  }
  const kb = { inline_keyboard: [backBtn(lang)] };
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// ═══════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════

function sendSettings(chatId, userId, msgId) {
  const lang = getLang(userId);
  const user = db.getOrCreateUser({ id: userId, username: '', first_name: '' });
  const langLabels = { uz: "🇺🇿 O'zbek", en: '🇬🇧 English', ru: '🇷🇺 Русский' };
  const text =
    `<b>${t(lang, 'settingsTitle')}</b>\n\n` +
    `${t(lang, 'language')}:  <b>${langLabels[lang]}</b>\n` +
    `${t(lang, 'dailyNew')}:  <b>${user.new_cards_per_day}</b>`;
  const kb = { inline_keyboard: [
    [{ text: "🇺🇿 O'zbek", callback_data: 'lang:uz' }, { text: '🇬🇧 English', callback_data: 'lang:en' }, { text: '🇷🇺 Русский', callback_data: 'lang:ru' }],
    [{ text: '5', callback_data: 'sn:5' }, { text: '10', callback_data: 'sn:10' }, { text: '15', callback_data: 'sn:15' }, { text: '20', callback_data: 'sn:20' }, { text: '30', callback_data: 'sn:30' }, { text: '50', callback_data: 'sn:50' }],
    backBtn(lang)
  ]};
  if (msgId) edit(chatId, msgId, text, { reply_markup: kb });
  else send(chatId, text, { reply_markup: kb });
}

// ═══════════════════════════════════
//  TEXT MESSAGE HANDLER (conversation state)
// ═══════════════════════════════════

bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const state = userState.get(userId);
  if (!state) return;

  const lang = getLang(userId);
  const text = msg.text.trim();

  // --- Create New Deck ---
  if (state.action === 'new_deck') {
    const deckName = text.toUpperCase().replace(/[^A-Z0-9가-힣_-]/g, '').substring(0, 20);
    if (!deckName) {
      send(chatId, `⚠️ Invalid name. Use letters/numbers only.`, { reply_markup: { inline_keyboard: [backBtn(lang)] } });
      userState.delete(userId);
      return;
    }
    const existing = db.getAllDecks().find(d => d.deck === deckName);
    if (existing) {
      send(chatId, t(lang, 'deckExists'), { reply_markup: { inline_keyboard: [backBtn(lang)] } });
      userState.delete(userId);
      return;
    }
    // Create deck by adding a placeholder (we'll remove it) — actually just activate it
    db.addSingleCard(deckName, '__placeholder__', '__placeholder__');
    db.deleteCard(db.getDb().prepare('SELECT id FROM cards WHERE deck = ? AND front = ?').get(deckName, '__placeholder__').id);
    // Actually, let's just add a real method: insert one card to create the deck, then user adds more
    // Better approach: just create it when they add the first card. For now show success.
    db.activateDeckForAllUsers(deckName);
    userState.delete(userId);
    send(chatId, t(lang, 'deckCreated', deckName), {
      reply_markup: { inline_keyboard: [
        [{ text: t(lang, 'addCardsBtn'), callback_data: `acd:${deckName}` }],
        backBtn(lang)
      ]}
    });
    return;
  }

  // --- Add Card: Front ---
  if (state.action === 'add_front') {
    userState.set(userId, { action: 'add_back', deck: state.deck, front: text });
    send(chatId, `🇰🇷 <b>${text}</b>\n\n${t(lang, 'enterBack')}`, {
      reply_markup: { inline_keyboard: [[{ text: t(lang, 'cancel'), callback_data: 'decks' }]] }
    });
    return;
  }

  // --- Add Card: Back ---
  if (state.action === 'add_back') {
    const added = db.addSingleCard(state.deck, state.front, text);
    db.activateDeckForAllUsers(state.deck);
    if (added) {
      send(chatId, `${t(lang, 'cardAdded')}\n\n🇰🇷 <b>${state.front}</b>  ➜  🇺🇿 <b>${text}</b>\n\n${t(lang, 'addMore')}`, {
        reply_markup: { inline_keyboard: [
          [{ text: t(lang, 'yes'), callback_data: `am:1:${state.deck}` }, { text: t(lang, 'no'), callback_data: 'decks' }]
        ]}
      });
    } else {
      send(chatId, t(lang, 'cardExists'), {
        reply_markup: { inline_keyboard: [
          [{ text: t(lang, 'yes'), callback_data: `am:1:${state.deck}` }, { text: t(lang, 'no'), callback_data: 'decks' }]
        ]}
      });
    }
    userState.delete(userId);
    return;
  }

  // --- Paste List ---
  if (state.action === 'paste_list') {
    const pairs = parsePairs(text);
    if (pairs.length === 0) {
      send(chatId, t(lang, 'noCardsFound'), { reply_markup: { inline_keyboard: [backBtn(lang)] } });
    } else {
      const added = db.addBulkCards(state.deck, pairs);
      db.activateDeckForAllUsers(state.deck);
      send(chatId, t(lang, 'cardsImported', added), {
        reply_markup: { inline_keyboard: [
          [{ text: t(lang, 'addCardsBtn'), callback_data: `acd:${state.deck}` }],
          backBtn(lang)
        ]}
      });
    }
    userState.delete(userId);
    return;
  }
});

// ═══════════════════════════════════
//  FILE HANDLER (for .txt upload)
// ═══════════════════════════════════

bot.on('document', async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const state = userState.get(userId);

  if (!state || state.action !== 'send_file') return;

  const lang = getLang(userId);
  const doc = msg.document;

  // Check file type
  if (!doc.file_name || !doc.file_name.endsWith('.txt')) {
    send(chatId, `⚠️ Only .txt files are supported.`, { reply_markup: { inline_keyboard: [backBtn(lang)] } });
    return;
  }

  try {
    // Download the file
    const fileLink = await bot.getFileLink(doc.file_id);
    const fileContent = await downloadFile(fileLink);
    const pairs = parsePairs(fileContent);

    if (pairs.length === 0) {
      send(chatId, t(lang, 'noCardsFound'), { reply_markup: { inline_keyboard: [backBtn(lang)] } });
    } else {
      const added = db.addBulkCards(state.deck, pairs);
      db.activateDeckForAllUsers(state.deck);
      send(chatId, t(lang, 'cardsImported', added), {
        reply_markup: { inline_keyboard: [
          [{ text: t(lang, 'addCardsBtn'), callback_data: `acd:${state.deck}` }],
          backBtn(lang)
        ]}
      });
    }
  } catch (e) {
    console.error('File download error:', e.message);
    send(chatId, `⚠️ Error reading file.`, { reply_markup: { inline_keyboard: [backBtn(lang)] } });
  }

  userState.delete(userId);
});

// Download file from URL
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ═══════════════════════════════════
//  CALLBACK HANDLER
// ═══════════════════════════════════

bot.on('callback_query', async (q) => {
  if (processedCallbacks.has(q.id)) return;
  processedCallbacks.add(q.id);
  setTimeout(() => processedCallbacks.delete(q.id), 10000);

  const chatId = q.message.chat.id;
  const msgId = q.message.message_id;
  const userId = q.from.id;
  const d = q.data;

  bot.answerCallbackQuery(q.id).catch(() => {});

  // Clear conversation state on navigation (except during add flow)
  if (['main', 'decks', 'stats', 'settings', 'study'].includes(d)) {
    userState.delete(userId);
  }

  // ── Navigation ──
  if (d === 'main') return sendMainMenu(chatId, userId, msgId);
  if (d === 'study') return startStudy(chatId, q.from, msgId);
  if (d === 'decks') { userState.delete(userId); return sendDecks(chatId, userId, msgId); }
  if (d === 'stats') return sendStats(chatId, userId, msgId);
  if (d === 'settings') return sendSettings(chatId, userId, msgId);
  if (d === 'help') {
    const lang = getLang(userId);
    return edit(chatId, msgId, `<b>${t(lang, 'helpTitle')}</b>\n\n${t(lang, 'helpText')}`,
      { reply_markup: { inline_keyboard: [backBtn(lang)] } });
  }

  // ── Study ──
  if (d === 'ans') return showAns(chatId, userId, msgId);
  if (d === 'skip') { const se = sessions.get(userId); if (se) { se.i++; showCard(chatId, userId, msgId); } return; }
  if (d.startsWith('r:')) return rateCard(chatId, userId, parseInt(d[2]), msgId);
  if (d === 'quit') return finishSession(chatId, userId, msgId);

  // ── Deck toggle ──
  if (d.startsWith('td:')) { db.toggleUserDeck(userId, d.substring(3)); return sendDecks(chatId, userId, msgId); }

  // ── Deck Management ──
  if (d === 'newdeck') return promptNewDeck(chatId, userId, msgId);
  if (d === 'addcards') return promptSelectDeckForAdd(chatId, userId, msgId);
  if (d === 'deldeck') return promptDeleteDeck(chatId, userId, msgId);
  if (d === 'viewdeck') return promptViewDeck(chatId, userId, msgId);

  // Select deck for adding cards
  if (d.startsWith('acd:')) return promptAddMethod(chatId, userId, d.substring(4), msgId);

  // Add method selection
  if (d.startsWith('am:')) {
    const parts = d.split(':');
    const method = parts[1];
    const deck = parts.slice(2).join(':');
    if (method === '1') return promptCardFront(chatId, userId, deck, msgId);
    if (method === '2') return promptPasteList(chatId, userId, deck, msgId);
    if (method === '3') return promptSendFile(chatId, userId, deck, msgId);
  }

  // Delete deck confirm
  if (d.startsWith('dcd:')) {
    const deck = d.substring(4);
    const lang = getLang(userId);
    return edit(chatId, msgId, t(lang, 'confirmDelete', deck), {
      reply_markup: { inline_keyboard: [
        [{ text: '🗑 ' + (lang === 'ru' ? 'Да' : lang === 'en' ? 'Yes' : 'Ha'), callback_data: `ddel:${deck}` },
         { text: t(lang, 'cancel'), callback_data: 'decks' }]
      ]}
    });
  }

  // Execute deck deletion
  if (d.startsWith('ddel:')) {
    const deck = d.substring(5);
    const lang = getLang(userId);
    db.deleteDeck(deck);
    edit(chatId, msgId, t(lang, 'deckDeleted', deck), {
      reply_markup: { inline_keyboard: [backBtn(lang)] }
    });
    return;
  }

  // View deck cards (paginated)
  if (d.startsWith('vd:')) {
    const parts = d.split(':');
    const deck = parts[1];
    const page = parseInt(parts[2]) || 0;
    return showDeckCards(chatId, userId, deck, page, msgId);
  }

  // ── Language ──
  if (d.startsWith('lang:')) { setLang(userId, d.substring(5)); return sendSettings(chatId, userId, msgId); }

  // ── New cards per day ──
  if (d.startsWith('sn:')) {
    db.getDb().prepare('UPDATE users SET new_cards_per_day = ? WHERE user_id = ?').run(parseInt(d.substring(3)), userId);
    return sendSettings(chatId, userId, msgId);
  }
});

// ═══════════════════════════════════
//  NOTIFICATIONS
// ═══════════════════════════════════

function startNotificationScheduler() {
  setInterval(() => {
    try {
      const users = db.getDb().prepare(`
        SELECT DISTINCT u.user_id, u.language, u.last_studied
        FROM users u
        JOIN user_cards uc ON uc.user_id = u.user_id
        WHERE uc.due_date <= datetime('now')
          AND uc.state IN (${config.STATE.REVIEW}, ${config.STATE.RELEARNING})
      `).all();
      for (const u of users) {
        if (sessions.has(u.user_id)) continue;
        if (u.last_studied && (Date.now() - new Date(u.last_studied).getTime()) / 3600000 < 2) continue;
        const summary = db.getStudyQueueSummary(u.user_id);
        if (summary.due === 0 && summary.learning === 0) continue;
        const lang = u.language || 'uz';
        bot.sendMessage(u.user_id,
          `${t(lang, 'reviewReminder')}\n${t(lang, 'cardsWaiting', summary.due + summary.learning)}`,
          { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: t(lang, 'startNow'), callback_data: 'study' }]] } }
        ).catch(() => {});
      }
    } catch (e) { console.error('Notify err:', e.message); }
  }, 15 * 60 * 1000);
}

// ─── Error handling ───
process.on('uncaughtException', (e) => console.error('Error:', e.message));
process.on('unhandledRejection', (e) => console.error('Reject:', e));
process.on('SIGINT', () => { process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });

// ─── Express Server for Webhook ───
const app = express();
app.use(express.json());

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server listening on port ${PORT}`);

  if (BOT_URL) {
    try {
      await bot.setWebHook(`${BOT_URL}/bot${TOKEN}`);
      console.log(`✅ Webhook set to ${BOT_URL}/bot${TOKEN}`);
    } catch (e) {
      console.error('❌ Failed to set webhook:', e.message);
    }
  } else {
    console.warn('⚠️ BOT_URL not set. Set it in env: BOT_URL=https://your-app-name.onrender.com');
  }

  init();
});
