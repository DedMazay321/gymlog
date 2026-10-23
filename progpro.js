// Программы «премиум»: паспорт программы (объём на мышцы, частота, баланс, время), насколько программа
// подходит именно вам, методика прогрессии, чего ожидать, сильные стороны и частые трудности
// (обобщение отзывов о таких схемах), что говорят исследования, и ваш собственный прогресс по программе.
// Тексты — ориентиры для любителей, а не индивидуальный план тренера.

/* ---------- тип программы ---------- */
function progType(c) {
  const k = c[6].join(' '), name = c[0];
  if (/S5_/.test(k)) return 'linear5';
  if (/PL_/.test(k)) return 'pl';
  if (/GV_/.test(k)) return 'gvt';
  if (/ATH_/.test(k)) return 'athletic';
  if (/CAL_/.test(k)) return 'calis';
  if (/KB_/.test(k)) return 'kb';
  if (c[5] === 'abs') return 'abs';
  if (/Специализация/.test(name)) return 'spec';
  if (c[5] === 'glutes') return 'glute';
  if (/SS_|CIRC|END_/.test(k) || /Интенсив/.test(name)) return 'circuit';
  if (/MACH|INTRO|CABLE/.test(k)) return 'machine';
  if (/PUSH|PULL/.test(k) && !/CHEST_BACK/.test(k)) return 'ppl';
  if (/(^|\s)(CHEST|BACK|SHOULDERS|ARMS|LEGS_V|CHEST_BACK|SH_ARMS)(\s|$)/.test(k)) return 'bro';
  if (/UP\d|LO\d|VAR_|W_UP|W_LEG|W_GL/.test(k)) return 'ul';
  return 'full';
}
const PT = {
  linear5: { basis: 'Линейная прогрессия 5×5 — по мотивам StrongLifts и Starting Strength', plus: ['Просто: три базовых упражнения и понятная прибавка каждую тренировку', 'Самый быстрый рост силы в первые 2–3 месяца'], minus: ['У тех, кто тренируется больше полугода, застой приходит через 2–3 месяца', 'Мало работы на руки и плечи'], ev: ['linear', 'rep'] },
  pl: { basis: 'Пауэрлифтинг: присед, жим и становая — каждое движение в свой день', plus: ['Целенаправленный рост силы в трёх главных движениях'], minus: ['Нужны опыт и уверенная техника', 'Тяжёлые подходы требуют страховки'], ev: ['linear', 'freq'] },
  gvt: { basis: 'Немецкий объёмный тренинг (10×10)', plus: ['Очень сильный объёмный стимул за короткий цикл'], minus: ['Изматывает: техника страдает в последних подходах', 'Держать дольше 4–6 недель не стоит'], ev: ['gvt', 'vol'] },
  athletic: { basis: 'Атлетическая подготовка: взрывная сила и скорость', plus: ['Развивает мощность, прыгучесть и координацию'], minus: ['Нужна отличная техника взятий и рывков', 'Новичкам лучше начать с базовой программы'], ev: ['rep'] },
  calis: { basis: 'Калистеника: турник, брусья и вес тела', plus: ['Без зала, сила относительно своего веса'], minus: ['Ноги почти не работают — добавьте приседания или выпады'], ev: ['rep'] },
  kb: { basis: 'Тренинг с гирей: махи, жимы, приседания', plus: ['Нужна одна-две гири, развивает силу и выносливость сразу'], minus: ['Прогрессия скачками: гири идут через 2–4 кг — сначала добавляйте повторы'], ev: ['rep'] },
  abs: { basis: 'Программа для мышц кора и пресса', plus: ['Короткие тренировки, легко совместить с основной программой'], minus: ['Кубики видно только при низком проценте жира — без дефицита калорий их не будет'], ev: ['vol'] },
  spec: { basis: 'Специализация: двойной объём на отстающую группу', plus: ['Быстрее всего подтягивает отстающую мышцу'], minus: ['Остальные группы на поддержке — держите специализацию 6–8 недель, затем вернитесь к обычной программе'], ev: ['vol', 'freq'] },
  glute: { basis: 'Акцент на ягодицы: хип-траст, мосты, выпады, тяги', plus: ['Заметный результат в ягодицах за 8–12 недель', 'Много упражнений без осевой нагрузки на спину'], minus: ['Верх тела на минимуме — через цикл стоит сменить акцент'], ev: ['glute', 'vol'] },
  circuit: { basis: 'Круговые тренировки и суперсеты', plus: ['Высокий пульс и расход калорий, тренировка проходит быстро'], minus: ['Сила растёт медленнее', 'Сложно прогрессировать весом — прибавляйте повторы и сокращайте отдых'], ev: ['rep'] },
  machine: { basis: 'Тренажёры и блоки', plus: ['Безопасно и понятно: движение задаёт тренажёр', 'Удобно в переполненном зале'], minus: ['Со временем стоит добавить свободные веса — они сильнее развивают стабилизаторы'], ev: ['rep', 'freq'] },
  ppl: { basis: 'Сплит «жим / тяга / ноги»', plus: ['Мышцы-помощники отдыхают вместе с основными', 'Большой объём на каждую группу'], minus: ['Вариант на 3 дня даёт каждой мышце лишь одну тренировку в неделю', 'Вариант на 6 дней требует много времени'], ev: ['freq', 'split'] },
  bro: { basis: 'Классический сплит по группам мышц', plus: ['Много упражнений на каждую мышцу, привычная бодибилдерская схема'], minus: ['Мышца работает раз в неделю — при том же объёме это обычно хуже, чем 2 раза', 'Пропуск дня = пропуск группы на целую неделю'], ev: ['freq', 'split'] },
  ul: { basis: 'Сплит «верх / низ»', plus: ['Каждая мышца 2 раза в неделю при хорошем восстановлении', 'Удобно уложить в 4 дня'], minus: ['Дни верха получаются длиннее дней низа'], ev: ['freq', 'split', 'vol'] },
  full: { basis: 'Всё тело за тренировку', plus: ['Каждая мышца работает 2–3 раза в неделю', 'Пропуск одного дня не ломает программу'], minus: ['К концу тренировки силы на исходе — базовые упражнения стоят первыми'], ev: ['freq', 'split', 'vol'] },
};
// Что говорят исследования — короткие выводы с источниками.
const EVID = {
  vol: 'Больше подходов — больше рост, но с убывающей отдачей: переход от 6 к 12 подходам в неделю на мышцу даёт заметную прибавку, дальше — всё меньше (Schoenfeld и др., 2017; Pelland и др., 2024).',
  freq: 'При равном объёме тренировать мышцу 2 раза в неделю обычно не хуже, а часто лучше, чем 1 раз (Schoenfeld и др., 2016).',
  split: 'Всё тело и сплит дают сопоставимый рост при равном недельном объёме — выбирайте то, что удобнее по расписанию (метаанализы 2019–2021 гг.).',
  gvt: 'В исследовании 2017 года 5 подходов по 10 дали не меньше роста и силы, чем 10 подходов (Amirthalingam и др.). Если 10×10 выматывает — смело сокращайте до 5.',
  rep: 'Мышцы растут в широком диапазоне повторов, если подход близок к отказу (Schoenfeld и др., 2017). Прибавлять можно и вес, и повторы — оба способа работают (Plotkin и др., 2022).',
  glute: 'Хип-траст и присед дают сопоставимый рост ягодиц; присед вдобавок развивает квадрицепс и приводящие (Plotkin и др., 2023).',
  linear: 'Линейная прибавка веса лучше всего работает у новичков; при частых срывах переходят на двойную прогрессию или волновую схему.',
  deload: 'Неделя полного отдыха посреди цикла не ускорила рост и немного снизила силу (Coleman и др., 2024) — лёгкую неделю делайте по самочувствию, а не по календарю.',
};
// Рекомендуемая длительность цикла, недель.
function progWeeks(c) {
  const t = progType(c), name = c[0];
  if (/Вводная/.test(name)) return [1, 2];
  if (/Первый месяц/.test(name)) return [4, 4];
  if (/Интенсив/.test(name)) return [2, 2];
  if (t === 'gvt') return [4, 6];
  if (t === 'spec') return [6, 8];
  if (t === 'linear5') return [12, 16];
  return c[3] === 'pro' ? [6, 10] : [8, 12];
}
function progRule(c) {
  const t = progType(c), g = c[4];
  if (t === 'abs') return 'Каждую неделю добавляйте по 2–3 повтора или 10–15 секунд в статике. Когда стало легко — переходите на следующий уровень программы.';
  if (t === 'linear5' || t === 'pl' || g === 'strength') return 'Линейно: после каждой успешной тренировки +2,5 кг (присед и становая — +5 кг). Не выполнили план 3 раза подряд — снизьте вес на 10% и снова набирайте. Приложение подскажет прибавку само.';
  if (t === 'circuit' || g === 'loss') return 'Сначала добавляйте повторы и сокращайте отдых, затем вес. Главное для результата — регулярность и дефицит калорий.';
  if (t === 'kb' || c[2] === 'body') return 'Сначала добавляйте повторы до верхней границы, затем усложняйте: тяжелее гиря, медленнее опускание, пауза внизу, вариант упражнения потруднее.';
  return 'Двойная прогрессия: держите вес, пока во всех подходах не сделаете плановое число повторов, затем прибавьте — для груди, спины и ног 5 кг, для рук и плеч 2,5 кг. Приложение подсказывает прибавку на каждой тренировке.';
}
const EXPECT = {
  mass: [[4, 'Растут рабочие веса, техника становится уверенной'], [8, 'Заметнее объёмы, вес тела +1–2 кг при небольшом профиците калорий'], [12, 'Новичок обычно набирает 1–3 кг мышц за первые месяцы; у опытных темп ниже']],
  strength: [[4, '+10–20% в базовых упражнениях у новичков'], [8, 'Первые застои — время сменить схему повторов или сделать лёгкую неделю'], [12, 'Новичкам реально +30–50% к рабочим весам']],
  loss: [[4, '−1,5–3 кг при дефиците 300–500 ккал; силовые сохраняют мышцы'], [8, 'Заметно уходит талия, растёт выносливость'], [12, 'Около −5–8% веса — хороший темп без потери мышц']],
  tone: [[4, 'Лучше самочувствие и выносливость, растут рабочие веса'], [8, 'Подтянутость и осанка — заметно на фото'], [12, 'Плотнее мышцы и устойчивая привычка к тренировкам']],
};

