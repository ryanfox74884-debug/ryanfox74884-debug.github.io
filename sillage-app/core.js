// ---- util.js ----
/* Personal Fragrance Intelligence — shared helpers */
(function (G) {
  const FPI = (G.FPI = G.FPI || {});

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round = (v, d = 0) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
  const wavg = (pairs) => { // [[value, weight]]
    let s = 0, w = 0;
    for (const [v, wt] of pairs) { if (Number.isFinite(v) && wt > 0) { s += v * wt; w += wt; } }
    return w > 0 ? s / w : NaN;
  };
  const median = (a) => {
    const b = a.filter(Number.isFinite).sort((x, y) => x - y);
    if (!b.length) return NaN;
    const m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  };
  const pearson = (xs, ys) => {
    const n = xs.length; if (n < 3) return 0;
    const mx = avg(xs), my = avg(ys);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b; }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  };

  // Temperature + humidity physics (Magnus formula, Alduchov & Eskridge coefficients)
  const fToC = (f) => (f - 32) * 5 / 9;
  const cToF = (c) => c * 9 / 5 + 32;
  const MB = 17.625, MC = 243.04;
  function dewPointF(tempF, rh) {
    if (!Number.isFinite(tempF) || !Number.isFinite(rh) || rh <= 0) return NaN;
    const t = fToC(tempF);
    const g = Math.log(clamp(rh, 1, 100) / 100) + (MB * t) / (MC + t);
    return cToF((MC * g) / (MB - g));
  }
  function rhFromDew(tempF, dewF) {
    if (!Number.isFinite(tempF) || !Number.isFinite(dewF)) return NaN;
    const t = fToC(tempF), td = fToC(Math.min(dewF, tempF));
    return clamp(100 * Math.exp((MB * td) / (MC + td) - (MB * t) / (MC + t)), 1, 100);
  }

  // Time helpers. Clock strings are "HH:MM" (24h). Dates are "YYYY-MM-DD" in local time.
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDateKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseDateKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
  const daysBetween = (a, b) => Math.round((parseDateKey(b) - parseDateKey(a)) / 86400000);
  const clockToH = (s) => { if (!s) return NaN; const [h, m] = s.split(':').map(Number); return h + (m || 0) / 60; };
  const hToClock = (h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${pad((hh + Math.floor(mm / 60)) % 24)}:${pad(mm % 60)}`; };
  function fmtClock(s) {
    const h = typeof s === 'number' ? s : clockToH(s);
    if (!Number.isFinite(h)) return '';
    let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh += 1; mm = 0; }
    const ap = hh % 24 >= 12 ? 'PM' : 'AM';
    const h12 = ((hh % 12) || 12);
    return mm ? `${h12}:${pad(mm)} ${ap}` : `${h12} ${ap}`;
  }
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (k, long) => {
    const d = parseDateKey(k);
    return long ? `${DOW_LONG[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}` : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  };

  const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';

  FPI.U = { clamp, round, avg, wavg, median, pearson, fToC, cToF, dewPointF, rhFromDew, pad, dateKey, parseDateKey, addDays, daysBetween,
    clockToH, hToClock, fmtClock, DOW, DOW_LONG, MONTHS, fmtDate, uid, esc, clone, debounce, slug };
  if (typeof module !== 'undefined') module.exports = FPI.U;
})(typeof window !== 'undefined' ? window : globalThis);

// ---- catalog.js ----
/* Reference library, defaults and vocabularies */
(function (G) {
  const FPI = (G.FPI = G.FPI || {});

  // Where a piece of information came from. Every displayed figure carries one of these.
  const SOURCES = {
    brand: { label: 'Brand / retailer', short: 'Brand' },
    community: { label: 'Community-reported', short: 'Community' },
    research: { label: 'Published research', short: 'Research' },
    estimate: { label: 'Estimate', short: 'Estimate' },
    mine: { label: 'My observations', short: 'Mine' },
  };

  // Usage contexts the engine scores against (0–10 each).
  const USAGE_KEYS = [
    ['daytime', 'Daytime'], ['evening', 'Evening'], ['office', 'Work / office'], ['classroom', 'Classroom'],
    ['date', 'Date night'], ['outdoor', 'Outdoor'], ['casual', 'Casual'], ['formal', 'Formal'], ['active', 'Active / gym'],
  ];
  const TRAIT_KEYS = [
    ['sweetness', 'Sweetness'], ['freshness', 'Freshness'], ['warmth', 'Warmth'], ['spice', 'Spice'], ['woody', 'Woodiness'],
    ['creamy', 'Creaminess'], ['citrus', 'Citrus'], ['floral', 'Floral'], ['musk', 'Musk'], ['amber', 'Amber'], ['density', 'Density'],
  ];

  // Activities: relevance = how much this block counts toward the day's score;
  // desire = how much you want to be noticed (drives "too faint" checks); usage = which suitability rating applies.
  const ACTIVITIES = {
    prep: { label: 'Getting ready', relevance: 0.25, desire: 0, usage: 'casual' },
    commute: { label: 'Commute', relevance: 0.5, desire: 0, usage: 'casual' },
    class: { label: 'Class', relevance: 1.0, desire: 0.3, usage: 'classroom' },
    work: { label: 'Work shift', relevance: 1.0, desire: 0.3, usage: 'office' },
    home: { label: 'At home', relevance: 0.4, desire: 0.2, usage: 'casual' },
    errands: { label: 'Errands', relevance: 0.6, desire: 0.3, usage: 'casual' },
    social: { label: 'Friends / dinner', relevance: 1.1, desire: 0.75, usage: 'evening' },
    date: { label: 'Date', relevance: 1.3, desire: 1.0, usage: 'date' },
    formal: { label: 'Formal event', relevance: 1.2, desire: 0.8, usage: 'formal' },
    outdoor: { label: 'Outdoor activity', relevance: 0.8, desire: 0.5, usage: 'outdoor' },
    gym: { label: 'Gym / run', relevance: 0.3, desire: 0, usage: 'active' },
  };

  const OCCASIONS = {
    day: { label: 'My whole day' },
    class: { label: 'Class', start: '08:00', end: '12:00', env: 'classroom', activity: 'class' },
    work: { label: 'Work shift', start: '14:00', end: '19:00', env: 'store', activity: 'work' },
    date: { label: 'Date night', start: '19:00', end: '23:00', env: 'restaurant', activity: 'date' },
    social: { label: 'Night out with friends', start: '20:00', end: '23:30', env: 'restaurant', activity: 'social' },
    formal: { label: 'Formal event', start: '18:00', end: '22:00', env: 'restaurant', activity: 'formal' },
    outdoor: { label: 'Outdoor plans', start: '12:00', end: '17:00', env: 'outdoors', activity: 'outdoor' },
    casual: { label: 'Relaxed day off', start: '10:00', end: '18:00', env: 'home', activity: 'home' },
  };

  // Environment profiles. Indoor numbers are starting assumptions (confirmed:false) until you edit them.
  const DEFAULT_ENVS = [
    { id: 'home', name: 'Home', kind: 'indoor', hvac: 'auto', tempF: 70, rh: null, size: 'medium', occupancy: 'low', proximity: 'normal', ventilation: 'medium', confirmed: false },
    { id: 'car', name: 'Car', kind: 'vehicle', hvac: 'auto', tempF: 70, rh: null, size: 'small', occupancy: 'low', proximity: 'normal', ventilation: 'low', confirmed: false },
    { id: 'classroom', name: 'Classroom', kind: 'indoor', hvac: 'auto', tempF: 70, rh: null, size: 'medium', occupancy: 'medium', proximity: 'normal', ventilation: 'medium', confirmed: false },
    { id: 'store', name: 'Grocery store (work)', kind: 'indoor', hvac: 'auto', tempF: 68, rh: null, size: 'large', occupancy: 'high', proximity: 'close', ventilation: 'high', confirmed: false },
    { id: 'restaurant', name: 'Restaurant / hangout', kind: 'indoor', hvac: 'auto', tempF: 71, rh: null, size: 'medium', occupancy: 'medium', proximity: 'close', ventilation: 'medium', confirmed: false },
    { id: 'outdoors', name: 'Outdoors', kind: 'outdoor', hvac: 'none', tempF: null, rh: null, size: 'large', occupancy: 'low', proximity: 'normal', ventilation: 'high', confirmed: true },
    { id: 'gym', name: 'Gym', kind: 'indoor', hvac: 'auto', tempF: 68, rh: null, size: 'medium', occupancy: 'medium', proximity: 'close', ventilation: 'medium', confirmed: false },
  ];

  const B = (start, end, label, env, activity) => ({ start, end, label, env, activity });
  // Starting template taken from the example day in the project brief. Edit it in Settings → Schedule.
  const SCHOOL_WORK_DAY = [
    B('06:30', '07:00', 'Getting ready', 'home', 'prep'),
    B('07:00', '07:30', 'Drive to school', 'car', 'commute'),
    B('07:30', '11:30', 'Class', 'classroom', 'class'),
    B('11:30', '12:00', 'Drive home', 'car', 'commute'),
    B('12:00', '13:40', 'Home', 'home', 'home'),
    B('13:40', '14:00', 'Drive to work', 'car', 'commute'),
    B('14:00', '19:00', 'Work shift', 'store', 'work'),
    B('19:00', '19:30', 'Drive', 'car', 'commute'),
    B('20:00', '22:00', 'Dinner / friends', 'restaurant', 'social'),
  ];
  const DAY_OFF = [
    B('09:00', '09:30', 'Getting ready', 'home', 'prep'),
    B('09:30', '12:00', 'Home', 'home', 'home'),
    B('12:00', '12:20', 'Drive', 'car', 'commute'),
    B('12:20', '15:00', 'Errands', 'outdoors', 'errands'),
    B('15:00', '18:30', 'Home', 'home', 'home'),
    B('19:00', '22:30', 'Evening out', 'restaurant', 'social'),
  ];

  const DEFAULT_WEIGHTS = { weather: 25, composition: 15, humidity: 15, space: 15, schedule: 10, preference: 10, history: 10 };
  const FACTOR_LABELS = {
    weather: 'Weather', composition: 'Composition', humidity: 'Humidity', space: 'Indoor / outdoor',
    schedule: 'Schedule & occasion', preference: 'Your preferences', history: 'Your history',
  };

  function defaultSettings() {
    const withIds = (blocks, d) => blocks.map((b, i) => ({ id: `w${d}-${i}`, ...b }));
    const week = {};
    for (let d = 0; d < 7; d++) week[d] = withIds(d >= 1 && d <= 5 ? SCHOOL_WORK_DAY : DAY_OFF, d);
    return {
      version: 1,
      location: { name: 'Wichita, KS', lat: 37.6872, lon: -97.3301, mode: 'manual', auto: true },
      notify: { morning: true, wearing: true },
      prefs: {
        profile: 'Balanced', projection: 5, sweetness: 6, freshness: 5, warmth: 7, spice: 5,
        longevityImportance: 6, intensity: 5, minSprays: 1, maxSprays: 5, sensitivity: 5,
        likes: ['vanilla', 'warm', 'balanced'], dislikes: ['loud', 'polarizing'],
        likedFamilies: ['Amber', 'Gourmand', 'Aromatic'], dislikedFamilies: [],
        occasions: ['class', 'work', 'social'], moisturize: false, countCompliments: false,
        notes: 'Prioritize personal enjoyment over compliments. Broadly appealing without being generic. Good longevity, not maximum performance.',
      },
      weights: { ...DEFAULT_WEIGHTS },
      adaptive: true,
      rotation: { enabled: true },
      envs: DEFAULT_ENVS.map((e) => ({ ...e })),
      schedule: { week, overrides: {}, templateNote: true },
      onboarded: false,
    };
  }

  // ---- Starter collection -------------------------------------------------
  // Notes and facts come from the sources cited on each entry. Trait ratings, performance hours and
  // comfort ranges are ESTIMATES written from the composition; they are labeled as such in the app and
  // are meant to be replaced by your own logs over time.
  const LIBRARY = [
    {
      id: 'liquid-brun', name: 'Liquid Brun', brand: 'French Avenue', house: 'Fragrance World (French Avenue line)', year: 2024,
      concentration: 'Eau de Parfum', perfumer: '', inspiredBy: 'Parfums de Marly Althaïr',
      color: '#7a4a2a', bottleShape: 'round',
      families: { primary: 'Amber', secondary: 'Gourmand' },
      notes: { top: ['Bergamot', 'Cardamom', 'Cinnamon', 'Orange blossom'], heart: ['Elemi', 'Vanilla'], base: ['Ambroxan', 'Praline', 'Guaiac wood', 'Musk'] },
      notesSource: { type: 'brand', text: 'Notes and 2024 release per ScentAdvice, which lists it as inspired by Althaïr. A limited-edition extrait also exists; this entry is the EDP.' },
      traits: { sweetness: 8, freshness: 3, warmth: 8, spice: 5, woody: 4, creamy: 6, citrus: 3, floral: 3, musk: 5, amber: 7, density: 8 },
      perf: { projOpen: 8, projDry: 5.5, longevityH: 9, sillage: 7,
        development: 'Same structure as Althaïr; inspired-by blends often lean sweeter and louder in the first hours.',
        warm: 'High cloying risk in humid heat at full spray count.', cold: 'Comfortable and enveloping in cold weather.',
        humid: 'Sweetness and density amplify when muggy.', dry: 'Holds well; strong base materials.' },
      perfSource: { type: 'estimate', text: 'Estimated. Inspired-by performance varies between batches, so your own logs matter more here than for most entries.' },
      community: [],
      usage: { tempLo: 28, tempHi: 68, rhLo: 20, rhHi: 65, dewMax: 55, seasons: ['fall', 'winter'], polarizing: 2,
        ratings: { daytime: 6, evening: 8, office: 5, classroom: 5, date: 8, outdoor: 5, casual: 7, formal: 6, active: 1 } },
      usageSource: { type: 'estimate', text: 'Comfort ranges and suitability are estimates from the composition.' },
      tags: ['vanilla', 'warm', 'spicy', 'sweet', 'loud'],
      sources: [{ type: 'brand', text: 'ScentAdvice: Liquid Brun (2024)', url: 'https://scentadvice.com/liquid-brun-2024-french-avenue/' }],
    },
    {
      id: 'ralphs-club-new-york', name: 'Ralph’s Club New York', brand: 'Ralph Lauren', house: 'Ralph Lauren', year: null,
      concentration: 'Eau de Parfum', perfumer: '', inspiredBy: '',
      color: '#c4c8cc', bottleShape: 'block',
      families: { primary: 'Fougère', secondary: 'Amber' },
      notes: { top: ['Blackcurrant accord', 'Wrinkled leaves accord', 'Green Italian mandarin', 'Calabria bergamot'], heart: ['Lavender', 'Madagascar geranium oil', 'Sandalwood'], base: ['Moss accord', 'Fir balsam', 'Madagascar bourbon vanilla'] },
      notesSource: { type: 'brand', text: 'Ralph Lauren product page: fougère ambery, blackcurrant opening, then vanilla and sandalwood. Silver translucent flask (the one you own).' },
      traits: { sweetness: 5, freshness: 5, warmth: 6, spice: 2, woody: 5, creamy: 4, citrus: 4, floral: 3, musk: 3, amber: 5, density: 6 },
      perf: { projOpen: 6.5, projDry: 5, longevityH: 8, sillage: 6,
        development: 'Blackcurrant, green leaves and citrus open into lavender and geranium, drying down to moss, fir balsam and bourbon vanilla.',
        warm: 'Vanilla-fir base gets heavier in real heat.', cold: 'Comfortable and full in cool weather.',
        humid: 'Fruity-vanilla sweetness can build when muggy.', dry: 'Resinous base holds in dry air.' },
      perfSource: { type: 'estimate', text: 'Hours and 0–10 levels are estimates from the composition.' },
      community: [{ label: 'RalphLauren.com price', value: '$185 / 3.7 oz (Nov 2026)' }],
      usage: { tempLo: 30, tempHi: 78, rhLo: 15, rhHi: 78, dewMax: 64, seasons: ['fall', 'winter', 'spring'], polarizing: 2,
        ratings: { daytime: 7, evening: 8, office: 7, classroom: 6, date: 8, outdoor: 6, casual: 7, formal: 7, active: 2 } },
      usageSource: { type: 'estimate', text: 'Comfort ranges and suitability are estimates from the composition.' },
      tags: ['fougere', 'fruity', 'vanilla', 'warm', 'balanced'],
      sources: [{ type: 'brand', text: 'Ralph Lauren: Ralph’s Club New York EDP', url: 'https://www.ralphlauren.com/men-accessories-fragrance/ralph%E2%80%99s-club-new-york-eau-de-parfum/0079748299.html' }],
    },
    {
      id: 'y-iced', name: 'Y Iced Cologne', brand: 'Yves Saint Laurent', house: 'Yves Saint Laurent', year: null,
      concentration: 'Eau de Toilette Intense', perfumer: 'Dominique Ropion', inspiredBy: '',
      color: '#b9dbe6', bottleShape: 'tall',
      families: { primary: 'Aromatic', secondary: 'Fresh' },
      notes: { top: ['Ice mint (peppermint accord)'], heart: ['Ourika blue sage accord'], base: ['Ambroxan', 'Indonesian patchouli'] },
      notesSource: { type: 'brand', text: 'YSL’s product page lists it as “Y Eau de Toilette Intense — Iced Cologne”: fougère with fresh, aromatic and woody facets, perfumer Dominique Ropion. The brand also cites a cooling molecule (Arctical) in the heart.' },
      traits: { sweetness: 2, freshness: 9, warmth: 2, spice: 2, woody: 4, creamy: 1, citrus: 3, floral: 1, musk: 3, amber: 4, density: 4 },
      perf: { projOpen: 6.5, projDry: 4.5, longevityH: 7, sillage: 5.5,
        development: 'Icy peppermint opening, blue sage heart, ambroxan and patchouli dry-down.',
        warm: 'Built for heat; the cooling effect is the point.', cold: 'Can feel sharp and thin on cold days.',
        humid: 'Handles muggy air well; no sweetness to turn cloying.', dry: 'Mint top flashes off fast in dry heated air.' },
      perfSource: { type: 'brand', text: 'YSL claims 12-hour wear (consumer test of 63 men). Hours and 0–10 levels here are estimates.' },
      community: [{ label: 'Brand claim', value: '12-hour wear (consumer test, 63 men)' }],
      usage: { tempLo: 55, tempHi: 98, rhLo: 20, rhHi: 85, dewMax: 74, seasons: ['spring', 'summer'], polarizing: 2,
        ratings: { daytime: 9, evening: 5, office: 8, classroom: 8, date: 5, outdoor: 9, casual: 9, formal: 4, active: 8 } },
      usageSource: { type: 'estimate', text: 'Comfort ranges and suitability are estimates from the composition.' },
      tags: ['fresh', 'mint', 'cooling', 'aromatic', 'sage'],
      sources: [{ type: 'brand', text: 'YSL Beauty: Y Iced Cologne (Eau de Toilette Intense)', url: 'https://www.yslbeauty.com/int/fragrance/masculine-fragrance/y--the-new-iced-cologne/WW-51510YSL.html' }],
    },
    {
      id: 'prada-lhomme', name: 'L’Homme', brand: 'Prada', house: 'Prada', year: 2016,
      concentration: 'Eau de Toilette', perfumer: '', inspiredBy: '',
      color: '#e4dccd', bottleShape: 'block',
      families: { primary: 'Floral', secondary: 'Woody' },
      notes: { top: ['Neroli'], heart: ['Iris', 'Geranium'], base: [] },
      notesSource: { type: 'brand', text: 'Key notes only (iris, neroli, geranium) from Sephora US, which lists the family as Earthy & Woody. Tiers assigned for display.' },
      traits: { sweetness: 3, freshness: 6, warmth: 4, spice: 2, woody: 5, creamy: 5, citrus: 4, floral: 7, musk: 6, amber: 4, density: 4 },
      perf: { projOpen: 5, projDry: 4, longevityH: 7, sillage: 4.5,
        development: 'Clean neroli opening into a powdery, soapy iris with geranium; stays close and polished.',
        warm: 'Clean enough for warm days.', cold: 'Soft and close in the cold.',
        humid: 'Powdery iris can feel heavier when muggy.', dry: 'Holds well in dry indoor air.' },
      perfSource: { type: 'estimate', text: 'Hours and 0–10 levels are estimates from the composition.' },
      community: [{ label: 'Sephora US price', value: '$136 / 100 ml (Nov 2026)' }],
      usage: { tempLo: 40, tempHi: 88, rhLo: 15, rhHi: 80, dewMax: 68, seasons: ['spring', 'summer', 'fall', 'winter'], polarizing: 2,
        ratings: { daytime: 9, evening: 6, office: 10, classroom: 9, date: 7, outdoor: 6, casual: 8, formal: 9, active: 3 } },
      usageSource: { type: 'estimate', text: 'Comfort ranges and suitability are estimates from the composition.' },
      tags: ['iris', 'clean', 'powdery', 'soapy', 'balanced'],
      sources: [{ type: 'brand', text: 'Sephora US: Prada L’Homme Eau de Toilette', url: 'https://www.sephora.com/product/l-homme-eau-de-toilette-P506529' }],
    },
    {
      id: 'forever-wanted-elixir', name: 'Forever Wanted Elixir', brand: 'Azzaro', house: 'Azzaro', year: null,
      concentration: 'Elixir', perfumer: '', inspiredBy: '',
      color: '#d2a23e', bottleShape: 'cylinder',
      families: { primary: 'Spicy', secondary: 'Amber' },
      notes: { top: ['Raspberry extract'], heart: ['Cardamom'], base: ['Leather accord'] },
      notesSource: { type: 'brand', text: 'Key notes from Sephora US (Warm & Spicy, Woody Spices); the brand calls it an extreme concentration. Gold barrel bottle (the one you own; The Most Wanted Parfum is the matte-black one).' },
      traits: { sweetness: 6, freshness: 2, warmth: 8, spice: 7, woody: 5, creamy: 3, citrus: 1, floral: 1, musk: 2, amber: 6, density: 8 },
      perf: { projOpen: 7.5, projDry: 5.5, longevityH: 9, sillage: 7,
        development: 'Jammy raspberry and cardamom over a warm leather base.',
        warm: 'Dense and sweet-spicy; a lot in the heat.', cold: 'At home in cold weather.',
        humid: 'Fruit and spice thicken when muggy.', dry: 'Strong base; lasts in dry air.' },
      perfSource: { type: 'estimate', text: 'Hours and 0–10 levels are estimates from the composition.' },
      community: [],
      usage: { tempLo: 25, tempHi: 65, rhLo: 15, rhHi: 70, dewMax: 56, seasons: ['fall', 'winter'], polarizing: 3,
        ratings: { daytime: 5, evening: 9, office: 4, classroom: 4, date: 9, outdoor: 5, casual: 6, formal: 7, active: 1 } },
      usageSource: { type: 'estimate', text: 'Comfort ranges and suitability are estimates from the composition.' },
      tags: ['spicy', 'leather', 'fruity', 'warm', 'sweet'],
      sources: [{ type: 'brand', text: 'Sephora US: Azzaro Forever Wanted Elixir', url: 'https://www.sephora.com/product/azz-wanted-forever-elixir-P515911' }],
    },
  ];

  function fromLibrary(entry) {
    return Object.assign({
      sizeMl: null, remainingPct: null, purchaseDate: '', pricePaid: null, photo: null, excluded: false, owned: true,
      createdAt: new Date().toISOString(), library: true,
    }, JSON.parse(JSON.stringify(entry)));
  }

  // ---- Trait estimator for fragrances you add yourself ---------------------
  const NOTE_RULES = [
    [/vanill|tonka|benzoin/, { sweetness: 1.6, warmth: 1, creamy: 0.8, amber: 0.6, density: 0.5 }, 'vanilla'],
    [/praline|caramel|honey|sugar|chocolate|cacao|toffee|candy|marshmallow/, { sweetness: 2, density: 1, warmth: 0.6 }, 'sweet'],
    [/cinnamon|clove|nutmeg|cardamom|pepper|ginger|saffron|cumin|caraway|pimento|allspice/, { spice: 1.8, warmth: 0.8 }, 'spicy'],
    [/bergamot|lemon|orange|grapefruit|mandarin|lime|yuzu|citrus|neroli|petitgrain|tangerine/, { citrus: 1.8, freshness: 1.2 }, 'citrus'],
    [/lavender|mint|sage|tarragon|basil|rosemary|artemisia|geranium/, { freshness: 1.4 }, 'aromatic'],
    [/marine|aquatic|sea|ozonic|calone|water|apple|pear|cucumber/, { freshness: 2 }, 'fresh'],
    [/jasmine|rose|orange blossom|neroli|iris|violet|tuberose|lily|magnolia|ylang|peony|osmanthus/, { floral: 1.8 }, 'floral'],
    [/sandal|cedar|vetiver|guaiac|oud|agarwood|patchouli|wood|cypress|birch|oak/, { woody: 1.8, density: 0.4 }, 'woody'],
    [/musk|ambrette|cashmeran|cashmere/, { musk: 1.8, creamy: 0.4 }, 'musk'],
    [/amber|ambrox|ambergris|labdanum|ambrofix|resin|elemi|myrrh|frankincense|olibanum/, { amber: 1.6, warmth: 0.8, density: 0.5 }, 'amber'],
    [/tobacco|leather|incense|smok|rum|whisky|cognac/, { warmth: 1.2, density: 1, woody: 0.5 }, 'warm'],
    [/coconut|milk|cream|rice|almond|pistachio|heliotrope/, { creamy: 1.8, sweetness: 0.8 }, 'creamy'],
  ];
  function estimateTraits(notes, concentration) {
    const all = [...(notes.top || []), ...(notes.heart || []), ...(notes.base || [])].map((n) => String(n).toLowerCase());
    const t = { sweetness: 3, freshness: 3, warmth: 3, spice: 2, woody: 2, creamy: 2, citrus: 2, floral: 2, musk: 2, amber: 2, density: 3 };
    const conc = String(concentration || '').toLowerCase();
    t.density += /extrait|parfum$|elixir|intense/.test(conc) ? 2.5 : /parfum|edp/.test(conc) ? 1.5 : /cologne/.test(conc) ? -1 : 0.5;
    const tags = new Set();
    all.forEach((n) => {
      NOTE_RULES.forEach(([re, add, tag]) => {
        if (re.test(n)) { Object.entries(add).forEach(([k, v]) => { t[k] += v; }); tags.add(tag); }
      });
    });
    Object.keys(t).forEach((k) => { t[k] = Math.round(Math.min(10, Math.max(1, t[k]))); });
    return { traits: t, tags: [...tags] };
  }

  // Estimated performance and ranges from traits + concentration, for user-added entries.
  function estimatePerf(traits, concentration) {
    const conc = String(concentration || '').toLowerCase();
    const base = /extrait|parfum$|elixir/.test(conc) ? 8 : /parfum|edp/.test(conc) ? 7 : /cologne/.test(conc) ? 3 : 5.5;
    const projOpen = Math.min(9, Math.max(3, base - 0.5 + (traits.density - 5) * 0.3));
    const projDry = Math.max(2, projOpen - 2);
    const longevityH = Math.round(Math.max(3, base + (traits.density - 5) * 0.6 + (traits.amber + traits.woody + traits.musk - 15) * 0.1));
    const heavy = (traits.sweetness + traits.density + traits.amber) / 3;
    const tempHi = Math.round(92 - heavy * 3 + traits.freshness * 1.2);
    const tempLo = Math.round(Math.max(20, 70 - traits.warmth * 3 - traits.density * 1.5));
    const dewMax = Math.round(72 - heavy * 2);
    return { perf: { projOpen: Math.round(projOpen * 2) / 2, projDry: Math.round(projDry * 2) / 2, longevityH, sillage: Math.round(projOpen * 2) / 2,
      development: '', warm: '', cold: '', humid: '', dry: '' },
      usage: { tempLo, tempHi, rhLo: 20, rhHi: 75, dewMax, seasons: [], polarizing: 3,
        ratings: { daytime: 6, evening: 6, office: 6, classroom: 6, date: 6, outdoor: 6, casual: 6, formal: 6, active: 2 } } };
  }

  FPI.Catalog = { SOURCES, USAGE_KEYS, TRAIT_KEYS, ACTIVITIES, OCCASIONS, DEFAULT_ENVS, DEFAULT_WEIGHTS, FACTOR_LABELS,
    LIBRARY, defaultSettings, fromLibrary, estimateTraits, estimatePerf };
  if (typeof module !== 'undefined') module.exports = FPI.Catalog;
})(typeof window !== 'undefined' ? window : globalThis);

// ---- weather.js ----
/* Weather: Open-Meteo live forecast (no API key) with a clearly labeled manual fallback */
(function (G) {
  const FPI = (G.FPI = G.FPI || {});
  const U = FPI.U;

  const HOURLY = ['temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'apparent_temperature', 'precipitation_probability',
    'precipitation', 'weather_code', 'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'uv_index'];
  const CURRENT = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'dew_point_2m', 'precipitation', 'weather_code',
    'cloud_cover', 'wind_speed_10m', 'wind_direction_10m'];
  const DAILY = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max', 'precipitation_sum',
    'uv_index_max', 'sunrise', 'sunset'];

  function forecastUrl(lat, lon) {
    const p = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4), current: CURRENT.join(','), hourly: HOURLY.join(','), daily: DAILY.join(','),
      temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch', timezone: 'auto', forecast_days: '16',
    });
    return `https://api.open-meteo.com/v1/forecast?${p.toString()}`;
  }

  async function withTimeout(promise, ms, label) {
    let t; const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out`)), ms); });
    try { return await Promise.race([promise, timer]); } finally { clearTimeout(t); }
  }

  async function fetchForecast(loc, fetchImpl) {
    const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(G) : null);
    if (!f) throw Object.assign(new Error('No network access in this view'), { code: 'blocked' });
    let res;
    try { res = await withTimeout(f(forecastUrl(loc.lat, loc.lon)), 12000, 'Weather request'); }
    catch (e) { throw Object.assign(new Error(e.message || 'Weather service unreachable'), { code: 'blocked' }); }
    if (!res.ok) throw Object.assign(new Error(`Weather service answered ${res.status}`), { code: 'http' });
    const json = await res.json();
    return normalize(json, loc);
  }

  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? NaN : Number(v));

  function normalize(json, loc) {
    if (!json || !json.hourly || !Array.isArray(json.hourly.time)) throw Object.assign(new Error('Unexpected weather response'), { code: 'parse' });
    const H = json.hourly;
    const hourly = H.time.map((t, i) => {
      const pick = (k) => (H[k] ? num(H[k][i]) : NaN);
      const tempF = pick('temperature_2m'), rh = pick('relative_humidity_2m');
      let dewF = pick('dew_point_2m'); if (!Number.isFinite(dewF)) dewF = U.dewPointF(tempF, rh);
      return {
        time: t, date: t.slice(0, 10), h: Number(t.slice(11, 13)),
        tempF, rh, dewF, feelsF: pick('apparent_temperature'), precipProb: pick('precipitation_probability'), precipIn: pick('precipitation'),
        code: pick('weather_code'), cloud: pick('cloud_cover'), windMph: pick('wind_speed_10m'), windDir: pick('wind_direction_10m'), uv: pick('uv_index'),
      };
    });
    const D = json.daily || {};
    const daily = (D.time || []).map((d, i) => ({
      date: d, code: num(D.weather_code && D.weather_code[i]), highF: num(D.temperature_2m_max && D.temperature_2m_max[i]),
      lowF: num(D.temperature_2m_min && D.temperature_2m_min[i]), precipProb: num(D.precipitation_probability_max && D.precipitation_probability_max[i]),
      precipIn: num(D.precipitation_sum && D.precipitation_sum[i]), uvMax: num(D.uv_index_max && D.uv_index_max[i]),
      sunrise: D.sunrise ? D.sunrise[i] : null, sunset: D.sunset ? D.sunset[i] : null,
    }));
    const C = json.current || {};
    const nowTime = C.time || null;
    const today = nowTime ? nowTime.slice(0, 10) : (daily[0] && daily[0].date) || U.dateKey();
    const nowH = nowTime ? Number(nowTime.slice(11, 13)) : new Date().getHours();
    const hr = hourly.find((x) => x.date === today && x.h === nowH) || hourly[0];
    const cur = (k, fallback) => { const v = num(C[k]); return Number.isFinite(v) ? v : fallback; };
    const current = {
      time: nowTime, tempF: cur('temperature_2m', hr.tempF), rh: cur('relative_humidity_2m', hr.rh), feelsF: cur('apparent_temperature', hr.feelsF),
      dewF: cur('dew_point_2m', hr.dewF), precipIn: cur('precipitation', hr.precipIn), code: cur('weather_code', hr.code), cloud: cur('cloud_cover', hr.cloud),
      windMph: cur('wind_speed_10m', hr.windMph), windDir: cur('wind_direction_10m', hr.windDir), uv: hr.uv, precipProb: hr.precipProb,
    };
    if (!Number.isFinite(current.dewF)) current.dewF = U.dewPointF(current.tempF, current.rh);
    return { source: 'open-meteo', estimated: false, fetchedAt: new Date().toISOString(), today, location: { ...loc }, timezone: json.timezone || '', current, hourly, daily };
  }

  // Manual entry → hourly curve. Highs/lows/humidity are yours; the hour-by-hour shape is a standard
  // diurnal estimate (low near 6 AM, high near 3 PM) and is labeled "estimated" everywhere it appears.
  function manualWeather(m, loc, date) {
    const day = date || U.dateKey();
    const high = num(m.highF), low = num(m.lowF);
    if (!Number.isFinite(high) || !Number.isFinite(low)) throw new Error('Enter today’s high and low.');
    const hi = Math.max(high, low), lo = Math.min(high, low);
    const curve = (h) => {
      if (h >= 6 && h <= 15) return lo + (hi - lo) * (1 - Math.cos(Math.PI * (h - 6) / 9)) / 2;
      const hh = h < 6 ? h + 24 : h;
      return lo + (hi - lo) * (1 + Math.cos(Math.PI * (hh - 15) / 15)) / 2;
    };
    const nowH = new Date().getHours();
    let dewF = num(m.dewF);
    if (!Number.isFinite(dewF) && Number.isFinite(num(m.rh))) {
      const ref = Number.isFinite(num(m.nowF)) ? num(m.nowF) : curve(nowH);
      dewF = U.dewPointF(ref, num(m.rh));
    }
    if (!Number.isFinite(dewF)) throw new Error('Enter humidity or dew point.');
    const wind = Number.isFinite(num(m.windMph)) ? num(m.windMph) : NaN;
    const rain = Number.isFinite(num(m.rainPct)) ? num(m.rainPct) : NaN;
    const hourly = [];
    for (let h = 0; h < 24; h++) {
      const t = U.round(curve(h), 1);
      hourly.push({ time: `${day}T${U.pad(h)}:00`, date: day, h, tempF: t, rh: U.round(U.rhFromDew(t, dewF)), dewF: U.round(Math.min(dewF, t), 1),
        feelsF: t, precipProb: rain, precipIn: NaN, code: NaN, cloud: NaN, windMph: wind, windDir: NaN, uv: NaN });
    }
    const nowT = Number.isFinite(num(m.nowF)) ? num(m.nowF) : hourly[nowH].tempF;
    return {
      source: 'manual', estimated: true, fetchedAt: new Date().toISOString(), today: day, location: { ...loc }, timezone: '',
      current: { time: `${day}T${U.pad(nowH)}:00`, tempF: nowT, rh: Number.isFinite(num(m.rh)) ? num(m.rh) : U.round(U.rhFromDew(nowT, dewF)), feelsF: nowT,
        dewF: U.round(dewF, 1), precipIn: NaN, code: NaN, cloud: NaN, windMph: wind, windDir: NaN, uv: NaN, precipProb: rain },
      hourly,
      daily: [{ date: day, code: NaN, highF: hi, lowF: lo, precipProb: rain, precipIn: NaN, uvMax: NaN, sunrise: null, sunset: null }],
      manualInput: { ...m },
    };
  }

  async function geocode(q, fetchImpl) {
    const f = fetchImpl || fetch.bind(G);
    const url = `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: '6', language: 'en', format: 'json' })}`;
    const res = await withTimeout(f(url), 10000, 'Location search');
    if (!res.ok) throw new Error(`Location search answered ${res.status}`);
    const j = await res.json();
    return (j.results || []).map((r) => ({ name: [r.name, r.admin1, r.country_code === 'US' ? '' : r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }));
  }

  async function reverseGeocode(lat, lon, fetchImpl) {
    try {
      const f = fetchImpl || fetch.bind(G);
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
      const res = await withTimeout(f(url), 8000, 'Place lookup');
      if (!res.ok) return null;
      const j = await res.json();
      const city = j.city || j.locality; const st = j.principalSubdivisionCode ? j.principalSubdivisionCode.split('-').pop() : j.principalSubdivision;
      return city ? `${city}${st ? ', ' + st : ''}` : null;
    } catch (e) { return null; }
  }

  function hoursFor(w, date) {
    const list = (w && w.hourly ? w.hourly : []).filter((x) => x.date === date);
    return list.sort((a, b) => a.h - b.h);
  }
  // Conditions at a fractional hour on a date (linear interpolation between forecast hours).
  function atHour(w, date, h) {
    const hrs = hoursFor(w, date);
    if (!hrs.length) return null;
    const a = hrs.filter((x) => x.h <= h).pop() || hrs[0];
    const b = hrs.find((x) => x.h > h) || a;
    if (a === b) return { ...a };
    const f = (h - a.h) / (b.h - a.h);
    const lerp = (k) => (Number.isFinite(a[k]) && Number.isFinite(b[k]) ? a[k] + (b[k] - a[k]) * f : Number.isFinite(a[k]) ? a[k] : b[k]);
    return { ...a, h, tempF: lerp('tempF'), rh: lerp('rh'), dewF: lerp('dewF'), feelsF: lerp('feelsF'), windMph: lerp('windMph'), uv: lerp('uv'), precipProb: Math.max(a.precipProb || 0, b.precipProb || 0), cloud: lerp('cloud') };
  }
  function dayFor(w, date) { return (w && w.daily ? w.daily : []).find((d) => d.date === date) || null; }

  const CODES = [
    [[0], 'Clear', 'sun'], [[1], 'Mostly clear', 'sun'], [[2], 'Partly cloudy', 'partly'], [[3], 'Overcast', 'cloud'],
    [[45, 48], 'Fog', 'fog'], [[51, 53, 55], 'Drizzle', 'rain'], [[56, 57], 'Freezing drizzle', 'sleet'],
    [[61, 63, 65], 'Rain', 'rain'], [[66, 67], 'Freezing rain', 'sleet'], [[71, 73, 75, 77], 'Snow', 'snow'],
    [[80, 81, 82], 'Showers', 'rain'], [[85, 86], 'Snow showers', 'snow'], [[95, 96, 99], 'Thunderstorms', 'storm'],
  ];
  function describe(code) {
    if (!Number.isFinite(code)) return { text: '', icon: 'none' };
    const m = CODES.find(([cs]) => cs.includes(code));
    return m ? { text: m[1], icon: m[2] } : { text: 'Unknown', icon: 'cloud' };
  }
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compass = (deg) => (Number.isFinite(deg) ? COMPASS[Math.round(deg / 22.5) % 16] : '');

  // Dew point comfort bands (°F), the standard way forecasters describe mugginess.
  function dewBand(dewF) {
    if (!Number.isFinite(dewF)) return { label: '—', level: 0 };
    if (dewF < 35) return { label: 'Very dry', level: -2 };
    if (dewF < 50) return { label: 'Dry', level: -1 };
    if (dewF < 60) return { label: 'Comfortable', level: 0 };
    if (dewF < 65) return { label: 'Sticky', level: 1 };
    if (dewF < 70) return { label: 'Muggy', level: 2 };
    return { label: 'Oppressive', level: 3 };
  }

  FPI.Weather = { forecastUrl, fetchForecast, normalize, manualWeather, geocode, reverseGeocode, hoursFor, atHour, dayFor, describe, compass, dewBand };
  if (typeof module !== 'undefined') module.exports = FPI.Weather;
})(typeof window !== 'undefined' ? window : globalThis);

// ---- env.js ----
/* Environment modeling: turns the schedule + forecast into the conditions you'll actually wear in */
(function (G) {
  const FPI = (G.FPI = G.FPI || {});
  const U = FPI.U, W = FPI.Weather, C = FPI.Catalog;

  const SIZE_BASE = { small: 4.5, medium: 5.5, large: 6.5 };
  const OCC_ADJ = { low: 0.3, medium: -0.4, high: -1 };
  const PROX_ADJ = { close: -1.2, normal: 0, distant: 0.8 };
  const VENT_ADJ = { low: -0.5, medium: 0, high: 0.4 };
  const OCC_DEW = { low: 0, medium: 1, high: 2 }; // people add moisture to a room

  // How much projection (0–10 scale) a space comfortably absorbs before it reads as too much.
  function tolerance(env, prefs) {
    let t;
    if (env.kind === 'outdoor') t = 8;
    else t = (SIZE_BASE[env.size] || 5.5) + (OCC_ADJ[env.occupancy] || 0) + (PROX_ADJ[env.proximity] || 0) + (VENT_ADJ[env.ventilation] || 0);
    const sens = prefs && Number.isFinite(prefs.sensitivity) ? prefs.sensitivity : 5;
    return U.clamp(t + (5 - sens) * 0.15, 2, 9);
  }

  function scheduleFor(settings, date) {
    const ov = settings.schedule && settings.schedule.overrides && settings.schedule.overrides[date];
    if (ov && ov.length) return { blocks: U.clone(ov), custom: true };
    const dow = U.parseDateKey(date).getDay();
    const wk = (settings.schedule && settings.schedule.week && settings.schedule.week[dow]) || [];
    return { blocks: U.clone(wk), custom: false };
  }

  function resolveHvac(env, outT) {
    if (env.kind === 'outdoor') return 'none';
    if (env.hvac && env.hvac !== 'auto') return env.hvac;
    if (!Number.isFinite(outT)) return 'unknown';
    if (outT < 60) return 'heat';
    if (outT > 76) return 'ac';
    return 'vent';
  }

  // Conditions inside an environment at one moment, with a source label on each figure.
  function conditionsAt(env, out, wxSource) {
    const outT = out ? (Number.isFinite(out.feelsF) ? out.feelsF : out.tempF) : NaN;
    const outAir = out ? out.tempF : NaN;
    const outDew = out ? out.dewF : NaN;
    const fcLabel = wxSource === 'manual' ? 'from your entry' : 'forecast';
    if (env.kind === 'outdoor') {
      const sunBoost = out && Number.isFinite(out.uv) ? Math.min(6, out.uv * 0.8) : 0;
      return { tempF: outT + sunBoost, airF: outAir, rh: out ? out.rh : NaN, dewF: outDew, windMph: out && Number.isFinite(out.windMph) ? out.windMph : 0,
        uv: out ? out.uv : NaN, precipProb: out ? out.precipProb : NaN, hvac: 'none', src: { temp: fcLabel, rh: fcLabel } };
    }
    const hvac = resolveHvac(env, outAir);
    const set = Number.isFinite(env.tempF) ? env.tempF : 70;
    let T = set;
    if (hvac === 'vent' && Number.isFinite(outAir)) T = set + 0.3 * (outAir - set);
    if (hvac === 'none' && Number.isFinite(outAir)) T = set + 0.5 * (outAir - set);
    if (env.kind === 'vehicle' && Number.isFinite(outT)) T = 0.65 * T + 0.35 * outT; // cabin warms/cools during short drives
    let rh, rhSrc;
    if (Number.isFinite(env.rh)) { rh = env.rh; rhSrc = 'your estimate'; }
    else if (Number.isFinite(outDew)) {
      let dewIn = outDew + (OCC_DEW[env.occupancy] || 0);
      if (hvac === 'ac') dewIn = Math.min(dewIn, 55);
      rh = U.rhFromDew(T, Math.min(dewIn, T - 1));
      rhSrc = hvac === 'ac' ? 'derived (A/C dries air)' : hvac === 'heat' ? 'derived (heated outdoor air)' : 'derived';
    } else { rh = NaN; rhSrc = 'unknown'; }
    const tempSrc = env.kind === 'vehicle' ? 'estimate' : env.confirmed ? 'your estimate' : 'assumption';
    return { tempF: T, airF: T, rh, dewF: U.dewPointF(T, rh), windMph: 0, uv: NaN, precipProb: out ? out.precipProb : NaN, hvac, src: { temp: tempSrc, rh: rhSrc } };
  }

  function buildDay(settings, weather, date, opts = {}) {
    const prefs = settings.prefs || {};
    const envs = settings.envs || C.DEFAULT_ENVS;
    const envById = (id) => envs.find((e) => e.id === id) || envs.find((e) => e.id === 'home') || C.DEFAULT_ENVS[0];
    const occasion = opts.occasion && opts.occasion !== 'day' ? C.OCCASIONS[opts.occasion] : null;
    let raw, custom = false;
    if (occasion) {
      raw = [{ id: 'occ', start: occasion.start, end: occasion.end, label: occasion.label, env: occasion.env, activity: occasion.activity }];
    } else {
      const s = opts.blocks ? { blocks: opts.blocks, custom: true } : scheduleFor(settings, date);
      raw = s.blocks; custom = s.custom;
    }
    raw = raw.filter((b) => b.start && b.end && U.clockToH(b.end) > U.clockToH(b.start)).sort((a, b) => U.clockToH(a.start) - U.clockToH(b.start));
    const wx = weather && weather.hourly && weather.hourly.some((h) => h.date === date) ? weather : null;
    const wxSource = wx ? wx.source : 'none';

    const blocks = raw.map((b) => {
      const env = envById(b.env);
      const act = C.ACTIVITIES[b.activity] || C.ACTIVITIES.home;
      const sH = U.clockToH(b.start), eH = U.clockToH(b.end), hours = eH - sH;
      const samples = [];
      const step = hours > 1 ? 0.5 : hours / 2;
      for (let h = sH + step / 2; h < eH; h += step) {
        const out = wx ? W.atHour(wx, date, h) : null;
        samples.push(conditionsAt(env, out, wxSource));
      }
      const mean = (k) => U.avg(samples.map((s) => s[k]).filter(Number.isFinite));
      const outMid = wx ? W.atHour(wx, date, (sH + eH) / 2) : null;
      const cond = {
        tempF: mean('tempF'), rh: mean('rh'), dewF: mean('dewF'), windMph: mean('windMph') || 0, uv: mean('uv'),
        precipProb: Math.max(0, ...samples.map((s) => s.precipProb).filter(Number.isFinite)), hvac: samples[0] ? samples[0].hvac : 'unknown',
        src: samples[0] ? samples[0].src : { temp: 'unknown', rh: 'unknown' },
        outTempF: outMid ? outMid.tempF : NaN, outDewF: outMid ? outMid.dewF : NaN,
      };
      return {
        id: b.id || `${b.start}-${b.env}`, start: b.start, end: b.end, label: b.label || act.label, envId: env.id, env, activity: b.activity,
        act, startH: sH, endH: eH, hours, weight: hours * act.relevance, cond, tolerance: tolerance(env, prefs),
        isOutdoor: env.kind === 'outdoor', isIndoor: env.kind !== 'outdoor',
      };
    });

    // Transitions between consecutive spaces (you pass through outdoor air between buildings)
    const transitions = [];
    for (let i = 0; i < blocks.length - 1; i++) {
      const a = blocks[i], b = blocks[i + 1];
      if (b.startH - a.endH > 1.5 || a.envId === b.envId || b.env.kind !== 'indoor') continue;
      const at = b.startH;
      const out = wx ? W.atHour(wx, date, at) : null;
      const passOut = a.env.kind !== 'indoor' || b.env.kind !== 'indoor';
      const fromT = passOut && out ? out.feelsF : a.cond.tempF;
      const fromRh = passOut && out ? out.rh : a.cond.rh;
      const dT = b.cond.tempF - fromT, dRH = b.cond.rh - fromRh;
      let type = null, note = '';
      if (Number.isFinite(fromT) && fromT <= 45 && b.isIndoor && dT >= 20) { type = 'cold-to-warm'; note = `${Math.round(fromT)}°F outside → ~${Math.round(b.cond.tempF)}°F inside: warming skin and clothing make dense base notes bloom.`; }
      else if (Number.isFinite(fromT) && fromT >= 85 && dT <= -12) { type = 'hot-to-cool'; note = `${Math.round(fromT)}°F outside → ~${Math.round(b.cond.tempF)}°F A/C: heat-boosted sillage arrives with you, then contracts.`; }
      else if (Number.isFinite(dRH) && dRH <= -30) { type = 'humid-to-dry'; note = `Humidity drops ~${Math.round(-dRH)} points entering ${b.env.name.toLowerCase()}: scent can feel sharper, then fade faster.`; }
      else if (Number.isFinite(dRH) && dRH >= 30) { type = 'dry-to-humid'; note = `Humidity jumps ~${Math.round(dRH)} points: sweet notes can feel heavier.`; }
      if (type) transitions.push({ at, from: a.id, to: b.id, fromLabel: a.label, toLabel: b.label, dT, dRH, type, note, toTolerance: b.tolerance });
    }

    // Outdoor picture over waking hours
    let outdoor = null;
    if (wx && blocks.length) {
      const sH = Math.floor(blocks[0].startH), eH = Math.ceil(blocks[blocks.length - 1].endH);
      const hrs = W.hoursFor(wx, date).filter((x) => x.h >= sH && x.h <= eH);
      const pick = (k) => hrs.map((x) => x[k]).filter(Number.isFinite);
      const daily = W.dayFor(wx, date);
      outdoor = {
        highF: daily && Number.isFinite(daily.highF) ? daily.highF : Math.max(...pick('tempF')),
        lowF: daily && Number.isFinite(daily.lowF) ? daily.lowF : Math.min(...pick('tempF')),
        wakeMinF: Math.min(...pick('tempF')), wakeMaxF: Math.max(...pick('tempF')),
        meanF: U.avg(pick('feelsF').length ? pick('feelsF') : pick('tempF')), meanDewF: U.avg(pick('dewF')), maxDewF: Math.max(...pick('dewF')),
        meanRh: U.avg(pick('rh')), meanWind: U.avg(pick('windMph')), maxPrecip: pick('precipProb').length ? Math.max(...pick('precipProb')) : NaN,
        maxUv: pick('uv').length ? Math.max(...pick('uv')) : NaN,
      };
    }

    let applyAt;
    if (opts.appliedAt) applyAt = U.clockToH(opts.appliedAt);
    else if (blocks.length) {
      const prep = blocks.find((b) => b.activity === 'prep');
      applyAt = prep ? prep.endH - 0.1 : Math.max(0, blocks[0].startH - 0.25);
    } else applyAt = 7;

    const totalW = blocks.reduce((s, b) => s + b.weight, 0);
    const indoorW = blocks.filter((b) => b.isIndoor).reduce((s, b) => s + b.weight, 0);
    const assumptions = [...new Set(blocks.filter((b) => b.isIndoor && b.env.kind !== 'vehicle' && !b.env.confirmed).map((b) => b.env.name))];
    return {
      date, occasion: occasion ? opts.occasion : 'day', occasionLabel: occasion ? occasion.label : 'Full day', custom,
      blocks, transitions, outdoor, applyAt, weatherSource: wxSource, hasWeather: !!wx,
      indoorFrac: totalW ? indoorW / totalW : 1, totalWeight: totalW, assumptions,
      spanH: blocks.length ? blocks[blocks.length - 1].endH - applyAt : 0,
      activities: [...new Set(blocks.map((b) => b.activity))],
    };
  }

  // Compact description of a day's conditions, stored with journal entries for later matching.
  function conditionSummary(day) {
    const o = day.outdoor || {};
    const indoorBlocks = day.blocks.filter((b) => b.isIndoor);
    return {
      outMeanF: Number.isFinite(o.meanF) ? U.round(o.meanF, 1) : null, highF: Number.isFinite(o.highF) ? U.round(o.highF) : null,
      lowF: Number.isFinite(o.lowF) ? U.round(o.lowF) : null, dewF: Number.isFinite(o.meanDewF) ? U.round(o.meanDewF, 1) : null,
      rh: Number.isFinite(o.meanRh) ? U.round(o.meanRh) : null, windMph: Number.isFinite(o.meanWind) ? U.round(o.meanWind, 1) : null,
      indoorRh: indoorBlocks.length ? U.round(U.wavg(indoorBlocks.map((b) => [b.cond.rh, b.weight]))) : null,
      indoorFrac: U.round(day.indoorFrac, 2), activities: day.activities, envs: [...new Set(day.blocks.map((b) => b.envId))],
      source: day.weatherSource,
    };
  }

  FPI.Env = { tolerance, scheduleFor, resolveHvac, conditionsAt, buildDay, conditionSummary };
  if (typeof module !== 'undefined') module.exports = FPI.Env;
})(typeof window !== 'undefined' ? window : globalThis);

// ---- learn.js ----
/* Personal learning: everything here is computed only from journal entries you recorded */
(function (G) {
  const FPI = (G.FPI = G.FPI || {});
  const U = FPI.U;

  const LEVEL_TO_PROJ = [0, 2, 4, 6, 8]; // check-in level (0 gone … 4 strong) → 0–10 projection
  const CHECK_HOURS = { h1: 1, h3: 3, h6: 6, h8: 8 };
  const LEVEL_WORDS = ['Gone', 'Skin scent', 'Arm’s length', 'Noticeable', 'Strong'];

  function longevityOf(e) {
    if (Number.isFinite(e.lastedH) && e.lastedH > 0) return { hours: e.lastedH, bound: 'exact' };
    const c = e.checkins || {};
    const pts = Object.entries(CHECK_HOURS).filter(([k]) => Number.isFinite(c[k])).map(([k, h]) => ({ h, v: c[k] })).sort((a, b) => a.h - b.h);
    if (!pts.length) return null;
    let lastAlive = null, firstGone = null;
    pts.forEach((p) => { if (p.v >= 1) lastAlive = p.h; else if (firstGone == null && (lastAlive == null || p.h > lastAlive)) firstGone = p.h; });
    if (lastAlive == null) return firstGone ? { hours: firstGone / 2, bound: 'atMost' } : null;
    if (firstGone && firstGone > lastAlive) return { hours: (lastAlive + firstGone) / 2, bound: 'between' };
    return { hours: lastAlive === 8 ? 9 : lastAlive, bound: 'atLeast' };
  }

  function openingProjection(e) {
    if (Number.isFinite(e.projection)) return e.projection;
    const c = e.checkins || {};
    if (Number.isFinite(c.h1)) return LEVEL_TO_PROJ[c.h1];
    return NaN;
  }

  // Outcome of one wear on a 0–100 scale (only from what you recorded)
  function outcome(e, prefs) {
    const parts = [];
    if (Number.isFinite(e.enjoyment)) parts.push([((e.enjoyment - 1) / 4) * 100, 0.5]);
    if (e.wearAgain) parts.push([{ yes: 100, maybe: 55, no: 0 }[e.wearAgain] ?? 55, 0.3]);
    let perf = null;
    if (e.strength) perf = { right: 100, faint: 45, strong: 35 }[e.strength];
    if (e.tooSweet) perf = Math.min(perf == null ? 100 : perf, 30);
    if (perf != null) parts.push([perf, 0.2]);
    if (!parts.length) return null;
    let v = U.wavg(parts);
    if (prefs && prefs.countCompliments && e.compliments > 0) v = Math.min(100, v + 5);
    return v;
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    let d = 0, terms = 0;
    if (Number.isFinite(a.outMeanF) && Number.isFinite(b.outMeanF)) { d += ((a.outMeanF - b.outMeanF) / 12) ** 2; terms++; }
    if (Number.isFinite(a.dewF) && Number.isFinite(b.dewF)) { d += ((a.dewF - b.dewF) / 10) ** 2; terms++; }
    if (Number.isFinite(a.indoorFrac) && Number.isFinite(b.indoorFrac)) { d += ((a.indoorFrac - b.indoorFrac) / 0.35) ** 2; terms++; }
    if (!terms) return 0.3; // no comparable conditions: weak, not zero
    return Math.exp(-d / 2);
  }

  function matchHistory(fragId, summary, journal, prefs) {
    const rows = journal.filter((e) => e.fragranceId === fragId).map((e) => ({ e, o: outcome(e, prefs) })).filter((r) => r.o != null);
    if (!rows.length) return { score: 50, conf: 0, n: 0, neff: 0, raw: null, matches: [] };
    const scored = rows.map((r) => ({ ...r, sim: similarity(summary, r.e.cond) })).sort((a, b) => b.sim - a.sim);
    const neff = scored.reduce((s, r) => s + r.sim, 0);
    const raw = neff > 0 ? scored.reduce((s, r) => s + r.sim * r.o, 0) / neff : 50;
    let conf = neff / (neff + 2);
    if (rows.length < 2) conf = Math.min(conf, 0.25); // never lean hard on a single wear
    return { score: 50 + conf * (raw - 50), conf, n: rows.length, neff, raw, matches: scored.slice(0, 3) };
  }

  function personalPerf(fragId, journal) {
    const es = journal.filter((e) => e.fragranceId === fragId);
    const longs = es.map(longevityOf).filter(Boolean).map((l) => l.hours);
    const projs = es.map((e) => {
      const p = openingProjection(e); const s = Number.isFinite(e.sprays) && e.sprays > 0 ? e.sprays : 3;
      return Number.isFinite(p) ? p / Math.sqrt(s / 3) : NaN; // normalize to a 3-spray equivalent
    }).filter(Number.isFinite);
    return { longevityH: U.median(longs), nLong: longs.length, projOpen: U.avg(projs), nProj: projs.length, wears: es.length };
  }

  function wearStats(frags, journal, today) {
    const map = {};
    frags.forEach((f) => { map[f.id] = { count: 0, last: null, recent30: 0 }; });
    journal.forEach((e) => {
      const m = map[e.fragranceId]; if (!m) return;
      m.count++; if (!m.last || e.date > m.last) m.last = e.date;
      if (today && U.daysBetween(e.date, today) <= 30) m.recent30++;
    });
    return map;
  }

  // ---- Adaptive weights ----------------------------------------------------
  const MIN_ADAPT = 8;
  function adaptiveWeights(base, journal, enabled) {
    const norm = normalizeWeights(base);
    const usable = journal.filter((e) => e.factorSnapshot && Number.isFinite(e.enjoyment));
    const n = usable.length;
    const details = {};
    Object.keys(norm).forEach((k) => { details[k] = { base: norm[k], adapted: norm[k], r: null }; });
    if (!enabled || n < MIN_ADAPT) return { weights: norm, active: false, n, need: Math.max(0, MIN_ADAPT - n), details };
    const enjoy = usable.map((e) => e.enjoyment);
    const w = {};
    Object.keys(norm).forEach((k) => {
      if (k === 'history') { w[k] = norm[k] * (1 + Math.min(1, n / 30)); details[k].r = null; return; }
      const xs = usable.map((e) => Number(e.factorSnapshot[k]));
      const r = xs.every(Number.isFinite) ? U.pearson(xs, enjoy) : 0;
      details[k].r = U.round(r, 2);
      w[k] = norm[k] * (1 + U.clamp(r, -0.6, 0.6) * 0.6);
    });
    const out = normalizeWeights(w);
    Object.keys(out).forEach((k) => { details[k].adapted = out[k]; });
    return { weights: out, active: true, n, need: 0, details };
  }
  function normalizeWeights(w) {
    const keys = Object.keys(w); const s = keys.reduce((a, k) => a + Math.max(0, Number(w[k]) || 0), 0) || 1;
    const out = {}; keys.forEach((k) => { out[k] = (Math.max(0, Number(w[k]) || 0) / s) * 100; }); return out;
  }

  // ---- Pattern detection -----------------------------------------------------
  const confWord = (n) => (n >= 10 ? 'strong' : n >= 6 ? 'moderate' : 'tentative');
  function patterns(frags, journal, prefs) {
    const out = [];
    frags.forEach((f) => {
      const es = journal.filter((e) => e.fragranceId === f.id && e.cond);
      const rated = es.map((e) => ({ e, o: outcome(e, prefs) })).filter((r) => r.o != null);
      if (rated.length < 4) return;
      const split = (pred) => rated.filter((r) => pred(r.e.cond));
      const cmp = (a, b, labelA, labelB, kind) => {
        if (a.length < 2 || b.length < 2) return;
        const ma = U.avg(a.map((r) => r.o)), mb = U.avg(b.map((r) => r.o));
        if (Math.abs(ma - mb) < 18) return;
        const better = ma > mb ? labelA : labelB;
        out.push({ fragId: f.id, kind, confidence: confWord(a.length + b.length),
          text: `${f.name} has gone better for you ${better}.`,
          detail: `${labelA}: avg ${Math.round(ma)}/100 (n=${a.length}) · ${labelB}: avg ${Math.round(mb)}/100 (n=${b.length})` });
      };
      cmp(split((c) => c.outMeanF != null && c.outMeanF < 55), split((c) => c.outMeanF != null && c.outMeanF >= 70), 'on cool days (<55°F)', 'on warm days (70°F+)', 'temperature');
      cmp(split((c) => c.dewF != null && c.dewF < 45), split((c) => c.dewF != null && c.dewF >= 60), 'in dry air (dew pt <45°F)', 'in humid air (dew pt 60°F+)', 'humidity');
      cmp(split((c) => c.indoorFrac != null && c.indoorFrac >= 0.85), split((c) => c.indoorFrac != null && c.indoorFrac < 0.6), 'on mostly-indoor days', 'on days with more time outside', 'indoor');
      const warm = es.filter((e) => e.cond.outMeanF != null && e.cond.outMeanF >= 72);
      const sweet = warm.filter((e) => e.tooSweet);
      if (warm.length >= 2 && sweet.length >= 2 && sweet.length / warm.length >= 0.5) {
        out.push({ fragId: f.id, kind: 'sweet-heat', confidence: confWord(warm.length), text: `${f.name} tends to turn too sweet for you on warm days.`, detail: `Marked too sweet on ${sweet.length} of ${warm.length} wears at 72°F+.` });
      }
      const withL = es.map((e) => ({ e, l: longevityOf(e) })).filter((r) => r.l && r.e.moisturized != null);
      const m1 = withL.filter((r) => r.e.moisturized).map((r) => r.l.hours), m0 = withL.filter((r) => !r.e.moisturized).map((r) => r.l.hours);
      if (m1.length >= 2 && m0.length >= 2 && Math.abs(U.median(m1) - U.median(m0)) >= 1) {
        const better = U.median(m1) > U.median(m0);
        out.push({ fragId: f.id, kind: 'skin', confidence: confWord(m1.length + m0.length),
          text: `${f.name} lasts ${better ? 'longer' : 'shorter'} on moisturized skin.`, detail: `Median ${U.round(U.median(m1), 1)} h moisturized (n=${m1.length}) vs ${U.round(U.median(m0), 1)} h not (n=${m0.length}).` });
      }
      const bySpray = {};
      rated.forEach((r) => { const s = r.e.sprays; if (!Number.isFinite(s)) return; (bySpray[s] = bySpray[s] || []).push(r.o); });
      const sprayRows = Object.entries(bySpray).filter(([, v]) => v.length >= 2).map(([s, v]) => ({ s: Number(s), m: U.avg(v), n: v.length }));
      if (sprayRows.length >= 2) {
        sprayRows.sort((a, b) => b.m - a.m);
        if (sprayRows[0].m - sprayRows[sprayRows.length - 1].m >= 15) {
          out.push({ fragId: f.id, kind: 'sprays', confidence: confWord(sprayRows.reduce((s, r) => s + r.n, 0)),
            text: `${f.name}: ${sprayRows[0].s} sprays has worked best so far.`, detail: sprayRows.map((r) => `${r.s} sprays avg ${Math.round(r.m)} (n=${r.n})`).join(' · ') });
        }
      }
    });
    return out;
  }

  // ---- "Ask your data" questions --------------------------------------------
  function groupBest(frags, rows, valueOf, opts = {}) {
    const by = {};
    rows.forEach((e) => { const v = valueOf(e); if (!Number.isFinite(v)) return; (by[e.fragranceId] = by[e.fragranceId] || []).push(v); });
    const min = opts.min || 2;
    const list = Object.entries(by).filter(([id, v]) => v.length >= min && frags.find((f) => f.id === id))
      .map(([id, v]) => ({ fragId: id, name: frags.find((f) => f.id === id).name, value: opts.median ? U.median(v) : U.avg(v), n: v.length }))
      .sort((a, b) => (opts.asc ? a.value - b.value : b.value - a.value));
    return list;
  }
  function questions(frags, journal, prefs) {
    const q = [];
    const out = (e) => outcome(e, prefs);
    const lng = (e) => { const l = longevityOf(e); return l ? l.hours : NaN; };
    const withCond = journal.filter((e) => e.cond);
    const mk = (id, title, rows, unit, needText, fmt) => {
      const top = rows[0];
      q.push({ id, title, rows, answer: top ? `${top.name} — ${fmt(top.value)} (${top.n} log${top.n > 1 ? 's' : ''})` : null,
        need: top ? null : needText, unit });
    };
    mk('humid', 'Which performs best above 75% humidity?', groupBest(frags, withCond.filter((e) => e.cond.rh != null && e.cond.rh > 75), out), 'outcome',
      'Needs at least 2 rated wears of one fragrance on days averaging over 75% humidity.', (v) => `avg ${Math.round(v)}/100`);
    mk('coldlong', 'Which lasts longest below 50°F?', groupBest(frags, withCond.filter((e) => e.cond.outMeanF != null && e.cond.outMeanF < 50), lng, { median: true }), 'hours',
      'Needs at least 2 wears of one fragrance below 50°F with a longevity check-in.', (v) => `median ${U.round(v, 1)} h`);
    const hot = withCond.filter((e) => e.cond.outMeanF != null && e.cond.outMeanF >= 75);
    mk('sweet', 'Which become too sweet when it’s hot?', groupBest(frags, hot, (e) => (e.tooSweet ? 100 : 0)).filter((r) => r.value >= 50), 'percent',
      'Needs at least 2 wears at 75°F+ where you marked “too sweet” half the time or more. None so far.', (v) => `too sweet on ${Math.round(v)}% of hot wears`);
    const fullDay = journal.filter((e) => e.cond && (e.cond.activities || []).includes('class') && (e.cond.activities || []).includes('work'));
    mk('fullday', 'Which works best for a full school-and-work day?', groupBest(frags, fullDay, (e) => { const o = out(e); const l = lng(e); return o == null ? NaN : o + (Number.isFinite(l) ? Math.min(l, 12) * 2 : 0); }), 'score',
      'Needs at least 2 logged wears on days with both class and a work shift.', (v) => `combined ${Math.round(v)}`);
    mk('moderate', 'Which gives the moderate projection you like?', groupBest(frags, journal.filter((e) => e.strength), (e) => (e.strength === 'right' ? 100 : 0)), 'percent',
      'Needs at least 2 wears of one fragrance with a strength rating.', (v) => `“just right” on ${Math.round(v)}% of wears`);
    const vers = frags.map((f) => {
      const es = withCond.filter((e) => e.fragranceId === f.id);
      const good = es.filter((e) => (out(e) || 0) >= 70);
      if (es.length < 3) return null;
      const bands = new Set(good.map((e) => (e.cond.outMeanF < 50 ? 'cold' : e.cond.outMeanF < 70 ? 'mild' : 'warm')));
      const l = U.median(es.map(lng));
      return { fragId: f.id, name: f.name, value: bands.size * 25 + (Number.isFinite(l) ? Math.min(l, 12) * 4 : 0), n: es.length };
    }).filter(Boolean).sort((a, b) => b.value - a.value);
    mk('versatile', 'Best balance of versatility and performance?', vers, 'score', 'Needs at least 3 logged wears of a fragrance across different conditions.', (v) => `score ${Math.round(v)}`);
    return q;
  }

  FPI.Learn = { LEVEL_TO_PROJ, LEVEL_WORDS, CHECK_HOURS, longevityOf, openingProjection, outcome, similarity, matchHistory, personalPerf, wearStats,
    adaptiveWeights, normalizeWeights, patterns, questions, MIN_ADAPT };
  if (typeof module !== 'undefined') module.exports = FPI.Learn;
})(typeof window !== 'undefined' ? window : globalThis);

// ---- engine.js ----
/* Recommendation engine: seven explainable factors, a projection model, spray count, rotation and confidence */
(function (G) {
  const FPI = (G.FPI = G.FPI || {});
  const U = FPI.U, C = FPI.Catalog, L = FPI.Learn, Env = FPI.Env;
  const r0 = (v) => Math.round(v);

  // ---- Performance model ------------------------------------------------------
  // Levels use one 0–10 scale everywhere: 2 skin scent · 4 arm's length · 6 noticeable nearby · 8 fills a room.
  const tempIntensity = (T) => (Number.isFinite(T) ? U.clamp(1 + 0.012 * (T - 72), 0.7, 1.35) : 1);
  const humIntensity = (rh) => (Number.isFinite(rh) ? U.clamp(1 + 0.004 * (rh - 45), 0.88, 1.15) : 1);
  const windFactor = (w) => 1 / (1 + 0.04 * (Number.isFinite(w) ? w : 0));
  const tempLong = (T) => (Number.isFinite(T) ? U.clamp(1 - 0.008 * (T - 72), 0.75, 1.2) : 1);
  const humLong = (rh) => (Number.isFinite(rh) ? U.clamp(1 + 0.003 * (rh - 45), 0.9, 1.08) : 1);

  function levelWord(p) {
    if (p < 1) return 'gone';
    if (p < 2.5) return 'skin scent';
    if (p < 4) return 'arm’s length';
    if (p < 6) return 'noticeable nearby';
    if (p < 7.5) return 'fills the space';
    return 'loud';
  }

  // Blend published/estimated figures with your logs (your data takes over as it accumulates)
  function perfFor(frag, journal) {
    const base = frag.perf || {};
    const mine = L.personalPerf(frag.id, journal);
    const k = 3;
    let longevityH = Number(base.longevityH) || 6, projOpen = Number(base.projOpen) || 5, projDry = Number(base.projDry) || Math.max(2, projOpen - 2);
    const src = { long: (frag.perfSource && frag.perfSource.type) || 'estimate', proj: (frag.perfSource && frag.perfSource.type) || 'estimate' };
    if (mine.nLong > 0) { const w = mine.nLong / (mine.nLong + k); longevityH = longevityH * (1 - w) + mine.longevityH * w; src.long = `blend:${mine.nLong}`; }
    if (mine.nProj > 0) { const w = mine.nProj / (mine.nProj + k); const ratio = projDry / projOpen; projOpen = projOpen * (1 - w) + mine.projOpen * w; projDry = projOpen * ratio; src.proj = `blend:${mine.nProj}`; }
    return { longevityH, projOpen, projDry, src, mine };
  }

  function dayLongFactor(day, perf, prefs) {
    const end = day.applyAt + perf.longevityH;
    const pairs = day.blocks.filter((b) => b.startH < end).map((b) => [tempLong(b.cond.tempF) * humLong(b.cond.rh), b.hours]);
    const f = pairs.length ? U.wavg(pairs) : 1;
    return (Number.isFinite(f) ? f : 1) * (prefs && prefs.moisturize ? 1.08 : 1);
  }

  function projectionAt(perf, Leff, t, cond, sprays) {
    if (t < 0) return 0;
    const base = perf.projDry + (perf.projOpen - perf.projDry) * Math.exp(-t / 1.2);
    const fade = t < 0.4 * Leff ? 1 : Math.pow(Math.max(0, 1 - (t - 0.4 * Leff) / (0.6 * Leff)), 0.8);
    const env = tempIntensity(cond.tempF) * humIntensity(cond.rh) * (cond.windMph ? windFactor(cond.windMph) : 1);
    return base * fade * env * Math.sqrt(Math.max(0.5, sprays) / 3);
  }

  function blockAt(day, h) {
    let cur = null;
    for (const b of day.blocks) { if (b.startH <= h) cur = b; if (h < b.endH && b.startH <= h) return { b, inside: true }; }
    return cur ? { b: cur, inside: false } : day.blocks[0] ? { b: day.blocks[0], inside: false } : null;
  }

  // Evaluate space fit for a spray count: overshoot (too loud for the room) and undershoot (gone when you want it)
  function evalSpace(day, perf, Leff, sprays, prefs) {
    let pen = 0, wsum = 0; const rows = [];
    const target = prefs.projection ?? 5;
    day.blocks.forEach((b) => {
      if (b.endH <= day.applyAt) return;
      const pts = [b.startH, (b.startH + b.endH) / 2, b.endH - 0.01].map((h) => Math.max(h, day.applyAt));
      const ps = pts.map((h) => projectionAt(perf, Leff, h - day.applyAt, b.cond, sprays));
      const peak = Math.max(...ps), mean = U.avg(ps);
      const over = Math.max(0, peak - b.tolerance);
      const minWanted = b.act.desire * Math.max(1, target - 1);
      const under = Math.max(0, minWanted - mean);
      const w = b.weight || 0.01;
      const others = b.env.occupancy === 'low' ? (b.act.desire === 0 ? 0.25 : 0.4) : 1; // mostly alone: loudness matters less
      pen += w * (12 * over * others + 6 * under); wsum += w;
      rows.push({ id: b.id, label: b.label, peak, mean, over, under, others, tol: b.tolerance, minWanted, startH: b.startH, endH: b.endH, act: b.activity, weight: w, relevance: b.act.relevance });
    });
    return { pen: wsum ? pen / wsum : 0, rows };
  }

  function chooseSprays(day, perf, Leff, prefs) {
    const lo = Math.max(1, prefs.minSprays || 1), hi = Math.max(lo, prefs.maxSprays || 5);
    const target = prefs.projection ?? 5;
    const first = day.blocks.find((b) => b.endH > day.applyAt && b.act.relevance >= 0.9) || day.blocks.find((b) => b.endH > day.applyAt);
    let best = null;
    for (let s = lo; s <= hi; s++) {
      const ev = evalSpace(day, perf, Leff, s, prefs);
      let cost = ev.pen;
      if (first) {
        const t = Math.max(0, (first.startH + first.endH) / 2 - day.applyAt);
        const p = projectionAt(perf, Leff, t, first.cond, s);
        cost += Math.abs(Math.min(target, first.tolerance) - p) * 2;
      }
      if (!best || cost < best.cost - 0.01) best = { s, cost, ev };
    }
    return best;
  }

  // ---- Factors ---------------------------------------------------------------
  const fit = (T, lo, hi) => (!Number.isFinite(T) ? NaN : T < lo ? Math.max(0, 100 - 3 * (lo - T)) : T > hi ? Math.max(0, 100 - 3 * (T - hi)) : 100);

  function factorWeather(frag, day) {
    const u = frag.usage || {};
    const lo = u.tempLo ?? 35, hi = u.tempHi ?? 75;
    const per = day.blocks.map((b) => ({ b, v: fit(b.cond.tempF, lo, hi) }));
    const envFit = U.wavg(per.map((p) => [p.v, p.b.weight]));
    const o = day.outdoor;
    const dayFit = o ? fit(o.meanF, lo, hi) : NaN;
    if (!Number.isFinite(envFit) && !Number.isFinite(dayFit)) return { score: 50, reason: 'No temperature data today.', details: [] };
    const score = Number.isFinite(dayFit) ? 0.65 * (Number.isFinite(envFit) ? envFit : dayFit) + 0.35 * dayFit : envFit;
    const worst = per.filter((p) => Number.isFinite(p.v)).sort((a, b) => a.v - b.v)[0];
    const inT = U.wavg(day.blocks.filter((b) => b.isIndoor).map((b) => [b.cond.tempF, b.weight]));
    let concern = null;
    if (worst && worst.v < 85) concern = `Outside its ~${lo}–${hi}°F comfort range during ${worst.b.label.toLowerCase()} (~${r0(worst.b.cond.tempF)}°F).`;
    else if (Number.isFinite(dayFit) && dayFit < 80) concern = `Today’s outdoor air (avg ~${r0(o.meanF)}°F) sits outside its ~${lo}–${hi}°F comfort range; time indoors softens that.`;
    const reason = !o ? `Indoor temperatures sit inside its ~${lo}–${hi}°F range.`
      : concern ? `Your indoor hours (~${r0(inT || 70)}°F) suit it, though outdoors runs past its ~${lo}–${hi}°F range.`
      : `Fits today’s ${r0(o.wakeMinF)}–${r0(o.wakeMaxF)}°F outdoors and ~${r0(inT || 70)}°F indoors (comfort range ~${lo}–${hi}°F).`;
    return { score, reason, concern, details: per.map((p) => ({ label: p.b.label, v: p.v })) };
  }

  function compBlock(t, T, dew, rh) {
    const heatLoad = Number.isFinite(T) ? U.clamp((T - 72) / 23, 0, 1) : 0;
    const mug = Number.isFinite(dew) ? U.clamp((dew - 58) / 14, 0, 1) : 0;
    const coldLoad = Number.isFinite(T) ? U.clamp((58 - T) / 30, 0, 1) : 0;
    const dryLoad = Number.isFinite(rh) ? U.clamp((35 - rh) / 25, 0, 1) : 0;
    const heavy = (0.5 * t.sweetness + 0.3 * t.density + 0.2 * t.amber) / 10;
    const terms = {
      cloy: -55 * heavy * (0.6 * heatLoad + 0.4 * mug),
      thin: -30 * U.clamp(((t.freshness + t.citrus) / 2 - t.density / 2 - t.warmth / 4) / 10, 0, 1) * coldLoad,
      warmFit: 22 * ((t.warmth + 0.5 * t.amber + 0.3 * t.sweetness + 0.2 * t.creamy) / 20) * coldLoad,
      freshFit: 15 * Math.max(0, (t.freshness + t.citrus) / 20 - heavy * 0.5) * heatLoad,
      dryFade: -12 * dryLoad * (10 - t.density) / 10,
      spiceHeat: -1.2 * t.spice * heatLoad,
    };
    const v = U.clamp(75 + Object.values(terms).reduce((s, x) => s + x, 0), 0, 100);
    return { v, terms };
  }
  function factorComposition(frag, day) {
    const t = Object.assign({ sweetness: 5, freshness: 5, warmth: 5, spice: 5, woody: 5, creamy: 5, citrus: 5, floral: 5, musk: 5, amber: 5, density: 5 }, frag.traits || {});
    const per = day.blocks.map((b) => ({ b, r: compBlock(t, b.cond.tempF, b.cond.dewF, b.cond.rh) }));
    const blockScore = U.wavg(per.map((p) => [p.r.v, p.b.weight]));
    const o = day.outdoor;
    const dayR = o ? compBlock(t, o.meanF, o.meanDewF, o.meanRh) : null;
    const score = dayR ? 0.6 * blockScore + 0.4 * dayR.v : blockScore;
    // Sum weighted terms to name what drives the score
    const agg = {};
    per.forEach((p) => Object.entries(p.r.terms).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + v * p.b.weight * 0.6 / (day.totalWeight || 1); }));
    if (dayR) Object.entries(dayR.terms).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + v * 0.4; });
    const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    const pos = sorted[0] && sorted[0][1] >= 0.8 ? sorted[0] : null;
    const neg = sorted[sorted.length - 1] && sorted[sorted.length - 1][1] <= -1.5 ? sorted[sorted.length - 1] : null;
    const indoorRh = U.wavg(day.blocks.filter((b) => b.isIndoor).map((b) => [b.cond.rh, b.weight]));
    const texts = {
      cloy: `Sweet, dense base (sweetness ${t.sweetness}/10) risks feeling heavy in today’s heat or humidity.`,
      thin: `Fresh top-heavy structure can feel thin and sharp in today’s cold.`,
      warmFit: `Warm, ambery structure has the mass to radiate in ${o ? r0(o.meanF) + '°F' : 'cool'} air without turning cloying.`,
      freshFit: `Fresh, airy structure carries well in warm conditions.`,
      dryFade: `Dry indoor air (~${r0(indoorRh)}% RH) shortens lighter blends; density ${t.density}/10 sets how well it holds.`,
      spiceHeat: `Spice reads hotter in heat.`,
    };
    const reason = pos ? texts[pos[0]] : `Balanced composition (density ${t.density}/10, sweetness ${t.sweetness}/10) for today’s conditions.`;
    const concern = neg ? texts[neg[0]] : null;
    return { score: Number.isFinite(score) ? score : 70, reason, concern, details: agg };
  }

  function factorHumidity(frag, day) {
    const u = frag.usage || {};
    const rhLo = u.rhLo ?? 20, rhHi = u.rhHi ?? 75, dewMax = u.dewMax ?? 60;
    const blockV = (rh, dew) => {
      if (!Number.isFinite(rh) && !Number.isFinite(dew)) return NaN;
      let v = 100;
      if (Number.isFinite(rh)) { if (rh < rhLo) v -= 1.2 * (rhLo - rh); if (rh > rhHi) v -= 1.5 * (rh - rhHi); }
      if (Number.isFinite(dew) && dew > dewMax) v -= 4.5 * (dew - dewMax);
      return U.clamp(v, 0, 100);
    };
    const per = day.blocks.map((b) => ({ b, v: blockV(b.cond.rh, b.cond.dewF) }));
    const bs = U.wavg(per.map((p) => [p.v, p.b.weight]));
    const o = day.outdoor;
    const ds = o ? blockV(o.meanRh, o.maxDewF) : NaN;
    const score = Number.isFinite(bs) && Number.isFinite(ds) ? 0.7 * bs + 0.3 * ds : Number.isFinite(bs) ? bs : Number.isFinite(ds) ? ds : 60;
    let concern = null;
    if (o && Number.isFinite(o.maxDewF) && o.maxDewF > dewMax) concern = `Dew point peaks near ${r0(o.maxDewF)}°F, above its ~${dewMax}°F comfort limit.`;
    else {
      const dry = per.filter((p) => Number.isFinite(p.b.cond.rh) && p.b.cond.rh < rhLo && p.b.act.relevance >= 0.9).sort((a, b) => a.b.cond.rh - b.b.cond.rh)[0];
      if (dry) concern = `Air in ${dry.b.label.toLowerCase()} runs ~${r0(dry.b.cond.rh)}% RH, drier than it prefers.`;
    }
    const reason = o ? `Dew point ${r0(o.meanDewF)}°F (${FPI.Weather.dewBand(o.meanDewF).label.toLowerCase()}) is within its ~${dewMax}°F comfort limit.` : 'Humidity is within its comfort zone.';
    return { score, reason, concern, details: per.map((p) => ({ label: p.b.label, v: p.v })) };
  }

  function factorSpace(frag, day, perf, Leff, choice) {
    const ev = choice.ev;
    let score = 100 - ev.pen;
    const tNotes = [];
    const t = frag.traits || {};
    day.transitions.forEach((tr) => {
      if (tr.type === 'cold-to-warm' && (t.density || 5) >= 7 && tr.toTolerance < 5.5) { score -= 4 * ((t.density || 5) - 6); tNotes.push(tr); }
      if (tr.type === 'hot-to-cool' && (t.sweetness || 5) >= 7) { score -= 3 * ((t.sweetness || 5) - 6); tNotes.push(tr); }
    });
    score = U.clamp(score, 0, 100);
    const sp = `${choice.s} spray${choice.s > 1 ? 's' : ''}`;
    const overRow = ev.rows.filter((r) => r.over * r.others > 0.5 && r.relevance >= 0.9).sort((a, b) => b.over * b.weight - a.over * a.weight)[0];
    const underRow = ev.rows.filter((r) => r.under > 0.8).sort((a, b) => b.under * b.weight - a.under * a.weight)[0];
    const tight = ev.rows.filter((r) => r.relevance >= 0.9).sort((a, b) => a.tol - b.tol)[0];
    let concern = null;
    if (overRow) concern = `Even at ${sp} it may crowd ${overRow.label.toLowerCase()}: ~${U.round(overRow.peak, 1)}/10 where ~${U.round(overRow.tol, 1)}/10 suits the space.`;
    else if (underRow) concern = `Fades to ${levelWord(underRow.mean)} by ${underRow.label.toLowerCase()}, when you’d want more presence.`;
    if (tNotes.length) concern = (concern ? concern + ' ' : '') + 'Dense base may bloom when you come in from the cold.';
    const reason = tight ? `At ${sp} it stays near what ${tight.label.toLowerCase()} comfortably absorbs (~${U.round(tight.tol, 1)}/10).` : 'No shared spaces scheduled.';
    return { score, reason, concern, details: ev.rows, transitions: tNotes };
  }

  function factorSchedule(frag, day) {
    const R = (frag.usage && frag.usage.ratings) || {};
    const per = day.blocks.map((b) => {
      let key = b.act.usage; let v = Number(R[key] ?? 5);
      if (b.startH >= 18 && key !== 'evening') v = 0.5 * v + 0.5 * Number(R.evening ?? 5);
      else if (b.startH < 17 && key !== 'daytime') v = 0.7 * v + 0.3 * Number(R.daytime ?? 5);
      return { b, key, v: v * 10 };
    });
    const avgV = U.wavg(per.map((p) => [p.v, p.b.weight]));
    const major = per.filter((p) => p.b.act.relevance >= 0.9 || p.b.hours >= 2);
    const keys = new Set(major.map((p) => p.key));
    let score = avgV;
    if (keys.size >= 3) score = 0.7 * avgV + 0.3 * Math.min(...major.map((p) => p.v));
    const best = major.slice().sort((a, b) => b.v - a.v)[0], worst = major.slice().sort((a, b) => a.v - b.v)[0];
    const labels = [...new Set(major.map((p) => p.b.label.toLowerCase()))].slice(0, 3);
    const reason = best ? (keys.size >= 3 ? `Versatile across your ${labels.join(', ')} (lowest fit ${r0(worst.v / 10)}/10).` : `Suits ${best.b.label.toLowerCase()} (${r0(best.v / 10)}/10).`) : 'Schedule-neutral.';
    const concern = worst && worst.v < 60 ? `Weaker fit for ${worst.b.label.toLowerCase()} (${r0(worst.v / 10)}/10).` : null;
    return { score: Number.isFinite(score) ? score : 60, reason, concern, details: per.map((p) => ({ label: p.b.label, v: p.v })) };
  }

  function factorPreference(frag, prefs) {
    const t = frag.traits || {}, p = frag.perf || {}, u = frag.usage || {};
    const dims = ['sweetness', 'freshness', 'warmth', 'spice'].filter((k) => Number.isFinite(prefs[k]) && Number.isFinite(t[k]));
    const traitFit = dims.length ? U.avg(dims.map((k) => 100 - 12 * Math.abs(t[k] - prefs[k]))) : 70;
    const mid = ((p.projOpen || 5) + (p.projDry || 4)) / 2;
    const projFit = 100 - 12 * Math.max(0, Math.abs(mid - (prefs.projection ?? 5)) - 0.5);
    const imp = prefs.longevityImportance ?? 5;
    const longFit = 100 - (p.longevityH < 6 ? imp * 1.5 * (6 - p.longevityH) : 0);
    let score = 0.55 * traitFit + 0.25 * projFit + 0.2 * longFit - 8; // leaves headroom for liked notes and families
    const notes = [], good = [];
    const tags = (frag.tags || []).map((x) => x.toLowerCase());
    const likes = (prefs.likes || []).map((x) => x.toLowerCase()), dislikes = (prefs.dislikes || []).map((x) => x.toLowerCase());
    const liked = likes.filter((l) => tags.includes(l)).slice(0, 2);
    if (liked.length) { score += 4 * liked.length; good.push(`has the ${liked.join(' + ')} character you like`); }
    const fams = [frag.families && frag.families.primary, frag.families && frag.families.secondary].filter(Boolean);
    if ((prefs.likedFamilies || []).some((f) => fams.includes(f))) score += 3;
    if ((prefs.dislikedFamilies || []).some((f) => fams.includes(f))) { score -= 15; notes.push('is in a family you marked as disliked'); }
    const disl = dislikes.filter((d) => tags.includes(d));
    if (disl.length) { score -= 10 * disl.length; notes.push(`is tagged ${disl.join(', ')}`); }
    if (dislikes.includes('polarizing') && (u.polarizing || 0) > 3) { score -= 6 * (u.polarizing - 3); notes.push('can be polarizing'); }
    if (dislikes.includes('loud') && (p.projOpen || 0) >= 7.5) { score -= 6 * ((p.projOpen || 0) - 7); notes.push('opens loud'); }
    score = U.clamp(score, 0, 100);
    const reason = good.length ? `It ${good.join('; ')}${traitFit >= 80 ? ', close to your taste profile' : ''}.` : traitFit >= 80 ? 'Close to your taste profile.' : 'A partial match to your taste profile.';
    const concern = notes.length ? `It ${notes.join('; ')}.` : null;
    return { score, reason, concern, details: { traitFit, projFit, longFit } };
  }

  // ---- Application advice ----------------------------------------------------
  function applicationSpots(day, sprays) {
    const acts = new Set(day.activities);
    const tight = Math.min(...day.blocks.filter((b) => b.act.relevance >= 0.9).map((b) => b.tolerance), 9);
    const coldOut = day.outdoor && day.outdoor.meanF < 50;
    const dryIn = day.blocks.some((b) => b.isIndoor && b.cond.rh < 28 && b.act.relevance >= 0.9);
    const hot = day.outdoor && day.outdoor.wakeMaxF >= 85;
    const spots = [];
    if (tight < 5) spots.push('Chest, under your shirt', 'Back of the neck');
    else spots.push('Sides of the neck', 'Chest, under your shirt');
    if (sprays >= 4) spots.push(hot ? 'Back of the neck' : 'Inner forearm');
    if ((coldOut || dryIn) && sprays >= 3) spots.push('One on your jacket or collar fabric');
    const unique = [...new Set(spots)].slice(0, Math.max(1, sprays));
    const tips = [];
    if (acts.has('work')) tips.push('Skip the wrists — handwashing and sanitizer at work strip them.');
    if (dryIn || coldOut) tips.push('Dry air shortens wear; unscented moisturizer first helps.');
    if (hot) tips.push('In heat, spray under clothing so it diffuses instead of baking off the skin.');
    if (tight < 4.5) tips.push('Tight space today: under-clothing spots project less.');
    return { spots: unique, tips };
  }

  // ---- Full evaluation for one fragrance ------------------------------------
  function scoreFragrance(frag, day, settings, journal, weights, opts = {}) {
    const prefs = Object.assign({}, settings.prefs || {}, opts.prefOverride || {});
    const perf = perfFor(frag, journal);
    const Leff = Math.max(2, perf.longevityH * dayLongFactor(day, perf, prefs));
    const choice = day.blocks.length ? chooseSprays(day, perf, Leff, prefs) : { s: 3, ev: { pen: 0, rows: [] } };
    const summary = Env.conditionSummary(day);
    const hist = L.matchHistory(frag.id, summary, journal, prefs);
    const f = {
      weather: factorWeather(frag, day),
      composition: factorComposition(frag, day),
      humidity: factorHumidity(frag, day),
      space: factorSpace(frag, day, perf, Leff, choice),
      schedule: factorSchedule(frag, day),
      preference: factorPreference(frag, prefs),
      history: { score: hist.score, conf: hist.conf, n: hist.n, matches: hist.matches,
        reason: hist.n === 0 ? 'No logged wears yet, so history is neutral (50).' :
          `${hist.n} logged wear${hist.n > 1 ? 's' : ''}; ${hist.matches[0] ? `closest match ${U.fmtDate(hist.matches[0].e.date)} scored ${r0(hist.matches[0].o)}/100` : ''} · confidence ${r0(hist.conf * 100)}%.`,
        concern: hist.n && hist.raw < 45 && hist.conf >= 0.3 ? `Has gone poorly for you in similar conditions (avg ${r0(hist.raw)}/100 over ${hist.n} wears).` : null },
    };
    Object.values(f).forEach((x) => { x.score = U.clamp(Number.isFinite(x.score) ? x.score : 50, 0, 100); });
    const keys = Object.keys(C.DEFAULT_WEIGHTS);
    const raw = keys.reduce((s, k) => s + (weights[k] || 0) / 100 * f[k].score, 0);

    // Projection series for the day chart (every 15 min)
    const series = [];
    if (day.blocks.length) {
      const end = day.blocks[day.blocks.length - 1].endH;
      for (let h = day.applyAt; h <= end + 0.001; h += 0.25) {
        const at = blockAt(day, h); if (!at) break;
        series.push({ h, p: projectionAt(perf, Leff, h - day.applyAt, at.b.cond, choice.s), tol: at.b.tolerance, blockId: at.b.id, inside: at.inside, alone: at.b.env.occupancy === 'low' });
      }
    }
    // Reapplication: when a block you care about starts after it's mostly faded
    let reapply = null;
    const fadedBlock = choice.ev.rows.find((r) => (r.act === 'work' || r.act === 'class' || r.act === 'social' || r.act === 'date' || r.act === 'formal') && r.mean < Math.max(1.2, r.minWanted) && (r.startH - day.applyAt) > Leff * 0.6);
    if (fadedBlock) reapply = { atH: Math.max(day.applyAt + 1, fadedBlock.startH - 0.2), label: fadedBlock.label, sprays: fadedBlock.tol < 5 ? 1 : 2 };

    const issues = [];
    choice.ev.rows.filter((r) => r.over * r.others > 0.5 && r.relevance >= 0.9).forEach((r) => issues.push({ level: 'warn', text: `Could run strong in ${r.label.toLowerCase()} (${U.fmtClock(r.startH)}): ~${U.round(r.peak, 1)}/10 where ~${U.round(r.tol, 1)}/10 suits the space. Spray under clothing.` }));
    const heavyBlocks = day.blocks.filter((b) => b.isOutdoor && Number.isFinite(b.cond.dewF) && b.cond.dewF >= (frag.usage && frag.usage.dewMax || 60) && (frag.traits || {}).sweetness >= 6);
    heavyBlocks.slice(0, 1).forEach((b) => issues.push({ level: 'warn', text: `Dew point ~${r0(b.cond.dewF)}°F during ${b.label.toLowerCase()}: the sweet base can feel heavy outdoors.` }));
    const dry = day.blocks.filter((b) => b.isIndoor && b.env.kind !== 'vehicle' && b.cond.rh < 25 && b.act.relevance >= 0.9).sort((a, b) => a.cond.rh - b.cond.rh)[0];
    if (dry) issues.push({ level: 'info', text: `${dry.env.name} air ~${r0(dry.cond.rh)}% RH (${dry.cond.src.rh}): expect a faster fade there.` });
    const byType = {};
    day.transitions.forEach((tr) => { (byType[tr.type] = byType[tr.type] || []).push(tr); });
    Object.values(byType).forEach((list) => {
      const tr = list[0];
      issues.push({ level: tr.type === 'cold-to-warm' && (frag.traits || {}).density >= 7 ? 'warn' : 'info', text: tr.note + (list.length > 1 ? ` (${list.length} times today)` : '') });
    });
    day.blocks.filter((b) => b.isOutdoor && b.cond.windMph >= 15).slice(0, 1).forEach((b) => issues.push({ level: 'info', text: `Wind ~${r0(b.cond.windMph)} mph during ${b.label.toLowerCase()}: outdoors it disperses fast.` }));
    day.blocks.filter((b) => b.isOutdoor && b.cond.precipProb >= 60).slice(0, 1).forEach((b) => issues.push({ level: 'info', text: `Rain likely during ${b.label.toLowerCase()} (${r0(b.cond.precipProb)}%): wet air keeps scent close to you.` }));
    if (reapply) issues.push({ level: 'info', text: `Expected ~${U.round(Leff, 1)} h of wear vs. a ${U.round(day.spanH, 1)} h day: reapply ${reapply.sprays} spray${reapply.sprays > 1 ? 's' : ''} around ${U.fmtClock(reapply.atH)} before ${reapply.label.toLowerCase()}.` });
    if (!day.hasWeather) issues.push({ level: 'info', text: 'No forecast loaded: scored on your schedule, spaces and preferences only.' });

    const first = choice.ev.rows.find((r) => r.weight >= 0.9) || choice.ev.rows[0];
    const lastMajor = choice.ev.rows.filter((r) => r.weight >= 0.9).pop();
    const opening = projectionAt(perf, Leff, 0.25, (day.blocks[0] || { cond: {} }).cond, choice.s);
    return {
      id: frag.id, frag, factors: f, raw, sprays: choice.s, perf, Leff, longevity: { hours: Leff, lo: Leff * 0.85, hi: Leff * 1.15, src: perf.src.long },
      series, reapply, issues, spaceRows: choice.ev.rows, application: applicationSpots(day, choice.s),
      expected: { opening, first, lastMajor },
    };
  }

  // ---- Rotation ----------------------------------------------------------------
  function rotation(frag, stats, nFrags, today, settings, raw) {
    if (!settings.rotation || settings.rotation.enabled === false) return { adj: 0, reason: '' };
    const s = stats[frag.id] || { count: 0, last: null, recent30: 0 };
    let adj = 0; const why = [];
    if (s.last) {
      const d = U.daysBetween(s.last, today);
      if (d <= 0) { /* worn today already: no change */ }
      else if (d === 1) { adj -= 6; why.push('worn yesterday'); }
      else if (d === 2) { adj -= 4; why.push('worn 2 days ago'); }
      else if (d === 3) { adj -= 2; why.push('worn 3 days ago'); }
      else if (d >= 14) { adj += 2; why.push(`not worn in ${d} days`); }
    }
    const total = Object.values(stats).reduce((a, x) => a + x.recent30, 0);
    if (total >= 4 && s.recent30 / total > 1.5 / Math.max(1, nFrags)) { adj -= 2; why.push(`${s.recent30} of your last ${total} wears`); }
    adj = U.clamp(adj, -8, 3);
    if (raw < 55 && adj > 0) adj = 0; // never promote a poor fit just to rotate
    return { adj, reason: why.join(', ') };
  }

  // ---- Confidence ----------------------------------------------------------------
  function confidence(primary, second, day, settings) {
    let s = 50; const why = [];
    if (second) { const m = primary.final - second.final; s += Math.min(20, m * 2); why.push(m >= 6 ? `Clear lead of ${U.round(m, 1)} pts over #2` : `Close call: ${U.round(m, 1)} pts over #2`); }
    if (day.weatherSource === 'open-meteo') { s += 10; why.push('Live forecast'); }
    else if (day.weatherSource === 'manual') { why.push('Weather from your manual entry; hourly shape estimated'); }
    else { s -= 20; why.push('No weather data'); }
    if (settings.schedule && settings.schedule.templateNote && !day.custom && day.occasion === 'day') { s -= 5; why.push('Schedule is still the starting template'); }
    if (day.assumptions.length) { s -= Math.min(12, 3 * day.assumptions.length); why.push(`Indoor conditions assumed for ${day.assumptions.join(', ')}`); }
    const hc = primary.factors.history.conf || 0;
    s += hc * 25; why.push(hc > 0 ? `${primary.factors.history.n} personal log${primary.factors.history.n > 1 ? 's' : ''} for this fragrance (${r0(hc * 100)}% match confidence)` : 'No personal logs for this fragrance yet');
    if (!primary.frag.perfSource || primary.frag.perfSource.type === 'estimate') { s -= 5; why.push('Performance figures are estimates'); }
    s = U.clamp(s, 5, 95);
    return { score: s, level: s >= 70 ? 'High' : s >= 45 ? 'Medium' : 'Low', reasons: why };
  }

  // ---- Explanation ----------------------------------------------------------------
  function explain(res, all, weights) {
    const keys = Object.keys(C.DEFAULT_WEIGHTS);
    const means = {}; keys.forEach((k) => { means[k] = U.avg(all.map((r) => r.factors[k].score)); });
    const contrib = keys.map((k) => ({ k, d: (res.factors[k].score - means[k]) * (weights[k] || 0) / 100, s: res.factors[k].score }))
      .sort((a, b) => b.d - a.d);
    const lines = contrib.filter((c) => c.d > 0.15).slice(0, 3).map((c) => ({ k: c.k, text: res.factors[c.k].reason }));
    if (!lines.length) lines.push({ k: contrib[0].k, text: res.factors[contrib[0].k].reason });
    const weak = keys.map((k) => ({ k, s: res.factors[k].score, c: res.factors[k].concern })).filter((x) => x.c).sort((a, b) => a.s - b.s)[0];
    return { lines, caveat: weak ? { k: weak.k, text: weak.c } : null };
  }

  // ---- Main entry point --------------------------------------------------------------
  function recommend({ settings, frags, journal, weather, date, occasion, blocks, appliedAt }) {
    const day = Env.buildDay(settings, weather, date, { occasion, blocks, appliedAt });
    const adaptive = L.adaptiveWeights(settings.weights || C.DEFAULT_WEIGHTS, journal, settings.adaptive !== false);
    const weights = adaptive.weights;
    const pool = frags.filter((f) => f.owned !== false && !f.excluded && f.remainingPct !== 0);
    const stats = L.wearStats(frags, journal, date);
    const results = pool.map((f) => {
      const r = scoreFragrance(f, day, settings, journal, weights);
      r.rotation = rotation(f, stats, pool.length, date, settings, r.raw);
      r.final = r.raw + r.rotation.adj;
      r.wears = stats[f.id];
      return r;
    }).sort((a, b) => b.final - a.final);
    if (!results.length) return { day, results, primary: null, alternatives: {}, weights, adaptive };
    const primary = results[0];
    primary.explanation = explain(primary, results, weights);
    primary.confidence = confidence(primary, results[1], day, settings);
    // Candidate lists for the three alternative slots
    const others = results.filter((r) => r.id !== primary.id);
    const subtleRuns = pool.filter((f) => f.id !== primary.id).map((f) => {
      const r = scoreFragrance(f, day, settings, journal, weights, { prefOverride: { projection: Math.max(2, (settings.prefs.projection || 5) - 2), sensitivity: Math.min(10, (settings.prefs.sensitivity || 5) + 3), maxSprays: 2, minSprays: 1 } });
      r.final = r.raw - 2.5 * Math.max(0, (r.perf.projOpen || 5) - 5);
      return r;
    });
    const eveOcc = occasion === 'date' ? 'social' : 'date';
    const eveDay = Env.buildDay(settings, weather, date, { occasion: eveOcc });
    const eveRuns = pool.filter((f) => f.id !== primary.id).map((f) => { const r = scoreFragrance(f, eveDay, settings, journal, weights); r.final = r.raw; r.day = eveDay; return r; });
    const byFinal = (l) => l.slice().sort((x, y) => y.final - x.final);
    const overall = others[0] || null;
    const sl = [byFinal(subtleRuns), byFinal(eveRuns)];
    const free = (l) => l.filter((r) => !overall || r.id !== overall.id);
    const fs = free(sl[0]), fe = free(sl[1]);
    let subtle = null, evening = null, bestSum = -Infinity;
    for (const x of fs) for (const y of fe) {
      if (x.id === y.id) continue;
      const sum = (x.final - sl[0][0].final) + (y.final - sl[1][0].final);
      if (sum > bestSum) { bestSum = sum; subtle = x; evening = y; }
    }
    if (!subtle && !evening) { // small collection: allow overlap rather than leave a slot empty
      subtle = fs[0] || sl[0][0] || null;
      evening = fe.find((r) => !subtle || r.id !== subtle.id) || sl[1][0] || null;
    }
    return { day, results, primary, alternatives: { overall, subtle, evening }, weights, adaptive };
  }

  // Factor scores for one fragrance under a day's conditions (stored with journal entries)
  function snapshot(frag, settings, journal, weather, date) {
    const day = Env.buildDay(settings, weather, date, {});
    const weights = L.normalizeWeights(settings.weights || C.DEFAULT_WEIGHTS);
    const r = scoreFragrance(frag, day, settings, journal.filter((e) => e.date !== date), weights);
    const out = {}; Object.keys(r.factors).forEach((k) => { out[k] = U.round(r.factors[k].score, 1); });
    return { factors: out, cond: Env.conditionSummary(day), sprays: r.sprays };
  }

  FPI.Engine = { factorPreference, levelWord, perfFor, projectionAt, scoreFragrance, recommend, snapshot, rotation, confidence, applicationSpots,
    tempIntensity, humIntensity, tempLong, humLong, compBlock };
  if (typeof module !== 'undefined') module.exports = FPI.Engine;
})(typeof window !== 'undefined' ? window : globalThis);

