import React from 'react';
import { registerRootComponent } from 'expo';

import App from './App';
import ErrorBoundary from './src/ErrorBoundary';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
// Wrapping at the root, not inside App(), so an error thrown during App's own
// render is still caught. A white screen tells nobody anything.
function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

registerRootComponent(Root);
