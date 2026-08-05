// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
// Builds 6, 9 and 10 all died the same way: EXC_CRASH / SIGABRT, faulting queue
// com.facebook.react.ExceptionsManagerQueue. Only RCTExceptionsManager runs on
// that queue, so every one of them was a JavaScript error handed to native,
// turned into RCTFatal, and ended in abort(). No screen, no message.
//
// Build 8 wrapped the tree in a React error boundary. Boundaries only catch
// errors thrown during render or commit — a throw during module evaluation, or
// from a timer or a native callback, never reaches one.
//
// Build 10 replaced ErrorUtils' global handler. It still aborted, because
// ExceptionsManager consults global.RN$handleException *first*, and because the
// replacement was installed after `expo` and the rest of this file's imports had
// already been evaluated.
//
// So the order here is deliberate and load-bearing:
//
//   1. ./src/errorTrap has zero imports and covers both fatal paths. It is the
//      first thing in the bundle after React Native's own core setup.
//   2. Everything else is loaded with require() inside try/catch, including
//      `expo` itself, because a throw at module scope is a plain synchronous
//      throw that no error handler ever sees.
//   3. If expo's registerRootComponent is the thing that failed, fall back to
//      AppRegistry directly so the error still gets drawn.
//
// In development the trap stays out of the way and lets the redbox work.

import './src/errorTrap';

import { capture, getCapturedError, clearCapturedError, subscribe } from './src/errorTrap';
import React from 'react';
import ErrorScreen from './src/ErrorScreen';
import ErrorBoundary from './src/ErrorBoundary';

// ─── Load expo and the app defensively ───────────────────────────────────────
let registerRootComponent = null;
try {
  registerRootComponent = require('expo').registerRootComponent;
} catch (e) {
  capture(e, 'expo');
}

let App = null;
try {
  const loaded = require('./App');
  App = (loaded && loaded.default) || loaded;
  if (typeof App !== 'function') {
    throw new Error('App.js did not export a component (got ' + typeof App + ')');
  }
} catch (e) {
  capture(e, 'App.js');
}

// ─── Root ────────────────────────────────────────────────────────────────────
function Root() {
  const [failure, setFailure] = React.useState(getCapturedError());

  React.useEffect(() => {
    const unsubscribe = subscribe(setFailure);
    // A fatal can land between module evaluation and this effect running.
    const now = getCapturedError();
    if (now) setFailure(now);
    return unsubscribe;
  }, []);

  if (failure || !App) {
    const detail = failure || { error: new Error('App.js failed to load'), source: 'App.js' };
    return (
      <ErrorScreen
        error={detail.error}
        source={detail.source}
        phase="launch"
        onRetry={() => { clearCapturedError(); setFailure(null); }}
      />
    );
  }

  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

// ─── Register ────────────────────────────────────────────────────────────────
if (registerRootComponent) {
  registerRootComponent(Root);
} else {
  // expo failed to load. Register directly so the error screen still appears
  // instead of the app dying with a blank window.
  require('react-native').AppRegistry.registerComponent('main', () => Root);
}
