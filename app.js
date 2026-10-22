'use strict';

/* ---------- утилиты ---------- */
const KEY = 'gymlog.v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = s => { const v = parseFloat(String(s ?? '').replace(',', '.')); return isFinite(v) ? v : null; };
const n = v => v == null ? '' : String(+(+v).toFixed(2)).replace('.', ',');
const pad = v => String(v).padStart(2, '0');
const isoDay = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

function fmtDate(ts) {
  const d = new Date(ts), o = { day: 'numeric', month: 'short', weekday: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString('ru-RU', o);
}
function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

const KINDS = {
  wr: { a: 'кг', b: 'повт', name: 'Вес × повторы' },
  time: { a: 'кг', b: 'сек', name: 'Время (сек)' },
  cardio: { a: 'км', b: 'мин', name: 'Кардио (км / мин)' },
};
const MEASURES = [
  ['weight', 'Вес', 'кг'], ['fat', 'Жир', '%'], ['neck', 'Шея', 'см'], ['shoulders', 'Плечи', 'см'],
  ['chest', 'Грудь', 'см'], ['waist', 'Талия', 'см'], ['hips', 'Бёдра', 'см'], ['biceps', 'Бицепс', 'см'],
  ['forearm', 'Предплечье', 'см'], ['thigh', 'Бедро', 'см'], ['calf', 'Голень', 'см'],
];

/* ---------- данные ---------- */
function fresh() {
  return {
    version: 1,
    exercises: BASE_EXERCISES.map(([name, muscle, equip, kind], i) => ({ id: 'e' + i, name, muscle, equip, kind: kind || 'wr' })),
    programs: [], workouts: [], measures: [],
    settings: { rest: 90, sound: true, vibro: true, theme: 'dark', updUrl: '', updAuto: true },
  };
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.version) {
      // новые упражнения базового справочника добавляем в уже существующие данные
      const have = new Set(d.exercises.map(e => e.id));
      fresh().exercises.forEach(e => { if (!have.has(e.id)) d.exercises.push(e); });
      return d;
    }
  } catch (e) { /* повреждённые данные — начинаем заново */ }
  return fresh();
}
let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Не удалось сохранить данные: ' + e.message); }
}

const exById = id => db.exercises.find(e => e.id === id) || { id, name: 'Удалённое упражнение', muscle: '', equip: '', kind: 'wr' };
const W = id => db.workouts.find(w => w.id === id);
const P = id => db.programs.find(p => p.id === id);
const sortedW = () => [...db.workouts].sort((a, b) => b.start - a.start);
const activeW = () => db.workouts.find(w => !w.end);
const kindOf = exId => KINDS[exById(exId).kind] || KINDS.wr;

function setTxt(s, kind) {
  if (kind === 'cardio') return [s.w != null ? n(s.w) + ' км' : '', s.r != null ? n(s.r) + ' мин' : ''].filter(Boolean).join(' / ');
  if (kind === 'time') return (s.w ? n(s.w) + ' кг × ' : '') + n(s.r) + ' с';
  return s.w ? `${n(s.w)}×${n(s.r)}` : n(s.r);
}
function prevSets(exId, exceptId, before) {
  for (const w of sortedW()) {
    if (w.id === exceptId || w.start >= before) continue;
    const sets = w.items.filter(it => it.exId === exId).flatMap(it => it.sets.filter(s => s.done));
    if (sets.length) return sets;
  }
  return [];
}
// Типы подходов: без метки — рабочий, w — разминочный, f — до отказа, d — дроп-сет.
const SET_TYPES = { '': ['Рабочий', ''], w: ['Разминочный', 'Р'], f: ['До отказа', 'О'], d: ['Дроп-сет', 'Д'] };
// Разминочные подходы не идут в статистику, рекорды и подсказки.
const isWork = s => s.done && s.t !== 'w';
function wStats(w) {
  let sets = 0, ton = 0;
  for (const it of w.items) {
    const wr = exById(it.exId).kind === 'wr';
    for (const s of it.sets) if (isWork(s)) { sets++; if (wr) ton += (s.w || 0) * (s.r || 0); }
  }
  return { sets, ton, ex: w.items.length };
}
// Лучший вес в упражнении до указанного момента — чтобы отмечать рекорды.
function bestBefore(exId, before) {
  let best = 0;
  for (const w of db.workouts) {
    if (w.start >= before) continue;
    for (const it of w.items) if (it.exId === exId) for (const s of it.sets) if (isWork(s) && (s.w || 0) > best) best = s.w;
  }
  return best;
}
// Подсказка на сегодня: если в прошлый раз все рабочие подходы выполнены в плане — прибавляем.
function suggest(it, prev) {
  const ex = exById(it.exId), work = prev.filter(s => s.t !== 'w');
  if (ex.kind !== 'wr' || !work.length) return null;
  const target = it.planR || work[0].r || 0;
  const ok = work.every(s => (s.r || 0) >= target), top = Math.max(...work.map(s => s.w || 0));
  // оценки подходов (f: 1 — легко, 3 — тяжело): тяжёлый вес сначала закрепляем, лёгкий прибавляем смелее
  const hard = work.some(s => s.f === 3), easy = work.every(s => s.f === 1);
  if (!top) {
    if (!ok) return { text: `Сегодня цель — ${target} повт. во всех подходах` };
    if (hard) return { text: `Сегодня снова ${target} повт. — в прошлый раз было тяжело, закрепите результат` };
    return { dr: easy ? 2 : 1, text: `Сегодня попробуйте ${target + (easy ? 2 : 1)} повт. — в прошлый раз план выполнен${easy ? ' легко' : ''}` };
  }
  const st = progStep(ex), step = easy ? st.step + st.extra : st.step;
  if (!ok) return { text: `Сегодня: ${n(top)} кг — сначала доберите ${target} повт. во всех подходах` };
  if (hard) return { text: `Сегодня: ${n(top)} кг — план выполнен, но было тяжело: закрепите этот вес` };
  return { dw: step, text: `Сегодня: ${n(top + step)} кг — в прошлый раз план выполнен${easy ? ' легко' : ''}, прибавьте ${n(step)} кг${st.why}` };
}
// Шаг прибавки: крупные мышцы (грудь, спина, ноги) сильнее и прогрессируют быстрее — 5 кг,
// мелкие (бицепс, трицепс, плечи, предплечья, пресс) — 2,5 кг. С гантелями вес считается на одну гантель,
// поэтому шаг меньше; гири бывают через 2–4 кг. Если подход дался легко — добавляется ещё один малый шаг.
const BIG_GROUPS = ['Грудь', 'Спина', 'Ноги'];
function progStep(ex) {
  const big = BIG_GROUPS.includes(ex.muscle), s = db.settings;
  if (ex.equip === 'Гантели') return { step: big ? (s.stepDbBig || 2) : (s.stepDbSmall || 1), extra: 1, why: big ? ' (на каждую гантель)' : '' };
  if (ex.equip === 'Гиря') return { step: big ? 4 : 2, extra: 0, why: '' };
  return { step: big ? (s.stepBig || 5) : (s.stepSmall || 2.5), extra: s.stepSmall || 2.5, why: big ? ' — для крупных мышц шаг больше' : '' };
}
// Что умеет текущая версия: уведомления по расписанию — только приложение для Android,
// вибрация — Android (в Safari на iPhone её нет), синхронизация — Android и ПК.
const canNotify = () => !!(window.Android && Android.setReminders);
const canVibrate = () => !!(window.Android && Android.setReminders) || ('vibrate' in navigator && !(window.chrome && window.chrome.webview) && !/iPad|iPhone|iPod/.test(navigator.userAgent));
const canSync = () => !!window.Android;
const FEEL = { 1: ['легко', '😌'], 2: ['нормально', '🙂'], 3: ['тяжело', '😤'] };
// Разминочные подходы перед рабочим весом: со штангой — от пустого грифа, с гантелями и в тренажёрах — 50% и 75%.
// Веса округляются до доступного шага; подходы легче грифа, слишком близкие к рабочему и повторы весов отбрасываются.
function warmupPlan(ex, work) {
  if (ex.kind !== 'wr' || !work) return [];
  const bar = ex.equip === 'Штанга', step = bar ? 2.5 : ex.equip === 'Гантели' ? 1 : ex.equip === 'Гиря' ? 4 : 2.5;
  if (bar ? work < 30 : work < 10 || ex.equip === 'Своё тело' || ex.equip === 'Другое') return [];
  const plan = bar ? [[0, 10], [.5, 6], [.7, 3], ...(work >= 100 ? [[.85, 1]] : [])] : [[.5, 10], [.75, 5]];
  const out = [];
  plan.forEach(([k, r]) => {
    const wt = k ? Math.round(work * k / step) * step : 20;
    if ((bar && wt < 20) || wt <= 0 || wt > work * .9 || out.some(x => x.w >= wt)) return;
    out.push({ w: wt, r });
  });
  return out;
}

// Изменение показателя относительно прошлого результата: ▲ рост, ▼ падение, = без изменений.
function dl(d, unit = '') {
  d = +(+d).toFixed(2);
  const u = unit ? ' ' + unit : '';
  return d > 0 ? `<span class="up">▲ +${n(d)}${u}</span>` : d < 0 ? `<span class="down">▼ −${n(-d)}${u}</span>` : `<span class="muted">=${u}</span>`;
}

/* ---------- фото упражнений (есть только у базового справочника) ---------- */
function exFrames(id) {
  const m = /^e(\d+)$/.exec(id);
  if (!m || +m[1] >= BASE_EXERCISES.length) return [];
  return id === 'e58' ? [`img/${id}_0.jpg`] : [`img/${id}_0.jpg`, `img/${id}_1.jpg`];
}
function demo(id) {
  const f = exFrames(id);
  return f.length ? `<div class="demo">${f.map((s, i) => `<img src="${s}" alt="" ${i ? 'class="f2"' : ''}>`).join('')}</div>
    ${f.length > 1 ? `<div class="muted small demo-cap">Начальная и конечная фаза движения</div>` : ''}` : '';
}
function thumb(id, action) {
  const f = exFrames(id);
  return f.length ? `<img class="thumb" src="${f[0]}" loading="lazy" alt="" ${action ? `data-a="demo" data-id="${id}"` : ''}>` : '';
}

/* ---------- схема работающих мышц ---------- */
const MUSCLE_RU = {
  abdominals: 'пресс', abductors: 'отводящие бедра', adductors: 'приводящие бедра', biceps: 'бицепс', calves: 'икры',
  chest: 'грудь', forearms: 'предплечья', glutes: 'ягодицы', hamstrings: 'бицепс бедра', lats: 'широчайшие',
  'lower back': 'поясница', 'middle back': 'середина спины', neck: 'шея', quadriceps: 'квадрицепс',
  shoulders: 'плечи', traps: 'трапеции', triceps: 'трицепс',
};
// мышца -> части схемы тела (BODY)
const MUSCLE_PARTS = {
  abdominals: ['abs', 'obliques'], abductors: ['gluteal'], adductors: ['adductors'], biceps: ['biceps'],
  calves: ['calves'], chest: ['chest'], forearms: ['forearm'], glutes: ['gluteal'],
  hamstrings: ['hamstring'], lats: ['upper-back'], 'lower back': ['lower-back'], 'middle back': ['upper-back', 'trapezius'],
  neck: ['neck'], quadriceps: ['quadriceps'], shoulders: ['deltoids'], traps: ['trapezius'], triceps: ['triceps'],
};
// для своих упражнений точных данных нет — показываем группу мышц целиком
const GROUP_MUSCLE = {
  'Грудь': 'chest', 'Спина': 'lats', 'Ноги': 'quadriceps', 'Плечи': 'shoulders', 'Бицепс': 'biceps',
  'Трицепс': 'triceps', 'Пресс': 'abdominals', 'Предплечья': 'forearms',
};
function exMuscles(ex) {
  const m = /^e(\d+)$/.exec(ex.id);
  if (m && EX_MUSCLES[+m[1]]) return EX_MUSCLES[+m[1]];
  return [GROUP_MUSCLE[ex.muscle] ? [GROUP_MUSCLE[ex.muscle]] : [], []];
}
const muscleMap = ex => mapHtml(...exMuscles(ex));
// Какую фигуру рисовать — женскую или мужскую. Порядок: явное указание (предпросмотр в подборе) →
// то, что сейчас на экране (раздел упражнений, программа, тренировка) → пол из профиля.
let figSex = null;
// Для кого программа: записано при создании, а у старых программ определяется по каталогу или названию.
function progSex(p) {
  if (!p) return null;
  if (p.sex === 'f' || p.sex === 'm') return p.sex;
  const c = CATALOG.find(x => x[0] === p.name);
  if (c && c[1] !== 'a') return c[1];
  return /жен\./.test(p.name) ? 'f' : /муж\./.test(p.name) ? 'm' : null;
}
function ctxSex() {
  const [page, id] = location.hash.slice(2).split('/');
  if (page === 'exercise' || page === 'exercises') return ef.s || null;
  if (page === 'program') return progSex(P(id));
  if (page === 'workout') return progSex(P((W(id) || {}).pid));
  if (page === 'catalog') { const c = CATALOG[+id]; return c ? (c[1] !== 'a' ? c[1] : cf.sex || null) : null; }
  if (!page || page === 'workouts') return progSex(activeProgram());
  return null;
}
// Мышцы тренировочного дня: основные мышцы всех упражнений (кардио не учитываем) и вспомогательные сверх них.
function dayMuscles(items) {
  const pri = new Set(), sec = new Set();
  items.forEach(it => {
    const ex = exById(it.exId);
    if (ex.kind === 'cardio') return;
    const [p, s] = exMuscles(ex);
    p.forEach(m => pri.add(m)); s.forEach(m => sec.add(m));
  });
  return [[...pri], [...sec].filter(m => !pri.has(m))];
}
const muscleNames = list => list.map(m => MUSCLE_RU[m]).join(', ');
// mini — только силуэты, без подписей (для списков)
function mapHtml(pri, sec, mini) {
  if (!pri.length) return '';
  const cls = {};
  sec.forEach(m => MUSCLE_PARTS[m].forEach(p => cls[p] = 's'));
  pri.forEach(m => MUSCLE_PARTS[m].forEach(p => cls[p] = 'p'));
  // фигура — мужская или женская, по полу из профиля; контуры мышц рисуются линиями, работающие мышцы закрашены
  const body = BODY[(figSex || ctxSex() || profile().sex) === 'f' ? 'f' : 'm'];
  const fig = (side, label) => `<svg viewBox="${side.box}" role="img" aria-label="${label}">${side.parts.map(([name, ...paths]) =>
    paths.map(d => `<path class="${cls[name] || (name === 'hair' ? 'h' : '')}" d="${d}"/>`).join('')).join('')}<path class="o" d="${side.outline}"/></svg>`;
  const figs = `<div class="mm-figs">${fig(body.front, 'Вид спереди')}${fig(body.back, 'Вид сзади')}</div>`;
  if (mini) return `<div class="mm mini">${figs}</div>`;
  return `<div class="mm">${figs}
    <div class="mm-leg"><div><i class="p"></i><span><b>Основные:</b> ${muscleNames(pri)}</span></div>
    ${sec.length ? `<div><i class="s"></i><span><b>Вспомогательные:</b> ${muscleNames(sec)}</span></div>` : ''}</div></div>`;
}

/* ---------- шторки, формы, уведомления ---------- */
const modal = $('#modal');
let sheetDone = null, picker = false;
function sheet(html) {
  return new Promise(res => {
    if (sheetDone) sheetDone(null);
    sheetDone = res;
    modal.innerHTML = `<div class="backdrop" data-a="sheetClose"></div><div class="sheet">${html}</div>`;
    modal.hidden = false;
  });
}
function closeSheet(v = null) {
  modal.hidden = true; modal.innerHTML = '';
  const d = sheetDone; sheetDone = null; picker = false;
  if (d) d(v);
}
function menu(title, opts) {
  return sheet(`<h3>${esc(title)}</h3>` + opts.filter(Boolean).map(([v, label, danger]) =>
    `<button class="li ${danger ? 'danger' : ''}" data-a="sheetRes" data-v="${v}">${esc(label)}</button>`).join(''));
}
function confirmDlg(text, ok = 'Удалить') {
  return sheet(`<h3>${esc(text)}</h3><div class="row end">
    <button class="btn ghost" data-a="sheetClose">Отмена</button>
    <button class="btn danger" data-a="sheetRes" data-v="1">${esc(ok)}</button></div>`).then(Boolean);
}
// Возвращает объект значений, строку (если нажата доп. кнопка) или null при отмене.
function form(title, fields, extra = '') {
  const p = sheet(`<h3>${esc(title)}</h3><form id="f">${fields.map(f => `<label class="field"><span>${esc(f.label)}</span>${
    f.type === 'select'
      ? `<select name="${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${v === f.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
      : f.type === 'textarea'
        ? `<textarea name="${f.name}" rows="3">${esc(f.value)}</textarea>`
        : `<input name="${f.name}" type="${f.type === 'date' ? 'date' : 'text'}" ${f.type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(f.value)}" placeholder="${esc(f.placeholder)}" autocomplete="off">`
  }</label>`).join('')}
    <div class="row end">${extra}<button type="button" class="btn ghost" data-a="sheetClose">Отмена</button>
    <button class="btn primary">Сохранить</button></div></form>`);
  const f = $('#f');
  f.onsubmit = e => {
    e.preventDefault();
    const o = {};
    fields.forEach(fl => o[fl.name] = f.elements[fl.name].value.trim());
    closeSheet(o);
  };
  const first = f.querySelector('input[type=text]');
  if (first && !first.value) first.focus();
  return p;
}
let toastT;
function toast(text) {
  glog.add('toast', text);
  const el = $('#toast');
  el.textContent = text; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2500);
}

/* ---------- таймер отдыха ---------- */
let rest = null;
try { rest = JSON.parse(localStorage.getItem(KEY + '.rest')); } catch (e) { /* нет сохранённого таймера */ }
let audio;
function audioInit() {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (e) { /* звук недоступен */ }
}
function beep() {
  if (!audio || !db.settings.sound) return;
  [0, .25, .5].forEach(t => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(.25, audio.currentTime + t);
    g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + t + .18);
    o.start(audio.currentTime + t); o.stop(audio.currentTime + t + .2);
  });
}
function saveRest() { rest ? localStorage.setItem(KEY + '.rest', JSON.stringify(rest)) : localStorage.removeItem(KEY + '.rest'); }
function startRest(sec) {
  if (!sec) return;
  rest = { end: Date.now() + sec * 1000, total: sec };
  saveRest(); audioInit(); drawRest();
}
function stopRest() { rest = null; saveRest(); drawRest(); }
function drawRest() {
  const el = $('#rest');
  if (!rest) { el.hidden = true; return; }
  const left = Math.ceil((rest.end - Date.now()) / 1000);
  if (left < -5) return stopRest();
  if (left <= 0 && !rest.fired) {
    rest.fired = true; saveRest(); beep();
    if (db.settings.vibro && navigator.vibrate) navigator.vibrate([300, 150, 300]);
  }
  el.hidden = false;
  $('#rest-time').textContent = left > 0 ? 'Отдых ' + fmtDur(left * 1000) : 'Отдых окончен';
  $('#rest-fill').style.width = Math.max(0, Math.min(100, 100 - left / rest.total * 100)) + '%';
}
setInterval(() => {
  drawRest();
  document.querySelectorAll('[data-elapsed]').forEach(el => el.textContent = fmtDur(Date.now() - +el.dataset.elapsed));
}, 1000);

/* ---------- график (одна серия: линия + перекрестие) ---------- */
const charts = {};
function chart(id, pts, unit) {
  if (!pts.length) return `<div class="empty small">Пока нет данных</div>`;
  if (pts.length < 2) return `<div class="empty small">${fmtDate(pts[0].t)} — ${n(pts[0].v)} ${unit}<br>График появится после второй записи</div>`;
  const Wd = 340, H = 170, L = 36, R = 10, T = 10, B = 22;
  let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
  if (lo === hi) { lo -= 1; hi += 1; }
  const gap = (hi - lo) * .12; hi += gap; lo = Math.max(0, lo - gap);
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const X = (t, i) => L + (t1 > t0 ? (t - t0) / (t1 - t0) : i / (pts.length - 1)) * (Wd - L - R);
  const Y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const xy = pts.map((p, i) => ({ x: X(p.t, i), y: Y(p.v), l: `${fmtDate(p.t)} — <b>${n(p.v)} ${unit}</b>` }));
  charts[id] = { xy, Wd };
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
  const base = H - B, last = xy[xy.length - 1];
  const grid = [0, 1, 2, 3].map(k => {
    const v = lo + (hi - lo) * k / 3, y = Y(v);
    return `<line class="grid" x1="${L}" x2="${Wd - R}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 5}" y="${y + 3}" text-anchor="end">${n(+v.toFixed(1))}</text>`;
  }).join('');
  const short = t => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' });
  return `<div class="chart" data-chart="${id}">
    <div class="chart-cap">${last.l}</div>
    <svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="График">
      ${grid}
      <text class="ax" x="${L}" y="${H - 5}">${short(t0)}</text>
      <text class="ax" x="${Wd - R}" y="${H - 5}" text-anchor="end">${short(t1)}</text>
      <path class="area" d="${line}L${last.x.toFixed(1)} ${base}L${xy[0].x.toFixed(1)} ${base}Z"/>
      <path class="ln" d="${line}"/>
      ${xy.length <= 30 ? xy.map(p => `<circle class="dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4"/>`).join('') : ''}
      <line class="cross" x1="${last.x}" x2="${last.x}" y1="${T}" y2="${base}"/>
      <circle class="hl" cx="${last.x}" cy="${last.y}" r="5"/>
    </svg></div>`;
}
// Столбцы по периодам (недели, месяцы). Подпись и перекрестие работают так же, как у линейного графика.
function bars(id, pts, unit, fmt = n) {
  const Wd = 340, H = 170, L = 38, R = 10, T = 10, B = 22, base = H - B;
  // верх шкалы — три «круглых» шага (1, 2, 2.5, 5 × 10ⁿ), чтобы подписи оси были целыми
  const raw = Math.max(1, ...pts.map(p => p.v)) / 3, pow = Math.pow(10, Math.floor(Math.log10(raw))), frac = raw / pow;
  const tick = Math.max(1, (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 && pow >= 10 ? 2.5 : frac <= 5 ? 5 : 10) * pow), hi = tick * 3;
  const step = (Wd - L - R) / pts.length, bw = Math.min(18, step - 5);
  const Y = v => T + (hi - v) / hi * (H - T - B);
  const xy = pts.map((p, i) => ({ x: L + step * (i + .5), y: Y(p.v), l: `${p.label} — <b>${fmt(p.v)}${unit ? ' ' + unit : ''}</b>` }));
  charts[id] = { xy, Wd };
  const last = xy[xy.length - 1];
  const grid = [0, 1, 2, 3].map(k => {
    const v = tick * k, y = Y(v);
    return `<line class="grid" x1="${L}" x2="${Wd - R}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 5}" y="${y + 3}" text-anchor="end">${fmt(v)}</text>`;
  }).join('');
  // верх столбца скруглён, низ стоит на оси
  const bar = p => {
    const x = p.x - bw / 2, r = Math.min(4, (base - p.y) / 2);
    return base - p.y < .5 ? '' : `<path class="bar-mark" d="M${x} ${base}V${p.y + r}Q${x} ${p.y} ${x + r} ${p.y}H${x + bw - r}Q${x + bw} ${p.y} ${x + bw} ${p.y + r}V${base}Z"/>`;
  };
  return `<div class="chart" data-chart="${id}">
    <div class="chart-cap">${last.l}</div>
    <svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="График">
      ${grid}
      <text class="ax" x="${xy[0].x}" y="${H - 5}" text-anchor="middle">${pts[0].short}</text>
      <text class="ax" x="${last.x}" y="${H - 5}" text-anchor="middle">${pts[pts.length - 1].short}</text>
      ${xy.map(bar).join('')}
      <line class="cross" x1="${last.x}" x2="${last.x}" y1="${T}" y2="${base}"/>
      <circle class="hl" cx="${last.x}" cy="${last.y}" r="4"/>
    </svg></div>`;
}
function chartHover(e) {
  const box = e.target.closest && e.target.closest('.chart');
  const c = box && charts[box.dataset.chart];
  if (!c) return;
  const svg = $('svg', box), r = svg.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * c.Wd;
  const p = c.xy.reduce((a, b) => Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a);
  const cross = $('.cross', svg), hl = $('.hl', svg);
  cross.setAttribute('x1', p.x); cross.setAttribute('x2', p.x);
  hl.setAttribute('cx', p.x); hl.setAttribute('cy', p.y);
  $('.chart-cap', box).innerHTML = p.l;
}
document.addEventListener('pointermove', chartHover);
document.addEventListener('pointerdown', chartHover);

