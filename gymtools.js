// Калькулятор блинов и «Как в прошлый раз».

/* ---------- блины ---------- */
const PLATES_ALL = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
const PLATE_COLOR = { 25: '#d64545', 20: '#3a6fd8', 15: '#e2b52b', 10: '#3fa45b', 5: '#e8e8e8', 2.5: '#2b2f36', 1.25: '#b9c0c8', 0.5: '#8a929c' };
const plateSet = () => db.settings.plates || [25, 20, 15, 10, 5, 2.5, 1.25];
// Гриф по упражнению: EZ-гриф легче; упражнения «из угла» и с Т-грифом нагружаются с одной стороны — для них не считаем.
function barFor(ex) {
  if (ex.equip !== 'Штанга' || /Т-гриф|из угла|одной рукой|Повороты со штангой/.test(ex.name)) return null;
  return /EZ/.test(ex.name) ? (db.settings.barEz || 10) : (db.settings.bar || 20);
}
// Раскладка на одну сторону: жадно от тяжёлых к лёгким (блинов каждого веса считаем сколько угодно).
function platesFor(total, bar, set = plateSet()) {
  let side = Math.round((total - bar) / 2 * 1000) / 1000;
  if (side < 0) return null;
  const out = [];
  for (const p of [...set].sort((a, b) => b - a)) while (side >= p - 1e-9) { out.push(p); side = Math.round((side - p) * 1000) / 1000; }
  return { side: out, rest: side };
}
const plateTxt = r => r.side.length ? r.side.map(p => n(p)).join(' + ') : 'без блинов';
function plateLine(ex, wt, d) {
  const bar = barFor(ex);
  if (!bar || !wt || wt <= bar) return '';
  const r = platesFor(wt, bar);
  return `<button class="plates" data-a="plateCalc" data-v="${wt}" data-e="${ex.id}">🔩 ${n(wt)} кг: на каждую сторону <b>${plateTxt(r)}</b>${r.rest ? ` <span class="down">(не хватает ${n(r.rest * 2)} кг)</span>` : ''}</button>`;
}
function plateSvg(r, bar) {
  const H = 90, cx = 20;
  let x = cx + 30;
  const plates = r.side.map(p => {
    const h = 30 + Math.min(1, p / 25) * 50, w = p >= 10 ? 12 : p >= 2.5 ? 9 : 6, el = `<rect x="${x}" y="${(H - h) / 2}" width="${w}" height="${h}" rx="2" fill="${PLATE_COLOR[p] || '#999'}" stroke="rgba(0,0,0,.35)"/>`;
    x += w + 2;
    return el;
  }).join('');
  return `<svg viewBox="0 0 ${Math.max(220, x + 40)} ${H}" class="plate-svg" role="img" aria-label="Раскладка блинов">
    <rect x="0" y="${H / 2 - 3}" width="${Math.max(220, x + 40)}" height="6" rx="3" fill="#9aa3ad"/>
    <rect x="${cx + 22}" y="${H / 2 - 9}" width="6" height="18" rx="1" fill="#7c858f"/>${plates}
    <rect x="${x + 2}" y="${H / 2 - 7}" width="6" height="14" rx="1" fill="#7c858f"/></svg>`;
}
let plateCur = { w: 100, ex: null };
function plateSheetHtml() {
  const ex = plateCur.ex ? exById(plateCur.ex) : null, bar = (ex && barFor(ex)) || db.settings.bar || 20, r = platesFor(plateCur.w, bar), set = plateSet();
  return `<h3>Калькулятор блинов</h3>
    ${ex ? `<div class="muted small" style="margin-bottom:6px">${esc(ex.name)}</div>` : ''}
    <div class="stp plate-w"><button data-a="plateStep" data-v="-2.5">−</button><input type="text" inputmode="decimal" data-in="plateW" value="${n(plateCur.w)}"><button data-a="plateStep" data-v="2.5">+</button></div>
    ${r ? `${plateSvg(r, bar)}<div class="small" style="text-align:center;margin:4px 0 10px">Гриф ${n(bar)} кг + на каждую сторону: <b>${plateTxt(r)}</b>${r.rest ? `<br><span class="down">Точно не собрать: не хватает ${n(r.rest * 2)} кг — ближайший вес ${n(plateCur.w - r.rest * 2)} кг</span>` : ''}</div>`
      : `<div class="small" style="margin:10px 0">Вес меньше грифа (${n(bar)} кг).</div>`}
    <div class="muted small">Гриф</div>
    <div class="chips">${[20, 15, 10].map(b => `<button class="chip ${(ex && /EZ/.test(ex.name) ? db.settings.barEz || 10 : db.settings.bar || 20) === b ? 'on' : ''}" data-a="plateBar" data-v="${b}">${b} кг</button>`).join('')}</div>
    <div class="muted small">Какие блины есть в зале</div>
    <div class="chips" style="flex-wrap:wrap">${PLATES_ALL.map(p => `<button class="chip ${set.includes(p) ? 'on' : ''}" data-a="plateToggle" data-v="${p}">${n(p)}</button>`).join('')}</div>
    <div class="row end"><button class="btn primary" data-a="sheetClose">Готово</button></div>`;
}
const plateRefresh = () => { const sh = modal.querySelector('.sheet'); if (sh) sh.innerHTML = plateSheetHtml(); };

