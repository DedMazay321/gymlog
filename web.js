// Веб-версия (в том числе на iPhone с экрана «Домой»): подсказка по установке и напоминание о резервной копии.
// В браузере нет ни синхронизации с ПК, ни облака, поэтому файл копии — единственная защита данных.
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_STANDALONE = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
const IS_WEB = !window.Android && !IS_PC;

function webCards() {
  if (!IS_WEB) return '';
  const s = db.settings, out = [];
  if (IS_IOS && !IS_STANDALONE && !s.iosHintOff) out.push(`<section class="card an-adv info"><b>📲 Установите GymLog на iPhone</b>
    <div class="small">Нажмите <b>«Поделиться»</b> <span class="ios-share">⬆︎</span> внизу Safari → <b>«На экран Домой»</b>. Приложение откроется на весь экран и будет работать без интернета.</div>
    <div class="row an-acts"><button class="btn sm ghost" data-a="iosHintOff">Понятно</button></div></section>`);
  const done = finished().length, last = s.lastBackup || 0, days = Math.floor((Date.now() - last) / DAY);
  if (done >= 3 && days >= 14 && !(s.backupSnooze > Date.now())) out.push(`<section class="card an-adv warn"><b>💾 Сделайте резервную копию</b>
    <div class="small">${last ? `Последняя копия — ${days} дн. назад.` : 'Копии ещё не было.'} В веб-версии данные хранятся только в этом браузере${IS_IOS ? ', и iPhone может очистить их при нехватке места' : ''}. Файл копии сохранит всё, кроме фото.</div>
    <div class="row an-acts"><button class="btn sm primary" data-a="exportJson">Сохранить копию</button><button class="btn sm ghost" data-a="backupSnooze">Позже</button></div></section>`);
  return out.join('');
}
Object.assign(actions, {
  iosHintOff() { db.settings.iosHintOff = true; save(); render(); },
  backupSnooze() { db.settings.backupSnooze = Date.now() + 3 * DAY; save(); render(); },
});
if (IS_WEB) glog.add('info', `Веб-версия: ${IS_IOS ? 'iOS' : 'другая система'}, ${IS_STANDALONE ? 'с экрана «Домой»' : 'в браузере'}`);