/* ---------- экран: тренировки ---------- */
let cal = new Date(); cal.setDate(1);
function calendar() {
  const y = cal.getFullYear(), m = cal.getMonth(), now = new Date();
  const off = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), map = {};
  // день красится по оценке тренировки; если тренировок в день несколько — по самой тяжёлой
  const feel = {};
  db.workouts.forEach(w => {
    const d = new Date(w.start), k = d.getDate();
    if (d.getFullYear() !== y || d.getMonth() !== m) return;
    map[k] = map[k] || w.id;
    if (w.end) feel[k] = Math.max(feel[k] || 0, w.feel || 0);
  });
  let cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="wd">${d}</div>`).join('') + '<div></div>'.repeat(off);
  for (let d = 1; d <= days; d++) {
    const today = y === now.getFullYear() && m === now.getMonth() && d === now.getDate() ? ' today' : '';
    cells += `<button class="d${map[d] ? ' has f' + (feel[d] || 0) : ''}${today}" data-a="calDay" data-y="${y}" data-m="${m}" data-d="${d}">${d}</button>`;
  }
  return `<section class="card"><div class="cal-head">
    <button class="ic sm" data-a="calNav" data-v="-1">‹</button>
    <b>${cal.toLocaleDateString('ru-RU', { month: 'long' })} ${y}</b>
    <button class="ic sm" data-a="calNav" data-v="1">›</button></div>
    <div class="cal">${cells}</div>
    <div class="cal-leg"><span><i class="f1"></i>легко</span><span><i class="f2"></i>нормально</span><span><i class="f3"></i>тяжело</span><span><i class="f0"></i>без оценки</span></div></section>`;
}
// Одноразовая подсказка: показывается, пока пользователь не закроет её крестиком.
function tip(key, text) {
  if ((db.settings.tips || {})[key]) return '';
  return `<div class="tip"><span>💡 ${text}</span><button data-a="tipHide" data-k="${key}" aria-label="Скрыть подсказку">✕</button></div>`;
}
function workoutRow(w) {
  const s = wStats(w);
  return `<a class="card link" href="#/workout/${w.id}"><div class="ex-head"><b>${w.feel ? FEEL[w.feel][1] + ' ' : ''}${esc(w.name)}</b><span class="muted small">${fmtDate(w.start)}</span></div>
    <div class="muted small">${fmtDur(w.end - w.start)} · ${s.ex} упр. · ${s.sets} подх.${s.ton ? ` · ${n(Math.round(s.ton))} кг` : ''}</div>
    <div class="small" style="margin-top:6px">${w.items.map(it => esc(exById(it.exId).name)).join(', ')}</div></a>`;
}
// Полоска текущей недели: какие дни выполнены, какие запланированы программой.
function weekStrip() {
  const start = weekStart(Date.now()), p = activeProgram(), week = (p && p.week) || {}, now = wdOf(Date.now());
  const done = new Set(finished().filter(w => w.start >= start).map(w => wdOf(w.start)));
  return `<div class="strip">${WD.map((name, i) => {
    const planned = week[i] != null && p.days[week[i]];
    const state = done.has(i) ? 'done' : planned ? (i < now ? 'missed' : 'planned') : '';
    return `<div class="${state} ${i === now ? 'now' : ''}"><span>${name}</span><i>${done.has(i) ? '✓' : planned ? '•' : ''}</i></div>`;
  }).join('')}</div>`;
}
// Первый запуск: вместо пустого экрана — подбор программы.
const isNew = () => !db.settings.onboarded && !db.programs.length && !db.workouts.length;
function pgWorkouts() {
  if (isNew()) return pgPick(true);
  const act = activeW(), list = sortedW().filter(w => w.end), pl = nextPlan(), now = new Date();
  const hello = now.getHours() < 5 ? 'Доброй ночи' : now.getHours() < 12 ? 'Доброе утро' : now.getHours() < 18 ? 'Добрый день' : 'Добрый вечер';
  return `<header class="top"><div class="grow"><h1 data-a="egg">${hello}</h1>
    <div class="muted small">${now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase())}</div></div></header>
  ${typeof webCards === 'function' ? webCards() : ''}
  ${act ? `<a class="card link active big" href="#/workout/${act.id}"><div class="muted small">Идёт тренировка</div><b>${esc(act.name)}</b>
      <div class="muted small">Прошло <span data-elapsed="${act.start}">${fmtDur(Date.now() - act.start)}</span></div>
      <div class="btn primary block" style="margin:12px 0 0">Продолжить</div></a>`
    : pl ? planCard() : `<section class="card"><b>${db.programs.length ? 'Выберите программу' : 'Начните с программы'}</b>
        <div class="muted small" style="margin:4px 0 12px">${db.programs.length ? 'Откройте программу и нажмите «Сделать текущей» — здесь появится ближайшая тренировка.'
          : 'Приложение подберёт упражнения, подходы и расписание под вашу цель.'}</div>
        <a class="btn primary block" href="#/programs" style="margin:0">${db.programs.length ? 'К программам' : 'Подобрать программу'}</a></section>`}
  ${act ? '' : `<div class="row two"><a class="btn" href="#/stretch/warm">🧘 Разминка</a>
    <button class="btn" data-a="startSheet">${pl ? 'Другая тренировка' : 'Свободная тренировка'}</button></div>`}
  <h2>Эта неделя</h2>
  <section class="card">${weekStrip()}
    <div class="muted small" style="margin-top:10px">${(() => { const c = list.filter(w => w.start >= weekStart(Date.now())).length, st = weekStreaks().cur;
      return `Тренировок на этой неделе: ${c}${st > 1 ? ` · серия ${st} нед. подряд 🔥` : ''}`; })()}</div></section>
  <h2>Календарь</h2>
  ${calendar()}
  ${cycleCard()}${waterCard()}
  ${list.length ? `<h2>Прошлая тренировка</h2>${workoutRow(list[0])}
    <a class="btn block ghost" href="#/history">Вся история</a>` : tip('home', 'Когда закончите первую тренировку, здесь появятся история, графики прогресса и достижения.')}`;
}
function pgHistory() {
  const list = sortedW().filter(w => w.end);
  return `<header class="top"><a class="ic" href="#/progress">‹</a><h1>История</h1></header>
  ${calendar()}
  ${list.map(workoutRow).join('') || `<div class="empty">Завершённых тренировок пока нет.<br>Начните первую — она появится здесь.</div>`}`;
}
// Раздел «Прогресс»: всё, что показывает результат, — в одном месте.
function pgProgress() {
  const wk = periodStats(period('week', 0)), aw = awardList(), got = aw.reduce((s, a) => s + a.level, 0), all = aw.reduce((s, a) => s + a.tiers.length, 0);
  const weight = db.measures.filter(m => m.type === 'weight').sort((a, b) => b.date - a.date)[0], total = finished().length;
  const hub = (href, icon, title, text) => `<a class="card link award" href="${href}"><div class="aw-ic">${icon}</div><div class="grow"><b>${title}</b>
    <div class="muted small">${text}</div></div><span class="muted">›</span></a>`;
  return `<header class="top"><h1>Прогресс</h1></header>
  <div class="tiles">
    <div class="tile"><b>${wk.n}</b><span>тренировок за неделю</span></div>
    <div class="tile"><b>${tons(wk.ton)}</b><span>поднято за неделю</span></div>
    <div class="tile"><b>${weekStreaks().cur}</b><span>недель подряд</span></div>
  </div>
  ${hub('#/tonnage', '🏋️', 'Тоннаж', `Неделя: ${tonsShort(tonPeriod('week', 0))} · месяц: ${tonsShort(tonPeriod('month', 0))} · рекорды и мини-достижения`)}
  ${hub('#/analysis', '🧠', 'Анализ и советы', 'Что растёт, что застряло, перекосы в нагрузке и что делать дальше')}
  ${hub('#/stats', '📊', 'Сводка и графики', 'Тоннаж, сила, нагрузка по мышцам по неделям и месяцам')}
  ${hub('#/awards', '🏆', 'Достижения', `Получено уровней: ${got} из ${all} · ${mySpecial().map(a => { const st = specialState(a); return a.icon + ' ' + (st.got ? 'взято' : `осталось ${n(Math.max(0, a.kg - st.best))} кг`); }).join(' · ')}`)}
  ${hub('#/history', '🗓️', 'История тренировок', total ? `Всего тренировок: ${total} · календарь и список` : 'Здесь появятся ваши тренировки')}
  ${hub('#/measures', '📏', 'Замеры тела', weight ? `Вес: ${weightAvg(Date.now()) != null ? `в среднем ${n(+weightAvg(Date.now()).toFixed(1))} кг за неделю` : n(weight.value) + ' кг'}${whr(Date.now()) ? ` · талия/бёдра ${n(+whr(Date.now()).v.toFixed(2))}` : ''}` : 'Вес, обхваты и графики изменений')}
  ${hub('#/measures/photo', '📷', 'Фото прогресса', db.photoCount ? `Снимков: ${db.photoCount} · сравнение и анализ изменений` : 'Сравнение «было и стало» и анализ изменений')}`;
}

/* ---------- экран: тренировка ---------- */
function itemCard(w, it, i) {
  const ex = exById(it.exId), k = KINDS[ex.kind] || KINDS.wr, prev = prevSets(it.exId, w.id, w.start);
  const d = `data-w="${w.id}" data-x="${i}"`;
  const sg = w.end ? null : w.deload ? deloadHint(it, prev) : suggestCtx(w, i, it, prev), best = ex.kind === 'wr' ? bestBefore(ex.id, w.start) : 0;
  const linked = i > 0 && w.items[i - 1].ss;   // продолжение суперсета
  // прошлые подходы сопоставляем по типу: разминочные — с разминочными, рабочие — с рабочими
  const prevWork = prev.filter(x => x.t !== 'w'), prevWarm = prev.filter(x => x.t === 'w');
  const match = j => { const warm = it.sets[j].t === 'w'; return (warm ? prevWarm : prevWork)[it.sets.slice(0, j).filter(x => (x.t === 'w') === warm).length]; };
  // разминку предлагаем перед первым упражнением на группу мышц, пока не начаты подходы
  const workW = (it.sets.find(x => x.t !== 'w' && x.w) || {}).w || (prevWork.length ? Math.max(...prevWork.map(x => x.w || 0)) + (sg && sg.dw || 0) : 0);
  const wu = !w.end && db.settings.warmup !== false && !it.sets.some(x => x.t === 'w' || x.done) && !w.items.slice(0, i).some(x => exById(x.exId).muscle === ex.muscle) ? warmupPlan(ex, workW) : [];
  // оценку «как дался подход» спрашиваем только у последнего выполненного, чтобы карточка не разрасталась
  const lastDone = it.sets.reduce((a, s, j) => s.done ? j : a, -1);
  let num = 0, nextW = null;
  return `<section class="card ${it.ss ? 'ss-top' : ''} ${linked ? 'ss-bottom' : ''}">
    ${it.ss && !linked ? `<div class="ss-tag">Суперсет — упражнения подряд, отдых после последнего</div>` : ''}
    <div class="ex-head">${thumb(ex.id, true)}<a href="#/exercise/${ex.id}">${esc(ex.name)}</a><button class="ic sm" data-a="itMenu" ${d}>⋮</button></div>
    <div class="muted small">${prev.length ? 'Прошлый раз: ' + prev.map(s => setTxt(s, ex.kind)).join(' · ') : 'Раньше не выполнялось'}</div>
    ${sg ? `<div class="hint">${sg.text}</div>` : ''}
    ${fillBtns(w, it, i, d)}
    ${wu.length ? `<button class="hint wu" data-a="warmAdd" ${d}>🔥 Разминка: ${wu.map(x => `${n(x.w)}×${x.r}`).join(' · ')} <b>— добавить</b></button>` : ''}
    ${it.note ? `<div class="small" style="margin-top:4px">📝 ${esc(it.note)}</div>` : ''}
    ${it.sets.length ? `<div class="set-row head"><span>#</span><span>${k.a}</span><span>${k.b}</span><span></span></div>` : ''}
    ${it.sets.map((s, j) => {
      const pj = match(j), warm = s.t === 'w', p = pj || (warm ? prevWarm : prevWork).slice(-1)[0] || {};
      // подсказка в пустом поле: прошлый результат, для рабочих подходов — с рекомендованной прибавкой
      const up = sg && !warm && p.t !== 'w';
      // если упражнение раньше не делали — подсказываем вес из предыдущего подхода этой же тренировки
      const earlier = it.sets.slice(0, j).reverse().find(x => x.w != null && x.t !== 'w') || {};
      const pw = up && sg.dw && p.w != null ? p.w + sg.dw : p.w ?? earlier.w;
      const pr = up && sg.dr && p.r != null ? p.r + sg.dr : (up && sg.dw && it.planR) || p.r;
      if (nextW == null && !s.done) nextW = s.w ?? pw ?? null;   // вес ближайшего подхода — для калькулятора блинов
      // поле с кнопками − и +: вес и повторы меняются без клавиатуры
      const field = (f, val, ph) => `<div class="stp"><button data-a="stepVal" data-f="${f}" data-v="-1" ${d} data-s="${j}" aria-label="Меньше">−</button>
        <input type="text" inputmode="decimal" data-in="setVal" data-f="${f}" ${d} data-s="${j}" value="${val ?? ''}" placeholder="${ph ?? ''}">
        <button data-a="stepVal" data-f="${f}" data-v="1" ${d} data-s="${j}" aria-label="Больше">+</button></div>`;
      const record = best && isWork(s) && s.w > best, rate = j === lastDone && !w.end && !warm;
      return `<div class="set-row ${s.done ? 'done' : ''}">
        <button class="num t-${s.t || 'n'}" data-a="setType" ${d} data-s="${j}" aria-label="Тип подхода">${s.t ? SET_TYPES[s.t][1] : ++num}</button>
        ${field('w', s.w, pw)}${field('r', s.r, pr ?? it.planR)}
        <button class="chk" data-a="setToggle" ${d} data-s="${j}" aria-label="Подход выполнен">✓</button>
        ${s.done && (pj || record || (s.f && !rate)) ? `<div class="delta">
          ${record ? `<span class="up">🏆 рекорд</span>` : ''}
          ${pj ? `${s.w || pj.w ? dl((s.w || 0) - (pj.w || 0), k.a) : ''} ${dl((s.r || 0) - (pj.r || 0), k.b)}` : ''}
          ${s.f && !rate ? `<span class="fdot f${s.f}">${FEEL[s.f][0]}</span>` : ''}</div>` : ''}
        ${rate ? `<div class="feel"><span class="muted">Как дался подход?</span>${[1, 2, 3].map(v =>
          `<button class="${s.f === v ? 'on f' + v : ''}" data-a="setFeel" ${d} data-s="${j}" data-v="${v}">${FEEL[v][0]}</button>`).join('')}</div>` : ''}</div>`;
    }).join('')}
    ${w.end ? '' : plateLine(ex, nextW, d)}
    ${(() => {
      if (w.end || linked) return '';
      const blocks = wBlocks(w.items), bi = blocks.findIndex(b => b[0] === it), b = blocks[bi];
      if (!b || blockStarted(b)) return '';
      const first = blocks.findIndex(x => !blockStarted(x)), now = bi > first, later = bi < blocks.length - 1;
      return now || later ? `<div class="row ord">${now ? `<button class="btn sm" data-a="itOrder" ${d} data-v="next">▶ Сделать сейчас</button>` : ''}
        ${later ? `<button class="btn sm ghost" data-a="itOrder" ${d} data-v="end">⏭ Занято — позже</button>` : ''}</div>` : '';
    })()}
    <div class="row"><button class="btn sm" data-a="setAdd" ${d}>+ Подход</button>
      ${w.end ? '' : `<button class="btn sm" data-a="itSwap" ${d}>⇄ Заменить</button>`}
      ${it.sets.length ? `<button class="btn sm ghost" data-a="setDel" ${d}>− Подход</button>` : ''}</div>
  </section>`;
}
function pgWorkout(id) {
  const w = W(id);
  if (!w) return notFound();
  const s = wStats(w);
  return `<header class="top"><a class="ic" href="#/workouts">‹</a><h1 data-a="wRename" data-w="${w.id}">${esc(w.name)}</h1>
    <button class="ic" data-a="wMenu" data-w="${w.id}">⋮</button></header>
  <div class="sub">${fmtDate(w.start)} · <span ${w.end ? '' : `data-elapsed="${w.start}"`}>${fmtDur((w.end || Date.now()) - w.start)}</span>
    · ${s.sets} подх.${s.ton ? ` · ${n(Math.round(s.ton))} кг` : ''}</div>
  ${w.note ? `<div class="note">${esc(w.note)}</div>` : ''}
  ${w.end ? workoutReportHtml(w) + '<h2>Упражнения</h2>' : tonLiveHtml(w)}
  ${w.end ? '' : tip('workout', 'Кнопки − и + меняют вес и повторы без клавиатуры. Нажмите на номер подхода, чтобы отметить разминочный или дроп-сет. Нажмите на фото, чтобы посмотреть технику. В меню ⋮ — суперсет, заметка и время отдыха.')}
  ${w.items.map((it, i) => itemCard(w, it, i)).join('') || `<div class="empty">Добавьте первое упражнение</div>`}
  <button class="btn block" data-a="wAddEx" data-w="${w.id}">+ Добавить упражнение</button>
  ${w.end ? `<button class="btn block ghost" data-a="wRepeat" data-w="${w.id}">Повторить эту тренировку</button>`
    : `<button class="btn block primary" data-a="wFinish" data-w="${w.id}">Завершить тренировку</button>`}`;
}

/* ---------- экран: программы ---------- */
function pgPrograms() {
  return `<header class="top"><h1>Программы</h1></header>
  ${db.programs.map(p => `<a class="card link" href="#/program/${p.id}"><b>${esc(p.name)}</b>
    <div class="muted small">${p.days.length} дн.${p.days.length ? ' · ' + p.days.map(d => esc(d.name)).join(', ') : ''}</div></a>`).join('')
    || `<div class="empty">Программ пока нет.<br>Создайте свою или возьмите готовую.</div>`}
  <a class="btn block primary" href="#/pick">🎯 Подобрать программу под себя</a>
  <a class="btn block" href="#/catalog">📚 Каталог программ · ${CATALOG.filter(c => !mySex() || c[1] === 'a' || c[1] === mySex()).length}</a>
  <div class="row two"><button class="btn" data-a="wizOpen">Конструктор</button><button class="btn" data-a="pAdd">+ С нуля</button></div>
  <p class="muted small">«Подобрать» — несколько вопросов и готовые варианты. «Каталог» — все программы с фильтрами. «Конструктор» собирает программу по параметрам, «С нуля» — пустая программа для своих упражнений.</p>`;
}
// Подбор программы: пол, цель, число дней, уровень — и предпросмотр того, что получится.
const wiz = { sex: 'm', goal: 'mass', place: 'gym', days: 3, split: 'auto', level: 'new' };
function wizHtml(onb) {
  if (mySex()) wiz.sex = mySex();
  figSex = wiz.sex;
  try { return wizBody(onb); } finally { figSex = null; }
}
function wizBody(onb) {
  const p = buildProgram(wiz), g = GOALS[wiz.goal];
  const group = (key, title) => `<div class="muted small" style="margin:4px 2px 6px">${title}</div><div class="chips" style="flex-wrap:wrap">${
    WIZ[key].map(([v, l]) => `<button class="chip ${wiz[key] === v ? 'on' : ''}" data-a="wizSet" data-k="${key}" data-v="${v}"
      ${key === 'split' && !splitOk(v, wiz.days, wiz.place) ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;
  return `${onb ? '' : '<h3>Подбор программы</h3>'}
    ${mySex() ? '' : group('sex', 'Для кого')}${group('goal', 'Цель')}${group('place', 'Где тренируетесь')}${group('days', 'Тренировок в неделю')}
    ${group('split', 'Схема тренировок')}
    <div class="muted small" style="margin:-4px 2px 10px">${wiz.split === 'auto' ? 'Авто — схема подбирается под число дней.'
      : 'Фулбоди доступен до 4 дней в неделю, «жим / тяга / ноги» — от 3 дней и только в зале.'}</div>
    ${group('level', 'Уровень')}
    <div class="note">${esc(g.tip)}</div>
    ${p.days.map(d => `<div class="li day-row">${mapHtml(...dayMuscles(d.items), true)}<div><b>${esc(d.name)}</b>
      <div class="small">${muscleNames(dayMuscles(d.items)[0])}</div>
      <div class="muted small">${d.items.map(it => `${esc(exById(it.exId).name)} ${it.sets}×${it.reps}`).join(' · ')}</div></div></div>`).join('')}
    <div class="row end" style="margin-top:14px"><button class="btn ghost" data-a="${onb ? 'onbSkip' : 'sheetClose'}">${onb ? 'Пропустить' : 'Отмена'}</button>
      <button class="btn primary" data-a="wizCreate">Создать программу</button></div>`;
}
// Оценка длительности дня в минутах: ~40 секунд на подход плюс отдых, минута на смену упражнения.
function dayStats(d) {
  let sets = 0, sec = 0;
  d.items.forEach(it => {
    const kind = exById(it.exId).kind, rest = it.rest || db.settings.rest || 0;
    sets += it.sets;
    sec += 60 + (kind === 'cardio' ? it.sets * it.reps * 60 : it.sets * ((kind === 'time' ? it.reps : 40) + rest));
  });
  return { sets, min: Math.max(5, Math.round(sec / 300) * 5) };
}
function itemPlan(it) {
  const ex = exById(it.exId), k = KINDS[ex.kind] || KINDS.wr;
  if (ex.kind === 'cardio') return `${it.reps} мин`;
  return `${it.sets} × ${it.reps}${ex.kind === 'time' ? ' ' + k.b : ''}`;
}
function pgProgram(id, day) {
  const p = P(id);
  if (!p) return notFound();
  if (day != null && p.days[+day]) return pgDay(p, +day);
  // подходов в неделю по основным мышцам — видно, на что программа делает упор
  const load = {};
  p.days.forEach(d => d.items.forEach(it => {
    const ex = exById(it.exId);
    if (ex.kind !== 'cardio') exMuscles(ex)[0].forEach(m => load[m] = (load[m] || 0) + it.sets);
  }));
  const loads = Object.entries(load).sort((a, b) => b[1] - a[1]), top = loads.length ? loads[0][1] : 1;
  const stats = p.days.map(dayStats);
  const avg = stats.length ? Math.round(stats.reduce((a, s) => a + s.min, 0) / stats.length / 5) * 5 : 0;
  return `<header class="top"><a class="ic" href="#/programs">‹</a><h1 data-a="pRename" data-p="${p.id}">${esc(p.name)}</h1>
    <button class="ic" data-a="pMenu" data-p="${p.id}">⋮</button></header>
  ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
  ${p.days.length ? `${tip('program', 'Назначьте тренировки на дни недели — ближайшая появится на главном экране. Нажмите «Подробнее» у дня, чтобы изменить упражнения.')}<h2>Расписание</h2><section class="card">
    <div class="week">${WD.map((name, i) => { const di = (p.week || {})[i], on = di != null && p.days[di];
      return `<button class="${on ? 'on' : ''}" data-a="weekSet" data-p="${p.id}" data-wd="${i}"><span>${name}</span><b>${on ? 'Д' + (di + 1) : '—'}</b></button>`; }).join('')}</div>
    <div class="muted small" style="margin-top:8px">Нажмите на день недели и выберите тренировку. ${db.activeProgram === p.id
      ? 'Это текущая программа: ближайшая тренировка показывается на главном экране.' : ''}</div>
    ${db.activeProgram === p.id ? '' : `<button class="btn sm" style="margin-top:10px" data-a="pActive" data-p="${p.id}">Сделать текущей программой</button>`}
  </section>
  <div class="tiles">
    <div class="tile"><b>${p.days.length}</b><span>дней в неделю</span></div>
    <div class="tile"><b>${stats.reduce((a, s) => a + s.sets, 0)}</b><span>подходов в неделю</span></div>
    <div class="tile"><b>≈ ${avg}</b><span>минут на тренировку</span></div>
  </div>` : ''}
  ${p.days.map((d, di) => {
    const [pri, sec] = dayMuscles(d.items);
    return `<section class="card">
    <div class="ex-head"><b>${esc(d.name)}</b><button class="ic sm" data-a="dMenu" data-p="${p.id}" data-d="${di}">⋮</button></div>
    <a class="day-row" href="#/program/${p.id}/${di}">${mapHtml(pri, sec, true)}<div>
      ${pri.length ? `<div class="small"><b>${muscleNames(pri)}</b></div>` : ''}
      <div class="muted small">${d.items.length} упр. · ${stats[di].sets} подх. · ≈ ${stats[di].min} мин</div>
      <div class="muted small">${d.items.map(it => esc(exById(it.exId).name)).join(' · ') || 'Упражнений пока нет'}</div></div></a>
    <div class="row"><a class="btn sm" href="#/program/${p.id}/${di}">Подробнее</a>
      <button class="btn sm primary" data-a="start" data-p="${p.id}" data-d="${di}">▶ Начать</button></div>
  </section>`;
  }).join('') || `<div class="empty">Добавьте тренировочные дни</div>`}
  <button class="btn block" data-a="dAdd" data-p="${p.id}">+ Тренировочный день</button>
  ${loads.length ? `<h2>Нагрузка за неделю, подходов</h2><section class="card">${loads.map(([m, v]) =>
    `<div class="bar-row"><span>${MUSCLE_RU[m]}</span><div class="bar"><i style="width:${Math.round(v / top * 100)}%"></i></div><b>${v}</b></div>`).join('')}
    <div class="muted small" style="margin-top:8px">Считаются подходы упражнений, где мышца — основная.</div></section>` : ''}`;
}
// Подробный просмотр одного дня программы: какие мышцы работают и что именно делать.
function pgDay(p, di) {
  const d = p.days[di], [pri, sec] = dayMuscles(d.items), st = dayStats(d);
  const at = `data-p="${p.id}" data-d="${di}"`;
  return `<header class="top"><a class="ic" href="#/program/${p.id}">‹</a><h1>${esc(d.name)}</h1>
    <button class="ic" data-a="dMenu" ${at}>⋮</button></header>
  <div class="sub">${esc(p.name)}</div>
  ${pri.length ? `<h2>Мышцы этого дня</h2><section class="card">${mapHtml(pri, sec)}</section>` : ''}
  <div class="tiles">
    <div class="tile"><b>${d.items.length}</b><span>упражнений</span></div>
    <div class="tile"><b>${st.sets}</b><span>подходов</span></div>
    <div class="tile"><b>≈ ${st.min}</b><span>минут</span></div>
  </div>
  <h2>Упражнения</h2>
  ${d.items.map((it, ii) => {
    const ex = exById(it.exId), rest = it.rest || db.settings.rest;
    return `<section class="card plan">${thumb(ex.id, true)}
      <button class="grow" data-a="piEdit" ${at} data-x="${ii}"><b>${ii + 1}. ${esc(ex.name)}</b>
        <div class="small">${itemPlan(it)}${ex.kind !== 'cardio' && rest ? ` · отдых ${fmtDur(rest * 1000)}` : ''}</div>
        <div class="muted small">${muscleNames(exMuscles(ex)[0]) || esc(ex.muscle)}${it.ss ? ' · ⇅ суперсет со следующим' : ''}</div></button>
      <button class="ic sm" data-a="piEdit" ${at} data-x="${ii}" aria-label="Изменить">✎</button></section>`;
  }).join('') || `<div class="empty">Упражнений пока нет</div>`}
  <div class="muted small" style="margin:0 2px 12px">Нажмите на фото, чтобы увидеть технику и мышцы, на название — чтобы изменить подходы, повторы и отдых.</div>
  <button class="btn block" data-a="piAdd" ${at}>+ Добавить упражнение</button>
  <button class="btn block primary" data-a="start" ${at}>▶ Начать тренировку</button>`;
}

/* ---------- каталог готовых программ ---------- */
const cap = s => s.replace(/^./, c => c.toUpperCase());
const cf = { sex: '', goal: '', place: '', level: '', days: '' };
function catTags(c) {
  const [, sex, place, level, goal, focus, days] = c;
  return [sex === 'f' ? 'для женщин' : sex === 'm' ? 'для мужчин' : 'для всех', PLACE_NAMES[place], `${days.length} дн. в неделю`,
    LEVEL_NAMES[level], GOAL_NAMES[goal], focus === 'all' ? '' : 'акцент: ' + FOCUS_NAMES[focus]].filter(Boolean);
}
const tagsHtml = c => `<div class="tags">${catTags(c).map(t => `<span>${t}</span>`).join('')}</div>`;
function catListHtml() {
  const sx = mySex() || cf.sex;
  const list = CATALOG.filter(c => (!sx || c[1] === 'a' || c[1] === sx) && (!cf.goal || c[4] === cf.goal) && (!cf.place || c[2] === cf.place)
    && (!cf.level || c[3] === cf.level) && (!cf.days || c[6].length === +cf.days));
  const total = CATALOG.filter(c => !mySex() || c[1] === 'a' || c[1] === mySex()).length;
  return `<div class="muted small" style="margin:0 2px 8px">Найдено программ: ${list.length} из ${total}</div>` +
    (list.map(c => `<a class="card link" href="#/catalog/${CATALOG.indexOf(c)}"><b>${esc(c[0])}</b>${tagsHtml(c)}
      <div class="muted small">${esc(c[7].split('. ')[0].replace(/\.$/, ''))}.</div></a>`).join('')
      || `<div class="empty">Под такие условия программ нет.<br>Уберите один из фильтров.</div>`);
}
// Дни программы с мышцами и упражнениями — для каталога и предпросмотра в анкете.
function programPreview(p) {
  return p.days.map(d => {
    const st = dayStats(d), [pri, sec] = dayMuscles(d.items);
    return `<section class="card"><b>${esc(d.name)}</b>
      <div class="day-row">${mapHtml(pri, sec, true)}<div>${pri.length ? `<div class="small"><b>${muscleNames(pri)}</b></div>` : ''}
        <div class="muted small">${d.items.length} упр. · ${st.sets} подх. · ≈ ${st.min} мин</div></div></div>
      ${d.items.map(it => `<div class="day-ex"><b>${esc(exById(it.exId).name)}</b><span class="muted">${itemPlan(it)}${it.ss ? ' · суперсет со следующим' : ''}</span></div>`).join('')}
    </section>`;
  }).join('');
}
function pgCatalog(id) {
  const c = id != null && CATALOG[+id];
  if (c) {
    const p = catalogProgram(c), stats = p.days.map(dayStats);
    const add = `<button class="btn block primary" data-a="catAdd" data-id="${+id}">Добавить в мои программы</button>`;
    return `<header class="top"><a class="ic" href="#/catalog">‹</a><h1>${esc(c[0])}</h1></header>
    ${tagsHtml(c)}<div class="note" style="margin-top:10px">${esc(c[7])}</div>
    <div class="tiles">
      <div class="tile"><b>${p.days.length}</b><span>дней в неделю</span></div>
      <div class="tile"><b>${stats.reduce((a, s) => a + s.sets, 0)}</b><span>подходов в неделю</span></div>
      <div class="tile"><b>≈ ${Math.round(stats.reduce((a, s) => a + s.min, 0) / stats.length / 5) * 5}</b><span>минут на тренировку</span></div>
    </div>
    ${add}${programPreview(p)}${add}`;
  }
  const sel = (k, any, opts) => `<select data-in="catF" data-k="${k}">${[['', any], ...opts].map(([v, l]) =>
    `<option value="${v}" ${String(cf[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const named = o => Object.entries(o).map(([v, l]) => [v, cap(l)]);
  return `<header class="top"><a class="ic" href="#/programs">‹</a><h1>Каталог программ</h1></header>
  <div class="filters">${mySex() ? '' : sel('sex', 'Для кого: все', [['f', 'Для женщин'], ['m', 'Для мужчин']])}${sel('goal', 'Цель: любая', named(GOAL_NAMES))}
    ${sel('place', 'Место: любое', named(PLACE_NAMES))}${sel('level', 'Уровень: любой', named(LEVEL_NAMES))}
    ${sel('days', 'Дней в неделю: сколько угодно', [2, 3, 4, 5, 6].map(d => [d, d + ' дн. в неделю']))}</div>
  <div id="catbox">${catListHtml()}</div>`;
}
// Добавляет программу к своим: расписание по умолчанию, а если текущей программы нет — делает её текущей.
function adoptProgram(p) {
  p.id = uid();
  p.days.forEach(d => d.id = uid());
  const spread = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] }[p.days.length] || [];
  p.week = Object.fromEntries(spread.map((wd, i) => [wd, i]));
  db.programs.push(p);
  if (!activeProgram()) db.activeProgram = p.id;
  return p;
}

/* ---------- анкета: подбор программы под человека ---------- */
// Вопросы идут по одному; в конце — несколько подходящих программ на выбор, а не весь каталог.
let ob = null;
const OB_STEPS = ['sex', 'body', 'goal', 'level', 'place', 'days', 'focus', 'result'];
const OB_FOCUS = {
  f: [['all', '✨', 'Всё тело равномерно', 'Без перекосов: каждая группа мышц получает свою нагрузку'], ['glutes', '🍑', 'Ягодицы и ноги', 'Больше работы на низ тела'],
    ['abs', '🎯', 'Пресс и талия', 'Основная программа плюс отдельный комплекс на пресс'], ['upper', '💪', 'Верх тела и осанка', 'Плечи, спина и грудь']],
  m: [['all', '✨', 'Всё тело равномерно', 'Без перекосов: каждая группа мышц получает свою нагрузку'], ['chest', '🛡️', 'Грудь и спина', 'Упор на корпус'],
    ['arms', '💪', 'Руки и плечи', 'Бицепс, трицепс и дельты'], ['legs', '🦵', 'Ноги', 'Если низ отстаёт от верха'], ['abs', '🎯', 'Пресс', 'Основная программа плюс отдельный комплекс на пресс']],
};
const FOCUS_TAGS = { all: ['all'], glutes: ['glutes', 'legs'], abs: ['abs'], upper: ['upper', 'chest', 'back'], chest: ['chest', 'back'], arms: ['arms', 'shoulders'], legs: ['legs'] };
function obInit() {
  const p = profile(), known = !!db.profile;
  ob = { step: 0, sex: known ? p.sex : null, age: known ? p.age : 25, height: known ? p.height : 170, weight: known ? p.weight : 65,
    goal: null, level: null, place: null, days: 3, time: 60, focus: 'all' };
}
// Подбирает программы каталога под ответы: чем больше совпадений, тем выше в списке.
function matchPrograms(o) {
  const L = { new: 0, mid: 1, pro: 2 }, near = { mass: ['strength', 'tone'], loss: ['tone'], tone: ['loss', 'mass'], strength: ['mass'] };
  const want = FOCUS_TAGS[o.focus] || ['all'];
  return CATALOG.map(c => {
    const [, sex, place, level, goal, focus, days] = c;
    if (place !== o.place || (sex !== 'a' && sex !== o.sex)) return null;
    if (L[level] > L[o.level] + 1) return null;   // программы на два уровня сложнее не предлагаем
    const p = catalogProgram(c), min = Math.round(p.days.reduce((a, d) => a + dayStats(d).min, 0) / p.days.length / 5) * 5;
    const hit = { goal: goal === o.goal, days: days.length === o.days, level: level === o.level, focus: want.includes(focus), time: min <= o.time + 10 };
    const score = (hit.goal ? 6 : near[o.goal].includes(goal) ? 2 : -3) + (hit.days ? 4 : Math.abs(days.length - o.days) === 1 ? 1 : -3)
      + (hit.level ? 3 : -2) + (hit.focus ? 4 : focus === 'all' ? 1 : -4) + (hit.time ? 1 : -2) + (sex === o.sex ? 1 : 0);
    return { c, p, min, hit, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}
function obResult() {
  const all = matchPrograms(ob), top = all.filter(m => m.c[5] !== 'abs' || ob.focus !== 'abs').slice(0, 3);
  // если среди лучших нет программы с выбранным акцентом, а в каталоге она есть — показываем её третьей
  const accent = ob.focus !== 'all' && ob.focus !== 'abs' && !top.some(m => m.hit.focus) ? all.find(m => m.hit.focus) : null;
  if (accent) top[Math.min(2, top.length)] = accent;
  // когда каталог подходит слабо (редкое сочетание ответов), первой идёт программа, собранная под ответы
  const genFirst = !top.length || top[0].score < 8;
  // при акценте на пресс основную программу дополняем отдельным комплексом
  const extra = ob.focus === 'abs' ? all.find(m => m.c[5] === 'abs') : null;
  const gen = buildProgram({ sex: ob.sex, goal: ob.goal, days: ob.days, level: ob.level === 'new' ? 'new' : 'pro', place: ob.place });
  const x = (() => { const save = db.profile; db.profile = { ...profile(), ...obProfile() }; const r = nutrition(); db.profile = save; return r; })();
  const why = m => [m.hit.goal && 'цель', m.hit.days && 'число дней', m.hit.level && 'уровень', m.hit.focus && ob.focus !== 'all' && 'акцент', m.hit.time && 'время'].filter(Boolean).join(', ');
  const card = (m, i, label) => `<section class="card ${i === 0 ? 'active' : ''}">${label ? `<div class="badge">${label}</div>` : ''}
    <b>${esc(m.c[0])}</b>${tagsHtml(m.c)}
    <div class="muted small">${esc(m.c[7].split('. ')[0].replace(/\.$/, ''))}.</div>
    <div class="small" style="margin-top:6px">≈ ${m.min} мин на тренировку${why(m) ? ` · совпало: ${why(m)}` : ''}</div>
    <div class="row"><button class="btn sm primary" data-a="obChoose" data-v="${CATALOG.indexOf(m.c)}">Выбрать</button>
      <button class="btn sm" data-a="obPreview" data-v="${CATALOG.indexOf(m.c)}">Посмотреть состав</button></div></section>`;
  const genCard = `<section class="card ${genFirst ? 'active' : ''}"><div class="badge ${genFirst ? '' : 'alt'}">${genFirst ? 'Лучшее совпадение' : 'Собрана под ваши ответы'}</div><b>${esc(gen.name)}</b>
      <div class="muted small">Составлена автоматически под ваши ответы: ${gen.days.map(d => d.name.replace(/^День \d+ · /, '')).join(' · ')}.</div>
      <div class="row"><button class="btn sm ${genFirst ? 'primary' : ''}" data-a="obChoose" data-v="gen">Выбрать</button>
        <button class="btn sm" data-a="obPreview" data-v="gen">Посмотреть состав</button></div></section>`;
  return `<section class="card"><b>Ваша норма на день</b>
      <div class="muted small" style="margin-top:4px">Около ${x.kcal} ккал, ${x.protein} г белка и ${litres(x.water)} воды. Подробный расчёт — в «Ещё» → «Питание, вода и сон».</div></section>
    <h2>Подходящие программы</h2>
    ${genFirst ? genCard : ''}
    ${top.map((m, i) => card(m, genFirst ? i + 1 : i, m === accent ? 'С вашим акцентом' : i === 0 && !genFirst ? 'Лучшее совпадение' : '')).join('')}
    ${extra ? card(extra, 9, 'В дополнение: пресс') : ''}
    ${genFirst ? '' : genCard}
    <a class="btn block ghost" href="#/catalog">Посмотреть весь каталог (${CATALOG.filter(c => !mySex() || c[1] === 'a' || c[1] === mySex()).length})</a>`;
}
const obProfile = () => ({ sex: ob.sex, age: ob.age, height: ob.height, weight: ob.weight,
  goal: ob.goal === 'loss' ? 'loss' : ob.goal === 'mass' ? 'gain' : 'keep', act: ob.days <= 2 ? 1.375 : ob.days <= 4 ? 1.55 : 1.725 });
function pgPick(first) {
  if (!ob) obInit();
  const step = OB_STEPS[ob.step], n1 = ob.step + 1, total = OB_STEPS.length;
  const opt = (k, v, icon, title, text) => `<button class="opt ${ob[k] === v ? 'on' : ''}" data-a="obSet" data-k="${k}" data-v="${v}">
    <span class="oi">${icon}</span><div><b>${title}</b>${text ? `<div class="muted small">${text}</div>` : ''}</div></button>`;
  const numRow = (k, label, unit) => `<div class="num-row"><span>${label}</span><div class="stp"><button data-a="obStep" data-k="${k}" data-v="-1">−</button>
    <input type="text" inputmode="decimal" data-in="obNum" data-k="${k}" value="${ob[k]}"><button data-a="obStep" data-k="${k}" data-v="1">+</button></div><i>${unit}</i></div>`;
  const chips = (k, list) => `<div class="chips" style="flex-wrap:wrap">${list.map(([v, l]) =>
    `<button class="chip ${ob[k] === v ? 'on' : ''}" data-a="obSet" data-k="${k}" data-v="${v}" data-stay="1">${l}</button>`).join('')}</div>`;
  const next = `<button class="btn block primary" style="margin-top:14px" data-a="obNext">Далее</button>`;
  const screens = {
    sex: ['Для кого подбираем программу?', 'От этого зависят упражнения и расчёт питания.',
      opt('sex', 'f', '👩', 'Женщина') + opt('sex', 'm', '👨', 'Мужчина')],
    body: ['Возраст, рост и вес', 'Нужны, чтобы рассчитать калории, белок и норму воды. Данные остаются только на этом устройстве.',
      `<section class="card">${numRow('age', 'Возраст', 'лет')}${numRow('height', 'Рост', 'см')}${numRow('weight', 'Вес', 'кг')}</section>${next}`],
    goal: ['Какая у вас цель?', 'Под неё подбираются число повторов, отдых и кардио.',
      opt('goal', 'loss', '🔥', 'Похудеть', 'Убрать лишнее, сохранив мышцы') + opt('goal', 'tone', '🌿', 'Подтянуть фигуру', 'Тонус, осанка и хорошее самочувствие')
      + opt('goal', 'mass', '💪', 'Набрать мышечную массу', 'Стать крепче и объёмнее') + opt('goal', 'strength', '🏋️', 'Стать сильнее', 'Рост рабочих весов в базовых упражнениях')],
    level: ['Какой у вас опыт тренировок?', 'Чтобы нагрузка была посильной и при этом не слишком лёгкой.',
      opt('level', 'new', '🌱', 'Новичок', 'Нет опыта или был долгий перерыв') + opt('level', 'mid', '🌿', 'Средний', 'Занимаюсь от полугода, знаю основные упражнения')
      + opt('level', 'pro', '🌳', 'Опытный', 'Тренируюсь регулярно больше двух лет')],
    place: ['Где будете заниматься?', 'Программа составляется под доступное оборудование.',
      opt('place', 'gym', '🏟️', 'В тренажёрном зале', 'Штанги, тренажёры, блоки') + opt('place', 'db', '🏠', 'Дома с гантелями', 'Пара гантелей и коврик')
      + opt('place', 'body', '🤸', 'Дома без инвентаря', 'Только собственный вес')],
    days: ['Сколько времени готовы уделять?', 'Лучше выбрать реалистичный график: регулярность важнее числа тренировок.',
      `<section class="card"><div class="muted small" style="margin:0 2px 6px">Тренировок в неделю</div>${chips('days', [2, 3, 4, 5, 6].map(d => [d, String(d)]))}
        <div class="muted small" style="margin:6px 2px">Длительность одной тренировки</div>${chips('time', [[30, 'до 30 мин'], [45, '45 мин'], [60, 'около часа'], [90, 'до 1,5 часа']])}</section>${next}`],
    focus: ['На что сделать акцент?', 'Основа программы в любом случае прорабатывает всё тело.',
      (OB_FOCUS[ob.sex] || OB_FOCUS.f).map(([v, icon, title, text]) => opt('focus', v, icon, title, text)).join('')],
    result: ['Готово — вот что вам подходит', 'Выберите один вариант. Его можно будет изменить или заменить в разделе «Программы».', ''],
  };
  const [title, text, body] = screens[step];
  return `<div class="ob-head">${ob.step ? `<button class="ic" data-a="obBack" aria-label="Назад">‹</button>` : '<span class="ic"></span>'}
      <div class="bar"><i style="width:${Math.round(n1 / total * 100)}%"></i></div><span class="muted small">${n1} из ${total}</span></div>
    ${first && ob.step === 0 ? `<div class="welcome"><div class="hello">👋</div><h1>Добро пожаловать в GymLog</h1>
      <p class="muted">Несколько вопросов — и приложение подберёт программу тренировок, расписание и норму питания.</p></div>` : ''}
    <h1 class="ob-title">${title}</h1><p class="muted ob-text">${text}</p>
    ${step === 'result' ? obResult() : body}
    ${first && ob.step === 0 ? `<button class="btn block ghost" style="margin-top:8px" data-a="onbSkip">Пропустить и настроить самостоятельно</button>` : ''}`;
}

/* ---------- экран: упражнения ---------- */
// s — раздел «для женщин» / «для мужчин»; null значит «ещё не выбирали»: тогда берётся пол из профиля
const ef = { q: '', m: '', s: null }, pf = { q: '', m: '', s: null };
// Какие упражнения относятся к женским и мужским: смотрим, в каких программах каталога и подбора они встречаются.
// Упражнения, которых нет ни в одной программе, распределяются по правилу: ноги, пресс, кардио и всё,
// что делается с гантелями, на блоках, тренажёрах и с весом тела, — для всех; остальное со штангой — в мужской раздел.
let EX_SEX = null;
function exSexMap() {
  if (EX_SEX) return EX_SEX;
  const fem = new Set(), men = new Set();
  const add = (set, keys) => keys.forEach(k => blockOf(k)[1].split(' ').forEach(t => set.add(parseInt(t, 10))));
  CATALOG.forEach(c => { if (c[1] !== 'm') add(fem, c[6]); if (c[1] !== 'f') add(men, c[6]); });
  Object.values(SPLITS.f).forEach(a => add(fem, a)); Object.values(SPLITS.m).forEach(a => add(men, a));
  Object.values(SPLIT_CYCLES).forEach(o => { add(fem, o.f); add(men, o.m); });
  Object.values(HOME_CYCLES).forEach(o => { add(fem, o.full); add(men, o.full); add(fem, o.ul.f); add(men, o.ul.m); });
  const womenOnly = new Set([108, 113]);   // мост на одной ноге и отведение ноги на блоке — остальное «женское» подходит и мужчинам
  return EX_SEX = BASE_EXERCISES.map(([, group, equip], i) => {
    if (fem.has(i)) return womenOnly.has(i) ? 'f' : 'a';
    if (men.has(i)) return 'm';
    return ['Ноги', 'Пресс', 'Кардио'].includes(group) || equip !== 'Штанга' ? 'a' : 'm';
  });
}
// 'f' — женский раздел, 'm' — мужской, 'a' — для всех (в том числе свои упражнения)
const exSex = ex => { const m = /^e(\d+)$/.exec(ex.id); return (m && exSexMap()[+m[1]]) || 'a'; };
const exSexLabel = ex => ({ f: 'чаще в женских программах', m: 'чаще в мужских программах' })[exSex(ex)] || '';
function exBox(f) {
  const q = f.q.toLowerCase();
  const me = mySex();
  if (f.s == null || (me && f.s && f.s !== me)) f.s = me || '';
  // при поиске по названию раздел не учитывается: ищем по всему справочнику
  const all = db.exercises.filter(e => !e.archived && (!f.m || e.muscle === f.m) && (!q || e.name.toLowerCase().includes(q)));
  const list = all.filter(e => q || !f.s || exSex(e) === 'a' || exSex(e) === f.s)
    .sort((a, b) => MUSCLES.indexOf(a.muscle) - MUSCLES.indexOf(b.muscle) || a.name.localeCompare(b.name, 'ru'));
  let last = null;
  return `<div class="seg">${(me ? [[me, me === 'f' ? 'Для женщин' : 'Для мужчин'], ['', 'Все']] : [['', 'Все'], ['f', 'Для женщин'], ['m', 'Для мужчин']]).map(([v, l]) =>
    `<button class="${f.s === v ? 'on' : ''}" data-a="exSexSet" data-v="${v}">${l}</button>`).join('')}</div>
  <div class="muted small" style="margin:0 2px 10px">${q ? 'Поиск идёт по всему справочнику.' : f.s ? `Упражнения из ${f.s === 'f' ? 'женских' : 'мужских'} программ и общие для всех: ${list.length} из ${all.length}. Остальные — во вкладке «Все».`
    : `Весь справочник: ${all.length} упражнений.`}</div>
  <div class="chips"><button class="chip ${f.m ? '' : 'on'}" data-a="exMuscle" data-m="">Все мышцы</button>
    ${MUSCLES.map(m => `<button class="chip ${f.m === m ? 'on' : ''}" data-a="exMuscle" data-m="${m}">${m}</button>`).join('')}</div>
  ${list.map(e => (e.muscle !== last ? `<h2>${esc(last = e.muscle)}</h2>` : '') +
    `<button class="li" data-a="exTap" data-id="${e.id}">${thumb(e.id)}<span class="grow">${esc(e.name)}</span><span class="muted small">${esc(e.equip)}</span></button>`).join('')
    || `<div class="empty">Ничего не найдено</div>`}`;
}
function pgExercises() {
  return `<header class="top"><h1>Упражнения</h1><button class="ic" data-a="exAdd" aria-label="Добавить">＋</button></header>
  <input class="search" type="search" placeholder="Поиск упражнения" data-in="exSearch" value="${esc(ef.q)}">
  <div id="exbox">${exBox(ef)}</div>`;
}
function pickExercise() {
  pf.q = '';
  const p = sheet(`<h3>Выберите упражнение</h3>
    <input class="search" type="search" placeholder="Поиск упражнения" data-in="exSearch">
    <div id="pexbox">${exBox(pf)}</div>`);
  picker = true;
  return p;
}

// Итоги упражнения по тренировкам (от старых к новым): a/b — максимум первого и второго поля подхода.
let metric = 'rm';
function sessions(exId) {
  const out = [];
  for (const w of sortedW().reverse()) {
    const sets = w.items.filter(it => it.exId === exId).flatMap(it => it.sets.filter(isWork));
    if (!sets.length) continue;
    out.push({
      t: w.start, w, sets,
      a: Math.max(...sets.map(s => s.w || 0)),
      b: Math.max(...sets.map(s => s.r || 0)),
      reps: sets.reduce((x, s) => x + (s.r || 0), 0),
      rm: +Math.max(...sets.map(s => (s.w || 0) * (1 + (s.r || 0) / 30))).toFixed(1),
      vol: Math.round(sets.reduce((x, s) => x + (s.w || 0) * (s.r || 0), 0)),
    });
  }
  return out;
}
function pgExercise(id) {
  const ex = exById(id), k = KINDS[ex.kind] || KINDS.wr, wr = ex.kind === 'wr';
  const ser = sessions(id), last = ser[ser.length - 1], prev = ser[ser.length - 2], first = ser[0];
  const all = ser.flatMap(p => p.sets);
  const best = all.reduce((a, s) => (s.w || 0) > (a.w || 0) || ((s.w || 0) === (a.w || 0) && (s.r || 0) > (a.r || 0)) ? s : a, {});
  const rm = Math.max(0, ...ser.map(p => p.rm));
  const hasA = ser.some(p => p.a > 0);
  const rows = [hasA && ['a', 'Макс. ' + k.a], ['b', 'Макс. ' + k.b], ['reps', 'Всего ' + k.b],
    wr && hasA && ['vol', 'Объём, кг'], wr && hasA && ['rm', '1ПМ, кг']].filter(Boolean);
  const series = key => ser.map(p => ({ t: p.t, v: p[key] }));
  if (metric !== 'vol') metric = 'rm';
  return `<header class="top"><button class="ic" data-a="back">‹</button><h1>${esc(ex.name)}</h1>
    <button class="ic" data-a="exMenu" data-id="${ex.id}">⋮</button></header>
  <div class="sub">${esc([ex.muscle, ex.equip, k.name, exSexLabel(ex)].filter(Boolean).join(' · '))}</div>
  ${demo(ex.id)}
  ${muscleMap(ex) ? `<section class="card">${muscleMap(ex)}</section>` : ''}
  ${techHtml(ex) ? `<h2>Техника</h2><section class="card">${techHtml(ex)}</section>` : ''}
  ${(() => {
    const all = analogsOf(ex), show = analogAll === ex.id ? all : all.slice(0, 5), main = exMuscles(ex)[0][0];
    return all.length ? `<h2>Чем заменить</h2><section class="card">
      <div class="muted small" style="margin-bottom:4px">Если упражнение не подходит или снаряд занят — ${main ? `вот другие на ту же мышцу (${MUSCLE_RU[main]})` : 'вот похожие'}.</div>
      ${show.map(e => `<button class="li" data-a="exTap" data-id="${e.id}">${thumb(e.id)}<span class="grow">${esc(e.name)}</span><span class="muted small">${esc(e.equip)}</span></button>`).join('')}
      ${all.length > show.length ? `<button class="btn sm block" style="margin:10px 0 0" data-a="analogMore" data-id="${ex.id}">Показать все варианты · ${all.length}</button>` : ''}
    </section>` : '';
  })()}
  <div class="tiles">
    <div class="tile"><b>${ser.length}</b><span>тренировок</span></div>
    <div class="tile"><b>${all.length ? setTxt(best, ex.kind) : '—'}</b><span>лучший подход</span></div>
    <div class="tile"><b>${wr && rm ? n(Math.round(rm)) : all.length}</b><span>${wr && rm ? 'расчётный 1ПМ, кг' : 'подходов'}</span></div>
  </div>
  ${!ser.length ? `<div class="empty">Это упражнение ещё не выполнялось.<br>После первой тренировки здесь появится прогресс.</div>` : `
  <h2>Прогресс</h2>
  <section class="card">
    <div class="prog head"><span></span><span>сейчас</span><span>к прошлой</span><span>за всё время</span></div>
    ${rows.map(([key, label]) => `<div class="prog"><span>${label}</span><b>${n(last[key])}</b>
      <span>${prev ? dl(last[key] - prev[key]) : '—'}</span><span>${prev ? dl(last[key] - first[key]) : '—'}</span></div>`).join('')}
    ${prev ? '' : `<div class="muted small" style="margin-top:8px">Сравнение появится после второй тренировки</div>`}
  </section>
  ${hasA ? `<h2>Прогресс: ${wr ? 'вес' : k.a}</h2><section class="card">${chart('exa', series('a'), k.a)}</section>` : ''}
  <h2>Прогресс: ${wr ? 'повторения' : k.b}</h2><section class="card">${chart('exb', series('b'), k.b)}</section>
  ${wr && hasA ? `<h2>Сила и объём</h2><section class="card">
    <div class="chips">${[['rm', 'Расчётный 1ПМ'], ['vol', 'Объём за тренировку']].map(([v, l]) =>
      `<button class="chip ${metric === v ? 'on' : ''}" data-a="metric" data-v="${v}">${l}</button>`).join('')}</div>
    ${chart('exc', series(metric), 'кг')}</section>` : ''}
  <h2>История</h2>
  ${ser.map((p, i) => `<a class="card link" href="#/workout/${p.w.id}"><div class="ex-head"><span class="muted small">${fmtDate(p.t)}</span>
    ${i ? `<span class="small">${hasA ? dl(p.a - ser[i - 1].a, k.a) : ''} ${dl(p.b - ser[i - 1].b, k.b)}</span>` : ''}</div>
    <div>${p.sets.map(s => setTxt(s, ex.kind)).join(' · ')}</div></a>`).reverse().join('')}`}`;
}

/* ---------- экран: замеры ---------- */
let mType = 'weight';
/* Фото прогресса лежат в IndexedDB: в localStorage, где остальные данные, они не поместятся. */
let idb, photos = null;
const photoUrls = {};
function photoStore(mode, fn) {
  idb = idb || new Promise((res, rej) => {
    const r = indexedDB.open('gymlog-photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return idb.then(d => new Promise((res, rej) => {
    const tx = d.transaction('photos', mode), rq = fn(tx.objectStore('photos'));
    tx.oncomplete = () => res(rq && rq.result);
    tx.onerror = () => rej(tx.error);
  }));
}
async function loadPhotos() {
  try {
    photos = (await photoStore('readonly', s => s.getAll())).sort((a, b) => a.date - b.date);
    photos.forEach(p => photoUrls[p.id] = photoUrls[p.id] || URL.createObjectURL(p.blob));
    if (db.photoCount !== photos.length) { db.photoCount = photos.length; save(); }
  } catch (e) { photos = []; toast('Хранилище фото недоступно'); }
  if (location.hash.startsWith('#/measures') && mType === 'photo') render();
  if (typeof IS_PC !== 'undefined' && IS_PC) pcPhotoCache();   // на ПК — обновить фото, которые уйдут на телефон
}
// уменьшаем снимок до 1280 пикселей по длинной стороне — этого хватает для сравнения, а места уходит в разы меньше
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('не удалось обработать снимок')), 'image/jpeg', .85);
    };
    img.onerror = () => rej(new Error('файл не похож на изображение'));
    img.src = url;
  });
}
function photosHtml() {
  if (!photos) { loadPhotos(); return `<div class="empty">Загрузка…</div>`; }
  // сравниваем снимки одного ракурса: последний и самый ранний из того же ракурса
  const last = photos[photos.length - 1], same = last && photos.find(p => (p.pose || '') === (last.pose || ''));
  const first = same && same !== last ? same : photos[0];
  return `${photos.length > 1 ? `<h2>Было и стало</h2><div class="cmp">
      <figure><img src="${photoUrls[first.id]}" alt=""><figcaption>${fmtDate(first.date)}</figcaption></figure>
      <figure><img src="${photoUrls[last.id]}" alt=""><figcaption>${fmtDate(last.date)}</figcaption></figure></div>` : ''}
    ${photos.length > 1 ? `<a class="card link award" href="#/photoan"><div class="aw-ic">🔍</div><div class="grow"><b>Анализ фото</b>
      <div class="muted small">Шторка и наложение, изменения замеров и силы между снимками, разбор с ИИ</div></div><span class="muted">›</span></a>` : ''}
    <button class="btn block primary" data-a="photoAdd">+ Добавить фото</button>
    ${photos.length ? `<h2>Все фото</h2><div class="pgrid">${[...photos].reverse().map(p => `<button data-a="photoView" data-id="${p.id}">
      <img src="${photoUrls[p.id]}" alt="" loading="lazy"><span>${fmtDate(p.date)}${p.pose ? ' · ' + poseName(p.pose).toLowerCase() : ''}</span></button>`).join('')}</div>`
      : `<div class="empty">Снимайте себя раз в 2–4 недели в одной позе и при одном освещении — изменения, незаметные в зеркале, будут видны на фото.</div>`}
    <p class="muted small">Фото хранятся на этом устройстве${canSync() ? " (и на ПК, если включена синхронизация)" : ""} и в резервную копию не входят.</p>`;
}
function pgMeasures(sub) {
  if (sub === 'photo') { mType = 'photo'; history.replaceState(null, '', '#/measures'); }
  const chips = `<div class="chips"><button class="chip ${mType === 'photo' ? 'on' : ''}" data-a="mType" data-v="photo">📷 Фото</button>
    ${MEASURES.map(([v, l]) => `<button class="chip ${mType === v ? 'on' : ''}" data-a="mType" data-v="${v}">${l}</button>`).join('')}</div>`;
  if (mType === 'photo') return `<header class="top"><a class="ic" href="#/progress">‹</a><h1>Замеры тела</h1></header>${chips}${photosHtml()}`;
  const [, name, unit] = MEASURES.find(m => m[0] === mType);
  const list = db.measures.filter(m => m.type === mType).sort((a, b) => a.date - b.date);
  const diff = list.length > 1 ? list[list.length - 1].value - list[0].value : null;
  return `<header class="top"><a class="ic" href="#/progress">‹</a><h1>Замеры тела</h1></header>
  ${chips}
  <section class="card">${chart('ms', list.map(m => ({ t: m.date, v: m.value })), unit)}
    ${diff != null ? `<div class="muted small" style="margin-top:6px">Изменение за всё время: ${diff > 0 ? '+' : ''}${n(diff)} ${unit}</div>` : ''}</section>
  ${mType === 'weight' ? weightAvgCard() : mType === 'waist' || mType === 'hips' ? whrCard() : ''}
  <button class="btn block primary" data-a="mAdd">+ Добавить замер: ${name.toLowerCase()}</button>
  ${list.length ? `<h2>Записи</h2><section class="card">${[...list].reverse().map(m => `<button class="li" data-a="mDel" data-id="${m.id}">
    <span>${fmtDate(m.date)}</span><b>${n(m.value)} ${unit}</b></button>`).join('')}</section>` : ''}`;
}

/* ---------- экран: ещё ---------- */
function pgMore() {
  const s = db.settings, opt = (v, l, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`;
  return `<header class="top"><h1>Ещё</h1></header>
  <section class="card">
    <a class="li" href="#/health"><span>🥗 Питание, вода и сон</span><span class="muted">›</span></a>
    <a class="li" href="#/stretch"><span>🧘 Разминка и растяжка</span><span class="muted">›</span></a>
    ${profile().sex === 'f' ? `<a class="li" href="#/cycle"><span>🌙 Дневник цикла</span><span class="muted">›</span></a>` : ''}
  </section>
  <h2>Справочник</h2>
  <section class="card">
    <a class="li" href="#/supps"><span>💊 Спортивные добавки</span><span class="muted">›</span></a>
    <a class="li" href="#/meals"><span>🍽️ Примеры рациона</span><span class="muted">›</span></a>
    <a class="li" href="#/glossary"><span>📖 Словарь терминов</span><span class="muted">›</span></a>
  </section>
  <h2>Настройки</h2>
  <section class="card">
    <label class="switch"><span>Отдых между подходами</span><select data-in="setting" data-k="rest">
      ${[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map(v => opt(v, v ? fmtDur(v * 1000) : 'Выключен', s.rest)).join('')}</select></label>
    <label class="switch"><span>Звук по окончании отдыха</span><input type="checkbox" data-in="setting" data-k="sound" ${s.sound ? 'checked' : ''}></label>
    ${canVibrate() ? `<label class="switch"><span>Вибрация</span><input type="checkbox" data-in="setting" data-k="vibro" ${s.vibro ? 'checked' : ''}></label>` : ''}
    <label class="switch"><span>Прибавка: грудь, спина, ноги</span><select data-in="setting" data-k="stepBig">${[2.5, 5, 10].map(v => opt(v, n(v) + ' кг', s.stepBig || 5)).join('')}</select></label>
    <label class="switch"><span>Прибавка: руки, плечи, пресс</span><select data-in="setting" data-k="stepSmall">${[1, 1.25, 2.5, 5].map(v => opt(v, n(v) + ' кг', s.stepSmall || 2.5)).join('')}</select></label>
    <label class="switch"><span>Предлагать разминочные подходы</span><input type="checkbox" data-in="setting" data-k="warmup" ${s.warmup !== false ? 'checked' : ''}></label>
    <label class="switch"><span>Не гасить экран во время тренировки</span><input type="checkbox" data-in="setting" data-k="keepOn" ${s.keepOn !== false ? 'checked' : ''}></label>
    <label class="switch"><span>Тема</span><select data-in="setting" data-k="theme">
      ${opt('dark', 'Тёмная', s.theme)}${opt('light', 'Светлая', s.theme)}${opt('auto', 'Как в системе', s.theme)}</select></label>
  </section>
  ${!canNotify() ? '' : `<h2>Напоминания о тренировке</h2>
  <section class="card">${(() => {
    const c = remindCfg(), native = window.Android && Android.setReminders, p = activeProgram(), planned = p && p.week && Object.values(p.week).some(v => v != null);
    return `${native ? '' : `<div class="hint" style="margin:0 0 8px">${typeof IS_IOS !== 'undefined' && IS_IOS ? 'На iPhone веб-приложение не может присылать уведомления по расписанию — они работают только в приложении для Android. Здесь можно посмотреть, как они выглядят.' : 'Уведомления приходят в приложении для Android версии 1.9 и новее. Здесь можно посмотреть, как они выглядят.'}</div>`}
    <label class="switch"><span>Напоминать в дни тренировок</span><input type="checkbox" data-in="setting" data-k="remOn" ${c.on ? 'checked' : ''}></label>
    <label class="switch"><span>Во сколько тренировка</span><input type="time" class="inp" style="width:auto" data-in="setting" data-k="trainTime" value="${c.time}"></label>
    <label class="switch"><span>Когда напомнить</span><select data-in="setting" data-k="remLead">${REMIND_LEADS.map(([v, l]) => opt(v, l, c.lead)).join('')}</select></label>
    <label class="switch"><span>Стиль</span><select data-in="setting" data-k="remStyle">${opt('fun', 'С подколами', c.style)}${opt('calm', 'Спокойный', c.style)}</select></label>
    <div class="notif" id="remDemo"><div class="muted small">Пример уведомления</div><b>${esc(remindTitle(p && p.days[0] ? p.days[0].name : 'Верх тела'))}</b><div class="small" id="remText">${esc(remindText(remDemo, p && p.days[0] ? p.days[0].name : 'Верх тела'))}</div></div>
    <div class="row two" style="margin-top:10px"><button class="btn" data-a="remNext">Другой пример</button>
      ${native ? `<button class="btn" data-a="remTest">Прислать сейчас</button>` : ''}</div>
    <div class="muted small" style="margin-top:10px">${planned ? 'Напоминания приходят в дни, назначенные в расписании текущей программы. Если в этот день тренировка уже была, уведомление не придёт.'
      : 'Чтобы напоминания приходили, назначьте тренировки на дни недели: «Программы» → программа → «Расписание».'}</div>`;
  })()}</section>`}
  <h2>Обновление</h2>
  <section class="card">
    <div class="switch" data-a="egg"><span>Версия приложения</span><b>${esc(ver.name || "—")}</b></div>
    ${NATIVE ? `<label class="field"><span>Адрес сервера обновлений</span>
      <input type="text" inputmode="url" data-in="setting" data-k="updUrl" value="${esc(updUrl())}" placeholder="https://…"></label>
    <label class="switch"><span>Проверять при запуске</span><input type="checkbox" data-in="setting" data-k="updAuto" ${s.updAuto !== false ? "checked" : ""}></label>` : ""}
    <button class="btn block primary" id="updBtn" data-a="update" style="margin:8px 0 0">Проверить обновления</button>
  </section>
  <h2>Данные</h2>
  <section class="card">
    <a class="li" href="#/log"><span>🧾 Журнал для разработчика</span><span class="muted">${glog.all().some(e => e.l === 'error') ? '<span class="down">есть ошибки</span> ' : ''}›</span></a>
    ${canSync() ? `<a class="li" href="#/sync"><span>${IS_PC ? '📲 Синхронизация с телефоном' : '💻 Синхронизация с ПК'}</span><span class="muted">›</span></a>` : ''}
    <button class="li" data-a="exportJson"><span>Сохранить резервную копию</span><span class="muted small">.json</span></button>
    <button class="li" data-a="importJson"><span>Восстановить из копии</span><span class="muted small">.json</span></button>
    <button class="li" data-a="exportCsv"><span>Выгрузить тренировки в таблицу</span><span class="muted small">.csv</span></button>
    <button class="li" data-a="wipe" style="color:var(--danger)"><span>Удалить все данные</span></button>
  </section>
  <p class="muted small">Все данные хранятся только на этом устройстве${canSync() ? ' (и на вашем ПК, если включена синхронизация)' : ''}. Делайте резервную копию, чтобы не потерять их при очистке браузера или смене телефона.</p>
  <p class="muted small">Фотографии и данные о мышцах — открытая база free-exercise-db (общественное достояние); схема тела — react-native-body-highlighter (MIT).</p>
  <p class="muted small">GymLog · ${db.workouts.length} тренировок · ${db.exercises.filter(e => !e.archived).length} упражнений</p>`;
}
const notFound = () => `<header class="top"><a class="ic" href="#/workouts">‹</a><h1>Не найдено</h1></header><div class="empty">Запись удалена или не существует</div>`;

/* ---------- техника и замена упражнений ---------- */
function techHtml(ex) {
  const m = /^e(\d+)$/.exec(ex.id), t = m && EX_TECH[+m[1]];
  return `${ex.note ? `<div class="note">${esc(ex.note)}</div>` : ''}${t ? `<ol class="tech">${t.slice(0, -1).map(s => `<li>${s}</li>`).join('')}</ol>
    <div class="hint">${t[t.length - 1]}</div>` : ''}`;
}
// Аналоги — упражнения того же типа на ту же основную мышцу. Сначала идут подходящие к выбранному разделу
// (женскому или мужскому) и с другим оборудованием: если занят тренажёр, полезнее вариант с гантелями, чем такой же тренажёр.
function analogsOf(ex) {
  const main = exMuscles(ex)[0][0], sex = ctxSex() || (db.profile ? profile().sex : '');
  const rank = e => (sex && exSex(e) !== 'a' && exSex(e) !== sex ? 2 : 0) + (e.equip === ex.equip ? 1 : 0);
  return db.exercises.filter(e => !e.archived && e.id !== ex.id && e.kind === ex.kind && exMuscles(e)[0][0] === main)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'ru'));
}
let analogAll = null;   // id упражнения, для которого развёрнут полный список замен
async function pickAnalog(exId) {
  const ex = exById(exId), main = exMuscles(ex)[0][0], list = analogsOf(ex);
  const v = await sheet(`<h3>Чем заменить</h3>
    <div class="muted small" style="margin:-8px 0 8px">${esc(ex.name)}${main ? ' — основная мышца: ' + MUSCLE_RU[main] : ''}</div>
    ${list.map(e => `<button class="li" data-a="sheetRes" data-v="${e.id}">${thumb(e.id)}<span class="grow">${esc(e.name)}</span>
      <span class="muted small">${esc(e.equip)}</span></button>`).join('') || `<div class="empty">Похожих упражнений в справочнике нет</div>`}
    <button class="btn block" style="margin-top:12px" data-a="sheetRes" data-v="__all">Выбрать из всего справочника</button>`);
  return v === '__all' ? pickExercise() : v;
}

/* ---------- экран не гаснет, пока идёт тренировка ---------- */
let wakeLock = null, wakeWant = null;
async function syncWake() {
  const want = !!activeW() && db.settings.keepOn !== false;
  if (window.Android && Android.keepScreen) {
    if (want !== wakeWant) Android.keepScreen(wakeWant = want);
    return;
  }
  if (!('wakeLock' in navigator)) return;
  try {
    if (want && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => wakeLock = null);
    } else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* система отказала (например, режим энергосбережения) — работаем как обычно */ }
}
// блокировку система снимает при сворачивании — восстанавливаем при возврате
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncWake(); });

