// Автоприбавка весов в программе, «Поделиться программой» и данные для виджета Android.

/* ---------- автоприбавка ---------- */
// У упражнения программы есть рабочий вес (it.w). После тренировки по этому дню он пересчитывается:
// все рабочие подходы выполнены в плане — прибавляем шаг (как в подсказках), было тяжело — держим вес,
// план не выполнен — держим, а после трёх неудач подряд сбрасываем на 10%, чтобы набрать разгон заново.
const autoOn = p => p && p.auto !== false;
const roundTo = (v, step) => Math.round(v / step) * step;
function autoProgress(w) {
  const p = P(w.pid), day = p && w.di != null && p.days[w.di];
  if (!day || !autoOn(p) || w.deload) return [];
  const out = [];
  day.items.forEach(pi => {
    const ex = exById(pi.exId);
    if (ex.kind !== 'wr') return;
    const work = w.items.filter(it => it.exId === pi.exId).flatMap(it => it.sets.filter(isWork));
    const top = Math.max(0, ...work.map(s => s.w || 0));
    if (!work.length || !top) return;
    const atTop = work.filter(s => (s.w || 0) === top), target = pi.reps || 0;
    const ok = atTop.every(s => (s.r || 0) >= target) && work.every(s => (s.r || 0) >= target || (s.w || 0) < top);
    const hard = work.some(s => s.f === 3), easy = work.every(s => s.f === 1);
    const st = progStep(ex), from = pi.w || null, base = Math.max(top, 0);
    let to = base, why;
    if (ok && !hard) {
      to = base + (easy ? st.step + st.extra : st.step);
      why = `план ${target} повт. выполнен${easy ? ' легко' : ''} — +${n(to - base)} кг`;
      pi.fails = 0;
    } else if (ok) {
      why = 'план выполнен, но было тяжело — закрепляем вес';
      pi.fails = 0;
    } else {
      pi.fails = (pi.fails || 0) + 1;
      if (pi.fails >= 3) {
        to = Math.max(st.step, roundTo(base * 0.9, ex.equip === 'Гантели' ? 1 : 2.5));
        why = '3 тренировки подряд не удалось добрать повторы — вес снижен на 10%, дальше снова прибавляем';
        pi.fails = 0;
      } else why = `не все подходы на ${target} повт. — вес остаётся (попытка ${pi.fails} из 3)`;
    }
    pi.w = to; pi.why = why; pi.wAt = w.start;
    if (from !== to) out.push({ exId: pi.exId, from, to, why });
  });
  if (out.length) w.autoProg = out;
  return out;
}
// Итог автоприбавки после тренировки — показывается тостом и в отчёте тренировки.
const autoLine = c => `${exById(c.exId).name}: ${c.from ? n(c.from) + ' → ' : ''}${n(c.to)} кг`;
const autoHtml = w => w.autoProg && w.autoProg.length ? `<section class="card"><b>📈 Программа обновлена</b>
  <div class="muted small" style="margin:2px 0 6px">Веса на следующую тренировку этого дня</div>
  ${w.autoProg.map(c => `<div class="small">${esc(autoLine(c))}<div class="muted small">${esc(c.why)}</div></div>`).join('')}</section>` : '';

{
  const fin = actions.wFinish;
  actions.wFinish = async function (d) {
    const w = W(d.w);
    // считаем до завершения: если подходов нет, тренировка будет удалена и считать нечего
    const changes = w && w.pid && !w.end && wStats(w).sets ? autoProgress(w) : [];
    await fin.call(this, d);
    if (changes.length && W(d.w)) {
      save();
      setTimeout(() => toast('📈 Программа: ' + changes.slice(0, 2).map(autoLine).join(', ') + (changes.length > 2 ? ` и ещё ${changes.length - 2}` : '')), 1500);
    }
  };
  const report = workoutReportHtml;
  workoutReportHtml = w => autoHtml(w) + report(w);
  // подсказка на тренировке: вес из программы важнее «прошлый раз + шаг»
  const sc = suggestCtx;
  suggestCtx = (w, i, it, prev) => {
    const base = sc(w, i, it, prev);
    if (!it.planW || w.end) return base;
    const keep = base && base.ctx === 'tired';
    return { ...(base || {}), dw: 0, dr: 0, text: `По программе: ${n(it.planW)} кг × ${it.planR || ''}${it.planWhy ? ` — ${it.planWhy}` : ''}${keep ? ' · ' + base.text : ''}` };
  };
  actions.pMenu = async function (d) {
    const p = P(d.p);
    const v = await menu(p.name, [['share', '📤 Поделиться программой'], ['auto', autoOn(p) ? '📈 Автоприбавка весов: вкл — выключить' : '📈 Автоприбавка весов: выкл — включить'],
      ['rename', 'Переименовать'], db.activeProgram === d.p ? null : ['active', 'Сделать текущей программой'], ['del', 'Удалить программу', 1]]);
    if (v === 'share') return actions.pShare(d);
    if (v === 'auto') {
      p.auto = !autoOn(p); save(); render();
      return toast(p.auto ? 'Автоприбавка включена: после тренировки веса в программе обновятся сами' : 'Автоприбавка выключена: веса в программе меняются только вручную');
    }
    if (v === 'rename') return actions.pRename(d);
    if (v === 'active') return actions.pActive(d);
    if (v === 'del' && await confirmDlg('Удалить программу? История тренировок сохранится.')) {
      forget(d.p); db.programs = db.programs.filter(x => x.id !== d.p); save(); go('#/programs');
    }
  };
}

