const Database = require('better-sqlite3');
const path = require('path');
const config = require('./config');

const DB_PATH = path.join(__dirname, '..', 'hanv_bot.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  const d = getDb();
  
  d.exec(`
    -- Master card table (all available cards)
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck TEXT NOT NULL,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      card_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(deck, front)
    );

    -- User profiles
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      language TEXT DEFAULT 'uz',
      new_cards_per_day INTEGER DEFAULT ${config.NEW_CARDS_PER_DAY},
      created_at TEXT DEFAULT (datetime('now')),
      last_studied TEXT
    );

    -- User's card progress (SRS data per card per user)
    CREATE TABLE IF NOT EXISTS user_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_id INTEGER NOT NULL,
      state INTEGER DEFAULT ${config.STATE.NEW},
      ease_factor REAL DEFAULT ${config.INITIAL_EASE_FACTOR},
      interval INTEGER DEFAULT 0,
      repetitions INTEGER DEFAULT 0,
      learning_step INTEGER DEFAULT 0,
      due_date TEXT DEFAULT (datetime('now')),
      last_review TEXT,
      total_reviews INTEGER DEFAULT 0,
      total_correct INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (card_id) REFERENCES cards(id),
      UNIQUE(user_id, card_id)
    );

    -- Daily study statistics
    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      new_cards_studied INTEGER DEFAULT 0,
      reviews_done INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      study_time_seconds INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      UNIQUE(user_id, date)
    );

    -- User's active deck selection
    CREATE TABLE IF NOT EXISTS user_decks (
      user_id INTEGER NOT NULL,
      deck TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      PRIMARY KEY (user_id, deck),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
  `);
}

// ========== Card Management ==========

function importCards(cards) {
  const d = getDb();
  const insert = d.prepare(`
    INSERT OR IGNORE INTO cards (deck, front, back, card_order)
    VALUES (@deck, @front, @back, @order)
  `);
  
  const insertMany = d.transaction((cardList) => {
    let order = 0;
    for (const card of cardList) {
      insert.run({ deck: card.deck, front: card.front, back: card.back, order: order++ });
    }
  });
  
  insertMany(cards);
}

function getCardsByDeck(deck) {
  return getDb().prepare('SELECT * FROM cards WHERE deck = ? ORDER BY card_order').all(deck);
}

function getAllDecks() {
  return getDb().prepare('SELECT deck, COUNT(*) as count FROM cards GROUP BY deck ORDER BY deck').all();
}

function getCardById(cardId) {
  return getDb().prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
}

function getMaxCardOrder(deck) {
  const r = getDb().prepare('SELECT MAX(card_order) as mx FROM cards WHERE deck = ?').get(deck);
  return r && r.mx !== null ? r.mx + 1 : 0;
}

function addSingleCard(deck, front, back) {
  const d = getDb();
  const order = getMaxCardOrder(deck);
  const r = d.prepare(
    'INSERT OR IGNORE INTO cards (deck, front, back, card_order) VALUES (?, ?, ?, ?)'
  ).run(deck, front, back, order);
  return r.changes > 0;
}

function addBulkCards(deck, pairs) {
  const d = getDb();
  let baseOrder = getMaxCardOrder(deck);
  const insert = d.prepare(
    'INSERT OR IGNORE INTO cards (deck, front, back, card_order) VALUES (?, ?, ?, ?)'
  );
  let added = 0;
  const tx = d.transaction(() => {
    for (const { front, back } of pairs) {
      const r = insert.run(deck, front, back, baseOrder++);
      if (r.changes > 0) added++;
    }
  });
  tx();
  return added;
}

function activateDeckForAllUsers(deck) {
  const d = getDb();
  const users = d.prepare('SELECT user_id FROM users').all();
  for (const u of users) {
    d.prepare('INSERT OR IGNORE INTO user_decks (user_id, deck, is_active) VALUES (?, ?, 1)').run(u.user_id, deck);
  }
}

