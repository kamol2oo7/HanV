/**
 * Internationalization — 3 languages: Uzbek, English, Russian
 */

const translations = {
  uz: {
    welcome: (name) => `Salom, ${name}! 👋`,
    botTitle: '🇰🇷 HanV — So\'zlar',
    studyBtn: '🧠  O\'rganish',
    decksBtn: '📚  Deklar',
    statsBtn: '📊  Statistika',
    settingsBtn: '⚙️  Sozlamalar',
    helpBtn: '❓  Yordam',

    // Study
    newLabel: '🆕 Yangi',
    learnLabel: '📖 O\'rganish',
    reviewLabel: '🔄 Takrorlash',
    remaining: 'qoldi',
    showAnswer: '👁  Javobni ko\'rish',
    skip: '⏭',
    deck: 'Dek',

    // Session
    sessionStart: '🧠 Sessiya boshlandi',
    sessionTotal: 'ta kartochka',
    sessionDone: '✅ Sessiya tugadi!',
    cards: 'Kartochka',
    time: 'Vaqt',
    streak: '🔥 Streak',
    days: 'kun',
    accuracy: 'Aniqlik',
    reviewed: 'Takrorlandi',

    // All done
    allDone: '🏆 Hammasi tayyor!',
    allDoneMsg: 'Bugungi barcha kartochkalar takrorlangan.',
    comeBack: 'Ertaga yangi kartochkalar kutmoqda!',

    // Decks
    decksTitle: '📚 Deklar',
    learned: 'o\'rganilgan',
    mastered: 'o\'zlashtirilgan',
    tapToToggle: 'Yoqish/o\'chirish uchun bosing',

    // Stats
    statsTitle: '📊 Statistika',
    today: 'Bugun',
    overall: 'Umumiy',
    newCards: 'Yangi',
    reviews: 'Takrorlar',
    correct: 'To\'g\'ri',
    wrong: 'Noto\'g\'ri',
    totalLearned: 'O\'rganilgan',
    progress: 'Progress',
    last7: 'Oxirgi 7 kun',

    // Settings
    settingsTitle: '⚙️ Sozlamalar',
    language: '🌐 Til',
    dailyNew: '🆕 Kunlik yangi kartochkalar',
    saved: '✅ Saqlandi',

    // Notifications
    reviewReminder: '⏰ Takrorlash vaqti keldi!',
    cardsWaiting: (n) => `${n} ta kartochka kutmoqda`,
    startNow: '🧠 Boshlash',

    // Help
    helpTitle: '❓ Yordam',
    helpText: `Bot koreyscha-o'zbekcha so'zlarni spaced repetition (SM-2) texnikasi bilan o'rgatadi.\n\n` +
      `1. So'z ko'rsatiladi (koreyscha)\n` +
      `2. Javobni ochib ko'ring\n` +
      `3. Bilimingizni baholang:\n` +
      `   🔴 — Bilmadim\n` +
      `   🟠 — Qiyin edi\n` +
      `   🟢 — To'g'ri\n` +
      `   🔵 — Juda oson\n\n` +
      `Bot sizning javoblaringizga qarab optimal takrorlash vaqtini belgilaydi.`,

    // Deck management
    newDeckBtn: '➕ Yangi dek',
    addCardsBtn: '➕ Kartochka qo\'shish',
    deleteDeckBtn: '🗑 Dekni o\'chirish',
    enterDeckName: 'Yangi dek nomini yozing:',
    deckCreated: (name) => `✅ "${name}" dek yaratildi!`,
    deckExists: 'Bu nomli dek allaqachon mavjud.',
    selectDeck: 'Dekni tanlang:',
    addMethod: 'Qanday qo\'shmoqchisiz?',
    addOneByOne: '✏️ Bittadan',
    addPasteList: '📋 Ro\'yxat',
    addSendFile: '📎 Fayl yuborish',
    enterFront: '🇰🇷 Koreyscha so\'zni yozing:',
    enterBack: '🇺🇿 Tarjimasini yozing:',
    cardAdded: '✅ Kartochka qo\'shildi!',
    cardExists: '⚠️ Bu kartochka allaqachon mavjud.',
    addMore: 'Yana qo\'shasizmi?',
    yes: '✅ Ha',
    no: '❌ Yo\'q',
    pasteListHint: 'Ro\'yxatni yozing (har bir qator: so\'z-tarjima):\n\nMasalan:\n나라-davlat\n사람-odam\n학교-maktab',
    sendFileHint: '📎 .txt faylni yuboring\n\nFormat: har bir qator so\'z-tarjima yoki so\'z\ttarjima',
    cardsImported: (n) => `✅ ${n} ta kartochka qo\'shildi!`,
    noCardsFound: '⚠️ Kartochka topilmadi. Formatni tekshiring.',
    confirmDelete: (name) => `⚠️ "${name}" dekini o\'chirmoqchimisiz? Bu qaytarib bo\'lmaydi!`,
    deckDeleted: (name) => `🗑 "${name}" deki o\'chirildi.`,
    cancel: '❌ Bekor qilish',
    cancelled: 'Bekor qilindi.',
    viewCards: '👁 Kartochkalarni ko\'rish',

    // Motivational
    motivGreat: '🔥 Ajoyib natija!',
    motivGood: '💪 Davom eting!',
    motivStart: '✨ Yaxshi boshlanish!',
  },

  en: {
    welcome: (name) => `Hello, ${name}! 👋`,
    botTitle: '🇰🇷 HanV — Vocabulary',
    studyBtn: '🧠  Study',
    decksBtn: '📚  Decks',
    statsBtn: '📊  Stats',
    settingsBtn: '⚙️  Settings',
    helpBtn: '❓  Help',

    newLabel: '🆕 New',
    learnLabel: '📖 Learning',
    reviewLabel: '🔄 Review',
    remaining: 'left',
    showAnswer: '👁  Show Answer',
    skip: '⏭',
    deck: 'Deck',

    sessionStart: '🧠 Session started',
    sessionTotal: 'cards',
    sessionDone: '✅ Session complete!',
    cards: 'Cards',
    time: 'Time',
    streak: '🔥 Streak',
    days: 'days',
    accuracy: 'Accuracy',
    reviewed: 'Reviewed',

    allDone: '🏆 All done!',
    allDoneMsg: 'All cards reviewed for today.',
    comeBack: 'New cards are waiting tomorrow!',

    decksTitle: '📚 Decks',
    learned: 'learned',
    mastered: 'mastered',
    tapToToggle: 'Tap to enable/disable',

    statsTitle: '📊 Statistics',
    today: 'Today',
    overall: 'Overall',
    newCards: 'New',
    reviews: 'Reviews',
    correct: 'Correct',
    wrong: 'Wrong',
    totalLearned: 'Learned',
    progress: 'Progress',
    last7: 'Last 7 days',

    settingsTitle: '⚙️ Settings',
    language: '🌐 Language',
    dailyNew: '🆕 Daily new cards',
    saved: '✅ Saved',

    reviewReminder: '⏰ Time to review!',
    cardsWaiting: (n) => `${n} cards are waiting`,
    startNow: '🧠 Start',

    helpTitle: '❓ Help',
    helpText: `This bot teaches Korean-Uzbek vocabulary using spaced repetition (SM-2).\n\n` +
      `1. A Korean word is shown\n` +
      `2. Tap to reveal the answer\n` +
      `3. Rate your knowledge:\n` +
      `   🔴 — Didn't know\n` +
      `   🟠 — Hard\n` +
      `   🟢 — Good\n` +
      `   🔵 — Easy\n\n` +
      `The bot schedules optimal review times based on your answers.`,

    // Deck management
    newDeckBtn: '➕ New deck',
    addCardsBtn: '➕ Add cards',
    deleteDeckBtn: '🗑 Delete deck',
    enterDeckName: 'Enter new deck name:',
    deckCreated: (name) => `✅ Deck "${name}" created!`,
    deckExists: 'A deck with this name already exists.',
    selectDeck: 'Select a deck:',
    addMethod: 'How would you like to add?',
    addOneByOne: '✏️ One by one',
    addPasteList: '📋 Paste list',
    addSendFile: '📎 Send file',
    enterFront: '🇰🇷 Enter Korean word:',
    enterBack: '🇺🇿 Enter translation:',
    cardAdded: '✅ Card added!',
    cardExists: '⚠️ This card already exists.',
    addMore: 'Add more?',
    yes: '✅ Yes',
    no: '❌ No',
    pasteListHint: 'Type the list (one per line: word-translation):\n\nExample:\n나라-davlat\n사람-odam\n학교-maktab',
    sendFileHint: '📎 Send a .txt file\n\nFormat: word-translation or word\ttranslation per line',
    cardsImported: (n) => `✅ ${n} cards added!`,
    noCardsFound: '⚠️ No cards found. Check the format.',
    confirmDelete: (name) => `⚠️ Delete deck "${name}"? This cannot be undone!`,
    deckDeleted: (name) => `🗑 Deck "${name}" deleted.`,
    cancel: '❌ Cancel',
    cancelled: 'Cancelled.',
    viewCards: '👁 View cards',

    motivGreat: '🔥 Amazing streak!',
    motivGood: '💪 Keep going!',
    motivStart: '✨ Good start!',
  },

  ru: {
    welcome: (name) => `Привет, ${name}! 👋`,
    botTitle: '🇰🇷 HanV — слова',
    studyBtn: '🧠  Учить',
    decksBtn: '📚  Колоды',
    statsBtn: '📊  Статистика',
    settingsBtn: '⚙️  Настройки',
    helpBtn: '❓  Помощь',

    newLabel: '🆕 Новые',
    learnLabel: '📖 Изучение',
    reviewLabel: '🔄 Повтор',
    remaining: 'осталось',
    showAnswer: '👁  Показать ответ',
    skip: '⏭',
    deck: 'Колода',

    sessionStart: '🧠 Сессия началась',
    sessionTotal: 'карточек',
    sessionDone: '✅ Сессия завершена!',
    cards: 'Карточки',
    time: 'Время',
    streak: '🔥 Серия',
    days: 'дн.',
    accuracy: 'Точность',
    reviewed: 'Повторено',

    allDone: '🏆 Всё готово!',
    allDoneMsg: 'Все карточки на сегодня повторены.',
    comeBack: 'Завтра будут новые карточки!',

    decksTitle: '📚 Колоды',
    learned: 'изучено',
    mastered: 'освоено',
    tapToToggle: 'Нажмите для вкл/выкл',

    statsTitle: '📊 Статистика',
    today: 'Сегодня',
    overall: 'Всего',
    newCards: 'Новые',
    reviews: 'Повторы',
    correct: 'Верно',
    wrong: 'Неверно',
    totalLearned: 'Изучено',
    progress: 'Прогресс',
    last7: 'Последние 7 дней',

    settingsTitle: '⚙️ Настройки',
    language: '🌐 Язык',
    dailyNew: '🆕 Новых карточек в день',
    saved: '✅ Сохранено',

    reviewReminder: '⏰ Пора повторять!',
    cardsWaiting: (n) => `${n} карточек ждут`,
    startNow: '🧠 Начать',

    helpTitle: '❓ Помощь',
    helpText: `Бот обучает корейско-узбекской лексике методом интервального повторения (SM-2).\n\n` +
      `1. Показывается корейское слово\n` +
      `2. Нажмите, чтобы увидеть ответ\n` +
      `3. Оцените свои знания:\n` +
      `   🔴 — Не знал\n` +
      `   🟠 — Трудно\n` +
      `   🟢 — Хорошо\n` +
      `   🔵 — Легко\n\n` +
      `Бот рассчитывает оптимальное время повторения на основе ваших ответов.`,

    // Deck management
    newDeckBtn: '➕ Новая колода',
    addCardsBtn: '➕ Добавить карточки',
    deleteDeckBtn: '🗑 Удалить колоду',
    enterDeckName: 'Введите название новой колоды:',
    deckCreated: (name) => `✅ Колода "${name}" создана!`,
    deckExists: 'Колода с таким названием уже существует.',
    selectDeck: 'Выберите колоду:',
    addMethod: 'Как вы хотите добавить?',
    addOneByOne: '✏️ По одной',
    addPasteList: '📋 Вставить список',
    addSendFile: '📎 Отправить файл',
    enterFront: '🇰🇷 Введите корейское слово:',
    enterBack: '🇺🇿 Введите перевод:',
    cardAdded: '✅ Карточка добавлена!',
    cardExists: '⚠️ Такая карточка уже существует.',
    addMore: 'Добавить ещё?',
    yes: '✅ Да',
    no: '❌ Нет',
    pasteListHint: 'Введите список (по одной паре в строке: слово-перевод):\n\nПример:\n나라-davlat\n사람-odam\n학교-maktab',
    sendFileHint: '📎 Отправьте .txt файл\n\nФормат: слово-перевод или слово\tперевод в каждой строке',
    cardsImported: (n) => `✅ ${n} карточек добавлено!`,
    noCardsFound: '⚠️ Карточки не найдены. Проверьте формат.',
    confirmDelete: (name) => `⚠️ Удалить колоду "${name}"? Это нельзя отменить!`,
    deckDeleted: (name) => `🗑 Колода "${name}" удалена.`,
    cancel: '❌ Отмена',
    cancelled: 'Отменено.',
    viewCards: '👁 Просмотр карточек',

    motivGreat: '🔥 Потрясающая серия!',
    motivGood: '💪 Продолжайте!',
    motivStart: '✨ Хорошее начало!',
  }
};

function t(lang, key, ...args) {
  const l = translations[lang] || translations.uz;
  const val = l[key];
  if (typeof val === 'function') return val(...args);
  return val || key;
}

module.exports = { t, translations };
