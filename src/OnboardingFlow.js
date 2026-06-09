import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const C = { bg:'#0A0A0F', card:'#16161E', orange:'#F97316', text:'#FFFFFF', muted:'#6B7280', sec:'#9CA3AF', green:'#22C55E', border:'#2A2A3A', sel:'#1C2340' };

const LEVELS = [
  { id:'apprentice', label:'🎓 Apprentice',        sub:'1st–4th year' },
  { id:'journeyman', label:'⚡ Journeyman',         sub:'Licensed & working' },
  { id:'master',     label:'🏆 Master Electrician', sub:'Licensed master' },
  { id:'contractor', label:'🏗️ Contractor',         sub:'Running jobs' },
  { id:'student',    label:'📖 Student',            sub:'Learning the trade' },
  { id:'diy',        label:'🔧 Homeowner / DIY',    sub:'Weekend projects' },
];

const TOOLS = [
  { id:'sparky',   label:'🤖 Sparky AI',      sub:'NEC code answers in seconds' },
  { id:'pipebend', label:'📐 Pipe Bending',    sub:'Stub-up, offset, 3-bend saddle' },
  { id:'boxfill',  label:'📦 Box Fill',        sub:'NEC 314.16 fill calculator' },
  { id:'conduit',  label:'🔵 Conduit Fill',    sub:'EMT, RMC, PVC fill %' },
  { id:'voltage',  label:'⚡ Voltage Drop',    sub:'Wire size & drop %' },
  { id:'ampacity', label:'🔌 Ampacity',        sub:'Wire sizing by load & temp' },
  { id:'jobcam',   label:'📸 Job Cam',         sub:'Photo log by project phase' },
  { id:'quiz',     label:'📝 Code Quiz',       sub:'Daily NEC question' },
  { id:'examprep', label:'🎯 Exam Prep',       sub:'Journeyman & master prep' },
  { id:'colors',   label:'🎨 Wire Colors',     sub:'Color code reference chart' },
];

const DETAILS = {
  sparky:  'Ask any NEC question. Get cited answers backed by the 2023 NEC.',
  pipebend:'Stub-up, back-to-back, offset, 3-bend saddle. Auto-calculates shrinkage.',
  boxfill: 'NEC 314.16 compliant. Add conductors, clamps, devices. Instant pass/fail.',
  conduit: 'EMT, RMC, IMC, PVC, ENT. Mix wire types. Shows fill % and max wires.',
  voltage: 'Single-phase and 3-phase. Suggests next wire size up if drop exceeds 3%.',
  ampacity:'Size wire by load, temp rating. Applies NEC 310.15 correction factors.',
  jobcam:  'Tag photos: Rough-in, Panel, Before, After, Inspection, Material.',
  quiz:    'One NEC question per day. Track your streak across 10 code categories.',
  examprep:'150+ questions, Study + Test mode. Journeyman & master level.',
  colors:  'Phase colors for 120/240V and 480V. IEC vs NEC quick reference.',
};

export default function OnboardingFlow({ onComplete }) {
  const [screen, setScreen] = useState(0);
  const [role, setRole] = useState(null);
  const [tools, setTools] = useState([]);

  const toggleTool = (id) => setTools(p => p.includes(id) ? p.filter(t=>t!==id) : [...p,id]);
  const next = () => setScreen(s => s + 1);
  const finish = (trial=false) => onComplete?.({ role, tools, startedTrial:trial });

  const SCREENS = [
    <LevelScreen    key="l"  role={role}  onSelect={setRole}  onNext={next} />,
    <ToolsScreen    key="t"  tools={tools} onToggle={toggleTool} onNext={next} />,
    <ShowcaseScreen key="s"  tools={tools} onNext={next} />,
    <DisclaimerScreen key="d" onNext={next} />,
    <TrialScreen    key="tr" role={role}  onStart={()=>finish(true)} onSkip={()=>finish(false)} />,
  ];

  return (
    <View style={s.root}>
      <SafeAreaView style={{flex:1}}>
        <View style={s.dots}>
          {SCREENS.map((_,i) => <View key={i} style={[s.dot, i===screen && s.dotActive]} />)}
        </View>
        {SCREENS[screen]}
      </SafeAreaView>
    </View>
  );
}

