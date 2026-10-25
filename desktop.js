// Компьютерная версия: всё то же приложение, но на широком экране — боковое меню, сетка колонок,
// окна по центру, горячие клавиши и установка как приложения (Chrome, Edge). Включается по ширине окна,
// поэтому работает и в браузере, и в GymLog.exe, если развернуть окно.
const isDesktop = () => window.matchMedia('(min-width: 1000px)').matches;

// бренд и кнопка установки в боковом меню (на телефоне скрыты стилями)
(function sidebar() {
  const nav = $('#tabs');
  if (!nav || nav.querySelector('.brand')) return;
  nav.insertAdjacentHTML('afterbegin', `<div class="brand"><img src="icons/icon-192.png" alt=""><b>GymLog</b></div>`);
  nav.insertAdjacentHTML('beforeend', `<div class="side-foot"><button id="installBtn" class="btn sm" hidden>⬇ Установить приложение</button>
    <div class="muted small" id="sideVer"></div><div class="muted small side-keys">Esc — закрыть окно · / — поиск</div></div>`);
})();
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const b = $('#installBtn'); if (b) b.hidden = false; });
window.addEventListener('appinstalled', () => { const b = $('#installBtn'); if (b) b.hidden = true; glog.add('info', 'Веб-версия установлена как приложение'); });
document.addEventListener('click', e => {
  if (e.target.id === 'installBtn' && installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; e.target.hidden = true; }); }
});
// версия внизу меню
setTimeout(() => { const v = $('#sideVer'); if (v && ver.name) v.textContent = 'Версия ' + ver.name; }, 1500);

// горячие клавиши: Esc закрывает окно, «/» — поиск по упражнениям
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modal.hidden) { e.preventDefault(); closeSheet(); return; }
  const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
  if (e.key === '/' && !typing && modal.hidden) {
    e.preventDefault();
    if (!location.hash.startsWith('#/exercises')) location.hash = '#/exercises';
    setTimeout(() => { const s = document.querySelector('#app input[type=search], #app input[data-in="exQ"], #app .search input'); if (s) s.focus(); }, 60);
  }
});
