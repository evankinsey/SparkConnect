// ─── ERROR SCREEN ────────────────────────────────────────────────────────────
// One screen, shared by the render-time boundary (src/ErrorBoundary.js) and the
// launch-time trap (index.js). Deliberately built from nothing but React Native
// primitives and inline styles: whatever broke, this has to be able to draw.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';

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

      <ScrollView style={{ maxHeight: 300, backgroundColor: '#0F1524', borderRadius: 12, padding: 14 }}>
        <Text selectable style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
          {name}{source ? '  ·  caught in: ' + source : ''}
        </Text>
        <Text selectable style={{ color: '#F4A11D', fontSize: 13, fontWeight: '700', marginBottom: 10 }}>
          {message}
        </Text>
        {!!stack && (
          <Text selectable style={{ color: '#6B7280', fontSize: 11, lineHeight: 16 }}>
            {stack}
          </Text>
        )}
      </ScrollView>

      {!!onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={{ backgroundColor: '#F4A11D', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 }}>
          <Text style={{ color: '#050A14', fontSize: 15, fontWeight: '800' }}>Try Again</Text>
        </TouchableOpacity>
      )}

      <Text style={{ color: '#4B5563', fontSize: 10.5, marginTop: 14 }}>
        {Platform.OS} · SparkConnect 1.0.1
      </Text>
    </View>
  );
}
