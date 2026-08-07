// ─── SPARKCONNECT PAYWALL ────────────────────────────────────────────────────
// Requirements: UI-02, UI-03, UI-04, UI-05, PWL-03, PWL-05
//
// Rewritten. What was wrong with the previous version:
//   1. Annual was badged "BEST VALUE" but the button said "Then $7.99/mo" and
//      called onStartTrial('sparkconnect_pro_monthly'). The highlighted plan was
//      not purchasable — the user could not give you the larger amount of money.
//   2. The price cards were plain <View>s. Nothing was selectable.
//   3. "Save 48%" was a hardcoded string that silently becomes false the moment
//      either price changes.
//   4. No Lifetime option, despite it being a live tier.
//   5. No Restore Purchases, which App Review requires.
//   6. A five-row feature table sat between the user and the price.
//
// All pricing, copy and terms now come from ./core/paywall/config, so the button
// can never disagree with the selected plan.

import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  buildPaywall, PACKS, Placement, Variant, ProductId,
  formatPrice, perAnswerCents, bestValuePack, matchesProduct,
} from './core/paywall/config';

/**
 * Can this plan actually be bought right now?
 *
 * `store` is the preflight diagnosis from src/purchases.js, run when the sheet
 * opened. Null means no check has finished — treated as available, because
 * greying out a working button on no evidence is worse than the occasional
 * honest error afterwards.
 */
const buyable = (store, productId) => {
  if (!store) return true;
  if (store.healthy) return true;
  // Subscriptions are sold from the Offering and one-time products from
  // getProducts. Asking the wrong source is how a plan that sells perfectly
  // well gets rendered as unavailable — which is worse than the bug it was
  // meant to catch.
  if (productId === ProductId.PRO_ANNUAL || productId === ProductId.PRO_MONTHLY) {
    return store.subscriptionsSellable !== false;
  }
  return store.returned.some((id) => matchesProduct(productId, id));
};

const C = {
  bg: '#0B0B12', card: '#15151F', cardSel: '#1E1608',
  orange: '#F97316', orangeSoft: 'rgba(249,115,22,0.12)',
  text: '#FFFFFF', sec: '#9CA3AF', muted: '#6B7280',
  green: '#22C55E', border: '#26263A', borderSel: '#F97316',
};

