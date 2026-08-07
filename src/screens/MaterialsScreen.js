// ─── MATERIAL LIST ───────────────────────────────────────────────────────────
// The list you actually take to the supply house.
//
// No built-in prices. Regional variation is enormous and a wrong price in a
// shopping list costs real money — you enter what you pay, or leave it blank.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Share, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  materialListFromDocument, applyPackaging, togglePurchased, listProgress, toSupplierText,
} from '../core/domain/materials';
import { lineItem, LineItemKind, formatMoney, toCents } from '../core/domain/money';
import { readScoped, writeScoped, recordFor, upsertRecord, UNFILED, LegacyAdapters } from '../core/domain/scopedStore';

const KEY = '@sc_material_lists_v1';
const ACTIVE_KEY = '@sc_active_project_v1';

// Things electricians buy constantly, so a list can be built by tapping.
const QUICK_ADD = [
  '1/2 EMT', '3/4 EMT', '1 EMT', '#12 THHN', '#14 THHN', '#12-2 NM', '#14-2 NM',
  '4in square box', 'single gang box', '1/2 EMT connector', '1/2 EMT coupling',
  'wire nuts', 'ground screws', 'mud ring', '20A breaker', '15A breaker',
  'duplex receptacle', 'single-pole switch', 'three-way switch', 'GFCI receptacle',
];

