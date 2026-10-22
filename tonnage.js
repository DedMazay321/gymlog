// Тоннаж — сумма «вес × повторы» в рабочих подходах (разминка не считается) — за тренировку, неделю и месяц,
// и мини-достижения: личные рекорды по тоннажу. Мини-достижения не хранятся, а каждый раз выводятся из истории,
// поэтому после правки или удаления тренировки они пересчитываются сами.

const setTon = s => (s.w || 0) * (s.r || 0);
const tonsShort = kg => kg >= 1000 ? n(+(kg / 1000).toFixed(kg >= 1e5 ? 0 : 2)) + ' т' : n(Math.round(kg)) + ' кг';
// изменение в тоннах: ▲ +1,2 т / ▼ −850 кг
const tonDiff = d => Math.abs(d) < 1 ? '<span class="muted">=</span>' : `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲ +' : '▼ −'}${tonsShort(Math.abs(d))}</span>`;
const tonAxis = v => v >= 1000 ? n(+(v / 1000).toFixed(1)) + ' т' : n(Math.round(v)) + ' кг';
const TON_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const isWr = it => exById(it.exId).kind === 'wr';

// Мини-достижения по всей истории: { wid → [{ icon, text, kind }] } и общий список по времени.
function tonEvents() {
  const byW = {}, all = [];
  let bestW = 0, bestSet = 0, total = 0, bestWeek = 0, bestMonth = 0, curWeek = null, curMonth = null, weekSum = 0, monthSum = 0, weekFlag = false, monthFlag = false;
  const bestEx = {}, bestSetEx = {}, bestG = {}, female = isFemale();
  [...finished()].sort((a, b) => a.start - b.start).forEach(w => {
    const list = [], push = (icon, text, kind) => list.push({ icon, text, kind });
    const t = wStats(w).ton;
    if (!t) return;
    // рекорды отмечаем, только когда есть с чем сравнить
    if (bestW && t > bestW) push('🚚', `Рекорд тоннажа за тренировку: ${tonsShort(t)} (было ${tonsShort(bestW)})`, 'workout');
    bestW = Math.max(bestW, t);
    let top = null;
    const exVol = {};
    w.items.filter(isWr).forEach(it => it.sets.filter(isWork).forEach(s => {
      const v = setTon(s);
      exVol[it.exId] = (exVol[it.exId] || 0) + v;
      if (!top || v > top.v) top = { v, s, ex: it.exId };
      if (bestSetEx[it.exId] && v > bestSetEx[it.exId] && !list.some(x => x.kind === 'set' && x.ex === it.exId))
        list.push({ icon: '💥', text: `Лучший подход по тоннажу в «${exById(it.exId).name}»: ${n(s.w)}×${n(s.r)} = ${tonsShort(v)}`, kind: 'set', ex: it.exId });
    }));
    w.items.filter(isWr).forEach(it => it.sets.filter(isWork).forEach(s => { bestSetEx[it.exId] = Math.max(bestSetEx[it.exId] || 0, setTon(s)); }));
    if (top && bestSet && top.v > bestSet) {
      const i = list.findIndex(x => x.kind === 'set' && x.ex === top.ex);
      if (i >= 0) list.splice(i, 1);
    }
    if (top && bestSet && top.v > bestSet) push('🏋️', `Самый тяжёлый подход за всё время: ${exById(top.ex).name} ${n(top.s.w)}×${n(top.s.r)} = ${tonsShort(top.v)}`, 'topset');
    if (top) bestSet = Math.max(bestSet, top.v);
    Object.entries(exVol).forEach(([id, v]) => {
      if (bestEx[id] && v > bestEx[id] * 1.001) push('📈', `${exById(id).name}: рекорд объёма за тренировку — ${tonsShort(v)} (было ${tonsShort(bestEx[id])})`, 'exvol');
      bestEx[id] = Math.max(bestEx[id] || 0, v);
    });
    // неделя и месяц: отмечаем момент, когда сумма впервые превысила лучший прошлый период
    const wk = weekStart(w.start), d = new Date(w.start), mo = d.getFullYear() * 12 + d.getMonth();
    if (wk !== curWeek) { bestWeek = Math.max(bestWeek, weekSum); curWeek = wk; weekSum = 0; weekFlag = false; }
    if (mo !== curMonth) { bestMonth = Math.max(bestMonth, monthSum); curMonth = mo; monthSum = 0; monthFlag = false; }
    weekSum += t; monthSum += t;
    if (bestWeek && !weekFlag && weekSum > bestWeek) { weekFlag = true; push('📅', `Лучшая неделя по тоннажу: уже ${tonsShort(weekSum)} (прежний рекорд ${tonsShort(bestWeek)})`, 'week'); }
    if (bestMonth && !monthFlag && monthSum > bestMonth) { monthFlag = true; push('🗓️', `Лучший месяц по тоннажу: уже ${tonsShort(monthSum)} (прежний рекорд ${tonsShort(bestMonth)})`, 'month'); }
    const before = total;
    total += t;
    TON_MILESTONES.forEach(m => { if (before < m * 1000 && total >= m * 1000) push('⚖️', `Всего поднято ${n(m)} т`, 'total'); });
    if (female) w.items.filter(it => isGlute(it.exId) && isWr(it)).forEach(it => {
      const top = Math.max(0, ...it.sets.filter(isWork).map(s => s.w || 0));
      if (bestG[it.exId] && top > bestG[it.exId] && !list.some(x => x.kind === 'glute' && x.ex === it.exId)) list.push({ icon: '🍑', text: `Ягодицы: рекорд в «${exById(it.exId).name}» — ${n(top)} кг (было ${n(bestG[it.exId])})`, kind: 'glute', ex: it.exId });
      bestG[it.exId] = Math.max(bestG[it.exId] || 0, top);
    });
    const ORDER = ['workout', 'glute', 'week', 'month', 'total', 'topset', 'set', 'exvol'];
    list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    if (list.length) { byW[w.id] = list; all.push(list.map(e => ({ ...e, w }))); }
  });
  // all — по тренировкам от новых к старым, внутри тренировки — по важности
  return { byW, all: all.reverse().flat() };
}
const miniFor = w => tonEvents().byW[w.id] || [];
const miniHtml = list => list.map(e => `<div class="mini"><span>${e.icon}</span><div class="small">${esc(e.text)}</div></div>`).join('');

