// Анализ фото прогресса: сравнение двух снимков (рядом, шторкой, наложением) и разбор того,
// что изменилось между датами съёмки, — по замерам, весу и силовым. Сами снимки приложение не «распознаёт»:
// выводы строятся по цифрам, а глазами (или через ИИ-ассистента) оценивается картинка.

const POSES = { front: 'Спереди', side: 'Сбоку', back: 'Сзади' };
const poseName = p => POSES[p] || 'Без ракурса';
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + n(Math.abs(v));
const pa = { pose: null, a: null, b: null, mode: 'side', cut: 50 };

// Замер на дату снимка: ближайший в пределах 10 дней.
function measureAt(type, ts) {
  let best = null;
  db.measures.forEach(m => { if (m.type === type && Math.abs(m.date - ts) <= 10 * DAY && (!best || Math.abs(m.date - ts) < Math.abs(best.date - ts))) best = m; });
  return best;
}
// Лучший расчётный 1ПМ упражнения в последних 3 тренировках до даты — чтобы разовый неудачный день не искажал картину.
function strengthAt(exId, ts) {
  const ser = sessions(exId).filter(p => p.w.end && p.t <= ts + DAY).slice(-3);
  return ser.length ? Math.max(...ser.map(p => p.rm)) : 0;
}

function photoPeriod(A, B) {
  const days = Math.round((B.date - A.date) / DAY), out = { days, rows: [], lifts: [], notes: [] };
  const wk = finished().filter(w => w.start > A.date && w.start <= B.date + DAY);
  out.workouts = wk.length;
  out.perWeek = days >= 7 ? wk.length / (days / 7) : null;
  MEASURES.forEach(([type, name, unit]) => {
    const a = measureAt(type, A.date), b = measureAt(type, B.date);
    if (a && b && a.id !== b.id) out.rows.push({ type, name, unit, a: a.value, b: b.value, d: +(b.value - a.value).toFixed(1) });
  });
  // силовые: упражнения с весом, выполненные и до первого снимка, и к второму
  const ids = new Set();
  wk.forEach(w => w.items.forEach(it => { if (exById(it.exId).kind === 'wr') ids.add(it.exId); }));
  ids.forEach(id => {
    const a = strengthAt(id, A.date), b = strengthAt(id, B.date);
    if (a > 0 && b > 0) out.lifts.push({ ex: exById(id), a, b, d: pct(b, a) });
  });
  out.lifts.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  out.lifts = out.lifts.slice(0, 5);

  // выводы по цифрам
  const g = t => (out.rows.find(r => r.type === t) || {}).d, w = g('weight'), waist = g('waist'), fat = g('fat');
  const muscles = ['biceps', 'chest', 'shoulders', 'thigh', 'calf', 'forearm'].map(t => out.rows.find(r => r.type === t)).filter(r => r && r.d >= 1);
  const strUp = out.lifts.filter(l => l.d >= 3).length, strDown = out.lifts.filter(l => l.d <= -5).length;
  const N = out.notes;
  if (days < 14) N.push(['info', 'Слишком близкие даты', `Между снимками ${days} дн. За такой срок изменения почти не видны — сравнивайте фото с разницей 4 недели и больше.`]);
  if (waist == null && w == null) N.push(['info', 'Нет замеров на даты снимков', 'Записывайте вес и обхват талии в те же дни, что и фото (±10 дней) — тогда анализ сможет сказать, за счёт чего меняется фигура.']);
  const fr = out.rows.find(r => r.type === 'fat');
  if (fr && fr.d <= -1) N.push(['ok', 'Процент жира снижается', `Было ${n(fr.a)}%, стало ${n(fr.b)}%.`]);
  if (waist != null && w != null) {
    if (waist <= -1 && w <= -0.5) N.push(['ok', 'Уходит жир', `Талия ${sgn(waist)} см при изменении веса ${sgn(w)} кг — снижение идёт в основном за счёт жира.`]);
    else if (waist <= -1 && Math.abs(w) < 1) N.push(['ok', 'Рекомпозиция', `Талия ${sgn(waist)} см при почти неизменном весе (${sgn(w)} кг): жир уходит, а мышцы, скорее всего, прибавляются. На фото это видно лучше, чем на весах.`]);
    else if (w >= 1 && waist <= 0.5) N.push(['ok', 'Качественный набор', `Вес +${n(w)} кг, а талия почти не изменилась (${sgn(waist)} см) — прибавка идёт за счёт мышц.`]);
    else if (w >= 1 && waist > 1.5) N.push(['warn', 'Набор вместе с жиром', `Вес +${n(w)} кг и талия +${n(waist)} см. Если цель — сухая масса, уменьшите калорийность на 150–200 ккал.`]);
    else if (w <= -1 && waist > -0.5) N.push(['warn', 'Вес уходит, талия — нет', `Вес ${sgn(w)} кг, а талия почти прежняя. Возможна потеря мышц и воды: следите за белком и не бросайте силовые.`]);
  }
  if (muscles.length) N.push(['ok', 'Растут объёмы', muscles.map(r => `${r.name.toLowerCase()} +${n(r.d)} ${r.unit}`).join(', ') + (waist != null && waist <= 0.5 ? ' — талия при этом не выросла, так что это мышцы, а не жир.' : '.')]);
  if (strUp && strUp >= out.lifts.length / 2) N.push(['ok', 'Сила растёт', `За этот период выросли ${strUp} из ${out.lifts.length} основных упражнений.`]);
  if (w != null && w <= -1 && strDown) N.push(['warn', 'Сила падает на дефиците', 'Часть упражнений просела вместе с весом — держите белок 1,8–2 г на кг веса и не снижайте рабочие веса без нужды.']);
  if (out.perWeek != null && out.perWeek < 1.5) N.push(['info', 'Мало тренировок', `В среднем ${n(+out.perWeek.toFixed(1))} трен./нед. между снимками — для заметных изменений нужно 2–4.`]);
  return out;
}

