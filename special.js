// Главные достижения — отдельные рубежи с особым оформлением и празднованием в момент, когда подход отмечен.
// Засчитывается рабочий подход (не разминочный) хотя бы на 1 повтор с весом не меньше рубежа.
const SPECIAL = [
  { id: 'bench100', rank: 'diamond', icon: '💎', title: 'Сотка в жиме', kg: 100, ex: ['e0', 'e160'],
    what: 'Жим штанги лёжа — 100 кг', about: 'Главный рубеж любителя: сотку от груди жмёт далеко не каждый, кто ходит в зал.' },
  { id: 'squat150', rank: 'gold', icon: '🦵', title: 'Полторашка в приседе', kg: 150, ex: ['e20', 'e195'],
    what: 'Приседания со штангой — 150 кг', about: 'Полтора центнера на плечах — ноги и спина уровня атлета.' },
];
const RANK_NAME = { diamond: 'Бриллиантовое достижение', gold: 'Золотое достижение' };

// Лучший вес и момент, когда рубеж взят впервые.
function specialState(a) {
  let best = 0, at = null, wid = null;
  [...finished()].sort((x, y) => x.start - y.start).forEach(w => w.items.forEach(it => {
    if (!a.ex.includes(it.exId)) return;
    it.sets.filter(s => isWork(s) && (s.r || 0) >= 1).forEach(s => {
      best = Math.max(best, s.w || 0);
      if (!at && (s.w || 0) >= a.kg) { at = w.start; wid = w.id; }
    });
  }));
  return { best, at, wid, got: !!at };
}
// Новые главные достижения после тренировки; silent — только запомнить (первый запуск этой версии).
function checkSpecial(silent) {
  const got = db.special || (db.special = {}), news = [];
  SPECIAL.forEach(a => { if (!got[a.id] && specialState(a).got) { got[a.id] = Date.now(); news.push(a); } });
  if (news.length) save();
  return silent ? [] : news;
}

function specialCard(a) {
  const st = specialState(a), left = Math.max(0, a.kg - st.best);
  return `<section class="card sp-card ${a.rank} ${st.got ? '' : 'locked'}">
    <div class="sp-ic">${a.icon}</div>
    <div class="grow">
      <div class="sp-rank">${RANK_NAME[a.rank]}</div>
      <b class="sp-title">${a.title}</b>
      <div class="small">${a.what}</div>
      ${st.got ? `<div class="small sp-note">Получено ${fmtDate(st.at)} · <a href="#/workout/${st.wid}">та самая тренировка</a></div>`
        : `<div class="bar"><i style="width:${Math.min(100, Math.round(st.best / a.kg * 100))}%"></i></div>
           <div class="muted small">${st.best ? `Лучший результат — ${n(st.best)} кг, осталось ${n(left)} кг` : 'Пока не выполнялось'}</div>`}
    </div></section>`;
}
const specialHtml = () => `<h2>Главные достижения</h2>${SPECIAL.map(specialCard).join('')}`;

// Праздник: большое окно с анимацией, вибрацией и звуком.
function celebrate(a, live) {
  try { if (db.settings.vibro && navigator.vibrate) navigator.vibrate([120, 80, 120, 80, 400]); } catch (e) { /* без вибрации */ }
  try { if (db.settings.sound) { beep(); setTimeout(beep, 250); setTimeout(beep, 500); } } catch (e) { /* без звука */ }
  return sheet(`<div class="sp-cele ${a.rank}">
    <div class="sp-sparks">${'<i></i>'.repeat(14)}</div>
    <div class="sp-gem">${a.icon}</div>
    <div class="sp-rank">${RANK_NAME[a.rank]}</div>
    <h3>${a.title}</h3>
    <b>${a.what}</b>
    <div class="small">${a.about}</div>
    ${live ? '<div class="small" style="margin-top:6px">Отличный подход — запомните этот день! Отдохните подольше перед следующим.</div>' : ''}
    <button class="btn primary block" data-a="sheetClose" style="margin-top:16px">${a.rank === 'diamond' ? 'Я это сделал! 💎' : 'Есть! 💪'}</button>
  </div>`);
}
// Во время тренировки — сразу после отметки подхода.
function specialLiveCheck(w, it, s) {
  const a = SPECIAL.find(x => x.ex.includes(it.exId));
  if (!a || !isWork(s) || (s.r || 0) < 1 || (s.w || 0) < a.kg) return;
  // празднуем, только если рубеж не брался ни в прошлых тренировках, ни раньше в этой
  if (specialState(a).got) return;
  if (w.items.some(i => a.ex.includes(i.exId) && i.sets.some(x => x !== s && isWork(x) && (x.r || 0) >= 1 && (x.w || 0) >= a.kg))) return;
  (db.special = db.special || {})[a.id] = Date.now();
  save();
  setTimeout(() => celebrate(a, true), 150);
}

// при первом запуске этой версии уже взятые рубежи запоминаем молча
if (!db.special) checkSpecial(true);
