import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { usePro } from '../context/ProContext';

/**
 * Drop this at the TOP of your Box Fill and Conduit Fill screens.
 *
 * Props:
 *   remaining  {number}  - remaining free uses today
 *   limit      {number}  - total free uses per day (3)
 *   featureName {string} - e.g. "Box Fill calculations"
 */
export default function FreeUsageBar({ remaining, limit, featureName = 'calculations' }) {
  const { showPaywall, isPro } = usePro();
  if (isPro) return null;

  const used    = limit - remaining;
  const pct     = (used / limit) * 100;
  const isEmpty = remaining === 0;

  return (
    <View style={[styles.container, isEmpty && styles.containerWarning]}>
      <View style={styles.topRow}>
        <Text style={styles.label}>
          {isEmpty
            ? `Daily limit reached`
            : `${remaining} free ${featureName} left today`}
        </Text>
        <TouchableOpacity onPress={() => showPaywall('boxfill')} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
          <Text style={styles.upgradeLink}>Go Pro →</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${pct}%` },
            isEmpty ? styles.fillEmpty : used >= limit - 1 ? styles.fillWarning : styles.fillNormal,
          ]}
        />
      </View>

      {isEmpty && (
        <Text style={styles.emptyMsg}>
          Resets at midnight · Unlimited with Pro
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1D27',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#2A2D3A',
  },
  containerWarning: {
    borderColor: '#E74C3C55',
    backgroundColor: '#1F1215',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: '#8A8FA8',
  },
  upgradeLink: {
    fontSize: 12,
    color: '#F5A623',
    fontWeight: '600',
  },
  track: {
    height: 4,
    backgroundColor: '#2A2D3A',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  fillNormal:  { backgroundColor: '#F5A623' },
  fillWarning: { backgroundColor: '#E8832A' },
  fillEmpty:   { backgroundColor: '#E74C3C', width: '100%' },
  emptyMsg: {
    fontSize: 11,
    color: '#E74C3C',
    marginTop: 6,
    textAlign: 'center',
  },
});
