// Texts. The language follows the device (Russian for ru/uk/be/kk devices, English otherwise);
// the settings in the pause menu switch it and the choice is remembered.
const ru = {
  title: 'Fruit Defense',
  tagline: 'Защити фрукт от насекомых',
  loc: { garden: 'Огород', orchard: 'Сад', dunes: 'Дюны' },
  locSoon: 'Скоро',
  level: 'Уровень {n}',
  best: 'Рекорд {n}',
  wave: 'Волна {n}/{m}',
  start: 'Начать',
  callWave: 'Волна сейчас',
  menu: 'Меню',
  resume: 'Продолжить',
  restart: 'Заново',
  levels: 'Уровни',
  next: 'Дальше',
  retry: 'Ещё раз',
  settings: 'Настройки',
  sound: 'Звук',
  on: 'вкл', off: 'выкл',
  language: 'Язык',
  paused: 'Пауза',
  won: 'Фрукт цел!',
  lost: 'Фрукт съели…',
  lostHint: 'Попробуй поставить ловушки иначе: на дорожке они заставят насекомых идти в обход.',
  result: { ants: 'Насекомые', safe: 'Волны без укусов', life: 'Жизнь фрукта', balance: 'Остаток монет', unused: 'Готовые бонусы', total: 'Итого' },
  crystalsWon: '+{n} кристаллов',
  newRecord: 'Новый рекорд!',
  shop: 'Магазин',
  youHave: 'У тебя',
  buy: 'Купить',
  close: 'Закрыть',
  continueRun: 'Продолжить уровень {n}',
  upgrade: 'Улучшить',
  sell: 'Продать',
  max: 'Максимум',
  cantBlock: 'Нельзя перекрыть путь целиком',
  noCoins: 'Не хватает монет',
  tapField: 'Нажми на поле, куда бросить',
  newTrap: 'Новая ловушка!',
  newEnemy: 'Новый враг!',
  newBonus: 'Новый супер-бонус!',
  gotIt: 'Понятно',
  safeBonus: 'Без укусов +200',
  howTo: 'Тяни ловушку с кнопки на поле или нажми кнопку, а потом клетку. Насекомые всегда ищут кратчайший путь: ловушки на дорожке заставят их идти в обход, но совсем перекрыть дорогу нельзя.',
  traps: {
    spiker: ['Колючка', 'Стреляет семенами по ближайшему насекомому — и по ползающим, и по летающим.'],
    slow: ['Агава', 'Липкий сок замедляет всех ползающих вокруг.'],
    storm: ['Грозовик', 'Бьёт молнией, которая перескакивает с одного насекомого на другое. Дорогой, но мощный.'],
    thistle: ['Чертополох', 'Стреляет колючками только по летающим — зато далеко и больно.'],
    pepper: ['Перчик', 'Обжигает всех ползающих рядом, огонь ещё немного жжёт.'],
  },
  enemies: {
    ant: ['Муравей', 'Обычный муравей.'],
    redant: ['Рыжий муравей', 'Слабый, но очень быстрый.'],
    beetle: ['Жук-панцирник', 'Медленный, с крепким панцирем: мелкие уколы почти не берут.'],
    blueant: ['Синий муравей', 'Большой и ходит прямо по камням — срезает путь.'],
    caterpillar: ['Гусеница', 'Медленная, но сама залечивает раны.'],
    centipede: ['Многоножка', 'Огромная и живучая. Кусает сильно.'],
    mosquito: ['Комар', 'Летит прямо к фрукту, над дорожками и камнями.'],
    wasp: ['Оса', 'Летает быстро, нужен чертополох.'],
    goldbug: ['Бронзовка', 'Летающий жук в панцире.'],
  },
  bonuses: {
    spray: ['Дихлофос', 'Ядовитое облако там, куда нажмёшь.'],
    cracker: ['Хлопушка', 'Взрыв в выбранном месте.'],
    honey: ['Мёд', 'Липкая лужа: ползающие в ней почти стоят.'],
    horn: ['Свисток', 'Все насекомые замирают на несколько секунд.'],
    bolt: ['Молния', 'Бьёт по самым крепким насекомым на поле.'],
  },
  shopItems: {
    freeze: ['Заморозка', 'Насекомые и волны замирают на 30 секунд'],
    shield: ['Щит', 'Фрукт неуязвим 30 секунд'],
    armageddon: ['Армагеддон', 'Все насекомые на поле погибают'],
    exchange: ['Обмен', '+30 монет'],
  },
  bonusCharging: 'Заряжается',
  aimHint: 'Нажми на поле',
};

