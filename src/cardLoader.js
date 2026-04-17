const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * Parse an Anki-format text file into an array of card objects.
 * Format: tab-separated, with metadata lines starting with #
 */
function parseAnkiFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  let deckName = '';
  const cards = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) continue;
    
    // Parse metadata
    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/^#deck:(.+)$/);
      if (match) {
        deckName = match[1].trim();
      }
      continue;
    }
    
    // Parse card data (tab-separated: front\tback)
    const parts = trimmed.split('\t');
    if (parts.length >= 2) {
      cards.push({
        front: parts[0].trim(),   // Korean
        back: parts[1].trim(),    // Uzbek
        deck: deckName
      });
    }
  }
  
  return cards;
}

/**
 * Load all vocabulary files and return all cards grouped by deck
 */
function loadAllDecks() {
  const allCards = {};
  
  for (const [deckId, fileName] of Object.entries(config.DECK_FILES)) {
    const filePath = path.join(config.VOCAB_DIR, fileName);
    
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ File not found: ${filePath}`);
      continue;
    }
    
    const cards = parseAnkiFile(filePath);
    allCards[deckId] = cards;
    console.log(`📚 Loaded ${cards.length} cards from deck ${deckId} (${fileName})`);
  }
  
  return allCards;
}

module.exports = { parseAnkiFile, loadAllDecks };
