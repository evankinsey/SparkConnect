// ─── ERROR SCREEN ────────────────────────────────────────────────────────────
// One screen, shared by the render-time boundary (src/ErrorBoundary.js) and the
// launch-time trap (index.js). Deliberately built from nothing but React Native
// primitives and inline styles: whatever broke, this has to be able to draw.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';

// A static JSON import — no code runs, so this cannot be the thing that breaks
// the screen whose job is to survive everything else breaking. The build number
// was hardcoded as "1.0.1" and had been wrong for ten builds, which made every
// crash screenshot lie about which binary produced it at the exact moment that
// is the first thing you need to know.
import appJson from '../app.json';

const VERSION = appJson?.expo?.version ?? '?';
const BUILD = appJson?.expo?.ios?.buildNumber ?? String(appJson?.expo?.android?.versionCode ?? '?');

export default function ErrorScreen({ error, detail, source, phase = 'running', onRetry }) {
  const message = String((error && (error.message || error)) || 'Unknown error');
  const name = (error && error.name) || 'Error';
  const stack = String(detail || (error && error.stack) || '')
    .split('\n')
    .slice(0, 14)
    .join('\n');

  const heading = phase === 'launch' ? 'SparkConnect could not start' : 'SparkConnect hit an error';

  return (
    <View style={{ flex: 1, backgroundColor: '#050A14', paddingTop: 74, paddingHorizontal: 22 }}>
      <Text style={{ color: '#F4A11D', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 }}>
        {phase === 'launch' ? 'STARTUP' : 'RUNTIME'}
      </Text>
      <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 10 }}>{heading}</Text>
      <Text style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 20, marginBottom: 18 }}>
        The app caught this instead of closing. Screenshot this screen and send it over — the text
        below says exactly what went wrong and where.
      </Text>

      {/* THE MESSAGE LIVES OUTSIDE THE SCROLLER, and that is the fix rather than
          a tidy-up. It used to be the first line INSIDE a 300pt box holding
          fourteen frames of minified bundle paths, so a screenshot of a scrolled
          box showed nothing but `main.jsbundle:79961:44` — the one part nobody
          can read without a source map — while the sentence naming the fault had
          scrolled away. The screen asks for a screenshot; it has to guarantee
          that the screenshot carries the answer. */}
      <View style={{ backgroundColor: '#0F1524', borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 14, paddingBottom: 10 }}>
        <Text selectable style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
          {name}{source ? '  ·  caught in: ' + source : ''}
        </Text>
        <Text selectable style={{ color: '#F4A11D', fontSize: 13, fontWeight: '700' }}>
          {message}
        </Text>
      </View>

      {!!stack && (
        <ScrollView style={{ maxHeight: 260, backgroundColor: '#0B1120', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, paddingHorizontal: 14, paddingBottom: 14 }}>
          <Text selectable style={{ color: '#6B7280', fontSize: 11, lineHeight: 16 }}>
            {stack}
          </Text>
        </ScrollView>
      )}

      {!!onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={{ backgroundColor: '#F4A11D', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 }}>
          <Text style={{ color: '#050A14', fontSize: 15, fontWeight: '800' }}>Try Again</Text>
        </TouchableOpacity>
      )}

      <Text style={{ color: '#4B5563', fontSize: 10.5, marginTop: 14 }}>
        {Platform.OS} · SparkConnect {VERSION} ({BUILD})
      </Text>
    </View>
  );
}
