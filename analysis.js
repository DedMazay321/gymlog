// Анализ тренировок: разбор отдельной тренировки, прогресс по упражнениям, объём на мышцы, баланс,
// восстановление и вес тела. Всё считается на устройстве по данным дневника — интернет не нужен.
// Пороговые значения — общепринятые ориентиры для любителей, а не индивидуальный план тренера.

const rm1 = s => (s.w || 0) * (1 + (s.r || 0) / 30);   // расчётный 1ПМ по формуле Эпли
const pct = (a, b) => b ? (a - b) / b * 100 : 0;
const fmtPct = v => (v > 0 ? '+' : v < 0 ? '−' : '') + n(Math.abs(+v.toFixed(1))) + '%';
const daysAgo = ts => Math.floor((Date.now() - ts) / DAY);
const agoTxt = d => d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} дн. назад`;
const topSet = sets => sets.reduce((a, s) => rm1(s) > rm1(a) ? s : a, sets[0]);

// Группы мышц для подсчёта объёма: [название, мышцы, нижняя и верхняя граница подходов в неделю].
const AN_GROUPS = [
  ['Грудь', ['chest'], 10, 20], ['Спина', ['lats', 'middle back'], 10, 20], ['Плечи', ['shoulders'], 8, 20],
  ['Квадрицепс', ['quadriceps'], 8, 18], ['Бицепс бедра', ['hamstrings'], 6, 16], ['Ягодицы', ['glutes', 'abductors'], 6, 18],
  ['Бицепс', ['biceps'], 6, 16], ['Трицепс', ['triceps'], 6, 16], ['Пресс', ['abdominals'], 4, 16], ['Икры', ['calves'], 4, 16],
];
// Подход идёт в группу целиком, если она среди основных мышц упражнения, и наполовину — если среди вспомогательных.
function groupSets(from, to) {
  const v = Object.fromEntries(AN_GROUPS.map(g => [g[0], 0]));
  finished().filter(w => w.start >= from && w.start < to).forEach(w => w.items.forEach(it => {
    const ex = exById(it.exId);
    if (ex.kind === 'cardio') return;
    const c = it.sets.filter(isWork).length, [pri, sec] = exMuscles(ex);
    AN_GROUPS.forEach(([name, ms]) => {
      if (ms.some(m => pri.includes(m))) v[name] += c;
      else if (ms.some(m => sec.includes(m))) v[name] += c / 2;
    });
  }));
  return v;
}

// Прошлая похожая тренировка: тот же день той же программы, иначе — с тем же названием.
function prevComparable(w) {
  return sortedW().find(x => x.end && x.id !== w.id && x.start < w.start &&
    (w.pid && x.pid === w.pid && x.di === w.di || (!w.pid || x.pid !== w.pid) && x.name === w.name)) || null;
}

/* ---------- разбор одной тренировки ---------- */
function workoutReport(w) {
  const prev = prevComparable(w), st = wStats(w), ps = prev && wStats(prev);
  const rows = [], good = [], bad = [], next = [];
  w.items.forEach(it => {
    const ex = exById(it.exId), work = it.sets.filter(isWork);
    if (ex.kind !== 'wr' || !work.length || rows.some(r => r.ex.id === ex.id)) return;
    const before = prevSets(ex.id, w.id, w.start).filter(s => s.t !== 'w');
    const top = topSet(work), rm = rm1(top), vol = work.reduce((a, s) => a + (s.w || 0) * (s.r || 0), 0);
    const pTop = before.length ? topSet(before) : null, pRm = pTop ? rm1(pTop) : 0;
    const pVol = before.reduce((a, s) => a + (s.w || 0) * (s.r || 0), 0);
    const bestW = bestBefore(ex.id, w.start), rec = bestW > 0 && top.w > bestW;
    let bestRm = 0;
    finished().forEach(x => { if (x.start < w.start) x.items.forEach(i => { if (i.exId === ex.id) i.sets.filter(isWork).forEach(s => bestRm = Math.max(bestRm, rm1(s))); }); });
    const recRm = !rec && bestRm > 0 && rm > bestRm + 0.01;
    // когда весов нет (подтягивания, отжимания) — сравниваем сумму повторов
    const reps = work.reduce((a, s) => a + (s.r || 0), 0), pReps = before.reduce((a, s) => a + (s.r || 0), 0);
    const d = !pTop ? null : rm || pRm ? pct(rm, pRm) : pct(reps, pReps);
    const plan = it.planR ? work.filter(s => !s.t && (s.r || 0) >= it.planR).length + '/' + work.filter(s => !s.t).length : '';
    const hard = work.some(s => s.f === 3), easy = work.every(s => s.f === 1);
    rows.push({ ex, top, rm, vol, d, rec, recRm, plan, hard, easy });
    if (rec) good.push(`🏆 ${ex.name}: рекорд веса — ${n(top.w)} кг`);
    else if (recRm) good.push(`🏆 ${ex.name}: лучший расчётный 1ПМ — ${n(+rm.toFixed(1))} кг`);
    else if (d != null && d >= 2) good.push(`▲ ${ex.name}: ${fmtPct(d)} к прошлому разу`);
    if (d != null && d <= -5) bad.push(`▼ ${ex.name}: ${fmtPct(d)} к прошлому разу${hard ? ', и подходы дались тяжело' : ''}`);
    const sg = suggest({ ...it, exId: ex.id }, work);
    if (sg) next.push(`${ex.name}: ${sg.text.replace(/^Сегодня(:| —)?\s*/, '').replace(/^./, c => c.toUpperCase())}`);
  });
  // реальный отдых между подходами — по времени отметки подходов (записывается с версии 1.23)
  const rests = [];
  w.items.forEach(it => {
    const t = it.sets.filter(s => s.done && s.at).map(s => s.at);
    for (let i = 1; i < t.length; i++) { const r = (t[i] - t[i - 1]) / 1000; if (r > 10 && r < 900) rests.push({ r, plan: it.rest || db.settings.rest }); }
  });
  let rest = null;
  if (rests.length >= 3) {
    const avg = rests.reduce((a, x) => a + x.r, 0) / rests.length, plan = rests.reduce((a, x) => a + x.plan, 0) / rests.length;
    rest = { avg: Math.round(avg), plan: Math.round(plan) };
    if (avg > plan * 1.5 && avg - plan > 45) bad.push(`⏱ Отдых в среднем ${fmtSec(avg)} при плане ${fmtSec(plan)} — тренировка затягивается`);
  }
  const sl = db.sleep && db.sleep[isoDay(w.start)] || db.sleep && db.sleep[isoDay(w.start - DAY)];
  if (bad.length && sl && sl < 6.5) bad.push(`😴 Сон перед тренировкой — ${n(sl)} ч: недосып заметно снижает силовые`);
  return { prev, st, ps, rows, good, bad, next, rest };
}
const fmtSec = s => { s = Math.round(s); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : s + ' с'; };

function workoutReportHtml(w) {
  const r = workoutReport(w);
  if (!r.rows.length && !r.st.sets) return '';
  const cmp = (a, b, unit) => r.prev ? `<div class="small" style="margin-top:4px">${dl(a - b, unit)}</div>` : '';
  const done = r.rows.filter(x => x.d != null), up = done.filter(x => x.d >= 1 || x.rec || x.recRm).length;
  return `<h2>Разбор тренировки</h2>
  <section class="card">
    <div class="muted small" style="margin-bottom:8px">${r.prev ? `Сравнение с «${esc(r.prev.name)}» от ${fmtDate(r.prev.start)}` : 'Это первая такая тренировка — сравнивать пока не с чем.'}</div>
    <div class="tiles">
      <div class="tile"><b>${tons(r.st.ton)}</b><span>тоннаж</span>${cmp(Math.round(r.st.ton), Math.round(r.ps ? r.ps.ton : 0), 'кг')}</div>
      <div class="tile"><b>${r.st.sets}</b><span>подходов</span>${cmp(r.st.sets, r.ps ? r.ps.sets : 0)}</div>
      <div class="tile"><b>${Math.round((w.end - w.start) / 60000)}</b><span>минут</span>${r.prev ? cmp(Math.round((w.end - w.start) / 60000), Math.round((r.prev.end - r.prev.start) / 60000), 'мин') : ''}</div>
    </div>
    ${done.length ? `<div class="small" style="margin-bottom:6px"><b>Прогресс в ${up} из ${done.length}</b> упражнений по сравнению с прошлым разом.</div>` : ''}
    ${r.rows.length ? `<div class="an-table">${r.rows.map(x => `<div class="an-row">
      <span class="grow">${esc(x.ex.name)}${x.plan ? ` <span class="muted small">· план ${x.plan}</span>` : ''}</span>
      <span class="muted small">${setTxt(x.top, 'wr')}</span>
      <span class="an-d">${x.rec || x.recRm ? '<span class="up">🏆</span>' : x.d == null ? '<span class="muted">новое</span>' : x.d >= 1 ? `<span class="up">▲ ${fmtPct(x.d)}</span>` : x.d <= -1 ? `<span class="down">▼ ${fmtPct(x.d)}</span>` : '<span class="muted">=</span>'}</span></div>`).join('')}</div>
      <div class="muted small" style="margin-top:6px">Процент — изменение расчётного 1ПМ лучшего подхода (без веса — суммы повторов).</div>` : ''}
    ${r.rest ? `<div class="small" style="margin-top:8px">⏱ Средний отдых: ${fmtSec(r.rest.avg)} (план ${fmtSec(r.rest.plan)})</div>` : ''}
  </section>
  ${miniFor(w).length ? `<section class="card"><b>Мини-достижения</b>${miniHtml(miniFor(w))}</section>` : ''}
  ${r.good.length ? `<section class="card"><b>Что получилось</b>${r.good.map(t => `<div class="small an-li">${esc(t)}</div>`).join('')}</section>` : ''}
  ${r.bad.length ? `<section class="card"><b>На что обратить внимание</b>${r.bad.map(t => `<div class="small an-li">${esc(t)}</div>`).join('')}
    ${r.bad.some(t => t.startsWith('▼')) ? `<div class="muted small" style="margin-top:6px">Разовый спад — это нормально: сон, питание, стресс. Если он повторяется 2–3 тренировки подряд — смотрите «Анализ и советы».</div>` : ''}</section>` : ''}
  ${r.next.length ? `<section class="card"><b>В следующий раз</b>${r.next.map(t => `<div class="small an-li">${esc(t)}</div>`).join('')}</section>` : ''}`;
}

/* ---------- прогресс по упражнениям ---------- */
function liftTrends() {
  const since = Date.now() - 90 * DAY, count = {};
  finished().filter(w => w.start >= since).forEach(w => new Set(w.items.filter(it => exById(it.exId).kind === 'wr' && it.sets.some(isWork)).map(it => it.exId)).forEach(id => count[id] = (count[id] || 0) + 1));
  return Object.entries(count).filter(c => c[1] >= 3).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => {
    const ex = exById(id), ser = sessions(id).filter(p => p.w.end), last = ser[ser.length - 1];
    const weighted = ser.some(p => p.a > 0), val = p => weighted ? p.rm : p.b;   // без веса — лучший подход по повторам
    let best = 0, bestAt = 0, prIdx = 0;
    ser.forEach((p, i) => { if (val(p) > best + 0.01) { best = val(p); bestAt = p.t; prIdx = i; } });
    const old = [...ser].reverse().find(p => p.t <= Date.now() - 28 * DAY) || ser[0];
    const change = pct(val(last), val(old)), since = ser.length - 1 - prIdx;
    const lastSets = last.sets, tail = ser.slice(-2);
    const easy = tail.length === 2 && tail.every(p => p.sets.every(s => s.f === 1));
    const hard = tail.length === 2 && tail.every(p => p.sets.some(s => s.f === 3));
    let status = 'up', tip = '';
    if (val(last) < best * 0.93 && tail.every(p => val(p) < best * 0.95)) {
      status = 'down';
      tip = 'Результат ниже лучшего две тренировки подряд. Проверьте сон и питание; если всё в порядке — сделайте лёгкую неделю.';
    } else if (since >= 3 && daysAgo(bestAt) >= 21) {
      status = 'flat';
      const alt = similarEx(ex);
      tip = [`Без улучшения уже ${since} трен. (${Math.round(daysAgo(bestAt) / 7)} нед.).`,
        weighted ? 'Варианты: снизьте вес на 10% и за 2–3 недели вернитесь к рекорду; смените диапазон повторов (например, с 8–10 на 5–6 или 12–15)'
          : 'Варианты: добавьте отягощение или усложните вариант упражнения; смените темп — медленное опускание за 3 секунды',
        alt ? `или замените на ${/^«/.test(alt.name) ? alt.name : `«${alt.name}»`} на 4–6 недель.` : '.'].join(' ').replace(' .', '.');
    } else if (easy) {
      status = 'ready'; tip = 'Две тренировки подряд все подходы даются легко — смело прибавляйте вес.';
    } else if (hard && change <= 0) {
      status = 'flat'; tip = 'Последние тренировки даются тяжело, а результат не растёт — закрепите текущий вес, не спешите прибавлять.';
    } else if (change < 1) status = 'flat';
    return { ex, ser, last, best, change, status, tip, weighted, lastSets };
  });
}
// Самый похожий вариант для смены упражнения при застое: то же движение по набору мышц, тот же снаряд, та же группа.
function similarEx(ex) {
  const [p0, s0] = exMuscles(ex), all0 = new Set([...p0, ...s0]);
  const score = e => {
    const [p, sc] = exMuscles(e), all = new Set([...p, ...sc]);
    const inter = [...all].filter(m => all0.has(m)).length, jac = inter / (new Set([...all, ...all0]).size || 1);
    return jac * 4 + (e.equip === ex.equip ? 1.5 : 0) + (e.muscle === ex.muscle ? 1 : 0) + (+e.id.slice(1) < 160 ? 0.5 : 0);
  };
  const list = analogsOf(ex).filter(e => !e.custom && e.muscle === ex.muscle);
  return list.sort((a, b) => score(b) - score(a))[0] || null;
}
const AN_ST = { up: ['▲ растёт', 'up'], ready: ['⏫ пора прибавить', 'up'], flat: ['= на месте', 'muted'], down: ['▼ просел', 'down'] };

/* ---------- общие советы ---------- */
function adviceList() {
  const out = [], fin = finished(), now = Date.now();
  if (!fin.length) return out;
  const first = Math.min(...fin.map(w => w.start)), weeks = Math.max(1, Math.min(4, (now - first) / (7 * DAY)));
  const recent = fin.filter(w => w.start >= now - 28 * DAY), perWeek = recent.length / weeks;
  const last = sortedW().find(w => w.end), gap = daysAgo(last.end);
  const ap = activeProgram(), planned = ap ? ap.days.length : 0;
  // регулярность
  if (gap >= 8) out.push(['warn', 'Перерыв', `Последняя тренировка была ${agoTxt(gap)}. После перерыва больше недели начните с весов на 10–20% ниже прежних.`]);
  if (planned && recent.length >= 2 && perWeek < planned - 0.8) out.push(['warn', 'Регулярность', `В среднем ${n(+perWeek.toFixed(1))} трен./нед. при ${planned} в программе. Если не успеваете — возьмите программу на меньшее число дней: регулярность важнее объёма.`, { warn: true }]);
  else if (recent.length >= 3 && perWeek >= 2) out.push(['ok', 'Регулярность', `${n(+perWeek.toFixed(1))} трен./нед. за последний месяц — хороший ритм.`]);
  // объём на мышцы
  if (recent.length >= 3) {
    const v = groupSets(now - weeks * 7 * DAY, now), per = k => v[k] / weeks;
    const low = AN_GROUPS.filter(([k, , lo]) => per(k) > 0 && per(k) < lo * 0.6), none = AN_GROUPS.filter(([k]) => ['Грудь', 'Спина', 'Квадрицепс'].includes(k) && !per(k));
    const high = AN_GROUPS.filter(([k, , , hi]) => per(k) > hi + 5);
    if (none.length) out.push(['warn', 'Пропущенные мышцы', `За последние недели нет нагрузки на: ${none.map(g => g[0].toLowerCase()).join(', ')}. Добавьте хотя бы одно упражнение на них.`, { groups: none.map(g => g[0]) }]);
    if (low.length) out.push(['info', 'Мало подходов', low.map(([k, , lo, hi]) => `${k} — ${n(+per(k).toFixed(1))} в нед. (для роста обычно ${lo}–${hi})`).join('; ') + '.', { groups: low.map(g => g[0]) }]);
    if (high.length) out.push(['info', 'Много подходов', high.map(([k, , , hi]) => `${k} — ${n(+per(k).toFixed(1))} в нед. (больше ${hi} редко даёт прибавку и мешает восстановлению)`).join('; ') + '.', { groups: high.map(g => g[0]) }]);
    const push = per('Грудь') + per('Плечи') * 0.5, pull = per('Спина');
    if (push >= 6 && pull < push / 1.5) out.push(['warn', 'Баланс жим / тяга', `Жимов примерно в ${n(+(push / Math.max(pull, 1)).toFixed(1))} раза больше, чем тяг. Добавьте тяги — это бережёт плечи и осанку.`]);
    const legs = per('Квадрицепс') + per('Бицепс бедра') + per('Ягодицы'), all = AN_GROUPS.reduce((a, [k]) => a + per(k), 0);
    if (all >= 20 && legs / all < 0.2) out.push(['info', 'Баланс верх / низ', `На ноги приходится только ${Math.round(legs / all * 100)}% подходов. Ноги — самые крупные мышцы, их стоит тренировать не реже верха.`]);
    if (per('Квадрицепс') >= 6 && per('Бицепс бедра') < per('Квадрицепс') / 3) out.push(['info', 'Баланс передней и задней поверхности бедра', 'Задняя поверхность бедра заметно отстаёт от квадрицепса — добавьте румынскую тягу или сгибания ног.']);
  }
  // усталость
  const lastFeel = sortedW().filter(w => w.end).slice(0, 3);
  const trends = liftTrends(), down = trends.filter(t => t.status === 'down');
  if (lastFeel.length === 3 && lastFeel.every(w => w.feel === 3)) out.push(['warn', 'Усталость', 'Три последние тренировки — «тяжело». Сделайте лёгкую неделю: те же упражнения, но вдвое меньше подходов и вес на 10–15% ниже.']);
  else if (down.length >= 2) out.push(['warn', 'Усталость', `Просели сразу несколько упражнений (${down.map(t => t.ex.name).join(', ')}). Это похоже на накопленную усталость — нужна лёгкая неделя или больше сна.`]);
  const flat = trends.filter(t => t.status === 'flat'), upN = trends.filter(t => t.status === 'up' || t.status === 'ready').length;
  if (trends.length >= 3 && upN >= trends.length * 0.6) out.push(['ok', 'Прогресс', `Растут ${upN} из ${trends.length} основных упражнений — программа работает, ничего не меняйте.`]);
  else if (trends.length >= 3 && flat.length >= trends.length * 0.6) out.push(['warn', 'Общий застой', 'Большинство упражнений стоит на месте. Если программа выполняется больше 8–10 недель — пора её сменить или изменить диапазон повторов.']);
  // сон
  const sleep = lastDays(7, db.sleep).filter(s => s.v);
  if (sleep.length >= 3) {
    const avg = sleep.reduce((a, s) => a + s.v, 0) / sleep.length;
    if (avg < 7) out.push(['warn', 'Сон', `В среднем ${n(+avg.toFixed(1))} ч за неделю. Меньше 7 часов — медленнее восстановление и рост силы.`]);
  }
  // вес тела и цель
  const wts = db.measures.filter(m => m.type === 'weight' && m.date >= now - 35 * DAY).sort((a, b) => a.date - b.date);
  if (wts.length >= 2 && wts[wts.length - 1].date - wts[0].date >= 14 * DAY) {
    const a = wts[0], b = wts[wts.length - 1], rate = (b.value - a.value) / ((b.date - a.date) / (7 * DAY)), goal = profile().goal;
    const r = `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${n(Math.abs(+rate.toFixed(2)))} кг в неделю`;
    if (goal === 'gain' && rate < 0.1) out.push(['info', 'Вес тела', `Вес почти не меняется (${r}), а цель — набор. Добавьте 200–300 ккал в день.`]);
    else if (goal === 'gain' && rate > 0.5) out.push(['info', 'Вес тела', `Вес растёт быстро (${r}) — вероятно, в основном за счёт жира. Уберите 150–200 ккал.`]);
    else if (goal === 'loss' && rate > -0.2) out.push(['info', 'Вес тела', `Вес почти не снижается (${r}). Проверьте калории — нужен дефицит 300–500 ккал.`]);
    else if (goal === 'loss' && rate < -b.value * 0.01) out.push(['warn', 'Вес тела', `Вес уходит слишком быстро (${r}) — так теряются и мышцы. Оптимально 0,5–1% веса в неделю.`]);
    else out.push(['ok', 'Вес тела', `Изменение веса — ${r}, это соответствует вашей цели.`, { warn: false }]);
  }
  return out;
}
const AN_IC = { ok: '✅', info: '💡', warn: '⚠️' };

/* ---------- экран «Анализ и советы» ---------- */
function pgAnalysis() {
  const fin = finished();
  const head = `<header class="top"><a class="ic" href="#/progress">‹</a><h1>Анализ и советы</h1></header>`;
  if (fin.length < 2) return head + `<div class="empty">Нужно хотя бы 2 завершённые тренировки — после них здесь появится разбор прогресса и советы.</div>`;
  anActs = [];
  const adv = adviceList(), tr = liftTrends(), now = Date.now();
  const weeks = Math.max(1, Math.min(4, (now - Math.min(...fin.map(w => w.start))) / (7 * DAY))), v = groupSets(now - weeks * 7 * DAY, now);
  const lastW = sortedW().find(w => w.end);
  return head + `<div class="an-grid"><div>
  <h2>Советы</h2>
  ${undoCard()}${deloadCard()}
  ${adv.map(([k, t, x, ctx]) => `<section class="card an-adv ${k}"><b>${AN_IC[k]} ${t}</b><div class="small">${esc(x)}</div>${actBtns(adviceActions(t, ctx || {}))}</section>`).join('')
    || `<section class="card"><div class="small">Явных проблем не видно — продолжайте в том же духе.</div></section>`}
  <h2>Подходов в неделю на мышцы</h2>
  <section class="card">${AN_GROUPS.map(([k, , lo, hi]) => {
    const x = v[k] / weeks, w = Math.min(100, x / (hi + 5) * 100), cls = x < lo * 0.6 ? 'lo' : x > hi + 5 ? 'hi' : 'ok';
    return `<div class="bar-row an-vol"><span>${k}</span><div class="bar"><em style="left:${lo / (hi + 5) * 100}%;width:${(hi - lo) / (hi + 5) * 100}%"></em><i class="${cls}" style="width:${w}%"></i></div><b>${n(+x.toFixed(1))}</b></div>`;
  }).join('')}
    <div class="muted small" style="margin-top:6px">Среднее за ${weeks >= 4 ? '4 недели' : 'период с первой тренировки'}. Светлая полоса — обычный диапазон для роста. Вспомогательные мышцы считаются за полподхода.</div></section>
  </div><div>
  <h2>Основные упражнения</h2>
  ${tr.length ? tr.map(t => `<section class="card an-lift">
    <div class="ex-head"><a class="grow" href="#/exercise/${t.ex.id}"><b>${esc(t.ex.name)}</b></a><span class="${AN_ST[t.status][1]} small">${AN_ST[t.status][0]}</span></div>
    <div class="muted small">Последний раз ${agoTxt(daysAgo(t.last.t))}: ${t.lastSets.map(s => setTxt(s, 'wr')).join(' · ')}</div>
    <div class="small" style="margin-top:4px">${t.weighted ? `1ПМ ≈ ${n(+t.last.rm.toFixed(1))} кг · рекорд ${n(+t.best.toFixed(1))} кг` : `лучший подход ${t.last.b} повт. · рекорд ${t.best}`} · за 4 нед. ${fmtPct(t.change)}</div>
    ${t.tip ? `<div class="hint">${esc(t.tip)}</div>` : ''}${actBtns(liftActions(t))}</section>`).join('')
    : `<section class="card"><div class="small muted">Упражнение попадёт сюда, когда будет выполнено хотя бы 3 раза за последние 3 месяца.</div></section>`}
  ${lastW ? `<a class="card link award" href="#/workout/${lastW.id}"><div class="aw-ic">🔍</div><div class="grow"><b>Разбор последней тренировки</b>
    <div class="muted small">${esc(lastW.name)} · ${fmtDate(lastW.start)}</div></div><span class="muted">›</span></a>` : ''}
  <h2>Обсудить с ИИ</h2>
  <section class="card"><div class="small">Соберу сводку за последние 8 недель в текст. Вставьте его в чат с ИИ-ассистентом (например, Claude) и задайте вопросы о своём прогрессе.</div>
    <div class="row"><button class="btn sm primary" data-a="anCopy">Скопировать отчёт</button><button class="btn sm" data-a="anSave">Сохранить файлом</button></div>
    <div class="muted small" style="margin-top:8px">Отчёт содержит только тренировки, вес и сон — без имени. Отправляется туда, куда вы его вставите сами.</div></section>
  </div></div>
  <div class="muted small" style="margin:6px 2px 16px">Советы рассчитаны по общим ориентирам для любителей. Это не замена тренеру и врачу.</div>`;
}

/* ---------- отчёт для ИИ ---------- */
const yearsWord = a => a % 10 === 1 && a % 100 !== 11 ? 'год' : [2, 3, 4].includes(a % 10) && ![12, 13, 14].includes(a % 100) ? 'года' : 'лет';
function aiReport() {
  const now = Date.now(), from = now - 56 * DAY, p = profile(), fin = finished().filter(w => w.start >= from).sort((a, b) => a.start - b.start);
  const GOAL = { loss: 'похудение', gain: 'набор массы', keep: 'поддержание формы' };
  const d = ts => new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  const L = [];
  L.push('Проанализируй мои тренировки за последние 8 недель: что растёт, что стоит на месте, есть ли перекосы в нагрузке и признаки усталости. Дай конкретные советы на следующие 2–4 недели.', '');
  L.push(`Профиль: ${p.sex === 'f' ? 'женщина' : 'мужчина'}, ${p.age} ${yearsWord(p.age)}, рост ${p.height} см, вес ${n(p.weight)} кг, цель — ${GOAL[p.goal] || p.goal}.`);
  const ap = activeProgram();
  if (ap) L.push(`Программа: «${ap.name}», ${ap.days.length} дн./нед.: ${ap.days.map(x => x.name).join('; ')}.`);
  L.push(`Тренировок за 8 недель: ${fin.length}.`, '', 'ТРЕНИРОВКИ (подходы: вес×повторы; Р — разминка, О — до отказа, Д — дроп-сет; оценка: легко/нормально/тяжело)');
  fin.forEach(w => {
    L.push(`${d(w.start)} «${w.name}», ${Math.round((w.end - w.start) / 60000)} мин${w.feel ? ', ' + FEEL[w.feel][0] : ''}`);
    w.items.forEach(it => {
      const ex = exById(it.exId);
      L.push(`  ${ex.name}: ${it.sets.filter(s => s.done).map(s => (s.t ? SET_TYPES[s.t][1] + ' ' : '') + setTxt(s, ex.kind) + (s.f ? ` (${FEEL[s.f][0]})` : '')).join(', ')}${it.planR ? ` [план ${it.planR} повт.]` : ''}`);
    });
  });
  const weeks = Math.max(1, Math.min(4, (now - Math.min(...finished().map(w => w.start))) / (7 * DAY))), v = groupSets(now - weeks * 7 * DAY, now);
  L.push('', 'ПОДХОДОВ В НЕДЕЛЮ НА МЫШЦЫ (среднее за 4 недели): ' + AN_GROUPS.map(([k]) => `${k} ${n(+(v[k] / weeks).toFixed(1))}`).join(', '));
  const wts = db.measures.filter(m => m.type === 'weight' && m.date >= from).sort((a, b) => a.date - b.date);
  if (wts.length) L.push('ВЕС ТЕЛА: ' + wts.map(m => `${d(m.date)} ${n(m.value)} кг`).join(', '));
  const sl = lastDays(14, db.sleep).filter(s => s.v);
  if (sl.length) L.push(`СОН за 2 недели: в среднем ${n(+(sl.reduce((a, s) => a + s.v, 0) / sl.length).toFixed(1))} ч`);
  const adv = adviceList();
  if (adv.length) L.push('', 'Автоматические выводы приложения: ' + adv.map(a => `${a[1]} — ${a[2]}`).join(' '));
  return L.join('\n');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* в некоторых WebView буфер недоступен — пробуем по-старому */ }
  const t = document.createElement('textarea');
  t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { /* не вышло */ }
  t.remove();
  return ok;
}