/* ---------- паспорт программы ---------- */
const REAR_DELT = ['e35', 'e38', 'e39', 'e122', 'e123', 'e234', 'e238'];
function progPassport(p, focus = 'all', goal = 'mass') {
  const vol = Object.fromEntries(AN_GROUPS.map(g => [g[0], 0])), freq = Object.fromEntries(AN_GROUPS.map(g => [g[0], 0]));
  let push = 0, pull = 0;
  p.days.forEach(d => {
    const dayVol = {};
    d.items.forEach(it => {
      const ex = exById(it.exId);
      if (ex.kind === 'cardio') return;
      const [pri, sec] = exMuscles(ex);
      AN_GROUPS.forEach(([g, ms]) => {
        const k = ms.some(m => pri.includes(m)) ? 1 : ms.some(m => sec.includes(m)) ? 0.5 : 0;   // вспомогательная мышца — за полподхода
        if (k) { vol[g] += it.sets * k; dayVol[g] = (dayVol[g] || 0) + it.sets * k; }
      });
      if (REAR_DELT.includes(it.exId) || pri.some(m => ['lats', 'middle back', 'traps'].includes(m))) pull += it.sets;
      else if (pri.includes('chest') || pri.includes('shoulders')) push += it.sets;
    });
    Object.entries(dayVol).forEach(([g, v]) => { if (v >= 2) freq[g]++; });
  });
  const stats = p.days.map(dayStats), mins = stats.length ? Math.round(stats.reduce((a, s) => a + s.min, 0) / stats.length) : 0;
  const lowK = goal === 'tone' || goal === 'loss' ? 0.5 : 0.7, checks = [];
  const big = ['Грудь', 'Спина', 'Квадрицепс', 'Бицепс бедра', 'Ягодицы'];
  const inZone = AN_GROUPS.filter(([g, , lo, hi]) => vol[g] >= lo * lowK && vol[g] <= hi + 6).length;
  if (focus === 'all') {
    checks.push([inZone >= 7, `Объём в рабочем диапазоне у ${inZone} из ${AN_GROUPS.length} групп мышц`]);
    const once = big.filter(g => vol[g] >= 3 && freq[g] < 2);
    checks.push([!once.length, once.length ? `Раз в неделю работают: ${once.join(', ').toLowerCase()}` : 'Крупные мышцы работают 2+ раза в неделю']);
    const none = big.filter(g => vol[g] < 2 && !(g === 'Грудь' && p.sex === 'f'));
    if (none.length) checks.push([false, `Почти нет нагрузки на: ${none.join(', ').toLowerCase()}`]);
  } else checks.push([true, 'Акцентная программа: часть групп намеренно на поддерживающем объёме']);
  if (push + pull >= 6) checks.push([push <= pull * 1.5, push <= pull * 1.5 ? 'Жимы и тяги сбалансированы — бережёт плечи и осанку' : `Жимов (${push}) заметно больше, чем тяг (${pull})`]);
  checks.push([mins <= 70, mins <= 70 ? `Тренировка ≈ ${Math.round(mins / 5) * 5} мин — укладывается в час` : `Длинные тренировки: ≈ ${Math.round(mins / 5) * 5} мин`]);
  return { vol, freq, push, pull, mins, checks };
}
function passportHtml(pp) {
  const max = Math.max(24, ...Object.values(pp.vol));
  return `<section class="card"><div class="pp-checks">${pp.checks.map(([ok, t]) => `<div class="small"><span class="${ok ? 'up' : 'warnc'}">${ok ? '✓' : '!'}</span> ${esc(t)}</div>`).join('')}</div>
    <div class="muted small" style="margin:10px 0 4px">Подходов в неделю на мышцу · полоса — рабочий диапазон для роста</div>
    ${AN_GROUPS.map(([g, , lo, hi]) => { const v = pp.vol[g]; return `<div class="bar-row an-vol"><span>${g}</span><div class="bar"><em style="left:${lo / max * 100}%;width:${(hi - lo) / max * 100}%"></em><i class="${v < lo * 0.6 ? 'lo' : v > hi + 6 ? 'hi' : 'ok'}" style="width:${Math.min(100, v / max * 100)}%"></i></div><b>${n(+v.toFixed(1))}${pp.freq[g] ? `<span class="muted small"> ×${pp.freq[g]}</span>` : ''}</b></div>`; }).join('')}
    <div class="muted small" style="margin-top:6px">×N — сколько раз в неделю мышца получает нагрузку. Вспомогательная работа считается за полподхода.</div></section>`;
}

