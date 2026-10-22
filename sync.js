// Синхронизация телефона и ПК по домашней сети Wi-Fi, без интернета и облака.
// ПК (GymLog.exe) слушает порт SYNC_PORT и показывает 6-значный код. Телефон находит ПК широковещательным
// запросом, один раз вводит код и дальше отправляет свои данные — после каждой тренировки и по кнопке.
// ПК объединяет данные по записям и в ответе возвращает телефону общий результат: так изменения, сделанные
// на ПК (например, программа, составленная на большом экране), тоже попадают на телефон.

const SYNC_PORT = 47821;
const SYNC_KEY = KEY + '.sync';   // привязка к ПК хранится отдельно от данных и не попадает в резервную копию
const IS_PC = !!(window.chrome && window.chrome.webview);
const syncCfg = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } };
const syncSave = c => localStorage.setItem(SYNC_KEY, JSON.stringify(c));
const syncNative = () => !!(window.Android && Android.syncPush);

// Удалённая запись запоминается, чтобы удаление дошло и до ПК.
function forget(id) { (db.gone || (db.gone = {}))[id] = Date.now(); }
// после восстановления из копии или сброса данных общей базы больше нет: следующая синхронизация только складывает данные
function syncResetBase() { const c = syncCfg(); delete c.baseId; delete c.base; c.sent = {}; syncSave(c); }

