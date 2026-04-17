const config = require('./config');

/**
 * SM-2 Spaced Repetition Algorithm (as used in Anki)
 * 
 * Card States:
 * - NEW (0): Never seen before
 * - LEARNING (1): Currently in learning steps
 * - REVIEW (2): Graduated to review queue
 * - RELEARNING (3): Lapsed and back in learning
 * 
 * Ratings:
 * - AGAIN (1): Complete failure, reset
 * - HARD (2): Correct but with difficulty
 * - GOOD (3): Correct with moderate effort
 * - EASY (4): Correct with no effort
 */

/**
 * Calculate the next review parameters based on the current state and rating.
 * Returns: { state, ease_factor, interval, repetitions, learning_step, due_date, lapses, is_correct }
 */
function scheduleCard(currentCard, rating) {
  const state = currentCard ? currentCard.state : config.STATE.NEW;
  const easeFactor = currentCard ? currentCard.ease_factor : config.INITIAL_EASE_FACTOR;
  const interval = currentCard ? currentCard.interval : 0;
  const repetitions = currentCard ? currentCard.repetitions : 0;
  const learningStep = currentCard ? currentCard.learning_step : 0;
  const lapses = currentCard ? (currentCard.lapses || 0) : 0;

  let result = {
    state,
    ease_factor: easeFactor,
    interval,
    repetitions,
    learning_step: learningStep,
    lapses,
    is_correct: rating >= config.RATING.GOOD ? 1 : 0,
    due_date: null
  };

  switch (state) {
    case config.STATE.NEW:
    case config.STATE.LEARNING:
      result = handleLearningCard(result, rating, state === config.STATE.NEW);
      break;
    case config.STATE.REVIEW:
      result = handleReviewCard(result, rating);
      break;
    case config.STATE.RELEARNING:
      result = handleRelearningCard(result, rating);
      break;
  }

  // Ensure ease factor doesn't go below minimum
  result.ease_factor = Math.max(config.MIN_EASE_FACTOR, result.ease_factor);
  
  // Ensure interval doesn't exceed maximum
  result.interval = Math.min(config.MAX_INTERVAL, result.interval);

  // Calculate due date
  result.due_date = calculateDueDate(result.state, result.interval, result.learning_step);

  return result;
}

/**
 * Handle a card in the LEARNING or NEW state
 */
function handleLearningCard(result, rating, isNew) {
  switch (rating) {
    case config.RATING.AGAIN:
      // Reset to first learning step
      result.learning_step = 0;
      result.state = config.STATE.LEARNING;
      result.is_correct = 0;
      break;
      
    case config.RATING.HARD:
      // Stay on current step (repeat)
      result.state = config.STATE.LEARNING;
      result.is_correct = 0;
      break;
      
    case config.RATING.GOOD:
      // Advance to next learning step
      if (result.learning_step + 1 >= config.LEARNING_STEPS.length) {
        // Graduate the card
        result.state = config.STATE.REVIEW;
        result.interval = config.GRADUATING_INTERVAL;
        result.repetitions = 1;
      } else {
        result.learning_step++;
        result.state = config.STATE.LEARNING;
      }
      result.is_correct = 1;
      break;
      
    case config.RATING.EASY:
      // Immediately graduate with easy interval
      result.state = config.STATE.REVIEW;
      result.interval = config.EASY_INTERVAL;
      result.repetitions = 1;
      result.ease_factor += 0.15;
      result.is_correct = 1;
      break;
  }
  
  return result;
}

/**
 * Handle a card in the REVIEW state (SM-2 algorithm core)
 */
function handleReviewCard(result, rating) {
  switch (rating) {
    case config.RATING.AGAIN:
      // Card lapsed - send to relearning
      result.state = config.STATE.RELEARNING;
      result.learning_step = 0;
      result.lapses++;
      result.ease_factor -= 0.20;
      // New interval is 10% of old interval, minimum 1 day
      result.interval = Math.max(1, Math.round(result.interval * 0.1));
      result.is_correct = 0;
      break;
      
    case config.RATING.HARD:
      // Increase interval but less than normal
      result.ease_factor -= 0.15;
      result.interval = Math.max(1, Math.round(result.interval * 1.2));
      result.repetitions++;
      result.is_correct = 0;
      break;
      
    case config.RATING.GOOD:
      // Normal interval increase
      result.interval = Math.max(
        result.interval + 1,
        Math.round(result.interval * result.ease_factor * config.INTERVAL_MODIFIER)
      );
      result.repetitions++;
      result.is_correct = 1;
      break;
      
    case config.RATING.EASY:
      // Large interval increase
      result.ease_factor += 0.15;
      result.interval = Math.max(
        result.interval + 1,
        Math.round(result.interval * result.ease_factor * config.INTERVAL_MODIFIER * 1.3)
      );
      result.repetitions++;
      result.is_correct = 1;
      break;
  }
  
  return result;
}

/**
 * Handle a card in the RELEARNING state (lapsed card)
 */
function handleRelearningCard(result, rating) {
  switch (rating) {
    case config.RATING.AGAIN:
      result.learning_step = 0;
      result.is_correct = 0;
      break;
      
    case config.RATING.HARD:
      result.is_correct = 0;
      break;
      
    case config.RATING.GOOD:
      // Graduate back to review
      if (result.learning_step + 1 >= config.LEARNING_STEPS.length) {
        result.state = config.STATE.REVIEW;
        // Keep the lapsed interval
      } else {
        result.learning_step++;
      }
      result.is_correct = 1;
      break;
      
    case config.RATING.EASY:
      // Immediately back to review with bonus
      result.state = config.STATE.REVIEW;
      result.interval = Math.max(result.interval, config.EASY_INTERVAL);
      result.ease_factor += 0.15;
      result.is_correct = 1;
      break;
  }
  
  return result;
}

/**
 * Calculate the due date based on state, interval, and learning step
 */
function calculateDueDate(state, interval, learningStep) {
  const now = new Date();
  
  if (state === config.STATE.LEARNING || state === config.STATE.RELEARNING) {
    // Learning cards use minute-based steps
    const stepMinutes = config.LEARNING_STEPS[learningStep] || config.LEARNING_STEPS[0];
    now.setMinutes(now.getMinutes() + stepMinutes);
  } else {
    // Review cards use day-based intervals
    now.setDate(now.getDate() + interval);
  }
  
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Get a human-readable description of the next interval for each rating
 */
function getIntervalPreview(currentCard) {
  const previews = {};
  
  for (const [name, rating] of Object.entries(config.RATING)) {
    const result = scheduleCard(currentCard, rating);
    previews[name] = formatInterval(result.state, result.interval, result.learning_step);
  }
  
  return previews;
}

/**
 * Format interval to human-readable string
 */
function formatInterval(state, interval, learningStep) {
  if (state === config.STATE.LEARNING || state === config.STATE.RELEARNING) {
    const minutes = config.LEARNING_STEPS[learningStep] || config.LEARNING_STEPS[0];
    if (minutes < 60) return `${minutes}m`;
    return `${Math.round(minutes / 60)}h`;
  }
  
  if (interval < 1) return '<1d';
  if (interval === 1) return '1d';
  if (interval < 30) return `${interval}d`;
  if (interval < 365) return `${(interval / 30).toFixed(1)}mo`;
  return `${(interval / 365).toFixed(1)}y`;
}

module.exports = {
  scheduleCard,
  getIntervalPreview,
  formatInterval
};