/* ---------- насколько подходит вам ---------- */
const GOAL_FROM_PROFILE = { gain: 'mass', loss: 'loss', keep: 'tone' };
function myLevel() {
  const p = db.profile || {};
  if (p.level) return p.level === 'new' ? 'new' : 'mid';
  const n = finished().length;
  return n < 20 ? 'new' : n < 150 ? 'mid' : 'pro';
}
function progMatch(c) {
  const p = db.profile;
  if (!p) return null;
  const why = [];
  let score = 0;
  const goal = GOAL_FROM_PROFILE[p.goal] || p.goal, [, , place, level, cg] = c;
  if (cg === goal || (goal === 'tone' && cg === 'strength') || (goal === 'mass' && cg === 'strength')) { score += cg === goal ? 35 : 25; why.push([true, `Цель: ${GOAL_NAMES[cg]}`]); }
  else why.push([false, `Цель программы — ${GOAL_NAMES[cg]}, а у вас — ${GOAL_NAMES[goal] || 'другая'}`]);
  const lv = myLevel(), order = { new: 0, mid: 1, pro: 2 }, dl = order[level] - order[lv];
  if (dl === 0) { score += 25; why.push([true, `Уровень: ${LEVEL_NAMES[level]}`]); }
  else if (dl === 1 && lv !== 'new') { score += 15; why.push([null, 'Чуть сложнее вашего уровня — хороший следующий шаг']); }
  else if (dl < 0) { score += 15; why.push([null, 'Проще вашего уровня — подойдёт для восстановления или занятой недели']); }
  else why.push([false, `Рассчитана на уровень «${LEVEL_NAMES[level]}»`]);
  if (p.place) {
    if (p.place === place || (p.place === 'gym')) { score += 25; why.push([true, PLACE_NAMES[place]]); }
    else if (p.place === 'db' && place === 'body') { score += 20; why.push([true, PLACE_NAMES[place]]); }
    else why.push([false, `Нужно: ${PLACE_NAMES[place]}`]);
  } else score += 15;
  const days = c[6].length;
  if (p.days) {
    if (days === p.days) { score += 15; why.push([true, `${days} дн. в неделю — как вы планировали`]); }
    else if (Math.abs(days - p.days) === 1) { score += 8; why.push([null, `${days} дн. в неделю (вы планировали ${p.days})`]); }
    else why.push([false, `${days} дн. в неделю, а вы планировали ${p.days}`]);
  } else score += 8;
  // акцентные программы — осознанный выбор под отстающую мышцу, в общий подбор ставим их ниже
  if (c[5] !== 'all') { score -= 15; why.push([null, 'Акцентная программа — берите, если хотите подтянуть именно эту зону']); }
  return { score: Math.max(0, Math.min(100, Math.round(score))), why };
}
const matchBadge = m => m ? `<span class="match ${m.score >= 80 ? 'hi' : m.score >= 60 ? 'mid' : 'lo'}">${m.score}%</span>` : '';