// Суммы по периодам.
function tonPeriod(kind, off) {
  const r = period(kind, off);
  return finished().filter(w => w.start >= r[0] && w.start < r[1]).reduce((a, w) => a + wStats(w).ton, 0);
}
let tonView = 'week';
function pgTonnage() {
  const fin = finished(), head = `<header class="top"><a class="ic" href="#/progress">‹</a><h1>Тоннаж</h1></header>`;
  if (!fin.some(w => wStats(w).ton)) return head + `<div class="empty">Тоннаж — это сумма «вес × повторы» во всех рабочих подходах. Он появится после первой тренировки с весами.</div>`;
  const act = activeW(), lastW = act || sortedW().find(w => w.end), lw = lastW ? wStats(lastW).ton : 0;
  const wk = tonPeriod('week', 0), pwk = tonPeriod('week', 1), mo = tonPeriod('month', 0), pmo = tonPeriod('month', 1);
  const total = fin.reduce((a, w) => a + wStats(w).ton, 0);
  const sorted = [...fin].sort((a, b) => a.start - b.start), withTon = sorted.filter(w => wStats(w).ton);
  // график: по тренировкам — последние 15, по неделям и месяцам — 12 периодов
  let pts;
  if (tonView === 'workout') pts = withTon.slice(-15).map(w => ({ v: Math.round(wStats(w).ton), label: `${fmtDate(w.start)} · ${w.name}`, short: new Date(w.start).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) }));
  else pts = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(i => {
    const r = period(tonView, i), d0 = new Date(r[0]), d1 = new Date(r[1] - DAY);
    const short = tonView === 'week' ? d0.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : d0.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
    return { v: Math.round(tonPeriod(tonView, i)), short, label: tonView === 'week' ? `${short} – ${d1.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : d0.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) };
  });
  // рекорды
  const bestW = withTon.reduce((a, w) => wStats(w).ton > (a ? wStats(a).ton : 0) ? w : a, null);
  const weeks = {}, months = {};
  withTon.forEach(w => { const t = wStats(w).ton, k = weekStart(w.start), d = new Date(w.start), m = d.getFullYear() * 12 + d.getMonth(); weeks[k] = (weeks[k] || 0) + t; months[m] = (months[m] || 0) + t; });
  const bestWk = Object.entries(weeks).sort((a, b) => b[1] - a[1])[0], bestMo = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
  let topSet = null;
  withTon.forEach(w => w.items.filter(isWr).forEach(it => it.sets.filter(isWork).forEach(s => { if (!topSet || setTon(s) > topSet.v) topSet = { v: setTon(s), s, ex: it.exId, w }; })));
  // откуда тоннаж в этом месяце: упражнения с наибольшим вкладом
  const r = period('month', 0), share = {};
  fin.filter(w => w.start >= r[0] && w.start < r[1]).forEach(w => w.items.filter(isWr).forEach(it => it.sets.filter(isWork).forEach(s => { share[it.exId] = (share[it.exId] || 0) + setTon(s); })));
  const top5 = Object.entries(share).sort((a, b) => b[1] - a[1]).slice(0, 5), topMax = top5.length ? top5[0][1] : 1;
  const monthWorkouts = fin.filter(w => w.start >= r[0] && w.start < r[1] && wStats(w).ton).length;
  const ev = tonEvents().all.slice(0, 20);
  const tile = (v, label, diff) => `<div class="tile"><b>${tonsShort(v)}</b><span>${label}</span>${diff != null ? `<div class="small" style="margin-top:4px">${tonDiff(diff)}</div>` : ''}</div>`;
  return head + `<div class="an-grid"><div>
  <div class="tiles two">
    ${tile(lw, act ? 'тренировка сейчас' : 'последняя тренировка')}
    ${tile(total, 'всего за всё время')}
    ${tile(wk, 'эта неделя', pwk || wk ? wk - pwk : null)}
    ${tile(mo, 'этот месяц', pmo || mo ? mo - pmo : null)}
  </div>
  <div class="muted small" style="margin:-4px 2px 12px">Стрелки — сравнение с прошлой неделей и прошлым месяцем.${monthWorkouts ? ` В среднем за тренировку в этом месяце — ${tonsShort(mo / monthWorkouts)}.` : ''}</div>
  <section class="card">
    <div class="chips">${[['workout', 'По тренировкам'], ['week', 'По неделям'], ['month', 'По месяцам']].map(([v, l]) => `<button class="chip ${tonView === v ? 'on' : ''}" data-a="tonView" data-v="${v}">${l}</button>`).join('')}</div>
    ${bars('tb', pts, '', tonAxis)}
  </section>
  <h2>Рекорды</h2>
  <section class="card">
    ${bestW ? `<a class="li" href="#/workout/${bestW.id}"><span>🚚 Лучшая тренировка<br><span class="muted small">${fmtDate(bestW.start)} · ${esc(bestW.name)}</span></span><b>${tonsShort(wStats(bestW).ton)}</b></a>` : ''}
    ${bestWk ? `<div class="li"><span>📅 Лучшая неделя<br><span class="muted small">с ${new Date(+bestWk[0]).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span></span><b>${tonsShort(bestWk[1])}</b></div>` : ''}
    ${bestMo ? `<div class="li"><span>🗓️ Лучший месяц<br><span class="muted small">${new Date(Math.floor(bestMo[0] / 12), bestMo[0] % 12, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span></span><b>${tonsShort(bestMo[1])}</b></div>` : ''}
    ${topSet ? `<a class="li" href="#/workout/${topSet.w.id}"><span>🏋️ Самый тяжёлый подход<br><span class="muted small">${esc(exById(topSet.ex).name)} · ${n(topSet.s.w)}×${n(topSet.s.r)} · ${fmtDate(topSet.w.start)}</span></span><b>${tonsShort(topSet.v)}</b></a>` : ''}
  </section>
  </div><div>
  ${top5.length ? `<h2>Откуда тоннаж в этом месяце</h2><section class="card">${top5.map(([id, v]) => `<div class="bar-row"><span>${esc(exById(id).name)}</span>
    <div class="bar"><i style="width:${Math.round(v / topMax * 100)}%"></i></div><b style="min-width:52px">${tonsShort(v)}</b></div>`).join('')}</section>` : ''}
  <h2>Мини-достижения</h2>
  <section class="card">${ev.length ? ev.map(e => `<a class="mini link" href="#/workout/${e.w.id}"><span>${e.icon}</span><div class="small">${esc(e.text)}<div class="muted">${fmtDate(e.w.start)}</div></div></a>`).join('')
    : `<div class="muted small">Здесь появятся личные рекорды по тоннажу: лучшая тренировка, лучший подход, рекорд объёма в упражнении, лучшая неделя и месяц.</div>`}</section>
  </div></div>`;
}

// Живые рекорды во время тренировки: после отметки подхода — лучший подход по тоннажу и рекорд тренировки.
function tonLiveCheck(w, it, s, tonBefore) {
  if (!isWr(it) || !isWork(s) || !setTon(s)) return;
  const prevBestSet = Math.max(0, ...finished().filter(x => x.start < w.start).flatMap(x => x.items.filter(i => i.exId === it.exId).flatMap(i => i.sets.filter(isWork).map(setTon))));
  const thisBest = Math.max(0, ...w.items.filter(i => i.exId === it.exId).flatMap(i => i.sets.filter(x => x !== s && isWork(x)).map(setTon)));
  const msgs = [];
  if (prevBestSet && setTon(s) > Math.max(prevBestSet, thisBest)) msgs.push(`💥 Лучший подход по тоннажу в «${exById(it.exId).name}»: ${n(s.w)}×${n(s.r)} = ${tonsShort(setTon(s))}`);
  const bestW = Math.max(0, ...finished().filter(x => x.start < w.start).map(x => wStats(x).ton)), after = wStats(w).ton;
  if (bestW && tonBefore <= bestW && after > bestW) msgs.push(`🚚 Новый рекорд тоннажа за тренировку: ${tonsShort(after)}!`);
  if (msgs.length) toast(msgs.join(' · '));
}
// Полоска «тоннаж сейчас / рекорд» в идущей тренировке.
function tonLiveHtml(w) {
  if (w.end) return '';
  const now = wStats(w).ton, best = Math.max(0, ...finished().filter(x => x.start < w.start).map(x => wStats(x).ton));
  if (!best && !now) return '';
  const pct = best ? Math.min(100, now / best * 100) : 100, rec = best && now > best;
  return `<section class="card ton-live ${rec ? 'rec' : ''}"><div class="ex-head"><b>${rec ? '🔥 Рекорд тоннажа!' : 'Тоннаж'}</b><span class="small"><b>${tonsShort(now)}</b>${best ? ` <span class="muted">· рекорд ${tonsShort(best)}</span>` : ''}</span></div>
    ${best ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</section>`;
}

Object.assign(actions, { tonView(d) { tonView = d.v; render(); } });
pages.tonnage = pgTonnage;
tabOf.tonnage = 'progress';
