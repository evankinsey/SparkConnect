// ─── BLUEPRINT TAKEOFF ───────────────────────────────────────────────────────
// Photograph a plan sheet, get a device count back, push it into a material list.
//
// The screen owns the camera and the upload. It owns NO counting logic and no
// judgement about whether a number is believable — `src/core/field/takeoff.js`
// decides what is allowed through, and it is tested. A model that returns
// -3 receptacles must be stopped there, not here.

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  validateTakeoff, parseTakeoffReply, takeoffPrompt, takeoffRows,
  totalDevices, takeoffToMaterials, Confidence, TAKEOFF_DISCLAIMER,
} from '../core/field/takeoff';
import { expandTakeoff, expansionSummary } from '../core/field/assemblies';

import { messageFor, imageTooLarge } from '../core/ai/backendError';

export default function BlueprintScreen({ C, setTab, pickImage, askBackend, isPro, onUpgrade, onSendToMaterials }) {
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [takeoff, setTakeoff] = useState(null);
  const [error, setError] = useState(null);

  const choose = async (source) => {
    setError(null);
    try {
      const picked = await pickImage?.(source);
      if (!picked?.base64) return;
      setImage(picked);
      setTakeoff(null);
    } catch (e) {
      setError('Could not open the camera. Check permissions in Settings.');
    }
  };

  const run = async () => {
    if (!image?.base64) return;
    // Checked before the upload. Finding out after twenty seconds on a job site
    // is the same information at the worst possible moment.
    if (imageTooLarge(image.base64)) {
      setError('That photo is too large to send. Take the sheet from a little further back, or pick a smaller image.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await askBackend?.({
        question: takeoffPrompt(),
        image: image.base64,
        imageType: 'image/jpeg',
      });

      if (result === 'rate_limited') {
        setError('You are out of answers for today. A takeoff uses one SparkAI answer.');
        setBusy(false);
        return;
      }
      // A null result means the request never reached a working endpoint. Say
      // that plainly rather than showing an empty takeoff and letting the user
      // assume the sheet was unreadable.
      if (!result?.answer) {
        // Say which failure it was. This screen showed "check your connection"
        // on a working connection, because every backend failure was collapsed
        // to null before it got here.
        setError(messageFor(result) ?? 'That did not come back. Try again.');
        setBusy(false);
        return;
      }

      const parsed = parseTakeoffReply(result.answer);
      if (!parsed) {
        setError('SparkAI did not return a countable result. Try a straighter, closer shot of the sheet.');
        setBusy(false);
        return;
      }
      const v = validateTakeoff(parsed);
      if (!v.ok) { setError(v.reason); setBusy(false); return; }
      setTakeoff(v.takeoff);
    } catch (e) {
      setError('Something went wrong reading that sheet. Try again.');
    }
    setBusy(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.purpleBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="documents" size={20} color={C.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Blueprint Takeoff</Text>
          <Text style={{ fontSize: 12, color: C.textTert }}>Shoot the sheet. Get a device count.</Text>
        </View>
      </View>

      {/* The sheet */}
      {image ? (
        <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 10 }}>
          <Image source={{ uri: image.uri }} style={{ width: '100%', height: 210 }} resizeMode="cover" />
        </View>
      ) : (
        <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 22, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', alignItems: 'center', marginBottom: 10 }}>
          <Ionicons name="scan-outline" size={30} color={C.textTert} />
          <Text style={{ fontSize: 13, color: C.textSec, marginTop: 8, textAlign: 'center', lineHeight: 19 }}>
            Get the whole sheet in frame, square to the paper, with the legend visible if you can.
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity onPress={() => choose('camera')}
          style={{ flex: 1, flexDirection: 'row', gap: 6, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.border, minHeight: 48 }}>
          <Ionicons name="camera" size={16} color={C.textSec} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec }}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => choose('library')}
          style={{ flex: 1, flexDirection: 'row', gap: 6, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.border, minHeight: 48 }}>
          <Ionicons name="images" size={16} color={C.textSec} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec }}>Library</Text>
        </TouchableOpacity>
      </View>

      {image && !takeoff && (
        <TouchableOpacity onPress={run} disabled={busy}
          style={{ backgroundColor: busy ? C.border : C.purple, borderRadius: 12, paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center', marginBottom: 12 }}>
          {busy
            ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={C.textSec} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.textSec }}>Counting the sheet…</Text>
              </View>
            : <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Count devices</Text>}
        </TouchableOpacity>
      )}

      {error && (
        <View style={{ backgroundColor: C.dangerBg, borderRadius: 12, padding: 13, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: C.danger }}>
          <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 18 }}>{error}</Text>
        </View>
      )}

      {takeoff && (
        <Result
          C={C} takeoff={takeoff}
          onRedo={() => { setTakeoff(null); setError(null); }}
          onSendToMaterials={onSendToMaterials}
          setTab={setTab}
        />
      )}

      <Text style={{ fontSize: 10.5, color: C.textTert, lineHeight: 16, marginTop: 14 }}>{TAKEOFF_DISCLAIMER}</Text>
    </ScrollView>
  );
}

