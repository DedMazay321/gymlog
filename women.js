// Для женского профиля — всё работает само, без новых кнопок:
// 1) подсказки весов и анализ учитывают фазу цикла (если ведётся дневник цикла);
// 2) вес тела оценивается по среднему за 7 дней, скачки воды перед месячными поясняются;
// 3) отдельный прогресс ягодиц (хип-траст, мосты, выпады) и мини-достижения по ним;
// 4) соотношение талии и бёдер в замерах — фигура меняется, даже когда вес стоит.

const isFemale = () => profile().sex === 'f';

/* ---------- фаза цикла на любую дату ---------- */
function cyclePhaseAt(ts) {
  const starts = [...((db.cycle || {}).starts || [])].sort().map(dayTs).filter(t => t <= ts);
  if (!starts.length) return null;
  const info = cycleInfo(), len = info ? info.len : 28, start = starts[starts.length - 1];
  const day = Math.floor((ts - start) / DAY) + 1, ov = len - 14;
  if (day > len + 7) return null;   // запись о начале пропущена — фазу не угадываем
  const phase = day > len ? 'pms' : day <= 5 ? 'period' : day < ov - 1 ? 'follicular' : day <= ov + 1 ? 'ovulation' : day <= len - 5 ? 'luteal' : 'pms';
  // «трудные» дни: первые три дня менструации и последние дни перед ней
  const low = (phase === 'period' && day <= 3) || phase === 'pms';
  return { day, len, phase, low, name: phase === 'pms' ? 'дни перед менструацией' : phase === 'period' ? 'первые дни менструации' : CYCLE_PHASES[phase][0].toLowerCase() };
}
const cycleLow = ts => { const c = cyclePhaseAt(ts); return c && c.low ? c : null; };

// Подсказка веса с поправкой на цикл.
function cycleAdjust(sg, ts) {
  if (!sg) return sg;
  const c = cyclePhaseAt(ts);
  if (!c) return sg;
  if (c.low && (sg.dw > 0 || sg.dr > 0)) return { text: `Сегодня ${c.name} — сил обычно меньше. Прибавку отложите: повторить прошлый результат уже хорошо`, cycle: true };
  if (c.low) return { ...sg, text: sg.text + ` · сегодня ${c.name}: если тяжело — снизьте вес, это нормально` };
  if ((c.phase === 'follicular' || c.phase === 'ovulation') && (sg.dw > 0 || sg.dr > 0)) return { ...sg, text: sg.text + ' · сейчас хорошая фаза цикла для прибавки' };
  return sg;
}

/* ---------- вес: среднее за 7 дней ---------- */
const weights = () => db.measures.filter(m => m.type === 'weight').sort((a, b) => a.date - b.date);
function weightAvg(ts, list = weights()) {
  const w = list.filter(m => m.date <= ts && m.date > ts - 7 * DAY);
  return w.length ? w.reduce((a, m) => a + m.value, 0) / w.length : null;
}
function weightAvgCard() {
  const list = weights();
  if (!list.length) return '';
  const now = Date.now(), avg = weightAvg(now, list), prev = weightAvg(now - 7 * DAY, list), month = weightAvg(now - 28 * DAY, list);
  if (avg == null) return '';
  const last = list[list.length - 1], jump = last.value - avg, c = isFemale() ? cyclePhaseAt(last.date) : null;
  const fmt = v => (v > 0 ? '+' : v < 0 ? '−' : '') + n(Math.abs(+v.toFixed(1)));
  return `<section class="card"><div class="ex-head"><b>Средний вес за 7 дней: ${n(+avg.toFixed(1))} кг</b></div>
    <div class="muted small" style="margin-top:4px">${prev != null ? `За неделю: ${fmt(avg - prev)} кг` : ''}${month != null ? `${prev != null ? ' · ' : ''}за 4 недели: ${fmt(avg - month)} кг` : ''}</div>
    <div class="small" style="margin-top:6px">Вес за день колеблется на 1–2 кг из-за воды, соли и еды — смотрите на среднее, а не на отдельные взвешивания.</div>
    ${c && (c.phase === 'pms' || c.phase === 'period') && jump > 0.4 ? `<div class="hint">Последнее взвешивание выше среднего на ${n(+jump.toFixed(1))} кг — сейчас ${c.name}, организм задерживает воду. Через несколько дней после начала менструации вес вернётся.</div>` : ''}
  </section>`;
}