/* ---------- объединение данных (выполняется на ПК) ---------- */
// Данные раскладываются в плоский список записей: «w:id» — тренировка, «m:id» — замер, «sleep:дата» и т. д.
// ПК помнит отпечатки записей после прошлой синхронизации (base). Если запись изменилась только на одной стороне —
// берётся эта сторона, если на обеих — версия телефона. Удаление тоже считается изменением.
// Без общей базы (первая синхронизация, восстановление из копии, смена ПК) данные просто складываются, ничего не удаляя.
const SYNC_ARR = { workouts: 'w', measures: 'm', programs: 'p', exercises: 'e' };
const SYNC_DICT = ['water', 'sleep'], SYNC_ONE = ['profile', 'activeProgram', 'cycle'];
function syncFlat(d) {
  const m = {};
  for (const [k, pre] of Object.entries(SYNC_ARR)) (d[k] || []).forEach(x => {
    // незавершённая тренировка остаётся на своём устройстве, пока её не закончат
    if (x && x.id && !(k === 'workouts' && !x.end)) m[pre + ':' + x.id] = x;
  });
  SYNC_DICT.forEach(k => Object.entries(d[k] || {}).forEach(([day, v]) => { m[k + ':' + day] = v; }));
  SYNC_ONE.forEach(k => { if (d[k] != null) m[k] = d[k]; });
  return m;
}
function syncUnflat(m) {
  const o = { workouts: [], measures: [], programs: [], exercises: [], water: {}, sleep: {} };
  const arr = Object.fromEntries(Object.entries(SYNC_ARR).map(([k, pre]) => [pre, k]));
  for (const [key, v] of Object.entries(m)) {
    const i = key.indexOf(':'), pre = i < 0 ? key : key.slice(0, i), id = key.slice(i + 1);
    if (arr[pre]) o[arr[pre]].push(v);
    else if (SYNC_DICT.includes(pre)) o[pre][id] = v;
    else if (SYNC_ONE.includes(key)) o[key] = v;
  }
  // базовые упражнения — в порядке справочника, остальное — по дате
  o.exercises.sort((a, b) => (+(/^e(\d+)$/.exec(a.id) || [, 1e9])[1]) - (+(/^e(\d+)$/.exec(b.id) || [, 1e9])[1]));
  o.workouts.sort((a, b) => a.start - b.start);
  return o;
}
const syncHash = v => {
  if (v === undefined) return '-';
  const s = JSON.stringify(v);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '.' + s.length.toString(36);
};
function syncMerge3(mine, theirs, base, gone) {
  const keyId = k => k.slice(k.indexOf(':') + 1);
  // защита: если на одной из сторон пропала большая часть общих записей (сброс данных) — базе не доверяем
  if (base) {
    const bk = Object.keys(base), lostA = bk.filter(k => !(k in mine)).length, lostB = bk.filter(k => !(k in theirs)).length;
    if (bk.length > 10 && (lostA > bk.length / 2 || lostB > bk.length / 2)) base = null;
  }
  const out = {}, st = { mine: { added: 0, updated: 0, removed: 0 }, theirs: { added: 0, updated: 0, removed: 0 } };
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(base || {})]);
  const count = (s, before, after) => {
    if (before === undefined && after !== undefined) s.added++;
    else if (before !== undefined && after === undefined) s.removed++;
    else if (before !== undefined && syncHash(before) !== syncHash(after)) s.updated++;
  };
  for (const k of keys) {
    const a = mine[k], b = theirs[k], ha = syncHash(a), hb = syncHash(b);
    let r;
    if (ha === hb) r = a;
    else if (!base) r = b !== undefined ? b : a;
    else {
      const h0 = base[k] || '-', ca = ha !== h0, cb = hb !== h0;
      if (cb && !ca) r = b;
      else if (ca && !cb) r = a;
      else r = b !== undefined ? b : a;   // изменено на обеих сторонах: побеждает телефон, но удаление не затирает правку
    }
    if (k.includes(':') && !SYNC_DICT.includes(k.slice(0, k.indexOf(':'))) && gone[keyId(k)]) r = undefined;
    if (r !== undefined) out[k] = r;
    count(st.mine, a, r); count(st.theirs, b, r);
  }
  return { out, st };
}
function mergeIncoming(d) {
  if (!d || !d.version || !Array.isArray(d.workouts) || !Array.isArray(d.exercises)) throw new Error('это не данные GymLog');
  const c = syncCfg(), meta = d.sync || {}, gone = { ...(db.gone || {}), ...(d.gone || {}) };
  const base = c.baseId && meta.baseId === c.baseId ? c.base : null;
  const { out, st } = syncMerge3(syncFlat(db), syncFlat(d), base, gone);
  const keepActive = db.workouts.filter(w => !w.end);
  Object.assign(db, syncUnflat(out));
  SYNC_ONE.forEach(k => { if (!(k in out)) delete db[k]; });
  db.workouts.push(...keepActive);
  db.stretchDone = Math.max(db.stretchDone || 0, d.stretchDone || 0);
  db.gone = gone;
  if (!db.settings.onboarded && d.settings && d.settings.onboarded) db.settings.onboarded = true;
  save();
  checkAwards(true);
  // фото: принимаем присланные, отдаём те, которых нет на телефоне
  syncPhotosIn(d.photos || [], gone);
  const back = pcPhotosFor(new Set([...(meta.have || []), ...(d.photos || []).map(p => p.id)]), gone);
  c.baseId = uid(); c.base = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, syncHash(v)]));
  c.lastIn = Date.now(); c.lastStat = { ...st.mine, photos: (d.photos || []).length }; syncSave(c);
  return {
    st: { ...st.theirs, photos: (d.photos || []).length, back: back.list.length, pc: st.mine },
    reply: { data: { ...syncUnflat(out), gone }, baseId: c.baseId, photos: back.list, morePhotos: back.more },
  };
}
// Фото с ПК для телефона: кэш в виде data:-строк, потому что ответ телефону формируется без ожидания.
let pcPhotoData = null;
async function pcPhotoCache() {
  try {
    const list = await photoStore('readonly', st => st.getAll()), map = {};
    for (const p of list) map[p.id] = { id: p.id, date: p.date, pose: p.pose || '', data: await blobData(p.blob) };
    pcPhotoData = map;
  } catch (e) { pcPhotoData = pcPhotoData || {}; }
}
function pcPhotosFor(have, gone) {
  const list = [];
  let size = 0, more = false;
  for (const p of Object.values(pcPhotoData || {}).sort((a, b) => a.date - b.date)) {
    if (have.has(p.id) || gone[p.id]) continue;
    if (size + p.data.length > 10e6 && list.length) { more = true; break; }
    size += p.data.length;
    list.push(p);
  }
  if (!pcPhotoData) more = true;   // кэш ещё не готов — фото отдадим при следующей синхронизации
  return { list, more };
}
async function syncPhotosIn(list, gone) {
  try {
    for (const p of list) {
      if (!p || !p.id || gone[p.id] || !/^data:image\//.test(p.data || '')) continue;
      const blob = await (await fetch(p.data)).blob();
      await photoStore('readwrite', st => st.put({ id: p.id, date: +p.date || Date.now(), blob, ...(p.pose ? { pose: p.pose } : {}) }));
    }
    const have = await photoStore('readonly', st => st.getAllKeys());
    for (const id of have) if (gone[id]) await photoStore('readwrite', st => st.delete(id));
    if (list.length || have.some(id => gone[id])) { photos = null; await loadPhotos(); render(); }
  } catch (e) { glog.add('error', 'Фото при синхронизации: ' + e.message, e.stack); toast('Не удалось сохранить фото: ' + e.message); }
}
// ПК вызывает эту функцию, когда телефон прислал данные; в ответе — объединённые данные для телефона.
window.syncIncoming = text => {
  try {
    const d = JSON.parse(text);
    savePhoneLog(d.logs, (d.sync || {}).device);
    const { st, reply } = mergeIncoming(d);
    glog.add('info', `Синхронизация с телефоном: на ПК +${st.pc.added} ~${st.pc.updated} −${st.pc.removed}, на телефон +${st.added} ~${st.updated} −${st.removed}, фото принято ${st.photos}, отдано ${st.back}`);
    const pc = st.pc;
    setTimeout(() => { render(); toast(`Синхронизация с телефоном: новых ${pc.added}, изменено ${pc.updated}${pc.removed ? `, удалено ${pc.removed}` : ''}${st.photos ? `, фото ${st.photos}` : ''}`); }, 0);
    return JSON.stringify({ ok: true, added: st.added, updated: st.updated, removed: st.removed, photos: st.photos, back: st.back, total: db.workouts.length, ...reply });
  } catch (e) { glog.add('error', 'Синхронизация на ПК: ' + e.message, e.stack); return JSON.stringify({ ok: false, error: e.message }); }
};
// Телефон применяет объединённые данные из ответа ПК.
function applyFromPc(res) {
  if (!res.data || !Array.isArray(res.data.workouts)) return;
  const keepActive = db.workouts.filter(w => !w.end);
  Object.assign(db, res.data);
  SYNC_ONE.forEach(k => { if (res.data[k] == null) delete db[k]; });
  db.workouts.push(...keepActive.filter(a => !db.workouts.some(w => w.id === a.id)));
  save();
  checkAwards(true);
  const c = syncCfg();
  c.baseId = res.baseId;
  (res.photos || []).forEach(p => { (c.sent || (c.sent = {}))[p.id] = p.pose || ''; });
  syncSave(c);
  syncPhotosIn(res.photos || [], res.data.gone || {});
  render();
}

/* ---------- ответы оболочек ---------- */
let syncFound = null, syncInfo = null, syncBusy = false;
window.onNativeSync = r => {
  if (r.state === 'info') { syncInfo = r; if (location.hash === '#/sync') render(); return; }
  if (r.state === 'found') {
    glog.add('info', 'Поиск ПК: найдено ' + (r.list || []).length);
    syncFound = r.list || [];
    syncBusy = false;
    if (location.hash === '#/sync') render();
    if (!syncFound.length) toast('Компьютер не найден — проверьте, что GymLog открыт на ПК и оба устройства в одной сети Wi-Fi');
    return;
  }
  if (r.state === 'pushed') {
    syncBusy = false;
    glog.add(r.code === 200 ? 'info' : 'warn', `Синхронизация: ответ ${r.code || '—'}${r.message ? ' — ' + r.message : ''}, ${Math.round((r.body || '').length / 1024)} КБ`);
    const c = syncCfg();
    let res = {};
    try { res = JSON.parse(r.body || '{}'); } catch (e) { /* пустой ответ */ }
    if (r.code === 200 && res.ok) {
      if (c.pending) { c.host = c.pending.host; c.port = c.pending.port; c.name = c.pending.name; c.code = c.pending.code; c.sent = {}; delete c.baseId; delete c.pending; }
      c.lastOut = Date.now(); c.lastErr = ''; if (c.logSending) c.logSent = c.logSending; delete c.logSending; c.sent = { ...(c.sent || {}), ...(c.sending || {}) }; delete c.sending;
      // не все фото поместились — отправляем следующую порцию
      if (c.more || res.morePhotos) setTimeout(() => syncPush(false), 800);
      delete c.more;
      syncSave(c);
      applyFromPc(res);
      if (r.manual) toast(res.data ? `Синхронизировано. С ПК: новых ${res.added}, изменено ${res.updated}${res.removed ? `, удалено ${res.removed}` : ''}${res.back ? `, фото ${res.back}` : ''}` : `Отправлено на ПК: новых ${res.added}, изменено ${res.updated}`);
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
// Фото прогресса уходят вместе с данными: только новые или с изменённым ракурсом (c.sent: id → ракурс),
// и не больше ~8 МБ за раз — остальные догрузятся следующей отправкой.
const blobData = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
async function photosToSend(sent) {
  let list = [];
  try { list = await photoStore('readonly', st => st.getAll()); } catch (e) { return []; }
  const out = [];
  let size = 0;
  for (const p of list.sort((a, b) => a.date - b.date)) {
    if (sent[p.id] === (p.pose || '')) continue;
    if (size + p.blob.size > 8e6 && out.length) { out.more = true; break; }
    size += p.blob.size;
    out.push({ id: p.id, date: p.date, pose: p.pose || '', data: await blobData(p.blob) });
  }
  return out;
}
async function syncPush(manual, target) {
  const c = syncCfg(), t = target || c;
  if (!syncNative() || !t.host) return false;
  syncBusy = !!manual;
  const ph = await photosToSend(target ? {} : c.sent || {});
  const c2 = syncCfg();
  c2.sending = Object.fromEntries(ph.map(p => [p.id, p.pose]));
  c2.more = !!ph.more;
  syncSave(c2);
  let have = [];
  try { have = await photoStore('readonly', st => st.getAllKeys()); } catch (e) { /* фото нет */ }
  const logs = glog.since(c.logSent || 0).slice(-400);
  const meta = { baseId: target ? null : c.baseId || null, have, device: window.Android && Android.deviceInfo ? Android.deviceInfo() : '' };
  const body = JSON.stringify({ ...db, photos: ph, sync: meta, logs });
  c2.logSending = logs.length ? logs[logs.length - 1].t : c2.logSent || 0;
  syncSave(c2);
  glog.add('info', `Синхронизация: отправка ${Math.round(body.length / 1024)} КБ, фото ${ph.length}, записей журнала ${logs.length}${manual ? ' (вручную)' : ''}`);
  Android.syncPush(t.host, +t.port || SYNC_PORT, String(t.code), body, !!manual);
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
    return head + `<section class="card"><b>Этот компьютер синхронизируется с телефоном</b>
      <div class="muted small" style="margin-top:4px">Синхронизация в обе стороны: тренировки приходят с телефона, а то, что вы измените здесь (программы, замеры, фото), уйдёт на телефон при следующей синхронизации.<br>Откройте на телефоне GymLog → «Ещё» → «Синхронизация с ПК» → «Найти компьютер» и введите код.
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
    Данные и фото прогресса идут напрямую с телефона на компьютер и никуда больше не отправляются.</p>`;
  }
  if (!syncNative()) return head + `<section class="card"><div class="small">${window.Android
    ? 'Синхронизация появилась в приложении для Android версии 1.24. Установите новый GymLog.apk поверх старого — данные сохранятся.'
    : 'Синхронизация работает между приложением для Android и GymLog.exe на компьютере.' + (typeof IS_IOS !== 'undefined' && IS_IOS ? ' На iPhone данные переносятся файлом: «Ещё» → «Сохранить резервную копию», затем «Восстановить из копии» на другом устройстве.' : '')}</div></section>`;
  if (c.host) return head + `<section class="card"><b>💻 ${esc(c.name || 'Компьютер')}</b><div class="muted small">${esc(c.host)}:${c.port}</div>
      <div class="switch" style="margin-top:8px"><span>Последняя отправка</span><b>${agoFull(c.lastOut)}</b></div>
      ${c.lastErr ? `<div class="hint">Последняя попытка не удалась: ${esc(c.lastErr)}</div>` : ''}
      <button class="btn block primary" data-a="syncNow" ${syncBusy ? 'disabled' : ''} style="margin-top:10px">${syncBusy ? 'Синхронизация…' : 'Синхронизировать сейчас'}</button>
      <button class="btn block ghost" data-a="syncForget">Отвязать компьютер</button></section>
    <p class="muted small">Синхронизация в обе стороны: тренировки с телефона попадают на ПК, а программы, замеры и фото, добавленные на ПК, — на телефон. Запускается сама после каждой тренировки и при запуске приложения, если телефон в той же сети Wi-Fi, что и ПК.
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
  syncNow() { syncPush(true); render(); },
  async syncForget() { if (await confirmDlg('Отвязать компьютер? Данные на нём останутся.', 'Отвязать')) { localStorage.removeItem(SYNC_KEY); render(); } },
  syncNewCode() { syncInfo = null; Android.syncNewCode(); render(); },
});
if (IS_PC) pcPhotoCache();
pages.sync = pgSync;
tabOf.sync = 'more';
syncAuto(false);
