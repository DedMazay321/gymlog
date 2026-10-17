// Журнал диагностики: ошибки, предупреждения, результаты обновления и синхронизации, переходы и нажатия.
// Только события — без тренировок, весов, заметок и фото. Хранится на устройстве (последние 600 записей),
// на ПК дописывается в файлы %LOCALAPPDATA%\GymLog\logs\pc.log, а журнал телефона приходит туда же
// (phone.log) при синхронизации. Подключается первым, чтобы поймать ошибки загрузки остальных файлов.
const LOG_KEY = 'gymlog.v1.log', LOG_MAX = 600;
const glog = (() => {
  let buf = [], timer = null;
  try { buf = JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch (e) { buf = []; }
  const flush = () => { clearTimeout(timer); timer = null; try { localStorage.setItem(LOG_KEY, JSON.stringify(buf)); } catch (e) { /* место кончилось — журнал не важнее данных */ } };
  const listeners = [];
  function add(level, msg, extra) {
    const e = { t: Date.now(), l: level, m: String(msg).slice(0, 800) };
    if (extra != null && extra !== '') e.x = String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 2000);
    // одинаковые ошибки подряд не плодим
    const last = buf[buf.length - 1];
    if (last && last.l === e.l && last.m === e.m && e.t - last.t < 5000) { last.n = (last.n || 1) + 1; last.t = e.t; }
    else buf.push(e);
    if (buf.length > LOG_MAX) buf.splice(0, buf.length - LOG_MAX);
    if (level === 'error') flush(); else if (!timer) timer = setTimeout(flush, 1000);
    listeners.forEach(f => { try { f(e); } catch (er) { /* слушатель не должен ломать журнал */ } });
  }
  return { add, all: () => buf, since: t => buf.filter(e => e.t > t), clear: () => { buf = []; flush(); }, flush, on: f => listeners.push(f) };
})();
const logLine = e => `${new Date(e.t).toLocaleString('sv-SE').replace('T', ' ')} [${e.l}]${e.n ? ` ×${e.n}` : ''} ${e.m}${e.x ? '\n    ' + e.x.replace(/\n/g, '\n    ') : ''}`;
const logText = list => list.map(logLine).join('\n');

window.addEventListener('error', e => {
  // ошибка загрузки файла (скрипт, картинка) приходит без message
  if (!e.message && e.target && e.target !== window) return glog.add('error', 'Не загрузился файл: ' + (e.target.src || e.target.href || e.target.tagName));
  glog.add('error', e.message, `${String(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}${e.error && e.error.stack ? '\n' + e.error.stack : ''}`);
}, true);
window.addEventListener('unhandledrejection', e => {
  const r = e.reason;
  glog.add('error', 'Необработанная ошибка: ' + (r && r.message || r), r && r.stack);
});
['error', 'warn'].forEach(k => {
  const orig = console[k];
  console[k] = (...a) => { glog.add(k, a.map(x => x instanceof Error ? x.message : typeof x === 'object' ? (() => { try { return JSON.stringify(x); } catch (er) { return String(x); } })() : String(x)).join(' ')); orig.apply(console, a); };
});
window.addEventListener('hashchange', () => glog.add('nav', location.hash || '#/'));