function LevelScreen({ role, onSelect, onNext }) {
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.eyebrow}>Welcome to SparkConnect</Text>
      <Text style={s.heading}>What's your level?</Text>
      <Text style={s.subT}>We'll tune the app to where you are in the trade.</Text>
      {LEVELS.map(l => (
        <TouchableOpacity key={l.id} style={[s.optCard, role===l.id && s.optSel]} onPress={()=>onSelect(l.id)} activeOpacity={0.8}>
          <Text style={s.optLabel}>{l.label}</Text>
          <Text style={s.optSub}>{l.sub}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={[s.cta, !role && s.ctaDis]} onPress={onNext} disabled={!role}>
        <Text style={s.ctaT}>Continue →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ToolsScreen({ tools, onToggle, onNext }) {
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.eyebrow}>Your Field Kit</Text>
      <Text style={s.heading}>What will you use most?</Text>
      <Text style={s.subT}>Select all that apply.</Text>
      <View style={s.grid}>
        {TOOLS.map(t => {
          const sel = tools.includes(t.id);
          return (
            <TouchableOpacity key={t.id} style={[s.toolCard, sel && s.toolSel]} onPress={()=>onToggle(t.id)} activeOpacity={0.8}>
              <Text style={s.toolIcon}>{t.label.split(' ')[0]}</Text>
              <Text style={s.toolName}>{t.label.slice(t.label.indexOf(' ')+1)}</Text>
              <Text style={s.toolSub}>{t.sub}</Text>
              {sel && <View style={s.chkBadge}><Text style={s.chkBadgeT}>✓</Text></View>}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={s.cta} onPress={onNext}>
        <Text style={s.ctaT}>{tools.length>0 ? `Continue with ${tools.length} tools →` : 'Skip →'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ShowcaseScreen({ tools, onNext }) {
  const ids = tools.length > 0 ? tools.slice(0,5) : Object.keys(DETAILS).slice(0,5);
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.eyebrow}>SparkConnect</Text>
      <Text style={s.heading}>Your field kit is ready ⚡</Text>
      <Text style={s.subT}>Here's what's waiting for you.</Text>
      {ids.map(id => {
        const t = TOOLS.find(x=>x.id===id);
        return (
          <View key={id} style={s.featCard}>
            <Text style={s.featIcon}>{t?.label.split(' ')[0]||'⚡'}</Text>
            <View style={{flex:1}}>
              <Text style={s.featName}>{t?.label.slice(t.label.indexOf(' ')+1)||id}</Text>
              <Text style={s.featDetail}>{DETAILS[id]||''}</Text>
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={s.cta} onPress={onNext}>
        <Text style={s.ctaT}>Looks good →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function DisclaimerScreen({ onNext }) {
  return (
    <View style={s.screen}>
      <Text style={s.eyebrow}>Before You Start</Text>
      <Text style={s.heading}>A word on safety</Text>
      {[
        { i:'⚡', t:'AI answers are a reference tool', d:'Sparky AI provides NEC code guidance, not engineering advice. Always verify with a licensed electrician.' },
        { i:'📋', t:'Check local amendments', d:'Local jurisdictions may adopt different NEC editions. Always check with your AHJ.' },
        { i:'🔒', t:'Never work live', d:'SparkConnect helps you plan and document. Lockout/tagout before any electrical work.' },
        { i:'📱', t:'Your data stays private', d:'Job photos and calculations stay on your device. Nothing is shared without your permission.' },
      ].map((item,i) => (
        <View key={i} style={s.discRow}>
          <Text style={s.discIcon}>{item.i}</Text>
          <View style={{flex:1}}>
            <Text style={s.discTitle}>{item.t}</Text>
            <Text style={s.discText}>{item.d}</Text>
          </View>
        </View>
      ))}
      <TouchableOpacity style={s.cta} onPress={onNext}>
        <Text style={s.ctaT}>I Understand →</Text>
      </TouchableOpacity>
    </View>
  );
}

function TrialScreen({ role, onStart, onSkip }) {
  const student = role==='student'||role==='apprentice';
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Text style={s.eyebrow}>Try Pro Free</Text>
      <Text style={s.heading}>3 days on us ⚡</Text>
      <Text style={s.subT}>{student ? 'Perfect for exam prep and daily job use.' : 'Everything you need on the job.'} Cancel anytime.</Text>
      {['🤖  20 Sparky AI answers/day','🧰  All calculators, unlimited','📸  Unlimited Job Cam projects','🎯  Full Exam Prep library','⚡  Full NEC code lookup'].map((line,i) => (
        <View key={i} style={s.trialRow}>
          <Text style={s.trialRowT}>{line}</Text>
          <Text style={s.trialChk}>✓</Text>
        </View>
      ))}
      <View style={s.pricingRow}>
        <View style={[s.priceBox, s.priceBoxHL]}>
          <Text style={s.priceTag}>BEST VALUE</Text>
          <Text style={s.priceLabel}>Annual</Text>
          <Text style={s.priceAmt}>$49.99</Text>
          <Text style={s.priceSub}>/year · Save 48%</Text>
        </View>
        <View style={s.priceBox}>
          <Text style={[s.priceTag,{opacity:0}]}>-</Text>
          <Text style={s.priceLabel}>Monthly</Text>
          <Text style={s.priceAmt}>$7.99</Text>
          <Text style={s.priceSub}>/month</Text>
        </View>
      </View>
      <TouchableOpacity style={s.cta} onPress={onStart}>
        <Text style={s.ctaT}>⚡ Start Free Trial</Text>
        <Text style={s.ctaSubT}>3 days free · then $7.99/mo · cancel anytime</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.skipBtn} onPress={onSkip}>
        <Text style={s.skipT}>Continue with Free Plan</Text>
      </TouchableOpacity>
      <Text style={s.legalT}>Payment charged after trial ends. Managed in App Store Settings.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:       { flex:1, backgroundColor:C.bg },
  dots:       { flexDirection:'row', justifyContent:'center', paddingVertical:16, gap:6 },
  dot:        { width:6, height:6, borderRadius:3, backgroundColor:C.border },
  dotActive:  { backgroundColor:C.orange, width:20 },
  screen:     { padding:24, paddingBottom:40 },
  eyebrow:    { color:C.orange, fontSize:13, fontWeight:'700', marginBottom:6 },
  heading:    { color:C.text, fontSize:28, fontWeight:'800', marginBottom:8, lineHeight:34 },
  subT:       { color:C.sec, fontSize:15, marginBottom:24, lineHeight:22 },
  optCard:    { backgroundColor:C.card, borderRadius:14, padding:16, marginBottom:10, borderWidth:1.5, borderColor:C.border },
  optSel:     { borderColor:C.orange, backgroundColor:C.sel },
  optLabel:   { color:C.text, fontSize:16, fontWeight:'600' },
  optSub:     { color:C.muted, fontSize:13, marginTop:3 },
  grid:       { flexDirection:'row', flexWrap:'wrap', gap:10, marginBottom:20 },
  toolCard:   { width:(width-58)/2, backgroundColor:C.card, borderRadius:14, padding:14, borderWidth:1.5, borderColor:C.border },
  toolSel:    { borderColor:C.orange, backgroundColor:C.sel },
  toolIcon:   { fontSize:24, marginBottom:6 },
  toolName:   { color:C.text, fontSize:14, fontWeight:'700', marginBottom:3 },
  toolSub:    { color:C.muted, fontSize:11, lineHeight:15 },
  chkBadge:   { position:'absolute', top:8, right:8, backgroundColor:C.orange, borderRadius:10, width:20, height:20, justifyContent:'center', alignItems:'center' },
  chkBadgeT:  { color:'#fff', fontSize:11, fontWeight:'800' },
  featCard:   { flexDirection:'row', backgroundColor:C.card, borderRadius:14, padding:16, marginBottom:10, borderWidth:1, borderColor:C.border },
  featIcon:   { fontSize:28, marginRight:14 },
  featName:   { color:C.text, fontSize:15, fontWeight:'700', marginBottom:4 },
  featDetail: { color:C.sec, fontSize:13, lineHeight:18 },
  discRow:    { flexDirection:'row', marginBottom:16 },
  discIcon:   { fontSize:22, marginRight:12, width:28 },
  discTitle:  { color:C.text, fontSize:14, fontWeight:'700', marginBottom:3 },
  discText:   { color:C.muted, fontSize:12, lineHeight:17 },
  trialRow:   { flexDirection:'row', alignItems:'center', paddingVertical:10, borderBottomWidth:1, borderBottomColor:C.border },
  trialRowT:  { color:C.text, fontSize:14, flex:1 },
  trialChk:   { color:C.green, fontSize:16, fontWeight:'700' },
  pricingRow: { flexDirection:'row', gap:10, marginVertical:20 },
  priceBox:   { flex:1, backgroundColor:C.card, borderRadius:14, padding:14, alignItems:'center', borderWidth:1.5, borderColor:C.border },
  priceBoxHL: { borderColor:C.orange, backgroundColor:'#1A1208' },
  priceTag:   { color:C.orange, fontSize:9, fontWeight:'800', marginBottom:4 },
  priceLabel: { color:C.sec, fontSize:12, fontWeight:'600' },
  priceAmt:   { color:C.text, fontSize:24, fontWeight:'800', marginVertical:2 },
  priceSub:   { color:C.muted, fontSize:11, textAlign:'center' },
  cta:        { backgroundColor:C.orange, borderRadius:14, padding:16, alignItems:'center', marginTop:8, marginBottom:12 },
  ctaDis:     { backgroundColor:'#3A3020', opacity:0.5 },
  ctaT:       { color:'#fff', fontSize:16, fontWeight:'800' },
  ctaSubT:    { color:'rgba(255,255,255,0.75)', fontSize:11, marginTop:3 },
  skipBtn:    { backgroundColor:C.card, borderRadius:14, padding:14, alignItems:'center', marginBottom:16, borderWidth:1, borderColor:C.border },
  skipT:      { color:C.sec, fontSize:14, fontWeight:'600' },
  legalT:     { color:C.muted, fontSize:10, textAlign:'center', lineHeight:15 },
});
