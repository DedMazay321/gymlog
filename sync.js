// Синхронизация телефон → ПК по домашней сети Wi-Fi, без интернета и облака.
// ПК (GymLog.exe) слушает порт SYNC_PORT и показывает 6-значный код. Телефон находит ПК широковещательным
// запросом, один раз вводит код и дальше отправляет свои данные — после каждой тренировки и по кнопке.
// На ПК данные объединяются по записям: новое добавляется, изменённое на телефоне заменяет копию на ПК,
// удалённое на телефоне удаляется (по списку удалений db.gone). Записи, сделанные только на ПК, остаются.

const SYNC_PORT = 47821;
const SYNC_KEY = KEY + '.sync';   // привязка к ПК хранится отдельно от данных и не попадает в резервную копию
const IS_PC = !!(window.chrome && window.chrome.webview);
const syncCfg = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } };
const syncSave = c => localStorage.setItem(SYNC_KEY, JSON.stringify(c));
const syncNative = () => !!(window.Android && Android.syncPush);

// Удалённая запись запоминается, чтобы удаление дошло и до ПК.
function forget(id) { (db.gone || (db.gone = {}))[id] = Date.now(); }

/* ---------- объединение данных (выполняется на ПК) ---------- */
function mergeIncoming(d) {
  if (!d || !d.version || !Array.isArray(d.workouts) || !Array.isArray(d.exercises)) throw new Error('это не данные GymLog');
  const gone = { ...(db.gone || {}), ...(d.gone || {}) }, st = { added: 0, updated: 0, removed: 0 };
  const byId = (mine, theirs, skip) => {
    const map = new Map((mine || []).map(x => [x.id, x]));
    (theirs || []).forEach(x => {
      if (!x || !x.id || skip && skip(x)) return;
      const had = map.get(x.id);
      if (!had) st.added++; else if (JSON.stringify(had) !== JSON.stringify(x)) st.updated++;
      map.set(x.id, x);
    });
    const out = [...map.values()].filter(x => !gone[x.id]);
    st.removed += map.size - out.length;
    return out;
  };
  // незавершённую тренировку с телефона не переносим — она придёт, когда её закончат
  db.workouts = byId(db.workouts, d.workouts, x => !x.end);
  db.measures = byId(db.measures, d.measures);
  db.programs = byId(db.programs, d.programs);
  db.exercises = byId(db.exercises, d.exercises);
  db.water = { ...(db.water || {}), ...(d.water || {}) };
  db.sleep = { ...(db.sleep || {}), ...(d.sleep || {}) };
  ['profile', 'cycle', 'activeProgram'].forEach(k => { if (d[k] != null) db[k] = d[k]; });
  db.stretchDone = Math.max(db.stretchDone || 0, d.stretchDone || 0);
  db.gone = gone;
  if (!db.settings.onboarded && d.settings && d.settings.onboarded) db.settings.onboarded = true;
  save();
  checkAwards(true);
  const c = syncCfg(); c.lastIn = Date.now(); c.lastStat = st; syncSave(c);
  return st;
}
// ПК вызывает эту функцию, когда телефон прислал данные; ответ уходит обратно телефону.
window.syncIncoming = text => {
  try {
    const st = mergeIncoming(JSON.parse(text));
    setTimeout(() => { render(); toast(`Данные с телефона получены: новых ${st.added}, изменено ${st.updated}`); }, 0);
    return JSON.stringify({ ok: true, ...st, total: db.workouts.length });
  } catch (e) { return JSON.stringify({ ok: false, error: e.message }); }
};