/* ---------- сводка за неделю и месяц ---------- */
const DAY = 864e5;
const weekStart = ts => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7).getTime(); };
const finished = () => db.workouts.filter(w => w.end);
// Серии недель с тренировками: текущая (cur) и лучшая за всё время (best).
function weekStreaks() {
  const weeks = [...new Set(finished().map(w => weekStart(w.start)))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  weeks.forEach(w => { run = prev != null && weekStart(prev + 8 * DAY) === w ? run + 1 : 1; best = Math.max(best, run); prev = w; });
  const has = new Set(weeks);
  let at = weekStart(Date.now()), cur = 0;
  if (!has.has(at)) at = weekStart(at - DAY);   // на этой неделе тренировки ещё не было — серия считается по прошлую
  while (has.has(at)) { cur++; at = weekStart(at - DAY); }
  return { cur, best };
}
let statKind = 'week', statOff = 0, statMetric = 'ton', statLift = null;
function period(kind, off) {
  const now = new Date();
  if (kind === 'week') {
    const s = new Date(weekStart(Date.now())); s.setDate(s.getDate() - 7 * off);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    return [s.getTime(), e.getTime()];
  }
  return [new Date(now.getFullYear(), now.getMonth() - off, 1).getTime(), new Date(now.getFullYear(), now.getMonth() - off + 1, 1).getTime()];
}
function periodStats([a, b]) {
  const o = { n: 0, sets: 0, ton: 0, time: 0, mus: {} };
  finished().filter(w => w.start >= a && w.start < b).forEach(w => {
    const s = wStats(w);
    o.n++; o.sets += s.sets; o.ton += s.ton; o.time += w.end - w.start;
    w.items.forEach(it => {
      const ex = exById(it.exId), c = it.sets.filter(isWork).length;
      if (ex.kind !== 'cardio') exMuscles(ex)[0].forEach(m => o.mus[m] = (o.mus[m] || 0) + c);
    });
  });
  return o;
}
const tons = kg => kg >= 1000 ? n(+(kg / 1000).toFixed(1)) + ' т' : n(Math.round(kg)) + ' кг';
const hours = ms => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };
function pgStats() {
  const range = period(statKind, statOff), cur = periodStats(range), prev = periodStats(period(statKind, statOff + 1));
  const a = new Date(range[0]), b = new Date(range[1] - DAY), st = weekStreaks();
  const label = statKind === 'week'
    ? `${a.getDate()}${a.getMonth() !== b.getMonth() ? ' ' + a.toLocaleDateString('ru-RU', { month: 'short' }) : ''} – ${b.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`
    : a.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const tile = (value, name, diff, unit) => `<div class="tile"><b>${value}</b><span>${name}</span>
    <div class="small" style="margin-top:4px">${prev.n || cur.n ? dl(diff, unit) : ''}</div></div>`;
  const mus = Object.entries(cur.mus).sort((x, y) => y[1] - x[1]), top = mus.length ? mus[0][1] : 1;
  // 12 последних периодов: по ним строятся графики прогресса
  const week = statKind === 'week';
  const hist = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(i => {
    const r = period(statKind, statOff + i), d0 = new Date(r[0]), d1 = new Date(r[1] - DAY);
    const short = week ? d0.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : d0.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
    return { ...periodStats(r), short, label: week ? `${short} – ${d1.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : d0.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) };
  });
  const METRICS = { ton: ['Тоннаж', 'кг', h => Math.round(h.ton)], n: ['Тренировки', '', h => h.n], sets: ['Подходы', '', h => h.sets], time: ['Время', 'мин', h => Math.round(h.time / 60000)] };
  const [, mUnit, mVal] = METRICS[statMetric];
  // силовой прогресс: упражнения с весом, которые выполнялись чаще всего
  const count = {};
  finished().forEach(w => new Set(w.items.filter(it => exById(it.exId).kind === 'wr' && it.sets.some(x => isWork(x) && x.w)).map(it => it.exId)).forEach(id => count[id] = (count[id] || 0) + 1));
  const lifts = Object.entries(count).filter(c => c[1] > 1).sort((x, y) => y[1] - x[1]).slice(0, 6).map(c => c[0]);
  if (!lifts.includes(statLift)) statLift = lifts[0];
  const body = db.measures.filter(m => m.type === 'weight').sort((x, y) => x.date - y.date);
  return `<header class="top"><a class="ic" href="#/progress">‹</a><h1>Сводка</h1></header>
  <div class="chips"><button class="chip ${statKind === 'week' ? 'on' : ''}" data-a="statKind" data-v="week">По неделям</button>
    <button class="chip ${statKind === 'month' ? 'on' : ''}" data-a="statKind" data-v="month">По месяцам</button></div>
  <section class="card"><div class="cal-head" style="margin:0"><button class="ic sm" data-a="statNav" data-v="1">‹</button>
    <b>${label}</b><button class="ic sm" data-a="statNav" data-v="-1" ${statOff ? '' : 'disabled'}>›</button></div></section>
  <div class="tiles two">
    ${tile(cur.n, 'тренировок', cur.n - prev.n)}
    ${tile(tons(cur.ton), 'поднято', Math.round(cur.ton - prev.ton), 'кг')}
    ${tile(hours(cur.time), 'длительность', Math.round((cur.time - prev.time) / 60000), 'мин')}
    ${tile(cur.sets, 'подходов', cur.sets - prev.sets)}
  </div>
  <div class="muted small" style="margin:-4px 2px 12px">Стрелки — сравнение с предыдущ${statKind === 'week' ? 'ей неделей' : 'им месяцем'}.</div>
  <section class="card"><b>🔥 Серия: ${st.cur} нед. подряд</b>
    <div class="muted small">Недели, в которые была хотя бы одна тренировка. Лучшая серия — ${st.best} нед.</div></section>
  <h2>Нагрузка по мышцам, подходов</h2>
  <section class="card">${mus.map(([m, v]) => `<div class="bar-row"><span>${MUSCLE_RU[m]}</span>
    <div class="bar"><i style="width:${Math.round(v / top * 100)}%"></i></div><b>${v}</b></div>`).join('')
    || `<div class="empty small">За этот период тренировок нет</div>`}</section>
  <h2>Прогресс за 12 ${week ? 'недель' : 'месяцев'}</h2>
  <section class="card">
    <div class="chips">${Object.entries(METRICS).map(([k, m]) => `<button class="chip ${statMetric === k ? 'on' : ''}" data-a="statMetric" data-v="${k}">${m[0]}</button>`).join('')}</div>
    ${hist.some(h => h.n) ? bars('sb', hist.map(h => ({ v: mVal(h), label: h.label, short: h.short })), mUnit) : `<div class="empty small">Пока нет данных</div>`}
  </section>
  <h2>Сила: расчётный 1ПМ</h2>
  <section class="card">${lifts.length ? `<div class="chips">${lifts.map(id => `<button class="chip ${statLift === id ? 'on' : ''}" data-a="statLift" data-v="${id}">${esc(exById(id).name)}</button>`).join('')}</div>
    ${chart('sl', sessions(statLift).map(p => ({ t: p.t, v: p.rm })), 'кг')}
    <a class="btn sm" style="display:inline-block;margin-top:10px" href="#/exercise/${statLift}">Подробнее об упражнении</a>`
    : `<div class="empty small">График появится, когда упражнение с весом будет выполнено хотя бы на двух тренировках</div>`}</section>
  <h2>Вес тела</h2>
  <section class="card">${body.length ? chart('sw', body.map(m => ({ t: m.date, v: m.value })), 'кг')
    : `<div class="empty small">Добавьте замеры веса в разделе «Замеры» — здесь появится график</div>`}</section>`;
}

/* ---------- достижения ---------- */
// У каждого достижения несколько уровней (tiers); value считается по истории тренировок.
const AWARD_GROUPS = { train: 'Тренировки', prog: 'Программы', power: 'Сила и выносливость', health: 'Здоровье и восстановление' };
const AWARDS = [
  { id: 'workouts', g: 'train', icon: '🏋️', title: 'Постоянство', what: 'тренировок', tiers: [1, 10, 25, 50, 100, 250, 500] },
  { id: 'streak', g: 'train', icon: '🔥', title: 'Серия недель', what: 'недель подряд', tiers: [2, 4, 8, 12, 26, 52] },
  { id: 'weekmax', g: 'train', icon: '⚡', title: 'Ударная неделя', what: 'тренировок за одну неделю', tiers: [3, 4, 5, 6] },
  { id: 'monthmax', g: 'train', icon: '📅', title: 'Сильный месяц', what: 'тренировок за один месяц', tiers: [8, 12, 16, 20] },
  { id: 'hours', g: 'train', icon: '⏱️', title: 'Время в деле', what: 'часов тренировок', tiers: [1, 10, 25, 50, 100, 250] },
  { id: 'sets', g: 'train', icon: '✅', title: 'Подходы', what: 'подходов', tiers: [100, 500, 1000, 2500, 5000, 10000] },
  { id: 'reps', g: 'train', icon: '🔁', title: 'Повторения', what: 'повторений', tiers: [1000, 5000, 10000, 25000, 50000, 100000] },
  { id: 'variety', g: 'train', icon: '🧭', title: 'Разнообразие', what: 'разных упражнений', tiers: [5, 10, 20, 35, 50, 80] },
  { id: 'early', g: 'train', icon: '🌅', title: 'Ранняя пташка', what: 'тренировок до 8 утра', tiers: [1, 5, 15, 30] },
  { id: 'late', g: 'train', icon: '🌙', title: 'Ночная смена', what: 'тренировок после 21:00', tiers: [1, 5, 15, 30] },

  { id: 'plan', g: 'prog', icon: '📋', title: 'По программе', what: 'тренировок по программе', tiers: [1, 10, 25, 50, 100, 200] },
  { id: 'cycles', g: 'prog', icon: '🔄', title: 'Полный круг', what: 'раз пройдены все дни программы', tiers: [1, 3, 5, 10, 20, 40] },
  { id: 'fullweeks', g: 'prog', icon: '🗓️', title: 'Неделя без пропусков', what: 'недель, когда выполнены все дни программы', tiers: [1, 4, 8, 12, 26, 52] },
  { id: 'loyal', g: 'prog', icon: '🎯', title: 'Верность программе', what: 'тренировок по одной программе', tiers: [5, 12, 24, 36, 60, 100] },
  { id: 'progs', g: 'prog', icon: '🧪', title: 'Исследователь', what: 'разных программ опробовано', tiers: [1, 2, 3, 5] },
  { id: 'ontime', g: 'prog', icon: '⏰', title: 'Точно по расписанию', what: 'тренировок в назначенный день недели', tiers: [1, 10, 25, 50, 100] },

  { id: 'ton', g: 'power', icon: '⚖️', title: 'Поднятый вес', what: 'тонн', tiers: [1, 10, 50, 100, 250, 500, 1000] },
  { id: 'dayton', g: 'power', icon: '🚚', title: 'Тяжёлый день', what: 'тонн за одну тренировку', tiers: [2, 4, 6, 8, 12, 16] },
  { id: 'prs', g: 'power', icon: '🏆', title: 'Личные рекорды', what: 'рекордов веса', tiers: [1, 5, 15, 30, 60, 100] },
  { id: 'bench', g: 'power', icon: '💪', title: 'Жим лёжа', what: 'кг в подходе', tiers: [40, 60, 80, 100, 120, 140], ex: 'e0', sex: 'm' },
  { id: 'hip', g: 'power', icon: '🍑', title: 'Хип-траст', what: 'кг в подходе', tiers: [30, 50, 70, 90, 110, 130], ex: 'e107', sex: 'f' },
  { id: 'squat', g: 'power', icon: '🦵', title: 'Приседания со штангой', what: 'кг в подходе', tiers: [50, 80, 100, 120, 150, 180], ex: 'e20' },
  { id: 'pull', g: 'power', icon: '🧗', title: 'Подтягивания', what: 'повторов в подходе', tiers: [1, 5, 10, 15, 20], ex: 'e10', reps: true },
  { id: 'push', g: 'power', icon: '🤸', title: 'Отжимания', what: 'повторов в подходе', tiers: [10, 20, 30, 40, 50], ex: 'e8', reps: true },
  { id: 'plank', g: 'power', icon: '🧱', title: 'Планка', what: 'секунд', tiers: [30, 60, 120, 180, 300], ex: 'e53', reps: true },
  { id: 'cardio', g: 'power', icon: '🏃', title: 'Кардио', what: 'минут кардио', tiers: [30, 120, 300, 600, 1500, 3000] },

  { id: 'measures', g: 'health', icon: '📏', title: 'Контроль формы', what: 'замеров тела', tiers: [1, 10, 30, 60, 100] },
  { id: 'photos', g: 'health', icon: '📷', title: 'Фотодневник', what: 'фото прогресса', tiers: [1, 5, 12, 24] },
  { id: 'water', g: 'health', icon: '💧', title: 'Водный баланс', what: 'дней с выполненной нормой воды', tiers: [1, 7, 30, 100] },
  { id: 'sleep', g: 'health', icon: '😴', title: 'Режим сна', what: 'ночей со сном от 7 часов', tiers: [1, 7, 30, 100] },
  { id: 'stretch', g: 'health', icon: '🧘', title: 'Гибкость', what: 'комплексов растяжки', tiers: [1, 5, 20, 50, 100] },
];
function awardValues() {
  const goal = waterGoal();
  const v = { workouts: 0, ton: 0, sets: 0, reps: 0, prs: 0, hours: 0, early: 0, late: 0, dayton: 0, cardio: 0, plan: 0, ontime: 0,
    measures: db.measures.length, streak: weekStreaks().best, stretch: db.stretchDone || 0, photos: photos ? photos.length : db.photoCount || 0,
    water: Object.values(db.water || {}).filter(ml => ml >= goal).length, sleep: Object.values(db.sleep || {}).filter(h => h >= 7).length };
  const best = {}, used = new Set(), topW = {}, topR = {}, perWeek = {}, perMonth = {};
  const prog = {};   // по каждой программе: сколько раз выполнен каждый день и сколько тренировок в каждой неделе
  [...finished()].sort((a, b) => a.start - b.start).forEach(w => {
    const s = wStats(w), day = {}, d = new Date(w.start), wk = weekStart(w.start), mo = d.getFullYear() * 12 + d.getMonth();
    v.workouts++; v.sets += s.sets; v.ton += s.ton / 1000; v.hours += (w.end - w.start) / 36e5;
    v.dayton = Math.max(v.dayton, s.ton / 1000);
    if (d.getHours() < 8) v.early++;
    if (d.getHours() >= 21) v.late++;
    perWeek[wk] = (perWeek[wk] || 0) + 1; perMonth[mo] = (perMonth[mo] || 0) + 1;
    if (w.pid) {
      const p = prog[w.pid] = prog[w.pid] || { days: {}, weeks: {}, n: 0, max: 0 };
      v.plan++; p.n++; p.weeks[wk] = (p.weeks[wk] || 0) + 1;
      if (w.di != null) { p.days[w.di] = (p.days[w.di] || 0) + 1; p.max = Math.max(p.max, w.di + 1); }
      const cur = P(w.pid);
      if (cur && cur.week && w.di != null && cur.week[wdOf(w.start)] === w.di) v.ontime++;
    }
    w.items.forEach(it => {
      const kind = exById(it.exId).kind;
      it.sets.filter(isWork).forEach(x => {
        used.add(it.exId);
        if (kind === 'cardio') { v.cardio += x.r || 0; return; }
        if (kind === 'wr') v.reps += x.r || 0;
        day[it.exId] = Math.max(day[it.exId] || 0, x.w || 0);
        topW[it.exId] = Math.max(topW[it.exId] || 0, x.w || 0);
        topR[it.exId] = Math.max(topR[it.exId] || 0, x.r || 0);
      });
    });
    // рекорд — тренировка, где вес в упражнении превысил прежний максимум (первое выполнение не считается)
    Object.entries(day).forEach(([id, top]) => { if (best[id] && top > best[id]) v.prs++; best[id] = Math.max(best[id] || 0, top); });
  });
  v.variety = used.size;
  v.weekmax = Math.max(0, ...Object.values(perWeek));
  v.monthmax = Math.max(0, ...Object.values(perMonth));
  v.progs = Object.keys(prog).length;
  v.loyal = Math.max(0, ...Object.values(prog).map(p => p.n));
  v.cycles = 0; v.fullweeks = 0;
  Object.entries(prog).forEach(([pid, p]) => {
    // число дней берём из самой программы, а если её уже удалили — по наибольшему выполненному дню
    const cur = P(pid), days = cur ? cur.days.length : p.max;
    if (!days) return;
    v.cycles += Math.min(...Array.from({ length: days }, (_, i) => p.days[i] || 0));
    v.fullweeks += Object.values(p.weeks).filter(c => c >= days).length;
  });
  AWARDS.forEach(a => { if (a.ex) v[a.id] = (a.reps ? topR : topW)[a.ex] || 0; });
  return v;
}
function awardList() {
  const v = awardValues();
  return AWARDS.filter(a => !a.sex || !mySex() || a.sex === mySex()).map(a => ({ ...a, value: v[a.id] || 0, level: a.tiers.filter(t => (v[a.id] || 0) >= t).length }));
}
// Запоминает достигнутые уровни и возвращает те, что выросли с прошлой проверки.
function checkAwards(silent) {
  const old = db.awards || {}, list = awardList(), news = list.filter(a => a.level > (old[a.id] || 0));
  db.awards = Object.fromEntries(list.map(a => [a.id, Math.max(a.level, old[a.id] || 0)]));
  save();
  return silent ? [] : news;
}
function pgAwards() {
  const list = awardList(), got = list.reduce((s, a) => s + a.level, 0), all = list.reduce((s, a) => s + a.tiers.length, 0);
  return `<header class="top"><a class="ic" href="#/progress">‹</a><h1>Достижения</h1></header>
  <section class="card"><b>Получено уровней: ${got} из ${all}</b>
    <div class="bar" style="margin-top:10px"><i style="width:${Math.round(got / all * 100)}%"></i></div></section>
  ${specialHtml()}
  ${list.map((a, i) => {
    const head = i && list[i - 1].g === a.g ? '' : `<h2>${AWARD_GROUPS[a.g]}</h2>`;
    const next = a.tiers[a.level], from = a.level ? a.tiers[a.level - 1] : 0, val = +(+a.value).toFixed(1);
    return `${head}<section class="card award ${a.level ? '' : 'locked'}"><div class="aw-ic">${a.icon}</div><div class="grow">
      <div class="ex-head"><b>${a.title}</b><span class="muted small">уровень ${a.level} из ${a.tiers.length}</span></div>
      <div class="dots">${a.tiers.map((t, i) => `<i class="${i < a.level ? 'on' : ''}" title="${t}"></i>`).join('')}</div>
      <div class="bar"><i style="width:${next ? Math.max(0, Math.min(100, Math.round((a.value - from) / (next - from) * 100))) : 100}%"></i></div>
      <div class="muted small">${next ? `${n(val)} из ${n(next)} ${a.what}` : `Все уровни получены · ${n(val)} ${a.what}`}</div></div></section>`;
  }).join('')}`;
}

/* ---------- расписание и следующая тренировка ---------- */
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WD_WHEN = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];
const wdOf = ts => (new Date(ts).getDay() + 6) % 7;
const sameDay = (a, b) => isoDay(a) === isoDay(b);
const activeProgram = () => P(db.activeProgram) || null;
// Ближайшая тренировка текущей программы: по расписанию, а если его нет — следующий день по кругу.
function nextPlan() {
  const p = activeProgram();
  if (!p || !p.days.length) return null;
  const doneToday = db.workouts.some(w => w.end && w.pid === p.id && sameDay(w.start, Date.now()));
  const week = p.week || {};
  if (Object.values(week).some(v => v != null && p.days[v])) {
    for (let k = doneToday ? 1 : 0; k <= 7; k++) {
      const wd = (wdOf(Date.now()) + k) % 7, di = week[wd];
      if (di != null && p.days[di]) return { p, di, today: k === 0, doneToday, when: k === 0 ? 'Сегодня по расписанию' : k === 1 ? 'Завтра' : 'Следующая — ' + WD_WHEN[wd] };
    }
    return null;
  }
  const last = sortedW().find(w => w.end && w.pid === p.id && w.di != null);
  return { p, di: last ? (last.di + 1) % p.days.length : 0, today: !doneToday, doneToday, when: 'Следующая по программе' };
}
function planCard() {
  const pl = nextPlan();
  if (!pl) return '';
  const d = pl.p.days[pl.di], st = dayStats(d), two = sortedW().filter(w => w.end).slice(0, 2);
  return `<section class="card ${pl.today ? 'active' : ''}">
    <div class="muted small">${pl.when}${pl.doneToday ? ' · сегодня тренировка уже была ✓' : ''}</div>
    <a class="day-row" href="#/program/${pl.p.id}/${pl.di}">${mapHtml(...dayMuscles(d.items), true)}<div><b>${esc(d.name)}</b>
      <div class="muted small">${esc(pl.p.name)}</div>
      <div class="muted small">${d.items.length} упр. · ${st.sets} подх. · ≈ ${st.min} мин</div></div></a>
    ${two.length === 2 && two.every(w => w.feel === 3) ? `<div class="hint">Две последние тренировки были тяжёлыми — возможно, стоит добавить день отдыха или снизить веса.</div>` : ''}
    <button class="btn ${pl.today ? 'primary' : ''} block" style="margin:12px 0 0" data-a="start" data-p="${pl.p.id}" data-d="${pl.di}">▶ ${pl.today ? 'Начать тренировку' : 'Начать заранее'}</button></section>`;
}
// Напоминания ставит Android-оболочка: передаём ей время ближайших тренировок на неделю вперёд.
// Настройки напоминаний. Раньше хранилось время самого уведомления (remTime) — из него получаем время тренировки.
function remindCfg() {
  const s = db.settings, shift = t => { const [h, m] = t.split(':').map(Number); return String((h + 1) % 24).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
  return { on: !!s.remOn, time: s.trainTime || (s.remTime ? shift(s.remTime) : '19:00'), lead: s.remLead != null ? +s.remLead : 60, style: s.remStyle || 'fun' };
}
// Текст уведомления: с подколом или спокойный. n выбирает вариант — у каждого дня свой, без повторов подряд.
function remindText(n, dayName) {
  const c = remindCfg(), when = (REMIND_LEADS.find(l => l[0] === c.lead) || REMIND_LEADS[3])[2];
  if (c.style === 'calm') return `Сегодня тренировка ${when}: ${dayName.replace(/^День \d+ · /, '')}.`;
  return REMIND_JOKES[((n % REMIND_JOKES.length) + REMIND_JOKES.length) % REMIND_JOKES.length].replace('{when}', when);
}
const remindTitle = dayName => 'Сегодня: ' + dayName.replace(/^День \d+ · /, '');
function syncReminders() {
  if (!(window.Android && Android.setReminders)) return;
  const c = remindCfg(), list = [], p = activeProgram();
  if (c.on && p && p.week) {
    const [hh, mm] = c.time.split(':').map(Number), now = new Date();
    for (let k = 0; k < 7; k++) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, hh, mm).getTime(), at = start - c.lead * 60000, di = p.week[wdOf(start)];
      if (di == null || !p.days[di] || at <= Date.now()) continue;
      if (k === 0 && db.workouts.some(w => w.pid === p.id && sameDay(w.start, Date.now()))) continue;
      // номер дня от начала эпохи: шутки идут по кругу и не повторяются в соседние дни
      list.push({ at, title: remindTitle(p.days[di].name), text: remindText(Math.floor(start / DAY) * 7 % REMIND_JOKES.length, p.days[di].name) });
    }
  }
  // ближайшие по времени — первыми: если мест в очереди не хватит, отсекутся самые дальние
  const supp = suppSchedule(), all = [...list, ...supp].sort((x, y) => x.at - y.at).slice(0, remindLimit());
  Android.setReminders(JSON.stringify(all), c.on || suppRems().some(r => r.on));
}

/* ---------- питание, вода и сон ---------- */
const ACTIVITY = [[1.2, 'Сидячая работа, без тренировок'], [1.375, '1–3 тренировки в неделю'], [1.55, '3–5 тренировок в неделю'], [1.725, '6–7 тренировок в неделю'], [1.9, 'Тяжёлый физический труд']];
// Пол, указанный в профиле (анкета или «Питание»): по нему скрывается то, что предназначено другому полу.
const mySex = () => db.profile && (db.profile.sex === 'f' || db.profile.sex === 'm') ? db.profile.sex : null;
function profile() {
  const lastW = db.measures.filter(m => m.type === 'weight').sort((a, b) => b.date - a.date)[0];
  return { sex: 'm', age: 30, height: 175, weight: lastW ? lastW.value : 75, act: 1.55, goal: 'keep', ...(db.profile || {}) };
}
// Формула Миффлина — Сан Жеора; белок и жиры — от веса тела, углеводы — остаток калорий.
function nutrition() {
  const p = profile(), bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5), tdee = bmr * p.act;
  const kcal = Math.round(tdee * (p.goal === 'loss' ? .85 : p.goal === 'gain' ? 1.1 : 1) / 10) * 10;
  const protein = Math.round(p.weight * (p.goal === 'loss' ? 2 : p.goal === 'gain' ? 1.8 : 1.6)), fat = Math.round(p.weight * .9);
  return { kcal, tdee: Math.round(tdee / 10) * 10, protein, fat, carbs: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)), water: Math.round(p.weight * 30 / 50) * 50 };
}
function nutriHtml() {
  const x = nutrition(), p = profile();
  return `<div class="tiles two">
    <div class="tile"><b>${x.kcal}</b><span>ккал в день</span></div>
    <div class="tile"><b>${x.protein} г</b><span>белка</span></div>
    <div class="tile"><b>${x.fat} г</b><span>жиров</span></div>
    <div class="tile"><b>${x.carbs} г</b><span>углеводов</span></div></div>
  <div class="muted small">Расход при вашей активности — около ${x.tdee} ккал. ${p.goal === 'loss' ? 'Для похудения заложен дефицит 15%.' : p.goal === 'gain' ? 'Для набора заложен избыток 10%.' : 'Столько нужно, чтобы вес не менялся.'}
    Это ориентир по формуле, а не назначение врача: смотрите на динамику веса за 2–3 недели и поправляйте калории на 100–200.</div>`;
}
const today = () => isoDay(Date.now());
const waterGoal = () => nutrition().water;
const litres = ml => n(+(ml / 1000).toFixed(2)) + ' л';
function waterCard(full) {
  const ml = (db.water || {})[today()] || 0, goal = waterGoal();
  if (!full && db.settings.waterHome === false) return '';
  return `<section class="card"><div class="ex-head"><b>💧 Вода: ${litres(ml)} из ${litres(goal)}</b>
      ${full ? '' : `<a class="muted small" href="#/health">подробнее</a>`}</div>
    <div class="bar" style="margin:10px 0"><i style="width:${Math.min(100, Math.round(ml / goal * 100))}%"></i></div>
    <div class="row">${[200, 250, 500].map(v => `<button class="btn sm" data-a="waterAdd" data-v="${v}">+${v} мл</button>`).join('')}
      ${ml ? `<button class="btn sm ghost" data-a="waterAdd" data-v="-250">− 250</button>` : ''}</div></section>`;
}
function lastDays(count, src, scale = 1) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (count - 1 - i));
    const short = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return { v: +(((src || {})[isoDay(d.getTime())] || 0) / scale).toFixed(2), short, label: d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }) };
  });
}
function pgHealth() {
  const p = profile(), sleep = lastDays(14, db.sleep), slept = sleep.filter(s => s.v), water = lastDays(14, db.water, 1000);
  const sel = (k, opts) => `<select data-in="prof" data-k="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(p[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const inp = (k, label) => `<label class="field"><span>${label}</span><input type="text" inputmode="decimal" data-in="prof" data-k="${k}" value="${p[k]}"></label>`;
  return `<header class="top"><a class="ic" href="#/more">‹</a><h1>Питание, вода и сон</h1></header>
  <h2>Калории и белок</h2>
  <section class="card">
    <div class="grid2"><label class="field"><span>Пол</span>${sel('sex', [['m', 'Мужской'], ['f', 'Женский']])}</label>${inp('age', 'Возраст, лет')}
      ${inp('height', 'Рост, см')}${inp('weight', 'Вес, кг')}</div>
    <label class="field"><span>Активность</span>${sel('act', ACTIVITY)}</label>
    <label class="field"><span>Цель</span>${sel('goal', [['loss', 'Похудение'], ['keep', 'Поддержание веса'], ['gain', 'Набор мышечной массы']])}</label>
    <div id="nutri">${nutriHtml()}</div>
    <div class="row two" style="margin-top:12px"><a class="btn" href="#/meals">🍽️ Примеры рациона</a><a class="btn" href="#/supps">💊 Добавки</a></div>
  </section>
  <h2>Вода</h2>
  <div id="waterbox">${waterCard(true)}</div>
  <section class="card">${water.some(x => x.v) ? bars('hw', water, 'л') : `<div class="empty small">Отмечайте выпитую воду — здесь появится график за 14 дней</div>`}
    <div class="muted small" style="margin-top:6px">Норма — около 30 мл на килограмм веса; в дни тренировок и в жару нужно больше.</div>
    <label class="switch"><span>Показывать воду на главном экране</span><input type="checkbox" data-in="setting" data-k="waterHome" ${db.settings.waterHome !== false ? 'checked' : ''}></label></section>
  <h2>Сон</h2>
  <section class="card">${slept.length ? `${bars('hs', sleep, 'ч')}
    <div class="muted small" style="margin-top:6px">В среднем ${n(+(slept.reduce((a, s) => a + s.v, 0) / slept.length).toFixed(1))} ч за ${slept.length} записанных ночей.</div>`
    : `<div class="empty small">Записывайте, сколько спали, — здесь появится график за 14 дней</div>`}
    <button class="btn block primary" style="margin:12px 0 0" data-a="sleepAdd">Записать сон</button>
    <div class="muted small" style="margin-top:8px">Для восстановления после тренировок обычно нужно 7–9 часов.</div></section>`;
}

/* ---------- напоминания о приёме добавок ---------- */
// Запись: { id, supp — id добавки из справочника или 'other', name — своё название, dose, time 'ЧЧ:ММ', days — номера дней недели (0 = Пн), on }
const suppRems = () => db.suppRem || (db.suppRem = []);
const suppName = r => r.supp === 'other' ? (r.name || 'Добавка') : (SUPPS.find(s => s.id === r.supp) || { name: 'Добавка' }).name;
const suppIcon = r => r.supp === 'other' ? '💊' : (SUPPS.find(s => s.id === r.supp) || { icon: '💊' }).icon;
const suppTitle = r => `${suppIcon(r)} ${suppName(r)}${r.dose ? ' · ' + r.dose : ''}`;
// n выбирает вариант текста: у каждого дня свой, чтобы шутка не повторялась два дня подряд
function suppText(r, n) {
  const own = SUPP_JOKES[r.supp], list = own || SUPP_JOKES_ANY;
  return list[((n % list.length) + list.length) % list.length].replace('{name}', suppName(r));
}
const daysLabel = days => days.length === 7 ? 'каждый день' : days.length ? [...days].sort().map(d => WD[d].toLowerCase()).join(', ') : 'дни не выбраны';
// Сколько уведомлений Android может держать в очереди: старые версии оболочки — 7, новые сообщают сами.
const remindLimit = () => window.Android && Android.reminderLimit ? Android.reminderLimit() : 7;
function suppSchedule() {
  const list = [], now = new Date();
  suppRems().filter(r => r.on && r.days.length).forEach((r, ri) => {
    const [hh, mm] = r.time.split(':').map(Number);
    for (let k = 0; k < 14; k++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, hh, mm).getTime();
      if (at <= Date.now() || !r.days.includes(wdOf(at))) continue;
      list.push({ at, title: suppTitle(r), text: suppText(r, Math.floor(at / DAY) + ri) });
    }
  });
  return list;
}
let suppEd = null;      // напоминание, которое сейчас редактируется в шторке
function suppSheetHtml() {
  const r = suppEd, own = SUPP_JOKES[r.supp] || SUPP_JOKES_ANY, native = window.Android && Android.setReminders;
  return `<h3>${r.isNew ? 'Новое напоминание' : 'Напоминание о приёме'}</h3>
    <label class="field"><span>Что принимать</span><select data-in="suppF" data-k="supp">${[...SUPPS.map(s => [s.id, s.icon + ' ' + s.name]), ['other', '💊 Другое — своё название']]
      .map(([v, l]) => `<option value="${v}" ${r.supp === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${r.supp === 'other' ? `<label class="field"><span>Название</span><input type="text" data-in="suppF" data-k="name" value="${esc(r.name || '')}" placeholder="Например: цинк"></label>` : ''}
    <div class="grid2"><label class="field"><span>Во сколько</span><input type="time" class="inp" data-in="suppF" data-k="time" value="${esc(r.time)}"></label>
      <label class="field"><span>Сколько (необязательно)</span><input type="text" data-in="suppF" data-k="dose" value="${esc(r.dose || '')}" placeholder="5 г, 1 капсула…"></label></div>
    <div class="muted small" style="margin:0 2px 6px">В какие дни</div>
    <div class="week">${WD.map((n, i) => `<button class="${r.days.includes(i) ? 'on' : ''}" data-a="suppDay" data-v="${i}"><span>${n}</span><b>${r.days.includes(i) ? '✓' : '—'}</b></button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><button class="btn sm" data-a="suppDay" data-v="all">Каждый день</button><button class="btn sm" data-a="suppDay" data-v="work">По будням</button></div>
    <div class="notif"><div class="muted small">Пример уведомления · вариантов: ${own.length}</div><b>${esc(suppTitle(r))}</b>
      <div class="small">${esc(suppText(r, suppEd.demo || 0))}</div></div>
    <div class="row" style="margin-top:10px"><button class="btn sm" data-a="suppDemo">Другой пример</button>
      ${native ? `<button class="btn sm" data-a="suppTest">Прислать сейчас</button>` : ''}</div>
    <div class="row end" style="margin-top:14px">${r.isNew ? '' : `<button class="btn danger" data-a="suppDel">Удалить</button>`}
      <button class="btn ghost" data-a="sheetClose">Отмена</button><button class="btn primary" data-a="suppSave">Сохранить</button></div>`;
}
// Блок «Мои напоминания» — вверху справочника добавок; only — показать напоминания одной добавки (на её странице).
function suppRemsHtml(only) {
  const list = suppRems().filter(r => !only || r.supp === only), native = window.Android && Android.setReminders;
  return `${list.map(r => `<div class="li rem"><button class="grow" data-a="suppEdit" data-id="${r.id}"><b>${esc(suppTitle(r))}</b>
      <div class="muted small">${r.time} · ${daysLabel(r.days)}</div></button>
      <input type="checkbox" data-in="suppOn" data-id="${r.id}" ${r.on ? 'checked' : ''} aria-label="Включено"></div>`).join('')}
    <button class="btn block ${list.length ? '' : 'primary'}" style="margin:${list.length ? 10 : 0}px 0 0" data-a="suppAdd" data-v="${only || ''}">🔔 ${only ? 'Напоминать о приёме' : 'Добавить напоминание'}</button>
    ${only ? '' : `<div class="muted small" style="margin-top:10px">${native ? `Уведомления ставятся на две недели вперёд и обновляются при каждом открытии приложения${remindLimit() < 20
      ? '. В этой версии приложения помещается только 7 ближайших уведомлений — установите свежий APK, чтобы хватало на все' : ''}.`
      : 'Уведомления приходят в приложении для Android. Здесь можно настроить расписание и посмотреть тексты.'}</div>`}`;
}

/* ---------- справочник: спортивные добавки ---------- */
let supF = 0;
const proofBadge = p => `<span class="proof ${PROOF[p][1]}">${PROOF[p][0]}</span>`;
const medNote = `<p class="muted small">Это общая справка, а не назначение. При беременности, хронических заболеваниях и приёме лекарств посоветуйтесь с врачом, прежде чем что-то принимать.</p>`;
function pgSupps(id) {
  const s = SUPPS.find(x => x.id === id);
  if (s) {
    const sec = (title, text) => `<h2>${title}</h2><section class="card">${text}</section>`;
    return `<header class="top"><a class="ic" href="#/supps">‹</a><h1>${s.name}</h1></header>
    <div class="sup-top"><span>${s.icon}</span>${proofBadge(s.proof)}</div>
    ${canNotify() ? `<section class="card">${suppRemsHtml(s.id)}</section>` : ''}
    ${sec('Что это', s.what)}${sec('Для чего', s.why)}${sec('Кому имеет смысл', s.who)}${sec('Как принимать', s.how)}
    ${s.id === 'protein' ? `<div class="hint" style="margin-bottom:10px">Ваша норма — около ${nutrition().protein} г белка в день.
      Как набрать её обычной едой — в разделе <a href="#/meals"><u>«Примеры рациона»</u></a>.</div>` : ''}
    ${sec('Чего ожидать', s.expect)}${sec('Когда не стоит', s.avoid)}${medNote}`;
  }
  const list = SUPPS.filter(x => !supF || x.proof === supF);
  return `<header class="top"><a class="ic" href="#/more">‹</a><h1>Спортивные добавки</h1></header>
  <section class="card"><b>С чего начать</b>
    <div class="small" style="margin-top:6px">Результат дают тренировки, еда и сон. Добавки помогают совсем немного и только когда основа уже налажена.
    Большинству достаточно обычной еды; из всего списка по-настоящему доказаны протеин (если не хватает белка), креатин и кофеин.</div></section>
  ${canNotify() ? `<h2>Напоминания о приёме</h2><section class="card">${suppRemsHtml()}</section>` : ''}
  <h2>Справочник</h2>
  <div class="chips"><button class="chip ${supF ? '' : 'on'}" data-a="supF" data-v="0">Все</button>
    ${[3, 2, 1].map(p => `<button class="chip ${supF === p ? 'on' : ''}" data-a="supF" data-v="${p}">${PROOF[p][0]}</button>`).join('')}</div>
  ${list.map(x => `<a class="card link award" href="#/supps/${x.id}"><div class="aw-ic">${x.icon}</div><div class="grow"><div class="ex-head"><b>${x.name}</b>${proofBadge(x.proof)}</div>
    <div class="muted small">${x.why.split('. ')[0].replace(/\.$/, '')}.</div></div></a>`).join('')}
  ${medNote}`;
}

/* ---------- справочник: словарь терминов ---------- */
let glosQ = '';
function glosHtml() {
  const q = glosQ.trim().toLowerCase();
  const list = GLOSSARY.filter(g => !q || g[0].toLowerCase().includes(q) || g[1].toLowerCase().includes(q));
  let last = null;
  return list.map(([term, text, group]) => (group !== last ? `<h2>${last = group}</h2>` : '') +
    `<section class="card term"><b>${term}</b><div class="small">${text}</div></section>`).join('') || `<div class="empty">Такого термина в словаре нет</div>`;
}
function pgGlossary() {
  return `<header class="top"><a class="ic" href="#/more">‹</a><h1>Словарь терминов</h1></header>
  <input class="search" type="search" placeholder="Поиск: суперсет, тоннаж, 1ПМ…" data-in="glosQ" value="${esc(glosQ)}">
  <div id="glosbox">${glosHtml()}</div>`;
}

/* ---------- примеры рациона под рассчитанную норму ---------- */
let mealDay = 'usual';
// Пересчитывает порции варианта дня под нужные калории и считает, что получилось.
function mealPlan(day, kcal) {
  const base = day.meals.reduce((a, [, items]) => a + items.reduce((b, [f, g]) => b + FOODS[f][1] * g / 100, 0), 0);
  const k = Math.max(.6, Math.min(1.9, kcal / base));
  let tk = 0, tp = 0;
  const meals = day.meals.map(([name, items]) => [name, items.map(([f, g]) => {
    const step = f === 'oil' || f === 'honey' || f === 'nuts' ? 5 : 10;
    const count = f === 'egg' ? Math.max(1, Math.round(g * k / 55)) : 0;      // яйца считаем штуками
    const grams = count ? count * 55 : Math.max(step, Math.round(g * k / step) * step);
    tk += FOODS[f][1] * grams / 100; tp += FOODS[f][2] * grams / 100;
    return [FOODS[f][0], count ? count + ' шт.' : grams + (f === 'milk' ? ' мл' : ' г')];
  })]);
  return { meals, kcal: Math.round(tk / 10) * 10, protein: Math.round(tp) };
}
function pgMeals() {
  const x = nutrition(), day = MEAL_DAYS.find(d => d.id === mealDay), m = mealPlan(day, x.kcal), lack = x.protein - m.protein;
  return `<header class="top"><a class="ic" href="#/health">‹</a><h1>Примеры рациона</h1></header>
  <section class="card"><b>Ваша норма: ${x.kcal} ккал и ${x.protein} г белка</b>
    <div class="muted small" style="margin-top:4px">Порции ниже пересчитаны под неё. Параметры меняются в разделе «Питание, вода и сон».</div></section>
  <div class="chips">${MEAL_DAYS.map(d => `<button class="chip ${mealDay === d.id ? 'on' : ''}" data-a="mealDay" data-v="${d.id}">${d.name}</button>`).join('')}</div>
  ${m.meals.map(([name, items]) => `<h2>${name}</h2><section class="card">${items.map(([food, amount]) =>
    `<div class="li"><span>${food}</span><b>${amount}</b></div>`).join('')}</section>`).join('')}
  <section class="card"><b>Итого за день: около ${m.kcal} ккал и ${m.protein} г белка</b>
    ${lack > 10 ? `<div class="hint">До нормы не хватает примерно ${lack} г белка. Добавьте порцию творога (200 г — 34 г белка),
      куриной грудки (100 г — 31 г) или протеина (порция — 20–25 г).</div>` : `<div class="muted small" style="margin-top:4px">Норма белка набирается обычной едой, без добавок.</div>`}</section>
  <p class="muted small">Это пример, а не диета: продукты можно менять на похожие — курицу на индейку или рыбу, гречку на рис или макароны.
    Калорийность взята по усреднённым таблицам; крупы и макароны указаны в сухом виде.</p>`;
}

/* ---------- дневник цикла ---------- */
const dayTs = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
// Длина цикла — среднее по последним записям (если их мало — 28 дней); фаза считается от последнего начала.
function cycleInfo() {
  const starts = [...((db.cycle || {}).starts || [])].sort();
  if (!starts.length) return null;
  const gaps = starts.slice(1).map((s, i) => Math.round((dayTs(s) - dayTs(starts[i])) / DAY)).filter(g => g >= 18 && g <= 45).slice(-6);
  const len = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 28;
  const last = dayTs(starts[starts.length - 1]), passed = Math.round((dayTs(today()) - last) / DAY), day = passed + 1, ov = len - 14;
  const late = passed >= len;
  const phase = late ? 'pms' : day <= 5 ? 'period' : day < ov - 1 ? 'follicular' : day <= ov + 1 ? 'ovulation' : day <= len - 5 ? 'luteal' : 'pms';
  return { len, day, phase, late, next: last + len * DAY, left: len - passed, measured: gaps.length };
}
function cycleCard() {
  const c = profile().sex === 'f' && db.settings.cycleHome !== false ? cycleInfo() : null;
  if (!c || c.day > c.len + 10) return '';
  const [name, icon, tip] = CYCLE_PHASES[c.phase];
  return `<a class="card link" href="#/cycle"><div class="ex-head"><b>${icon} День ${c.day} цикла · ${name.toLowerCase()}</b><span class="muted small">подробнее</span></div>
    <div class="muted small" style="margin-top:4px">${tip.split('. ')[0].replace(/\.$/, '')}.</div></a>`;
}
function pgCycle() {
  const c = cycleInfo(), starts = [...((db.cycle || {}).starts || [])].sort().reverse();
  const add = `<button class="btn block primary" data-a="cycleAdd">Отметить начало менструации</button>`;
  const note = `<p class="muted small">Расчёт приблизительный: цикл у каждой женщины свой и может меняться. Дневник помогает планировать нагрузку
    и не подходит для контрацепции или диагностики. При нерегулярном цикле или сильных болях обратитесь к врачу. Записи хранятся только на этом устройстве.</p>`;
  if (!c) return `<header class="top"><a class="ic" href="#/more">‹</a><h1>Дневник цикла</h1></header>
    <section class="card"><b>🌙 Тренировки с учётом цикла</b>
      <div class="small" style="margin-top:6px">Силы и самочувствие меняются в течение цикла. Отметьте первый день менструации —
      приложение будет показывать текущую фазу и подсказывать, когда можно работать в полную силу, а когда лучше сбавить.</div></section>
    ${add}${note}`;
  const [name, icon, tip] = CYCLE_PHASES[c.phase], when = new Date(c.next).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return `<header class="top"><a class="ic" href="#/more">‹</a><h1>Дневник цикла</h1></header>
  <section class="card cyc"><div class="cyc-ic">${icon}</div><div class="muted small">День ${c.day} из ${c.len}</div><b>${name}</b>
    <div class="bar" style="margin:12px 0"><i style="width:${Math.min(100, Math.round(c.day / c.len * 100))}%"></i></div>
    <div class="small">${tip}</div></section>
  <section class="card"><b>${c.late ? `Менструация ожидалась ${when}` : `Следующая менструация — около ${when}`}</b>
    <div class="muted small" style="margin-top:4px">${c.late ? 'Если она уже началась — отметьте это, чтобы расчёт продолжился.' : `Примерно через ${c.left} дн.`}
      Длина цикла: ${c.len} дн. ${c.measured ? `(среднее по ${c.measured + 1} записям)` : '(стандартная, уточнится после второй записи)'}.</div></section>
  ${add}
  <h2>Фазы и тренировки</h2>
  ${['period', 'follicular', 'ovulation', 'luteal', 'pms'].map(k => `<section class="card term ${k === c.phase ? 'active' : ''}"><b>${CYCLE_PHASES[k][1]} ${CYCLE_PHASES[k][0]}</b>
    <div class="small">${CYCLE_PHASES[k][2]}</div></section>`).join('')}
  <h2>Записи</h2>
  <section class="card">${starts.map(s => `<button class="li" data-a="cycleDel" data-v="${s}"><span>${fmtDate(dayTs(s))}</span><span class="muted small">удалить</span></button>`).join('')}
    <label class="switch"><span>Показывать фазу на главном экране</span><input type="checkbox" data-in="setting" data-k="cycleHome" ${db.settings.cycleHome !== false ? 'checked' : ''}></label></section>
  ${note}`;
}

/* ---------- разминка и растяжка ---------- */
const stretchTime = set => set.items.reduce((a, i) => a + STRETCH[i][1], 0);
const stretchDemo = i => `<div class="demo"><img src="img/s${i}_0.jpg" alt=""><img class="f2" src="img/s${i}_1.jpg" alt=""></div>`;
function pgStretch(id) {
  const set = STRETCH_SETS.find(s => s.id === id);
  if (!set) return `<header class="top"><a class="ic" href="#/more">‹</a><h1>Разминка и растяжка</h1></header>
    ${STRETCH_SETS.map(s => `<a class="card link award" href="#/stretch/${s.id}"><div class="aw-ic">${s.icon}</div><div class="grow"><b>${s.name}</b>
      <div class="muted small">${s.about}</div><div class="muted small">${s.items.length} движений · ${Math.round(stretchTime(s) / 60)} мин</div></div></a>`).join('')}
    <p class="muted small">Перед тренировкой — динамическая разминка, после — спокойная растяжка без боли и рывков: тянитесь до лёгкого натяжения и дышите ровно.</p>`;
  return `<header class="top"><a class="ic" href="#/stretch">‹</a><h1>${set.name}</h1></header>
  <div class="sub">${set.items.length} движений · ${Math.round(stretchTime(set) / 60)} мин</div>
  <button class="btn block primary" data-a="stretchPlay" data-id="${set.id}">▶ Начать с таймером</button>
  ${set.items.map((i, k) => `<section class="card plan"><img class="thumb" src="img/s${i}_0.jpg" loading="lazy" alt="" data-a="stretchShow" data-i="${i}">
    <div class="grow"><b>${k + 1}. ${STRETCH[i][0]}</b><div class="small">${STRETCH[i][1]} сек</div>
    <div class="muted small">${STRETCH[i][2]}</div></div></section>`).join('')}`;
}
// Проигрыватель комплекса: показывает движение и отсчитывает время, затем сам переходит к следующему.
let player = null;
function playerDraw() {
  const i = player.set.items[player.k], [name, secs, text] = STRETCH[i];
  $('.sheet').innerHTML = `<div class="muted small">${player.set.name} · ${player.k + 1} из ${player.set.items.length}</div>
    <h3 style="margin:4px 0 10px">${name}</h3>${stretchDemo(i)}
    <div class="sp-time" id="sp-time">${player.left}</div>
    <div class="bar"><i id="sp-bar" style="width:${Math.round((1 - player.left / secs) * 100)}%"></i></div>
    <div class="muted small" style="margin:10px 0">${text}</div>
    <div class="row two"><button class="btn" data-a="stretchStep" data-v="-1">‹ Назад</button>
      <button class="btn" data-a="stretchPause">${player.paused ? '▶ Продолжить' : '❚❚ Пауза'}</button>
      <button class="btn" data-a="stretchStep" data-v="1">Далее ›</button></div>
    <button class="btn block ghost" style="margin:6px 0 0" data-a="sheetClose">Закончить</button>`;
}
function playerGo(k) {
  if (k >= player.set.items.length) {
    clearInterval(player.timer); player = null; closeSheet(); beep();
    db.stretchDone = (db.stretchDone || 0) + 1; save();
    return toast(checkAwards().length ? 'Комплекс выполнен · новое достижение 🏆' : 'Комплекс выполнен 👍');
  }
  player.k = Math.max(0, k); player.left = STRETCH[player.set.items[player.k]][1];
  playerDraw();
}
function playerTick() {
  if (!player || !$('#sp-time')) { if (player) clearInterval(player.timer); player = null; return; }   // шторку закрыли
  if (player.paused) return;
  if (--player.left <= 0) { beep(); return playerGo(player.k + 1); }
  $('#sp-time').textContent = player.left;
  $('#sp-bar').style.width = Math.round((1 - player.left / STRETCH[player.set.items[player.k]][1]) * 100) + '%';
}

/* ---------- версия и обновление ---------- */
// NATIVE — приложение запущено внутри Android-оболочки, которая умеет скачивать новые файлы с сервера обновлений.
// Оболочка для Windows (WebView2) общается сообщениями — приводим её к тому же интерфейсу, что и Android.
if (!window.Android && window.chrome && window.chrome.webview) {
  window.Android = { update: (url, manual) => window.chrome.webview.postMessage({ cmd: 'update', url, manual }) };
}
const NATIVE = !!window.Android;
const DEFAULT_UPDATE_URL = "https://raw.githubusercontent.com/DedMazay321/gymlog/main";
const updUrl = () => (db.settings.updUrl || DEFAULT_UPDATE_URL).trim().replace(/\/+$/, '');
const updOk = () => updUrl().startsWith('https://');
let ver = { version: 0, name: "" };
fetch("version.json", { cache: "no-store" }).then(r => r.json()).then(v => { ver = v; glog.add("info", "Версия приложения " + v.name); if (location.hash === "#/more") render(); }).catch(e => glog.add("warn", "version.json: " + e.message));
window.onNativeUpdate = r => {
  if (r.state !== 'progress') glog.add(r.state === 'error' ? 'warn' : 'info', 'Обновление: ' + r.state + (r.name ? ' ' + r.name : '') + (r.message ? ' — ' + r.message : '') + (r.manual ? ' (вручную)' : ''));
  const btn = $("#updBtn");
  if (r.state === "progress") { if (btn) btn.textContent = `Загрузка ${r.done} из ${r.total}…`; return; }
  if (btn) { btn.disabled = false; btn.textContent = "Проверить обновления"; }
  if (r.state === "done") {
    if (!r.manual) return toast(`Загружена версия ${r.name} — применится при следующем запуске`);
    toast(`Обновлено до версии ${r.name}`);
    setTimeout(() => location.reload(), 900);
  } else if (r.manual) toast(r.state === "none" ? "Установлена последняя версия" : "Ошибка обновления: " + r.message);
};

/* ---------- маршруты ---------- */
const pages = { workouts: pgWorkouts, workout: pgWorkout, programs: pgPrograms, program: pgProgram, exercises: pgExercises, exercise: pgExercise, measures: pgMeasures, more: pgMore, stats: pgStats, awards: pgAwards, health: pgHealth, stretch: pgStretch, history: pgHistory, progress: pgProgress, catalog: pgCatalog, pick: () => pgPick(false), supps: pgSupps, glossary: pgGlossary, meals: pgMeals, cycle: pgCycle, analysis: pgAnalysis };
const tabOf = { analysis: 'progress', workout: 'workouts', program: 'programs', exercise: 'exercises', stats: 'progress', awards: 'progress', history: 'progress', measures: 'progress', catalog: 'programs', pick: 'programs', health: 'more', stretch: 'more', supps: 'more', glossary: 'more', meals: 'more', cycle: 'more' };
function render() {
  const [page, id, sub] = (location.hash.slice(2) || 'workouts').split('/');
  const fn = pages[page] || pgWorkouts;
  try { $('#app').innerHTML = fn(id, sub); }
  catch (e) {
    glog.add('error', `Экран «${page || 'workouts'}» не открылся: ${e.message}`, e.stack);
    $('#app').innerHTML = `<header class="top"><a class="ic" href="#/workouts">‹</a><h1>Что-то пошло не так</h1></header>
      <section class="card"><div class="small">Этот экран не открылся из-за ошибки в приложении. Ваши данные не пострадали. Ошибка записана в журнал: «Ещё» → «Журнал для разработчика».</div>
      <div class="muted small" style="margin-top:6px">${esc(e.message)}</div></section><a class="btn block" href="#/workouts">На главную</a>`;
  }
  $('#app').classList.toggle('wide', page === 'analysis' || page === 'photoan' || page === 'tonnage');   // на широком экране (ПК) анализ раскладывается в две колонки
  const tab = tabOf[page] || (pages[page] ? page : 'workouts');
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  document.documentElement.dataset.theme = db.settings.theme;
  syncWake();
}
const go = h => { if (location.hash === h) render(); else location.hash = h; };
window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });

/* ---------- действия ---------- */
// link — из какой программы и какого её дня тренировка (pid, di): по ним считается «следующая по программе»
function newWorkout(name, items, link = {}) {
  const act = activeW();
  if (act) { toast('Сначала завершите текущую тренировку'); return go('#/workout/' + act.id); }
  const w = { id: uid(), start: Date.now(), end: null, name, note: '', items, ...link };
  if (link.pid) db.activeProgram = link.pid;
  db.workouts.push(w); save(); go('#/workout/' + w.id);
}
// Суперсет — упражнения подряд, связанные флагом ss: при перестановке они двигаются вместе.
function wBlocks(items) {
  const out = [];
  items.forEach((it, i) => { if (i && items[i - 1].ss) out[out.length - 1].push(it); else out.push([it]); });
  return out;
}
const blockStarted = b => b.some(it => it.sets.some(s => s.done));
// mode: next — сделать следующим (сразу после начатых), end — в конец, up / down — на одно место
function reorder(w, i, mode) {
  const blocks = wBlocks(w.items), bi = blocks.findIndex(b => b.includes(w.items[i]));
  const [b] = blocks.splice(bi, 1);
  let to;
  if (mode === 'end') to = blocks.length;
  else if (mode === 'next') { to = blocks.findIndex(x => !blockStarted(x)); if (to < 0) to = blocks.length; }
  else if (mode === 'up') to = Math.max(0, bi - 1);
  else to = Math.min(blocks.length, bi + 1);
  blocks.splice(to, 0, b);
  w.items = blocks.flat();
  return w.items.indexOf(b[0]);
}
function orderHtml(w) {
  const blocks = wBlocks(w.items);
  return `<h3>Порядок упражнений</h3>
    <div class="muted small" style="margin-bottom:8px">Стрелками меняйте очередь. Суперсеты двигаются целиком, начатые упражнения отмечены ✓.</div>
    ${blocks.map((b, k) => { const i = w.items.indexOf(b[0]); return `<div class="ord-row">
      <div class="grow">${b.map(it => `<div>${blockStarted([it]) ? '✓ ' : ''}${esc(exById(it.exId).name)}</div>`).join('')}${b.length > 1 ? '<div class="muted small">суперсет</div>' : ''}</div>
      <button class="ic sm" data-a="ordMove" data-w="${w.id}" data-x="${i}" data-v="up" ${k ? '' : 'disabled'} aria-label="Выше">↑</button>
      <button class="ic sm" data-a="ordMove" data-w="${w.id}" data-x="${i}" data-v="down" ${k < blocks.length - 1 ? '' : 'disabled'} aria-label="Ниже">↓</button></div>`; }).join('')}
    <div class="row end" style="margin-top:12px"><button class="btn primary" data-a="sheetClose">Готово</button></div>`;
}
const emptySets = c => Array.from({ length: c }, () => ({ w: null, r: null, done: false }));
function download(name, text, type) {
  if (NATIVE && Android.saveFile) return Android.saveFile(name, text, type);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const exFields = e => [
  { name: 'name', label: 'Название', value: e.name || '' },
  { name: 'muscle', label: 'Группа мышц', type: 'select', value: e.muscle || MUSCLES[0], options: MUSCLES.map(m => [m, m]) },
  { name: 'equip', label: 'Оборудование', type: 'select', value: e.equip || EQUIP[0], options: EQUIP.map(m => [m, m]) },
  { name: 'kind', label: 'Что записывать', type: 'select', value: e.kind || 'wr', options: Object.entries(KINDS).map(([v, k]) => [v, k.name]) },
  { name: 'note', label: 'Свои заметки по технике (необязательно)', type: 'textarea', value: e.note || '' },
];

let eggTaps = 0, eggTimer, remDemo = Math.floor(Math.random() * 30);
const actions = {
  sheetClose: () => closeSheet(),
  // Пасхалка: пять быстрых нажатий на приветствие на главном экране или на строку с версией в «Ещё».
  egg() {
    clearTimeout(eggTimer);
    eggTimer = setTimeout(() => eggTaps = 0, 1500);
    if (++eggTaps < 5) return;
    eggTaps = 0;
    const el = document.createElement('div');
    el.className = 'egg';
    el.innerHTML = Array.from({ length: 26 }, () => `<i style="left:${Math.round(Math.random() * 94)}%;font-size:${18 + Math.round(Math.random() * 26)}px;animation-duration:${(3 + Math.random() * 3).toFixed(1)}s;animation-delay:${(Math.random() * 2.5).toFixed(1)}s">❤️</i>`).join('') + '<b>Всё для тебя ❤️</b>';
    el.onclick = () => el.remove();
    document.body.appendChild(el);
    if (navigator.vibrate) navigator.vibrate([60, 80, 60]);
    setTimeout(() => el.remove(), 9000);
  },
  back: () => history.length > 1 ? history.back() : go('#/exercises'),
  sheetRes: d => closeSheet(d.v),
  restAdd: d => { if (rest) { rest.end += d.v * 1000; rest.total = Math.max(1, rest.total + +d.v); rest.fired = false; saveRest(); drawRest(); } },
  restStop: () => stopRest(),
  calNav: d => { cal.setMonth(cal.getMonth() + +d.v); render(); },
  // Что было в выбранный день: тренировки с подходами, а если их нет — что стоит в расписании.
  calDay(d) {
    const from = new Date(+d.y, +d.m, +d.d).getTime(), to = new Date(+d.y, +d.m, +d.d + 1).getTime();
    const list = db.workouts.filter(w => w.start >= from && w.start < to).sort((a, b) => a.start - b.start);
    const title = new Date(from).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
    const p = activeProgram(), di = p && p.week ? p.week[wdOf(from)] : null, planned = di != null && p.days[di] ? p.days[di] : null;
    const isToday = sameDay(from, Date.now()), future = from > Date.now();
    const body = list.map(w => {
      const st = wStats(w);
      return `<section class="card"><div class="ex-head"><b>${w.feel ? FEEL[w.feel][1] + ' ' : ''}${esc(w.name)}</b>
          <span class="muted small">${new Date(w.start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="muted small">${w.end ? fmtDur(w.end - w.start) : 'идёт сейчас'} · ${st.sets} подх.${st.ton ? ` · ${n(Math.round(st.ton))} кг` : ''}${w.feel ? ' · ' + FEEL[w.feel][0] : ''}</div>
        ${w.note ? `<div class="small" style="margin-top:6px">📝 ${esc(w.note)}</div>` : ''}
        ${w.items.map(it => { const ex = exById(it.exId), sets = it.sets.filter(x => x.done);
          return `<div class="day-ex"><b>${esc(ex.name)}</b><span class="muted">${sets.map(x => setTxt(x, ex.kind)).join(' · ') || '—'}</span></div>`; }).join('')}
        <a class="btn sm block" style="margin:10px 0 0" href="#/workout/${w.id}">Открыть тренировку</a></section>`;
    }).join('');
    const plan = planned && !list.length ? `<section class="card"><div class="muted small">${future || isToday ? 'По расписанию' : 'По расписанию была запланирована'}</div>
        <b>${esc(planned.name)}</b><div class="muted small">${planned.items.map(it => esc(exById(it.exId).name)).join(' · ')}</div>
        ${isToday && !activeW() ? `<button class="btn sm primary block" style="margin:10px 0 0" data-a="start" data-p="${p.id}" data-d="${di}">▶ Начать тренировку</button>`
          : `<a class="btn sm block" style="margin:10px 0 0" href="#/program/${p.id}/${di}">Посмотреть день программы</a>`}</section>` : '';
    sheet(`<h3>${title}</h3>${body}${plan}${body || plan ? '' : `<div class="empty">${future ? 'На этот день ничего не запланировано' : 'В этот день тренировки не было'}</div>`}
      <div class="row end"><button class="btn" data-a="sheetClose">Закрыть</button></div>`);
  },

  /* тренировки */
  async startSheet() {
    const opts = [['', 'Пустая тренировка']];
    db.programs.forEach(p => p.days.forEach((dy, di) => opts.push([p.id + '/' + di, `${p.name} — ${dy.name}`])));
    const v = await menu('Начать тренировку', opts);
    if (v == null) return;
    if (!v) return newWorkout('Тренировка', []);
    const [p, di] = v.split('/');
    actions.start({ p, d: di });
  },
  start(d) {
    const p = P(d.p), day = p.days[d.d];
    // в лёгкую неделю подходов вдвое меньше
    const light = deloadOn();
    newWorkout(day.name, day.items.map(pi => ({ exId: pi.exId, rest: pi.rest || null, planR: pi.reps, ss: !!pi.ss, note: '', sets: emptySets(light ? Math.max(1, Math.ceil(pi.sets / 2)) : pi.sets) })), { pid: p.id, di: +d.d, ...(light ? { deload: true } : {}) });
  },
  async wRename(d) {
    const w = W(d.w), r = await form('Название тренировки', [{ name: 'name', label: 'Название', value: w.name }]);
    if (r && r.name) { w.name = r.name; save(); render(); }
  },
  async wMenu(d) {
    const w = W(d.w);
    const v = await menu(w.name, [!w.end ? ['fill', 'Заполнить всё как в прошлый раз'] : null, !w.end ? ['fillUp', 'Заполнить всё с прибавкой'] : null, w.items.length > 1 ? ['order', 'Порядок упражнений'] : null, ['rename', 'Переименовать'], ['note', 'Заметка к тренировке'], ['date', 'Изменить дату'],
      w.end && !activeW() ? ['resume', 'Продолжить тренировку'] : null, ['del', 'Удалить тренировку', 1]]);
    if (v === 'fill' || v === 'fillUp') return actions.fillAll({ w: d.w, v: v === 'fillUp' ? 'up' : '' });
    if (v === 'order') return actions.wOrder(d);
    if (v === 'rename') return actions.wRename(d);
    if (v === 'note') {
      const r = await form('Заметка', [{ name: 'note', label: 'Текст', type: 'textarea', value: w.note }]);
      if (r) { w.note = r.note; save(); render(); }
    }
    if (v === 'date') {
      const r = await form('Дата тренировки', [{ name: 'date', label: 'Дата', type: 'date', value: isoDay(w.start) }]);
      if (r && r.date) {
        const old = new Date(w.start), [y, m, dd] = r.date.split('-').map(Number);
        const shift = new Date(y, m - 1, dd, old.getHours(), old.getMinutes(), old.getSeconds()).getTime() - w.start;
        w.start += shift; if (w.end) w.end += shift;
        save(); render();
      }
    }
    if (v === 'resume') { w.end = null; save(); render(); }
    if (v === 'del' && await confirmDlg('Удалить тренировку?')) {
      if (!w.end) stopRest();
      forget(w.id); db.workouts = db.workouts.filter(x => x !== w); save(); go('#/workouts');
    }
  },
  async wAddEx(d) {
    const id = await pickExercise();
    if (!id) return;
    const prev = prevSets(id, d.w, Infinity);
    W(d.w).items.push({ exId: id, rest: null, note: '', sets: emptySets(Math.max(1, Math.min(prev.length, 6))) });
    save(); render();
  },
  async wFinish(d) {
    const w = W(d.w);
    if (!wStats(w).sets) {
      if (await confirmDlg('Нет выполненных подходов. Удалить тренировку?')) {
        forget(w.id); db.workouts = db.workouts.filter(x => x !== w); stopRest(); save(); go('#/workouts');
      }
      return;
    }
    w.items.forEach(it => it.sets = it.sets.filter(s => s.done));
    w.items = w.items.filter(it => it.sets.length);
    w.end = Date.now(); stopRest(); save();
    render();
    const feel = await menu('Как прошла тренировка?', [[1, '😌 Легко — остался запас сил'], [2, '🙂 Нормально — в самый раз'], [3, '😤 Тяжело — на пределе']]);
    if (feel) w.feel = +feel;
    save(); syncReminders(); syncAuto(true);
    const news = checkAwards();
    render();
    // главное достижение, не отпразднованное во время тренировки (например, подход отмечен уже после завершения)
    const sp = checkSpecial();
    for (const a of sp) await celebrate(a, false);
    const mini = miniFor(w), ton = wStats(w).ton;
    if (news.length || mini.length) {
      sheet(`<h3>💪 Тренировка завершена${ton ? ` · ${tonsShort(ton)}` : ''}</h3>
        ${mini.length ? `<div class="muted small" style="margin:2px 0 6px">Мини-достижения</div>${miniHtml(mini)}` : ''}
        ${news.length ? `<div class="muted small" style="margin:10px 0 2px">🏆 Новые достижения</div>${news.map(a => `<div class="li" style="display:block"><b>${a.icon} ${a.title}</b>
        <div class="muted small">Уровень ${a.level} из ${a.tiers.length}: ${n(a.tiers[a.level - 1])} ${a.what}</div></div>`).join('')}` : ''}
        <div class="row end" style="margin-top:14px"><a class="btn ghost" href="${news.length ? '#/awards' : '#/tonnage'}">${news.length ? 'Все достижения' : 'Тоннаж'}</a>
        <button class="btn primary" data-a="sheetClose">Отлично</button></div>`);
    } else toast(`Тренировка завершена 💪${ton ? ' Тоннаж: ' + tonsShort(ton) : ''}`);
  },
  wRepeat(d) {
    const w = W(d.w);
    newWorkout(w.name, w.items.map(it => ({ exId: it.exId, rest: it.rest || null, planR: it.planR, ss: !!it.ss, note: '', sets: emptySets(it.sets.length || 1) })),
      w.pid && P(w.pid) ? { pid: w.pid, di: w.di } : {});
  },
  async itMenu(d) {
    const w = W(d.w), i = +d.x, it = w.items[i];
    const v = await menu(exById(it.exId).name, [['swap', 'Заменить упражнение'],
      it.ss ? ['ss', 'Разъединить суперсет'] : i < w.items.length - 1 ? ['ss', 'Суперсет со следующим упражнением'] : null,
      ['order', 'Порядок упражнений…'], ['note', 'Заметка'],
      ['rest', 'Время отдыха для упражнения'], ['stat', 'Статистика упражнения'], ['del', 'Убрать из тренировки', 1]]);
    if (v === 'swap') return actions.itSwap(d);
    if (v === 'ss') it.ss = !it.ss;
    if (v === 'order') return actions.wOrder(d);
    if (v === 'note') {
      const r = await form('Заметка к упражнению', [{ name: 'note', label: 'Текст', type: 'textarea', value: it.note || '' }]);
      if (r) it.note = r.note;
    }
    if (v === 'rest') {
      const r = await form('Отдых, секунд', [{ name: 'rest', label: 'Пусто — как в настройках', type: 'number', value: it.rest || '' }]);
      if (r) it.rest = num(r.rest);
    }
    if (v === 'stat') return go('#/exercise/' + it.exId);
    if (v === 'del') w.items.splice(i, 1);
    if (v) { save(); render(); }
  },
  setAdd(d) {
    const it = W(d.w).items[d.x], l = it.sets[it.sets.length - 1];
    it.sets.push({ w: l ? l.w : null, r: l ? l.r : null, done: false });
    save(); render();
  },
  setDel(d) { W(d.w).items[d.x].sets.pop(); save(); render(); },
  async itSwap(d) {
    const w = W(d.w), i = +d.x, it = w.items[i], id = await pickAnalog(it.exId);
    if (!id) return;
    const done = it.sets.filter(s => s.done);
    // уже выполненные подходы остаются за старым упражнением, оставшиеся переходят к новому
    if (done.length) {
      w.items.splice(i + 1, 0, { exId: id, rest: it.rest || null, planR: it.planR, ss: it.ss, note: '', sets: emptySets(Math.max(1, it.sets.length - done.length)) });
      it.sets = done; it.ss = false;
    } else { it.exId = id; it.sets = emptySets(it.sets.length); }
    save(); render();
  },
  // кнопки − и + у поля: шаг зависит от упражнения, пустое поле стартует с подсказки
  stepVal(d, el) {
    const it = W(d.w).items[d.x], s = it.sets[d.s], ex = exById(it.exId), inp = el.parentNode.querySelector('input');
    const step = d.f === 'r' ? (ex.kind === 'time' ? 5 : 1) : ex.kind === 'cardio' ? .5 : ex.equip === 'Гантели' || ex.equip === 'Гиря' ? 1 : 2.5;
    const cur = s[d.f] != null ? s[d.f] : num(inp.placeholder);
    s[d.f] = cur == null ? (+d.v > 0 ? step : 0) : Math.max(0, +(cur + step * +d.v).toFixed(2));
    inp.value = s[d.f];
    save();
  },
  tipHide(d) { db.settings.tips = { ...(db.settings.tips || {}), [d.k]: true }; save(); render(); },
  onbSkip() { db.settings.onboarded = true; save(); render(); },
  setFeel(d) {
    const s = W(d.w).items[d.x].sets[d.s];
    if (s.f === +d.v) delete s.f; else s.f = +d.v;
    save(); render();
  },
  async setType(d) {
    const it = W(d.w).items[d.x], s = it.sets[d.s];
    const v = await menu('Тип подхода', [['', 'Рабочий'], ['w', 'Разминочный — не идёт в статистику'], ['f', 'До отказа'],
      ['d', 'Дроп-сет — без отдыха перед ним'], ['del', 'Удалить подход', 1]]);
    if (v == null) return;
    if (v === 'del') it.sets.splice(d.s, 1);
    else if (v) s.t = v;
    else delete s.t;
    save(); render();
  },
  itOrder(d) {
    const w = W(d.w), name = exById(w.items[+d.x].exId).name, j = reorder(w, +d.x, d.v);
    save(); render();
    toast(d.v === 'end' ? `«${name}» — в конце, сделаете, когда освободится` : `«${name}» — следующее`);
    // прокручиваем к упражнению, которое стало следующим
    if (d.v === 'next') setTimeout(() => { const c = document.querySelectorAll('#app section.card')[j]; if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  },
  wOrder(d) { sheet(orderHtml(W(d.w))).then(() => render()); },
  ordMove(d) {
    const w = W(d.w);
    reorder(w, +d.x, d.v); save();
    const sh = modal.querySelector('.sheet');
    if (sh) sh.innerHTML = orderHtml(w);
  },
  warmAdd(d) {
    const w = W(d.w), it = w.items[d.x], ex = exById(it.exId), prev = prevSets(it.exId, w.id, w.start).filter(x => x.t !== 'w');
    const sg = suggest(it, prev), work = (it.sets.find(x => x.t !== 'w' && x.w) || {}).w || Math.max(0, ...prev.map(x => x.w || 0)) + (sg && sg.dw || 0);
    const plan = warmupPlan(ex, work);
    if (!plan.length) return;
    it.sets.unshift(...plan.map(x => ({ w: x.w, r: x.r, done: false, t: 'w' })));
    save(); render();
  },
  setToggle(d, el) {
    const w = W(d.w), it = w.items[d.x], s = it.sets[d.s], tonBefore = wStats(w).ton;
    if (s.done) s.done = false;
    else {
      // пустые поля заполняются подсказкой — результатом прошлой тренировки
      const [iw, ir] = el.closest('.set-row').querySelectorAll('input');
      if (s.w == null) s.w = num(iw.placeholder);
      if (s.r == null) s.r = num(ir.placeholder);
      if (s.r == null) { toast('Введите ' + kindOf(it.exId).b); ir.focus(); return; }
      s.done = true; s.at = Date.now();   // время отметки — по нему считается реальный отдых
      if (!w.end) { tonLiveCheck(w, it, s, tonBefore); specialLiveCheck(w, it, s); }
      // в суперсете сразу идём к следующему упражнению, перед дроп-сетом тоже не отдыхаем
      const next = it.sets[+d.s + 1], noRest = it.ss || (next && next.t === 'd');
      if (!w.end && !noRest) startRest(it.rest || db.settings.rest);
    }
    save(); render();
  },

  /* программы */
  wizOpen() { sheet(wizHtml()); },
  wizSet(d) {
    wiz[d.k] = d.k === 'days' ? +d.v : d.v;
    if (!splitOk(wiz.split, wiz.days, wiz.place)) wiz.split = 'auto';
    const box = $('#wizbox'), el = box || $('.sheet'), top = el.scrollTop;
    el.innerHTML = wizHtml(!!box); el.scrollTop = top;
  },
  wizCreate() {
    const p = adoptProgram(buildProgram(wiz));
    db.settings.onboarded = true;
    save(); syncReminders(); closeSheet(); go('#/program/' + p.id);
    toast('Программа создана — её можно изменить под себя');
  },
  catAdd(d) {
    const p = adoptProgram(catalogProgram(CATALOG[+d.id]));
    db.settings.onboarded = true;
    save(); syncReminders(); go('#/program/' + p.id);
    toast('Программа добавлена — расписание можно изменить');
  },
  /* анкета */
  obSet(d) {
    ob[d.k] = d.k === 'days' || d.k === 'time' ? +d.v : d.v;
    if (d.k === 'sex') ob.focus = 'all';
    if (!d.stay) ob.step++;          // вопросы с одним ответом листаются сами
    render(); if (!d.stay) window.scrollTo(0, 0);
  },
  obStep(d, el) {
    const lim = { age: [12, 90], height: [120, 220], weight: [35, 200] }[d.k];
    ob[d.k] = Math.max(lim[0], Math.min(lim[1], Math.round(((+ob[d.k] || lim[0]) + +d.v) * 10) / 10));
    el.parentNode.querySelector('input').value = ob[d.k];
  },
  obNext() { ob.step = Math.min(OB_STEPS.length - 1, ob.step + 1); render(); window.scrollTo(0, 0); },
  obBack() { ob.step = Math.max(0, ob.step - 1); render(); window.scrollTo(0, 0); },
  obProgram: v => v === 'gen' ? buildProgram({ sex: ob.sex, goal: ob.goal, days: ob.days, level: ob.level === 'new' ? 'new' : 'pro', place: ob.place }) : catalogProgram(CATALOG[+v]),
  obPreview(d) {
    const p = actions.obProgram(d.v);
    figSex = p.sex || ob.sex;
    const days = programPreview(p);
    figSex = null;
    sheet(`<h3>${esc(p.name)}</h3><div class="note">${esc(p.note)}</div>${days}
      <div class="row end"><button class="btn ghost" data-a="sheetClose">Закрыть</button>
      <button class="btn primary" data-a="obChoose" data-v="${d.v}">Выбрать эту программу</button></div>`);
  },
  obChoose(d) {
    const p = adoptProgram(actions.obProgram(d.v));
    if (!p.sex) p.sex = ob.sex;
    db.activeProgram = p.id;
    db.profile = { ...profile(), ...obProfile() };
    // первый замер веса — чтобы сразу был виден на графике
    if (!db.measures.some(m => m.type === 'weight')) db.measures.push({ id: uid(), type: 'weight', value: ob.weight, date: Date.now() });
    db.settings.onboarded = true;
    ob = null;
    save(); syncReminders(); closeSheet(); go('#/workouts'); window.scrollTo(0, 0);
    toast('Программа и расписание готовы. Изменить их можно в «Программах»');
  },
  async pAdd() {
    const r = await form('Новая программа', [{ name: 'name', label: 'Название', value: '', placeholder: 'Например: Сплит на 3 дня' }]);
    if (!r || !r.name) return;
    const p = { id: uid(), name: r.name, days: [] };
    db.programs.push(p); save(); go('#/program/' + p.id);
  },
  async pTemplates() {
    const v = await menu('Готовые программы', PROGRAM_TEMPLATES.map((t, i) => [i, `${t.name} · ${t.days.length} дн.`]));
    if (v == null) return;
    const t = PROGRAM_TEMPLATES[v];
    const p = { id: uid(), name: t.name, days: t.days.map(d => ({ id: uid(), name: d.name, items: d.items.map(([e, sets, reps]) => ({ exId: 'e' + e, sets, reps, rest: null })) })) };
    db.programs.push(p); save(); go('#/program/' + p.id);
  },
  async pRename(d) {
    const p = P(d.p), r = await form('Название программы', [{ name: 'name', label: 'Название', value: p.name }]);
    if (r && r.name) { p.name = r.name; save(); render(); }
  },
  async pMenu(d) {
    const v = await menu(P(d.p).name, [['rename', 'Переименовать'], db.activeProgram === d.p ? null : ['active', 'Сделать текущей программой'],
      ['del', 'Удалить программу', 1]]);
    if (v === 'rename') return actions.pRename(d);
    if (v === 'active') return actions.pActive(d);
    if (v === 'del' && await confirmDlg('Удалить программу? История тренировок сохранится.')) {
      forget(d.p); db.programs = db.programs.filter(p => p.id !== d.p); save(); go('#/programs');
    }
  },
  async dAdd(d) {
    const p = P(d.p), r = await form('Новый день', [{ name: 'name', label: 'Название', value: 'День ' + (p.days.length + 1) }]);
    if (r && r.name) { p.days.push({ id: uid(), name: r.name, items: [] }); save(); render(); }
  },
  async dMenu(d) {
    const p = P(d.p), i = +d.d, day = p.days[i];
    const v = await menu(day.name, [['rename', 'Переименовать'], ['up', 'Переместить выше'], ['down', 'Переместить ниже'], ['del', 'Удалить день', 1]]);
    if (v === 'rename') {
      const r = await form('Название дня', [{ name: 'name', label: 'Название', value: day.name }]);
      if (r && r.name) day.name = r.name;
    }
    // расписание хранит номера дней — при перестановке и удалении номера нужно поправить
    const remap = fn => { if (p.week) Object.keys(p.week).forEach(k => { if (p.week[k] != null) p.week[k] = fn(p.week[k]); }); };
    if (v === 'up' && i > 0) { move(p.days, i, -1); remap(x => x === i ? i - 1 : x === i - 1 ? i : x); }
    if (v === 'down' && i < p.days.length - 1) { move(p.days, i, 1); remap(x => x === i ? i + 1 : x === i + 1 ? i : x); }
    if (v === 'del') { p.days.splice(i, 1); remap(x => x === i ? null : x > i ? x - 1 : x); }
    // порядок дней изменился — со страницы дня возвращаемся к обзору программы
    if (v === 'del' || v === 'up' || v === 'down') { save(); syncReminders(); return go('#/program/' + p.id); }
    if (v) { save(); render(); }
  },
  async piAdd(d) {
    const id = await pickExercise();
    if (!id) return;
    const k = exById(id).kind;
    P(d.p).days[d.d].items.push({ exId: id, sets: k === 'cardio' ? 1 : 3, reps: k === 'cardio' ? 20 : k === 'time' ? 60 : 10, rest: null });
    save(); render();
  },
  async piEdit(d) {
    const items = P(d.p).days[d.d].items, i = +d.x, it = items[i], ex = exById(it.exId);
    const r = await form(ex.name, [
      { name: 'sets', label: 'Подходов', type: 'number', value: it.sets },
      { name: 'reps', label: (KINDS[ex.kind] || KINDS.wr).b + ' в подходе', type: 'number', value: it.reps },
      { name: 'rest', label: 'Отдых, сек (пусто — как в настройках)', type: 'number', value: it.rest || '' },
      { name: 'ss', label: 'Суперсет со следующим упражнением', type: 'select', value: it.ss ? 'yes' : 'no', options: [['no', 'Нет'], ['yes', 'Да — без отдыха между ними']] },
    ], `<button type="button" class="btn sm" data-a="sheetRes" data-v="swap">Заменить</button>
        <button type="button" class="btn sm" data-a="sheetRes" data-v="up">↑</button>
        <button type="button" class="btn sm" data-a="sheetRes" data-v="down">↓</button>
        <button type="button" class="btn sm danger" data-a="sheetRes" data-v="del">Убрать</button>`);
    if (!r) return;
    if (r === 'swap') {
      const id = await pickAnalog(it.exId);
      if (!id) return;
      it.exId = id;
    } else if (r === 'up') move(items, i, -1);
    else if (r === 'down') move(items, i, 1);
    else if (r === 'del') items.splice(i, 1);
    else {
      it.sets = Math.max(1, Math.min(20, Math.round(num(r.sets) || 1)));
      it.reps = num(r.reps) || it.reps;
      it.rest = num(r.rest);
      it.ss = r.ss === 'yes';
    }
    save(); render();
  },

  /* упражнения */
  exSexSet(d) {
    const f = picker ? pf : ef;
    f.s = d.v;
    $(picker ? '#pexbox' : '#exbox').innerHTML = exBox(f);
  },
  exMuscle(d) {
    const f = picker ? pf : ef;
    f.m = d.m;
    $(picker ? '#pexbox' : '#exbox').innerHTML = exBox(f);
  },
  exTap(d) { picker ? closeSheet(d.id) : go('#/exercise/' + d.id); },
  async exAdd() {
    const r = await form('Новое упражнение', exFields({ muscle: ef.m }));
    if (!r || !r.name) return;
    const e = { id: uid(), custom: true, ...r };
    db.exercises.push(e); save(); go('#/exercise/' + e.id);
  },
  async exMenu(d) {
    const e = exById(d.id);
    const v = await menu(e.name, [['edit', 'Изменить'], ['del', 'Удалить из справочника', 1]]);
    if (v === 'edit') {
      const r = await form('Изменить упражнение', exFields(e));
      if (r && r.name) { Object.assign(e, r); save(); render(); }
    }
    if (v === 'del' && await confirmDlg('Удалить упражнение? Записи в истории тренировок сохранятся.')) {
      e.archived = true;
      db.programs.forEach(p => p.days.forEach(dy => dy.items = dy.items.filter(it => it.exId !== e.id)));
      save(); go('#/exercises');
    }
  },
  metric(d) { metric = d.v; render(); },
  analogMore(d) { analogAll = d.id; render(); },
  demo(d) {
    sheet(`<h3>${esc(exById(d.id).name)}</h3>${demo(d.id)}${muscleMap(exById(d.id))}${techHtml(exById(d.id))}
      <div class="row end"><a class="btn ghost" href="#/exercise/${d.id}">Статистика</a><button class="btn" data-a="sheetClose">Закрыть</button></div>`);
  },

  /* расписание */
  async weekSet(d) {
    const p = P(d.p), wd = +d.wd;
    const v = await menu(WD_WHEN[wd].replace(/^во? /, '').replace(/^./, c => c.toUpperCase()), [['', 'Отдых'], ...p.days.map((day, i) => [i, day.name])]);
    if (v == null) return;
    p.week = { ...(p.week || {}), [wd]: v === '' ? null : +v };
    if (!activeProgram()) db.activeProgram = p.id;
    save(); syncReminders(); render();
  },
  pActive(d) { db.activeProgram = d.p; save(); syncReminders(); render(); toast('Программа выбрана текущей'); },

  /* напоминания */
  remNext(d) {
    if (!d.keep) remDemo++;
    const p = activeProgram(), el = $('#remText');
    if (el) el.textContent = remindText(remDemo, p && p.days[0] ? p.days[0].name : 'Верх тела');
  },
  // пробное уведомление через 10 секунд: так проще всего убедиться, что они разрешены и приходят
  remTest() {
    const p = activeProgram(), name = p && p.days[0] ? p.days[0].name : 'Пробное напоминание';
    Android.setReminders(JSON.stringify([{ at: Date.now() + 10000, title: remindTitle(name), text: remindText(remDemo, name) }]), true);
    toast('Уведомление придёт примерно через 10 секунд — можно свернуть приложение');
    setTimeout(syncReminders, 20000);
  },

  /* напоминания о добавках */
  suppAdd(d) {
    const supp = d.v || 'creatine';
    suppEd = { isNew: true, id: uid(), supp, name: '', dose: '', time: SUPP_TIMES[supp] || '09:00', days: [0, 1, 2, 3, 4, 5, 6], on: true, demo: 0 };
    sheet(suppSheetHtml());
  },
  suppEdit(d) {
    const r = suppRems().find(x => x.id === d.id);
    if (!r) return;
    suppEd = { ...r, days: [...r.days], demo: 0 };
    sheet(suppSheetHtml());
  },
  suppDay(d) {
    if (d.v === 'all') suppEd.days = [0, 1, 2, 3, 4, 5, 6];
    else if (d.v === 'work') suppEd.days = [0, 1, 2, 3, 4];
    else suppEd.days = suppEd.days.includes(+d.v) ? suppEd.days.filter(x => x !== +d.v) : [...suppEd.days, +d.v];
    const el = $('.sheet'), top = el.scrollTop;
    el.innerHTML = suppSheetHtml(); el.scrollTop = top;
  },
  suppDemo() { suppEd.demo = (suppEd.demo || 0) + 1; $('.sheet .notif .small:last-child').textContent = suppText(suppEd, suppEd.demo); },
  suppTest() {
    Android.setReminders(JSON.stringify([{ at: Date.now() + 10000, title: suppTitle(suppEd), text: suppText(suppEd, suppEd.demo || 0) }]), true);
    toast('Уведомление придёт примерно через 10 секунд — можно свернуть приложение');
    setTimeout(syncReminders, 20000);
  },
  suppSave() {
    const r = suppEd;
    if (r.supp === 'other' && !r.name.trim()) return toast('Введите название добавки');
    if (!r.days.length) return toast('Выберите хотя бы один день недели');
    if (!/^\d\d:\d\d$/.test(r.time)) return toast('Укажите время');
    const rec = { id: r.id, supp: r.supp, name: r.name.trim(), dose: r.dose.trim(), time: r.time, days: [...r.days].sort(), on: r.on !== false };
    const list = suppRems(), i = list.findIndex(x => x.id === r.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
    list.sort((a, b) => a.time.localeCompare(b.time));
    suppEd = null;
    save(); syncReminders(); closeSheet(); render();
    toast('Напоминание сохранено');
  },
  async suppDel() {
    const id = suppEd.id;
    if (!await confirmDlg('Удалить это напоминание?')) return;
    db.suppRem = suppRems().filter(x => x.id !== id);
    suppEd = null;
    save(); syncReminders(); render();
  },

  /* справочник и дневник цикла */
  supF(d) { supF = +d.v; render(); },
  mealDay(d) { mealDay = d.v; render(); },
  async cycleAdd() {
    const r = await form('Начало менструации', [{ name: 'date', label: 'Первый день', type: 'date', value: today() }]);
    if (!r || !r.date) return;
    if (dayTs(r.date) > dayTs(today())) return toast('Дата не может быть в будущем');
    const starts = new Set((db.cycle || {}).starts || []);
    starts.add(r.date);
    db.cycle = { starts: [...starts].sort() };
    save(); render();
  },
  async cycleDel(d) {
    if (!await confirmDlg('Удалить эту запись?')) return;
    db.cycle = { starts: (db.cycle.starts || []).filter(x => x !== d.v) };
    save(); render();
  },

  /* вода, сон, растяжка */
  waterAdd(d) {
    db.water = db.water || {};
    db.water[today()] = Math.max(0, (db.water[today()] || 0) + +d.v);
    save(); render();
  },
  async sleepAdd() {
    const r = await form('Сон', [{ name: 'hours', label: 'Сколько часов спали', type: 'number', value: '' },
      { name: 'date', label: 'Утро какого дня', type: 'date', value: today() }]);
    if (!r) return;
    const h = num(r.hours);
    if (h == null || h < 0 || h > 24) return toast('Введите число часов от 0 до 24');
    db.sleep = db.sleep || {};
    db.sleep[r.date || today()] = h;
    save(); render();
  },
  stretchShow(d) {
    const [name, secs, text] = STRETCH[d.i];
    sheet(`<h3>${name}</h3>${stretchDemo(d.i)}<div class="small" style="margin:10px 0">${text}</div>
      <div class="row end"><span class="muted small" style="flex:1">${secs} сек</span><button class="btn" data-a="sheetClose">Закрыть</button></div>`);
  },
  stretchPlay(d) {
    audioInit();
    sheet('');
    player = { set: STRETCH_SETS.find(x => x.id === d.id), k: 0, left: 0, paused: false, timer: setInterval(playerTick, 1000) };
    playerGo(0);
  },
  stretchStep(d) { if (player) playerGo(player.k + +d.v); },
  stretchPause() { if (player) { player.paused = !player.paused; playerDraw(); } },

  /* замеры */
  mType(d) { mType = d.v; render(); },
  photoAdd() { $('#photoInp').click(); },
  async photoView(d) {
    const p = photos.find(x => x.id === d.id);
    const v = await sheet(`<h3>${fmtDate(p.date)} · ${poseName(p.pose).toLowerCase()}</h3><img class="pfull" src="${photoUrls[p.id]}" alt="">
      <div class="row end" style="margin-top:12px"><button class="btn danger" data-a="sheetRes" data-v="del">Удалить</button>
      <button class="btn" data-a="sheetRes" data-v="pose">Ракурс</button>
      <button class="btn" data-a="sheetClose">Закрыть</button></div>`);
    if (v === 'pose') return actions.photoPose({ id: p.id });
    if (v === 'del' && await confirmDlg('Удалить это фото?')) {
      forget(p.id);
      save();
      await photoStore('readwrite', st => st.delete(p.id));
      URL.revokeObjectURL(photoUrls[p.id]); delete photoUrls[p.id];
      await loadPhotos(); render();
    }
  },
  statKind(d) { statKind = d.v; statOff = 0; render(); },
  statNav(d) { statOff = Math.max(0, statOff + +d.v); render(); },
  statMetric(d) { statMetric = d.v; render(); },
  statLift(d) { statLift = d.v; render(); },
  async mAdd() {
    const [, name, unit] = MEASURES.find(m => m[0] === mType);
    const r = await form(`${name}, ${unit}`, [
      { name: 'value', label: 'Значение', type: 'number', value: '' },
      { name: 'date', label: 'Дата', type: 'date', value: isoDay(Date.now()) },
    ]);
    if (!r) return;
    const v = num(r.value);
    if (v == null) return toast('Введите число');
    const [y, m, dd] = (r.date || isoDay(Date.now())).split('-').map(Number);
    db.measures.push({ id: uid(), type: mType, value: v, date: new Date(y, m - 1, dd, 12).getTime() });
    save(); render();
  },
  async mDel(d) {
    if (await confirmDlg('Удалить эту запись?')) { forget(d.id); db.measures = db.measures.filter(m => m.id !== d.id); save(); render(); }
  },

  /* обновление */
  async update() {
    const btn = $("#updBtn");
    if (NATIVE) {
      if (!updOk()) return toast("Укажите адрес сервера обновлений (https://…)");
      if (btn) { btn.disabled = true; btn.textContent = "Проверяю…"; }
      return Android.update(updUrl(), true);
    }
    // в браузере приложение обновляется с того же адреса, откуда открыто
    try {
      const v = await (await fetch("version.json?" + Date.now(), { cache: "no-store" })).json();
      if (!(v.version > ver.version)) return toast("Установлена последняя версия");
      if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
      location.reload();
    } catch (e) { toast("Не удалось проверить обновления — нет связи"); }
  },

  /* данные */
  anCopy() { copyText(aiReport()).then(ok => toast(ok ? 'Отчёт скопирован — вставьте его в чат с ИИ' : 'Не удалось скопировать — сохраните отчёт файлом')); },
  anSave() { download(`gymlog-otchet-${isoDay(Date.now())}.txt`, aiReport(), 'text/plain'); },
  exportJson() { db.settings.lastBackup = Date.now(); delete db.settings.backupSnooze; save(); download(`gymlog-${isoDay(Date.now())}.json`, JSON.stringify(db), 'application/json'); render(); },
  importJson() { $('#imp').click(); },
  exportCsv() {
    const rows = [['Дата', 'Тренировка', 'Упражнение', 'Подход', 'Вес/км', 'Повторы/сек/мин']];
    sortedW().reverse().forEach(w => w.items.forEach(it => it.sets.filter(s => s.done).forEach((s, j) =>
      rows.push([isoDay(w.start), w.name, exById(it.exId).name, j + 1, n(s.w), n(s.r)]))));
    download(`gymlog-${isoDay(Date.now())}.csv`, '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
  },
  async wipe() {
    if (await confirmDlg('Удалить все тренировки, программы и замеры без возможности восстановления?', 'Удалить всё')) {
      db = fresh(); stopRest(); save(); syncResetBase();
      try { await photoStore('readwrite', st => st.clear()); photos = []; } catch (e) { /* фото не было */ }
      render(); toast('Данные удалены');
    }
  },
};

const inputs = {
  suppF(d, el) {
    suppEd[d.k] = el.value;
    if (d.k === 'supp') {
      // для новой записи подставляем привычное время приёма этой добавки
      if (suppEd.isNew && SUPP_TIMES[el.value]) suppEd.time = SUPP_TIMES[el.value];
      suppEd.demo = 0;
      $('.sheet').innerHTML = suppSheetHtml();
    } else if (d.k === 'name' || d.k === 'dose') {
      $('.sheet .notif b').textContent = suppTitle(suppEd);
      $('.sheet .notif .small:last-child').textContent = suppText(suppEd, suppEd.demo || 0);
    }
  },
  suppOn(d, el) {
    const r = suppRems().find(x => x.id === d.id);
    if (!r) return;
    r.on = el.checked;
    save(); syncReminders();
  },
  glosQ(d, el) { glosQ = el.value; $('#glosbox').innerHTML = glosHtml(); },
  catF(d, el) { cf[d.k] = el.value; $('#catbox').innerHTML = catListHtml(); },
  obNum(d, el) { const v = num(el.value); if (v != null) ob[d.k] = v; },
  prof(d, el) {
    const v = d.k === 'sex' || d.k === 'goal' ? el.value : num(el.value);
    if (v == null || v === 0) return;
    db.profile = { ...profile(), [d.k]: v };
    save();
    $('#nutri').innerHTML = nutriHtml(); $('#waterbox').innerHTML = waterCard(true);
  },
  setVal(d, el) { W(d.w).items[d.x].sets[d.s][d.f] = num(el.value); save(); },
  exSearch(d, el) {
    const f = picker ? pf : ef;
    f.q = el.value;
    $(picker ? '#pexbox' : '#exbox').innerHTML = exBox(f);
  },
  setting(d, el) {
    db.settings[d.k] = el.type === 'checkbox' ? el.checked : ['rest', 'remLead', 'stepBig', 'stepSmall'].includes(d.k) ? +el.value : el.value;
    if (d.k === 'remLead' || d.k === 'remStyle') actions.remNext({ keep: 1 });
    save(); document.documentElement.dataset.theme = db.settings.theme; syncWake(); syncReminders();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || !actions[el.dataset.a]) return;
  if (el.dataset.a !== 'stepVal') glog.add('act', el.dataset.a + ' ' + (location.hash || '#/'));
  try {
    const r = actions[el.dataset.a](el.dataset, el, e);
    if (r && r.catch) r.catch(err => { glog.add('error', `Действие «${el.dataset.a}»: ${err.message}`, err.stack); toast('Ошибка: ' + err.message); });
  } catch (err) { glog.add('error', `Действие «${el.dataset.a}»: ${err.message}`, err.stack); toast('Ошибка: ' + err.message); }
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-in]');
  if (el && inputs[el.dataset.in]) inputs[el.dataset.in](el.dataset, el);
});
// выделять содержимое поля подхода при касании, чтобы сразу вводить новое число
document.addEventListener('focusin', e => { if (e.target.matches('.set-row input')) e.target.select(); });

$('#imp').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!d || !d.version || !Array.isArray(d.workouts) || !Array.isArray(d.exercises)) throw new Error('bad');
    if (!await confirmDlg(`Заменить текущие данные копией (${d.workouts.length} тренировок)?`, 'Заменить')) return;
    db = { ...fresh(), ...d, settings: { ...fresh().settings, ...d.settings } };
    syncResetBase();
    save(); render(); toast('Данные восстановлены');
  } catch (err) { toast('Это не файл резервной копии GymLog'); }
});

$('#photoInp').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const blob = await shrink(file);
    const pose = await menu('Ракурс снимка — по нему фото сравниваются между собой', [['front', 'Спереди'], ['side', 'Сбоку'], ['back', 'Сзади'], ['', 'Не указывать']]);
    await photoStore('readwrite', st => st.put({ id: uid(), date: Date.now(), blob, ...(pose ? { pose } : {}) }));
    await loadPhotos(); render(); toast('Фото добавлено');
  } catch (err) { toast('Не удалось добавить фото: ' + err.message); }
});

// при первом запуске этой версии уровни достижений запоминаем молча, без поздравлений за старую историю
if (!db.awards || AWARDS.some(a => !(a.id in db.awards))) checkAwards(true);
syncReminders();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if (!NATIVE && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(e => glog.add('warn', 'Офлайн-режим не включился: ' + e.message));
  // фото упражнений для работы без интернета докачиваются в фоне, когда приложение уже открылось
  navigator.serviceWorker.ready.then(r => setTimeout(() => r.active && r.active.postMessage('prefetch'), 4000));
}

// первая отрисовка — когда загружены и модули после app.js (анализ, синхронизация, фото, советы)
document.addEventListener('DOMContentLoaded', () => { render(); drawRest(); });
if (NATIVE && db.settings.updAuto !== false && updOk()) Android.update(updUrl(), false);
