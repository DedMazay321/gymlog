// Порядок упражнений: изолирующее после базового идёт уже на уставших мышцах (разгибания на трицепс после жима,
// махи после армейского), поэтому его вес нельзя честно сравнивать с днём, когда оно шло первым.
// Предутомление — сколько рабочих подходов на те же мышцы сделано раньше в этой тренировке:
// подход, где эти мышцы основные, считается целиком, где вспомогательные — за половину.

// planned — для идущей тренировки считаем и запланированные, ещё не сделанные подходы упражнений выше по списку.
function preLoad(w, idx, planned) {
  const it = w.items[idx];
  if (!it) return { sets: 0, by: {} };
  const target = exMuscles(exById(it.exId))[0];
  if (!target.length) return { sets: 0, by: {} };
  // если подходы этого упражнения уже отмечены, порядок берём по времени (упражнения могли переставлять)
  const times = it.sets.filter(s => s.done && s.at).map(s => s.at), firstAt = times.length ? Math.min(...times) : null;
  let sum = 0;
  const by = {};
  w.items.forEach((o, j) => {
    if (o === it || o.exId === it.exId) return;
    const ex = exById(o.exId);
    if (ex.kind === 'cardio') return;
    const [p, s] = exMuscles(ex), k = p.some(m => target.includes(m)) ? 1 : s.some(m => target.includes(m)) ? 0.5 : 0;
    if (!k) return;
    let cnt = 0;
    if (firstAt) cnt = o.sets.filter(x => isWork(x) && x.at && x.at < firstAt).length || (j < idx && !o.sets.some(x => x.at) ? o.sets.filter(isWork).length : 0);
    else if (j < idx) cnt = planned ? o.sets.filter(x => x.t !== 'w' && (x.done || !w.end)).length : o.sets.filter(isWork).length;
    if (cnt) { sum += cnt * k; by[o.exId] = (by[o.exId] || 0) + cnt; }
  });
  return { sets: sum, by };
}
const preNames = by => Object.keys(by).map(id => exById(id).name.toLowerCase()).slice(0, 3).join(', ');
// Прошлое выполнение упражнения: тренировка и номер упражнения в ней.
function prevOccurrence(exId, w) {
  const pw = sortedW().find(x => x.end && x.id !== w.id && x.start < w.start && x.items.some(i => i.exId === exId && i.sets.some(s => s.done)));
  return pw ? { w: pw, idx: pw.items.findIndex(i => i.exId === exId) } : null;
}
// Сравнение предутомления сегодня и в прошлый раз (diff > 0 — сегодня мышцы уставшее).
function preCompare(w, idx, planned) {
  const it = w.items[idx], po = prevOccurrence(it.exId, w);
  if (!po) return null;
  const today = preLoad(w, idx, planned), last = preLoad(po.w, po.idx, false);
  return { today, last, diff: today.sets - last.sets };
}
const PRE_GAP = 2;   // разница от двух подходов уже заметно сказывается на весах

// Подсказка веса с учётом порядка: после большей нагрузки на те же мышцы прибавку не предлагаем.
function suggestCtx(w, i, it, prev) {
  return w.end ? suggestOrder(w, i, it, prev) : cycleAdjust(suggestOrder(w, i, it, prev), Date.now());
}
function suggestOrder(w, i, it, prev) {
  const base = suggest(it, prev);
  if (!base || w.end) return base;
  const c = preCompare(w, i, true);
  if (!c) return base;
  const work = prev.filter(s => s.t !== 'w'), top = Math.max(0, ...work.map(s => s.w || 0));
  if (c.diff >= PRE_GAP && (base.dw > 0 || base.dr > 0)) {
    return { text: `Сегодня перед этим упражнением — ${n(c.today.sets)} подх. на те же мышцы (${preNames(c.today.by)}), в прошлый раз — ${n(c.last.sets)}. Прибавлять не стоит: ${top ? `держите ${n(top)} кг` : 'держите прошлые повторы'} — это уже прогресс`, ctx: 'tired' };
  }
  if (c.diff >= PRE_GAP) return { ...base, text: base.text + ` · сегодня перед ним больше работы на те же мышцы (${preNames(c.today.by)}), так что небольшой спад — нормально`, ctx: 'tired' };
  if (c.diff <= -PRE_GAP) return { ...base, text: base.text + ' · сегодня оно идёт на свежие мышцы — должно быть легче, чем в прошлый раз', ctx: 'fresh' };
  return base;
}
