// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
// Build 9 crashed on launch with SIGABRT on com.facebook.react.ExceptionsManagerQueue.
// That queue only ever runs one thing: React Native handing a JS error it
// considers fatal to the native ExceptionsManager, which in a release build
// calls abort(). The app closes instantly, with no screen and no message.
//
// A React error boundary cannot help there. Boundaries only catch errors thrown
// during render or commit. Anything thrown while the bundle is still evaluating
// its modules — or later from a timer, a promise, or a native callback — goes
// straight to the global handler and kills the process.
//
// So the trap is installed here, first, before App.js is even evaluated:
//
//   1. Replace the global fatal handler so a JS error draws a screen instead of
//      aborting. Whatever went wrong, the user reads it and so do we.
//   2. Load App.js inside try/catch, because a throw at module scope is a plain
//      synchronous throw that never reaches any handler.
//   3. Keep the render-time boundary underneath for ordinary render errors.
//
// In development this stays out of the way and lets the redbox do its job.

import React from 'react';
import { registerRootComponent } from 'expo';

import ErrorScreen from './src/ErrorScreen';
import ErrorBoundary from './src/ErrorBoundary';

const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

// ─── 1. Global fatal trap ────────────────────────────────────────────────────
let launchError = null;
const subscribers = new Set();

function reportFatal(error) {
  launchError = error;
  subscribers.forEach((notify) => {
    try { notify(error); } catch (e) { /* a failing subscriber must not re-enter */ }
  });
}

const previousHandler =
  (global.ErrorUtils && global.ErrorUtils.getGlobalHandler && global.ErrorUtils.getGlobalHandler()) || null;

if (global.ErrorUtils && global.ErrorUtils.setGlobalHandler) {
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (IS_DEV) {
      // Redbox and Metro logs are more useful than our screen while developing.
      if (previousHandler) previousHandler(error, isFatal);
      return;
    }
    if (isFatal) {
      reportFatal(error);
      return; // returning without rethrowing is what stops the abort
    }
    if (previousHandler) previousHandler(error, isFatal);
  });
}

// ─── 2. Load the app ─────────────────────────────────────────────────────────
// require, not import: ES imports are hoisted above the handler installed
// above, which would defeat the whole point.
let App = null;
try {
  const loaded = require('./App');
  App = (loaded && loaded.default) || loaded;
  if (typeof App !== 'function') {
    throw new Error('App.js did not export a component (got ' + typeof App + ')');
  }
} catch (e) {
  launchError = e;
}

// ─── 3. Root ─────────────────────────────────────────────────────────────────
function Root() {
  const [error, setError] = React.useState(launchError);

  React.useEffect(() => {
    subscribers.add(setError);
    // A fatal can land between module evaluation and this effect running.
    if (launchError) setError(launchError);
    return () => { subscribers.delete(setError); };
  }, []);

  if (error) {
    return (
      <ErrorScreen
        error={error}
        phase="launch"
        onRetry={() => { launchError = null; setError(null); }}
      />
    );
  }

  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

registerRootComponent(Root);