function deleteDeck(deck) {
  const d = getDb();
  d.transaction(() => {
    const cardIds = d.prepare('SELECT id FROM cards WHERE deck = ?').all(deck).map(c => c.id);
    if (cardIds.length > 0) {
      for (const id of cardIds) {
        d.prepare('DELETE FROM user_cards WHERE card_id = ?').run(id);
      }
    }
    d.prepare('DELETE FROM cards WHERE deck = ?').run(deck);
    d.prepare('DELETE FROM user_decks WHERE deck = ?').run(deck);
  })();
}

function deleteCard(cardId) {
  const d = getDb();
  d.prepare('DELETE FROM user_cards WHERE card_id = ?').run(cardId);
  d.prepare('DELETE FROM cards WHERE id = ?').run(cardId);
}

// ========== User Management ==========

function getOrCreateUser(telegramUser) {
  const d = getDb();
  let user = d.prepare('SELECT * FROM users WHERE user_id = ?').get(telegramUser.id);
  
  if (!user) {
    d.prepare(`
      INSERT INTO users (user_id, username, first_name)
      VALUES (?, ?, ?)
    `).run(telegramUser.id, telegramUser.username || '', telegramUser.first_name || '');
    
    // Activate all decks by default
    const decks = getAllDecks();
    for (const deck of decks) {
      d.prepare('INSERT OR IGNORE INTO user_decks (user_id, deck) VALUES (?, ?)').run(telegramUser.id, deck.deck);
    }
    
    user = d.prepare('SELECT * FROM users WHERE user_id = ?').get(telegramUser.id);
  }
  
  return user;
}

function updateUserStudyTime(userId) {
  getDb().prepare("UPDATE users SET last_studied = datetime('now') WHERE user_id = ?").run(userId);
}

function getUserDecks(userId) {
  return getDb().prepare('SELECT * FROM user_decks WHERE user_id = ?').all(userId);
}

function toggleUserDeck(userId, deck) {
  const d = getDb();
  const current = d.prepare('SELECT is_active FROM user_decks WHERE user_id = ? AND deck = ?').get(userId, deck);
  
  if (current) {
    const newState = current.is_active ? 0 : 1;
    d.prepare('UPDATE user_decks SET is_active = ? WHERE user_id = ? AND deck = ?').run(newState, userId, deck);
    return newState;
  } else {
    d.prepare('INSERT INTO user_decks (user_id, deck, is_active) VALUES (?, ?, 1)').run(userId, deck);
    return 1;
  }
}

// ========== SRS Card Progress ==========

function getUserCard(userId, cardId) {
  return getDb().prepare('SELECT * FROM user_cards WHERE user_id = ? AND card_id = ?').get(userId, cardId);
}

function upsertUserCard(userId, cardId, data) {
  const d = getDb();
  const existing = getUserCard(userId, cardId);
  
  if (existing) {
    d.prepare(`
      UPDATE user_cards SET
        state = @state,
        ease_factor = @ease_factor,
        interval = @interval,
        repetitions = @repetitions,
        learning_step = @learning_step,
        due_date = @due_date,
        last_review = datetime('now'),
        total_reviews = total_reviews + 1,
        total_correct = total_correct + @is_correct,
        lapses = @lapses
      WHERE user_id = @user_id AND card_id = @card_id
    `).run({
      ...data,
      user_id: userId,
      card_id: cardId
    });
  } else {
    d.prepare(`
      INSERT INTO user_cards (user_id, card_id, state, ease_factor, interval, repetitions, learning_step, due_date, last_review, lapses)
      VALUES (@user_id, @card_id, @state, @ease_factor, @interval, @repetitions, @learning_step, @due_date, datetime('now'), @lapses)
    `).run({
      ...data,
      user_id: userId,
      card_id: cardId
    });
  }
}

/**
 * Get cards due for review (state = REVIEW or RELEARNING, due_date <= now)
 */
