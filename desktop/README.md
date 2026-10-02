# Open HRMS Desktop

Separate Electron app for Windows, macOS, and Linux. The source and packaging
configuration are included. The macOS ARM64 package and launch have been tested
locally; Windows/Linux packaging and real screen-capture permission flows still
need verification on those systems. Signed/notarized installers are not published.

## Run from source

From the repository root, with Node.js 24:

```sh
npm --prefix desktop ci
npm --prefix desktop start
```

If your npm installation blocks dependency install scripts, allow Electron's
install script through your npm policy so its runtime binary can be downloaded.

1. In the web portal, an administrator enables desktop tracking in **HR policies**.
2. Sign in as the employee and check in under **Attendance**.
3. Open **Work activity**, name the computer, and create a one-time pairing code.
4. In the desktop app, enter the portal origin (for example `https://hr.example.com`;
   local development uses `http://127.0.0.1:3000`) and the pairing code.
5. The app automatically checks company policy, attendance, and screen permission.
   If attendance is missing, use **Open Attendance**, check in, then return to the
   desktop app. Setup rechecks automatically when the app regains focus.
6. If screenshots are enabled, use **Allow screen recording & choose display**.
   On macOS, denied access shows **Open Screen Recording settings** and **Restart
   app**. Enable **Open HRMS Desktop** for the packaged app, or **Electron** when
   running from source. Restart after changing permission if macOS still reports
   it as blocked. Restricted access may require your device administrator.
7. Select the shared display and acknowledge the tracking notice. **Start tracking**
   becomes available only after every check passes. A tiny capture verifies display
   access during setup/start; it is never stored or uploaded.
8. Pause when needed. Closing the app, locking/sleeping, or an upload failure stops
   tracking. Restart manually after returning. Check out separately in the portal.

macOS requires Screen Recording permission for screenshots. Linux/Wayland may show
an OS display-selection prompt and may provide only one source through PipeWire.
Capture behavior depends on the operating system; see the
[Electron desktopCapturer documentation](https://www.electronjs.org/docs/latest/api/desktop-capturer/).

The UI runs sandboxed with no Node.js integration, no remote page loading, and a
restricted preload bridge. HTTPS is required except on loopback. Pairing tokens
stay in the main process and are saved only when OS-backed secure storage is
available. On Linux, insecure `basic_text` storage is not used. Otherwise pairing
is required after restart. Tokens are scoped to tracking endpoints and expire in
seven days; revoke a lost computer from the portal.

The app samples recent computer interaction, not keystrokes or app titles. It
uploads no screenshots while paused or inactive and keeps no offline queue.
Screenshot intervals and retention are controlled in HR policies. Activity is not
a performance score and does not affect salary.

## Build an installer

Build on each target platform for reliable native packaging:

```sh
npm --prefix desktop ci
npm --prefix desktop run check
npm --prefix desktop run package
npm --prefix desktop run dist
```

Targets: macOS DMG, Windows NSIS, Linux AppImage. Output is in `desktop/release/`
and is ignored by Git. Production distribution needs your own platform signing,
macOS notarization, platform testing, and release/update process. There is no
automatic updater in this release.

## Onboarding checks

From the repository root:

```sh
node --test scripts/desktop-onboarding.test.cjs
node scripts/desktop-onboarding-smoke.mjs
```

The macOS UI smoke test uses a local mock service and mocked OS capture to exercise
missing attendance, denied/granted permissions, display selection, start/pause,
and screenshots-disabled mode without collecting real screen content. Real OS
permission prompts still require an interactive check on each target platform.
Permission status handling follows Electron's [systemPreferences API](https://www.electronjs.org/docs/latest/api/system-preferences).