export default function MaterialsScreen({ C, setTab }) {
  // Which job this list belongs to. null is the unfiled list — the one that
  // existed before material lists knew about projects, kept exactly as it was.
  const [projectId, setProjectId] = useState(UNFILED);
  const [records, setRecords] = useState([]);
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [waste, setWaste] = useState(0);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [raw, activeRaw] = await Promise.all([
          AsyncStorage.getItem(KEY), AsyncStorage.getItem(ACTIVE_KEY),
        ]);
        // The old single-blob save becomes the unfiled record. Nothing is lost
        // and nothing is filed under a job it may not belong to.
        const { records: loaded } = readScoped(raw, { legacyToRecord: LegacyAdapters.materials });
        const active = typeof activeRaw === 'string' && activeRaw ? activeRaw : UNFILED;
        setRecords(loaded);
        setProjectId(active);
        const mine = recordFor(loaded, active);
        if (mine?.items) { setItems(mine.items); setWaste(mine.waste ?? 0); }
      } catch (e) { /* start empty */ }
      setSaved(true);
    })();
  }, []);

  const persist = async (nextItems, nextWaste = waste) => {
    setItems(nextItems);
    const next = upsertRecord(records, projectId, { items: nextItems, waste: nextWaste });
    setRecords(next);
    try { await AsyncStorage.setItem(KEY, writeScoped(next)); } catch (e) {
      Alert.alert('Not saved', 'This material list could not be written to the device — storage may be full.');
    }
  };

  // The generator works from a document, so a hand-built list is wrapped in one.
  const list = useMemo(() => {
    const doc = {
      id: 'local', number: 'LIST',
      lineItems: items.map((i, n) => lineItem({
        id: `l${n}`, kind: LineItemKind.MATERIAL, description: i.description,
        quantity: i.quantity, unitPriceCents: i.unitPriceCents,
      })),
    };
    return applyPackaging(materialListFromDocument(doc, { id: 'ml', createdAt: '', wastePercent: waste }));
  }, [items, waste]);

  const progress = listProgress(list);

  const add = (desc, quantity = 1, cents = null) => {
    const clean = String(desc).trim();
    if (!clean) return;
    persist([...items, { description: clean, quantity, unitPriceCents: cents }]);
    setName(''); setQty(''); setPrice('');
  };

  const addTyped = () => {
    const q = parseFloat(qty);
    add(name, Number.isFinite(q) && q > 0 ? q : 1, price.trim() ? toCents(price) : null);
  };

  const removeAt = (i) => persist(items.filter((_, n) => n !== i));

  const send = async () => {
    if (!list.items.length) return;
    try {
      await Share.share({ message: toSupplierText(list, { reference: 'SparkConnect material list' }) });
    } catch (e) { /* user cancelled */ }
  };

  if (saved === null) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 44 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="cart" size={20} color={C.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Material List</Text>
          <Text style={{ fontSize: 12, color: C.textTert }}>
            {progress.total ? `${progress.done} of ${progress.total} picked` : 'Build it, then send it'}
          </Text>
        </View>
      </View>

      {/* Add */}
      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border }}>
        <TextInput
          value={name} onChangeText={setName}
          placeholder="Item — e.g. 3/4 EMT" placeholderTextColor={C.placeholder}
          style={{ backgroundColor: C.inputBg, borderRadius: 10, padding: 12, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.inputBorder, marginBottom: 9 }}
        />
        <View style={{ flexDirection: 'row', gap: 9, marginBottom: 10 }}>
          <TextInput
            value={qty} onChangeText={setQty} keyboardType="numeric"
            placeholder="Qty" placeholderTextColor={C.placeholder}
            style={{ flex: 1, backgroundColor: C.inputBg, borderRadius: 10, padding: 12, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.inputBorder }}
          />
          <TextInput
            value={price} onChangeText={setPrice} keyboardType="numeric"
            placeholder="$ each (optional)" placeholderTextColor={C.placeholder}
            style={{ flex: 2, backgroundColor: C.inputBg, borderRadius: 10, padding: 12, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.inputBorder }}
          />
        </View>
        <TouchableOpacity onPress={addTyped} disabled={!name.trim()}
          style={{ backgroundColor: name.trim() ? C.blue : C.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center', minHeight: 46, justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: name.trim() ? '#fff' : C.textTert }}>Add Item</Text>
        </TouchableOpacity>
      </View>

      {/* Quick add */}
      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>QUICK ADD</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {QUICK_ADD.map((q) => (
          <TouchableOpacity key={q} onPress={() => add(q, 1)}
            style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, minHeight: 38, justifyContent: 'center' }}>
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: C.textSec }}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Waste */}
      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>WASTE ALLOWANCE</Text>
      <View style={{ flexDirection: 'row', gap: 7, marginBottom: 16 }}>
        {[0, 5, 10, 15].map((w) => (
          <TouchableOpacity key={w} onPress={() => { setWaste(w); persist(items, w); }}
            style={{
              flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', minHeight: 44, justifyContent: 'center',
              backgroundColor: waste === w ? C.blue : C.inputBg, borderWidth: 1.5, borderColor: waste === w ? C.blue : C.border,
            }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: waste === w ? '#fff' : C.textSec }}>{w}%</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {list.items.length > 0 && (
        <>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>
            THE LIST ({list.items.length})
          </Text>
          {list.items.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => setItems((prev) => prev.map((p, n) => (n === i ? p : p)))}
              activeOpacity={1}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: C.text }}>{item.description}</Text>
                <Text style={{ fontSize: 11, color: C.textTert, marginTop: 2 }}>
                  {item.packaging
                    ? `${item.packaging.packs} × ${item.packaging.packSize} ${item.packaging.packUnit.toLowerCase()}${item.packaging.surplus ? ` · ${item.packaging.surplus} spare` : ''}`
                    : `Qty ${item.quantity}`}
                  {item.baseQuantity !== item.quantity ? ` · was ${item.baseQuantity}` : ''}
                </Text>
              </View>
              {item.unitPriceCents != null && (
                <Text style={{ fontSize: 12.5, color: C.textSec }}>{formatMoney(item.unitPriceCents)}</Text>
              )}
              <TouchableOpacity onPress={() => removeAt(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={19} color={C.textTert} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}

          <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 13, marginTop: 14, borderWidth: 1, borderColor: C.border }}>
            {list.pricesComplete ? (
              <>
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>{formatMoney(list.estimatedTotalCents)}</Text>
                <Text style={{ fontSize: 11, color: C.textTert, marginTop: 2 }}>
                  From the prices you entered. Suppliers vary — confirm at the counter.
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: 12.5, color: C.textSec, lineHeight: 19 }}>
                No total shown — some items have no price. A partial total looks authoritative and is worse than none.
              </Text>
            )}
          </View>

          <TouchableOpacity onPress={send}
            style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 14, minHeight: 50, justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Send to Supplier</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Alert.alert('Clear the list?', 'This removes every item.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => persist([]) },
            ])}
            style={{ padding: 14, alignItems: 'center' }}>
            <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600' }}>Clear List</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => setTab && setTab('home')} style={{ padding: 14, alignItems: 'center' }}>
        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600' }}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
