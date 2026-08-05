// ─── ERROR BOUNDARY ──────────────────────────────────────────────────────────
// Catches errors thrown while React is rendering or committing. That is only
// half the problem — errors thrown at module-evaluation time, or later from a
// timer or a native callback, never reach a boundary and abort the process
// instead. index.js installs the global trap that covers those.

import React from 'react';
import ErrorScreen from './ErrorScreen';

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

    return (
      <ErrorScreen
        error={error}
        detail={info && info.componentStack}
        phase="running"
        onRetry={() => this.setState({ error: null, info: null })}
      />
    );
  }
}