/* ---------- соотношение талии и бёдер ---------- */
function whr(ts) {
  const near = type => db.measures.filter(m => m.type === type && m.date <= ts).sort((a, b) => b.date - a.date)[0];
  const w = near('waist'), h = near('hips');
  if (!w || !h || Math.abs(w.date - h.date) > 10 * DAY || !h.value) return null;
  return { v: w.value / h.value, date: Math.max(w.date, h.date) };
}
function whrCard() {
  const cur = whr(Date.now());
  if (!cur) return `<section class="card"><div class="small">Запишите <b>талию</b> и <b>бёдра</b> в один день — здесь появится их соотношение: оно показывает, как меняется фигура, даже когда вес стоит.</div></section>`;
  const firstH = db.measures.filter(m => m.type === 'hips').sort((a, b) => a.date - b.date)[0];
  const first = firstH ? whr(firstH.date + 10 * DAY) : null;
  const goodLine = isFemale() ? 0.8 : 0.9;
  return `<section class="card"><div class="ex-head"><b>Талия / бёдра: ${n(+cur.v.toFixed(2))}</b>${first && first.date < cur.date - 7 * DAY ? `<span class="${cur.v < first.v ? 'up' : cur.v > first.v ? 'down' : 'muted'} small">${cur.v < first.v ? '▼' : cur.v > first.v ? '▲' : '='} было ${n(+first.v.toFixed(2))}</span>` : ''}</div>
    <div class="muted small" style="margin-top:4px">Чем меньше, тем выраженнее талия относительно бёдер. Для ${isFemale() ? 'женщин' : 'мужчин'} ориентир здоровья — до ${n(goodLine)}. Соотношение меняется от упражнений на ягодицы и снижения жира на животе.</div></section>`;
}

/* ---------- ягодицы ---------- */
const LUNGES = [23, 29, 69, 79, 102, 112, 116, 200, 201, 202, 203, 221].map(i => 'e' + i);
const isGlute = id => LUNGES.includes(id) || exMuscles(exById(id))[0].includes('glutes');
function gluteProgress() {
  const now = Date.now(), ids = {};
  finished().filter(w => w.start >= now - 90 * DAY).forEach(w => w.items.forEach(it => { if (isGlute(it.exId) && exById(it.exId).kind === 'wr' && it.sets.some(isWork)) ids[it.exId] = (ids[it.exId] || 0) + 1; }));
  return Object.keys(ids).filter(id => ids[id] >= 2).map(id => {
    const ser = sessions(id).filter(p => p.w.end), last = ser[ser.length - 1];
    const old = [...ser].reverse().find(p => p.t <= now - 28 * DAY) || ser[0];
    const weighted = ser.some(p => p.a > 0), val = p => weighted ? p.a : p.b;
    return { ex: exById(id), d: val(last) - val(old), last: val(last), weighted, n: ser.length };
  }).sort((a, b) => b.n - a.n).slice(0, 5);
}
function gluteCard() {
  if (!isFemale()) return '';
  const g = gluteProgress();
  if (!g.length) return '';
  return `<h2>🍑 Ягодицы</h2><section class="card">${g.map(x => `<div class="an-row"><span class="grow">${esc(x.ex.name)}</span>
    <span class="muted small">${x.weighted ? n(x.last) + ' кг' : x.last + ' повт.'}</span>
    <span class="an-d ${x.d > 0 ? 'up' : x.d < 0 ? 'down' : 'muted'}">${x.d > 0 ? '▲ +' : x.d < 0 ? '▼ −' : '='}${x.d ? n(Math.abs(x.d)) + (x.weighted ? ' кг' : ' повт.') : ''}</span></div>`).join('')}
    <div class="muted small" style="margin-top:6px">Изменение лучшего веса за 4 недели. Ягодицы растут от прогрессии нагрузки в хип-трасте, мостах и выпадах.</div></section>`;
}
