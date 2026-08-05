// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
// SAFE BOOT — build 12 is a controlled experiment, not another speculative fix.
//
// Builds 6, 9, 10 and 11 all died the same way: EXC_CRASH / SIGABRT on
// com.facebook.react.ExceptionsManagerQueue, and progressively faster
// (635 ms → 343 ms → 130 ms → 93 ms).
//
// Build 11 installed a trap covering both of React Native's fatal paths —
// global.RN$handleException and ErrorUtils.setGlobalHandler. In React Native
// 0.81.5 those are the only two routes to NativeExceptionsManager.reportException,
// which is the only call that reaches RCTFatal and abort(). The trap was verified
// against a real production bundle. Build 11 aborted anyway.
//
// There is only one explanation left: this JavaScript is not running when the
// app dies. The failure is below the bundle — native module setup, the embedded
// bundle itself, or the build configuration.
//
// So build 12 changes exactly ONE variable. Nothing in app.json, eas.json or
// package.json moved. This file now boots the smallest possible React tree:
// React, four React Native primitives, and nothing else. App.js is not
// evaluated until the button is pressed.
//
//   • Crashes before the boot screen appears  → the fault is native/build
//     configuration. JavaScript is exonerated and I stop editing it.
//   • Boot screen appears                     → the JS runtime is healthy and
//     the fault is inside App.js's tree, which "Open SparkConnect" then isolates
//     with the error trap already armed.
//
// Either outcome is decisive. To turn this off, set SAFE_BOOT to false below.

import './src/errorTrap';

import { capture, getCapturedError, clearCapturedError, subscribe } from './src/errorTrap';
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';

const SAFE_BOOT = true;

// Checkpoints, recorded as this file evaluates. Whatever the last one says is
// how far the bundle got.
const checkpoints = [];
const mark = (label) => { checkpoints.push(label); return label; };

mark('01 entry module evaluated');
mark('02 error trap installed');
mark('03 react + react-native primitives loaded');

// `expo` is loaded here because registerRootComponent needs it. If this is the
// thing that fails, AppRegistry below still gets the screen up.
let registerRootComponent = null;
try {
  registerRootComponent = require('expo').registerRootComponent;
  mark('04 expo loaded');
} catch (e) {
  mark('04 expo FAILED');
  capture(e, 'expo');
}

// ─── Boot screen ─────────────────────────────────────────────────────────────
function BootScreen({ onOpen, failure }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#050A14', paddingTop: 74, paddingHorizontal: 22 }}>
      <Text style={{ color: '#F4A11D', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 }}>
        SAFE BOOT
      </Text>
      <Text style={{ color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginBottom: 6 }}>
        JavaScript is running
      </Text>
      <Text style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 20, marginBottom: 18 }}>
        If you can read this, the bundle loaded and the engine is healthy. Screenshot it, then
        press the button to load the app itself.
      </Text>

      <ScrollView style={{ maxHeight: 250, backgroundColor: '#0F1524', borderRadius: 12, padding: 14 }}>
        {checkpoints.map((c) => (
          <Text key={c} selectable style={{ color: '#6B7280', fontSize: 12, lineHeight: 19 }}>
            {c}
          </Text>
        ))}
        <Text selectable style={{ color: '#6B7280', fontSize: 12, lineHeight: 19 }}>
          platform {Platform.OS} {String(Platform.Version)} · build 12
        </Text>
        {!!failure && (
          <Text selectable style={{ color: '#F4A11D', fontSize: 12.5, fontWeight: '700', marginTop: 10 }}>
            {String(failure.source)}: {String((failure.error && failure.error.message) || failure.error)}
          </Text>
        )}
      </ScrollView>

      <TouchableOpacity
        onPress={onOpen}
        style={{ backgroundColor: '#F4A11D', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 22 }}>
        <Text style={{ color: '#050A14', fontSize: 15, fontWeight: '800' }}>Open SparkConnect</Text>
      </TouchableOpacity>

      <Text style={{ color: '#4B5563', fontSize: 11, lineHeight: 17, marginTop: 14 }}>
        If pressing that closes the app, the fault is inside App.js and we have it cornered.
      </Text>
    </View>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────
function Root() {
  const [opened, setOpened] = React.useState(!SAFE_BOOT);
  const [failure, setFailure] = React.useState(getCapturedError());

  React.useEffect(() => {
    const unsubscribe = subscribe(setFailure);
    const now = getCapturedError();
    if (now) setFailure(now);
    return unsubscribe;
  }, []);

  if (!opened) {
    return <BootScreen failure={failure} onOpen={() => setOpened(true)} />;
  }

  // Loaded only now — App.js and everything it imports stay unevaluated until
  // the user asks for them.
  let App = null;
  let ErrorBoundary = null;
  try {
    const loaded = require('./App');
    App = (loaded && loaded.default) || loaded;
    if (typeof App !== 'function') {
      throw new Error('App.js did not export a component (got ' + typeof App + ')');
    }
    ErrorBoundary = require('./src/ErrorBoundary').default;
  } catch (e) {
    capture(e, 'App.js');
  }

  const current = failure || getCapturedError();
  if (current || !App) {
    const ErrorScreen = require('./src/ErrorScreen').default;
    const detail = current || { error: new Error('App.js failed to load'), source: 'App.js' };
    return (
      <ErrorScreen
        error={detail.error}
        source={detail.source}
        phase="launch"
        onRetry={() => { clearCapturedError(); setFailure(null); setOpened(false); }}
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
  require('react-native').AppRegistry.registerComponent('main', () => Root);
}
