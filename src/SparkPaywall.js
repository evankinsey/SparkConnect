import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView } from 'react-native';

const C = { bg:'#0A0A0F', card:'#16161E', orange:'#F97316', text:'#FFFFFF', muted:'#6B7280', sec:'#9CA3AF', green:'#22C55E', border:'#2A2A3A', sel:'#1C2340' };

const FEATURES = [
  { i:'🤖', t:'20 Sparky AI answers/day', s:'vs 3 on Free' },
  { i:'🧰', t:'All Calculators unlimited', s:'Box Fill, Conduit, Ampacity & more' },
  { i:'📸', t:'Job Cam unlimited', s:'Unlimited projects & photos' },
  { i:'📚', t:'Full Learn & Exam Prep', s:'Journeyman + master level' },
  { i:'⚡', t:'NEC Code Lookup', s:'Cited answers on the job' },
];

const PACKS = [
  { id:'sparky_answers_10',  label:'15 Answers',  price:'$1.99', tag:null },
  { id:'sparky_answers_30',  label:'50 Answers',  price:'$4.99', tag:'Popular' },
  { id:'sparky_answers_100', label:'150 Answers', price:'$9.99', tag:'Best Value' },
];

export default function SparkPaywall({ visible=false, onClose, onStartTrial, onBuyPack, reason, isPacks=false }) {
  const [selPack, setSelPack] = useState('sparky_answers_30');
  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.overlay}>
        <SafeAreaView style={s.sheet}>
          <View style={s.handle} />
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} bounces={false}>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{top:10,right:10,bottom:10,left:10}}>
              <Text style={s.closeX}>✕</Text>
            </TouchableOpacity>
            {isPacks
              ? <PacksView packs={PACKS} sel={selPack} onSel={setSelPack} onBuy={() => onBuyPack?.(selPack)} onClose={onClose} />
              : <ProView reason={reason} onStartTrial={() => onStartTrial?.('sparkconnect_pro_monthly')} onClose={onClose} />
            }
            <Text style={s.legal}>
              {isPacks ? 'One-time purchase. Answers never expire. Managed via App Store.' : 'Free trial ends after 3 days. Then $7.99/mo or $49.99/yr. Cancel anytime in Settings.'}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function ProView({ reason, onStartTrial, onClose }) {
  return (
    <>
      <Text style={s.badge}>⚡ {reason || 'Upgrade to Pro'}</Text>
      <Text style={s.title}>SparkConnect Pro</Text>
      <Text style={s.sub}>Everything an electrician needs, always in your pocket.</Text>
      {FEATURES.map((f,i) => (
        <View key={i} style={s.row}>
          <Text style={s.fi}>{f.i}</Text>
          <View style={s.ft}><Text style={s.fn}>{f.t}</Text><Text style={s.fs}>{f.s}</Text></View>
          <Text style={s.chk}>✓</Text>
        </View>
      ))}
      <View style={s.pricing}>
        <View style={[s.pc, s.pch]}>
          <Text style={s.best}>BEST VALUE</Text>
          <Text style={s.pl}>Annual</Text>
          <Text style={s.pa}>$49.99</Text>
          <Text style={s.ps}>/year · Save 48%</Text>
        </View>
        <View style={s.pc}>
          <Text style={s.pl}>Monthly</Text>
          <Text style={s.pa}>$7.99</Text>
          <Text style={s.ps}>/month</Text>
        </View>
      </View>
      <TouchableOpacity style={s.cta} onPress={onStartTrial} activeOpacity={0.85}>
        <Text style={s.ctaT}>⚡ Start 3-Day Free Trial</Text>
        <Text style={s.ctaS}>Then $7.99/mo · Cancel anytime</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.free} onPress={onClose} activeOpacity={0.8}>
        <Text style={s.freeT}>Continue Free</Text>
      </TouchableOpacity>
    </>
  );
}

