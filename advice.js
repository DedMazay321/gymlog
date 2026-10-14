// Советы, которые применяются кнопкой: правки активной программы (добавить упражнение, ±подход, замена,
// другие повторы) и лёгкая неделя. Каждое действие сначала показывает, что именно изменится,
// а последнее изменение можно отменить.

// Где тренируется человек — по снарядам в программе: от этого зависит, какое упражнение предложить.
function progPlace(p) {
  const eq = new Set(p.days.flatMap(d => d.items.map(i => exById(i.exId).equip)));
  return ['Штанга', 'Тренажёр', 'Блок'].some(e => eq.has(e)) ? 'gym' : ['Гантели', 'Гиря'].some(e => eq.has(e)) ? 'db' : 'body';
}
const PULL_EX = { gym: [14, 11, 13, 185], db: [78, 13, 182], body: [97, 10, 73] };
const ADD_EX = {
  'Грудь': { gym: [0, 3, 9], db: [2, 83], body: [8, 72] }, 'Спина': PULL_EX, 'Плечи': { gym: [34, 33], db: [34, 33], body: [71] },
  'Квадрицепс': { gym: [20, 22], db: [65, 29], body: [67, 69] }, 'Бицепс бедра': { gym: [26, 24], db: [66], body: [108] },
  'Ягодицы': { gym: [30, 107], db: [80, 68], body: [68, 81] }, 'Бицепс': { gym: [40, 41], db: [41, 42], body: [97] },
  'Трицепс': { gym: [48, 49], db: [49, 82], body: [70, 50] }, 'Пресс': { gym: [51, 52], db: [51], body: [51, 53] }, 'Икры': { gym: [27], db: [75], body: [75] },
};
const grpMuscles = g => (AN_GROUPS.find(x => x[0] === g) || [, []])[1];
const inGroup = (exId, g) => exMuscles(exById(exId))[0].some(m => grpMuscles(g).includes(m));
const daySetsOf = (day, groups) => day.items.reduce((a, it) => a + (groups.some(g => inGroup(it.exId, g)) ? it.sets : 0), 0);
function pickEx(list, p) {
  const used = new Set(p.days.flatMap(d => d.items.map(i => i.exId)));
  const ids = list[progPlace(p)].map(i => 'e' + i);
  return ids.find(id => !used.has(id)) || ids[0];
}
const repsFor = exId => exById(exId).kind === 'time' ? 45 : exById(exId).kind === 'cardio' ? 20 : 12;
const maxDay = (p, f) => p.days.reduce((b, d, i) => f(d) > f(p.days[b]) ? i : b, 0);
const minDay = (p, f) => p.days.reduce((b, d, i) => f(d) < f(p.days[b]) ? i : b, 0);

// Действие: { label, plan() → { text, apply } } — text показывается перед применением.
function addExAct(p, label, exId, di) {
  return { label, plan: () => ({ text: `В день «${p.days[di].name}» добавится «${exById(exId).name}» — 3 подхода по ${repsFor(exId)}.`,
    apply: () => p.days[di].items.push({ exId, sets: 3, reps: repsFor(exId), rest: 90 }) }) };
}
function setsAct(p, label, g, delta) {
  return { label, plan: () => {
    const items = p.days.flatMap(d => d.items.map(it => [d, it])).filter(([, it]) => inGroup(it.exId, g) && (delta > 0 ? it.sets < 6 : it.sets > 2));
    if (!items.length) return null;
    return { text: items.map(([d, it]) => `«${exById(it.exId).name}» (${d.name.replace(/^День \d+ · /, '')}): ${it.sets} → ${it.sets + delta} подх.`).join('\n'),
      apply: () => items.forEach(([, it]) => it.sets += delta) };
  } };
}
function groupAct(p, g, low) {
  const has = p.days.some(d => d.items.some(it => inGroup(it.exId, g)));
  if (has) return setsAct(p, `${g}: +1 подход`, g, 1);
  const di = minDay(p, d => d.items.length);
  return addExAct(p, `${g}: добавить упражнение`, pickEx(ADD_EX[g], p), di);
}
const deloadOn = () => db.deload && db.deload.until > Date.now();
const deloadAct = () => deloadOn() ? null : { label: 'Начать лёгкую неделю', plan: () => ({
  text: '7 дней тренировки из программы будут с вдвое меньшим числом подходов, а подсказки весов — около 85% от прошлых. Программа при этом не меняется.',
  apply: () => { db.deload = { from: Date.now(), until: Date.now() + 7 * DAY }; } }) };
const goAct = (label, hash) => ({ label, go: hash });

