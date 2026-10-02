const permissionSettings =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
function createOnboarding({ platform, systemPreferences, desktopCapturer, timeoutMs = 20000 }) {
  let capturePending = false;
  function permission(required) {
    if (!required)
      return {
        status: 'not-required',
        detail: 'Screenshots are off. No screen-recording permission is needed.',
      };
    if (platform !== 'darwin')
      return {
        status: 'select-display',
        detail:
          platform === 'linux'
            ? 'Choose a display. Your desktop may ask you to approve screen sharing.'
            : 'Choose a display to verify that screen capture is available.',
      };
    let status;
    try {
      status = systemPreferences.getMediaAccessStatus('screen');
    } catch {
      status = 'unknown';
    }
    const details = {
      granted: 'Screen Recording is allowed. Choose a display to verify capture.',
      denied: 'Screen Recording is blocked. Enable this app in System Settings, then restart it.',
      restricted:
        'Screen Recording is restricted by your device administrator. Ask them to allow this app.',
      'not-determined': 'Allow Screen Recording so you can choose a display to share.',
      unknown:
        'Permission status is unavailable. Open Screen Recording settings, then restart and retry.',
    };
    return { status, detail: details[status] || details.unknown };
  }
  async function sources(thumbnailSize) {
    if (capturePending)
      throw new Error(
        'A screen-sharing request is still pending. Respond to the system prompt, or restart the app before retrying.',
      );
    capturePending = true;
    let timer;
    // Keep the native request marked pending if it outlives the timeout; do not stack OS dialogs.
    const capture = Promise.resolve()
      .then(() => desktopCapturer.getSources({ types: ['screen'], thumbnailSize }))
      .finally(() => {
        capturePending = false;
      });
    try {
      return await Promise.race([
        capture,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  'Screen-sharing permission did not respond. Check System Settings and restart the app if you changed permission.',
                ),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function displays(required) {
    if (!required) return [];
    const before = permission(true);
    if (['denied', 'restricted', 'unknown'].includes(before.status)) throw new Error(before.detail);
    const result = await sources({ width: 1, height: 1 });
    const after = permission(true);
    if (platform === 'darwin' && after.status !== 'granted') throw new Error(after.detail);
    const available = result
      .filter((s) => !s.thumbnail.isEmpty())
      .map((s) => ({ id: s.id, name: s.name }));
    if (!available.length)
      throw new Error(
        'No display is available for capture. Allow screen sharing, connect a display, and retry. If you just changed macOS permissions, restart the app.',
      );
    return available;
  }
  async function verify(screenId, required) {
    if (!required) return;
    if (!screenId) throw new Error('Choose a display to share before starting tracking.');
    const available = await displays(true);
    if (!available.some((s) => s.id === screenId))
      throw new Error('The selected display is no longer available. Choose a display again.');
  }
  return { permission, displays, verify, sources };
}
function readiness(config, permission, screenId, consent) {
  if (!config) return 'Refresh setup checks to connect to your HRMS portal.';
  if (!config.enabled)
    return 'Desktop tracking is disabled by your company. Ask an administrator to enable it in HR policies.';
  if (!config.checkedIn)
    return 'You are not checked in. Open Attendance, check in, then refresh setup checks.';
  if (config.screenshotsEnabled) {
    if (['denied', 'restricted', 'not-determined', 'unknown'].includes(permission.status))
      return permission.detail;
    if (!screenId) return 'Choose a display to share before starting tracking.';
  }
  if (!consent) return 'Acknowledge the tracking notice before starting.';
  return null;
}
module.exports = { createOnboarding, readiness, permissionSettings };
