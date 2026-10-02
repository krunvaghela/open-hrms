const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  powerMonitor,
  safeStorage,
  systemPreferences,
  shell,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createOnboarding, readiness, permissionSettings } = require('./onboarding.cjs');
const onboarding = createOnboarding({
  platform: process.platform,
  systemPreferences,
  desktopCapturer,
});
let starting = false;
let window,
  timer,
  auth,
  currentScreen,
  lastShot = 0,
  running = false,
  inFlight = false,
  generation = 0;
let state = {
  paired: false,
  running: false,
  message: 'Pair this computer from Work activity in your HRMS portal.',
};
function send(patch) {
  state = { ...state, ...patch };
  if (window && !window.isDestroyed()) window.webContents.send('state', state);
  return state;
}
function stop(message = 'Tracking paused. No activity or screenshots are being collected.') {
  generation++;
  running = false;
  clearInterval(timer);
  timer = null;
  send({ running: false, message });
}
function origin(value) {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/')
    throw new Error('Enter only the portal origin, e.g. https://hr.example.com');
  if (
    u.protocol !== 'https:' &&
    !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
  )
    throw new Error('Use HTTPS, except for local development.');
  return u.origin;
}
async function request(route, body, credentials = auth) {
  if (!credentials) throw new Error('Pair your computer first.');
  const res = await fetch(`${credentials.origin}/api/tracking/${route}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-HRMS-Request': '1',
      ...(credentials.token ? { Authorization: `Bearer ${credentials.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}
function persist() {
  const file = path.join(app.getPath('userData'), 'device.enc');
  if (
    safeStorage.isEncryptionAvailable() &&
    safeStorage.getSelectedStorageBackend?.() !== 'basic_text'
  )
    fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(auth)), { mode: 0o600 });
}
async function refresh() {
  if (!auth) return send({ config: null, permission: null });
  try {
    const config = await request('device/config');
    return send({
      config,
      permission: onboarding.permission(config.screenshotsEnabled),
      connectionError: '',
      platform: process.platform,
      permissionApp: app.isPackaged ? 'Open HRMS Desktop' : 'Electron',
      packaged: app.isPackaged,
    });
  } catch (e) {
    send({ config: null, connectionError: e.message });
    throw e;
  }
}
function trusted(event) {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame)
    throw new Error('Untrusted desktop request');
}
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    trusted(event);
    try {
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      if (state.config)
        send({ permission: onboarding.permission(state.config.screenshotsEnabled) });
      return { ok: false, error: e.message };
    }
  });
}
async function tick() {
  if (!running || inFlight) return;
  inFlight = true;
  const version = generation;
  try {
    const config = await request('device/config');
    if (!running || version !== generation) return;
    send({ config, permission: onboarding.permission(config.screenshotsEnabled) });
    if (!config.enabled || !config.checkedIn) {
      stop(
        config.enabled
          ? 'Tracking stopped because you are not checked in. Open Attendance to check in again.'
          : 'Tracking stopped because your company disabled tracking.',
      );
      return;
    }
    const active = powerMonitor.getSystemIdleTime() < 30;
    let screenshot;
    if (
      config.screenshotsEnabled &&
      active &&
      Date.now() - lastShot >= config.intervalMinutes * 60000 + 2000
    ) {
      if (!currentScreen) {
        stop('Screenshots were enabled. Select a display and start tracking again to consent.');
        return;
      }
      const access = onboarding.permission(true);
      if (process.platform === 'darwin' && access.status !== 'granted')
        throw new Error(access.detail);
      const sources = await onboarding.sources({ width: 960, height: 600 });
      if (!running || version !== generation) return;
      const source = sources.find((s) => s.id === currentScreen);
      if (!source || source.thumbnail.isEmpty())
        throw new Error(
          'Selected display is unavailable. Check screen-recording permissions and start again.',
        );
      const jpeg = source.thumbnail.toJPEG(45);
      if (jpeg.length > 160000)
        throw new Error('Screenshot exceeds the upload limit. Choose a smaller display.');
      screenshot = jpeg.toString('base64');
    }
    if (!running || version !== generation) return;
    await request('device/sample', {
      id: randomUUID(),
      activeSeconds: active ? 30 : 0,
      ...(screenshot ? { screenshot } : {}),
    });
    if (screenshot) lastShot = Date.now();
    if (running && version === generation)
      send({
        message: `Tracking active · last sync ${new Date().toLocaleTimeString()} · ${config.screenshotsEnabled ? 'screenshots enabled' : 'screenshots off'}`,
      });
  } catch (e) {
    stop(`Tracking stopped: ${e.message}`);
  } finally {
    inFlight = false;
  }
}
app.whenReady().then(() => {
  try {
    auth = JSON.parse(
      safeStorage.decryptString(fs.readFileSync(path.join(app.getPath('userData'), 'device.enc'))),
    );
    auth.origin = origin(auth.origin);
    if (!/^[a-f0-9]{64}$/.test(auth.token)) auth = null;
  } catch {
    auth = null;
  }
  state = {
    ...state,
    paired: !!auth,
    name: auth?.name,
    origin: auth?.origin,
    message: auth ? 'Connected. Complete the setup checks below before starting.' : state.message,
  };
  window = new BrowserWindow({
    width: 700,
    height: 900,
    minWidth: 480,
    minHeight: 600,
    title: 'Open HRMS Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (e) => e.preventDefault());
  window.loadFile(path.join(__dirname, 'index.html'));
  window.on('close', () => stop());
  powerMonitor.on('suspend', () =>
    stop('Tracking paused while the computer sleeps. Start again when ready.'),
  );
  powerMonitor.on('lock-screen', () =>
    stop('Tracking paused when the screen locked. Start again when ready.'),
  );
  handle('state', () => state);
  handle('refresh', refresh);
  handle('open-attendance', async () => {
    if (!auth) throw new Error('Pair your computer first.');
    await shell.openExternal(`${origin(auth.origin)}/attendance`);
    return true;
  });
  handle('open-permissions', async () => {
    if (process.platform !== 'darwin')
      throw new Error('Use your operating system screen-sharing prompt.');
    await shell.openExternal(permissionSettings);
    return true;
  });
  handle('restart', () => {
    stop();
    app.relaunch();
    app.quit();
    return true;
  });
  handle('pair', async (value, code) => {
    stop();
    const host = origin(value);
    if (!/^[a-f0-9]{64}$/.test(code))
      throw new Error('Paste the complete pairing code from your portal.');
    const result = await request('redeem', { code }, { origin: host });
    auth = { origin: host, token: result.token, name: result.name };
    persist();
    send({
      paired: true,
      name: auth.name,
      origin: auth.origin,
      message: 'Paired. Complete the setup checks below before starting.',
    });
    await refresh().catch(() => {});
    return state;
  });
  handle('screens', async () => {
    if (running || starting) throw new Error('Pause tracking before choosing a different display.');
    const latest = await refresh();
    const screens = await onboarding.displays(latest.config.screenshotsEnabled);
    send({ permission: onboarding.permission(latest.config.screenshotsEnabled) });
    return { screens, config: latest.config };
  });
  handle('start', async (screenId, consent) => {
    if (running) return state;
    if (starting) throw new Error('Setup is already being verified. Please wait.');
    starting = true;
    const version = generation;
    try {
      const latest = await refresh();
      const blocker = readiness(latest.config, latest.permission, screenId, consent === true);
      if (blocker) throw new Error(blocker);
      // Verify capture before starting the clock; this one-pixel probe is never uploaded or saved.
      await onboarding.verify(screenId, latest.config.screenshotsEnabled);
      if (generation !== version)
        throw new Error('Start was cancelled. Review setup and try again.');
      currentScreen = latest.config.screenshotsEnabled ? screenId : null;
      generation++;
      running = true;
      clearInterval(timer);
      timer = setInterval(tick, 30000);
      return send({
        running: true,
        message: 'Tracking active. The first activity sample will be sent in 30 seconds.',
      });
    } finally {
      starting = false;
    }
  });
  handle('stop', () => {
    stop();
    return state;
  });
  handle('forget', () => {
    stop();
    auth = null;
    fs.rmSync(path.join(app.getPath('userData'), 'device.enc'), { force: true });
    return send({
      paired: false,
      config: null,
      permission: null,
      connectionError: '',
      name: null,
      origin: null,
      message:
        'This computer is disconnected. Revoke its access under Work activity in the portal.',
    });
  });
});
app.on('window-all-closed', () => app.quit());