/* ---------- ответы оболочек ---------- */
let syncFound = null, syncInfo = null, syncBusy = false;
window.onNativeSync = r => {
  if (r.state === 'info') { syncInfo = r; if (location.hash === '#/sync') render(); return; }
  if (r.state === 'found') {
    syncFound = r.list || [];
    syncBusy = false;
    if (location.hash === '#/sync') render();
    if (!syncFound.length) toast('Компьютер не найден — проверьте, что GymLog открыт на ПК и оба устройства в одной сети Wi-Fi');
    return;
  }
  if (r.state === 'pushed') {
    syncBusy = false;
    const c = syncCfg();
    let res = {};
    try { res = JSON.parse(r.body || '{}'); } catch (e) { /* пустой ответ */ }
    if (r.code === 200 && res.ok) {
      c.lastOut = Date.now(); c.lastErr = ''; if (c.pending) { c.host = c.pending.host; c.port = c.pending.port; c.name = c.pending.name; c.code = c.pending.code; delete c.pending; }
      syncSave(c);
      if (r.manual) toast(`Отправлено на ПК: новых ${res.added}, изменено ${res.updated}`);
    } else {
      const msg = r.code === 403 ? 'неверный код' : r.code === 429 ? 'слишком много попыток, подождите 10 минут' : r.code ? 'ПК ответил ' + r.code + (res.error ? ': ' + res.error : '') : r.message || 'нет связи';
      if (c.pending) delete c.pending;
      c.lastErr = msg; syncSave(c);
      if (r.manual) toast('Не удалось отправить: ' + msg);
    }
    if (location.hash === '#/sync') render();
  }
};
if (IS_PC) {
  const post = cmd => window.chrome.webview.postMessage({ cmd });
  window.Android = Object.assign(window.Android || {}, { syncInfo: () => post('syncInfo'), syncNewCode: () => post('syncNewCode') });
}

// Отправка всех данных на привязанный ПК. manual — показать результат; без него — тихо, в фоне.
function syncPush(manual, target) {
  const c = syncCfg(), t = target || c;
  if (!syncNative() || !t.host) return false;
  syncBusy = !!manual;
  Android.syncPush(t.host, +t.port || SYNC_PORT, String(t.code), JSON.stringify(db), !!manual);
  return true;
}
// автоматически — после завершения тренировки и при запуске, если с прошлой отправки прошло больше 6 часов
function syncAuto(force) {
  const c = syncCfg();
  if (!c.host || !syncNative()) return;
  if (force || !c.lastOut || Date.now() - c.lastOut > 6 * 36e5) syncPush(false);
}