// ---- store.js ----
/* Storage: your Claude account (artifact database) inside Claude; this device (IndexedDB, else localStorage) everywhere else.
   The installed app's service worker reads the same IndexedDB keys for notifications. */
(function (G) {
  const FPI = (G.FPI = G.FPI || {});
  const U = FPI.U;
  const KEYS = { settings: 'fpi.settings', frags: 'fpi.frags', journal: 'fpi.journal', day: 'fpi.day', discovery: 'fpi.discovery', climate: 'fpi.climate', inbox: 'fpi.inbox', notify: 'fpi.notify' };

  // ---- Key-value backends --------------------------------------------------------------
  function lsBackend() {
    return {
      kind: 'localStorage',
      get: async (k) => { try { const v = G.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
      set: async (k, v) => { G.localStorage.setItem(k, JSON.stringify(v)); },
      del: async (k) => { try { G.localStorage.removeItem(k); } catch (e) { /* ignore */ } },
    };
  }
  function lsOk() { try { const k = '__fpi_probe'; G.localStorage.setItem(k, '1'); G.localStorage.removeItem(k); return true; } catch (e) { return false; } }
  function idbOpen() {
    return new Promise((res, rej) => {
      try {
        const r = G.indexedDB.open('sillage', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
  async function idbBackend() {
    const db = await idbOpen();
    const tx = (mode, fn) => new Promise((res, rej) => { const t = db.transaction('kv', mode); const st = t.objectStore('kv'); const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    return {
      kind: 'IndexedDB',
      get: (k) => tx('readonly', (s) => s.get(k)).then((v) => (v === undefined ? null : v)),
      set: (k, v) => tx('readwrite', (s) => s.put(JSON.parse(JSON.stringify(v)), k)),
      del: (k) => tx('readwrite', (s) => s.delete(k)),
    };
  }
  FPI.KV = { KEYS, idbBackend, lsBackend };

  const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('Storage did not answer'), { code: 'timeout' })), ms))]);

  function makeStore(opts = {}) {
    const st = {
      mode: 'memory', label: 'Not saved', isOwner: null, db: null, kv: null, downloads: null, onError: opts.onError || (() => {}),
      cache: { settings: null, frags: {}, journal: {}, day: null, discovery: {}, climate: null },
    };
    const queues = {};
    function enqueue(path, fn) { const prev = queues[path] || Promise.resolve(); const next = prev.catch(() => {}).then(fn); queues[path] = next; return next; }
    const fail = (what) => (e) => { st.onError(what, e); throw e; };

    st.init = async function () {
      const claude = G.claude && typeof G.claude.use === 'function' ? G.claude : null;
      if (claude) {
        try {
          const [db, user, downloads] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('downloads')]);
          st.downloads = downloads || null;
          if (db) {
            st.db = db;
            st.isOwner = user ? await user.isOwner().catch(() => null) : null;
            if (st.isOwner === false) st.db = null; // someone else's copy: never touch the owner's data
            else { st.mode = 'db'; st.label = 'Saved to your Claude account'; return st; }
          }
        } catch (e) { /* fall through */ }
      }
      if (G.indexedDB) {
        try {
          st.kv = await idbBackend();
          if (lsOk()) { // one-time move from browser storage into IndexedDB
            const ls = lsBackend();
            for (const k of Object.values(KEYS)) { if ((await st.kv.get(k)) == null) { const v = await ls.get(k); if (v != null) await st.kv.set(k, v); } }
          }
        } catch (e) { st.kv = null; }
      }
      if (!st.kv && lsOk()) st.kv = lsBackend();
      if (st.kv) { st.mode = 'local'; st.label = st.isOwner === false ? 'Saved on this device (viewing a shared copy)' : 'Saved on this device'; }
      else { st.mode = 'memory'; st.label = 'Not saved: storage is unavailable in this view'; }
      return st;
    };

    st.loadAll = async function () {
      if (st.mode === 'db') {
        const db = st.db;
        const [s, d, c, f, j, x] = await timeout(Promise.all([
          db.doc('app/settings').get(), db.doc('app/day').get(), db.doc('app/climate').get(), db.collection('frags').get(),
          db.collection('journal').orderBy('date', 'desc').limit(1000).get(), db.collection('discovery').get(),
        ]), 15000);
        st.cache.settings = s.exists ? U.clone(s.data()) : null;
        st.cache.day = d.exists ? U.clone(d.data()) : null;
        st.cache.climate = c.exists ? U.clone(c.data()) : null;
        st.cache.frags = {}; f.docs.forEach((q) => { st.cache.frags[q.id] = U.clone(q.data()); });
        st.cache.journal = {}; j.docs.forEach((q) => { st.cache.journal[q.id] = U.clone(q.data()); });
        st.cache.discovery = {}; x.docs.forEach((q) => { st.cache.discovery[q.id] = U.clone(q.data()); });
      } else if (st.mode === 'local') {
        const g = (k) => st.kv.get(k);
        st.cache.settings = await g(KEYS.settings); st.cache.day = await g(KEYS.day); st.cache.climate = await g(KEYS.climate);
        st.cache.frags = (await g(KEYS.frags)) || {}; st.cache.journal = (await g(KEYS.journal)) || {}; st.cache.discovery = (await g(KEYS.discovery)) || {};
      }
      return { settings: st.cache.settings, day: st.cache.day, climate: st.cache.climate, frags: Object.values(st.cache.frags), journal: Object.values(st.cache.journal), discovery: { ...st.cache.discovery } };
    };

    const writeDoc = (path, data) => enqueue(path, () => st.db.doc(path).set(JSON.parse(JSON.stringify(data))));
    const delDoc = (path) => enqueue(path, () => st.db.doc(path).delete());
    const persist = (key, val) => enqueue(key, () => st.kv.set(key, val)).catch((e) => { st.onError('save', Object.assign(e, { code: e.code || 'quota_exceeded' })); throw e; });

    const single = (field, path, key, what) => async function (v) {
      st.cache[field] = v;
      if (st.mode === 'db') return writeDoc(path, v).catch(fail(what));
      if (st.mode === 'local') return persist(key, v);
    };
    st.saveSettings = single('settings', 'app/settings', KEYS.settings, 'settings');
    st.saveDay = single('day', 'app/day', KEYS.day, 'today');
    st.saveClimate = single('climate', 'app/climate', KEYS.climate, 'climate data');
    const coll = (field, coll, key, what) => ({
      save: async function (o) { st.cache[field][o.id] = o; if (st.mode === 'db') return writeDoc(`${coll}/${o.id}`, o).catch(fail(what)); if (st.mode === 'local') return persist(key, st.cache[field]); },
      del: async function (id) { delete st.cache[field][id]; if (st.mode === 'db') return delDoc(`${coll}/${id}`).catch(fail(what)); if (st.mode === 'local') return persist(key, st.cache[field]); },
    });
    const F = coll('frags', 'frags', KEYS.frags, 'fragrance'), J = coll('journal', 'journal', KEYS.journal, 'journal entry'), X = coll('discovery', 'discovery', KEYS.discovery, 'wishlist entry');
    st.saveFrag = F.save; st.deleteFrag = F.del; st.saveEntry = J.save; st.deleteEntry = J.del; st.saveDisc = X.save; st.deleteDisc = X.del;

    // Messages queued by the installed app's notifications (e.g. “Wear it” tapped on your watch)
    st.takeInbox = async function () { if (st.mode !== 'local' || st.kv.kind !== 'IndexedDB') return []; const v = (await st.kv.get(KEYS.inbox)) || []; if (v.length) await st.kv.set(KEYS.inbox, []); return v; };
    st.getNotify = async function () { return st.mode === 'local' ? (await st.kv.get(KEYS.notify)) || {} : {}; };
    st.setNotify = async function (v) { if (st.mode === 'local') await st.kv.set(KEYS.notify, v); };

    st.clearAll = async function () {
      if (st.mode === 'db') {
        for (const id of Object.keys(st.cache.frags)) await delDoc(`frags/${id}`);
        for (const id of Object.keys(st.cache.journal)) await delDoc(`journal/${id}`);
        for (const id of Object.keys(st.cache.discovery)) await delDoc(`discovery/${id}`);
        await delDoc('app/settings'); await delDoc('app/day'); await delDoc('app/climate');
      } else if (st.mode === 'local') { for (const k of Object.values(KEYS)) await st.kv.del(k); }
      st.cache = { settings: null, frags: {}, journal: {}, day: null, discovery: {}, climate: null };
    };

    st.saveFile = async function (filename, text) {
      if (st.downloads) { const r = await st.downloads.save({ filename, data: text }); return r.status; }
      if (G.claude) throw Object.assign(new Error('Downloads are not available in this view'), { code: 'unavailable' });
      const blob = new Blob([text], { type: filename.endsWith('.csv') ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      return 'saved';
    };
    return st;
  }

  FPI.makeStore = makeStore;
  if (typeof module !== 'undefined') module.exports = makeStore;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
