// The site's wording in Russian and Tajik. The language is picked with the switch in the header and
// remembered in the browser (or ?lang=ru|tj).
// BRAND: the house's name, its line under the name and the address (same for both languages where
// it is a name).
const KEY = 'khocha.lang';

export const BRAND = {
  ru: { name: 'Хоча сохтмон', sub: 'ЧДММ «Хоча сохтмон»', logo: 'Х' },
  tj: { name: 'Хоча сохтмон', sub: 'ЧДММ «Хоча сохтмон»', logo: 'Х' },
};

const RU = {
  brand: BRAND.ru.name,
  brandSub: BRAND.ru.sub,
  loading: 'Загрузка 3D-модели…',
  loadFailed: 'Не удалось загрузить 3D-модель. Проверьте подключение и обновите страницу.',
  noglTitle: 'В этом браузере 3D-просмотр не работает.',
  noglWhy: 'Нужен WebGL 2, а здесь он отключён или не поддерживается.',
  noglHelp: 'Откройте страницу в свежей версии Chrome, Safari, Edge или Firefox или включите аппаратное ускорение в настройках браузера.',
  contextLost: 'Видеокарта остановила 3D-просмотр (не хватило памяти или вкладка долго была в фоне).',
  quality: (high) => (high ? 'Графика: высокая' : 'Графика: лёгкая'),
  qualityTitle: (high) => (high ? 'Переключить на лёгкий режим (быстрее на телефонах и старых компьютерах)' : 'Включить полное качество'),
  complex: 'Весь дом',
  floors: 'Этажи',
  floor: 'Этаж',
  floorN: (n) => `${n} этаж`,
  floorOf: (n, m) => `${n} из ${m}`,
  shops: 'Магазины',
  shopsFloors: '1–2 этажи: магазины',
  flats: (n) => `${n} ${plural(n, 'квартира', 'квартиры', 'квартир')}`,
  flatsOnFloor: (n) => `${n} ${plural(n, 'квартира', 'квартиры', 'квартир')} на этаже`,
  floorsN: (n) => `${n} ${plural(n, 'этаж', 'этажа', 'этажей')}`,
  roomsN: (n) => `${n}-комнатная`,
  roomsShort: (n) => `${n}-комн.`,
  all: 'Все',
  rooms: 'Комнаты',
  chooseTitle: 'Выберите квартиру',
  chooseSub: (floors, r0, r1) => `${floors} · квартиры ${r0 === r1 ? `${r0}-комнатные` : `от ${r0} до ${r1} комнат`}`,
  chooseNote: 'Наведите на этаж и нажмите — этаж откроется в разрезе с мебелью. Выберите квартиру, чтобы увидеть планировку и прогуляться по ней в 3D.',
  stat1: 'квартир',
  stat2: 'м² — площади',
  stat3: 'этажей',
  floorNote: 'Нажмите на квартиру на модели или в этом списке.',
  flat: (n) => `Квартира № ${n}`,
  back: '← Назад',
  backTo: (s) => `← ${s}`,
  area: 'Общая площадь',
  ceiling: 'Высота потолков',
  layout: 'Планировка',
  windows: 'Окна выходят',
  walk: '🚶 Прогулка по квартире в 3D',
  contact: 'Связаться с отделом продаж',
  planZoom: 'Открыть планировку крупно',
  close: 'Закрыть',
  contactToast: 'Контакты отдела продаж появятся здесь. Пока — по телефону застройщика.',
  exitWalk: '✕ Вернуться к зданию',
  hintOverview: 'Нажмите на этаж · Перетащите — поворот · Колесо — масштаб',
  hintFloor: 'Нажмите на квартиру · Перетащите — поворот · Колесо — масштаб',
  walkHelp: 'Перетащите — осмотреться · Нажмите на пол — перейти туда · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / стрелки — движение',
  tipFloor: (n, m) => `<b>${n} этаж</b><br>${m}`,
  tipShops: '<b>1–2 этажи</b><br>магазины',
  noPlans: 'Планировки квартир скоро появятся.',
  sides: { N: 'на север', E: 'на восток', S: 'на юг', W: 'на запад' },
  m2: 'м²',
  m: 'м',
  lifts: (n) => `${n} ${plural(n, 'лифт', 'лифта', 'лифтов')}`,
  kg: 'кг',
  summary: { living: 'гостиная', kitchen: 'кухня', bedroom: ['спальня', 'спальни', 'спален'], bath: ['санузел', 'санузла', 'санузлов'], loggia: 'лоджия', terrace: 'терраса', storage: 'гардероб' },
  hideUi: 'Скрыть панели — останется только вид',
  slowHint: 'Если 3D работает медленно, переключите графику на лёгкую (кнопка в правом нижнем углу).',
  showUi: 'Показать панели',
  dayTime: 'Время суток',
  status: { free: 'Свободна', reserved: 'Забронирована', sold: 'Продана', closed: 'Нет в продаже' },
  statusMany: { free: 'Свободно', reserved: 'Бронь', sold: 'Продано' },
  onlyFree: 'Только свободные',
  freeN: (n) => `свободно ${n}`,
  room: { 'Living room': 'Гостиная', Kitchen: 'Кухня', Bedroom: 'Спальня', Bathroom: 'Ванная', WC: 'Санузел', Hall: 'Прихожая', Wardrobe: 'Гардероб', Loggia: 'Лоджия', Terrace: 'Терраса', Balcony: 'Балкон', 'Guest room': 'Гостевая', 'Common room': 'Общая комната', 'AC niche': 'Кондиционер' },
  lang: 'RU',
};

