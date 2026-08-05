# Launch crash — builds 6 and 9

Three `.ips` reports, all `EXC_CRASH (SIGABRT)`, `abort() called`.

| | build 6 (11:05, 11:30) | build 9 (12:05) |
|---|---|---|
| faulting queue | `expo.controller.errorRecoveryQueue` | `com.facebook.react.ExceptionsManagerQueue` |
| top app frames | `-[NSException raise]` | `objc_exception_rethrow`, `-[NSInvocation invoke]` |
| binary size | 15,597,568 | 10,813,440 |

## What the queue change means

Build 6 aborted inside **expo-updates'** error-recovery controller. Removing
`expo-updates` (commit `3c18feb`) killed that path — build 9's binary is 4.8 MB
smaller and the errorRecoveryQueue frame is gone.

Build 9 aborts somewhere else. `com.facebook.react.ExceptionsManagerQueue` is
the `methodQueue` of `RCTExceptionsManager` and nothing else runs on it. Reaching
it means JS called `ExceptionsManager.reportFatalException`, and in a release
build (no redbox) that ends in `RCTFatal` → `abort()`.

So build 9's crash is **a fatal JavaScript error**, not a native one.

## Why no error screen appeared

`index.js` wrapped the tree in a React error boundary in build 8. Boundaries only
catch errors thrown during **render or commit**. These do not reach one:

- a throw while the bundle is still evaluating its modules
- a throw from a `setTimeout` / native callback
- an unhandled promise rejection promoted to fatal

Any of those goes straight to the global handler and aborts. The boundary never
had a chance to draw anything, which is exactly what the user saw: instant close,
no screen.

## What was ruled out

Checked against the last known-good tree (`main`, the v1.0.0 App Store build):

- **JS the engine can't run.** No regex lookbehind, no `\p{…}` property escapes,
  no `structuredClone` / `Object.groupBy` / `toSorted`. Nothing Hermes rejects.
- **Missing native modules.** The production iOS bundle (933 modules) was built
  and then **executed** in a sandboxed VM with stubbed native modules. It
  evaluates to completion without throwing. Dev-only modules (`EXDevLauncher`,
  `ExpoUpdates`) were forced absent to match the device.
- **Dependency drift.** Every package matches the Expo SDK 54 bundled version
  exactly.
- **RevenueCat.** `react-native-purchases` is a dependency but is never imported
  or configured; it cannot throw at launch.
- **The nested `{"type":"module"}` marker `package.json` files** in `src/core`,
  `src/circuit`, `src/flags`, `src/privacy`, `src/nec`, `tests`. Metro bundles
  through them and the bundle evaluates; they are not the fault.

The error therefore does not reproduce anywhere off-device. It needs the real
binary to surface.

## What build 10 does about it

`index.js` no longer relies on a render boundary alone:

1. The global fatal handler is replaced **before `App.js` is evaluated**. A fatal
   JS error now renders `src/ErrorScreen.js` instead of calling `abort()`.
2. `App.js` is loaded with `require` inside `try/catch`, because a throw at
   module scope is a plain synchronous throw that no handler sees.
3. The render boundary stays underneath for ordinary render errors.
4. Every launch-path promise in `App.js` — storage reads, notification
   scheduling, badge clearing — carries a `.catch`, so none of them can become
   an unhandled rejection.

In `__DEV__` the trap defers to the redbox and stays out of the way.

Result: build 10 cannot hard-crash from a JavaScript error. If something is still
wrong, the screen names it and it can be screenshotted. If build 10 *still*
closes with no screen, the fault is native, not JS — which is itself the answer.

## Separately: the missing app icon

Not a format problem. Every PNG in `assets/` was the **stock Expo placeholder** —
the grey grid with concentric circles. Converting `icon.png` from indexed to RGB
in commit `59392bb` made it a valid App Store icon and left it a placeholder.

`assets/` now carries a generated SparkConnect mark: amber `#F4A11D` bolt on the
dark navy the splash already uses.

- `icon.png` — 1024×1024, RGB, **no alpha** (App Store rejects alpha)
- `adaptive-icon.png` — Android foreground, bolt inside the 66 % safe zone
- `splash-icon.png` — bolt on transparent, splash `backgroundColor` behind it
- `favicon.png` — 256×256, opaque

If the original logo file still exists, drop it in over `assets/icon.png` at
1024×1024 with no alpha channel and rebuild — nothing else needs to change.