function Result({ C, takeoff, onRedo, onSendToMaterials, setTab }) {
  const rows = takeoffRows(takeoff);
  const low = takeoff.confidence === Confidence.LOW;
  const [showEstimate, setShowEstimate] = useState(false);
  const expansion = useMemo(() => expandTakeoff(takeoff), [takeoff]);

  return (
    <View>
      {/* Confidence is stated up front, not buried. A count off a phone photo
          of a drawing is a starting point and the screen has to say so. */}
      <View style={{
        backgroundColor: low ? C.amberBg : C.greenBg, borderRadius: 12, padding: 12, marginBottom: 10,
        flexDirection: 'row', alignItems: 'center', gap: 9,
      }}>
        <Ionicons name={low ? 'alert-circle' : 'checkmark-circle'} size={18} color={low ? C.amber : C.green} />
        <Text style={{ flex: 1, fontSize: 12, color: C.text, lineHeight: 17 }}>
          {low
            ? 'Low confidence on this sheet. Treat every number as a rough first pass.'
            : `${takeoff.confidence === Confidence.HIGH ? 'Good' : 'Reasonable'} read — still check it against the sheet.`}
        </Text>
      </View>

      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ flex: 1, fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.6 }}>
            {takeoff.sheetLabel ? takeoff.sheetLabel.toUpperCase() : 'DEVICE COUNT'}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '800', color: C.text }}>{totalDevices(takeoff)} total</Text>
        </View>
        {rows.map((r) => (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
            <Ionicons name={r.icon} size={15} color={C.textTert} />
            <Text style={{ flex: 1, fontSize: 13, color: C.text }}>{r.label}</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{r.count}</Text>
          </View>
        ))}
      </View>

      {takeoff.dropped.length > 0 && (
        <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <Text style={{ fontSize: 11.5, color: C.text, lineHeight: 17 }}>
            Unreadable values were dropped rather than guessed: {takeoff.dropped.join(', ')}. Count those by hand.
          </Text>
        </View>
      )}

      {takeoff.notes.length > 0 && (
        <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 13, borderWidth: 1, borderColor: C.border, marginBottom: 10 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 6 }}>NOTES FROM THE SHEET</Text>
          {takeoff.notes.map((n, i) => (
            <Text key={i} style={{ fontSize: 12, color: C.text, lineHeight: 18 }}>• {n}</Text>
          ))}
        </View>
      )}

      {/* Estimator view: the count expanded into a bill of material plus the
          hours to hang it. A device count is not a bid; this is what turns one
          into the start of one. */}
      <TouchableOpacity onPress={() => setShowEstimate((v) => !v)}
        accessibilityRole="button" accessibilityLabel="Expand into materials and labor"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.purpleBg, borderRadius: 12, padding: 13, marginBottom: 10 }}>
        <Ionicons name="construct" size={17} color={C.purple} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.purple }}>Estimator view</Text>
          <Text style={{ fontSize: 11, color: C.textSec }}>{expansionSummary(expansion)}</Text>
        </View>
        <Ionicons name={showEstimate ? 'chevron-up' : 'chevron-down'} size={15} color={C.purple} />
      </TouchableOpacity>

      {showEstimate && (
        <View style={{ marginBottom: 10 }}>
          <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.6, marginBottom: 9 }}>BILL OF MATERIAL</Text>
            {expansion.materials.map((m, i) => (
              <View key={i} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
                <Text style={{ flex: 1, fontSize: 12.5, color: C.text }}>{m.item}</Text>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.text }}>{m.qty} {m.unit}</Text>
              </View>
            ))}
          </View>

          <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', marginBottom: 9 }}>
              <Text style={{ flex: 1, fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.6 }}>LABOR</Text>
              <Text style={{ fontSize: 12, fontWeight: '800', color: C.text }}>{expansion.totalHours} hrs</Text>
            </View>
            {expansion.labor.map((l) => (
              <View key={l.id} style={{ flexDirection: 'row', paddingVertical: 5 }}>
                <Text style={{ flex: 1, fontSize: 12, color: C.text }}>{l.label} × {l.count}</Text>
                <Text style={{ fontSize: 12, color: C.textSec }}>{l.hours} hrs</Text>
              </View>
            ))}
          </View>

          <Text style={{ fontSize: 10.5, color: C.textTert, lineHeight: 16, marginBottom: 4 }}>{expansion.laborDisclaimer}</Text>
          <Text style={{ fontSize: 10.5, color: C.textTert, lineHeight: 16 }}>{expansion.wireDisclaimer}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          onPress={() => {
            const mats = showEstimate ? expansion.materials : takeoffToMaterials(takeoff);
            if (onSendToMaterials) { onSendToMaterials(mats); return; }
            Alert.alert('Material list', `${mats.length} lines ready. Open Material List to price them.`);
          }}
          style={{ flex: 2, backgroundColor: C.green, borderRadius: 12, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#fff' }}>Send to Material List</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRedo}
          style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', minHeight: 48 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec }}>Redo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