function getDueCards(userId, limit = 100) {
  const d = getDb();
  return d.prepare(`
    SELECT uc.*, c.front, c.back, c.deck
    FROM user_cards uc
    JOIN cards c ON uc.card_id = c.id
    JOIN user_decks ud ON ud.user_id = uc.user_id AND ud.deck = c.deck
    WHERE uc.user_id = ?
      AND ud.is_active = 1
      AND uc.due_date <= datetime('now')
      AND uc.state IN (${config.STATE.REVIEW}, ${config.STATE.RELEARNING}, ${config.STATE.LEARNING})
    ORDER BY 
      CASE uc.state 
        WHEN ${config.STATE.RELEARNING} THEN 0
        WHEN ${config.STATE.LEARNING} THEN 1
        WHEN ${config.STATE.REVIEW} THEN 2
      END,
      uc.due_date ASC
    LIMIT ?
  `).all(userId, limit);
}

/**
 * Get new cards that haven't been studied yet
 */
function getNewCards(userId, limit = 20) {
  const d = getDb();
  
  // Get today's new card count
  const today = new Date().toISOString().split('T')[0];
  const todayStats = d.prepare('SELECT new_cards_studied FROM daily_stats WHERE user_id = ? AND date = ?').get(userId, today);
  const studiedToday = todayStats ? todayStats.new_cards_studied : 0;
  
  const user = d.prepare('SELECT new_cards_per_day FROM users WHERE user_id = ?').get(userId);
  const maxNew = user ? user.new_cards_per_day : config.NEW_CARDS_PER_DAY;
  const remaining = Math.max(0, maxNew - studiedToday);
  
  if (remaining === 0) return [];
  
  return d.prepare(`
    SELECT c.id as card_id, c.front, c.back, c.deck
    FROM cards c
    JOIN user_decks ud ON ud.user_id = ? AND ud.deck = c.deck
    WHERE ud.is_active = 1
      AND c.id NOT IN (
        SELECT card_id FROM user_cards WHERE user_id = ?
      )
    ORDER BY c.card_order
    LIMIT ?
  `).all(userId, userId, Math.min(remaining, limit));
}

/**
 * Get study queue summary for a user
 */
function getStudyQueueSummary(userId) {
  const d = getDb();
  
  const due = d.prepare(`
    SELECT COUNT(*) as count
    FROM user_cards uc
    JOIN cards c ON uc.card_id = c.id
    JOIN user_decks ud ON ud.user_id = uc.user_id AND ud.deck = c.deck
    WHERE uc.user_id = ?
      AND ud.is_active = 1
      AND uc.due_date <= datetime('now')
      AND uc.state IN (${config.STATE.REVIEW}, ${config.STATE.RELEARNING})
  `).get(userId);

  const learning = d.prepare(`
    SELECT COUNT(*) as count
    FROM user_cards uc
    JOIN cards c ON uc.card_id = c.id
    JOIN user_decks ud ON ud.user_id = uc.user_id AND ud.deck = c.deck
    WHERE uc.user_id = ?
      AND ud.is_active = 1
      AND uc.due_date <= datetime('now')
      AND uc.state = ${config.STATE.LEARNING}
  `).get(userId);
  
  const today = new Date().toISOString().split('T')[0];
  const todayStats = d.prepare('SELECT new_cards_studied FROM daily_stats WHERE user_id = ? AND date = ?').get(userId, today);
  const studiedToday = todayStats ? todayStats.new_cards_studied : 0;
  const user = d.prepare('SELECT new_cards_per_day FROM users WHERE user_id = ?').get(userId);
  const maxNew = user ? user.new_cards_per_day : config.NEW_CARDS_PER_DAY;
  
  const totalNew = d.prepare(`
    SELECT COUNT(*) as count
    FROM cards c
    JOIN user_decks ud ON ud.user_id = ? AND ud.deck = c.deck
    WHERE ud.is_active = 1
      AND c.id NOT IN (
        SELECT card_id FROM user_cards WHERE user_id = ?
      )
  `).all(userId, userId)[0];

  const newAvailable = Math.min(totalNew.count, Math.max(0, maxNew - studiedToday));
  
  return {
    newCards: newAvailable,
    totalNewRemaining: totalNew.count,
    learning: learning.count,
    due: due.count,
    total: newAvailable + learning.count + due.count
  };
}

// ========== Statistics ==========

