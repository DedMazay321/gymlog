// Экран журнала и доставка журнала разработчику: на ПК — в файлы logs\pc.log и logs\phone.log
// (журнал телефона приходит вместе с синхронизацией), на телефоне — копированием или файлом.

// Запуск: оболочка, устройство, объём данных; журнал Android-оболочки (ошибки Java, падения) забираем к себе.
(function logStartup() {
  const shell = IS_PC ? 'Windows (GymLog.exe)' : window.Android ? 'Android' + (Android.deviceInfo ? ': ' + Android.deviceInfo() : ' (APK до 1.30)') : 'браузер';
  let size = 0;
  try { size = (localStorage.getItem(KEY) || '').length; } catch (e) { /* нет доступа */ }
  glog.add('info', 'Запуск: ' + shell, { ua: navigator.userAgent, screen: `${screen.width}×${screen.height} @${devicePixelRatio}`,
    workouts: db.workouts.length, programs: db.programs.length, photos: db.photoCount || 0, dataKB: Math.round(size / 1024), sync: !!syncCfg().host });
  if (window.Android && Android.nativeLog) {
    try {
      const t = Android.nativeLog();
      if (t) t.trim().split(/\n(?=\d{4}-\d\d-\d\d \d\d:)/).forEach(line => {
        const [head, ...rest] = line.split('\n'), msg = head.slice(20);
        glog.add(/\[error\]|ПАДЕНИЕ/.test(msg) ? 'error' : /\[warn\]/.test(msg) ? 'warn' : 'native', 'Android ' + head.slice(0, 19) + ': ' + msg.replace(/^\[(error|warn)\] /, ''), rest.join('\n'));
      });
    } catch (e) { glog.add('warn', 'Журнал Android недоступен: ' + e.message); }
  }
})();

// ПК: новые записи раз в 3 секунды дописываются в logs\pc.log
if (IS_PC) {
  let queue = [];
  glog.on(e => queue.push(e));
  const send = () => {
    if (!queue.length) return;
    const text = logText(queue) + '\n';
    queue = [];
    window.chrome.webview.postMessage({ cmd: 'log', name: 'pc', text });
  };
  setInterval(send, 3000);
  window.addEventListener('beforeunload', send);
  queue = glog.all().slice(-30);   // при запуске — последние записи, включая ошибки прошлого сеанса
}
// ПК: журнал, пришедший с телефона при синхронизации, — в logs\phone.log
function savePhoneLog(list, device) {
  if (!IS_PC || !Array.isArray(list) || !list.length) return;
  const clean = list.filter(e => e && e.t && e.l && e.m).slice(-600);
  window.chrome.webview.postMessage({ cmd: 'log', name: 'phone', text: `===== журнал телефона${device ? ' (' + device + ')' : ''}, получен ${new Date().toLocaleString('sv-SE')} =====\n` + logText(clean) + '\n' });
  glog.add('info', `Получен журнал телефона: ${clean.length} записей`);
}

let logFilter = '';
function pgLog() {
  const all = glog.all(), list = (logFilter ? all.filter(e => e.l === logFilter) : all).slice(-300).reverse();
  const cnt = l => all.filter(e => e.l === l).length;
  return `<header class="top"><a class="ic" href="#/more">‹</a><h1>Журнал</h1></header>
  <section class="card"><div class="small">Журнал нужен, чтобы находить и исправлять ошибки. В нём только события приложения: ошибки, обновления, синхронизация, какие экраны открывались и какие кнопки нажимались. Тренировок, весов, заметок и фото в журнале нет.</div>
    <div class="muted small" style="margin-top:6px">${IS_PC ? 'На этом компьютере журнал сам пишется в папку %LOCALAPPDATA%\\GymLog\\logs — туда же приходит журнал телефона при синхронизации.'
      : syncCfg().host ? 'Журнал уходит на ваш ПК вместе с синхронизацией.' : 'Чтобы передать журнал, скопируйте его или сохраните файлом. Если включить синхронизацию с ПК, он будет уходить туда сам.'}</div>
    <div class="row an-acts"><button class="btn sm primary" data-a="logCopy">Скопировать</button><button class="btn sm" data-a="logSave">Сохранить файлом</button><button class="btn sm ghost" data-a="logClear">Очистить</button></div></section>
  <div class="chips">${[['', 'Все · ' + all.length], ['error', 'Ошибки · ' + cnt('error')], ['warn', 'Предупреждения · ' + cnt('warn')]].map(([v, l]) => `<button class="chip ${logFilter === v ? 'on' : ''}" data-a="logFilter" data-v="${v}">${l}</button>`).join('')}</div>
  <section class="card log-list">${list.map(e => `<div class="${e.l}">${esc(logLine(e))}</div>`).join('') || '<div class="muted">Записей нет</div>'}</section>`;
}
const logExport = () => `GymLog ${ver.name || ''}\n${logText(glog.all())}\n`;
Object.assign(actions, {
  logFilter(d) { logFilter = d.v; render(); },
  logCopy() { copyText(logExport()).then(ok => toast(ok ? 'Журнал скопирован' : 'Не удалось скопировать — сохраните файлом')); },
  logSave() { download(`gymlog-log-${isoDay(Date.now())}.txt`, logExport(), 'text/plain'); },
  async logClear() { if (await confirmDlg('Очистить журнал?', 'Очистить')) { glog.clear(); render(); } },
});
pages.log = pgLog;
tabOf.log = 'more';