/* ---------- экран «Синхронизация» ---------- */
const agoFull = ts => ts ? new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
function pgSync() {
  const c = syncCfg(), head = `<header class="top"><a class="ic" href="#/more">‹</a><h1>Синхронизация</h1></header>`;
  if (IS_PC) {
    if (!syncInfo) Android.syncInfo();
    const i = syncInfo;
    return head + `<section class="card"><b>Этот компьютер принимает данные с телефона</b>
      <div class="muted small" style="margin-top:4px">Откройте на телефоне GymLog → «Ещё» → «Синхронизация с ПК» → «Найти компьютер» и введите код.
      Телефон и компьютер должны быть в одной сети Wi-Fi, а GymLog на ПК — открыт.</div></section>
    ${i ? `<div class="tiles two"><div class="tile"><b style="letter-spacing:3px">${esc(i.code)}</b><span>код для телефона</span></div>
      <div class="tile"><b style="font-size:15px">${(i.ips || []).map(esc).join('<br>') || '—'}</b><span>адрес ПК, порт ${i.port}</span></div></div>
      ${i.error ? `<div class="hint">Сервер синхронизации не запустился: ${esc(i.error)}</div>` : ''}`
      : `<section class="card"><div class="muted small">Загрузка…</div></section>`}
    <section class="card">
      <div class="switch"><span>Последнее получение</span><b>${agoFull(c.lastIn)}</b></div>
      ${c.lastStat ? `<div class="muted small">Новых записей: ${c.lastStat.added}, изменено: ${c.lastStat.updated}, удалено: ${c.lastStat.removed}</div>` : ''}
      <button class="btn block" data-a="syncNewCode" style="margin-top:10px">Сменить код</button>
      <div class="muted small" style="margin-top:8px">После смены кода телефон нужно привязать заново.</div></section>
    <p class="muted small">При первом запуске Windows может спросить разрешение для GymLog в брандмауэре — разрешите доступ в частных сетях.
    Данные идут напрямую с телефона на компьютер и никуда больше не отправляются. Фото прогресса пока не передаются.</p>`;
  }
  if (!syncNative()) return head + `<section class="card"><div class="small">${window.Android
    ? 'Синхронизация появилась в приложении для Android версии 1.24. Установите новый GymLog.apk поверх старого — данные сохранятся.'
    : 'Синхронизация работает между приложением для Android и GymLog.exe на компьютере.'}</div></section>`;
  if (c.host) return head + `<section class="card"><b>💻 ${esc(c.name || 'Компьютер')}</b><div class="muted small">${esc(c.host)}:${c.port}</div>
      <div class="switch" style="margin-top:8px"><span>Последняя отправка</span><b>${agoFull(c.lastOut)}</b></div>
      ${c.lastErr ? `<div class="hint">Последняя попытка не удалась: ${esc(c.lastErr)}</div>` : ''}
      <button class="btn block primary" data-a="syncNow" ${syncBusy ? 'disabled' : ''} style="margin-top:10px">${syncBusy ? 'Отправка…' : 'Отправить на ПК сейчас'}</button>
      <button class="btn block ghost" data-a="syncForget">Отвязать компьютер</button></section>
    <p class="muted small">Данные отправляются сами после каждой тренировки и при запуске приложения, если телефон в той же сети Wi-Fi, что и ПК.
    Если сети нет — ничего страшного, отправятся в следующий раз.</p>`;
  return head + `<section class="card"><b>Привязка к компьютеру</b>
    <div class="muted small" style="margin-top:4px">1. Откройте GymLog на компьютере → «Ещё» → «Синхронизация с телефоном» — там будет код.<br>
    2. Подключите телефон к той же сети Wi-Fi.<br>3. Нажмите «Найти компьютер».</div>
    <button class="btn block primary" data-a="syncFind" ${syncBusy ? 'disabled' : ''} style="margin-top:10px">${syncBusy ? 'Поиск…' : 'Найти компьютер'}</button>
    ${(syncFound || []).map(p => `<button class="li" data-a="syncPair" data-h="${esc(p.host)}" data-p="${p.port}" data-n="${esc(p.name)}"><span>💻 ${esc(p.name)}</span><span class="muted small">${esc(p.host)}</span></button>`).join('')}
    <button class="btn block ghost" data-a="syncManual">Ввести адрес вручную</button></section>`;
}
async function syncPairAsk(host, port, name) {
  const r = await form('Код с компьютера', [{ name: 'code', label: 'Код из GymLog на ПК («Синхронизация с телефоном»)', type: 'number', placeholder: '6 цифр' }]);
  if (!r || !r.code) return;
  const c = syncCfg();
  c.pending = { host, port: +port || SYNC_PORT, name, code: String(r.code).replace(/\D/g, '') };
  syncSave(c);
  syncPush(true, c.pending);
  toast('Проверяю связь с компьютером…');
}
Object.assign(actions, {
  syncFind() { syncBusy = true; syncFound = null; render(); Android.syncFind(SYNC_PORT); },
  syncPair(d) { syncPairAsk(d.h, d.p, d.n); },
  async syncManual() {
    const r = await form('Адрес компьютера', [{ name: 'host', label: 'IP-адрес (показан на ПК в разделе синхронизации)', type: 'text', placeholder: '192.168.1.10' }]);
    if (r && r.host) syncPairAsk(r.host.trim(), SYNC_PORT, 'Компьютер');
  },
  syncNow() { if (syncPush(true)) render(); },
  async syncForget() { if (await confirmDlg('Отвязать компьютер? Данные на нём останутся.', 'Отвязать')) { localStorage.removeItem(SYNC_KEY); render(); } },
  syncNewCode() { syncInfo = null; Android.syncNewCode(); render(); },
});
pages.sync = pgSync;
tabOf.sync = 'more';
if (location.hash === '#/sync') render();
syncAuto(false);