const en = {
  title: 'Fruit Defense',
  tagline: 'Protect the fruit from the bugs',
  loc: { garden: 'Vegetable patch', orchard: 'Orchard', dunes: 'Dunes' },
  locSoon: 'Soon',
  level: 'Level {n}',
  best: 'Best {n}',
  wave: 'Wave {n}/{m}',
  start: 'Start',
  callWave: 'Wave now',
  menu: 'Menu',
  resume: 'Resume',
  restart: 'Restart',
  levels: 'Levels',
  next: 'Next',
  retry: 'Try again',
  settings: 'Settings',
  sound: 'Sound',
  on: 'on', off: 'off',
  language: 'Language',
  paused: 'Paused',
  won: 'The fruit is safe!',
  lost: 'The fruit got eaten…',
  lostHint: 'Try other spots: traps on the trail make the bugs take the long way round.',
  result: { ants: 'Bugs', safe: 'Waves without bites', life: 'Fruit life', balance: 'Coins left', unused: 'Ready bonuses', total: 'Total' },
  crystalsWon: '+{n} crystals',
  newRecord: 'New record!',
  shop: 'Shop',
  youHave: 'You have',
  buy: 'Buy',
  close: 'Close',
  continueRun: 'Continue level {n}',
  upgrade: 'Upgrade',
  sell: 'Sell',
  max: 'Max',
  cantBlock: 'You can’t block the way completely',
  noCoins: 'Not enough coins',
  tapField: 'Tap the field to drop it',
  newTrap: 'New trap!',
  newEnemy: 'New enemy!',
  newBonus: 'New super bonus!',
  gotIt: 'Got it',
  safeBonus: 'No bites +200',
  howTo: 'Drag a trap from its button onto the field, or tap the button and then a spot. Bugs always look for the shortest way: traps on the trail send them round, but you can’t block the way completely.',
  traps: {
    spiker: ['Spiker', 'Shoots seeds at the nearest bug, crawling or flying.'],
    slow: ['Agave', 'Sticky sap slows down every crawling bug around.'],
    storm: ['Storm dome', 'Lightning that jumps from bug to bug. Pricey but strong.'],
    thistle: ['Thistle', 'Shoots thorns at flying bugs only — far and hard.'],
    pepper: ['Pepper', 'Burns every crawling bug next to it; the fire keeps burning a little.'],
  },
  enemies: {
    ant: ['Ant', 'An ordinary ant.'],
    redant: ['Fire ant', 'Weak but very fast.'],
    beetle: ['Shell beetle', 'Slow, with a hard shell: small hits barely work.'],
    blueant: ['Blue ant', 'Big, and walks right over stones — takes shortcuts.'],
    caterpillar: ['Caterpillar', 'Slow, but heals itself.'],
    centipede: ['Centipede', 'Huge and tough. Bites hard.'],
    mosquito: ['Mosquito', 'Flies straight to the fruit, over trails and stones.'],
    wasp: ['Wasp', 'Fast flyer — you need thistles.'],
    goldbug: ['Rose chafer', 'A flying beetle with a shell.'],
  },
  bonuses: {
    spray: ['Bug spray', 'A poison cloud where you tap.'],
    cracker: ['Firecracker', 'A blast at the chosen spot.'],
    honey: ['Honey', 'A sticky puddle: crawlers in it barely move.'],
    horn: ['Whistle', 'All bugs freeze for a few seconds.'],
    bolt: ['Lightning', 'Strikes the toughest bugs on the field.'],
  },
  shopItems: {
    freeze: ['Freeze', 'Bugs and waves stop for 30 seconds'],
    shield: ['Shield', 'The fruit can’t be bitten for 30 seconds'],
    armageddon: ['Armageddon', 'Every bug on the field dies'],
    exchange: ['Exchange', '+30 coins'],
  },
  bonusCharging: 'Charging',
  aimHint: 'Tap the field',
};

export const LANGS = { ru, en };
let lang = 'en';

export function pickLang(saved) {
  if (saved && LANGS[saved]) return (lang = saved);
  const list = navigator.languages || [navigator.language || 'en'];
  for (const l of list) {
    const k = l.slice(0, 2).toLowerCase();
    if (['ru', 'uk', 'be', 'kk'].includes(k)) return (lang = 'ru');
    if (LANGS[k]) return (lang = k);
  }
  return (lang = 'en');
}
export const getLang = () => lang;

export function t(path, vars) {
  let v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), LANGS[lang]);
  if (v == null) v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), en);
  if (typeof v === 'string' && vars) v = v.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  return v;
}