function PacksView({ packs, sel, onSel, onBuy, onClose }) {
  return (
    <>
      <Text style={s.badge}>💬 Sparky AI Answer Packs</Text>
      <Text style={s.title}>Buy More Answers</Text>
      <Text style={s.sub}>One-time purchase. Use anytime. No subscription needed.</Text>
      {packs.map(p => (
        <TouchableOpacity key={p.id} style={[s.packRow, sel===p.id && s.packSel]} onPress={() => onSel(p.id)} activeOpacity={0.8}>
          {p.tag && <View style={s.packTag}><Text style={s.packTagT}>{p.tag}</Text></View>}
          <Text style={s.packLabel}>{p.label}</Text>
          <Text style={s.packPrice}>{p.price}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={s.cta} onPress={onBuy} activeOpacity={0.85}>
        <Text style={s.ctaT}>Buy Now</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.free} onPress={onClose} activeOpacity={0.8}>
        <Text style={s.freeT}>Maybe Later</Text>
      </TouchableOpacity>
    </>
  );
}

const s = StyleSheet.create({
  overlay:  { flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' },
  sheet:    { backgroundColor:C.bg, borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'92%' },
  handle:   { width:36, height:4, backgroundColor:C.border, borderRadius:2, alignSelf:'center', marginTop:12 },
  scroll:   { padding:24, paddingBottom:40 },
  closeBtn: { position:'absolute', top:0, right:0, padding:4, zIndex:10 },
  closeX:   { color:C.muted, fontSize:16 },
  badge:    { color:C.orange, fontSize:13, fontWeight:'700', textAlign:'center', marginBottom:8, marginTop:8 },
  title:    { color:C.text, fontSize:26, fontWeight:'800', textAlign:'center', marginBottom:6 },
  sub:      { color:C.sec, fontSize:14, textAlign:'center', marginBottom:20, lineHeight:20 },
  row:      { flexDirection:'row', alignItems:'center', paddingVertical:11, borderBottomWidth:1, borderBottomColor:C.border },
  fi:       { fontSize:22, marginRight:12, width:30 },
  ft:       { flex:1 },
  fn:       { color:C.text, fontSize:14, fontWeight:'600' },
  fs:       { color:C.muted, fontSize:12, marginTop:2 },
  chk:      { color:C.green, fontSize:16, fontWeight:'700' },
  pricing:  { flexDirection:'row', gap:10, marginVertical:20 },
  pc:       { flex:1, backgroundColor:C.card, borderRadius:14, padding:14, alignItems:'center', borderWidth:1.5, borderColor:C.border },
  pch:      { borderColor:C.orange, backgroundColor:'#1A1208' },
  best:     { color:C.orange, fontSize:9, fontWeight:'800', marginBottom:4 },
  pl:       { color:C.sec, fontSize:12, fontWeight:'600' },
  pa:       { color:C.text, fontSize:24, fontWeight:'800', marginVertical:2 },
  ps:       { color:C.muted, fontSize:11, textAlign:'center' },
  cta:      { backgroundColor:C.orange, borderRadius:14, padding:16, alignItems:'center', marginBottom:12 },
  ctaT:     { color:'#fff', fontSize:16, fontWeight:'800', marginBottom:2 },
  ctaS:     { color:'rgba(255,255,255,0.75)', fontSize:11 },
  free:     { backgroundColor:C.card, borderRadius:14, padding:14, alignItems:'center', marginBottom:8, borderWidth:1, borderColor:C.border },
  freeT:    { color:C.sec, fontSize:14, fontWeight:'600' },
  legal:    { color:C.muted, fontSize:10, textAlign:'center', lineHeight:15, marginTop:8 },
  packRow:  { flexDirection:'row', alignItems:'center', backgroundColor:C.card, borderRadius:14, padding:16, marginBottom:10, borderWidth:1.5, borderColor:C.border },
  packSel:  { borderColor:C.orange, backgroundColor:C.sel },
  packTag:  { backgroundColor:C.orange, borderRadius:6, paddingHorizontal:6, paddingVertical:2, marginRight:10 },
  packTagT: { color:'#fff', fontSize:10, fontWeight:'700' },
  packLabel:{ color:C.text, fontSize:15, fontWeight:'600', flex:1 },
  packPrice:{ color:C.orange, fontSize:16, fontWeight:'800' },
});