export default function SparkPaywall({
  visible = false,
  onClose,
  onPurchase,          // (productId) => Promise
  onStartTrial,        // legacy alias, still honoured
  onBuyPack,
  onRestore,
  onViewComparison,
  placement = Placement.SETTINGS_UPGRADE,
  variant = Variant.A_CURRENT,
  isPacks = false,
  reason,              // legacy prop, still honoured as the eyebrow
  store = null,        // preflight diagnosis — see src/core/paywall/storeDiagnosis
}) {
  const [selectedId, setSelectedId] = useState(ProductId.PRO_ANNUAL);
  const [busy, setBusy] = useState(false);
  const [selPack, setSelPack] = useState(ProductId.PACK_50);

  const model = useMemo(
    () => buildPaywall({ placement, variant, selectedProductId: selectedId }),
    [placement, variant, selectedId],
  );

  // If the store cannot sell the selected plan but can sell another, move the
  // selection rather than leaving somebody staring at a dead primary button.
  const selectedBuyable = buyable(store, selectedId);
  React.useEffect(() => {
    if (selectedBuyable || !store) return;
    const alt = model.plans.map((p) => p.id).find((id) => buyable(store, id));
    if (alt) setSelectedId(alt);
  }, [selectedBuyable, store, model.plans]);

  const buy = onPurchase ?? onStartTrial;

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn?.(); } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <SafeAreaView style={s.sheet}>
          <View style={s.handle} />
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} bounces={false}>
            <TouchableOpacity
              style={s.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              accessibilityLabel="Close"
              accessibilityRole="button">
              <Ionicons name="close" size={20} color={C.muted} />
            </TouchableOpacity>

            {/* The store already knew, when this sheet opened, that nothing
                would load. Saying so here is the difference between an
                unavailable plan and an app that looks broken after a tap. */}
            {!!store && store.everythingFailed && (
              <View style={s.outage}>
                <Ionicons name="cloud-offline-outline" size={18} color={C.sec} />
                <View style={{ flex: 1 }}>
                  <Text style={s.outageT}>Purchases are unavailable right now</Text>
                  <Text style={s.outageS}>{store.userMessage}</Text>
                </View>
              </View>
            )}

            {isPacks ? (
              <PacksView
                sel={selPack}
                onSel={setSelPack}
                busy={busy}
                store={store}
                onBuy={() => run(() => onBuyPack?.(selPack))}
                onClose={onClose}
              />
            ) : (
              <ProView
                model={model}
                reason={reason}
                busy={busy}
                store={store}
                onSelect={setSelectedId}
                onPurchase={() => run(() => buy?.(model.selectedProductId))}
                onBuyLifetime={() => run(() => buy?.(ProductId.LIFETIME_TOOLS))}
                onViewComparison={onViewComparison}
                onClose={onClose}
              />
            )}

            {model.showRestore && (
              <TouchableOpacity
                style={s.restore}
                onPress={() => run(onRestore)}
                accessibilityRole="button"
                accessibilityLabel="Restore purchases">
                <Text style={s.restoreT}>Restore Purchases</Text>
              </TouchableOpacity>
            )}

            <Text style={s.legal}>
              {isPacks
                ? 'One-time purchase. Answers never expire. Managed by the App Store.'
                : model.terms}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ─── Pro ─────────────────────────────────────────────────────────────────────

function ProView({ model, reason, busy, store, onSelect, onPurchase, onBuyLifetime, onViewComparison, onClose }) {
  const { copy, plans, benefits, lifetime, cta } = model;
  const canBuySelected = buyable(store, model.selectedProductId);
  const canBuyLifetime = buyable(store, ProductId.LIFETIME_TOOLS);

  return (
    <>
      <Text style={s.eyebrow}>{reason || copy.eyebrow}</Text>
      <Text style={s.title}>{copy.headline}</Text>
      <Text style={s.sub}>{copy.sub}</Text>

      {/* Price first. The old paywall made people read a feature table before
          seeing a number, which is the fastest way to lose someone who was
          already ready to buy. */}
      <View style={s.plans}>
        {plans.map((p) => {
          const off = !buyable(store, p.id);
          return (
            <TouchableOpacity
              key={p.id}
              style={[s.plan, p.selected && s.planSel, off && s.planOff]}
              onPress={() => onSelect(p.id)}
              disabled={off}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ selected: p.selected, disabled: off }}
              accessibilityLabel={`${p.label}, ${p.priceLabel}${p.perMonthLabel ? `, ${p.perMonthLabel}` : ''}${off ? ', unavailable' : ''}`}>
              {p.savingPercent > 0 && !off && (
                <View style={s.saveTag}>
                  <Text style={s.saveTagT}>SAVE {p.savingPercent}%</Text>
                </View>
              )}
              <View style={s.planHead}>
                <View style={[s.radio, p.selected && s.radioSel]}>
                  {p.selected && <View style={s.radioDot} />}
                </View>
                <Text style={[s.planLabel, p.selected && s.planLabelSel]}>{p.label}</Text>
              </View>
              <Text style={s.planPrice}>{p.priceLabel}</Text>
              <Text style={s.planSub}>
                {off
                  ? 'Unavailable right now'
                  : `${p.period === 'YEAR' ? 'per year' : 'per month'}${p.perMonthLabel ? ` · ${p.perMonthLabel}` : ''}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[s.cta, (busy || !canBuySelected) && s.ctaBusy]}
        onPress={onPurchase}
        disabled={busy || !canBuySelected}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !canBuySelected }}
        accessibilityLabel={canBuySelected ? cta.title : 'This plan is unavailable right now'}>
        {busy
          ? <ActivityIndicator color="#fff" />
          : (
            <>
              <Text style={s.ctaT}>{canBuySelected ? cta.title : 'Unavailable right now'}</Text>
              {!!cta.sub && canBuySelected && <Text style={s.ctaS}>{cta.sub}</Text>}
            </>
          )}
      </TouchableOpacity>

      <View style={s.benefits}>
        {benefits.map((b, i) => (
          <View key={i} style={s.benefit}>
            <Ionicons name="checkmark-circle" size={17} color={C.green} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.benefitT}>{b.title}</Text>
              <Text style={s.benefitS}>{b.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      {!!onViewComparison && (
        <TouchableOpacity style={s.compare} onPress={onViewComparison} accessibilityRole="button">
          <Text style={s.compareT}>View full comparison</Text>
          <Ionicons name="chevron-forward" size={14} color={C.sec} />
        </TouchableOpacity>
      )}

      {/* UI-04 — Lifetime stays visually secondary. Given equal weight it
          cannibalises the subscription and stalls the user in a comparison. */}
      {/* Hidden rather than greyed when the store will not sell it. A
          secondary offer nobody can take is noise; a disabled plan card at
          least keeps the comparison legible. */}
      {!!lifetime && canBuyLifetime && (
        <TouchableOpacity
          style={s.lifetime}
          onPress={onBuyLifetime}
          disabled={busy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Lifetime Tools, ${lifetime.priceLabel}, one-time purchase`}>
          <View style={{ flex: 1 }}>
            <Text style={s.lifetimeT}>Not ready to subscribe?</Text>
            <Text style={s.lifetimeS}>
              Lifetime Tools · {lifetime.priceLabel} once · core calculators forever
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.sec} />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.free} onPress={onClose} activeOpacity={0.8} accessibilityRole="button">
        <Text style={s.freeT}>Continue with Free</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── Answer packs ────────────────────────────────────────────────────────────

function PacksView({ sel, onSel, busy, store, onBuy, onClose }) {
  const best = bestValuePack();
  const canBuy = buyable(store, sel);
  return (
    <>
      <Text style={s.eyebrow}>SparkAI</Text>
      <Text style={s.title}>Top up your answers</Text>
      <Text style={s.sub}>One-time purchase. They never expire and no subscription is needed.</Text>

      {PACKS.map((p) => {
        const selected = sel === p.id;
        const isBest = p.id === best.id;
        const off = !buyable(store, p.id);
        return (
          <TouchableOpacity
            key={p.id}
            style={[s.packRow, selected && s.packSel, off && s.planOff]}
            onPress={() => onSel(p.id)}
            disabled={off}
            activeOpacity={0.85}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: off }}>
            <View style={[s.radio, selected && s.radioSel]}>{selected && <View style={s.radioDot} />}</View>
            <View style={{ flex: 1 }}>
              <Text style={s.packLabel}>{p.label}</Text>
              <Text style={s.packUnit}>
                {off ? 'Unavailable right now' : `${(perAnswerCents(p) / 100).toFixed(2)} each`}
              </Text>
            </View>
            {isBest && !off && <View style={s.packTag}><Text style={s.packTagT}>BEST VALUE</Text></View>}
            <Text style={s.packPrice}>{formatPrice(p.priceCents)}</Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[s.cta, (busy || !canBuy) && s.ctaBusy]}
        onPress={onBuy}
        disabled={busy || !canBuy}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !canBuy }}>
        {busy
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.ctaT}>{canBuy ? 'Buy Answers' : 'Unavailable right now'}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={s.free} onPress={onClose} activeOpacity={0.8}>
        <Text style={s.freeT}>Maybe later</Text>
      </TouchableOpacity>
    </>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '94%' },
  handle: { width: 38, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  scroll: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 36 },
  closeBtn: { position: 'absolute', top: 2, right: 18, padding: 6, zIndex: 10 },

  eyebrow: { color: C.orange, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center', marginBottom: 8, marginTop: 6 },
  title: { color: C.text, fontSize: 27, fontWeight: '800', textAlign: 'center', marginBottom: 8, lineHeight: 33 },
  sub: { color: C.sec, fontSize: 14, textAlign: 'center', marginBottom: 22, lineHeight: 20, paddingHorizontal: 6 },

  plans: { flexDirection: 'row', gap: 11, marginBottom: 16 },
  plan: { flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 15, borderWidth: 2, borderColor: C.border, minHeight: 108 },
  planSel: { borderColor: C.borderSel, backgroundColor: C.cardSel },
  planOff: { opacity: 0.42 },

  outage: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 8, marginBottom: 4 },
  outageT: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 3 },
  outageS: { color: C.sec, fontSize: 12.5, lineHeight: 18 },

  planHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  planLabel: { color: C.sec, fontSize: 13, fontWeight: '700' },
  planLabelSel: { color: C.text },
  planPrice: { color: C.text, fontSize: 25, fontWeight: '800' },
  planSub: { color: C.muted, fontSize: 11, marginTop: 3, lineHeight: 15 },
  saveTag: { position: 'absolute', top: -9, right: 10, backgroundColor: C.orange, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  saveTagT: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioSel: { borderColor: C.orange },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.orange },

  cta: { backgroundColor: C.orange, borderRadius: 15, paddingVertical: 16, alignItems: 'center', marginBottom: 18, minHeight: 58, justifyContent: 'center' },
  ctaBusy: { opacity: 0.7 },
  ctaT: { color: '#fff', fontSize: 16.5, fontWeight: '800' },
  ctaS: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, marginTop: 3 },

  benefits: { gap: 11, marginBottom: 16 },
  benefit: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  benefitT: { color: C.text, fontSize: 14, fontWeight: '600' },
  benefitS: { color: C.muted, fontSize: 12, marginTop: 1 },

  compare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, marginBottom: 6 },
  compareT: { color: C.sec, fontSize: 13, fontWeight: '600' },

  lifetime: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  lifetimeT: { color: C.text, fontSize: 13.5, fontWeight: '700' },
  lifetimeS: { color: C.muted, fontSize: 11.5, marginTop: 2 },

  free: { paddingVertical: 13, alignItems: 'center', marginBottom: 4 },
  freeT: { color: C.sec, fontSize: 14, fontWeight: '600' },

  restore: { paddingVertical: 10, alignItems: 'center' },
  restoreT: { color: C.sec, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },

  legal: { color: C.muted, fontSize: 10.5, textAlign: 'center', lineHeight: 15, marginTop: 8, paddingHorizontal: 4 },

  packRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.card, borderRadius: 14, padding: 15, marginBottom: 10, borderWidth: 2, borderColor: C.border },
  packSel: { borderColor: C.borderSel, backgroundColor: C.cardSel },
  packLabel: { color: C.text, fontSize: 15, fontWeight: '700' },
  packUnit: { color: C.muted, fontSize: 11, marginTop: 2 },
  packTag: { backgroundColor: C.orangeSoft, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginRight: 8 },
  packTagT: { color: C.orange, fontSize: 9, fontWeight: '800' },
  packPrice: { color: C.text, fontSize: 16, fontWeight: '800' },
});

export { Placement, Variant };
