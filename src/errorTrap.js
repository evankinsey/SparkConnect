// ─── ERROR TRAP ──────────────────────────────────────────────────────────────
// THIS FILE MUST IMPORT NOTHING. It is the first module index.js loads, and it
// has to be running before `expo`, before `react`, before anything of ours — an
// error thrown while those are still evaluating happens before any handler we
// install later would exist.
//
// React Native turns a JS error into a process abort down two paths:
//
//   ErrorUtils.setGlobalHandler(...)      ← setUpErrorHandling.js, and
//                                            MessageQueue's reportFatalError
//   global.RN$handleException(...)        ← installed natively, consulted first
//                                            by ExceptionsManager.handleException
//
// Build 10 still aborted on com.facebook.react.ExceptionsManagerQueue after the
// build-9 fix replaced only the first one. Both are covered here. Returning
// truthy from RN$handleException is what tells ExceptionsManager the error is
// handled, so it never calls NativeExceptionsManager.reportException — which is
// the call that ends in RCTFatal and abort().

const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

let captured = null;
const subscribers = new Set();

// First error wins. Whatever comes after it is usually fallout from the first.
export function capture(error, source) {
  if (captured) return true;
  captured = { error, source: source || 'unknown' };
  subscribers.forEach((notify) => {
    try { notify(captured); } catch (e) { /* a failing subscriber must not re-enter */ }
  });
  return true;
}

export function getCapturedError() { return captured; }

export function clearCapturedError() { captured = null; }

export function subscribe(fn) {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

if (!IS_DEV) {
  // ── Path 1: the native-installed fast path ────────────────────────────────
  // ExceptionsManager.handleException consults this before reporting to native.
  const priorRNHandle = global.RN$handleException;
  global.RN$handleException = function (error, isFatal, reportToConsole) {
    if (isFatal) return capture(error, 'RN$handleException');
    // Non-fatal: let the normal reporting happen, but never let *its* failure
    // escalate. React Native's own handler rethrows if reporting throws, and a
    // rethrow from here is exactly how a warning turns into a dead app.
    try {
      if (priorRNHandle) return priorRNHandle(error, isFatal, reportToConsole);
    } catch (e) { /* reporting a warning must never crash the app */ }
    return false;
  };

  // ── Path 2: ErrorUtils ────────────────────────────────────────────────────
  const EU = global.ErrorUtils;
  if (EU && typeof EU.setGlobalHandler === 'function') {
    const prior = typeof EU.getGlobalHandler === 'function' ? EU.getGlobalHandler() : null;
    EU.setGlobalHandler(function (error, isFatal) {
      if (isFatal) {
        capture(error, 'ErrorUtils');
        return; // returning without rethrowing is what stops the abort
      }
      try {
        if (prior) prior(error, isFatal);
      } catch (e) { /* see above: reporting a warning must never crash the app */ }
    });
  }
}
