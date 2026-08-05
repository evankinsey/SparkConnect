// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
// This file is armored, and the armor is not decorative. Builds 6-13 all died
// at launch with SIGABRT on com.facebook.react.ExceptionsManagerQueue. The
// cause (found via the SAFE_BOOT diagnostic below, build 13) was a brace
// mangle in App.js that left SplashScreen and friends function-scoped -
// "ReferenceError: Property 'SplashScreen' doesn't exist" on first render.
// tests/scope.test.js now guards that class of bug at test time; this file
// guards it at runtime:
//
//   1. ./src/errorTrap imports nothing and loads first, covering both of
//      React Native's fatal paths (RN$handleException + ErrorUtils) so a
//      fatal JS error draws a screen instead of calling abort().
//   2. expo and App.js load via require() inside try/catch - a throw at
//      module scope never reaches any handler otherwise.
//   3. An ErrorBoundary covers ordinary render errors underneath.
//
// SAFE_BOOT=true boots a minimal diagnostic screen instead of the app, with
// App.js left unevaluated until a button press. Keep it off for releases.

import './src/errorTrap';

import { capture, getCapturedError, clearCapturedError, subscribe } from './src/errorTrap';
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';

const SAFE_BOOT = false; // flip to true to boot into the diagnostic screen instead of the app

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
          platform {Platform.OS} {String(Platform.Version)}
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