function updateDailyStats(userId, isNew, isCorrect, studyTimeSeconds = 0) {
  const d = getDb();
  const today = new Date().toISOString().split('T')[0];
  
  d.prepare(`
    INSERT INTO daily_stats (user_id, date, new_cards_studied, reviews_done, correct_count, wrong_count, study_time_seconds)
    VALUES (?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      new_cards_studied = new_cards_studied + ?,
      reviews_done = reviews_done + 1,
      correct_count = correct_count + ?,
      wrong_count = wrong_count + ?,
      study_time_seconds = study_time_seconds + ?
  `).run(
    userId, today,
    isNew ? 1 : 0,
    isCorrect ? 1 : 0,
    isCorrect ? 0 : 1,
    studyTimeSeconds,
    isNew ? 1 : 0,
    isCorrect ? 1 : 0,
    isCorrect ? 0 : 1,
    studyTimeSeconds
  );
}

function getUserStats(userId) {
  const d = getDb();
  
  const total = d.prepare(`
    SELECT 
      COUNT(*) as total_cards,
      SUM(CASE WHEN state = ${config.STATE.REVIEW} THEN 1 ELSE 0 END) as mature_cards,
      SUM(CASE WHEN state = ${config.STATE.LEARNING} THEN 1 ELSE 0 END) as learning_cards,
      SUM(total_reviews) as total_reviews,
      SUM(total_correct) as total_correct,
      AVG(ease_factor) as avg_ease
    FROM user_cards WHERE user_id = ?
  `).get(userId);
  
  const totalCards = d.prepare(`
    SELECT COUNT(*) as count FROM cards c
    JOIN user_decks ud ON ud.user_id = ? AND ud.deck = c.deck
    WHERE ud.is_active = 1
  `).get(userId);
  
  const streak = getStudyStreak(userId);
  
  const todayStats = d.prepare(`
    SELECT * FROM daily_stats WHERE user_id = ? AND date = ?
  `).get(userId, new Date().toISOString().split('T')[0]);
  
  const last7Days = d.prepare(`
    SELECT date, reviews_done, correct_count, wrong_count, new_cards_studied
    FROM daily_stats 
    WHERE user_id = ? AND date >= date('now', '-7 days')
    ORDER BY date
  `).all(userId);
  
  return {
    ...total,
    totalAvailableCards: totalCards.count,
    streak,
    today: todayStats || { reviews_done: 0, correct_count: 0, wrong_count: 0, new_cards_studied: 0 },
    last7Days
  };
}

function getStudyStreak(userId) {
  const d = getDb();
  const days = d.prepare(`
    SELECT date FROM daily_stats 
    WHERE user_id = ? AND reviews_done > 0
    ORDER BY date DESC
  `).all(userId);
  
  if (days.length === 0) return 0;
  
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < days.length; i++) {
    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - i);
    const expected = expectedDate.toISOString().split('T')[0];
    
    if (days[i].date === expected) {
      streak++;
    } else {
      break;
    }
  }
  
  return streak;
}

function getDeckStats(userId) {
  const d = getDb();
  return d.prepare(`
    SELECT 
      c.deck,
      COUNT(DISTINCT c.id) as total_cards,
      COUNT(DISTINCT uc.card_id) as studied_cards,
      SUM(CASE WHEN uc.state = ${config.STATE.REVIEW} THEN 1 ELSE 0 END) as mature_cards,
      ud.is_active
    FROM cards c
    LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = ?
    LEFT JOIN user_decks ud ON ud.user_id = ? AND ud.deck = c.deck
    GROUP BY c.deck
    ORDER BY c.deck
  `).all(userId, userId);
}

module.exports = {
  getDb,
  importCards,
  getCardsByDeck,
  getAllDecks,
  getCardById,
  addSingleCard,
  addBulkCards,
  activateDeckForAllUsers,
  deleteDeck,
  deleteCard,
  getOrCreateUser,
  updateUserStudyTime,
  getUserDecks,
  toggleUserDeck,
  getUserCard,
  upsertUserCard,
  getDueCards,
  getNewCards,
  getStudyQueueSummary,
  updateDailyStats,
  getUserStats,
  getDeckStats
};
