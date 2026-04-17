// Configuration for the HanV Anki Bot
module.exports = {
  // Maximum new cards per day per deck
  NEW_CARDS_PER_DAY: 20,
  
  // Maximum reviews per day (0 = unlimited)
  MAX_REVIEWS_PER_DAY: 200,
  
  // Initial ease factor for new cards (2.5 is Anki default)
  INITIAL_EASE_FACTOR: 2.5,
  
  // Minimum ease factor
  MIN_EASE_FACTOR: 1.3,
  
  // Learning steps in minutes (like Anki's learning steps)
  LEARNING_STEPS: [1, 10],
  
  // Graduating interval (days) - when card moves from learning to review
  GRADUATING_INTERVAL: 1,
  
  // Easy interval (days) - when user presses Easy on a learning card
  EASY_INTERVAL: 4,
  
  // Interval modifier (1.0 = default)
  INTERVAL_MODIFIER: 1.0,
  
  // Maximum interval in days
  MAX_INTERVAL: 36500,
  
  // Card states
  STATE: {
    NEW: 0,
    LEARNING: 1,
    REVIEW: 2,
    RELEARNING: 3
  },
  
  // Rating buttons
  RATING: {
    AGAIN: 1,
    HARD: 2,
    GOOD: 3,
    EASY: 4
  },
  
  // Path to vocabulary files
  VOCAB_DIR: require('path').join(__dirname, '..', 'data'),
  
  // Deck file mapping
  DECK_FILES: {
    '1A': '1A_korean_uzbek (1).txt',
    '1B': '1B_korean_uzbek.txt',
    '2A': '2A_korean_uzbek.txt'
  }
};