/* ---------- каталог ---------- */
const GOAL_ICON = { mass: '💪', loss: '🔥', strength: '🏋️', tone: '✨' };
let catSort = 'match';
const catAvail = () => CATALOG.filter(c => !mySex() || c[1] === 'a' || c[1] === mySex());
function catCard(c, big) {
  const ci = CATALOG.indexOf(c), p = catalogProgram(c), stats = p.days.map(dayStats);
  const min = Math.round(stats.reduce((a, s) => a + s.min, 0) / stats.length / 5) * 5, [w1, w2] = progWeeks(c), m = progMatch(c);
  const mine = db.programs.find(x => x.cat === ci || x.name === c[0]), rev = mine && mine.review;
  return `<a class="card link pcard g-${c[4]} ${big ? 'big' : ''}" href="#/catalog/${ci}">
    <div class="ex-head"><b>${GOAL_ICON[c[4]]} ${esc(c[0])}</b>${matchBadge(m)}</div>
    <div class="pc-stats"><span>📅 ${c[6].length} дн./нед.</span><span>⏱ ≈${min} мин</span><span>🗓 ${w1 === w2 ? w1 : w1 + '–' + w2} нед.</span><span class="lvl l-${c[3]}" title="${LEVEL_NAMES[c[3]]}"><i></i><i></i><i></i></span></div>
    <div class="muted small">${esc(PT[progType(c)].basis)}</div>
    ${big ? `<div class="small" style="margin-top:4px">${esc(c[7].split('. ')[0].replace(/\.$/, ''))}.</div>` : ''}
    ${mine ? `<div class="small" style="margin-top:4px">✓ В ваших программах${rev ? ' · ваша оценка ' + '★'.repeat(rev.stars) : ''}</div>` : ''}</a>`;
}
function catListPro() {
  const sx = mySex() || cf.sex;
  let list = CATALOG.filter(c => (!sx || c[1] === 'a' || c[1] === sx) && (!cf.goal || c[4] === cf.goal) && (!cf.place || c[2] === cf.place)
    && (!cf.level || c[3] === cf.level) && (!cf.days || c[6].length === +cf.days));
  const minOf = c => { const st = catalogProgram(c).days.map(dayStats); return st.reduce((a, s) => a + s.min, 0) / st.length; };
  if (catSort === 'match' && db.profile) list = list.map(c => [c, progMatch(c).score]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  if (catSort === 'short') list = list.map(c => [c, minOf(c)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  if (catSort === 'days') list = [...list].sort((a, b) => a[6].length - b[6].length);
  return `<div class="muted small" style="margin:0 2px 8px">Найдено программ: ${list.length} из ${catAvail().length}</div>` +
    (list.map(c => catCard(c)).join('') || `<div class="empty">Под такие условия программ нет.<br>Уберите один из фильтров.</div>`);
}
function pgCatalogPro(id) {
  const c = id != null && CATALOG[+id];
  if (c) return catDetail(c, +id);
  const sel = (k, any, opts) => `<select data-in="catF" data-k="${k}">${[['', any], ...opts].map(([v, l]) =>
    `<option value="${v}" ${String(cf[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const named = o => Object.entries(o).map(([v, l]) => [v, cap(l)]);
  const filtered = Object.values(cf).some(Boolean);
  const top = db.profile && !filtered ? catAvail().map(x => [x, progMatch(x).score]).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
  return `<header class="top"><a class="ic" href="#/programs">‹</a><h1>Каталог программ</h1></header>
  ${top.length ? `<h2>Рекомендуем вам</h2>${top.map(([x]) => catCard(x, true)).join('')}
    <div class="muted small" style="margin:-2px 2px 12px">Подбор по вашей цели, уровню, месту и числу дней из профиля.</div><h2>Все программы</h2>` : ''}
  <div class="filters">${mySex() ? '' : sel('sex', 'Для кого: все', [['f', 'Для женщин'], ['m', 'Для мужчин']])}${sel('goal', 'Цель: любая', named(GOAL_NAMES))}
    ${sel('place', 'Место: любое', named(PLACE_NAMES))}${sel('level', 'Уровень: любой', named(LEVEL_NAMES))}
    ${sel('days', 'Дней в неделю: сколько угодно', [2, 3, 4, 5, 6].map(d => [d, d + ' дн. в неделю']))}</div>
  <div class="chips">${[db.profile ? ['match', 'Подходящие'] : null, ['short', 'Короткие'], ['days', 'Меньше дней'], ['', 'По порядку']].filter(Boolean).map(([v, l]) => `<button class="chip ${catSort === v ? 'on' : ''}" data-a="catSort" data-v="${v}">${l}</button>`).join('')}</div>
  <div id="catbox">${catListPro()}</div>`;
}
function catDetail(c, ci) {
  const p = catalogProgram(c), t = PT[progType(c)], m = progMatch(c), pp = progPassport({ ...p, sex: c[1] }, c[5], c[4]);
  const stats = p.days.map(dayStats), [w1, w2] = progWeeks(c), sets = stats.reduce((a, s) => a + s.sets, 0);
  const evid = [...t.ev, ...(c[3] !== 'new' ? ['deload'] : [])].map(k => EVID[k]);
  const add = `<button class="btn block primary" data-a="catAdd" data-id="${ci}">Добавить в мои программы</button>`;
  return `<header class="top"><a class="ic" href="#/catalog">‹</a><h1>${esc(c[0])}</h1></header>
  <section class="card phero g-${c[4]}"><div class="ph-ic">${GOAL_ICON[c[4]]}</div>
    <div class="muted small ph-basis">${esc(t.basis)}</div>${tagsHtml(c)}
    <div class="tiles">
      <div class="tile"><b>${p.days.length}</b><span>дней в неделю</span></div>
      <div class="tile"><b>≈ ${Math.round(stats.reduce((a, s) => a + s.min, 0) / stats.length / 5) * 5}</b><span>минут</span></div>
      <div class="tile"><b>${w1 === w2 ? w1 : w1 + '–' + w2}</b><span>недель цикл</span></div>
    </div>
    <div class="small">${esc(c[7])}</div></section>
  ${m ? `<h2>Подходит ли вам ${matchBadge(m)}</h2><section class="card">${m.why.map(([ok, x]) => `<div class="small an-li"><span class="${ok ? 'up' : ok === false ? 'warnc' : 'muted'}">${ok ? '✓' : ok === false ? '✗' : '≈'}</span> ${esc(x)}</div>`).join('')}</section>` : ''}
  ${add}
  <h2>Паспорт программы · ${sets} подх. в неделю</h2>${passportHtml(pp)}
  <h2>Как прогрессировать</h2><section class="card"><div class="small">${esc(progRule(c))}</div></section>
  <h2>Чего ожидать</h2><section class="card">${(EXPECT[c[4]] || EXPECT.tone).map(([wk, x]) => `<div class="exp-row"><b>${wk} нед.</b><span class="small">${esc(x)}</span></div>`).join('')}
    <div class="muted small" style="margin-top:6px">Ориентир для регулярных тренировок, сна и питания. У каждого темп свой.</div></section>
  <h2>Сильные стороны и трудности</h2><section class="card">${t.plus.map(x => `<div class="small an-li">👍 ${esc(x)}</div>`).join('')}${t.minus.map(x => `<div class="small an-li">⚠️ ${esc(x)}</div>`).join('')}
    <div class="muted small" style="margin-top:6px">Обобщение отзывов о программах такого типа и опыта тренеров.</div></section>
  <h2>Что говорят исследования</h2><section class="card">${evid.map(x => `<div class="small an-li">📚 ${esc(x)}</div>`).join('')}</section>
  <h2>Тренировки</h2>${programPreview(p)}${add}`;
}

/* ---------- ваш прогресс по программе ---------- */
function catOf(p) { const i = p.cat != null ? p.cat : CATALOG.findIndex(c => c[0] === p.name); return i >= 0 ? [CATALOG[i], i] : [null, -1]; }
function progProgress(p) {
  const ws = finished().filter(w => w.pid === p.id).sort((a, b) => a.start - b.start);
  if (!ws.length) return null;
  const start = Math.min(p.created || Infinity, ws[0].start), weeks = Math.max(1, Math.ceil((Date.now() - start) / (7 * DAY)));
  const perWeek = Object.values((p.week || {})).filter(v => v != null).length || p.days.length;
  const recent = ws.filter(w => w.start >= Date.now() - 28 * DAY), recentWeeks = Math.min(4, weeks);
  const adherence = Math.min(100, Math.round(recent.length / (perWeek * recentWeeks) * 100));
  // базовые упражнения программы: первый и последний результат на этой программе
  const ids = [...new Set(p.days.flatMap(d => d.items.map(i => i.exId)))].filter(id => exById(id).kind === 'wr');
  const lifts = ids.map(id => {
    const ser = sessions(id).filter(s => s.w.pid === p.id && s.w.end);
    if (ser.length < 2) return null;
    const a = ser[0], b = ser[ser.length - 1], weighted = ser.some(s => s.a > 0), v = s => weighted ? s.rm : s.b;
    return { ex: exById(id), from: weighted ? a.a : a.b, to: weighted ? b.a : b.b, d: pct(v(b), v(a)), weighted };
  }).filter(Boolean).sort((x, y) => y.d - x.d);
  const [c] = catOf(p), [w1, w2] = c ? progWeeks(c) : [8, 12];
  const trends = liftTrends().filter(t => ids.includes(t.ex.id));
  const stuck = trends.length >= 2 && trends.filter(t => t.status === 'flat' || t.status === 'down').length >= trends.length * 0.6;
  let verdict;
  if (weeks > w2) verdict = ['info', 'Цикл пройден', `Вы на программе ${weeks} нед. — больше рекомендованных ${w2}. Самое время сменить программу или схему повторов, чтобы дать мышцам новый стимул.`];
  else if (stuck && weeks >= 4) verdict = ['warn', 'Прогресс замедлился', 'Большинство упражнений программы стоит на месте. Попробуйте лёгкую неделю или замените пару упражнений (кнопки в «Анализе и советах»).'];
  else if (adherence < 60) verdict = ['warn', 'Мало тренировок', `Выполнено ${adherence}% запланированного за последние недели. Если не успеваете — выберите программу на меньшее число дней: регулярность важнее объёма.`];
  else verdict = ['ok', 'Программа работает', lifts.filter(l => l.d > 0).length ? `Растут ${lifts.filter(l => l.d > 0).length} из ${lifts.length} упражнений. Продолжайте — до конца цикла ${Math.max(0, w1 - weeks)}–${Math.max(0, w2 - weeks)} нед.` : 'Продолжайте в том же ритме.'];
  const next = c ? catAvail().filter(x => x !== c && x[4] === c[4] && x[2] === c[2] && progType(x) !== progType(c)).map(x => [x, progMatch(x) ? progMatch(x).score : 50]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]) : [];
  return { ws, weeks, adherence, lifts, verdict, next, w2 };
}
function progProgressHtml(p) {
  const r = progProgress(p);
  const [c] = catOf(p);
  const rev = p.review;
  const review = `<section class="card"><div class="ex-head"><b>Ваша оценка программы</b><span class="stars">${[1, 2, 3, 4, 5].map(k => `<button class="${rev && rev.stars >= k ? 'on' : ''}" data-a="pReview" data-p="${p.id}" data-v="${k}" aria-label="${k}">★</button>`).join('')}</span></div>
    ${rev && rev.note ? `<div class="small" style="margin-top:4px">«${esc(rev.note)}»</div>` : `<div class="muted small" style="margin-top:4px">Оценка и заметка помогут потом выбрать, к какой программе вернуться.</div>`}</section>`;
  const head = c ? `<section class="card phero g-${c[4]} slim"><div class="muted small">${esc(PT[progType(c)].basis)}</div><div class="small" style="margin-top:4px"><b>Как прогрессировать:</b> ${esc(progRule(c))}</div></section>` : '';
  if (!r) return head + `<h2>Прогресс по программе</h2><section class="card"><div class="muted small">Прогресс появится после первой тренировки по этой программе.</div></section>`;
  return `${head}<h2>Прогресс по программе</h2>
  <div class="tiles"><div class="tile"><b>${r.weeks}</b><span>${r.w2 ? `нед. из ${r.w2}` : 'нед.'}</span></div><div class="tile"><b>${r.ws.length}</b><span>тренировок</span></div><div class="tile"><b>${r.adherence}%</b><span>плана за 4 нед.</span></div></div>
  <section class="card an-adv ${r.verdict[0]}"><b>${AN_IC[r.verdict[0]]} ${r.verdict[1]}</b><div class="small">${esc(r.verdict[2])}</div>
    ${r.next.length && (r.weeks > r.w2 || r.verdict[0] !== 'ok') ? `<div class="small" style="margin-top:8px">Что дальше: ${r.next.map(x => `<a href="#/catalog/${CATALOG.indexOf(x)}"><u>${esc(x[0])}</u></a>`).join(' или ')}</div>` : ''}</section>
  ${r.lifts.length ? `<section class="card">${r.lifts.slice(0, 6).map(l => `<div class="an-row"><span class="grow">${esc(l.ex.name)}</span><span class="muted small">${l.weighted ? `${n(l.from)} → ${n(l.to)} кг` : `${l.from} → ${l.to} повт.`}</span><span class="an-d ${l.d >= 1 ? 'up' : l.d <= -1 ? 'down' : 'muted'}">${fmtPct(l.d)}</span></div>`).join('')}
    <div class="muted small" style="margin-top:6px">С первой тренировки по программе до последней (по расчётному 1ПМ).</div></section>` : ''}
  ${review}`;
}

Object.assign(actions, {
  catSort(d) { catSort = d.v; $('#catbox') ? ($('#catbox').innerHTML = catListPro(), document.querySelectorAll('[data-a=catSort]').forEach(b => b.classList.toggle('on', b.dataset.v === d.v))) : render(); },
  async pReview(d) {
    const p = P(d.p), stars = +d.v;
    const r = await form(`Оценка: ${'★'.repeat(stars)}`, [{ name: 'note', label: 'Что понравилось или нет (необязательно)', type: 'textarea', value: (p.review || {}).note || '' }]);
    if (!r) return;
    p.review = { stars, note: r.note, at: Date.now() };
    save(); render(); toast('Оценка сохранена');
  },
});
// каталог и список программ — новые версии
pages.catalog = pgCatalogPro;
catListHtml = catListPro;
