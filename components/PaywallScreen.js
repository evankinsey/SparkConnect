import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, SafeAreaView, ScrollView,
} from 'react-native';

// RevenueCat loaded at runtime — not available in Expo Go web preview
let Purchases = null;
let PACKAGE_TYPE = { ANNUAL: 'ANNUAL', MONTHLY: 'MONTHLY' };
try {
  const rc = require('react-native-purchases');
  Purchases = rc.default;
  if (rc.PACKAGE_TYPE) PACKAGE_TYPE = { ...PACKAGE_TYPE, ...rc.PACKAGE_TYPE };
} catch (e) { /* Expo Go / Snack web — RC not available */ }

const C = {
  bg: '#0F1117', card: '#1A1D27', border: '#2A2D3A',
  accent: '#F5A623', accentDim: '#3D2E0A',
  text: '#FFFFFF', textMuted: '#8A8FA8',
};

// Consumable answer pack product IDs — match App Store Connect exactly
const PACK_IDS = {
  PACK_15:  'sparky_answers_10',   // 15 answers  $1.99
  PACK_50:  'sparky_answers_30',   // 50 answers  $4.99
  PACK_150: 'sparky_answers_100',  // 150 answers $9.99
};
const PACK_FALLBACK_PRICES = {
  'sparky_answers_10':  '$1.99',
  'sparky_answers_30':  '$4.99',
  'sparky_answers_100': '$9.99',
};

const FEATURES = [
  { tag: 'AI',   text: 'Up to 20 Sparky AI answers/day (400/month fair-use cap)' },
  { tag: 'CALC', text: 'Unlimited Box Fill & Conduit Fill calculations' },
  { tag: '$',    text: 'Full Material Estimator with local pricing' },
  { tag: 'CAM',  text: 'Job Cam shared projects — up to 5 collaborators' },
  { tag: 'NEC',  text: 'NEC citation chips in every Sparky answer' },
  { tag: 'PACK', text: 'Extra answer packs available anytime' },
];

const HEADLINES = {
  boxfill:    'Keep calculating — go Pro',
  conduit:    'Keep calculating — go Pro',
  sparky:     'Sparky has more answers for you',
  sparky_cap: 'Monthly fair-use limit reached',
  estimator:  'Get real pricing in your area',
  general:    'Upgrade to SparkConnect Pro',
  packs:      'Top up your Sparky AI answers',
};
const SUBHEADS = {
  boxfill:    "You've used your 3 free Box Fill calculations today.",
  conduit:    "You've used your 3 free Conduit Fill calculations today.",
  sparky:     "You've hit today's free limit. Pro gets 20 answers/day.",
  sparky_cap: "You've hit the 400/month fair-use cap. Add an answer pack.",
  estimator:  'Pro members get a full Sparky AI pricing breakdown.',
  general:    'Everything you need on the job, unlimited.',
  packs:      'Buy a one-time pack — no subscription required.',
};

