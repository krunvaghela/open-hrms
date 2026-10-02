const $ = (id) => document.getElementById(id);
let current = { running: false },
  busy = false,
  refreshPending = false;
function badge(id, text, ready) {
  $(id).textContent = text;
  $(id).classList.toggle('ready', !!ready);
}
function render(s) {
  current = s;
  $('pair').hidden = s.paired;
  $('controls').hidden = !s.paired;
  $('status').textContent = s.message;
  $('person').textContent = s.name || '';
  $('host').textContent = s.origin || '';
  $('status').classList.toggle('active', s.running);
  const config = s.config,
    permission = s.permission;
  badge(
    'company-status',
    config ? (config.enabled ? 'Enabled' : 'Disabled') : 'Unavailable',
    config?.enabled,
  );
  $('company-detail').textContent = config
    ? config.enabled
      ? 'Your company allows desktop tracking.'
      : 'An administrator must enable desktop tracking under HR policies.'
    : s.connectionError || 'Refresh setup checks to connect.';
  badge(
    'attendance-status',
    config ? (config.checkedIn ? 'Checked in' : 'Not checked in') : 'Unavailable',
    config?.checkedIn,
  );
  $('attendance-detail').textContent = config?.checkedIn
    ? 'An open attendance shift was found.'
    : 'Open Attendance in your browser and check in, then return here. Enabling company tracking does not check you in.';
  const required = !!config?.screenshotsEnabled,
    mac = s.platform === 'darwin';
  const permissionReady = permission && ['granted', 'not-required'].includes(permission.status);
  const labels = {
    granted: 'Allowed',
    'not-required': 'Not required',
    'not-determined': 'Permission needed',
    denied: 'Blocked',
    restricted: 'Restricted',
    unknown: 'Check settings',
    'select-display': 'Verify display',
  };
  badge('permission-status', labels[permission?.status] || 'Unavailable', permissionReady);
  $('permission-detail').textContent =
    permission?.detail || 'Connect to your portal to check screenshot requirements.';
  $('permission-app').textContent =
    mac && required
      ? `Enable “${s.permissionApp}” in System Settings → Privacy & Security → Screen & System Audio Recording (Screen Recording on older macOS).`
      : '';
  $('permissions').hidden = !(mac && required);
  $('restart').hidden = !(mac && required);
  $('restart-help').hidden = !(mac && required);
  $('screens').hidden = !required;
  $('screens').textContent =
    mac && permission?.status === 'not-determined'
      ? 'Allow screen recording & choose display'
      : 'Load / retry displays';
  $('display-step').hidden = !required;
  if (!required) $('display').value = '';
  badge('display-status', $('display').value ? 'Selected' : 'Choose display', !!$('display').value);
  $('policy').textContent = config
    ? `${required ? `Screenshots every ${config.intervalMinutes} minutes while tracking.` : 'Screenshots are off.'} Activity records are retained for ${config.retentionDays} days.`
    : '';
  let blocker;
  if (!config) blocker = 'Connect and refresh setup checks before starting.';
  else if (!config.enabled) blocker = 'Company tracking must be enabled first.';
  else if (!config.checkedIn) blocker = 'Check in through Attendance before starting.';
  else if (
    required &&
    ['denied', 'restricted', 'not-determined', 'unknown'].includes(permission?.status)
  )
    blocker = 'Allow Screen Recording, then recheck or restart the app.';
  else if (required && !$('display').value) blocker = 'Load and select a display to share.';
  else if (!$('consent').checked) blocker = 'Acknowledge the tracking notice to continue.';
  $('start-hint').textContent = s.running
    ? 'Tracking is active. Pause whenever you need.'
    : blocker || 'All checks are ready. You can start tracking.';
  $('start').disabled = busy || s.running || !!blocker;
  $('stop').disabled = !s.running;
  for (const id of ['screens', 'display', 'refresh', 'forget', 'permissions', 'restart'])
    $(id).disabled = busy || s.running;
  $('consent').disabled = busy || s.running;
}
async function call(work, { quiet = false } = {}) {
  if (!quiet) {
    $('error').hidden = true;
    $('error').textContent = '';
    busy = true;
    render(current);
  }
  try {
    const r = await work();
    if (!r.ok) throw new Error(r.error);
    return r.value;
  } catch (e) {
    $('error').textContent = e.message;
    $('error').hidden = false;
    if (!quiet) $('error').focus();
    return null;
  } finally {
    if (!quiet) {
      busy = false;
      render(current);
    }
  }
}
async function refresh(quiet = false) {
  if (!current.paired || refreshPending || busy || current.running) return;
  refreshPending = true;
  try {
    const state = await call(() => window.hrms.refresh(), { quiet });
    if (state) render(state);
  } finally {
    refreshPending = false;
  }
}
window.hrms.onState(render);
call(() => window.hrms.state()).then(async (s) => {
  if (s) {
    render(s);
    await refresh(true);
  }
});
window.addEventListener('focus', () => void refresh(true));
$('refresh').onclick = () => refresh();
$('pair').onsubmit = async (e) => {
  e.preventDefault();
  const s = await call(() => window.hrms.pair($('url').value.trim(), $('code').value.trim()));
  if (s) {
    $('code').value = '';
    render(s);
  }
};
$('screens').onclick = async () => {
  $('display').replaceChildren(new Option('Loading displays…', ''));
  const r = await call(() => window.hrms.screens());
  if (!r) {
    $('display').replaceChildren(new Option('Permission needed — retry after allowing access', ''));
    render(current);
    return;
  }
  $('display').replaceChildren(
    new Option(r.screens.length ? 'Choose a display' : 'No screenshots required', ''),
    ...r.screens.map((s) => new Option(s.name, s.id)),
  );
  render(current);
};
$('display').onchange = () => render(current);
$('consent').onchange = () => render(current);
$('attendance').onclick = () => call(() => window.hrms.openAttendance());
$('permissions').onclick = () => call(() => window.hrms.openPermissions());
$('restart').onclick = () => call(() => window.hrms.restart());
$('start').onclick = () => call(() => window.hrms.start($('display').value, $('consent').checked));
$('stop').onclick = () => call(() => window.hrms.stop());
$('forget').onclick = async () => {
  await call(() => window.hrms.forget());
  $('display').replaceChildren(new Option('Allow access and load displays first', ''));
  $('consent').checked = false;
  render(current);
};