// Советы о самой съёмке: регулярность и одинаковые условия.
function photoHabits(list) {
  const out = [];
  if (!list.length) return out;
  const last = list[list.length - 1], gap = daysAgo(last.date);
  if (gap > 28) out.push(`Последнее фото — ${agoTxt(gap)}. Пора сделать новое: удобно раз в 2–4 недели.`);
  if (list.some(p => !p.pose)) out.push('У части снимков не указан ракурс — нажмите на фото, чтобы указать. Сравнивать честно можно только одинаковые ракурсы.');
  const poses = new Set(list.map(p => p.pose).filter(Boolean));
  if (poses.size && poses.size < 3) out.push('Снимайте три ракурса: спереди, сбоку и сзади — сбоку лучше всего видны живот и осанка, сзади — спина и ягодицы.');
  out.push('Для честного сравнения: одно место и свет, то же расстояние до камеры, утром натощак, в одной и той же одежде.');
  return out;
}

function pgPhotoAn() {
  const head = `<header class="top"><a class="ic" href="#/measures/photo">‹</a><h1>Анализ фото</h1></header>`;
  if (!photos) { loadPhotos().then(() => location.hash === '#/photoan' && render()); return head + `<div class="empty">Загрузка…</div>`; }
  const poses = [...new Set(photos.map(p => p.pose || ''))];
  if (pa.pose == null || !poses.includes(pa.pose)) {
    const counts = poses.map(p => [p, photos.filter(x => (x.pose || '') === p).length]).sort((a, b) => b[1] - a[1]);
    pa.pose = counts.length ? counts[0][0] : '';
  }
  const list = photos.filter(p => (p.pose || '') === pa.pose);
  if (photos.length < 2) return head + `<div class="empty">Нужно хотя бы 2 фото. Снимайте себя раз в 2–4 недели в одной позе — здесь появится сравнение и разбор изменений.</div>
    <section class="card">${photoHabits(photos).map(t => `<div class="small an-li">💡 ${esc(t)}</div>`).join('')}</section>`;
  if (!list.find(p => p.id === pa.a)) pa.a = list[0].id;
  if (!list.find(p => p.id === pa.b) || pa.b === pa.a) pa.b = list[list.length - 1].id;
  const A = list.find(p => p.id === pa.a), B = list.find(p => p.id === pa.b);
  const one = list.length < 2;
  const r = one ? null : photoPeriod(A.date <= B.date ? A : B, A.date <= B.date ? B : A);
  const sel = (k, cur) => `<select class="inp" data-in="paPick" data-k="${k}">${list.map(p => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${fmtDate(p.date)}</option>`).join('')}</select>`;
  const img = p => `<img src="${photoUrls[p.id]}" alt="">`;
  const view = pa.mode === 'side'
    ? `<div class="cmp"><figure>${img(A)}<figcaption>${fmtDate(A.date)}</figcaption></figure><figure>${img(B)}<figcaption>${fmtDate(B.date)}</figcaption></figure></div>`
    : `<div class="pa-stack ${pa.mode}">${img(A)}<div class="pa-top" style="${pa.mode === 'wipe' ? `clip-path:inset(0 0 0 ${pa.cut}%)` : `opacity:${pa.cut / 100}`}">${img(B)}</div>
       ${pa.mode === 'wipe' ? `<i class="pa-line" style="left:${pa.cut}%"></i>` : ''}<span class="pa-l">${fmtDate(A.date)}</span><span class="pa-r">${fmtDate(B.date)}</span></div>
       <input type="range" min="0" max="100" value="${pa.cut}" data-in="paCut" class="pa-range" aria-label="${pa.mode === 'wipe' ? 'Положение шторки' : 'Прозрачность второго фото'}">`;
  const desktop = !window.Android || IS_PC;
  return head + `<div class="an-grid"><div>
  ${poses.length > 1 ? `<div class="chips">${poses.map(p => `<button class="chip ${p === pa.pose ? 'on' : ''}" data-a="paPose" data-v="${p}">${poseName(p)} · ${photos.filter(x => (x.pose || '') === p).length}</button>`).join('')}</div>` : ''}
  ${one ? `<div class="empty">В ракурсе «${poseName(pa.pose)}» пока одно фото — выберите другой ракурс или добавьте снимок.</div>` : `
  <section class="card"><div class="row two" style="margin:0"><label class="field" style="margin:0"><span>Было</span>${sel('a', A.id)}</label><label class="field" style="margin:0"><span>Стало</span>${sel('b', B.id)}</label></div></section>
  <div class="chips">${[['side', 'Рядом'], ['wipe', 'Шторка'], ['fade', 'Наложение']].map(([v, l]) => `<button class="chip ${pa.mode === v ? 'on' : ''}" data-a="paMode" data-v="${v}">${l}</button>`).join('')}</div>
  ${view}
  <div class="muted small" style="margin:6px 2px 12px">${pa.mode === 'wipe' ? 'Двигайте ползунок — шторка открывает второй снимок поверх первого.' : pa.mode === 'fade' ? 'Ползунок меняет прозрачность второго снимка: так видно, где контур стал другим.' : 'Нажмите «Шторка» или «Наложение», чтобы сравнить точнее.'}</div>`}
  </div><div>
  ${r ? `<h2>Что изменилось за ${r.days} дн.</h2>
  <section class="card">
    <div class="tiles"><div class="tile"><b>${r.days}</b><span>дней</span></div><div class="tile"><b>${r.workouts}</b><span>тренировок</span></div>
      <div class="tile"><b>${r.perWeek != null ? n(+r.perWeek.toFixed(1)) : '—'}</b><span>в неделю</span></div></div>
    ${r.rows.length ? `<div class="an-table">${r.rows.map(x => `<div class="an-row"><span class="grow">${x.name}</span><span class="muted small">${n(x.a)} → ${n(x.b)} ${x.unit}</span>
      <span class="an-d">${x.d > 0 ? `+${n(x.d)}` : x.d < 0 ? `−${n(-x.d)}` : '='}</span></div>`).join('')}</div>`
      : `<div class="muted small">Нет замеров рядом с датами снимков.</div>`}
    ${r.lifts.length ? `<div class="small" style="margin:10px 0 2px"><b>Сила</b> (расчётный 1ПМ)</div><div class="an-table">${r.lifts.map(l => `<div class="an-row"><span class="grow">${esc(l.ex.name)}</span>
      <span class="muted small">${n(+l.a.toFixed(1))} → ${n(+l.b.toFixed(1))} кг</span><span class="an-d ${l.d >= 1 ? 'up' : l.d <= -1 ? 'down' : 'muted'}">${fmtPct(l.d)}</span></div>`).join('')}</div>` : ''}
  </section>
  ${r.notes.map(([k, t, x]) => `<section class="card an-adv ${k}"><b>${AN_IC[k]} ${t}</b><div class="small">${esc(x)}</div></section>`).join('')}
  <h2>Разбор с ИИ</h2>
  <section class="card"><div class="small">${desktop
    ? 'Скачайте коллаж «было — стало» с датами и скопируйте вопрос с цифрами. В чате с ИИ-ассистентом (например, Claude) прикрепите коллаж и вставьте вопрос — он оценит изменения на фото.'
    : 'Коллаж для ИИ удобнее собирать на компьютере: включите синхронизацию с ПК — фото передаются туда вместе с тренировками. Вопрос с цифрами можно скопировать и здесь.'}</div>
    <div class="row">${desktop ? `<button class="btn sm primary" data-a="paCollage">Скачать коллаж</button>` : ''}<button class="btn sm" data-a="paCopy">Скопировать вопрос</button></div>
    <div class="muted small" style="margin-top:8px">Фото уходят только туда, куда вы их сами отправите.</div></section>` : ''}
  <h2>Как снимать</h2>
  <section class="card">${photoHabits(photos).map(t => `<div class="small an-li">💡 ${esc(t)}</div>`).join('')}</section>
  </div></div>
  <div class="muted small" style="margin:6px 2px 16px">Выводы строятся по замерам, весу и тренировкам на даты снимков — это ориентир, а не медицинская оценка.</div>`;
}

function photoQuestion() {
  const list = photos.filter(p => (p.pose || '') === pa.pose), A0 = list.find(p => p.id === pa.a), B0 = list.find(p => p.id === pa.b);
  if (!A0 || !B0) return '';
  const [A, B] = A0.date <= B0.date ? [A0, B0] : [B0, A0], r = photoPeriod(A, B), p = profile();
  const GOAL = { loss: 'похудение', gain: 'набор массы', keep: 'поддержание формы' };
  const L = [`Сравни мои фото прогресса (ракурс: ${poseName(pa.pose).toLowerCase()}): слева ${fmtDate(A.date)}, справа ${fmtDate(B.date)}, между ними ${r.days} дн.`,
    'Оцени, что изменилось в фигуре (жир, мышцы, осанка), какие зоны отстают, и что поправить в тренировках и питании. Учитывай, что свет и поза могли немного отличаться.', '',
    `Профиль: ${p.sex === 'f' ? 'женщина' : 'мужчина'}, ${p.age} ${yearsWord(p.age)}, рост ${p.height} см, цель — ${GOAL[p.goal] || p.goal}.`,
    `Тренировок за период: ${r.workouts}${r.perWeek != null ? ` (${n(+r.perWeek.toFixed(1))} в неделю)` : ''}.`];
  if (r.rows.length) L.push('Замеры: ' + r.rows.map(x => `${x.name.toLowerCase()} ${n(x.a)} → ${n(x.b)} ${x.unit}`).join(', ') + '.');
  if (r.lifts.length) L.push('Сила (расчётный 1ПМ): ' + r.lifts.map(l => `${l.ex.name} ${n(+l.a.toFixed(1))} → ${n(+l.b.toFixed(1))} кг`).join(', ') + '.');
  const ap = activeProgram();
  if (ap) L.push(`Программа: «${ap.name}», ${ap.days.length} дн./нед.`);
  return L.join('\n');
}

// Коллаж «было — стало»: два снимка рядом с датами — его удобно прикрепить в чат с ИИ.
async function photoCollage() {
  const list = photos.filter(p => (p.pose || '') === pa.pose), A0 = list.find(p => p.id === pa.a), B0 = list.find(p => p.id === pa.b);
  const [A, B] = A0.date <= B0.date ? [A0, B0] : [B0, A0];
  const load = p => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = photoUrls[p.id]; });
  const [ia, ib] = await Promise.all([load(A), load(B)]);
  const H = 1000, wa = Math.round(ia.width * H / ia.height), wb = Math.round(ib.width * H / ib.height), pad = 16, cap = 64;
  const c = document.createElement('canvas');
  c.width = wa + wb + pad * 3; c.height = H + cap + pad * 2;
  const g = c.getContext('2d');
  g.fillStyle = '#111417'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(ia, pad, pad, wa, H); g.drawImage(ib, pad * 2 + wa, pad, wb, H);
  g.fillStyle = '#eef1f4'; g.font = '600 34px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('Было · ' + fmtDate(A.date), pad + wa / 2, H + pad + 46);
  g.fillText('Стало · ' + fmtDate(B.date), pad * 2 + wa + wb / 2, H + pad + 46);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', .9));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `gymlog-foto-${isoDay(A.date)}-${isoDay(B.date)}.jpg`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

Object.assign(actions, {
  paPose(d) { pa.pose = d.v; pa.a = pa.b = null; render(); },
  paMode(d) { pa.mode = d.v; pa.cut = 50; render(); },
  paCopy() { copyText(photoQuestion()).then(ok => toast(ok ? 'Вопрос скопирован — вставьте его в чат вместе с коллажем' : 'Не удалось скопировать')); },
  paCollage() { photoCollage().then(() => toast('Коллаж сохранён'), e => toast('Не удалось собрать коллаж: ' + e.message)); },
  async photoPose(d) {
    const v = await menu('Ракурс снимка', [['front', 'Спереди'], ['side', 'Сбоку'], ['back', 'Сзади'], ['', 'Без ракурса']]);
    if (v == null) return;
    const p = photos.find(x => x.id === d.id);
    p.pose = v || undefined;
    await photoStore('readwrite', st => st.put(p));
    render();
  },
});
Object.assign(inputs, {
  paPick(d, el) { pa[d.k] = el.value; render(); },
  paCut(d, el) {
    pa.cut = +el.value;
    const top = $('.pa-top'), line = $('.pa-line');
    if (top) top.style[pa.mode === 'wipe' ? 'clipPath' : 'opacity'] = pa.mode === 'wipe' ? `inset(0 0 0 ${pa.cut}%)` : pa.cut / 100;
    if (line) line.style.left = pa.cut + '%';
  },
});
pages.photoan = pgPhotoAn;
tabOf.photoan = 'progress';