/* ---------- «Как в прошлый раз» ---------- */
// Прошлые подходы упражнения (с разминкой) и подсказка прибавки для рабочих.
function lastPlan(w, i) {
  const it = w.items[i], prev = prevSets(it.exId, w.id, w.start);
  if (!prev.length) return null;
  const sg = w.deload ? deloadHint(it, prev) : suggestCtx(w, i, it, prev);
  return { prev, sg, up: sg && (sg.dw > 0 || sg.dr > 0) };
}
function fillItem(w, i, plus) {
  const it = w.items[i], lp = lastPlan(w, i);
  if (!lp || it.sets.some(s => s.done)) return false;
  const planned = it.sets.filter(x => !x.t).length + lp.prev.filter(x => x.t === 'w').length;
  it.sets = lp.prev.map(s => {
    const work = s.t !== 'w', o = { w: s.w ?? null, r: s.r ?? null, done: false };
    if (s.t) o.t = s.t;
    if (plus && work && lp.sg) { if (lp.sg.dw && o.w != null) o.w = +(o.w + lp.sg.dw).toFixed(2); if (lp.sg.dr && o.r != null) o.r += lp.sg.dr; }
    return o;
  });
  // в программе подходов больше, чем было в прошлый раз, — недостающие заполняем как последний рабочий
  const lastWork = [...it.sets].reverse().find(x => !x.t);
  while (lastWork && it.sets.length < planned) it.sets.push({ ...lastWork });
  return true;
}
function fillBtns(w, it, i, d) {
  if (w.end || it.sets.some(s => s.done)) return '';
  const lp = lastPlan(w, i);
  if (!lp) return '';
  const ex = exById(it.exId), work = lp.prev.filter(s => s.t !== 'w'), top = work[0] || lp.prev[0];
  const same = `${work.length} × ${setTxt(top, ex.kind)}`;
  const plus = lp.up ? (lp.sg.dw ? `${n((top.w || 0) + lp.sg.dw)} кг` : `${(top.r || 0) + lp.sg.dr} повт.`) : '';
  return `<div class="row fill"><button class="btn sm" data-a="fillLast" ${d}>↺ Как в прошлый раз: ${same}</button>
    ${plus ? `<button class="btn sm primary" data-a="fillLast" ${d} data-v="up">⬆ С прибавкой: ${plus}</button>` : ''}</div>`;
}

Object.assign(actions, {
  plateCalc(d) { plateCur = { w: +d.v || 100, ex: d.e || null }; sheet(plateSheetHtml()); },
  plateStep(d) { plateCur.w = Math.max(0, +(plateCur.w + +d.v).toFixed(2)); plateRefresh(); },
  plateBar(d) { const ex = plateCur.ex && exById(plateCur.ex); if (ex && /EZ/.test(ex.name)) db.settings.barEz = +d.v; else db.settings.bar = +d.v; save(); plateRefresh(); },
  plateToggle(d) {
    const v = +d.v, s = new Set(plateSet());
    if (s.has(v)) s.delete(v); else s.add(v);
    if (!s.size) return toast('Нужен хотя бы один вид блинов');
    db.settings.plates = [...s].sort((a, b) => b - a); save(); plateRefresh();
  },
  fillLast(d) {
    const w = W(d.w);
    if (fillItem(w, +d.x, d.v === 'up')) { save(); render(); }
  },
  fillAll(d) {
    const w = W(d.w);
    let k = 0;
    w.items.forEach((it, i) => { if (fillItem(w, i, d.v === 'up')) k++; });
    save(); render();
    toast(k ? `Заполнено упражнений: ${k}${d.v === 'up' ? ' (с прибавкой, где она рекомендована)' : ''}` : 'Нечего заполнять: прошлых данных нет или подходы уже начаты');
  },
});
Object.assign(inputs, {
  plateW(d, el) {
    const v = num(el.value);
    if (v == null) return;
    plateCur.w = v;
    const sh = modal.querySelector('.sheet'), r = platesFor(v, (plateCur.ex && barFor(exById(plateCur.ex))) || db.settings.bar || 20);
    // поле ввода не перерисовываем, чтобы не сбивать набор, — обновляем только картинку и подпись
    if (sh && r) { const svg = sh.querySelector('.plate-svg'); if (svg) svg.outerHTML = plateSvg(r, (plateCur.ex && barFor(exById(plateCur.ex))) || db.settings.bar || 20); }
    clearTimeout(plateCur.t); plateCur.t = setTimeout(plateRefresh, 900);
  },
});