// Действия к общим советам (по заголовку совета).
function adviceActions(title, ctx) {
  const p = activeProgram();
  const acts = [];
  if (title === 'Перерыв' || title === 'Регулярность' && ctx.warn) acts.push(goAct('Подобрать программу', '#/pick'));
  if (title === 'Общий застой') acts.push(goAct('Выбрать новую программу', '#/catalog'));
  if (title === 'Усталость') acts.push(deloadAct());
  if (title === 'Сон' || title === 'Вес тела' && ctx.warn !== false) acts.push(goAct(title === 'Сон' ? 'Записать сон' : 'Питание и калории', '#/health'));
  if (!p || !p.days.length) return acts.filter(Boolean);
  if (title === 'Баланс жим / тяга') acts.push(addExAct(p, 'Добавить тягу', pickEx(PULL_EX, p), maxDay(p, d => daySetsOf(d, ['Грудь', 'Плечи']))));
  if (title === 'Баланс передней и задней поверхности бедра') acts.push(addExAct(p, 'Добавить упражнение', pickEx(ADD_EX['Бицепс бедра'], p), maxDay(p, d => daySetsOf(d, ['Квадрицепс']))));
  if (title === 'Баланс верх / низ') acts.push(addExAct(p, 'Добавить упражнение на ноги', pickEx(ADD_EX['Квадрицепс'], p), minDay(p, d => daySetsOf(d, ['Квадрицепс', 'Бицепс бедра', 'Ягодицы']))));
  if (title === 'Пропущенные мышцы') (ctx.groups || []).forEach(g => acts.push(addExAct(p, `Добавить: ${g.toLowerCase()}`, pickEx(ADD_EX[g], p), minDay(p, d => d.items.length))));
  if (title === 'Мало подходов') (ctx.groups || []).slice(0, 3).forEach(g => acts.push(groupAct(p, g, true)));
  if (title === 'Много подходов') (ctx.groups || []).slice(0, 3).forEach(g => acts.push(setsAct(p, `${g}: −1 подход`, g, -1)));
  return acts.filter(Boolean);
}
// Действия при застое в конкретном упражнении — только если оно есть в активной программе.
function liftActions(t) {
  const p = activeProgram();
  if (!p || !(t.status === 'flat' || t.status === 'down')) return [];
  const items = p.days.flatMap(d => d.items.filter(it => it.exId === t.ex.id));
  if (!items.length) return t.status === 'down' ? [deloadAct()].filter(Boolean) : [];
  const acts = [];
  if (t.status === 'down') acts.push(deloadAct());
  const alt = similarEx(t.ex);
  if (alt) acts.push({ label: 'Заменить в программе', plan: () => ({ text: `«${t.ex.name}» заменится на «${alt.name}» во всех днях программы. Подходы и повторы останутся прежними.`,
    apply: () => items.forEach(it => it.exId = alt.id) }) });
  // базовым упражнениям — силовой диапазон, изолирующим (без мышц-помощников) — между 8 и 15
  const compound = exMuscles(t.ex)[1].length >= 2, r = items[0].reps;
  const to = compound ? (r >= 8 ? 5 : 10) : (r >= 12 ? 8 : 15);
  if (t.weighted && r) acts.push({ label: `Повторы ${r} → ${to}`, plan: () => ({ text: `В «${t.ex.name}» повторы сменятся с ${r} на ${to}${to < r ? ' — вес можно будет поднять' : ' — вес придётся снизить на 15–20%'}. Новый диапазон даёт мышцам другой стимул.`,
    apply: () => items.forEach(it => it.reps = to) }) });
  return acts.filter(Boolean);
}

let anActs = [], anUndo = null;
// Кнопки действий: регистрируются при отрисовке экрана анализа и вызываются по номеру.
function actBtns(acts) {
  return acts.length ? `<div class="row an-acts">${acts.map(a => `<button class="btn sm" data-a="anAct" data-i="${anActs.push(a) - 1}">${esc(a.label)}</button>`).join('')}</div>` : '';
}
function deloadCard() {
  if (!deloadOn()) return '';
  const left = Math.ceil((db.deload.until - Date.now()) / DAY);
  return `<section class="card an-adv info"><b>🧘 Лёгкая неделя</b><div class="small">Ещё ${left} дн.: подходов вдвое меньше, веса около 85% от прошлых. После неё силы обычно возвращаются с запасом.</div>
    <div class="row an-acts"><button class="btn sm ghost" data-a="deloadStop">Закончить досрочно</button></div></section>`;
}
function undoCard() {
  return anUndo ? `<section class="card an-adv ok"><b>✅ Программа изменена</b><div class="small" style="white-space:pre-line">${esc(anUndo.text)}</div>
    <div class="row an-acts"><a class="btn sm" href="#/program/${anUndo.pid}">Открыть программу</a><button class="btn sm ghost" data-a="anUndo">Отменить</button></div></section>` : '';
}

Object.assign(actions, {
  async anAct(d) {
    const a = anActs[+d.i];
    if (!a) return;
    if (a.go) return go(a.go);
    const pl = a.plan();
    if (!pl) return toast('Менять нечего');
    const ok = await sheet(`<h3>${esc(a.label)}</h3><div class="small" style="white-space:pre-line;line-height:1.5;margin-bottom:14px">${esc(pl.text)}</div>
      <div class="row end"><button class="btn ghost" data-a="sheetClose">Отмена</button><button class="btn primary" data-a="sheetRes" data-v="1">Применить</button></div>`);
    if (!ok) return;
    const p = activeProgram(), before = p ? JSON.stringify(p) : null;
    pl.apply();
    anUndo = p ? { pid: p.id, json: before, text: pl.text } : null;
    save(); render(); toast('Готово');
  },
  anUndo() {
    if (!anUndo) return;
    const i = db.programs.findIndex(p => p.id === anUndo.pid);
    if (i >= 0) db.programs[i] = JSON.parse(anUndo.json);
    anUndo = null; save(); render(); toast('Изменение отменено');
  },
  deloadStop() { delete db.deload; save(); render(); },
});

// Подсказка веса в лёгкую неделю: около 85% от прошлого рабочего веса.
function deloadHint(it, prev) {
  const ex = exById(it.exId), work = prev.filter(s => s.t !== 'w');
  if (ex.kind !== 'wr' || !work.length) return null;
  const top = Math.max(...work.map(s => s.w || 0));
  if (!top) return { text: 'Лёгкая неделя: делайте на 2–3 повтора меньше обычного' };
  const step = ex.equip === 'Гантели' ? 1 : ex.equip === 'Гиря' ? 4 : 2.5, w85 = Math.round(top * .85 / step) * step;
  return { dw: w85 - top, text: `Лёгкая неделя: ${n(w85)} кг (≈85%) и меньше подходов — даём телу восстановиться` };
}