const TJ = {
  brand: BRAND.tj.name,
  brandSub: BRAND.tj.sub,
  loading: 'Модели 3D бор мешавад…',
  loadFailed: 'Модели 3D бор нашуд. Пайвастро санҷед ва саҳифаро аз нав кушоед.',
  noglTitle: 'Дар ин браузер намоиши 3D кор намекунад.',
  noglWhy: 'WebGL 2 лозим аст, аммо дар ин ҷо он хомӯш аст ё дастгирӣ намешавад.',
  noglHelp: 'Саҳифаро дар версияи нави Chrome, Safari, Edge ё Firefox кушоед ё суръатбахшии сахтафзориро дар танзимоти браузер фаъол кунед.',
  contextLost: 'Корти видеоӣ намоиши 3D-ро қатъ кард (хотира намерасид ё саҳифа дер боз дар замина буд).',
  quality: (high) => (high ? 'Графика: баланд' : 'Графика: сабук'),
  qualityTitle: (high) => (high ? 'Ба реҷаи сабук гузаштан (барои телефонҳо ва компютерҳои кӯҳна тезтар)' : 'Сифати пурра'),
  complex: 'Тамоми бино',
  floors: 'Ошёнаҳо',
  floor: 'Ошёна',
  floorN: (n) => `Ошёнаи ${n}`,
  floorOf: (n, m) => `${n} аз ${m}`,
  shops: 'Мағозаҳо',
  shopsFloors: 'Ошёнаҳои 1–2: мағозаҳо',
  flats: (n) => `${n} хона`,
  flatsOnFloor: (n) => `${n} хона дар ошёна`,
  floorsN: (n) => `${n} ошёна`,
  roomsN: (n) => `${n}-ҳуҷрагӣ`,
  roomsShort: (n) => `${n}-ҳуҷра`,
  all: 'Ҳама',
  rooms: 'Ҳуҷраҳо',
  chooseTitle: 'Хонаро интихоб кунед',
  chooseSub: (floors, r0, r1) => `${floors} · хонаҳои ${r0 === r1 ? `${r0}-ҳуҷрагӣ` : `${r0} то ${r1}-ҳуҷрагӣ`}`,
  chooseNote: 'Ба ошёна ишора кунед ва пахш кунед — ошёна бо мебел дар буриш кушода мешавад. Хонаро интихоб кунед, то нақшаи онро бинед ва дар 3D сайр кунед.',
  stat1: 'хона',
  stat2: 'м² — масоҳат',
  stat3: 'ошёна',
  floorNote: 'Ба хона дар модел ё дар ин рӯйхат пахш кунед.',
  flat: (n) => `Хонаи № ${n}`,
  back: '← Бозгашт',
  backTo: (s) => `← ${s}`,
  area: 'Масоҳати умумӣ',
  ceiling: 'Баландии шифт',
  layout: 'Нақша',
  windows: 'Тирезаҳо ба',
  walk: '🚶 Сайри хона дар 3D',
  contact: 'Тамос бо шӯъбаи фурӯш',
  planZoom: 'Нақшаро калон кушодан',
  close: 'Пӯшидан',
  contactToast: 'Тамос бо шӯъбаи фурӯш дар ин ҷо пайдо мешавад.',
  exitWalk: '✕ Бозгашт ба бино',
  hintOverview: 'Ба ошёна пахш кунед · Кашед — гардиш · Чархак — масштаб',
  hintFloor: 'Ба хона пахш кунед · Кашед — гардиш · Чархак — масштаб',
  walkHelp: 'Кашед — нигоҳ кунед · Ба фарш пахш кунед — ба он ҷо равед · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / тирчаҳо — ҳаракат',
  tipFloor: (n, m) => `<b>Ошёнаи ${n}</b><br>${m}`,
  tipShops: '<b>Ошёнаҳои 1–2</b><br>мағозаҳо',
  noPlans: 'Нақшаҳои хонаҳо ба наздикӣ илова мешаванд.',
  sides: { N: 'шимол', E: 'шарқ', S: 'ҷануб', W: 'ғарб' },
  m2: 'м²',
  m: 'м',
  lifts: (n) => `${n} лифт`,
  kg: 'кг',
  summary: { living: 'меҳмонхона', kitchen: 'ошхона', bedroom: ['хонаи хоб', 'хонаи хоб', 'хонаи хоб'], bath: ['ҳаммом', 'ҳаммом', 'ҳаммом'], loggia: 'айвон', terrace: 'терраса', storage: 'либосхона' },
  hideUi: 'Пинҳон кардани панелҳо — танҳо манзара мемонад',
  slowHint: 'Агар 3D суст кор кунад, графикаро ба сабук гузаронед (тугма дар кунҷи рости поён).',
  showUi: 'Нишон додани панелҳо',
  dayTime: 'Вақти шабонарӯз',
  status: { free: 'Озод', reserved: 'Банд шудааст', sold: 'Фурӯхта шуд', closed: 'Барои фурӯш нест' },
  statusMany: { free: 'Озод', reserved: 'Банд', sold: 'Фурӯхта шуд' },
  onlyFree: 'Танҳо озодҳо',
  freeN: (n) => `озод ${n}`,
  room: { 'Living room': 'Меҳмонхона', Kitchen: 'Ошхона', Bedroom: 'Хонаи хоб', Bathroom: 'Ҳаммом', WC: 'Ҳоҷатхона', Hall: 'Даҳлез', Wardrobe: 'Либосхона', Loggia: 'Айвон', Terrace: 'Терраса', Balcony: 'Балкон', 'Guest room': 'Меҳмонхона', 'Common room': 'Ҳуҷраи умумӣ', 'AC niche': 'Кондитсионер' },
  lang: 'TJ',
};

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const DICTS = { ru: RU, tj: TJ };

function detect() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ru' || q === 'tj') return q;
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'ru' || s === 'tj') return s;
  } catch {
    // storage blocked
  }
  return 'ru';
}

let lang = detect();
export const L = () => DICTS[lang];
export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // not remembered
  }
  document.documentElement.lang = l === 'tj' ? 'tg' : 'ru';
}
document.documentElement.lang = lang === 'tj' ? 'tg' : 'ru';

/** 150.35 -> "150,35" */
export const num = (x) => x.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
