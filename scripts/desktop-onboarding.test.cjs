const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOnboarding, readiness } = require('../desktop/onboarding.cjs');
const config = { enabled: true, checkedIn: true, screenshotsEnabled: true };
function harness(
  status = 'granted',
  sources = async () => [{ id: 'screen-1', name: 'Display', thumbnail: { isEmpty: () => false } }],
  platform = 'darwin',
) {
  let calls = 0;
  return {
    service: createOnboarding({
      platform,
      systemPreferences: { getMediaAccessStatus: () => status },
      desktopCapturer: {
        getSources: async (...args) => {
          calls++;
          return sources(...args);
        },
      },
      timeoutMs: 15,
    }),
    calls: () => calls,
  };
}
test('enabled policy and missing attendance have a distinct actionable blocker', () => {
  assert.match(
    readiness({ ...config, checkedIn: false }, { status: 'granted' }, 'screen-1', true),
    /not checked in/,
  );
  assert.match(
    readiness({ ...config, enabled: false }, { status: 'granted' }, 'screen-1', true),
    /disabled by your company/,
  );
  assert.equal(readiness(config, { status: 'granted' }, 'screen-1', true), null);
});
test('denied or restricted access blocks capture before invoking native source enumeration', async () => {
  for (const status of ['denied', 'restricted', 'unknown']) {
    const h = harness(status);
    await assert.rejects(h.service.displays(true));
    assert.equal(h.calls(), 0);
  }
});
test('screenshots disabled need no native permission or source access', async () => {
  const h = harness('denied');
  assert.equal(h.service.permission(false).status, 'not-required');
  await h.service.verify('', false);
  assert.deepEqual(await h.service.displays(false), []);
  assert.equal(h.calls(), 0);
  assert.equal(
    readiness({ ...config, screenshotsEnabled: false }, { status: 'not-required' }, '', true),
    null,
  );
});
test('granted access still verifies a real available display', async () => {
  const h = harness();
  await h.service.verify('screen-1', true);
  await assert.rejects(h.service.verify('removed-screen', true), /no longer available/);
  await assert.rejects(harness('granted', async () => []).service.displays(true), /No display/);
  await assert.rejects(
    harness('granted', async () => [
      { id: 'screen-1', thumbnail: { isEmpty: () => true } },
    ]).service.displays(true),
    /No display/,
  );
});
test('system prompt cancellation leaves setup blocked and capture timeouts do not stack native prompts', async () => {
  await assert.rejects(harness('not-determined').service.displays(true), /Allow Screen Recording/);
  const h = harness('granted', () => new Promise(() => {}));
  await assert.rejects(h.service.displays(true), /did not respond/);
  await assert.rejects(h.service.displays(true), /still pending/);
  assert.equal(h.calls(), 1);
});
test('Linux uses display verification instead of claiming OS permission is granted', async () => {
  const h = harness(
    'unknown',
    async () => [{ id: 'screen-1', name: 'Portal screen', thumbnail: { isEmpty: () => false } }],
    'linux',
  );
  assert.equal(h.service.permission(true).status, 'select-display');
  await h.service.verify('screen-1', true);
});