export default function PaywallScreen({ onDismiss, trigger = 'general' }) {
  const [offerings, setOfferings] = useState(null);
  const [packProducts, setPackProducts] = useState([]);
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchasingPackId, setPurchasingPackId] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const showPacks = trigger === 'sparky_cap' || trigger === 'packs' || trigger === 'sparky';

  useEffect(() => {
    if (!Purchases) return;
    Purchases.getOfferings()
      .then(o => {
        if (o.current) {
          setOfferings(o.current);
          const pkgs = o.current.availablePackages || [];
          const annual  = pkgs.find(p => p.packageType === PACKAGE_TYPE.ANNUAL);
          const monthly = pkgs.find(p => p.packageType === PACKAGE_TYPE.MONTHLY);
          setSelectedPkg(annual || monthly || pkgs[0]);
        }
      })
      .catch(() => {});
    Purchases.getProducts(Object.values(PACK_IDS))
      .then(prods => setPackProducts(prods || []))
      .catch(() => {});
  }, []);

  const getPrice = pkg => pkg?.product?.localizedPriceString ?? '—';
  const annualPkg  = offerings?.availablePackages?.find(p => p.packageType === PACKAGE_TYPE.ANNUAL);
  const monthlyPkg = offerings?.availablePackages?.find(p => p.packageType === PACKAGE_TYPE.MONTHLY);

  const handleSubscribe = async () => {
    if (!Purchases || !selectedPkg) {
      Alert.alert('Preview mode', 'Purchases require a real device with the production build.');
      return;
    }
    setIsPurchasing(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(selectedPkg);
      if (customerInfo.entitlements.active['pro']) {
        onDismiss?.('purchased');
      } else {
        Alert.alert('Purchase complete', 'Pro is not yet active. Try Restore Purchases.');
      }
    } catch (e) {
      if (!e.userCancelled) Alert.alert('Purchase failed', e.message);
    }
    setIsPurchasing(false);
  };

  const handleBuyPack = async productId => {
    if (!Purchases) {
      Alert.alert('Preview mode', 'Purchases require a real device with the production build.');
      return;
    }
    const prod = packProducts.find(p => p.productIdentifier === productId);
    if (!prod) {
      Alert.alert('Not available', 'Could not load this product. Please try again.');
      return;
    }
    setPurchasingPackId(productId);
    try {
      await Purchases.purchaseStoreProduct(prod);
      Alert.alert(
        'Answers added! ⚡',
        'Your Sparky AI answers have been added to your account.',
        [{ text: 'Got it', onPress: () => onDismiss?.('pack_purchased') }]
      );
    } catch (e) {
      if (!e.userCancelled) Alert.alert('Purchase failed', e.message);
    }
    setPurchasingPackId(null);
  };

  const handleRestore = async () => {
    if (!Purchases) {
      Alert.alert('Preview mode', 'Restore requires a real device with the production build.');
      return;
    }
    setIsRestoring(true);
    try {
      const info = await Purchases.restorePurchases();
      if (info.entitlements.active['pro']) {
        Alert.alert('Restored! ✅', 'Your Pro subscription is active.', [
          { text: 'OK', onPress: () => onDismiss?.('restored') },
        ]);
      } else {
        Alert.alert('Nothing to restore', 'No active Pro subscription found for this Apple ID.');
      }
    } catch (e) {
      Alert.alert('Restore failed', e.message);
    }
    setIsRestoring(false);
  };

  const packLabels = [
    { id: PACK_IDS.PACK_15,  label: '15 Sparky answers', hint: 'Good for a week' },
    { id: PACK_IDS.PACK_50,  label: '50 Sparky answers', hint: 'Most popular' },
    { id: PACK_IDS.PACK_150, label: '150 Sparky answers', hint: 'Best value' },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} bounces={false}>

        {/* Dismiss */}
        <TouchableOpacity
          style={s.dismiss}
          onPress={() => onDismiss?.('dismissed')}
          hitSlop={{ top: 12, left: 12, bottom: 12, right: 12 }}>
          <Text style={s.dismissX}>✕</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.bolt}>⚡</Text>
          <Text style={s.headline}>{HEADLINES[trigger] ?? HEADLINES.general}</Text>
          <Text style={s.sub}>{SUBHEADS[trigger] ?? SUBHEADS.general}</Text>
        </View>

        {/* Answer packs — shown when Sparky limit hit */}
        {showPacks && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Answer packs — one-time purchase</Text>
            {packLabels.map(({ id, label, hint }) => {
              const prod = packProducts.find(p => p.productIdentifier === id);
              const price = prod?.localizedPrice ?? PACK_FALLBACK_PRICES[id];
              const buying = purchasingPackId === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={s.packRow}
                  onPress={() => handleBuyPack(id)}
                  disabled={!!purchasingPackId}
                  activeOpacity={0.8}>
                  <View style={s.packLeft}>
                    <Text style={s.packLabel}>{label}</Text>
                    <Text style={s.packHint}>{hint}</Text>
                  </View>
                  <View style={s.packBtn}>
                    {buying
                      ? <ActivityIndicator color="#000" size="small" />
                      : <Text style={s.packBtnT}>{price}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Pro subscription section */}
        {trigger !== 'packs' && (
          <>
            <Text style={s.sectionTitle}>
              {showPacks ? 'Or go Pro for unlimited daily access' : 'What you get with Pro'}
            </Text>
            <View style={s.features}>
              {FEATURES.map((f, i) => (
                <View key={i} style={s.fRow}>
                  <Text style={s.fTag}>{f.tag}</Text>
                  <Text style={s.fText}>{f.text}</Text>
                </View>
              ))}
            </View>

            {/* Plan selector */}
            {!offerings ? (
              <ActivityIndicator color={C.accent} style={{ marginVertical: 20 }} />
            ) : (
              <View style={s.plans}>
                {annualPkg && (
                  <TouchableOpacity
                    style={[s.plan, selectedPkg?.packageType === PACKAGE_TYPE.ANNUAL && s.planSel]}
                    onPress={() => setSelectedPkg(annualPkg)}
                    activeOpacity={0.8}>
                    <View style={s.badge}><Text style={s.badgeT}>Save 48%</Text></View>
                    <Text style={s.planLabel}>Annual</Text>
                    <Text style={s.planPrice}>{getPrice(annualPkg)}</Text>
                    <Text style={s.planSub}>per year</Text>
                  </TouchableOpacity>
                )}
                {monthlyPkg && (
                  <TouchableOpacity
                    style={[s.plan, selectedPkg?.packageType === PACKAGE_TYPE.MONTHLY && s.planSel]}
                    onPress={() => setSelectedPkg(monthlyPkg)}
                    activeOpacity={0.8}>
                    <Text style={s.planLabel}>Monthly</Text>
                    <Text style={s.planPrice}>{getPrice(monthlyPkg)}</Text>
                    <Text style={s.planSub}>per month</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* CTA */}
            <TouchableOpacity
              style={[s.cta, (isPurchasing || !selectedPkg) && s.ctaDim]}
              onPress={handleSubscribe}
              disabled={isPurchasing || !selectedPkg}
              activeOpacity={0.85}>
              {isPurchasing ? <ActivityIndicator color="#000" /> : (
                <Text style={s.ctaT}>
                  {selectedPkg?.packageType === PACKAGE_TYPE.ANNUAL
                    ? `Start Pro — ${getPrice(annualPkg)}/yr`
                    : `Start Pro — ${getPrice(monthlyPkg)}/mo`}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={s.legal}>
              Subscription auto-renews. Cancel anytime in Settings → Apple ID → Subscriptions.{'\n'}
              Pro includes 20 Sparky answers/day with a 400/month fair-use cap. Packs available separately.
            </Text>

            <TouchableOpacity
              onPress={handleRestore}
              disabled={isRestoring}
              style={s.restore}>
              {isRestoring
                ? <ActivityIndicator color={C.textMuted} size="small" />
                : <Text style={s.restoreT}>Restore Purchases</Text>}
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  scroll:       { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 },
  dismiss:      { alignSelf: 'flex-end', marginTop: 16, marginBottom: 4, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderRadius: 15 },
  dismissX:     { color: C.textMuted, fontSize: 13, fontWeight: '600' },
  header:       { alignItems: 'center', marginTop: 4, marginBottom: 20 },
  bolt:         { fontSize: 44, marginBottom: 10 },
  headline:     { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 6 },
  sub:          { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: C.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  packRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: C.border },
  packLeft:     { flex: 1 },
  packLabel:    { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 2 },
  packHint:     { fontSize: 11, color: C.textMuted },
  packBtn:      { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, minWidth: 58, alignItems: 'center' },
  packBtnT:     { fontSize: 13, fontWeight: '700', color: '#000' },
  features:     { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 0.5, borderColor: C.border },
  fRow:         { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 9, gap: 10 },
  fTag:         { fontSize: 9, fontWeight: '700', color: C.accent, width: 32, textAlign: 'center', paddingTop: 2, letterSpacing: 0.3 },
  fText:        { fontSize: 13, color: C.text, flex: 1, lineHeight: 18 },
  plans:        { flexDirection: 'row', gap: 10, marginBottom: 16 },
  plan:         { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: C.border, paddingTop: 26, position: 'relative' },
  planSel:      { borderColor: C.accent, backgroundColor: C.accentDim },
  badge:        { position: 'absolute', top: -11, backgroundColor: C.accent, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 2 },
  badgeT:       { fontSize: 10, fontWeight: '700', color: '#000' },
  planLabel:    { fontSize: 11, color: C.textMuted, marginBottom: 5 },
  planPrice:    { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 2 },
  planSub:      { fontSize: 10, color: C.textMuted },
  cta:          { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 14 },
  ctaDim:       { opacity: 0.6 },
  ctaT:         { fontSize: 15, fontWeight: '700', color: '#000' },
  legal:        { fontSize: 10, color: C.textMuted, textAlign: 'center', lineHeight: 15, marginBottom: 14 },
  restore:      { alignItems: 'center', paddingVertical: 6 },
  restoreT:     { fontSize: 12, color: C.textMuted, textDecorationLine: 'underline' },
});