/* ---------- поделиться программой ---------- */
// Программа упаковывается в короткий код (JSON → base64url). Стандартные упражнения передаются номером,
// свои — с названием, группой и оборудованием: у получателя они создадутся заново. Веса не передаются — они личные.
const SHARE_URL = 'https://dedmazay321.github.io/gymlog/#/import/';
const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
function packProgram(p) {
  const x = {};
  const days = p.days.map(d => ({ n: d.name, i: d.items.map(it => {
    const ex = exById(it.exId);
    if (!/^e\d+$/.test(it.exId)) x[it.exId] = [ex.name, ex.muscle, ex.equip, ex.kind || 'wr'];
    return [it.exId, it.sets, it.reps, it.rest || 0, it.ss ? 1 : 0];
  }) }));
  return b64u(JSON.stringify({ v: 1, n: p.name, t: p.note || '', d: days, x }));
}
// Принимает ссылку, код или текст сообщения со ссылкой. Возвращает программу (ещё не добавленную) или null.
function unpackProgram(text) {
  const m = String(text || '').match(/#\/import\/([A-Za-z0-9_-]+)/) || String(text || '').trim().match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  let o;
  try { o = JSON.parse(unb64u(m[1])); } catch (e) { return null; }
  if (!o || o.v !== 1 || !Array.isArray(o.d)) return null;
  const known = id => /^e\d+$/.test(id) && db.exercises.some(e => e.id === id);
  return { name: String(o.n || 'Программа').slice(0, 80), note: String(o.t || '').slice(0, 2000), x: o.x || {},
    days: o.d.slice(0, 7).map(d => ({ name: String(d.n || 'День').slice(0, 60), items: (d.i || []).slice(0, 30)
      .filter(r => known(r[0]) || (o.x && o.x[r[0]]))
      .map(([exId, sets, reps, rest, ss]) => ({ exId, sets: Math.max(1, Math.min(20, +sets || 3)), reps: +reps || 10, rest: +rest || null, ss: !!ss })) })) };
}
// Свои упражнения из чужой программы: если такое уже есть (по названию) — берём его, иначе создаём.
function adoptShared(sp) {
  const map = {};
  Object.entries(sp.x).forEach(([id, [name, muscle, equip, kind]]) => {
    const same = db.exercises.find(e => e.custom && e.name.toLowerCase() === String(name).toLowerCase());
    if (same) { map[id] = same.id; return; }
    const e = { id: uid(), custom: true, name: String(name).slice(0, 80), muscle: MUSCLES.includes(muscle) ? muscle : MUSCLES[0],
      equip: EQUIP.includes(equip) ? equip : 'Другое', kind: ['wr', 'time', 'cardio'].includes(kind) ? kind : 'wr' };
    db.exercises.push(e); map[id] = e.id;
  });
  const p = { name: sp.name, note: sp.note, days: sp.days.map(d => ({ name: d.name, items: d.items.map(it => ({ ...it, exId: map[it.exId] || it.exId })) })) };
  return adoptProgram(p);
}
function pgImport(code) {
  const sp = code ? unpackProgram('#/import/' + code) : null;
  if (!sp) return `<header class="top"><a class="ic" href="#/programs">‹</a><h1>Импорт программы</h1></header>
    <div class="empty">Ссылка повреждена или неполная.<br>Попросите отправить её ещё раз.</div>
    <button class="btn block" data-a="pImport">Вставить ссылку или код</button>`;
  // свои упражнения отправителя для предпросмотра временно подставляем в справочник
  const tmp = Object.entries(sp.x).map(([id, [name, muscle, equip, kind]]) => ({ id, name, muscle, equip, kind, custom: true }));
  db.exercises.push(...tmp);
  try {
    return `<header class="top"><a class="ic" href="#/programs">‹</a><h1>${esc(sp.name)}</h1></header>
    <div class="note">С вами поделились программой. Посмотрите состав и добавьте её к своим — веса подберутся по вашей истории.</div>
    ${sp.note ? `<div class="muted small" style="margin:0 2px 10px">${esc(sp.note)}</div>` : ''}
    <button class="btn block primary" data-a="pImportAdd" data-v="${esc(code)}">Добавить в мои программы</button>
    ${programPreview(sp)}`;
  } finally { db.exercises = db.exercises.filter(e => !tmp.includes(e)); }
}
pages.import = pgImport;
tabOf.import = 'programs';
{
  const list = pages.programs;
  pages.programs = (...a) => list(...a) + `<button class="btn block ghost" data-a="pImport">📥 Добавить программу по ссылке</button>`;
}
const canShareNative = () => !!(window.Android && Android.shareText) || (!!navigator.share && !IS_PC_SHELL());
function IS_PC_SHELL() { return !!(window.chrome && window.chrome.webview); }
Object.assign(actions, {
  pShare(d) {
    const p = P(d.p), link = SHARE_URL + packProgram(p);
    const text = `Программа тренировок «${p.name}» (${p.days.length} дн. в неделю). Открыть в GymLog: ${link}`;
    shareText = text;
    sheet(`<h3>Поделиться программой</h3>
      <div class="muted small" style="margin-bottom:8px">Получатель откроет ссылку в браузере (или вставит её в GymLog: «Программы» → «Добавить программу по ссылке») и увидит состав.
        Ваши веса и история не передаются.</div>
      <textarea readonly rows="4" style="width:100%;font-size:12px" onclick="this.select()">${esc(link)}</textarea>
      <div class="row end" style="margin-top:10px"><button class="btn ghost" data-a="sheetClose">Закрыть</button>
        <button class="btn" data-a="pShareCopy">Скопировать</button>
        ${canShareNative() ? `<button class="btn primary" data-a="pShareSend">Отправить…</button>` : ''}</div>`);
  },
  async pShareCopy() { toast(await copyText(shareText) ? 'Ссылка скопирована' : 'Не удалось скопировать — выделите текст вручную'); },
  pShareSend() {
    if (window.Android && Android.shareText) return Android.shareText(shareText);
    navigator.share({ text: shareText }).catch(() => {});
  },
  async pImport() {
    const r = await form('Добавить программу', [{ name: 'link', label: 'Ссылка или код от друга', type: 'textarea', value: '' }]);
    if (!r || typeof r !== 'object') return;
    const m = r.link.match(/#\/import\/([A-Za-z0-9_-]+)/) || r.link.trim().match(/^([A-Za-z0-9_-]{20,})$/);
    if (!m || !unpackProgram(r.link)) return toast('Не похоже на ссылку на программу GymLog');
    go('#/import/' + m[1]);
  },
  pImportAdd(d) {
    const sp = unpackProgram('#/import/' + d.v);
    if (!sp) return toast('Ссылка повреждена');
    const p = adoptShared(sp);
    save(); syncReminders(); toast('Программа добавлена'); go('#/program/' + p.id);
  },
});
let shareText = '';

/* ---------- виджет Android ---------- */
// Оболочка показывает на рабочем столе ближайшую тренировку по расписанию. Передаём план на 8 дней вперёд,
// чтобы виджет сам переключался в полночь, даже если приложение не открывали.
function widgetData() {
  const p = activeProgram(), out = [], today = new Date(); today.setHours(0, 0, 0, 0);
  const doneDay = ts => db.workouts.some(w => w.end && w.start >= ts && w.start < ts + 864e5);
  for (let k = 0; k < 8; k++) {
    const ts = new Date(today.getFullYear(), today.getMonth(), today.getDate() + k).getTime();
    const di = p && p.week ? p.week[wdOf(ts)] : null, day = di != null && p.days[di];
    // ближайшая запланированная тренировка начиная с этого дня
    let next = null;
    for (let j = 0; j < 7 && p && p.week; j++) {
      const t2 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + k + j).getTime(), d2 = p.week[wdOf(t2)];
      if (d2 != null && p.days[d2] && !(j === 0 && k === 0 && doneDay(t2))) { next = { j, day: p.days[d2] }; break; }
    }
    const mins = d => dayStats(d).min;
    let title, sub;
    if (k === 0 && doneDay(ts)) { title = 'Сегодня тренировка сделана 💪'; sub = next ? `Дальше: ${next.j === 1 ? 'завтра' : WD[wdOf(ts + next.j * 864e5)]} — ${next.day.name}` : ''; }
    else if (day) { title = 'Сегодня: ' + day.name; sub = `${day.items.length} упр. · ≈ ${mins(day)} мин`; }
    else if (next) { title = 'Сегодня отдых'; sub = `Следующая: ${next.j === 1 ? 'завтра' : WD[wdOf(ts + next.j * 864e5)]} — ${next.day.name}`; }
    else { title = p ? 'Расписание не задано' : 'GymLog'; sub = p ? 'Назначьте дни в программе' : 'Выберите программу'; }
    out.push({ at: ts, title, sub });
  }
  const wk = (() => { const now = Date.now(), mon = today.getTime() - wdOf(now) * 864e5; return db.workouts.filter(w => w.end && w.start >= mon).length; })();
  const plan = p && p.week ? Object.values(p.week).filter(v => v != null).length : 0;
  return { days: out, week: plan ? `На неделе: ${wk} из ${plan}` : wk ? `На неделе: ${wk} трен.` : '' };
}
let widgetLast = '';
function widgetPush() {
  if (!(window.Android && Android.setWidget)) return;
  try {
    const s = JSON.stringify(widgetData());
    if (s !== widgetLast) { widgetLast = s; Android.setWidget(s); }
  } catch (e) { glog.add('warn', 'виджет: ' + e.message); }
}
{
  const r = render;
  render = function () { r.apply(this, arguments); widgetPush(); };
}
