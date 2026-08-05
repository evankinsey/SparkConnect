// ─── ERROR BOUNDARY ──────────────────────────────────────────────────────────
// Without this, one render error anywhere white-screens the whole app and the
// user sees a crash with no information and no way out.
//
// With it they get the actual error message and a Try Again button — and so do
// you, from a screenshot, without needing Xcode device logs.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[SparkConnect] render error:', error, info);
    }
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const message = String(error && (error.message || error));
    const stack = String((info && info.componentStack) || (error && error.stack) || '')
      .split('\n')
      .slice(0, 12)
      .join('\n');

    return (
      <View style={{ flex: 1, backgroundColor: '#0B0B12', paddingTop: 80, paddingHorizontal: 22 }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 10 }}>
          SparkConnect hit an error
        </Text>
        <Text style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 20, marginBottom: 18 }}>
          The app caught this instead of closing. Screenshot this screen and send it over — the
          text below says exactly what went wrong.
        </Text>

        <ScrollView style={{ maxHeight: 320, backgroundColor: '#15151F', borderRadius: 12, padding: 14 }}>
          <Text selectable style={{ color: '#F97316', fontSize: 13, fontWeight: '700', marginBottom: 10 }}>
            {message}
          </Text>
          <Text selectable style={{ color: '#6B7280', fontSize: 11, lineHeight: 16 }}>
            {stack}
          </Text>
        </ScrollView>

        <TouchableOpacity
          onPress={() => this.setState({ error: null, info: null })}
          style={{ backgroundColor: '#F97316', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 }}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Try Again</Text>
        </TouchableOpacity>

        <Text style={{ color: '#6B7280', fontSize: 10.5, marginTop: 14 }}>
          {Platform.OS} · SparkConnect 1.0.1
        </Text>
      </View>
    );
  }
}
