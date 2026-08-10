import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
// The Snack export once glued this declaration into the comment above it,
// which left SC_LOGO undefined and would have crashed the splash screen on
// its very first render. Keep it a real statement.
const SC_LOGO = null; // set to require('./assets/SparkConnectLogo.png') to show the logo PNG on the splash
import SparkPaywall from './src/SparkPaywall';
import { initPurchases, purchaseProduct, restorePurchases as rcRestorePurchases, checkStore } from './src/purchases';
import OnboardingFlow from './src/OnboardingFlow';
import { DOCUMENTS, EFFECTIVE_DATE, CONTACT_EMAIL } from './src/core/legal/policy';
import { useGating } from './src/useGating';
import { analytics } from './src/analytics';
// The six screens added in v1.1 are loaded on first use, not at startup — see
// the lazyScreen() note further down. Home still imports statically because the
// layout hook runs during the root render.
import { HomeCards, HomeCustomizeScreen, useHomeLayout, AllToolsSection } from './src/screens/HomeCards';
import ToolsScreen from './src/screens/ToolsScreen';
import HoursScreen from './src/screens/HoursScreen';
import EstimateScreen from './src/screens/EstimateScreen';
import { stepQuantity, materialsFromQuantities } from './src/core/domain/estimateBridge';
import { ask as sparkAsk, Provenance as SparkProvenance } from './src/core/ai/sparkai';
import { knowledgeBase } from './src/core/ai/knowledge';
import { answerFooter } from './src/core/ai/answer';
import { fetchConfig, resolveConfig, cacheIsFresh, EMPTY as EMPTY_CONFIG } from './src/core/remoteConfig';
import { applyRemoteConfig } from './src/core/paywall/registry';
import { TAB_FEATURE as KILLABLE_TABS, tabHider } from './src/core/killSwitch';
import {
  Mode, MODES, modeById, promptFor, attachmentTray, Attachment,
  answerActions, AnswerAction, SIMPLIFY_PROMPT, sourceBadge, historyGroups,
} from './src/core/ai/modes';
import { buildPriceQuestion, priceAskBlocker, PRICE_DISCLAIMER } from './src/core/ai/estimatorAsk';
import {
  FREE_LIMITS, Feature, proAskAllowanceLabel, usageLabel, planFor, Plan,
} from './src/core/paywall/entitlements';
import { Source as PaywallSource, heroFor, paywallEvent } from './src/core/paywall/contexts';
import { limitLine } from './src/core/paywall/limitMessage';
import { CAST_IMAGES } from './src/screens/castImages';
import { buildPulse, dayIndexFor } from './src/core/home/pulse';
import { getDailyQuestion } from './src/core/content/dailyQuestions';
import {
  refreshDailyQuestionNotifications,
  enableDailyQuestionNotifications,
  disableDailyQuestionNotifications,
  isDailyQuestionEnabled,
  getReminderTime,
  cycleReminderTime,
  formatReminderTime,
  addDailyQuestionTapListener,
  getInitialDailyQuestionResponse,
  clearBadge,
} from './src/dailyNotifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  SafeAreaView, StatusBar, Platform, Switch, Dimensions, useColorScheme,
  Share, Alert, Animated, Linking, AppState, Keyboard, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// expo-image-picker & expo-sharing — lazy-loaded so the app never crashes if package isn't installed
// Works in Expo Snack, Expo Go, AND production builds
const _loadImagePicker = (() => {
  let _mod = null;
  return async () => {
    if (_mod) return _mod;
    try { _mod = await import('expo-image-picker'); return _mod; } catch { return null; }
  };
})();
/**
 * Shared plan-sheet picker. Blueprint Takeoff needs the same permission dance
 * SparkAI already does, so it borrows this rather than growing a second copy
 * that can drift out of sync on permissions or quality settings.
 *
 * Quality is higher than the chat picker's 0.6 because a takeoff is counting
 * small symbols on a drawing; a soft image is the difference between a count
 * and a guess.
 */
const pickPlanImage = async (source = 'camera') => {
  const IP = await _loadImagePicker();
  if (!IP) throw new Error('picker unavailable');
  const perm = source === 'camera'
    ? await IP.requestCameraPermissionsAsync()
    : await IP.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('permission denied');
  const result = source === 'camera'
    ? await IP.launchCameraAsync({ quality: 0.85, base64: true, allowsEditing: false })
    : await IP.launchImageLibraryAsync({ quality: 0.85, base64: true, allowsEditing: false });
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  return { uri: a.uri, base64: a.base64 };
};

const _loadSharing = (() => {
  let _mod = null;
  return async () => {
    if (_mod) return _mod;
    try { _mod = await import('expo-sharing'); return _mod; } catch { return null; }
  };
})();
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';

const SW = Dimensions.get('window').width;

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY & INPUT VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Safe logging — only prints in DEV, never in production ───────────────
const safeLog = (context, error) => {
  if (__DEV__) {
    console.warn(`[SparkConnect:${context}]`, error);
  }
  // Never expose internal errors to users in production
};

// ─── Input sanitization helpers ──────────────────────────────────────────
// Strip everything except digits, one decimal point, and leading minus
const cleanNumberInput = (raw) => {
  if (typeof raw !== 'string') return '';
  // Allow digits and at most one decimal point
  let cleaned = raw.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
  return cleaned;
};

const toPositiveNumber = (raw, fallback = 0, max = 999999) => {
  const n = parseFloat(raw);
  if (!isFinite(n) || isNaN(n) || n < 0) return fallback;
  return Math.min(n, max);
};

const toPositiveInteger = (raw, fallback = 0, max = 9999) => {
  const n = parseInt(raw, 10);
  if (!isFinite(n) || isNaN(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
};

const isValidPositiveNumber = (raw) => {
  const n = parseFloat(raw);
  return isFinite(n) && !isNaN(n) && n > 0;
};

// ─── Safe URL opener — only allows https: and mailto: ────────────────────
// SECURITY: Never open arbitrary user-generated URLs. Only known safe origins.
const ALLOWED_URL_PREFIXES = ['https://', 'mailto:'];
const KNOWN_SAFE_DOMAINS = [
  'instagram.com', 'www.instagram.com',
  'tiktok.com', 'www.tiktok.com',
  'sparkconnect.pro', 'www.sparkconnect.pro',
];
// SECURITY: expo-sharing handles image URIs — they are local file paths only,
// and the share sheet is OS-controlled, so sharing never uploads anything.
// Job Cam photos never leave the device. The ONE path that uploads an image is
// SparkAI, and only when the user explicitly attaches one to a question; the
// privacy screen says so in those words.
// SECURITY: All user inputs are capped, sanitized, and never eval'd.

const safeOpenURL = async (url) => {
  if (!url || typeof url !== 'string') {
    Alert.alert('Invalid Link', 'This link could not be opened.');
    return;
  }
  const isAllowedScheme = ALLOWED_URL_PREFIXES.some(p => url.startsWith(p));
  if (!isAllowedScheme) {
    safeLog('safeOpenURL', `Blocked unsafe URL scheme: ${url}`);
    Alert.alert('Unsafe Link', 'This link cannot be opened for security reasons.');
    return;
  }
  // For https URLs, verify domain is in known-safe list
  if (url.startsWith('https://')) {
    try {
      const hostname = new URL(url).hostname;
      if (!KNOWN_SAFE_DOMAINS.includes(hostname)) {
        safeLog('safeOpenURL', `Blocked unknown domain: ${hostname}`);
        Alert.alert('Could not open link', `Unable to open ${url}`);
        return;
      }
    } catch (e) {
      safeLog('safeOpenURL', `Malformed URL: ${url}`);
      Alert.alert('Invalid Link', 'This link appears to be invalid.');
      return;
    }
  }
  try {
    await Linking.openURL(url);
  } catch (e) {
    safeLog('safeOpenURL', e);
    Alert.alert('Could not open link', 'Please try visiting the link manually.');
  }
};

// ─── Safe AsyncStorage wrappers ───────────────────────────────────────────
// SECURITY: AsyncStorage is NOT encrypted. Do NOT store tokens, passwords,
// or sensitive personal data here. Use expo-secure-store for auth tokens.
// Safe to store: onboarding flag, theme preference, non-sensitive settings.
const safeStorageGet = async (key) => {
  try {
    return await AsyncStorage.getItem(key);
  } catch (e) {
    safeLog('AsyncStorage.get', e);
    return null;
  }
};

const safeStorageSet = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, value);
    return true;
  } catch (e) {
    safeLog('AsyncStorage.set', e);
    return false;
  }
};

// ───  query safety ──────────────────────────────────────────────────
const MAX_QUERY_LENGTH = 500; // Max characters per NEC AI search query
const sanitizeQuery = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  // Strip characters that could cause issues in email links or URL params
  return raw.trim().slice(0, MAX_QUERY_LENGTH).replace(/[<>{}|\\^`]/g, '');
};

// SECURITY: Safe URL builder for mailto links — prevents header injection
const buildMailtoURL = (to, subject, body) => {
  const safeTo = 'support@sparkconnect.pro'; // Never use user-supplied email addresses
  const safeSubject = encodeURIComponent(String(subject || '').slice(0, 100));
  const safeBody = encodeURIComponent(String(body || '').slice(0, 500));
  return `mailto:${safeTo}?subject=${safeSubject}&body=${safeBody}`;
};


// ─── THEME ───────────────────────────────────────────────────────────────────
const LIGHT = {
  blue:'#1D4ED8',blueDark:'#0D1B3E',blueSub:'#E7EDFD',blueLight:'#3B82F6',
  bg:'#F1F3F7',surface:'#FFFFFF',
  text:'#0F172A',textSec:'#475569',textTert:'#94A3B8',
  border:'#E2E8F0',borderLight:'#F0F4F8',
  success:'#10B981',successBg:'#ECFDF5',
  warning:'#F59E0B',warningBg:'#FFFBEB',
  danger:'#EF4444',dangerBg:'#FEF2F2',
  purple:'#7C3AED',purpleBg:'#F5F3FF',purpleSub:'#EDE9FE',
  teal:'#0D9488',tealBg:'#F0FDFA',
  amber:'#B45309',amberBg:'#FEF3C7',
  green:'#15803D',greenBg:'#E7F6EC',
  inputBg:'#F1F3F7',inputBorder:'#D9DFE8',inputText:'#0F172A',placeholder:'#94A3B8',
  tabBar:'#FFFFFF',tabBorder:'#E2E8F0',tabActive:'#1D4ED8',tabInactive:'#94A3B8',
  overlay:'rgba(245,247,250,0.94)',statusBar:'dark-content',
};
const DARK = {
  blue:'#3B82F6',blueDark:'#1D4ED8',blueSub:'#1E3A5F',blueLight:'#60A5FA',
  bg:'#0F172A',surface:'#1E293B',
  text:'#F1F5F9',textSec:'#94A3B8',textTert:'#64748B',
  border:'#334155',borderLight:'#1E293B',
  success:'#34D399',successBg:'#064E3B',
  warning:'#FBBF24',warningBg:'#451A03',
  danger:'#F87171',dangerBg:'#450A0A',
  purple:'#A78BFA',purpleBg:'#2D1B69',purpleSub:'#3730A3',
  teal:'#2DD4BF',tealBg:'#042F2E',
  amber:'#FCD34D',amberBg:'#422006',
  green:'#4ADE80',greenBg:'#052E16',
  inputBg:'#1E293B',inputBorder:'#334155',inputText:'#F1F5F9',placeholder:'#64748B',
  tabBar:'#1E293B',tabBorder:'#334155',tabActive:'#3B82F6',tabInactive:'#64748B',
  overlay:'rgba(15,23,42,0.95)',statusBar:'light-content',
};

// ─── NEC DAILY QUESTIONS ─────────────────────────────────────────────────────
// Question bank + date-stable selection now live in ./src/core/content/dailyQuestions so the
// Home card and the morning notification always resolve to the same question.

// ─── FORMULAS ─────────────────────────────────────────────────────────────────
const FORMULAS = [
  {id:'o1',cat:"Ohm's Law",name:'Voltage',f:'E = I × R',v:'E=Volts · I=Amps · R=Ohms',u:'Find voltage.',ex:'10A × 12Ω = 120V'},
  {id:'o2',cat:"Ohm's Law",name:'Current',f:'I = E ÷ R',v:'I=Amps · E=Volts · R=Ohms',u:'Find current.',ex:'120V ÷ 12Ω = 10A'},
  {id:'o3',cat:"Ohm's Law",name:'Resistance',f:'R = E ÷ I',v:'R=Ohms · E=Volts · I=Amps',u:'Find resistance.',ex:'120V ÷ 10A = 12Ω'},
  {id:'p1',cat:'Power',name:'Power',f:'P = E × I',v:'P=Watts · E=Volts · I=Amps',u:'Find wattage.',ex:'120V × 15A = 1800W'},
  {id:'p2',cat:'Power',name:'kVA (1Φ)',f:'kVA = (E × I) ÷ 1000',v:'E=Volts · I=Amps',u:'Apparent power.',ex:'(240×100)÷1000 = 24kVA'},
  {id:'vd1',cat:'Voltage Drop',name:'VD% (1Φ)',f:'VD% = (2 × K × I × D) ÷ (CM × E) × 100',v:'K=12.9 Cu/21.2 Al · D=ft · CM=circ mils',u:'Single-phase drop.',ex:'NEC recommends ≤3%',ref:'NEC 210.19(A)'},
  {id:'vd2',cat:'Voltage Drop',name:'VD% (3Φ)',f:'VD% = (√3 × K × I × D) ÷ (CM × E) × 100',v:'K=12.9 Cu · D=ft · CM=circ mils',u:'Three-phase drop.',ex:'NEC 215.2(A)',ref:'NEC 215.2(A)'},
  {id:'t1',cat:'Three Phase',name:'L-L Voltage',f:'E_LL = E_LN × √3',v:'LL=line-line · LN=line-neutral',u:'Wye line voltage.',ex:'120 × 1.732 = 208V'},
  {id:'t2',cat:'Three Phase',name:'3Φ Power',f:'P = √3 × E × I × PF',v:'E=line V · I=line A · PF=power factor',u:'True 3Φ power.',ex:'1.732×208×100×0.85 = 30.6kW'},
  {id:'t3',cat:'Three Phase',name:'3Φ Current from kVA',f:'I = (kVA × 1000) ÷ (√3 × E)',v:'kVA=rating · E=line V',u:'3Φ full-load amps.',ex:'(75×1000)÷(1.732×208)=208A'},
  {id:'m1',cat:'Motors',name:'Motor Conductor',f:'Min = FLC × 1.25',v:'FLC from NEC 430.248/250',u:'Size motor wire.',ex:'10A × 1.25 = 12.5A',ref:'NEC 430.22(A)'},
  {id:'m2',cat:'Motors',name:'Motor OCPD',f:'Max = FLC × 2.5',v:'FLC from NEC Table',u:'Inverse-time breaker.',ex:'10A × 2.5 = 25A',ref:'NEC 430.52'},
  {id:'x1',cat:'Transformers',name:'Turns Ratio',f:'Np ÷ Ns = Ep ÷ Es',v:'N=turns · E=voltage',u:'Secondary voltage.',ex:'480÷120 = 4:1'},
  {id:'x2',cat:'Transformers',name:'Secondary Current (1Φ)',f:'Is = (kVA × 1000) ÷ Es',v:'kVA=rating · Es=sec V',u:'Full-load secondary A.',ex:'(25×1000)÷240=104A'},
  {id:'b1',cat:'Bending',name:'Offset 45°',f:'Spacing = Height × 1.414',v:'Height=rise',u:'45° offset marks.',ex:'6" × 1.414 = 8.5"'},
  {id:'b2',cat:'Bending',name:'Offset 30°',f:'Spacing = Height × 2.0',v:'Height=rise',u:'30° offset marks.',ex:'4" × 2.0 = 8"'},
  {id:'b3',cat:'Bending',name:'Rolling Offset',f:'Travel = √(Rise² + Roll²)',v:'Rise=vert · Roll=horiz',u:'Diagonal travel.',ex:'√(6²+4²)=7.21"'},
  {id:'bf1',cat:'Box Fill',name:'Box Fill',f:'Σ conductors + 2×devices + 1×grounds + 1×clamps',v:'volume per NEC 314.16(B)',u:'Box cubic inches.',ex:'#12 = 2.25 in³ ea',ref:'NEC 314.16(B)'},
  {id:'cf1',cat:'Conduit Fill',name:'Fill %',f:'Fill% = (wire area ÷ conduit area) × 100',v:'areas: NEC Ch.9 T4 & T5',u:'Area is the conduit TOTAL from Ch.9 T4, not the 40% column. Verify ≤40%.',ex:'3×#12 in ½"EMT = 0.0399÷0.304 = 13.1%',ref:'NEC Ch.9 Table 1'},
];

// ─── NEC KNOWLEDGE BASE ───────────────────────────────────────────────────────
const NEC_KB = [
  {id:'kb1',topic:'Box Fill',calcTab:'boxfill',tags:['box fill','314.16','cubic inches','box size'],
   short:'Add conductor volumes + devices (2×) + ground (1×) + clamps (1×).',
   refs:['NEC 314.16','NEC 314.16(B)','NEC 314.16(B)(4)'],
   explain:'Each conductor has a cubic-inch volume by AWG. Devices/yokes count 2×, all grounds count 1× total, all internal clamps count 1× total.',
   example:'4×#12 (2.25) + 1 device (2×2.25) + 1 ground (2.25) + 1 clamp (2.25) = 18.0 in³. Use a box ≥18 in³.',
   related:['NEC 314.16','NEC 314.28']},
  {id:'kb2',topic:'GFCI Protection',calcTab:null,tags:['gfci','210.8','bathroom','kitchen','ground fault'],
   short:'GFCI required in bathrooms, kitchens (6ft of sink), garages, outdoors, basements, crawl spaces.',
   refs:['NEC 210.8(A)','NEC 210.8(B)'],
   explain:'NEC 210.8(A) lists GFCI locations for dwellings. GFCI trips on 4-6mA imbalance between hot and neutral.',
   example:'New counter receptacle within 6ft of kitchen sink = GFCI required. Use GFCI at first outlet, feed downstream from LOAD.',
   related:['NEC 210.8','NEC 406.4']},
  {id:'kb3',topic:'Continuous Loads',calcTab:'volt',tags:['continuous load','125%','210.20','breaker sizing'],
   short:'A 3+ hour load needs OCPD rated ≥125% of that load.',
   refs:['NEC 210.20(A)','NEC 215.2(A)'],
   explain:'NEC 210.20(A): OCPD ≥125% of continuous load. Conductors must also handle the 125% factor.',
   example:'16A continuous load × 1.25 = 20A breaker. Or: 20A breaker × 0.8 = 16A max continuous.',
   related:['NEC 210.20','NEC 215.2']},
  {id:'kb4',topic:'Conduit Fill',calcTab:'conduitfill',tags:['conduit fill','chapter 9','40%','table 1'],
   short:'1 wire = 53%, 2 wires = 31%, 3+ wires = 40% max fill.',
   refs:['NEC Chapter 9, Table 1','NEC Chapter 9, Table 4','NEC Chapter 9, Table 5'],
   explain:'Table 1 = max fill %. Table 4 = conduit areas. Table 5 = wire areas. Divide total wire area by conduit area.',
   example:'3×#12 THHN (0.0133 ea) = 0.0399 in² ÷ ½" EMT total 0.304 in² = 13.1% ✓ (0.122 is the 40% LIMIT, not the area)',
   related:['NEC Chapter 9','NEC 300.17']},
  {id:'kb5',topic:'Voltage Drop',calcTab:'volt',tags:['voltage drop','3%','5%','210.19','215.2'],
   short:'NEC recommends (not mandates) ≤3% branch, ≤5% total. Informational Notes only.',
   refs:['NEC 210.19(A) Info Note','NEC 215.2(A) Info Note'],
   explain:'Voltage drop limits are recommendations, not enforceable code — but local AHJs may enforce them.',
   example:'20A/150ft on #12 Cu at 120V ≈ 8% drop. Upsize to #8 Cu or run 240V.',
   related:['NEC 210.19','NEC 215.2']},
  {id:'kb6',topic:'Working Clearances',calcTab:null,tags:['clearance','110.26','3 feet','panel'],
   short:'Minimum 3 ft clear depth in front of equipment ≤150V (Condition 2).',
   refs:['NEC 110.26(A)','NEC 110.26(A)(1)','NEC 110.26(A)(3)'],
   explain:'Depth ≥3ft, width ≥30in or equipment width, headroom ≥6ft 3in. Keep working space clear.',
   example:'200A residential panel: 3ft in front must stay clear of storage at all times.',
   related:['NEC 110.26','NEC 110.34']},
  {id:'kb7',topic:'Equipment Grounding',calcTab:null,tags:['grounding','egc','250','fault path','bonding'],
   short:'EGC provides low-impedance fault path to trip OCPD. Does NOT carry load current.',
   refs:['NEC 250.4(A)(5)','NEC 250.118','NEC 250.122'],
   explain:'NEC 250.122 gives minimum EGC sizes by OCPD rating. NEC 250.118 lists acceptable EGC types.',
   example:'EMT can serve as EGC if properly installed — many electricians still pull a separate green wire.',
   related:['NEC 250','NEC 250.118','NEC 250.122']},
  {id:'kb8',topic:'EV Charging (EVSE)',calcTab:'volt',tags:['ev','evse','625','level 2','charger'],
   short:'NEC 625: EVSE is a continuous load — size circuit at 125% of nameplate.',
   refs:['NEC Article 625','NEC 625.42'],
   explain:'Article 625 requires listed EVSE, disconnect means, and GFCI in some cases. Continuous-load rule applies.',
   example:'32A Level 2 charger × 1.25 = 40A circuit. Use 40A breaker, #8 Cu THHN.',
   related:['NEC 625','NEC 210.20']},
  {id:'kb9',topic:'AFCI Protection',calcTab:null,tags:['afci','210.12','arc fault','bedroom'],
   short:'AFCI required for most 120V, 15A and 20A branch circuits in dwelling units (2020/2023 NEC).',
   refs:['NEC 210.12(A)'],
   explain:'NEC 210.12(A) expanded AFCI to cover bedrooms, living rooms, kitchens, hallways, and more. Check your locally adopted edition.',
   example:'New 15A bedroom circuit: install combination-type AFCI breaker at the panelboard.',
   related:['NEC 210.12','NEC 210.8']},
  {id:'kb10',topic:'Motor Circuit Sizing',calcTab:null,tags:['motor','430','fla','fLC','overload'],
   short:'Motor conductors ≥125% FLC. OCPD up to 250% FLC. Overloads at 115-125% nameplate.',
   refs:['NEC 430.22(A)','NEC 430.52','NEC 430.32'],
   explain:'Use FLC from NEC Tables 430.247-430.250, NOT nameplate amps, for conductor and OCPD sizing.',
   example:'10HP 230V single-phase motor: FLC = 50A. Conductors ≥ 62.5A. OCPD ≤ 125A (250%).',
   related:['NEC 430','NEC 440']},
  {id:'kb11',topic:'AFCI Protection',calcTab:null,tags:['afci','210.12','arc fault','bedroom','living room'],
   short:'AFCI required for most 120V 15A and 20A branch circuits in dwelling units (2020/2023 NEC).',
   refs:['NEC 210.12(A)','NEC 210.12(B)'],
   explain:'Combination-type AFCI breakers protect against both series and parallel arc faults. 2023 NEC covers nearly all branch circuits in dwelling units.',
   example:'New bedroom circuit: install combination-type AFCI breaker. New kitchen circuit: check your locally adopted NEC edition.',
   related:['NEC 210.12','NEC 210.8']},
  {id:'kb12',topic:'Overcurrent Conductor Protection',calcTab:null,tags:['ocpd','240.4','14 awg','12 awg','10 awg','breaker size'],
   short:'#14 Cu = 15A max. #12 Cu = 20A max. #10 Cu = 30A max per NEC 240.4(D).',
   refs:['NEC 240.4(D)','NEC 240.6(A)'],
   explain:'NEC 240.4(D) limits OCPD for small conductors. Standard sizes per 240.6(A): 15, 20, 25, 30, 35, 40, 45, 50, 60A.',
   example:'Running a 20A circuit? Minimum #12 AWG Cu. Running 15A? Minimum #14 AWG Cu.',
   related:['NEC 240.4','NEC 240.6']},
  {id:'kb13',topic:'Service Disconnect Requirements',calcTab:null,tags:['service disconnect','230.70','230.71','6 disconnect','main breaker'],
   short:'Max 6 service disconnects at one location. Must be at/near service entry point.',
   refs:['NEC 230.70(A)','NEC 230.71(A)'],
   explain:'NEC 230.70: service disconnect at readily accessible location. NEC 230.71: maximum of 6 disconnects per service.',
   example:'Residential service: typically one main breaker at the meter/panel. Commercial: up to 6 breakers can serve as the service disconnect.',
   related:['NEC 230','NEC 250.24']},
  {id:'kb14',topic:'Neutral-Ground Separation',calcTab:null,tags:['subpanel','neutral','ground','separate','bond','250.142'],
   short:'Neutral and ground bond ONLY at service entrance. Subpanels in same building must keep them separate.',
   refs:['NEC 250.24(A)','NEC 250.142(B)'],
   explain:'Bonding neutral to ground at a subpanel in the same building creates parallel return paths — dangerous and code violation. Use 4-wire feeders to subpanels.',
   example:'Running a subpanel in your garage? Use a 4-wire feeder. Separate neutral and ground bars inside the subpanel. NO main bonding jumper.',
   related:['NEC 250.24','NEC 250.142']},
  {id:'kb15',topic:'Ampacity Derating',calcTab:'ampacity',tags:['ampacity','310.15','derating','temperature','conduit fill','ambient'],
   short:'Conductor ampacity may need to be derated for ambient temperature or more than 3 conductors in a raceway.',
   refs:['NEC 310.15(B)(2)','NEC 310.15(C)','NEC 110.14(C)'],
   explain:'High ambient temperature reduces wire ampacity per Table 310.15(B)(1). More than 3 current-carrying conductors in a conduit requires derating per Table 310.15(C).',
   example:'4 THHN conductors in conduit: derate to 80%. 7-9 conductors: derate to 70%. Hot attic over 40°C: apply temperature correction.',
   related:['NEC 310.15','NEC 110.14']},
  // ── HOW-TO INSTALLATION GUIDES (written in our own words, NEC-cited) ──
  {id:'how1',topic:'How to Wire a GFCI Outlet',calcTab:null,tags:['gfci install','where does neutral go','outlet wiring','gfci how to','wire receptacle','install outlet'],
   short:'LINE terminals connect to incoming power. LOAD terminals extend GFCI protection to downstream outlets.',
   refs:['NEC 210.8(A)','NEC 406.4'],
   explain:'A standard GFCI outlet has two sets of screw terminals labeled LINE and LOAD. The hot wire (black) connects to the brass (gold) screw on the LINE side. The neutral (white) connects to the silver screw on the LINE side. The bare/green ground connects to the green screw. The LINE side powers the GFCI itself. Connecting additional outlets to the LOAD terminals gives those outlets GFCI protection too — label them "GFCI Protected." Always de-energize the circuit before working (NFPA 70E). Test with a calibrated meter before touching conductors.',
   example:'Bathroom outlet: turn off breaker → verify dead with meter → black to brass (LINE) → white to silver (LINE) → bare to green → mount → press TEST then RESET → verify with GFCI tester.',
   related:['NEC 210.8','NEC 406.4','NEC 250.119']},
  {id:'how2',topic:'How to Wire a Standard Outlet',calcTab:null,tags:['outlet wiring','receptacle install','where does neutral go outlet','duplex receptacle','how to wire outlet','black wire goes where'],
   short:'Hot (black) to brass screw, Neutral (white) to silver screw, Ground (green/bare) to green screw.',
   refs:['NEC 406.4','NEC 200.9'],
   explain:'On a standard 120V duplex receptacle: the brass (darker) screws are the hot terminals — connect the black wire here. The silver (lighter) screws are neutral — connect the white wire here. The green screw at the bottom is the equipment ground — connect the bare copper or green wire here. NEC 200.9 requires white/gray conductors to be connected to the grounded (neutral) terminal. Always verify with a meter that the circuit is de-energized before working.',
   example:'15A single-pole circuit: black → brass screw, white → silver screw, bare → green screw. Tighten to 12 in-lb. Protect with 15A breaker maximum (#14 AWG Cu per NEC 240.4(D)).',
   related:['NEC 406.4','NEC 200.9','NEC 240.4']},
  {id:'how3',topic:'How to Run a Subpanel',calcTab:null,tags:['subpanel install','detached garage panel','4 wire feeder','run subpanel','how to wire subpanel','neutral ground subpanel'],
   short:'Use 4-wire feeder: two hots, one neutral, one ground. Keep neutral and ground SEPARATE in the subpanel.',
   refs:['NEC 225.30','NEC 250.32','NEC 250.142(B)'],
   explain:'A subpanel fed from a main panel in the same building requires a 4-wire feeder: two ungrounded (hot) conductors, one neutral, one separate equipment grounding conductor. Inside the subpanel, neutral and ground must be on separate bus bars — do NOT install a main bonding jumper (that connects neutral to ground). The neutral bus must be isolated from the panel enclosure. The ground bus bonds to the enclosure. This prevents dangerous neutral current from flowing on the grounding path.',
   example:'200A garage subpanel: 4-wire feeder from main (e.g. 2/0-2/0-2/0-4 AWG Cu). Separate neutral and ground bars. No main bonding jumper. Bond ground bus to panel enclosure. Per NEC 225.30, only one feeder to a separate structure.',
   related:['NEC 250.32','NEC 250.142','NEC 225.30']},
  {id:'how4',topic:'How to Wire a 3-Way Switch',calcTab:null,tags:['3 way switch','3-way wiring','traveler wires','how to wire switch','common terminal switch','switch wiring'],
   short:'3-way switches use a common (COM) terminal and two traveler terminals. Power enters one switch, travelers link both switches, load wire exits the other.',
   refs:['NEC 404.2','NEC 200.7'],
   explain:'A 3-way switch has three terminals: one marked COM (common) and two traveler terminals. Wire the incoming hot to the COM of the first switch. Run two traveler wires between the traveler terminals of both switches. Connect the switched hot from the COM of the second switch to the load (light). The neutral runs through but bypasses both switches. With 14/3 NM cable, the red wire is typically used as a traveler. The white wire used as a switch leg should be re-identified with black tape (NEC 200.7).',
   example:'Switch leg wiring: hot → COM switch 1 → traveler 1 → switch 2 → traveler 2 → switch 1 (cross-connected). COM switch 2 → light. Neutral → light (bypasses switches).',
   related:['NEC 404.2','NEC 200.7','NEC 404.14']},
  {id:'how5',topic:'GFCI vs AFCI — When to Use Each',calcTab:null,tags:['gfci vs afci','when to use gfci','when to use afci','dual function breaker','arc fault vs ground fault'],
   short:'GFCI stops ground faults (electrocution risk in wet areas). AFCI stops arc faults (fire risk from damaged wiring).',
   refs:['NEC 210.8','NEC 210.12'],
   explain:'GFCI (Ground Fault Circuit Interrupter) detects current imbalance between hot and neutral — indicating current is taking a path through a person or water. Required in wet locations: bathrooms, kitchens, outdoors, garages, basements, near pools. AFCI (Arc Fault Circuit Interrupter) detects the electrical signature of arcing — sparking in damaged wires — which can start fires inside walls without triggering a standard breaker. Required for most 120V branch circuits in dwelling units per 2020/2023 NEC. Dual-function breakers combine both protections in one device.',
   example:'New bathroom circuit: needs GFCI. New bedroom circuit in 2020+ NEC jurisdiction: needs AFCI. New kitchen circuit: may need both — check your adopted NEC edition and local AHJ.',
   related:['NEC 210.8','NEC 210.12']},
];
const searchKB = (q) => {
  if (!q.trim()) return NEC_KB;
  const ql = q.toLowerCase();
  return NEC_KB.filter(a => [a.topic,...a.tags,a.short,...a.refs].join(' ').toLowerCase().includes(ql));
};

// ─── SMART LOCAL NEC ASSISTANT ────────────────────────────────────────────────
const normalizeText = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text.toLowerCase().replace(/[?.,!;:'"()]/g,' ').replace(/\s+/g,' ').trim();
};

const NEC_SYNONYMS = {
  'bathroom outlet':'gfci','bathroom receptacle':'gfci','kitchen outlet':'gfci',
  'kitchen receptacle':'gfci','outdoor outlet':'gfci','garage outlet':'gfci',
  'basement outlet':'gfci','ground fault':'gfci','need gfci':'gfci',
  'arc fault':'afci protection','bedroom breaker':'afci protection',
  'bedroom outlet':'afci protection','arc fault interrupter':'afci protection',
  'working clearance':'working clearances','panel clearance':'working clearances',
  'panel space':'working clearances','how much clearance':'working clearances',
  'clearance in front':'working clearances','3 feet in front':'working clearances',
  'box cubic inches':'box fill','how many wires in box':'box fill',
  'box size':'box fill','wire box':'box fill','junction box size':'box fill',
  'cubic inches':'box fill','how big a box':'box fill',
  'pipe fill':'conduit fill','conduit capacity':'conduit fill',
  'how many wires in conduit':'conduit fill','wires per conduit':'conduit fill',
  'conduit percent':'conduit fill','fill conduit':'conduit fill',
  'voltage loss':'voltage drop','voltage difference':'voltage drop',
  'wire too small':'voltage drop','long run':'voltage drop','drop percent':'voltage drop',
  'ev charger':'ev charging','car charger':'ev charging','electric vehicle':'ev charging',
  'level 2':'ev charging','tesla charger':'ev charging','evse':'ev charging',
  'ground wire':'equipment grounding','green wire':'equipment grounding',
  'bare wire':'equipment grounding','emt ground':'equipment grounding',
  'can emt be ground':'equipment grounding','egc':'equipment grounding',
  'grounding conductor':'equipment grounding','equipment ground':'equipment grounding',
  'motor wire':'motor circuit sizing','motor conductor':'motor circuit sizing',
  'motor breaker':'motor circuit sizing','motor overload':'motor circuit sizing',
  'motor sizing':'motor circuit sizing','size motor':'motor circuit sizing',
  'continuous':'continuous loads','125 percent':'continuous loads',
  '3 hour load':'continuous loads','run continuously':'continuous loads',
  // Overcurrent
  'what size breaker':'overcurrent conductor protection','breaker size':'overcurrent conductor protection',
  'what wire for 20 amp':'overcurrent conductor protection','wire size for breaker':'overcurrent conductor protection',
  '14 awg breaker':'overcurrent conductor protection','12 awg breaker':'overcurrent conductor protection',
  // Service
  'main breaker':'service disconnect requirements','how many breakers service':'service disconnect requirements',
  'service entry':'service disconnect requirements','meter main':'service disconnect requirements',
  // Subpanel
  'subpanel neutral':'neutral-ground separation','run subpanel':'neutral-ground separation',
  'detached garage panel':'neutral-ground separation','4 wire feeder':'neutral-ground separation',
  'neutral ground bond':'neutral-ground separation',
  // AFCI
  'arc fault breaker':'afci protection','do i need arc fault':'afci protection',
  'afci required':'afci protection','arc fault bedroom':'afci protection',
  // Ampacity
  'how many amps can':'ampacity derating','wire too hot':'ampacity derating',
  'derating':'ampacity derating','conduit fill ampacity':'ampacity derating',
  'ambient temperature wire':'ampacity derating',
  // How-to installation
  'how to wire gfci':'how to wire a gfci outlet','install gfci':'how to wire a gfci outlet',
  'where does neutral go':'how to wire a standard outlet','white wire outlet':'how to wire a standard outlet',
  'install outlet':'how to wire a standard outlet','wire receptacle':'how to wire a standard outlet',
  'black wire brass':'how to wire a standard outlet','how to wire outlet':'how to wire a standard outlet',
  'run subpanel':'how to run a subpanel','wire subpanel':'how to run a subpanel',
  'garage panel':'how to run a subpanel','4 wire feeder':'how to run a subpanel',
  'detached structure panel':'how to run a subpanel',
  'three way switch':'how to wire a 3-way switch','3 way switch':'how to wire a 3-way switch',
  'traveler wire':'how to wire a 3-way switch','common terminal':'how to wire a 3-way switch',
  'when to use gfci':'gfci vs afci — when to use each',
  'when to use afci':'gfci vs afci — when to use each',
  'do i need afci or gfci':'gfci vs afci — when to use each',
};

const scoredSearch = (rawQuery) => {
  const q = normalizeText(rawQuery);
  if (!q) return NEC_KB;
  let expandedQ = q;
  for (const [phrase, replacement] of Object.entries(NEC_SYNONYMS)) {
    if (q.includes(normalizeText(phrase))) expandedQ = expandedQ + ' ' + replacement;
  }
  const scored = NEC_KB.map(article => {
    let score = 0;
    const topicN = normalizeText(article.topic);
    const tagsN  = article.tags.map(t => normalizeText(t));
    const refsN  = article.refs.map(r => normalizeText(r));
    const shortN = normalizeText(article.short);
    if (expandedQ.includes(topicN) || topicN.split(' ').every(w => w.length < 3 || expandedQ.includes(w))) score += 10;
    tagsN.forEach(tag => { if (expandedQ.includes(tag) || tag.split(' ').every(w => w.length < 3 || expandedQ.includes(w))) score += 5; });
    refsN.forEach(ref => { const nums = ref.match(/\d+\.\d+/g)||[]; nums.forEach(n => { if (q.includes(n)) score += 8; }); });
    const qWords = q.split(' ').filter(w => w.length > 3);
    qWords.forEach(word => {
      if (topicN.includes(word)) score += 3;
      tagsN.forEach(tag => { if (tag.includes(word)) score += 2; });
      if (shortN.includes(word)) score += 1;
    });
    const eWords = expandedQ.split(' ').filter(w => w.length > 3 && !q.includes(w));
    eWords.forEach(word => { if (topicN.includes(word)) score += 4; tagsN.forEach(tag => { if (tag.includes(word)) score += 3; }); });
    return { article, score };
  });
  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).map(s => s.article);
};

/**
 * What we say when the daily allowance runs out.
 *
 * The number is READ, not typed. This sentence used to hardcode "5 daily free
 * answers" while useGating.js and FREE_LIMITS both enforce 3 — so the app cut
 * a user off two answers early and then told them, in writing, that they had
 * received five. A number that appears in copy and again in a limit check is
 * one number, and it lives in the module that enforces it.
 */
/**
 * What the last 429 actually said. Set by askNecBackend, read by whoever shows
 * the message — so the wording comes from the server's own reason rather than
 * from a constant in this file that the server has never seen.
 */
let lastLimit = { reason: null, serverLimit: null };

/**
 * The old message interpolated the app's own FREE_ASK_LIMIT: "you've used
 * your 5 free answers for
 * today.` — the app's number, in a sentence about the server's decision. When
 * they disagree the user is cut off after three and told they used five, which
 * is the first bug ever reported on this project. It states a count only when
 * the server supplied one.
 */
const rateLimitText = (isPro = false) => limitLine({ ...lastLimit, isPro });

// Backend placeholder — returns null until URL is configured
const askNecBackend = async (payload) => {
  if (!NEC_BACKEND_URL) return null;
  try {
    const controller = new AbortController();
    // Longer timeout when an image is attached — vision is slower, and a dense
    // plan sheet for Blueprint Takeoff is the slowest request the app makes.
    //
    // 50s sits deliberately UNDER the backend's 60s maxDuration. If the client
    // gave up first, the function would keep running to completion and bill for
    // an answer nobody receives; letting the server be the shorter fuse means a
    // timeout produces a real error instead of a silent charge.
    const timeout = payload.image ? 50000 : 15000;
    const to = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(NEC_BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
    clearTimeout(to);
    if (res.status === 429) {
      // Keep what the server said. The reason names WHICH ceiling was hit and
      // any figure in the body is the only trustworthy count — the app does not
      // meter SparkAI, so its own constant is not evidence of anything.
      let reason = null;
      let serverLimit = null;
      try {
        const body = await res.json();
        reason = body?.error ?? null;
        const n = Number(body?.dailyLimit ?? body?.limit);
        if (Number.isFinite(n) && n > 0) serverLimit = n;
      } catch { /* an empty or non-JSON 429 is still a 429 */ }
      lastLimit = { reason, serverLimit };
      return 'rate_limited';
    }
    if (!res.ok) {
      // Return the STATUS rather than collapsing it to null.
      //
      // Every failure used to become null, so a 413, a 401, a 500 and airplane
      // mode all produced the same sentence on screen: "check your connection".
      // Blueprint Takeoff showed that while the connection was fine, which sent
      // two days at the wrong end of the stack. A caller that wants the old
      // behaviour still gets a falsy `answer`; one that wants to say something
      // true now can.
      const body = await res.text().catch(() => '');
      return { ok: false, status: res.status, body: body.slice(0, 300) };
    }
    return await res.json();
  } catch (e) {
    safeLog('askNecBackend', e);
    // AbortError is a timeout, not an unreachable host, and telling somebody to
    // check their connection when the request was simply slow is wrong advice.
    return { ok: false, status: 0, aborted: e?.name === 'AbortError', body: e?.message ?? '' };
  }
};

// ─── CALCULATOR DATA ──────────────────────────────────────────────────────────
const TAKE_UP={EMT:{'1/2"':5,'3/4"':6,'1"':8,'1-1/4"':11,'1-1/2"':13,'2"':16},IMC:{'1/2"':5,'3/4"':6,'1"':8,'1-1/4"':11,'1-1/2"':13,'2"':16},RMC:{'1/2"':6,'3/4"':8,'1"':11,'1-1/4"':14,'1-1/2"':17,'2"':21},PVC:{'1/2"':5,'3/4"':6,'1"':8,'1-1/4"':11,'1-1/2"':13,'2"':16}};
const OFFSET_MULT={10:{m:6.0,s:0.06},22:{m:2.6,s:0.06},30:{m:2.0,s:0.13},45:{m:1.414,s:0.21},60:{m:1.155,s:0.27}};
const VD_RES={'14 AWG':[3.14,5.17],'12 AWG':[1.98,3.25],'10 AWG':[1.24,2.04],'8 AWG':[0.778,1.28],'6 AWG':[0.491,0.808],'4 AWG':[0.308,0.508],'2 AWG':[0.194,0.319],'1/0 AWG':[0.122,0.201],'2/0 AWG':[0.0967,0.159],'4/0 AWG':[0.0608,0.100],'250 kcmil':[0.0515,0.0847]};
const VD_AMP={'14 AWG':15,'12 AWG':20,'10 AWG':30,'8 AWG':50,'6 AWG':65,'4 AWG':85,'2 AWG':115,'1/0 AWG':150,'2/0 AWG':175,'4/0 AWG':230,'250 kcmil':255};
const VD_GAUGES=['14 AWG','12 AWG','10 AWG','8 AWG','6 AWG','4 AWG','2 AWG','1/0 AWG','2/0 AWG','4/0 AWG','250 kcmil'];
const CONDUCTOR_VOL={'#18':1.5,'#16':1.75,'#14':2.0,'#12':2.25,'#10':2.5,'#8':3.0,'#6':5.0};
// NEC Chapter 9, Table 4 — TOTAL internal cross-sectional area, in².
//
// These used to hold the 40% column, while `calc` divided by them and then
// compared the result to MAX_FILL (40). That required fill to be 40% of the 40%
// area — 16% of the conduit — and told people a 1/2" EMT holds three #12 THHN
// when Table C.1 permits nine. RMC was a copy of the EMT row and PVC-40 was
// partly RMC's, so two of the four conduit types were the wrong pipe entirely.
//
// Fill % is a percentage of the TOTAL area (Chapter 9, Table 1). Store the total
// here and let MAX_FILL do the limiting, which is the one arrangement where the
// numbers reproduce Table C.1 — see tests/conduitFill.test.js.
const COND_AREAS={EMT:{'1/2"':0.304,'3/4"':0.533,'1"':0.864,'1-1/4"':1.496,'1-1/2"':2.036,'2"':3.356},IMC:{'1/2"':0.342,'3/4"':0.586,'1"':0.959,'1-1/4"':1.647,'1-1/2"':2.225,'2"':3.630},RMC:{'1/2"':0.314,'3/4"':0.549,'1"':0.887,'1-1/4"':1.526,'1-1/2"':2.071,'2"':3.408},'PVC-40':{'1/2"':0.285,'3/4"':0.508,'1"':0.832,'1-1/4"':1.453,'1-1/2"':1.986,'2"':3.291}};
const WIRE_AREAS_CF={THHN:{'14':0.0097,'12':0.0133,'10':0.0211,'8':0.0366,'6':0.0507,'4':0.0824,'2':0.1158,'1/0':0.1855,'2/0':0.2223},XHHW:{'14':0.0139,'12':0.0181,'10':0.0243,'8':0.0437,'6':0.0590,'4':0.0814,'2':0.1146,'1/0':0.1825,'2/0':0.2190}};
const MAX_FILL={1:53,2:31,3:40};
const AMPACITY={copper:{'60C':{'14':15,'12':20,'10':30,'8':40,'6':55,'4':70,'3':85,'2':95,'1':110,'1/0':125,'2/0':145,'3/0':165,'4/0':195},'75C':{'14':20,'12':25,'10':35,'8':50,'6':65,'4':85,'3':100,'2':115,'1':130,'1/0':150,'2/0':175,'3/0':200,'4/0':230},'90C':{'14':25,'12':30,'10':40,'8':55,'6':75,'4':95,'3':110,'2':130,'1':150,'1/0':170,'2/0':195,'3/0':225,'4/0':260}},aluminum:{'60C':{'12':15,'10':25,'8':30,'6':40,'4':55,'3':65,'2':75,'1':85,'1/0':100,'2/0':115,'3/0':130,'4/0':150},'75C':{'12':20,'10':30,'8':40,'6':50,'4':65,'3':75,'2':90,'1':100,'1/0':120,'2/0':135,'3/0':155,'4/0':180},'90C':{'12':25,'10':35,'8':45,'6':60,'4':75,'3':85,'2':100,'1':115,'1/0':135,'2/0':150,'3/0':175,'4/0':205}}};
const AMP_CU=['14','12','10','8','6','4','3','2','1','1/0','2/0','3/0','4/0'];
const AMP_AL=['12','10','8','6','4','3','2','1','1/0','2/0','3/0','4/0'];

// ─── WIRE COLOR SYSTEMS ───────────────────────────────────────────────────────
const WIRE_SYSTEMS=[
  {name:'120/240V 1Φ',phaseColors:['#1A1A1A','#DC2626'],phases:['L1','L2'],wires:[
    {color:'Black',hex:'#1A1A1A',use:'Hot (L1)',volt:'120/240V',note:'Always live'},
    {color:'Red',hex:'#DC2626',use:'Hot (L2)',volt:'240V',note:'Second hot leg'},
    {color:'White',hex:'#F8F8F8',border:'#D1D5DB',use:'Neutral',volt:'0V ref',note:'May carry current'},
    {color:'Green',hex:'#16A34A',use:'Ground',volt:'0V',note:'Safety only'}]},
  {name:'208/120V 3Φ',phaseColors:['#1A1A1A','#DC2626','#2563EB'],phases:['A','B','C'],wires:[
    {color:'Black',hex:'#1A1A1A',use:'Phase A',volt:'120/208V',note:'First leg'},
    {color:'Red',hex:'#DC2626',use:'Phase B',volt:'120/208V',note:'Second leg'},
    {color:'Blue',hex:'#2563EB',use:'Phase C',volt:'120/208V',note:'Third leg'},
    {color:'White',hex:'#F8F8F8',border:'#D1D5DB',use:'Neutral',volt:'0V ref',note:'Wye center'},
    {color:'Green',hex:'#16A34A',use:'Ground',volt:'0V',note:'Equipment ground'}]},
  {name:'480/277V 3Φ',phaseColors:['#92400E','#EA580C','#CA8A04'],phases:['A','B','C'],wires:[
    {color:'Brown',hex:'#92400E',use:'Phase A',volt:'277/480V',note:'High voltage'},
    {color:'Orange',hex:'#EA580C',use:'Phase B',volt:'277/480V',note:'High voltage'},
    {color:'Yellow',hex:'#CA8A04',use:'Phase C',volt:'277/480V',note:'High voltage'},
    {color:'Gray',hex:'#6B7280',use:'Neutral',volt:'0V ref',note:'Gray >250V'},
    {color:'Green',hex:'#16A34A',use:'Ground',volt:'0V',note:'Equipment ground'}]},
  {name:'240V Delta',phaseColors:['#1A1A1A','#EA580C','#DC2626'],phases:['A','B⚠️','C'],wires:[
    {color:'Black',hex:'#1A1A1A',use:'Phase A',volt:'240V',note:'Standard'},
    {color:'Orange ⚠️',hex:'#EA580C',use:'HIGH LEG B',volt:'208V to N!',note:'NO 120V loads!'},
    {color:'Red',hex:'#DC2626',use:'Phase C',volt:'240V',note:'Standard'},
    {color:'White',hex:'#F8F8F8',border:'#D1D5DB',use:'Neutral',volt:'0V ref',note:'Center tap'},
    {color:'Green',hex:'#16A34A',use:'Ground',volt:'0V',note:'Equipment ground'}]},
  {name:'DC Solar/EV',phaseColors:['#DC2626','#1A1A1A'],phases:['+','-'],wires:[
    {color:'Red',hex:'#DC2626',use:'Positive (+)',volt:'System V',note:'NEC 690'},
    {color:'Black',hex:'#1A1A1A',use:'Negative (−)',volt:'0V ref',note:'DC negative'},
    {color:'Green',hex:'#16A34A',use:'Ground',volt:'0V',note:'Bonding'}]},
];
const getPanelPhases=(sys)=>{
  const pc=sys.phaseColors,ph=sys.phases||['A','B','C'],rows=[];
  for(let i=1;i<=160;i+=2) rows.push({left:i,right:i+1,cL:pc[Math.floor((i-1)/2)%pc.length],cR:pc[Math.floor(i/2)%pc.length],lL:ph[Math.floor((i-1)/2)%ph.length],lR:ph[Math.floor(i/2)%ph.length]});
  return rows;
};

// ─── REVENUECAT SERVICE ──────────────────────────────────────────────────────
// TODO: npx expo install react-native-purchases
// Replace placeholder keys with real RevenueCat dashboard keys
// SECURITY NOTE: RevenueCat PUBLIC SDK keys are safe to include in the app bundle.
// They are NOT secret — they are designed to be embedded in client apps.
// They can only be used to identify your app to RevenueCat, not to access billing data.
// DO NOT put your RevenueCat SECRET key (from dashboard API keys) in this app — that's backend-only.
// DO NOT put OpenAI, Anthropic, Firebase Admin, or Supabase service keys here.
const RC_IOS_KEY     = 'YOUR_IOS_KEY_HERE';     // ← SAFE to be in app (public SDK key)
const RC_ANDROID_KEY = 'YOUR_ANDROID_KEY_HERE'; // ← SAFE to be in app (public SDK key)
const RC_ENTITLEMENT = 'pro';
//
// When ready, uncomment and wire up:
//   import Purchases from 'react-native-purchases';
//   Purchases.configure({ apiKey: Platform.OS==='ios' ? RC_IOS_KEY : RC_ANDROID_KEY });
//   const { customerInfo } = await Purchases.getCustomerInfo();
//   const isPro = customerInfo.entitlements.active[RC_ENTITLEMENT] !== undefined;
//   const { customerInfo: ci } = await Purchases.restorePurchases();
//
// Default Pro state for screens that are not passed the live value. The real
// value now comes from RevenueCat (src/purchases.js) and is threaded down as an
// `isPro` prop — this const is only the fallback when nothing was passed.
//
// SECURITY: IS_PRO is CLIENT-SIDE UI gating only.
// It controls what the UI shows — it does NOT secure server-side features.
// When real AI is connected, the BACKEND must independently verify the
// user's subscription status before processing any paid AI request.
// Never trust IS_PRO for backend access control.
const IS_PRO = false;

// ─── BACKEND CONFIGURATION ───────────────────────────────────────────────────
// SECURITY: This is your Vercel deployment URL. It is safe to be in the app —
// it's a public endpoint. The AI API key lives ONLY in Vercel environment vars.
// Replace with your real Vercel URL after deployment.
// ─── BACKEND CONFIG ──────────────────────────────────────────────────────────
// SECURITY: AI API key NEVER goes here. Backend handles it.
// Set NEC_BACKEND_URL when your serverless backend is deployed.
const NEC_BACKEND_URL = 'https://sparkconnect-website.vercel.app/api/ask-nec';

// Anonymous device ID — not tied to user identity, used only for rate limiting.
// Generates once per app install and persists locally.
let _deviceId = null;
const getDeviceId = async () => {
  if (_deviceId) return _deviceId;
  try {
    let stored = await AsyncStorage.getItem('@sc_device_id');
    if (!stored) {
      // Generate a random ID — no personal data, no device fingerprinting
      stored = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem('@sc_device_id', stored);
    }
    _deviceId = stored;
    return stored;
  } catch(e) { safeLog('getDeviceId', e); return 'dev_fallback'; }
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2 of 4 — Shared Components
// ═══════════════════════════════════════════════════════════════════════════

// ─── CARD ─────────────────────────────────────────────────────────────────
const Card = ({ children, style, C }) => (
  <View style={[{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 }, style]}>
    {children}
  </View>
);

// ─── LABEL ────────────────────────────────────────────────────────────────
const Lbl = ({ children, C }) => (
  <Text style={{ fontSize: 10, fontWeight: '600', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
    {children}
  </Text>
);

// ─── SEGMENTED CONTROL ────────────────────────────────────────────────────
const Seg = ({ options, value, onChange, color, C }) => (
  <View style={{ flexDirection: 'row', backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, padding: 3, gap: 3 }}>
    {options.map(o => (
      <TouchableOpacity key={o.v} style={{ flex: 1, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 7, alignItems: 'center', backgroundColor: value === o.v ? (color || C.blue) : 'transparent' }}
        onPress={() => onChange(o.v)} activeOpacity={0.8}>
        <Text style={{ fontSize: 11, fontWeight: value === o.v ? '700' : '600', color: value === o.v ? '#fff' : C.textSec }}>{o.l}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

// ─── CHIP ─────────────────────────────────────────────────────────────────
const Chip = ({ label, active, onPress, color, C }) => (
  <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: active ? (color || C.blue) : C.surface, borderRadius: 8, borderWidth: 1.5, borderColor: active ? (color || C.blue) : C.border, alignItems: 'center' }}
    onPress={onPress} activeOpacity={0.7}>
    <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#fff' : C.textSec }}>{label}</Text>
  </TouchableOpacity>
);

// ─── INPUT FIELD ──────────────────────────────────────────────────────────
const Inp = ({ label, value, onChangeText, unit, placeholder, C, keyboardType = 'numeric' }) => (
  <View style={{ marginBottom: 12 }}>
    {label ? <Lbl C={C}>{label}</Lbl> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1.5, borderColor: C.inputBorder, overflow: 'hidden', minHeight: 46 }}>
      <TextInput
        style={{ flex: 1, fontSize: 15, fontWeight: '500', color: C.inputText, paddingHorizontal: 12, paddingVertical: 10, borderRightWidth: unit ? 1 : 0, borderRightColor: C.border }}
        value={value}
        onChangeText={text => {
          // Strip non-numeric characters from numeric fields
          const cleaned = keyboardType === 'numeric' || keyboardType === 'number-pad' || keyboardType === 'decimal-pad'
            ? cleanNumberInput(text)
            : text;
          onChangeText(cleaned);
        }}
        placeholder={placeholder}
        placeholderTextColor={C.placeholder} keyboardType={keyboardType} returnKeyType="done" maxLength={20} />
      {unit && (
        <View style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.blueSub, minWidth: 48, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.blue }}>{unit}</Text>
        </View>
      )}
    </View>
  </View>
    );

// ─── BIG BUTTON ───────────────────────────────────────────────────────────
const BigBtn = ({ onPress, label, color, icon = 'calculator', C, disabled = false }) => {
  const bg = color || C.blue;
  return (
    <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, marginTop: 4, marginBottom: 16, backgroundColor: bg, opacity: disabled ? 0.5 : 1, shadowColor: bg, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 }}
      onPress={onPress} disabled={disabled} activeOpacity={0.85}>
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{label}</Text>
    </TouchableOpacity>
  );
};

// ─── RESULT ROW ───────────────────────────────────────────────────────────
const RRow = ({ l, v, hi, warn, ok, C }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
    <Text style={{ fontSize: 12, color: C.textSec, fontWeight: '500', flex: 1 }}>{l}</Text>
    <Text style={{ fontSize: 13, fontWeight: '700', color: ok ? C.success : warn ? C.warning : hi ? C.blue : C.text }}>{v}</Text>
  </View>
);

// ─── RESULT CARD ──────────────────────────────────────────────────────────
const ResultCard = ({ title, status, children, C }) => {
  const bColor = status === 'pass' ? C.success : status === 'warn' ? C.warning : status === 'fail' ? C.danger : C.blue;
  const bg = status === 'pass' ? C.successBg : status === 'warn' ? C.warningBg : status === 'fail' ? C.dangerBg : C.blueSub;
  return (
    <View style={{ borderRadius: 12, borderLeftWidth: 4, borderLeftColor: bColor, backgroundColor: bg, padding: 12, marginBottom: 10 }}>
      {title && <Text style={{ fontSize: 10, fontWeight: '700', color: bColor, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</Text>}
      {children}
    </View>
  );
};

// ─── TIP BOX ──────────────────────────────────────────────────────────────
const TipBox = ({ text, C, type = 'warn' }) => {
  const bc = type === 'danger' ? C.danger : type === 'ok' ? C.success : C.warning;
  const bg = type === 'danger' ? C.dangerBg : type === 'ok' ? C.successBg : C.warningBg;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 9, borderLeftWidth: 3, borderLeftColor: bc, padding: 10, marginBottom: 8 }}>
      <Text style={{ fontSize: 12, color: C.text, lineHeight: 18 }}>{text}</Text>
    </View>
  );
};

// ─── PRO OVERLAY ──────────────────────────────────────────────────────────
const ProOverlay = ({ feature, C }) => (
  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.overlay, borderRadius: 0, alignItems: 'center', justifyContent: 'center', padding: 32, zIndex: 10 }}>
    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
      <Ionicons name="lock-closed" size={30} color={C.blue} />
    </View>
    <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 8 }}>Pro Feature</Text>
    <Text style={{ fontSize: 14, color: C.textSec, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
      {feature} is available with SparkConnect Pro.
    </Text>
    <View style={{ backgroundColor: C.blue, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>⚡ Coming Soon — Join Waitlist</Text>
    </View>
  </View>
);

// ─── SECTION HEADER ───────────────────────────────────────────────────────
const SectionHeader = ({ title, C }) => (
  <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginBottom: 10, marginTop: 4 }}>{title}</Text>
);

// ─── BEND DIAGRAM (SVG) ───────────────────────────────────────────────────
const BendDiagram = ({ type, result, stub, offsetH, offsetA, C }) => {
  const W = SW - 32, H = 150, pipe = C.blue, dim = C.warning;
  if (type === '90') {
    const mx = W * 0.28, my = H - 40, sh = 80;
    return (
      <Svg width={W} height={H}>
        <Path d={`M 20 ${my} L ${mx} ${my}`} stroke={pipe} strokeWidth={5} strokeLinecap="round" />
        <Path d={`M ${mx} ${my} L ${mx} ${my - sh}`} stroke={pipe} strokeWidth={5} strokeLinecap="round" />
        <Path d={`M ${mx - 18} ${my} Q ${mx} ${my} ${mx} ${my - 18}`} stroke={pipe} strokeWidth={5} fill="none" />
        {result && <><Line x1={mx} y1={my + 8} x2={mx} y2={my + 22} stroke={dim} strokeWidth={2} /><SvgText x={mx + 6} y={my + 22} fill={dim} fontSize="11" fontWeight="bold">Mark: {result.mark}"</SvgText></>}
        <SvgText x={mx + 10} y={my - sh / 2 + 4} fill={dim} fontSize="11" fontWeight="bold">{stub}"</SvgText>
        <SvgText x={mx - 48} y={my - 24} fill={C.text} fontSize="12" fontWeight="bold">90°</SvgText>
      </Svg>
    );
  }
  if (type === '45') {
    const sx = 30, sy = H - 40, ex = W - 40, ey = 40;
    return (
      <Svg width={W} height={H}>
        <Path d={`M ${sx} ${sy} L ${ex} ${ey}`} stroke={pipe} strokeWidth={5} strokeLinecap="round" />
        <SvgText x={sx + 44} y={sy - 8} fill={dim} fontSize="12" fontWeight="bold">45°</SvgText>
        {result && <SvgText x={(sx + ex) / 2 - 32} y={(sy + ey) / 2 + 14} fill={dim} fontSize="11" fontWeight="bold">Mark: {result.mark}"</SvgText>}
      </Svg>
    );
  }
  if (type === 'offset') {
    const y1 = H - 50, y2 = 50, x1 = 30, x2 = W * 0.38, x3 = W * 0.62, x4 = W - 20;
    return (
      <Svg width={W} height={H}>
        <Path d={`M ${x1} ${y1} L ${x2} ${y1}`} stroke={pipe} strokeWidth={5} strokeLinecap="round" />
        <Path d={`M ${x2} ${y1} L ${x3} ${y2}`} stroke={pipe} strokeWidth={5} strokeLinecap="round" />
        <Path d={`M ${x3} ${y2} L ${x4} ${y2}`} stroke={pipe} strokeWidth={5} strokeLinecap="round" />
        <Line x1={x4 + 5} y1={y1} x2={x4 + 5} y2={y2} stroke={dim} strokeWidth={1.5} strokeDasharray="4,3" />
        <SvgText x={x4 + 9} y={(y1 + y2) / 2 + 4} fill={dim} fontSize="11" fontWeight="bold">{offsetH}"</SvgText>
        {result && <SvgText x={(x2 + x3) / 2 - 16} y={H - 4} fill={dim} fontSize="10" fontWeight="bold">{result.spacing}"</SvgText>}
        <SvgText x={(x2 + x3) / 2 - 10} y={(y1 + y2) / 2} fill={C.text} fontSize="11" fontWeight="bold">{offsetA}°</SvgText>
      </Svg>
    );
  }
  if (type === 'rolling') {
    const x1 = 30, y1 = H - 50, x2 = W * 0.5, y2 = H / 2, x3 = W - 30, y3 = 50;
    return (
      <Svg width={W} height={H}>
        <Path d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3}`} stroke={pipe} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={`M ${x1} ${y1} L ${x3} ${y3}`} stroke={dim} strokeWidth={1.5} strokeDasharray="5,4" />
        {result && <SvgText x={x2 - 26} y={y2 - 10} fill={dim} fontSize="11" fontWeight="bold">Travel: {result.travel}"</SvgText>}
        <SvgText x={W / 2 - 40} y={H - 4} fill={C.textTert} fontSize="9">Rolling Offset (projected)</SvgText>
      </Svg>
    );
  }
  if (type === 'saddle3') {
    const y1 = H - 40, y2 = 40, xA = 40, xB = W * 0.33, xC = W * 0.67, xD = W - 40;
    return (
      <Svg width={W} height={H}>
        <Path d={`M ${xA} ${y1} L ${xB} ${y1} L ${(xB + xC) / 2} ${y2} L ${xC} ${y1} L ${xD} ${y1}`} stroke={pipe} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        {result && <><SvgText x={xB - 10} y={y1 + 16} fill={dim} fontSize="10" fontWeight="bold">M1:{result.mark1}"</SvgText><SvgText x={xC - 10} y={y1 + 16} fill={dim} fontSize="10" fontWeight="bold">M2:{result.mark2}"</SvgText></>}
        <SvgText x={W / 2 - 30} y={H - 2} fill={C.textTert} fontSize="9">3-Point Saddle</SvgText>
      </Svg>
    );
  }
  if (type === 'saddle4') {
    const y1 = H - 40, y2 = 40, xA = 20, xB = W * 0.25, xC = W * 0.42, xD = W * 0.58, xE = W * 0.75, xF = W - 20;
    return (
      <Svg width={W} height={H}>
        <Path d={`M ${xA} ${y1} L ${xB} ${y1} L ${xC} ${y2} L ${xD} ${y2} L ${xE} ${y1} L ${xF} ${y1}`} stroke={pipe} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <SvgText x={W / 2 - 30} y={H - 2} fill={C.textTert} fontSize="9">4-Point Saddle</SvgText>
      </Svg>
    );
  }
  return null;
};

// ═══ END SECTION 2 — paste Section 3 directly below ═══
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3 of 4 — All Screens
// ═══════════════════════════════════════════════════════════════════════════

// ─── HOME ────────────────────────────────────────────────────────────────────
const HomeScreen = ({ setTab, C, showDailyQ = true, streak = 0, onStreakUpdate, homeLayout = null, suggestion = null, onDismissSuggestion, isHidden = null }) => {
  const [notifPromptShown, setNotifPromptShown] = React.useState(false);
  const [notifEnabled, setNotifEnabled] = React.useState(false);
  const [notifDismissed, setNotifDismissed] = React.useState(true); // assume hidden until storage answers
  const [reminderTime, setReminderTimeState] = React.useState({ hour: 7, minute: 30 });
  React.useEffect(() => {
    isDailyQuestionEnabled().then(setNotifEnabled);
    safeStorageGet('@sc_notif_dismissed').then(v => setNotifDismissed(v === 'true'));
    getReminderTime().then(setReminderTimeState);
  }, []);
  const q = getDailyQuestion();
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [homeAsk, setHomeAsk] = useState('');

  // Home shows 4 core field tools — everything else lives in Calculators tab
  const tools = [
    { icon: 'git-branch',   title: 'Pipe Bending',      sub: '90° · 45° · Offsets · Saddles · Rolling', tab: 'bend',      color: C.blue,   bg: C.blueSub },
    { icon: 'color-palette',title: 'Wire Colors',        sub: 'Color codes + 160-slot panel view',        tab: 'wire',      color: C.teal,   bg: C.tealBg },
    { icon: 'book-outline', title: 'Formula Reference',  sub: "Ohm's Law · 3Φ · Motors · Bending",       tab: 'formulas',  color: C.amber,  bg: C.amberBg },
    { icon: 'hammer-outline',title:'Material Estimator', sub: 'Rough estimate + SparkAI pricing',       tab: 'estimator', color: C.green,  bg: C.greenBg },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {/* Home order is deliberate: Daily Question → Quick Tools → Wiring
          Simulator → Sparky search → custom cards. The user asked for exactly
          this — do not shuffle it back. */}

      {/* What they said brought them here — OFFERED, not navigated to.
          Onboarding used to open the app on this tab, so somebody who answered
          "getting better at the trade" landed in the Wiring Simulator having
          never seen Home. Shown once, then dismissed for good. */}
      {suggestion?.tab ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <Card C={C} style={{ borderLeftWidth: 4, borderLeftColor: C.amber }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Ionicons name="sparkles" size={18} color={C.amber} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: C.amber, letterSpacing: 0.6 }}>START HERE</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginTop: 3 }}>
                  {suggestion.headline || suggestion.label}
                </Text>
                <Text style={{ fontSize: 11, color: C.textTert, marginTop: 3, lineHeight: 16 }}>
                  Based on what you told us. Everything else is on this screen and in the tabs below.
                </Text>
              </View>
              <TouchableOpacity onPress={onDismissSuggestion} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} accessibilityLabel="Dismiss suggestion">
                <Ionicons name="close" size={16} color={C.textTert} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => { onDismissSuggestion?.(); setTab(suggestion.tab); }}
              style={{ backgroundColor: C.amber, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 12 }}
              activeOpacity={0.85}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Take me there</Text>
            </TouchableOpacity>
          </Card>
        </View>
      ) : null}

      {/* Daily Question */}
      {showDailyQ && <View style={{ padding: 16 }}>
        <Card C={C} style={{ borderLeftWidth: 4, borderLeftColor: C.blue }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="school" size={16} color={C.blue} />
            </View>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.blue }}>Daily Code Question</Text>
              <Text style={{ fontSize: 10, color: C.textTert }}>{q.category} · {q.difficulty}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 20, marginBottom: 12 }}>{q.question}</Text>
          {q.choices.map((ch, i) => {
            const isSel = selected === i, isCorrect = i === q.correct;
            let bg = C.inputBg, border = C.border, tc = C.textSec;
            if (revealed && isCorrect) { bg = C.successBg; border = C.success; tc = C.success; }
            else if (revealed && isSel && !isCorrect) { bg = C.dangerBg; border = C.danger; tc = C.danger; }
            else if (isSel && !revealed) { bg = C.blueSub; border = C.blue; tc = C.blue; }
            return (
              <TouchableOpacity key={i} onPress={() => { if (!revealed) setSelected(i); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, backgroundColor: bg, borderWidth: 1.5, borderColor: border, marginBottom: 6 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{String.fromCharCode(65 + i)}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: tc }}>{ch}</Text>
                {revealed && isCorrect && <Ionicons name="checkmark-circle" size={16} color={C.success} />}
                {revealed && isSel && !isCorrect && <Ionicons name="close-circle" size={16} color={C.danger} />}
              </TouchableOpacity>
            );
          })}
          {!revealed
            ? <TouchableOpacity disabled={selected === null} onPress={() => { setRevealed(true); if (onStreakUpdate) onStreakUpdate(); }} style={{ backgroundColor: selected === null ? C.border : C.blue, borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: selected === null ? C.textTert : '#fff' }}>Reveal Answer</Text>
              </TouchableOpacity>
            : <View>
                <View style={{ backgroundColor: C.successBg, borderRadius: 8, padding: 10, marginTop: 4, borderLeftWidth: 3, borderLeftColor: C.success }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.success, marginBottom: 3 }}>{q.ref}</Text>
                  <Text style={{ fontSize: 12, color: C.text, lineHeight: 18 }}>{q.explanation}</Text>
                </View>
                {/* Post-answer payoff. No XP number: Home stopped keeping score,
                    because a total that only goes up is not a reason to open a
                    tool you use on a job. The share text names the topic but
                    never the answer — a shared result should recruit, not leak
                    the day's question. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <View style={{ backgroundColor: selected === q.correct ? C.successBg : C.amberBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: selected === q.correct ? C.success : C.amber }}>
                      {selected === q.correct ? 'Correct' : 'Now you know'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      const msg = selected === q.correct
                        ? `⚡ Nailed today's NEC code question (${q.category}) on SparkConnect. Think you'd get it?`
                        : `⚡ Today's NEC code question (${q.category}) on SparkConnect got me — learned something though. Your turn.`;
                      try { await Share.share({ message: msg }); } catch (e) { safeLog('shareDailyQ', e); }
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
                    <Ionicons name="share-outline" size={14} color={C.blue} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.blue }}>Share result</Text>
                  </TouchableOpacity>
                </View>
              </View>}

        </Card>
      </View>}

      {/* ── Notification opt-in card — shows once after user sees Daily Q ── */}
      {showDailyQ && !notifDismissed && !notifEnabled && (
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: C.blue }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="notifications-outline" size={18} color={C.blue} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>Get your morning code question</Text>
            </View>
            <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 18, marginBottom: 12 }}>One notification per day at {formatReminderTime(reminderTime)} — that day's code question, no spam.</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={async () => {
                const result = await enableDailyQuestionNotifications();
                if (result.ok) {
                  setNotifEnabled(true);
                  Alert.alert('✅ Reminder Set!', `You'll get a code question every morning at ${formatReminderTime(reminderTime)}.`);
                } else if (result.reason === 'denied') {
                  Alert.alert('Notifications Blocked', 'Enable notifications in Settings → SparkConnect → Notifications to get your daily code question.');
                } else {
                  Alert.alert('Not Available Here', 'Daily reminders need the full SparkConnect app — they cannot run in Expo Go or the web preview.');
                }
                setNotifDismissed(true);
                await safeStorageSet('@sc_notif_dismissed', 'true');
              }} style={{ flex: 1, backgroundColor: C.blue, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>⚡ Enable Daily Reminder</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                setNotifDismissed(true);
                await safeStorageSet('@sc_notif_dismissed', 'true');
              }} style={{ paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.textSec, fontSize: 12 }}>Not now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── Pulse — one thin line, never a card. It only ever states something
             the app actually knows about THIS user; it never invents a
             community statistic, because nothing counts one. ── */}
      {(() => {
        const pulse = buildPulse({
          streak, jobsitePercent: 0, answeredToday: revealed, dayIndex: dayIndexFor(),
        });
        const body = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Ionicons name={pulse.icon} size={13} color={C.amber} />
            <Text style={{ flex: 1, fontSize: 11.5, color: C.textSec }} numberOfLines={1}>{pulse.text}</Text>
            {pulse.tab && <Ionicons name="chevron-forward" size={12} color={C.textTert} />}
          </View>
        );
        return pulse.tab
          ? <TouchableOpacity onPress={() => setTab(pulse.tab)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={pulse.text}>{body}</TouchableOpacity>
          : <View accessible accessibilityLabel={pulse.text}>{body}</View>;
      })()}

      {/* Quick Tools — 2×2 grid */}
      <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>Quick Tools</Text>
          <TouchableOpacity onPress={() => setTab('calculators')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12, color: C.blue, fontWeight: '600' }}>All Tools</Text>
            <Ionicons name="chevron-forward" size={13} color={C.blue} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {tools.map(t => (
            <TouchableOpacity key={t.tab} onPress={() => setTab(t.tab)} activeOpacity={0.85}
              style={{ width: (SW - 42) / 2, backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
              <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Ionicons name={t.icon} size={20} color={t.color} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 2 }}>{t.title}</Text>
              <Text style={{ fontSize: 10, color: C.textSec, lineHeight: 14 }}>{t.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Wiring Simulator — the training hero, troubleshooting folded in ── */}
      <View style={{ paddingHorizontal: 16, marginTop: 12, marginBottom: 12 }}>
        <View style={{ backgroundColor: '#0D1B3E', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(244,161,29,0.25)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="git-network" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 }}>Wiring Simulator</Text>
              <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.72)', marginTop: 2 }}>Wire real circuits · flip the switch · find the fault</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => setTab('wiringlab')} activeOpacity={0.85}
              style={{ flex: 1, backgroundColor: C.amber, borderRadius: 11, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0D1B3E' }}>⚡ Build Circuits</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('troubleshoot')} activeOpacity={0.85}
              style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 11, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>🔧 Find the Fault</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Job Site — its own banner, directly under the simulator. It is a
             different kind of thing (a place you walk around, with the crew in
             it), so it gets its own card. The copy has to carry that: "Job
             Site" alone reads like another calculator. ── */}
      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <TouchableOpacity onPress={() => setTab('jobsite')} activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Job Site: walk a virtual job site and do tasks the crew gives you"
          style={{ backgroundColor: '#1A1408', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: 'rgba(244,161,29,0.45)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row' }}>
              {['miguel', 'jerry', 'dante', 'renee'].map((id, i) => (
                <Image key={id} source={CAST_IMAGES[id]}
                  style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#1A1408', marginLeft: i === 0 ? 0 : -12 }} />
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>Job Site</Text>
                <View style={{ backgroundColor: C.amber, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 5 }}>
                  <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#1A1408', letterSpacing: 0.4 }}>GAME</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.72)', marginTop: 2 }}>
                Walk the site. Take work from the crew.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.amber} />
          </View>

          {/* What you actually do there — the old card never said. */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[
              { icon: 'git-network', label: 'Wire it' },
              { icon: 'build', label: 'Fix it' },
              { icon: 'calculator', label: 'Work the numbers' },
              { icon: 'camera', label: 'Document it' },
            ].map((t) => (
              <View key={t.label} style={{ flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 9, paddingVertical: 7, paddingHorizontal: 3 }}>
                <Ionicons name={t.icon} size={13} color={C.amber} />
                <Text numberOfLines={1} style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.7)', marginTop: 3, fontWeight: '600' }}>{t.label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 8, textAlign: 'center' }}>
            8 stations · they check your work before signing off
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── SparkAI search bar — type here, land in the chat with an answer ── */}
      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <View style={{ backgroundColor: '#0D1B3E', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(244,161,29,0.25)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="flash" size={14} color="#fff" />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>SparkAI</Text>
            <View style={{ backgroundColor: C.amber, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
              <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#0D1B3E', letterSpacing: 0.5 }}>AI</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              value={homeAsk}
              onChangeText={setHomeAsk}
              placeholder="Ask anything electrical…"
              placeholderTextColor="rgba(255,255,255,0.45)"
              returnKeyType="search"
              onSubmitEditing={() => { const t = homeAsk.trim(); setHomeAsk(''); setTab('necai', t); }}
              style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 11 : 8, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
            />
            <TouchableOpacity
              onPress={() => { const t = homeAsk.trim(); setHomeAsk(''); setTab('necai', t); }}
              style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-forward" size={18} color="#0D1B3E" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Your custom cards ── */}
      <HomeCards C={C} setTab={setTab} layout={homeLayout} streak={streak}
        isHidden={isHidden}
        onCustomize={() => setTab('customizehome')} />

      {/* Job Cam shortcut */}
      <TouchableOpacity onPress={() => setTab('jobcam')} activeOpacity={0.85}
        style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 12, backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="camera" size={20} color={C.green} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>Job Cam</Text>
          <Text style={{ fontSize: 11, color: C.textSec }}>Stop losing job photos in your camera roll</Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color={C.textTert} />
      </TouchableOpacity>

      {/* ── Every tool, always. Not filtered by the saved layout, not touchable
             by Customize. Before this existed, a feature added after a user's
             first launch was unreachable for them forever: Home rendered the
             saved id list and nothing else, so Blueprint Takeoff, the Permit
             Assistant and the Panel Schedule all shipped into a void. ── */}
      <AllToolsSection C={C} setTab={setTab} isHidden={isHidden} />

      {/* Streak + social proof */}
      {streak > 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.amberBg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.amber }}>
          <Text style={{ fontSize: 22 }}>🔥</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.amber }}>{streak}-day streak</Text>
            <Text style={{ fontSize: 11, color: C.textSec }}>Keep it up! Complete today's question to continue.</Text>
          </View>
        </View>
      )}
      <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: C.textSec, textAlign: 'center', lineHeight: 18 }}>
          {'Built for apprentices, helpers, journeymen, and field electricians. ⚡ Trusted on the job site.'}
        </Text>
      </View>
      {/* Pro CTA */}
      <TouchableOpacity onPress={() => setTab('settings')} style={{ marginHorizontal: 16, backgroundColor: C.blue, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', shadowColor: C.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 }} activeOpacity={0.9}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 3 }}>Go Pro — Unlock Everything</Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 17 }}>{proAskAllowanceLabel()} · Box Fill · Conduit Fill · PDF Export</Text>
        </View>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ─── PIPE BENDING ────────────────────────────────────────────────────────────
const BendScreen = ({ C, setTab }) => {
  const [bendType, setBendType] = useState('90');
  const [condType, setCondType] = useState('EMT');
  const [condSize, setCondSize] = useState('3/4"');
  const [stub, setStub] = useState('12');
  const [offsetH, setOffsetH] = useState('6');
  const [offsetA, setOffsetA] = useState(45);
  const [obstH, setObstH] = useState('4');
  const [obstW, setObstW] = useState('2');
  const [result, setResult] = useState(null);

  const BEND_TYPES = [{ l: '90°', v: '90' }, { l: '45°', v: '45' }, { l: 'Offset', v: 'offset' }, { l: 'Rolling', v: 'rolling' }, { l: '3-Pt Saddle', v: 'saddle3' }, { l: '4-Pt Saddle', v: 'saddle4' }];
  const showStub = bendType === '90' || bendType === '45';
  const showOff = bendType === 'offset';
  const showObst = ['rolling', 'saddle3', 'saddle4'].includes(bendType);

  const calc = () => {
    const s  = toPositiveNumber(stub,   0, 999);
    const oh = toPositiveNumber(offsetH, 0, 999);
    const obH = toPositiveNumber(obstH,  0, 999);
    const obW = toPositiveNumber(obstW,  0, 999);
    if (bendType === '90') {
      if (!isValidPositiveNumber(stub)) { Alert.alert('Invalid Input', 'Enter a valid stub length greater than 0.'); return; }
      const tu = TAKE_UP[condType]?.[condSize] ?? 6;
      const mark = s - tu;
      if (mark <= 0) { Alert.alert('Stub too short', `Minimum stub for ${condSize} ${condType} is ${tu + 0.5}". Increase stub length.`); return; }
      setResult({ type: '90', mark: mark.toFixed(2), takeUp: tu });
    } else if (bendType === '45') {
      if (!isValidPositiveNumber(stub)) { Alert.alert('Invalid Input', 'Enter a valid run length greater than 0.'); return; }
      setResult({ type: '45', mark: (s * 0.7071).toFixed(2) });
    } else if (bendType === 'offset') {
      if (!isValidPositiveNumber(offsetH)) { Alert.alert('Invalid Input', 'Enter a valid offset height greater than 0.'); return; }
      const { m, s: sh } = OFFSET_MULT[offsetA];
      setResult({ type: 'offset', spacing: (oh * m).toFixed(2), shrink: (oh * sh).toFixed(2), mult: m });
    } else if (bendType === 'rolling') {
      if (!isValidPositiveNumber(obstH) || !isValidPositiveNumber(obstW)) { Alert.alert('Invalid Input', 'Enter valid rise and roll values greater than 0.'); return; }
      const t = Math.sqrt(obH * obH + obW * obW);
      const angle = obW > 0 ? (Math.atan(obH / obW) * 180 / Math.PI) : 90;
      setResult({ type: 'rolling', travel: t.toFixed(2), angle: angle.toFixed(1) });
    } else if (bendType === 'saddle3') {
      if (!isValidPositiveNumber(obstH)) { Alert.alert('Invalid Input', 'Enter a valid obstruction height greater than 0.'); return; }
      const { m } = OFFSET_MULT[45];
      const spRaw = obH * m;
      const sp = spRaw.toFixed(2);
      setResult({ type: 'saddle3', mark1: sp, mark2: (spRaw * 2).toFixed(2) });
    } else if (bendType === 'saddle4') {
      if (!isValidPositiveNumber(obstH)) { Alert.alert('Invalid Input', 'Enter a valid obstruction height greater than 0.'); return; }
      const { m } = OFFSET_MULT[offsetA];
      const spRaw = obH * m;
      const sp = spRaw.toFixed(2);
      setResult({ type: 'saddle4', mark1: sp, mark2: (spRaw + obW).toFixed(2), mark3: (spRaw * 2 + obW).toFixed(2) });
    }
  };

  const tipText = () => {
    if (!result) return '';
    if (result.type === '90') return `💡 Place bender arrow at ${result.mark}" from end. Bend to 90°.`;
    if (result.type === '45') return `💡 Mark at ${result.mark}" from end. Bend to 45°.`;
    if (result.type === 'offset') return `💡 Make first bend, advance ${result.spacing}", make second. Subtract ${result.shrink}" shrinkage.`;
    if (result.type === 'rolling') return `💡 True travel = ${result.travel}". Bend at ${result.angle}°.`;
    if (result.type === 'saddle3') return `💡 Mark at ${result.mark1}" and ${result.mark2}". Center = 45°, sides = 22.5° each (opposite direction).`;
    return `💡 Four equal ${offsetA}° bends at marks ${result.mark1}", ${result.mark2}", ${result.mark3}".`;
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Lbl C={C}>Bend Type</Lbl>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>{BEND_TYPES.map(b => <Chip key={b.v} label={b.l} active={bendType === b.v} onPress={() => { setBendType(b.v); setResult(null); }} C={C} />)}</View>
      </ScrollView>
      <Lbl C={C}>Conduit Type</Lbl>
      <Seg options={['EMT', 'IMC', 'RMC', 'PVC'].map(x => ({ l: x, v: x }))} value={condType} onChange={setCondType} C={C} />
      <View style={{ height: 12 }} />
      <Lbl C={C}>Conduit Size</Lbl>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>{Object.keys(TAKE_UP.EMT).map(s => <Chip key={s} label={s} active={condSize === s} onPress={() => setCondSize(s)} C={C} />)}</View>
      </ScrollView>
      {showStub && <Inp label={bendType === '90' ? 'Stub Length' : 'Run Length'} value={stub} onChangeText={v => { setStub(v); setResult(null); }} unit="in" placeholder="12" C={C} />}
      {showOff && <>
        <Inp label="Offset Height" value={offsetH} onChangeText={v => { setOffsetH(v); setResult(null); }} unit="in" placeholder="6" C={C} />
        <Lbl C={C}>Bend Angle</Lbl>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>{[10, 22, 30, 45, 60].map(a => <Chip key={a} label={`${a}°`} active={offsetA === a} onPress={() => { setOffsetA(a); setResult(null); }} C={C} />)}</View>
      </>}
      {showObst && <>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Inp label={bendType === 'rolling' ? 'Rise (vert)' : 'Obstruction Height'} value={obstH} onChangeText={v => { setObstH(v); setResult(null); }} unit="in" placeholder="4" C={C} /></View>
          <View style={{ flex: 1 }}><Inp label={bendType === 'rolling' ? 'Roll (horiz)' : 'Obstruction Width'} value={obstW} onChangeText={v => { setObstW(v); setResult(null); }} unit="in" placeholder="2" C={C} /></View>
        </View>
        {bendType === 'saddle4' && <><Lbl C={C}>Bend Angle</Lbl><View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>{[22, 30, 45].map(a => <Chip key={a} label={`${a}°`} active={offsetA === a} onPress={() => { setOffsetA(a); setResult(null); }} C={C} />)}</View></>}
      </>}
      <BigBtn onPress={calc} label="Calculate" C={C} />
      <Card C={C} style={{ alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 10, fontWeight: '600', color: C.textTert, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bend Diagram</Text>
        <BendDiagram type={bendType} result={result} stub={stub} offsetH={offsetH} offsetA={offsetA} C={C} />
      </Card>
      {result && <>
        <ResultCard status="info" title={bendType === '90' ? '90° Stub-Up' : bendType === '45' ? '45° Bend' : bendType === 'offset' ? 'Offset Bend' : bendType === 'rolling' ? 'Rolling Offset' : bendType === 'saddle3' ? '3-Point Saddle' : '4-Point Saddle'} C={C}>
          {result.type === '90' && <><RRow l="Mark at (from end)" v={`${result.mark}"`} hi C={C} /><RRow l="Take-up deduction" v={`${result.takeUp}"`} C={C} /><RRow l="Stub length" v={`${stub}"`} C={C} /></>}
          {result.type === '45' && <><RRow l="Mark at (from end)" v={`${result.mark}"`} hi C={C} /><RRow l="Multiplier" v="0.7071" C={C} /></>}
          {result.type === 'offset' && <><RRow l="Mark spacing" v={`${result.spacing}"`} hi C={C} /><RRow l="Shrinkage" v={`${result.shrink}"`} warn C={C} /><RRow l="Multiplier" v={`${result.mult}×`} C={C} /></>}
          {result.type === 'rolling' && <><RRow l="Travel length" v={`${result.travel}"`} hi C={C} /><RRow l="True angle" v={`${result.angle}°`} C={C} /></>}
          {result.type === 'saddle3' && <><RRow l="Mark 1 (from end)" v={`${result.mark1}"`} hi C={C} /><RRow l="Mark 2 (center)" v={`${result.mark2}"`} hi C={C} /><RRow l="Side bends" v="22.5° each" C={C} /><RRow l="Center bend" v="45°" C={C} /></>}
          {result.type === 'saddle4' && <><RRow l="Mark 1" v={`${result.mark1}"`} hi C={C} /><RRow l="Mark 2" v={`${result.mark2}"`} hi C={C} /><RRow l="Mark 3" v={`${result.mark3}"`} hi C={C} /><RRow l="All bends" v={`${offsetA}° each`} C={C} /></>}
        </ResultCard>
        <TipBox C={C} text={tipText()} />
        {/* Explain with SparkAI */}
        <TouchableOpacity onPress={() => {
          const sparkyQ = `Explain this pipe bending result: ${tipText().replace('💡 ','')}. Conduit: ${condSize} ${condType}.`;
          if (setTab) setTab('necai', sparkyQ);
        }} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 6, padding: 12, backgroundColor: '#0D1B3E', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(244,161,29,0.3)' }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="flash" size={13} color="#fff" />
          </View>
          <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600', flex: 1 }}>Explain this with SparkAI</Text>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </>}
      <SectionHeader title="Take-Up Reference (EMT 90°)" C={C} />
      <Card C={C}>{Object.entries(TAKE_UP.EMT).map(([sz, tu]) => (
        <View key={sz} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.inputBg, borderRadius: 6, marginBottom: 3, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.text }}>{sz}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.blue }}>{tu}"</Text>
        </View>
      ))}</Card>
      <DisclaimerFooter C={C} />
    </ScrollView>
  );
};

// ─── VOLTAGE DROP ────────────────────────────────────────────────────────────
const VoltScreen = ({ C, presetLoad, presetDist }) => {
  const [circType, setCircType] = useState('single');
  const [material, setMaterial] = useState('copper');
  const [voltage, setVoltage] = useState('120');
  const [amps, setAmps] = useState(presetLoad || '20');
  const [dist, setDist] = useState(presetDist || '100');
  const [gauge, setGauge] = useState('12 AWG');
  const [result, setResult] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  const calc = () => {
    const v = toPositiveNumber(voltage, 0, 50000);
    const i = toPositiveNumber(amps,    0, 9999);
    const d = toPositiveNumber(dist,    0, 99999);
    if (v <= 0) { Alert.alert('Invalid Voltage', 'Enter a voltage greater than 0.'); return; }
    if (i <= 0) { Alert.alert('Invalid Load', 'Enter a load greater than 0 amps.'); return; }
    if (d <= 0) { Alert.alert('Invalid Distance', 'Enter a one-way distance greater than 0 feet.'); return; }
    const ri = material === 'copper' ? 0 : 1;
    const r = VD_RES[gauge]?.[ri] ?? 2;
    const mult = circType === 'single' ? 2 : 1.732;
    const drop = (i * r * d * mult) / 1000;
    // Guard against NaN/Infinity (shouldn't happen after validation but be safe)
    if (!isFinite(drop)) { Alert.alert('Calculation Error', 'These values produced an invalid result. Check your inputs.'); return; }
    const pct = (drop / v) * 100;
    const ampacity = VD_AMP[gauge] ?? 0;
    let suggested = null;
    for (const g of VD_GAUGES) {
      const gr = VD_RES[g]?.[ri] ?? 99;
      const gd = (i * gr * d * mult) / 1000;
      if ((VD_AMP[g] ?? 0) >= i && (gd / v) * 100 <= 3) { suggested = g; break; }
    }
    setResult({ drop: drop.toFixed(2), pct: pct.toFixed(1), atLoad: (v - drop).toFixed(1), ampacity, ok3: pct <= 3, ok5: pct <= 5, ampOk: i <= ampacity, suggested });
  };

  // result.pct is our own .toFixed(1) string — safe to parseFloat here
  const barColor = result ? (parseFloat(result.pct) > 5 ? C.danger : parseFloat(result.pct) > 3 ? C.warning : C.success) : C.success;
  const status = result ? (!result.ampOk || !result.ok5 ? 'fail' : !result.ok3 ? 'warn' : 'pass') : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Lbl C={C}>Circuit Type</Lbl>
      <Seg options={[{ l: 'Single Phase', v: 'single' }, { l: 'Three Phase', v: 'three' }]} value={circType} onChange={v => { setCircType(v); setResult(null); }} color={C.purple} C={C} />
      <View style={{ height: 12 }} />
      <Lbl C={C}>Conductor Material</Lbl>
      <Seg options={[{ l: 'Copper', v: 'copper' }, { l: 'Aluminum', v: 'aluminum' }]} value={material} onChange={v => { setMaterial(v); setResult(null); }} color={C.purple} C={C} />
      <View style={{ height: 12 }} />
      <Lbl C={C}>System Voltage</Lbl>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>{[120, 208, 240, 277, 480].map(v => <Chip key={v} label={`${v}V`} active={voltage === String(v)} onPress={() => { setVoltage(String(v)); setResult(null); }} color={C.purple} C={C} />)}</View>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Inp label="Load (Amps)" value={amps} onChangeText={v => { setAmps(v); setResult(null); }} unit="A" placeholder="20" C={C} /></View>
        <View style={{ flex: 1 }}><Inp label="One-Way Dist." value={dist} onChangeText={v => { setDist(v); setResult(null); }} unit="ft" placeholder="100" C={C} /></View>
      </View>
      <Lbl C={C}>Wire Gauge</Lbl>
      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1.5, borderColor: C.inputBorder, minHeight: 46, paddingHorizontal: 12, marginBottom: 12, justifyContent: 'space-between' }}
        onPress={() => setShowPicker(!showPicker)} activeOpacity={0.8}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: C.inputText }}>{gauge}</Text>
        <Ionicons name={showPicker ? 'chevron-up' : 'chevron-down'} size={16} color={C.textSec} />
      </TouchableOpacity>
      {showPicker && <Card C={C} style={{ marginBottom: 12, maxHeight: 200 }}>
        <ScrollView nestedScrollEnabled>{VD_GAUGES.map(g => (
          <TouchableOpacity key={g} style={{ paddingHorizontal: 14, paddingVertical: 9, backgroundColor: gauge === g ? C.blueSub : 'transparent', borderRadius: 8 }}
            onPress={() => { setGauge(g); setShowPicker(false); setResult(null); }}>
            <Text style={{ fontSize: 14, color: gauge === g ? C.blue : C.text, fontWeight: gauge === g ? '700' : '400' }}>{g}</Text>
          </TouchableOpacity>
        ))}</ScrollView>
      </Card>}
      <BigBtn onPress={calc} label="Calculate Drop" color={C.purple} icon="flash" C={C} />
      {result && <>
        <Card C={C} style={{ padding: 14, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.textSec }}>Voltage Drop</Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: barColor }}>{result.pct}%</Text>
          </View>
          <View style={{ height: 12, backgroundColor: C.inputBg, borderRadius: 99, overflow: 'hidden', marginBottom: 4 }}>
            <View style={{ height: '100%', width: `${Math.min(parseFloat(result.pct) / 10 * 100, 100)}%`, backgroundColor: barColor, borderRadius: 99 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 9, color: C.textTert }}>0%</Text>
            <Text style={{ fontSize: 9, color: C.success }}>3% NEC</Text>
            <Text style={{ fontSize: 9, color: C.warning }}>5% NEC</Text>
            <Text style={{ fontSize: 9, color: C.textTert }}>10%</Text>
          </View>
        </Card>
        <ResultCard status={status} title="Results" C={C}>
          <RRow l="Voltage drop" v={`${result.drop}V`} hi C={C} />
          <RRow l="Drop %" v={`${result.pct}%`} hi C={C} />
          <RRow l="Voltage at load" v={`${result.atLoad}V`} C={C} />
          <RRow l="Wire ampacity" v={`${result.ampacity}A ${result.ampOk ? '✓' : '✗'}`} ok={result.ampOk} warn={!result.ampOk} C={C} />
        </ResultCard>
        {result.suggested && <Card C={C} style={{ backgroundColor: C.blueSub, borderColor: C.blue, marginBottom: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.blue, marginBottom: 3 }}>💡 Recommended Minimum Wire Size</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.blue, marginBottom: 2 }}>{result.suggested}</Text>
          <Text style={{ fontSize: 11, color: C.textSec }}>Keeps voltage drop ≤3% for {amps}A at {dist}ft</Text>
        </Card>}
        <TipBox C={C} type={status === 'pass' ? 'ok' : status === 'warn' ? 'warn' : 'danger'}
          text={!result.ampOk ? `⚠️ Wire too small! ${gauge} rated ${result.ampacity}A max.` : !result.ok5 ? '❌ Exceeds NEC 5% max. Upsize wire.' : !result.ok3 ? '⚠️ Exceeds 3% recommendation. Consider upsizing.' : '✅ Within NEC recommendations.'} />
      </>}
      <Text style={{ fontSize: 10, color: C.textTert, lineHeight: 15, marginTop: 8 }}>Per NEC Ch.9 Table 9 · NEC 210.19(A) recommends ≤3% branch, ≤5% total.</Text>
      <DisclaimerFooter C={C} />
    </ScrollView>
  );
};

// ─── WIRE COLORS ─────────────────────────────────────────────────────────────
const WireScreen = ({ C }) => {
  const [sysIdx, setSysIdx] = useState(1);
  const [viewMode, setViewMode] = useState('panel');
  const [search, setSearch] = useState('');
  const sys = WIRE_SYSTEMS[sysIdx];
  const panelRows = getPanelPhases(sys);
  const filtered = search ? panelRows.filter(r => String(r.left).includes(search) || String(r.right).includes(search) || r.lL.toLowerCase().includes(search.toLowerCase()) || r.lR.toLowerCase().includes(search.toLowerCase())) : panelRows;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, maxHeight: 48, minHeight: 48 }} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 6, flexDirection: 'row', alignItems: 'center' }}>
        {WIRE_SYSTEMS.map((s, i) => <Chip key={i} label={s.name} active={sysIdx === i} onPress={() => { setSysIdx(i); setSearch(''); }} color={C.teal} C={C} />)}
      </ScrollView>
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, padding: 10, flexDirection: 'row', gap: 8 }}>
        <Chip label="🔍 Wire Detail" active={viewMode === 'detail'} onPress={() => setViewMode('detail')} color={C.teal} C={C} />
        <Chip label="⚡ Panel View" active={viewMode === 'panel'} onPress={() => setViewMode('panel')} color={C.teal} C={C} />
      </View>
      {viewMode === 'detail' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {sys.wires.map((w, i) => (
            <Card key={i} C={C} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: w.hex, borderWidth: w.border ? 2 : 0, borderColor: w.border ?? 'transparent', marginTop: 2, flexShrink: 0 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 1 }}>{w.color}</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.textSec, marginBottom: 2 }}>{w.use}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.teal, marginBottom: 3 }}>{w.volt}</Text>
                <Text style={{ fontSize: 11, color: C.textTert, lineHeight: 16 }}>{w.note}</Text>
              </View>
            </Card>
          ))}
          <TipBox C={C} type="danger" text="⚠️ White and gray conductors may carry current. Always test before touching." />
          <DisclaimerFooter C={C} />
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ backgroundColor: '#0F172A', padding: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
              <Ionicons name="search" size={16} color="#64748B" />
              <TextInput style={{ flex: 1, fontSize: 14, color: '#F1F5F9' }} value={search} onChangeText={setSearch} placeholder="Search breaker # or phase..." placeholderTextColor="#64748B" />
              {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#64748B" /></TouchableOpacity>}
            </View>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: '#1A1A2E', paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)' }}>Left</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', textAlign: 'center', width: 60 }}>Phase</Text>
            <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>Right</Text>
          </View>
          <ScrollView style={{ flex: 1, backgroundColor: '#0F172A' }} showsVerticalScrollIndicator={false}>
            {filtered.map(row => (
              <View key={row.left} style={{ flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                <View style={{ flex: 1, backgroundColor: row.cL, paddingVertical: 14, paddingHorizontal: 16, justifyContent: 'space-between', flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>{row.left}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>Ph {row.lL}</Text>
                </View>
                <View style={{ width: 2, backgroundColor: '#0A0A0A' }} />
                <View style={{ flex: 1, backgroundColor: row.cR, paddingVertical: 14, paddingHorizontal: 16, justifyContent: 'space-between', flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>Ph {row.lR}</Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>{row.right}</Text>
                </View>
              </View>
            ))}
            <View style={{ padding: 12 }}><Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>{sys.name} · 160-slot panel · Scroll for all breakers</Text></View>
          </ScrollView>
        </View>
      )}
    </View>
  );
};

// ─── FORMULA REFERENCE ───────────────────────────────────────────────────────
const FormulasScreen = ({ C }) => {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const cats = ['All', "Ohm's Law", 'Power', 'Voltage Drop', 'Three Phase', 'Motors', 'Transformers', 'Bending', 'Box Fill', 'Conduit Fill'];
  const filtered = FORMULAS.filter(f => {
    const matchCat = cat === 'All' || f.cat === cat;
    const matchSearch = !search.trim() || [f.name, f.f, f.cat, f.u].join(' ').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderWidth: 1.5, borderColor: C.inputBorder }}>
          <Ionicons name="search" size={16} color={C.textTert} />
          <TextInput style={{ flex: 1, fontSize: 14, color: C.inputText }} value={search} onChangeText={setSearch} placeholder="Search formulas..." placeholderTextColor={C.placeholder} keyboardType="default" />
          {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color={C.textTert} /></TouchableOpacity>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 6 }}>{cats.map(c => <Chip key={c} label={c} active={cat === c} onPress={() => setCat(c)} color={C.amber} C={C} />)}</View>
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 && <Text style={{ color: C.textTert, textAlign: 'center', marginTop: 32 }}>No formulas found.</Text>}
        {filtered.map(f => (
          <Card key={f.id} C={C} style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: C.amber, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{f.cat}</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 }}>{f.name}</Text>
            <View style={{ backgroundColor: C.inputBg, borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.blue, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{f.f}</Text>
            </View>
            <Text style={{ fontSize: 11, color: C.textSec, marginBottom: 4, fontStyle: 'italic' }}>{f.v}</Text>
            <Text style={{ fontSize: 12, color: C.textSec, marginBottom: 4 }}>{f.u}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: C.teal }}>Ex: {f.ex}</Text>
            {f.ref && <Text style={{ fontSize: 10, color: C.textTert, marginTop: 4 }}>{f.ref}</Text>}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
};

// ─── BOX FILL ────────────────────────────────────────────────────────────────
const BoxFillScreen = ({ C }) => {
  const [wireSize, setWireSize] = useState('#12');
  const [conductors, setConductors] = useState('4');
  const [grounds, setGrounds] = useState('1');
  const [clamps, setClamps] = useState('1');
  const [fittings, setFittings] = useState('0');
  const [devices, setDevices] = useState('1');
  const [boxSelIdx, setBoxSelIdx] = useState(null); // null = custom
  const [customBoxVol, setCustomBoxVol] = useState('');
  const [result, setResult] = useState(null);

  const COMMON_BOXES = [
    { name: '4" Sq 1½"',  vol: 21.0 },
    { name: '4" Sq 2⅛"',  vol: 30.3 },
    { name: '1-Gang 2½"', vol: 18.0 },
    { name: '2-Gang 2½"', vol: 34.0 },
    { name: '4" Oct 1½"', vol: 15.5 },
    { name: '4" Oct 2⅛"', vol: 21.5 },
    { name: 'Handy 2¼"',  vol: 10.3 },
  ];

  const calc = () => {
    const vol = CONDUCTOR_VOL[wireSize];
    const c  = toPositiveInteger(conductors, 0, 100);
    const g  = toPositiveInteger(grounds,    0, 100);
    const cl = toPositiveInteger(clamps,     0, 50);
    const fi = toPositiveInteger(fittings,   0, 20);
    const d  = toPositiveInteger(devices,    0, 50);
    if (c === 0 && g === 0 && d === 0) { Alert.alert('No Input', 'Enter at least one conductor, ground, or device.'); return; }
    const cVol  = c * vol;
    const gVol  = g  > 0 ? vol : 0;   // ALL grounds = 1 vol total
    const clVol = cl > 0 ? vol : 0;   // ALL clamps  = 1 vol total
    const fiVol = fi * vol;             // each fitting = 1 vol each
    const dVol  = d * 2 * vol;          // each device = 2 vol
    const total = Math.round((cVol + gVol + clVol + fiVol + dVol) * 100) / 100;
    let boxVol = null;
    if (boxSelIdx !== null) boxVol = COMMON_BOXES[boxSelIdx].vol;
    else if (customBoxVol && toPositiveNumber(customBoxVol, 0) > 0) boxVol = toPositiveNumber(customBoxVol, 0);
    const passed = boxVol !== null ? total <= boxVol : null;
    setResult({ total, cVol, gVol, clVol, fiVol, dVol, vol, c, g, cl, fi, d, boxVol, passed });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Lbl C={C}>Wire Size (Largest in Box)</Lbl>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>{Object.keys(CONDUCTOR_VOL).map(s => <Chip key={s} label={s} active={wireSize === s} onPress={() => setWireSize(s)} C={C} />)}</View>
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Inp label="Current-Carrying Conductors" value={conductors} onChangeText={setConductors} placeholder="4" C={C} /></View>
          <View style={{ flex: 1 }}><Inp label="Equipment Grounds" value={grounds} onChangeText={setGrounds} placeholder="1" C={C} /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Inp label="Internal Clamps (all count as 1)" value={clamps} onChangeText={setClamps} placeholder="1" C={C} /></View>
          <View style={{ flex: 1 }}><Inp label="Fixture Studs / Hickeys" value={fittings} onChangeText={setFittings} placeholder="0" C={C} /></View>
        </View>
        <Inp label="Devices / Yokes (each = 2 vol)" value={devices} onChangeText={setDevices} placeholder="1" C={C} />

        {/* Box capacity section */}
        <Lbl C={C}>Box Volume (optional — for pass/fail)</Lbl>
        <Text style={{ fontSize: 10, color: C.textTert, marginBottom: 8 }}>Select a common size or enter stamped volume from box</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {COMMON_BOXES.map((b, i) => (
              <Chip key={i} label={`${b.name} (${b.vol})`} active={boxSelIdx === i} onPress={() => { setBoxSelIdx(boxSelIdx === i ? null : i); setCustomBoxVol(''); }} color={C.teal} C={C} />
            ))}
          </View>
        </ScrollView>
        {boxSelIdx === null && (
          <Inp label="Custom Box Volume (in³)" value={customBoxVol} onChangeText={v => setCustomBoxVol(v)} placeholder="e.g. 18.0" C={C} />
        )}

        <BigBtn onPress={calc} label="Calculate Box Fill" icon="cube-outline" C={C} />

        {result && <>
          {/* Pass/Fail banner */}
          {result.passed !== null && (
            <View style={{ backgroundColor: result.passed ? C.successBg : C.dangerBg, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: result.passed ? C.success : C.danger, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name={result.passed ? 'checkmark-circle' : 'close-circle'} size={28} color={result.passed ? C.success : C.danger} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: result.passed ? C.success : C.danger }}>{result.passed ? 'PASS ✅' : 'FAIL ❌ — Box Too Small'}</Text>
                <Text style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>Need {result.total} in³ · Box = {result.boxVol} in³ · {result.passed ? `Remaining: ${(result.boxVol - result.total).toFixed(2)} in³` : `Short by ${(result.total - result.boxVol).toFixed(2)} in³`}</Text>
              </View>
            </View>
          )}

          <Card C={C} style={{ backgroundColor: C.blueSub, borderColor: C.blue, alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.blue, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Required Box Volume</Text>
            <Text style={{ fontSize: 36, fontWeight: '800', color: C.blue }}>{result.total} in³</Text>
            <Text style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>Use a box stamped ≥ {result.total} in³</Text>
          </Card>

          <ResultCard title="NEC 314.16(B) Breakdown" status="info" C={C}>
            {result.c > 0 && <RRow l={`${result.c} conductor(s) × ${result.vol} in³ each`} v={`${result.cVol.toFixed(2)} in³`} C={C} />}
            {result.g > 0 && <RRow l={`All grounds (any qty) = 1 × ${result.vol} in³`} v={`${result.gVol.toFixed(2)} in³`} C={C} />}
            {result.cl > 0 && <RRow l={`All clamps (any qty) = 1 × ${result.vol} in³`} v={`${result.clVol.toFixed(2)} in³`} C={C} />}
            {result.fi > 0 && <RRow l={`${result.fi} fitting(s) × ${result.vol} in³ each`} v={`${result.fiVol.toFixed(2)} in³`} C={C} />}
            {result.d > 0 && <RRow l={`${result.d} device(s)/yoke(s) × ${(result.vol * 2).toFixed(2)} in³`} v={`${result.dVol.toFixed(2)} in³`} C={C} />}
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, marginTop: 6, paddingTop: 6 }}>
              <RRow l="TOTAL REQUIRED" v={`${result.total} in³`} hi C={C} />
            </View>
          </ResultCard>

          <TipBox C={C} text="Pigtails that do not leave the box are not counted. Verify stamped box volume — NEC 314.16(B)." />
        </>}

        <SectionHeader title="Common Box Sizes (verify stamped volume)" C={C} />
        <Card C={C}>{COMMON_BOXES.map((b, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.inputBg, borderRadius: 6, marginBottom: 3, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.text }}>{b.name}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.blue }}>~{b.vol} in³</Text>
          </View>
        ))}</Card>

        <SectionHeader title="NEC 314.16(B) Conductor Volumes" C={C} />
        <Card C={C}>{Object.entries(CONDUCTOR_VOL).map(([sz, vol]) => (
          <View key={sz} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.inputBg, borderRadius: 6, marginBottom: 3, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.text }}>{sz}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.blue }}>{vol} in³</Text>
          </View>
        ))}</Card>
        <DisclaimerFooter C={C} />
      </ScrollView>
      {/* Pro gating: enable when RevenueCat is live — IS_PRO wired to subscription */}
      {false && <ProOverlay feature="Box Fill Calculator" C={C} />}
    </View>
  );
};

// ─── CONDUIT FILL ────────────────────────────────────────────────────────────
const ConduitFillScreen = ({ C }) => {
  const [condType, setCondType] = useState('EMT');
  const [tradeSize, setTradeSize] = useState('3/4"');
  const [wireType, setWireType] = useState('THHN');
  const [wireGauge, setWireGauge] = useState('12');
  const [qty, setQty] = useState('3');
  const [result, setResult] = useState(null);

  const calc = () => {
    const q = Math.max(1, toPositiveInteger(qty, 1, 500));
    const wa = WIRE_AREAS_CF[wireType]?.[wireGauge] ?? 0;
    const ca = COND_AREAS[condType]?.[tradeSize] ?? 0;
    const maxKey = q === 1 ? 1 : q === 2 ? 2 : 3;
    const maxPct = MAX_FILL[maxKey];
    if (wa === 0 || ca === 0) {
      setResult({ wa: 0, total: 0, ca, pct: -1, maxPct, passed: false, status: 'nodata', q });
      return;
    }
    const pct = (wa * q / ca) * 100;
    const status = pct <= maxPct * 0.85 ? 'pass' : pct <= maxPct ? 'warn' : 'fail';
    setResult({ wa: Math.round(wa * 10000) / 10000, total: Math.round(wa * q * 10000) / 10000, ca: Math.round(ca * 10000) / 10000, pct: Math.round(pct * 10) / 10, maxPct, passed: pct <= maxPct, status, q });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Lbl C={C}>Conduit Type</Lbl>
        <Seg options={['EMT', 'IMC', 'RMC', 'PVC-40'].map(x => ({ l: x, v: x }))} value={condType} onChange={setCondType} color={C.teal} C={C} />
        <View style={{ height: 12 }} />
        <Lbl C={C}>Trade Size</Lbl>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>{Object.keys(COND_AREAS.EMT).map(s => <Chip key={s} label={s} active={tradeSize === s} onPress={() => setTradeSize(s)} color={C.teal} C={C} />)}</View>
        </ScrollView>
        <Lbl C={C}>Wire Type</Lbl>
        <Seg options={[{ l: 'THHN/THWN', v: 'THHN' }, { l: 'XHHW', v: 'XHHW' }]} value={wireType} onChange={setWireType} color={C.teal} C={C} />
        <View style={{ height: 12 }} />
        <Lbl C={C}>Wire Gauge</Lbl>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>{Object.keys(WIRE_AREAS_CF.THHN).map(g => <Chip key={g} label={`#${g}`} active={wireGauge === g} onPress={() => setWireGauge(g)} color={C.teal} C={C} />)}</View>
        </ScrollView>
        <Inp label="Quantity of Conductors" value={qty} onChangeText={setQty} placeholder="3" C={C} />
        <BigBtn onPress={calc} label="Calculate Fill" icon="git-merge" color={C.teal} C={C} />
        {result && result.status === 'nodata' && (
          <View style={{ backgroundColor: C.warningBg, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: C.warning, padding: 14, marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.warning, marginBottom: 4 }}>⚠️ Data Not Available</Text>
            <Text style={{ fontSize: 13, color: C.text, lineHeight: 20 }}>This combination is not in the reference table. Verify manually using NEC Chapter 9, Tables 4 and 5.</Text>
          </View>
        )}
        {result && result.status !== 'nodata' && <>
          <Card C={C} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: C.textSec }}>Fill %</Text>
              <Text style={{ fontSize: 26, fontWeight: '800', color: result.status === 'fail' ? C.danger : result.status === 'warn' ? C.warning : C.success }}>{result.pct}%</Text>
            </View>
            <View style={{ height: 12, backgroundColor: C.inputBg, borderRadius: 99, overflow: 'hidden', marginBottom: 4 }}>
              <View style={{ height: '100%', width: `${Math.min(result.pct / result.maxPct * 100, 100)}%`, backgroundColor: result.status === 'fail' ? C.danger : result.status === 'warn' ? C.warning : C.success, borderRadius: 99 }} />
            </View>
            <Text style={{ fontSize: 10, color: C.textSec, textAlign: 'right' }}>Max: {result.maxPct}%</Text>
          </Card>
          <ResultCard status={result.status} title="Conduit Fill Results" C={C}>
            <RRow l="Each wire area" v={`${result.wa} in²`} C={C} />
            <RRow l={`Total (${result.q}×)`} v={`${result.total} in²`} C={C} />
            <RRow l="Conduit area" v={`${result.ca} in²`} C={C} />
            <RRow l="Fill %" v={`${result.pct}%`} hi C={C} />
            <RRow l="Result" v={result.passed ? '✅ PASS' : '❌ FAIL'} ok={result.passed} warn={!result.passed} C={C} />
          </ResultCard>
          <TipBox C={C} text="⚠️ Verify with NEC Chapter 9 Tables 4 & 5 and local AHJ." />
        </>}
        <DisclaimerFooter C={C} />
      </ScrollView>
      {/* Pro gating: enable when RevenueCat is live — IS_PRO wired to subscription */}
      {false && <ProOverlay feature="Conduit Fill Calculator" C={C} />}
    </View>
  );
};

// ─── AMPACITY ────────────────────────────────────────────────────────────────
const AmpacityScreen = ({ C }) => {
  const [material, setMaterial] = useState('copper');
  const [tempCol, setTempCol] = useState('75C');
  const [gauge, setGauge] = useState('12');
  const gauges = material === 'copper' ? AMP_CU : AMP_AL;
  const ampacity = AMPACITY[material]?.[tempCol]?.[gauge];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Lbl C={C}>Conductor Material</Lbl>
      <Seg options={[{ l: 'Copper', v: 'copper' }, { l: 'Aluminum', v: 'aluminum' }]} value={material} onChange={v => { setMaterial(v); setGauge('12'); }} C={C} />
      <View style={{ height: 12 }} />
      <Lbl C={C}>Temperature Column</Lbl>
      <Seg options={[{ l: '60°C', v: '60C' }, { l: '75°C', v: '75C' }, { l: '90°C', v: '90C' }]} value={tempCol} onChange={setTempCol} C={C} />
      <View style={{ height: 12 }} />
      <Lbl C={C}>Wire Gauge</Lbl>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>{gauges.map(g => <Chip key={g} label={`#${g}`} active={gauge === g} onPress={() => setGauge(g)} C={C} />)}</View>
      </ScrollView>
      {ampacity && <Card C={C} style={{ backgroundColor: C.blueSub, borderColor: C.blue, alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: C.blue, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Ampacity</Text>
        <Text style={{ fontSize: 52, fontWeight: '800', color: C.blue }}>{ampacity}A</Text>
        <Text style={{ fontSize: 11, color: C.textSec, marginTop: 2, textAlign: 'center' }}>#{gauge} {material} · {tempCol} · 3+ CCC in conduit</Text>
      </Card>}
      <TipBox C={C} text="⚠️ Ampacity may be reduced by ambient temp (NEC 310.15(B)(2)), conductor count (NEC 310.15(C)), and terminal ratings (NEC 110.14(C)). Always verify with NEC Table 310.15(B)(16)." />
      <SectionHeader title="Full Table — Copper 75°C" C={C} />
      <Card C={C}>{AMP_CU.map(g => (
        <View key={g} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: gauge === g ? C.blueSub : C.inputBg, borderRadius: 6, marginBottom: 3, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.text }}>#{g}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.blue }}>{AMPACITY.copper['75C'][g]}A</Text>
        </View>
      ))}</Card>
      <DisclaimerFooter C={C} />
    </ScrollView>
  );
};

// ─── MATERIAL ESTIMATOR ───────────────────────────────────────────────────────
// A takeoff is counted, not typed. On a jobsite you are walking a room going
// "two, three, four" — so the control is a stepper you can hit with a glove on,
// and the totals move while you count. The number stays editable for anyone who
// already knows it's 47.
const QtyRow = ({ C, icon, label, hint, value, onChange, step = 1 }) => {
  const bump = (delta) => onChange(String(stepQuantity(value, delta)));
  const Btn = ({ dir, name }) => (
    <TouchableOpacity
      onPress={() => bump(dir * step)}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={{
        width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border,
      }}>
      <Ionicons name={name} size={18} color={C.text} />
    </TouchableOpacity>
  );
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border,
    }}>
      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={16} color={C.amber} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 10, color: C.textTert, marginTop: 1 }}>{hint}</Text> : null}
      </View>
      <Btn dir={-1} name="remove" />
      <TextInput
        value={String(value ?? '')}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        selectTextOnFocus
        maxLength={6}
        style={{
          minWidth: 52, textAlign: 'center', fontSize: 17, fontWeight: '800',
          color: C.text, paddingVertical: 6,
        }}
      />
      <Btn dir={1} name="add" />
    </View>
  );
};

const EstimatorScreen = ({ C, setTab, isPro = false, planType = 'free' }) => {
  const [estimatorZip, setEstimatorZip] = useState('');
  const [recs, setRecs] = useState('10');
  const [sw, setSw] = useState('5');
  const [lights, setLights] = useState('8');
  const [fans, setFans] = useState('2');
  const [dedicated, setDedicated] = useState('3');
  const [homeRuns, setHomeRuns] = useState('6');
  const [conduitFt, setConduitFt] = useState('200');
  const [showEstimate, setShowEstimate] = useState(false);

  // The price ask stays on THIS screen. Previously the button navigated to the
  // chat tab, which destroyed the takeoff the question was about.
  const [priceAsk, setPriceAsk] = useState(null);
  const priceQuantities = {
    receptacles: recs, switches: sw, lights, fans,
    dedicated, homeRuns, conduitFt, zip: estimatorZip,
  };
  const priceBlocker = priceAskBlocker(priceQuantities);

  const askForPrice = React.useCallback(async () => {
    const question = buildPriceQuestion(priceQuantities);
    // Never send an empty takeoff. A request with no quantities is exactly the
    // bug this replaced — an answer that could not have been about this job.
    if (!question) return;
    setPriceAsk({ state: 'PENDING', text: null, error: null });
    try {
      // Same identity and plan the chat sends. Without deviceId the backend
      // cannot meter this against the user's allowance, so a request from here
      // would either be rejected or counted as a stranger's.
      const res = await askNecBackend({
        question,
        deviceId: await getDeviceId(),
        appVersion: '1.0.0',
        planType,
      });
      if (res === 'rate_limited') {
        setPriceAsk({ state: 'FAILED', text: null, error: rateLimitText(isPro) });
        return;
      }
      if (!res?.answer) {
        setPriceAsk({
          state: 'FAILED', text: null,
          error: 'That did not come back. Your takeoff is still here — try again in a moment.',
        });
        return;
      }
      setPriceAsk({ state: 'READY', text: res.answer, error: null });
    } catch (e) {
      safeLog('estimator.price', e);
      setPriceAsk({
        state: 'FAILED', text: null,
        error: 'That did not come back. Your takeoff is still here — try again in a moment.',
      });
    }
  }, [recs, sw, lights, fans, dedicated, homeRuns, conduitFt, estimatorZip]);

  const quantities = {
    receptacles: recs, switches: sw, lights, fans,
    dedicated, homeRuns, conduitFt,
  };

  // The material list is DERIVED, not generated on a button press. It is the
  // same arithmetic the estimate and the invoice use — one expression, so the
  // list on screen cannot disagree with the document somebody gets billed from.
  const materials = React.useMemo(
    () => materialsFromQuantities(quantities),
    [recs, sw, lights, fans, dedicated, homeRuns, conduitFt],
  );
  const totalBoxes = toPositiveInteger(recs, 0, 9999) + toPositiveInteger(sw, 0, 9999)
    + toPositiveInteger(lights, 0, 9999) + toPositiveInteger(fans, 0, 9999)
    + toPositiveInteger(dedicated, 0, 9999);
  const wireFt = toPositiveInteger(conduitFt, 0, 999999) + toPositiveInteger(homeRuns, 0, 9999) * 8;
  const hasTakeoff = materials.length > 0;

  const calc = () => setShowEstimate(true);

  if (showEstimate) {
    return <EstimateScreen C={C} quantities={quantities} onClose={() => setShowEstimate(false)} />;
  }

  const Stat = ({ value, label }) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.amber }}>{value}</Text>
      <Text style={{ fontSize: 9, fontWeight: '700', color: C.textTert, letterSpacing: 0.6, marginTop: 2 }}>{label}</Text>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {/* Live totals. These move as you count, which is the whole reason to
          count in the app instead of on the back of a panel schedule. */}
      <View style={{ backgroundColor: C.cardBg, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, flexDirection: 'row', marginBottom: 12 }}>
        <Stat value={totalBoxes} label="BOXES" />
        <View style={{ width: 1, backgroundColor: C.border }} />
        <Stat value={toPositiveInteger(homeRuns, 0, 9999) + toPositiveInteger(dedicated, 0, 9999)} label="BREAKERS" />
        <View style={{ width: 1, backgroundColor: C.border }} />
        <Stat value={wireFt} label="FEET OF WIRE" />
      </View>

      <Card C={C}>
        <QtyRow C={C} icon="flash-outline" label="Receptacles" value={recs} onChange={setRecs} />
        <QtyRow C={C} icon="toggle-outline" label="Switches" value={sw} onChange={setSw} />
        <QtyRow C={C} icon="bulb-outline" label="Light Fixtures" value={lights} onChange={setLights} />
        <QtyRow C={C} icon="sync-outline" label="Ceiling Fans" hint="Fan-rated boxes" value={fans} onChange={setFans} />
        <QtyRow C={C} icon="cube-outline" label="Dedicated Circuits" value={dedicated} onChange={setDedicated} />
        <QtyRow C={C} icon="git-branch-outline" label="Home Runs" hint="Adds 8 ft each to the wire allowance" value={homeRuns} onChange={setHomeRuns} />
        <QtyRow C={C} icon="resize-outline" label="Conduit / Romex" hint="Feet — steps of 25" value={conduitFt} onChange={setConduitFt} step={25} />
      </Card>

      {hasTakeoff ? (
        <>
          <SectionHeader title="Rough Material List" C={C} />
          <Card C={C}>{materials.map((item) => (
            <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 6, marginBottom: 3, paddingHorizontal: 10, paddingVertical: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: C.text }}>{item.description}</Text>
                <Text style={{ fontSize: 10, color: C.textTert, marginTop: 1 }}>{item.detail}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.amber }}>{item.quantity} {item.unit}</Text>
            </View>
          ))}</Card>
        </>
      ) : (
        <Text style={{ fontSize: 12, color: C.textTert, textAlign: 'center', marginTop: 14, lineHeight: 18 }}>
          Count what you see. The list builds itself.
        </Text>
      )}

      {/* Invoice is not a separate tool — it is the last stage of this one, and
          the button has to say so or nobody finds it. */}
      <BigBtn
        onPress={calc}
        label={hasTakeoff ? 'Price It → Estimate → Invoice' : 'Add quantities to continue'}
        icon="document-text-outline"
        color={C.amber}
        disabled={!hasTakeoff}
        C={C}
      />
      <Text style={{ fontSize: 10, color: C.textTert, textAlign: 'center', marginTop: -4, marginBottom: 10 }}>
        Set your prices, then turn the estimate into an invoice you can send.
      </Text>

      <TipBox C={C} type="warn" text="ROUGH ESTIMATE ONLY — for planning purposes. Always verify on site before ordering." />

      {/* SparkAI price check CTA — smart location-based prompt */}
      <View style={{ backgroundColor: C.amberBg, borderRadius: 14, padding: 16, marginTop: 8, borderWidth: 1, borderColor: C.amber }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Ionicons name="chatbubble-ellipses" size={20} color={C.amber} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.amber }}>Get a SparkAI Price Estimate</Text>
        </View>
        <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 18, marginBottom: 4 }}>
          {'Enter your zip code and SparkAI will estimate local material costs based on your quantities above.'}
        </Text>
        <TextInput
          placeholder="Zip code (e.g. 33701)"
          placeholderTextColor={C.placeholder}
          value={estimatorZip}
          onChangeText={setEstimatorZip}
          keyboardType="numeric"
          maxLength={5}
          style={{ backgroundColor: C.inputBg, borderRadius: 8, padding: 10, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 }}
        />
        <TouchableOpacity
          onPress={askForPrice}
          disabled={!!priceBlocker || priceAsk?.state === 'PENDING'}
          style={{ backgroundColor: C.amber, opacity: (priceBlocker || priceAsk?.state === 'PENDING') ? 0.5 : 1, borderRadius: 10, padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {priceAsk?.state === 'PENDING'
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons name="flash" size={16} color="#fff" />}
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>
            {priceAsk?.state === 'PENDING' ? 'Pricing it…' : 'Get Local Price Estimate'}
          </Text>
        </TouchableOpacity>

        {/* The answer lands HERE, on the screen that asked. Navigating to the
            chat threw away the whole filled-in takeoff, and the takeoff is the
            question — see src/core/ai/inlineAsk.js. */}
        {priceBlocker && !priceAsk ? (
          <Text style={{ fontSize: 11, color: C.textTert, marginTop: 8, textAlign: 'center' }}>{priceBlocker}</Text>
        ) : null}
        {priceAsk?.state === 'PENDING' ? (
          <Text style={{ fontSize: 11, color: C.textTert, marginTop: 8, textAlign: 'center' }}>
            Looking that up — you can keep working.
          </Text>
        ) : null}
        {priceAsk?.state === 'FAILED' ? (
          <View style={{ backgroundColor: C.cardBg, borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 18 }}>{priceAsk.error}</Text>
          </View>
        ) : null}
        {priceAsk?.state === 'READY' && priceAsk.text ? (
          <View style={{ backgroundColor: C.cardBg, borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: C.amber, letterSpacing: 0.6, marginBottom: 6 }}>SPARKAI ESTIMATE</Text>
            <Text style={{ fontSize: 13, color: C.text, lineHeight: 20 }}>{priceAsk.text}</Text>
            <Text style={{ fontSize: 10, color: C.textTert, marginTop: 10, lineHeight: 15 }}>{PRICE_DISCLAIMER}</Text>
          </View>
        ) : null}

        <Text style={{ fontSize: 10, color: C.textTert, marginTop: 8, textAlign: 'center' }}>Material prices vary by region. Always verify current pricing with your supplier.</Text>
      </View>
      <DisclaimerFooter C={C} />
    </ScrollView>
  );
};

// ─── NEC AI — THE KILLER FEATURE ─────────────────────────────────────────────
// Flow: Ask → See article reference → Hit "Run Calculator" → Jump to calc → Save/Share result

// ─── EXAM PREP QUESTION BANK (80 questions) ─────────────────────────────────
const EXAM_QUESTIONS = [
  // ── BOX FILL ──
  {id:'bf01',level:'Apprentice',cat:'Box Fill',q:'Volume allowance for a #14 AWG conductor in box fill?',ch:['1.50 in³','1.75 in³','2.00 in³','2.25 in³'],c:2,exp:'NEC 314.16(B) Table: #14 AWG = 2.00 in³ per conductor allowance.',ref:'NEC 314.16(B)'},
  {id:'bf02',level:'Apprentice',cat:'Box Fill',q:'Volume allowance for a #12 AWG conductor?',ch:['2.00 in³','2.25 in³','2.50 in³','3.00 in³'],c:1,exp:'NEC 314.16(B) Table: #12 AWG = 2.25 in³.',ref:'NEC 314.16(B)'},
  {id:'bf03',level:'Apprentice',cat:'Box Fill',q:'All equipment grounds together count as:',ch:['One volume per ground','One total volume','Two total volumes','Zero — not counted'],c:1,exp:'NEC 314.16(B)(5): All EGCs = one conductor allowance based on the largest EGC.',ref:'NEC 314.16(B)(5)'},
  {id:'bf04',level:'Apprentice',cat:'Box Fill',q:'A single-gang device (one yoke) counts as how many conductor volumes?',ch:['One','Two','Three','Four'],c:1,exp:'NEC 314.16(B)(4): Each yoke = two conductor allowances.',ref:'NEC 314.16(B)(4)'},
  {id:'bf05',level:'Apprentice',cat:'Box Fill',q:'All internal cable clamps together count as:',ch:['One volume per clamp','One total volume','Two total volumes','Zero'],c:1,exp:'NEC 314.16(B)(2): All internal clamps = one conductor allowance total.',ref:'NEC 314.16(B)(2)'},
  {id:'bf06',level:'Journeyman',cat:'Box Fill',q:'Fixture studs and hickeys each count as:',ch:['Zero volumes','One volume each','Two volumes each','One total for all'],c:1,exp:'NEC 314.16(B)(3): Each fixture stud or hickey = one conductor allowance each.',ref:'NEC 314.16(B)(3)'},
  {id:'bf07',level:'Apprentice',cat:'Box Fill',q:'Pigtails that originate and terminate inside the box:',ch:['Count as one conductor','Count as two conductors','Do not count','Count for each wire'],c:2,exp:'NEC 314.16(B)(1): Conductors that do not leave the box are not counted.',ref:'NEC 314.16(B)(1)'},
  {id:'bf08',level:'Journeyman',cat:'Box Fill',q:'Box: 4 #12 conductors, 1 ground, 1 clamp, 1 device. Required volume using #12 (2.25 in³)?',ch:['13.5 in³','15.75 in³','18.0 in³','20.25 in³'],c:2,exp:'4×2.25 + 2.25(gnd) + 2.25(clamp) + 2×2.25(device) = 18.0 in³.',ref:'NEC 314.16(B)'},
  {id:'bf09',level:'Journeyman',cat:'Box Fill',q:'A 4" square 1½" deep box is typically rated at approximately:',ch:['15.5 in³','18.0 in³','21.0 in³','30.3 in³'],c:2,exp:'Standard 4" square 1½" box ≈ 21 in³. Always verify the stamped box volume.',ref:'NEC 314.16(A)'},
  {id:'bf10',level:'Journeyman',cat:'Box Fill',q:'Volume allowance for a #8 AWG conductor?',ch:['2.25 in³','2.50 in³','3.00 in³','5.00 in³'],c:2,exp:'NEC 314.16(B) Table: #8 AWG = 3.00 in³ per conductor allowance.',ref:'NEC 314.16(B)'},
  // ── CONDUIT FILL ──
  {id:'cf01',level:'Apprentice',cat:'Conduit Fill',q:'Maximum conduit fill for 3 or more conductors?',ch:['25%','31%','40%','53%'],c:2,exp:'NEC Chapter 9 Table 1: 3+ conductors = 40% maximum fill.',ref:'NEC Ch.9 Table 1'},
  {id:'cf02',level:'Apprentice',cat:'Conduit Fill',q:'Maximum fill for exactly 2 conductors?',ch:['25%','31%','40%','53%'],c:1,exp:'NEC Chapter 9 Table 1: 2 conductors = 31% maximum fill.',ref:'NEC Ch.9 Table 1'},
  {id:'cf03',level:'Apprentice',cat:'Conduit Fill',q:'Maximum fill for a single conductor in conduit?',ch:['40%','50%','53%','60%'],c:2,exp:'NEC Chapter 9 Table 1: 1 conductor = 53% maximum fill.',ref:'NEC Ch.9 Table 1'},
  {id:'cf04',level:'Journeyman',cat:'Conduit Fill',q:'NEC Chapter 9 Table 4 provides:',ch:['Wire cross-sectional areas','Conduit internal cross-sectional areas','Fill percentages','Ampacity ratings'],c:1,exp:'Table 4 lists internal cross-sectional areas of conduit types and trade sizes.',ref:'NEC Ch.9 Table 4'},
  {id:'cf05',level:'Journeyman',cat:'Conduit Fill',q:'NEC Chapter 9 Table 5 provides:',ch:['Conduit areas','Wire cross-sectional areas including insulation','Fill percentages','Burial depths'],c:1,exp:'Table 5 lists cross-sectional areas of conductors including insulation.',ref:'NEC Ch.9 Table 5'},
  {id:'cf06',level:'Journeyman',cat:'Conduit Fill',q:'Three #12 THHN (0.0133 in² each) in ½" EMT (total internal area 0.304 in²). Fill %?',ch:['13.1%','21.7%','32.7%','43.6%'],c:0,exp:'(3 × 0.0133) ÷ 0.304 × 100 = 13.1%. Fill is a percentage of the conduit TOTAL area from Ch.9 Table 4 — not of the 40% column. Well below the 40% limit — PASS.',ref:'NEC Ch.9 Table 1'},
  {id:'cf07',level:'Journeyman',cat:'Conduit Fill',q:'Four #12 THHN in ½" EMT — pass or fail?',ch:['Pass — 17.5%','Pass — 39.4%','Fail — 43.6%','Fail — 50%'],c:0,exp:'4 × 0.0133 = 0.0532 in² ÷ 0.304 in² = 17.5%. Comfortably under 40% — PASS. Annex C Table C.1 permits nine #12 THHN in ½" EMT.',ref:'NEC Ch.9 Table 1'},
  {id:'cf08',level:'Apprentice',cat:'Conduit Fill',q:'How is conduit fill percentage calculated?',ch:['Wire count ÷ conduit size','Total wire area ÷ conduit area × 100','Wire diameter only','NEC table lookup only'],c:1,exp:'Fill % = sum of wire cross-sectional areas ÷ conduit internal area × 100.',ref:'NEC Chapter 9'},
  {id:'cf09',level:'Journeyman',cat:'Conduit Fill',q:'Three different-sized conductors in 1" EMT. Which table gives the conduit area?',ch:['Table 1','Table 4','Table 5','Table 310.15'],c:1,exp:'Table 4 gives conduit internal areas. Table 5 gives wire areas. Table 1 gives max fill %.',ref:'NEC Ch.9 Table 4'},
  {id:'cf10',level:'Journeyman',cat:'Conduit Fill',q:'The maximum fill % for raceways with 3+ conductors was designed to:',ch:['Save money on conduit','Allow for heat dissipation and easy conductor pulling','Match wire ampacity','Meet OSHA requirements'],c:1,exp:'Fill limits prevent overheating and allow conductors to be pulled without damage.',ref:'NEC Ch.9 Table 1'},
  // ── GFCI/AFCI ──
  {id:'ga01',level:'Apprentice',cat:'GFCI/AFCI',q:'GFCI protection is required for receptacles in bathrooms?',ch:['Only near the sink','Yes — all bathroom receptacles','Only for 20A circuits','Only on GFCI breaker'],c:1,exp:'NEC 210.8(A)(1): All 125V 15A and 20A receptacles in dwelling bathrooms require GFCI.',ref:'NEC 210.8(A)(1)'},
  {id:'ga02',level:'Apprentice',cat:'GFCI/AFCI',q:'Kitchen countertop receptacles require GFCI?',ch:['Only within 6 feet of sink','Only near water','All kitchen countertop receptacles','Only dedicated circuits'],c:2,exp:'NEC 210.8(A)(6): All kitchen countertop receptacles require GFCI protection.',ref:'NEC 210.8(A)(6)'},
  {id:'ga03',level:'Apprentice',cat:'GFCI/AFCI',q:'A GFCI trips at a current imbalance of approximately:',ch:['1 mA','4–6 mA','10 mA','15 mA'],c:1,exp:'GFCI devices trip at 4–6 milliamps — protective before lethal current levels.',ref:'UL 943'},
  {id:'ga04',level:'Apprentice',cat:'GFCI/AFCI',q:'Outdoor receptacles at dwellings require GFCI?',ch:['No','Yes — all accessible from grade','Only in wet weather','Only 20A outdoor'],c:1,exp:'NEC 210.8(A)(3): All outdoor receptacles at dwellings accessible from grade require GFCI.',ref:'NEC 210.8(A)(3)'},
  {id:'ga05',level:'Journeyman',cat:'GFCI/AFCI',q:'Per 2023 NEC, AFCI is required for:',ch:['Bedrooms only','Most 120V 15A and 20A branch circuits in dwellings','Kitchens only','Commercial locations'],c:1,exp:'NEC 210.12(A) 2020/2023: AFCI expanded to most branch circuits in dwelling units.',ref:'NEC 210.12(A)'},
  {id:'ga06',level:'Journeyman',cat:'GFCI/AFCI',q:'A dual-function circuit breaker provides:',ch:['GFCI and AFCI protection','120V and 240V protection','Ground fault detection only','Arc fault only'],c:0,exp:'Dual-function breakers provide both GFCI (4–6mA) and AFCI (arc detection) combined.',ref:'NEC 210.12'},
  {id:'ga07',level:'Apprentice',cat:'GFCI/AFCI',q:'Garage receptacles at dwellings require:',ch:['No special protection','GFCI','AFCI','Both GFCI and AFCI'],c:1,exp:'NEC 210.8(A)(2): All garage receptacles at dwelling units require GFCI.',ref:'NEC 210.8(A)(2)'},
  {id:'ga10',level:'Journeyman',cat:'GFCI/AFCI',q:'An existing 2-wire circuit (no ground) can be protected by replacing the receptacle with:',ch:['3-wire receptacle only','GFCI receptacle labeled No Equipment Ground','New wiring only','AFCI breaker'],c:1,exp:'NEC 406.4(D)(2): GFCI receptacle labeled "No Equipment Ground" is permitted on 2-wire circuits.',ref:'NEC 406.4(D)(2)'},
  // ── GROUNDING ──
  {id:'gb01',level:'Apprentice',cat:'Grounding',q:'The EGC provides:',ch:['Neutral current return','Low-impedance fault path to trip OCPD','Voltage drop reduction','Static protection only'],c:1,exp:'NEC 250.4(A)(5): EGC provides low-impedance path to facilitate OCPD operation on faults.',ref:'NEC 250.4(A)(5)'},
  {id:'gb02',level:'Apprentice',cat:'Grounding',q:'Neutral-to-ground bond is made at:',ch:['Every panelboard','Service entrance only','Every subpanel','Every junction box'],c:1,exp:'NEC 250.24(A): Main bonding jumper connects neutral to ground ONLY at the service entrance.',ref:'NEC 250.24(A)'},
  {id:'gb03',level:'Apprentice',cat:'Grounding',q:'EMT conduit can serve as an EGC?',ch:['No — only green wire works','Yes — if properly installed and listed','Only for 15A circuits','Only in dry locations'],c:1,exp:'NEC 250.118(4): Listed EMT is an acceptable EGC when properly installed.',ref:'NEC 250.118(4)'},
  {id:'gb04',level:'Apprentice',cat:'Grounding',q:'An insulated EGC must be:',ch:['White','Gray','Green or green with yellow stripe','Bare only'],c:2,exp:'NEC 250.119: Insulated EGCs must be green, green/yellow stripes, or bare.',ref:'NEC 250.119'},
  {id:'gb05',level:'Journeyman',cat:'Grounding',q:'Minimum EGC size is determined by:',ch:['NEC Table 250.66','NEC Table 250.122','NEC Table 310.15','Load calculation'],c:1,exp:'NEC 250.122: Minimum EGC size based on rating of OCPD protecting the circuit.',ref:'NEC 250.122'},
  {id:'gb06',level:'Journeyman',cat:'Grounding',q:'At a subpanel in the same building:',ch:['Bond neutral to ground','Keep neutral and ground separate','Use same bus for both','Bond at each outlet'],c:1,exp:'NEC 250.142(B): Subpanels require separate neutral and ground buses — do not bond.',ref:'NEC 250.142(B)'},
  {id:'gb07',level:'Journeyman',cat:'Grounding',q:'GEC size at a 200A service with 3/0 Cu conductors is per NEC Table 250.66:',ch:['#6 AWG Cu','#4 AWG Cu','#2 AWG Cu','1/0 AWG Cu'],c:1,exp:'NEC Table 250.66 is indexed by the largest ungrounded SERVICE conductor, not by the service rating: 2/0 or 3/0 Cu → #4 Cu GEC. #2 Cu is the next row up, for service conductors over 3/0 through 350 kcmil.',ref:'NEC Table 250.66'},
  {id:'gb08',level:'Journeyman',cat:'Grounding',q:'Bonding is defined as:',ch:['Installing a ground rod','Connecting metallic parts for electrical continuity','Running ground wire to panel','Connecting neutral to earth'],c:1,exp:'NEC Art.100: Bonding connects metallic parts to establish electrical continuity.',ref:'NEC Article 100'},
  // ── VOLTAGE DROP ──
  {id:'vd01',level:'Apprentice',cat:'Voltage Drop',q:'NEC recommended max voltage drop for a branch circuit:',ch:['1%','2%','3%','5%'],c:2,exp:'NEC 210.19(A) Informational Note: Recommends ≤3% on branch circuits.',ref:'NEC 210.19(A)'},
  {id:'vd02',level:'Apprentice',cat:'Voltage Drop',q:'Total feeder+branch voltage drop recommendation:',ch:['3%','5%','8%','10%'],c:1,exp:'NEC 215.2(A) Informational Note: Total VD should not exceed 5%.',ref:'NEC 215.2(A)'},
  {id:'vd03',level:'Journeyman',cat:'Voltage Drop',q:'NEC voltage drop limits are:',ch:['Mandatory — must comply','Informational notes only','Enforced by all AHJs','Required for UL listing'],c:1,exp:'Voltage drop limits are Informational Notes — recommendations, not mandatory (AHJs may enforce).',ref:'NEC 210.19(A) Info Note'},
  {id:'vd04',level:'Journeyman',cat:'Voltage Drop',q:'3-phase voltage drop multiplier (replaces 2 in single-phase formula):',ch:['1.0','2.0','1.414','1.732'],c:3,exp:'Three-phase VD uses √3 ≈ 1.732 instead of 2.',ref:'Electrical theory'},
  {id:'vd05',level:'Journeyman',cat:'Voltage Drop',q:'To reduce voltage drop on a long run:',ch:['Use a larger breaker','Upsize the conductors','Reduce load only','Use aluminum wire'],c:1,exp:'Larger conductors reduce resistance and therefore voltage drop.',ref:'NEC 210.19(A)'},
  {id:'vd06',level:'Journeyman',cat:'Voltage Drop',q:'20A, 120V circuit with #12 Cu at 150 ft shows ~7.5% VD. Best fix?',ch:['Use a 30A breaker','Upsize to #8 or #6 Cu','Use aluminum wire','Split into two circuits'],c:1,exp:'Upsizing conductors reduces resistance proportionally. Calculate using VD calculator.',ref:'NEC 210.19(A)'},
  // ── MOTORS ──
  {id:'mo01',level:'Journeyman',cat:'Motors',q:'Motor branch circuit conductors sized at minimum:',ch:['100% FLC','115% FLC','125% FLC','150% FLC'],c:2,exp:'NEC 430.22(A): Motor conductors ≥ 125% of motor FLC from NEC Tables.',ref:'NEC 430.22(A)'},
  {id:'mo02',level:'Journeyman',cat:'Motors',q:'Maximum inverse-time breaker for a Design B motor:',ch:['125% FLC','150% FLC','200% FLC','250% FLC'],c:3,exp:'NEC 430.52 Table 430.52: Design B motors, inverse-time breaker ≤ 250% FLC.',ref:'NEC 430.52'},
  {id:'mo03',level:'Journeyman',cat:'Motors',q:'Motor conductor sizing is based on:',ch:['Nameplate amps','FLC from NEC Tables 430.247–430.250','Motor HP only','Locked rotor current'],c:1,exp:'NEC 430.6(A): Use FLC from NEC Tables, not nameplate, for conductor sizing.',ref:'NEC 430.6(A)'},
  {id:'mo04',level:'Journeyman',cat:'Motors',q:'Overload protection for motor with SF ≥ 1.15:',ch:['100% nameplate','115% nameplate','125% nameplate','140% nameplate'],c:2,exp:'NEC 430.32(A)(1): SF ≥ 1.15 or temp rise ≤ 40°C = 125% of nameplate FLA.',ref:'NEC 430.32(A)(1)'},
  {id:'mo05',level:'Journeyman',cat:'Motors',q:'Motor disconnect must be within sight of motor unless:',ch:['A lockable disconnect is provided','Motor is under 1HP','Motor is indoors','Circuit is GFCI protected'],c:0,exp:'NEC 430.102(B): If not within sight, a lockable disconnect required at motor location.',ref:'NEC 430.102(B)'},
  {id:'mo06',level:'Journeyman',cat:'Motors',q:'10HP 230V 3-phase motor, FLC = 28A from NEC table. Minimum conductor ampacity?',ch:['28A','30A','35A','40A'],c:2,exp:'28A × 1.25 = 35A minimum conductor ampacity (NEC 430.22(A)).',ref:'NEC 430.22(A)'},
  {id:'mo07',level:'Journeyman',cat:'Motors',q:'NEC Article 430 covers:',ch:['Transformers','Motors, controllers, and motor circuits','Services and feeders','Grounding and bonding'],c:1,exp:'NEC Article 430 covers motors, motor branch circuits, controllers, overloads, and disconnects.',ref:'NEC Article 430'},
  // ── SERVICES ──
  {id:'sf01',level:'Journeyman',cat:'Services',q:'Maximum service disconnects at one location?',ch:['1','3','6','12'],c:2,exp:'NEC 230.71(A): Maximum 6 service disconnects permitted at one location.',ref:'NEC 230.71(A)'},
  {id:'sf02',level:'Journeyman',cat:'Services',q:'Service disconnect must be located:',ch:['Only outdoors','At or near where conductors enter building','In main panelboard only','Utility-accessible only'],c:1,exp:'NEC 230.70(A): Service disconnect must be at readily accessible location near entry point.',ref:'NEC 230.70(A)'},
  {id:'sf03',level:'Journeyman',cat:'Services',q:'Neutral-to-ground bond in a subpanel in the same building:',ch:['Always bond','Never — keep separate','Bond only on main feeder','Bond only if over 100A'],c:1,exp:'NEC 250.142(B): Separate neutral and ground required in subpanels in same building.',ref:'NEC 250.142(B)'},
  {id:'sf04',level:'Journeyman',cat:'Services',q:'GEC for a 200A service with 3/0 Cu conductors (Table 250.66):',ch:['#4 AWG Cu','#2 AWG Cu','1/0 AWG Cu','3/0 AWG Cu'],c:0,exp:'NEC Table 250.66: 2/0 or 3/0 Cu service conductor → #4 Cu GEC minimum. Note the connection to a rod electrode is separately capped at #6 Cu by 250.66(A).',ref:'NEC Table 250.66'},
  // ── LOAD CALCULATIONS ──
  {id:'lc01',level:'Journeyman',cat:'Load Calc',q:'Continuous load is defined as operating at maximum current for at least:',ch:['1 hour','2 hours','3 hours','4 hours'],c:2,exp:'NEC Article 100: Continuous load = expected to operate at maximum current for 3+ hours.',ref:'NEC Article 100'},
  {id:'lc02',level:'Journeyman',cat:'Load Calc',q:'OCPD protecting a continuous load must be rated:',ch:['100% of load','110% of load','125% of load','150% of load'],c:2,exp:'NEC 210.20(A): OCPD must not be less than 125% of continuous load.',ref:'NEC 210.20(A)'},
  {id:'lc03',level:'Journeyman',cat:'Load Calc',q:'General lighting load for dwellings is calculated at:',ch:['1 VA/sq ft','2 VA/sq ft','3 VA/sq ft','5 VA/sq ft'],c:2,exp:'NEC Table 220.42: Dwelling general lighting = 3 VA per square foot.',ref:'NEC Table 220.42'},
  {id:'lc04',level:'Journeyman',cat:'Load Calc',q:'Each general-purpose receptacle outlet = how many VA for load calculations?',ch:['90 VA','120 VA','180 VA','250 VA'],c:2,exp:'NEC 220.14(I): Each general-purpose receptacle = 180 VA.',ref:'NEC 220.14(I)'},
  {id:'lc05',level:'Journeyman',cat:'Load Calc',q:'A 20A continuous load requires OCPD rated at minimum:',ch:['20A','22A','25A','30A'],c:2,exp:'20A × 1.25 = 25A minimum OCPD. Standard next size = 25A breaker.',ref:'NEC 210.20(A)'},
  // ── TRANSFORMERS ──
  {id:'tr01',level:'Journeyman',cat:'Transformers',q:'25 kVA, 480/240V 1-phase transformer. Secondary FLA?',ch:['52A','83A','104A','208A'],c:2,exp:'Is = (kVA × 1000) ÷ Es = 25,000 ÷ 240 = 104A.',ref:'Electrical theory'},
  {id:'tr02',level:'Journeyman',cat:'Transformers',q:'240V delta high-leg (wild leg) must be colored:',ch:['Red','Orange','Blue','Yellow'],c:1,exp:'NEC 110.15 and 230.56: High-leg (Phase B) on 4-wire delta must be orange.',ref:'NEC 110.15'},
  {id:'tr03',level:'Journeyman',cat:'Transformers',q:'Secondary OCPD for a transformer is generally required within:',ch:['5 feet','10 feet','25 feet','At service only'],c:1,exp:'NEC 450.3: Secondary OCPD required within 10 feet of transformer unless exceptions apply.',ref:'NEC 450.3'},
  {id:'tr04',level:'Journeyman',cat:'Transformers',q:'Dry-type transformer 112.5 kVA and over must be:',ch:['Outdoors only','In a fire-resistant transformer room','Double-insulated','Listed for outdoor use'],c:1,exp:'NEC 450.21(B): 112.5+ kVA dry-type transformers require a fire-resistant room or outdoor installation.',ref:'NEC 450.21(B)'},
  // ── WIRING METHODS ──
  {id:'wm01',level:'Apprentice',cat:'Wiring Methods',q:'EMT must be supported at intervals not exceeding:',ch:['5 feet','10 feet','15 feet','20 feet'],c:1,exp:'NEC 358.30(A): EMT secured at intervals not exceeding 10 feet.',ref:'NEC 358.30(A)'},
  {id:'wm02',level:'Apprentice',cat:'Wiring Methods',q:'EMT must be secured within how many feet of a box?',ch:['1 foot','3 feet','5 feet','10 feet'],c:1,exp:'NEC 358.30(A): Secure EMT within 3 feet of every box, cabinet, or fitting.',ref:'NEC 358.30(A)'},
  {id:'wm03',level:'Journeyman',cat:'Wiring Methods',q:'NM cable (Romex) is permitted in:',ch:['Commercial buildings','Wet locations','Residential and light commercial, dry locations','Any exposed location'],c:2,exp:'NEC 334.10: NM cable limited to residential and certain light commercial dry locations.',ref:'NEC 334.10'},
  {id:'wm04',level:'Journeyman',cat:'Wiring Methods',q:'MC cable must be supported at intervals not exceeding:',ch:['3 feet','6 feet','10 feet','12 feet'],c:1,exp:'NEC 330.30(B): MC cable secured at intervals not exceeding 6 feet.',ref:'NEC 330.30(B)'},
  {id:'wm05',level:'Apprentice',cat:'Wiring Methods',q:'Maximum total bends in EMT between pull points:',ch:['180°','270°','360°','450°'],c:2,exp:'NEC 358.26: Total bends between pull points must not exceed 360°.',ref:'NEC 358.26'},
  {id:'wm06',level:'Journeyman',cat:'Wiring Methods',q:'PVC Schedule 40 in a wet outdoor location is:',ch:['Never permitted','Permitted when listed for wet/damp','Only underground','Only with conduit seals'],c:1,exp:'NEC 352.10: PVC Schedule 40 is permitted in wet locations when listed.',ref:'NEC 352.10'},
  // ── OVERCURRENT ──
  {id:'oc01',level:'Apprentice',cat:'Overcurrent',q:'Maximum OCPD for #14 AWG copper?',ch:['10A','15A','20A','25A'],c:1,exp:'NEC 240.4(D)(3): #14 AWG maximum OCPD = 15A.',ref:'NEC 240.4(D)(3)'},
  {id:'oc02',level:'Apprentice',cat:'Overcurrent',q:'Maximum OCPD for #12 AWG copper?',ch:['15A','20A','25A','30A'],c:1,exp:'NEC 240.4(D)(5): #12 AWG maximum OCPD = 20A.',ref:'NEC 240.4(D)(5)'},
  {id:'oc03',level:'Apprentice',cat:'Overcurrent',q:'Maximum OCPD for #10 AWG copper?',ch:['20A','25A','30A','35A'],c:2,exp:'NEC 240.4(D)(6): #10 AWG maximum OCPD = 30A.',ref:'NEC 240.4(D)(6)'},
  {id:'oc04',level:'Journeyman',cat:'Overcurrent',q:'Standard breaker sizes do NOT include:',ch:['15A','20A','22A','30A'],c:2,exp:'NEC 240.6(A) Standard sizes: 15, 20, 25, 30, 35, 40... 22A is not a standard size.',ref:'NEC 240.6(A)'},
  {id:'oc05',level:'Journeyman',cat:'Overcurrent',q:'The next-size-up OCPD rule applies when:',ch:['Always','Conductor ampacity does not match a standard size','Never','Only with engineer approval'],c:1,exp:'NEC 240.4(B): Next size up permitted when conductor ampacity does not correspond to a standard device.',ref:'NEC 240.4(B)'},
  // ── SAFETY ──
  {id:'sa01',level:'Apprentice',cat:'Safety',q:'Before working on electrical equipment, you must:',ch:['Wear rubber gloves only','De-energize with LOTO per OSHA','Test with non-contact tester only','Notify utility first'],c:1,exp:'OSHA 29 CFR 1910.147: Lockout/Tagout required when de-energizing for maintenance.',ref:'OSHA 29 CFR 1910.147'},
  {id:'sa02',level:'Apprentice',cat:'Safety',q:'Before touching any conductor, you must:',ch:['Assume it is de-energized','Test with a calibrated meter','Check circuit directory','Put gloves on first'],c:1,exp:'Always test with a calibrated, properly rated meter before touching — never assume de-energized.',ref:'NFPA 70E'},
  {id:'sa03',level:'Apprentice',cat:'Safety',q:'Minimum working clearance in front of a 120V–250V panelboard:',ch:['18 inches','2 feet','3 feet','4 feet'],c:2,exp:'NEC 110.26(A)(1): Minimum 3-foot depth of working clearance for 0–150V conditions.',ref:'NEC 110.26(A)(1)'},
  {id:'sa04',level:'Journeyman',cat:'Safety',q:'Arc flash PPE requirements are governed by:',ch:['OSHA 1926 Subpart K only','NFPA 70E','NEC Article 250','NEC 110.26'],c:1,exp:'NFPA 70E: Standard for Electrical Safety in the Workplace governs arc flash PPE.',ref:'NFPA 70E'},
  {id:'sa05',level:'Journeyman',cat:'Safety',q:'Minimum headroom of working space about electrical equipment per NEC 110.26(A)(3):',ch:['6 feet','6 feet 3 inches','6 feet 6 inches','7 feet'],c:2,exp:'NEC 110.26(A)(3): the working space must be clear to a height of 6½ ft (2.0 m), or the height of the equipment, whichever is greater.',ref:'NEC 110.26(A)(3)'},

  // ── BOX FILL (additional) ──
  {id:'bf11',level:'Apprentice',cat:'Box Fill',q:'What NEC article section covers box fill calculations?',ch:['NEC 110.26','NEC 314.16','NEC 250.122','NEC 230.70'],c:1,exp:'NEC 314.16 covers outlet box fill. 314.16(A) lists common box volumes; 314.16(B) gives the calculation method.',ref:'NEC 314.16'},
  {id:'bf12',level:'Journeyman',cat:'Box Fill',q:'A box has 6 #12 conductors, 2 grounds, 2 clamps, and 2 devices. Volume needed (#12 = 2.25 in³)?',ch:['22.5 in³','27.0 in³','29.25 in³','31.5 in³'],c:1,exp:'6 conductors × 2.25 = 13.5 · All grounds = 1 × 2.25 = 2.25 · All clamps = 1 × 2.25 = 2.25 · 2 devices × 2 vols × 2.25 = 9.0 · Total = 27.0 in³.',ref:'NEC 314.16(B)'},
  {id:'bf13',level:'Apprentice',cat:'Box Fill',q:'Volume allowance for a #10 AWG conductor?',ch:['2.00 in³','2.25 in³','2.50 in³','3.00 in³'],c:2,exp:'NEC 314.16(B) Table: #10 AWG = 2.50 in³ per conductor allowance.',ref:'NEC 314.16(B)'},

  // ── CONDUIT FILL (additional) ──
  {id:'cf11',level:'Apprentice',cat:'Conduit Fill',q:'What conduit type has the largest internal area for a given trade size?',ch:['EMT','IMC','RMC','PVC-40'],c:1,exp:'IMC has a slightly larger internal area than EMT for the same trade size, allowing more conductors.',ref:'NEC Ch.9 Table 4'},
  {id:'cf12',level:'Journeyman',cat:'Conduit Fill',q:'You have 6 #10 THHN conductors (0.0211 in² each). What is the smallest EMT that stays under 40% fill?',ch:['½" EMT (0.304 in²)','¾" EMT (0.533 in²)','1" EMT (0.864 in²)','1-¼" EMT (1.496 in²)'],c:1,exp:'6 × 0.0211 = 0.1266 in². ½" EMT: 0.1266 ÷ 0.304 = 41.6% — over. ¾" EMT: 0.1266 ÷ 0.533 = 23.8% — PASS, and it is the smallest that does.',ref:'NEC Ch.9'},

  // ── GFCI/AFCI (additional) ──
  {id:'ga11',level:'Journeyman',cat:'GFCI/AFCI',q:'A GFCI receptacle can protect downstream outlets when wired to the:',ch:['HOT terminals only','LOAD terminals','LINE terminals','Neutral bar only'],c:1,exp:'Connecting downstream receptacles to the LOAD terminals of a GFCI receptacle extends GFCI protection to all downstream outlets.',ref:'NEC 210.8'},
  {id:'ga12',level:'Apprentice',cat:'GFCI/AFCI',q:'Crawl spaces at or below grade require GFCI for:',ch:['No receptacles','All receptacles','Only 240V receptacles','Only lighting'],c:1,exp:'NEC 210.8(A)(4): All receptacles in crawl spaces at or below grade require GFCI protection.',ref:'NEC 210.8(A)(4)'},
  {id:'ga13',level:'Journeyman',cat:'GFCI/AFCI',q:'The 2020 NEC expanded AFCI to include which new locations?',ch:['Outdoor only','Kitchens, laundry, dining, living rooms','Bathrooms only','Garages only'],c:1,exp:'The 2020 NEC expanded AFCI coverage to kitchens, laundry areas, dining rooms, living rooms, and more beyond just bedrooms.',ref:'NEC 210.12(A)'},

  // ── GROUNDING (additional) ──
  {id:'gb09',level:'Journeyman',cat:'Grounding',q:'Which of these is NOT an acceptable grounding electrode per NEC 250.52?',ch:['Metal water pipe (10 ft or more)','Ground rod (8 ft)','Concrete-encased electrode (rebar 20 ft)','PVC drain pipe'],c:3,exp:'NEC 250.52 lists acceptable grounding electrodes. PVC is not a conductor and cannot serve as a grounding electrode.',ref:'NEC 250.52'},
  {id:'gb10',level:'Journeyman',cat:'Grounding',q:'A concrete-encased electrode (Ufer ground) must use rebar of what minimum length?',ch:['10 feet','15 feet','20 feet','25 feet'],c:2,exp:'NEC 250.52(A)(3): CEE requires at least 20 feet of #4 AWG or larger steel reinforcing bar in concrete.',ref:'NEC 250.52(A)(3)'},
  {id:'gb11',level:'Apprentice',cat:'Grounding',q:'What color is the neutral (grounded) conductor at voltages exceeding 250V?',ch:['White','Gray','Either white or gray','Green'],c:2,exp:'NEC 200.6(B): For conductors over 250V, neutral identification must be gray (not white).',ref:'NEC 200.6(B)'},

  // ── VOLTAGE DROP (additional) ──
  {id:'vd07',level:'Journeyman',cat:'Voltage Drop',q:'K factor for copper conductors in the voltage drop formula is approximately:',ch:['10.8','12.9','21.2','24.0'],c:1,exp:'K = 12.9 for copper (resistivity constant). K = 21.2 for aluminum. Used in VD% = (2×K×I×D)÷(CM×E)×100.',ref:'Electrical theory'},
  {id:'vd08',level:'Journeyman',cat:'Voltage Drop',q:'To find the minimum wire size for ≤3% drop: which variable do you solve for?',ch:['K','I (current)','D (distance)','CM (circular mils)'],c:3,exp:'Rearrange VD% formula: CM = (2×K×I×D)÷(VD%×E). Solve for circular mils, then select next larger standard wire size.',ref:'Electrical theory'},

  // ── MOTORS (additional) ──
  {id:'mo08',level:'Journeyman',cat:'Motors',q:'Motor overload protection devices protect the motor from:',ch:['Short circuits','Voltage surges','Sustained overloads and overheating','Ground faults'],c:2,exp:'Overload relays protect motors from sustained overloading which causes heating and insulation damage. Breakers protect against short circuits.',ref:'NEC 430.32'},
  {id:'mo09',level:'Journeyman',cat:'Motors',q:'The nameplate FLA of a motor should be used for:',ch:['Conductor sizing','OCPD sizing','Overload protection sizing','All of the above'],c:2,exp:'NEC 430.6: Use FLC tables (not nameplate) for conductor and OCPD sizing. Use nameplate FLA only for overload protection sizing.',ref:'NEC 430.6'},
  {id:'mo10',level:'Journeyman',cat:'Motors',q:'A motor controller must be located within sight of the motor unless:',ch:['Motor is less than 1HP','Controller has lockable disconnect','Approved by inspector only','Motor is over 460V'],c:1,exp:'NEC 430.87 Exception: If the controller has a means of locking open, it may be remote from the motor.',ref:'NEC 430.87'},

  // ── SERVICES (additional) ──
  {id:'sf05',level:'Journeyman',cat:'Services',q:'Overhead service conductors must maintain what minimum clearance above residential driveways?',ch:['10 feet','12 feet','15 feet','18 feet'],c:2,exp:'NEC 230.24(B): Overhead service conductors must be at least 15 feet above commercial driveways; check your local requirements for residential.',ref:'NEC 230.24'},
  {id:'sf06',level:'Journeyman',cat:'Services',q:'Service entrance conductors are protected by the utility or:',ch:['No protection required','The main service disconnect','A 20A breaker only','The meter socket'],c:1,exp:'NEC 230.90: Service conductors are protected from overload by the service overcurrent device (main breaker or fuses).',ref:'NEC 230.90'},

  // ── LOAD CALCULATIONS (additional) ──
  {id:'lc06',level:'Journeyman',cat:'Load Calc',q:'The first 3,000 VA of a residential load uses what demand factor?',ch:['50%','75%','100%','125%'],c:2,exp:'NEC Table 220.42: First 3,000 VA of lighting load = 100% demand factor for dwellings.',ref:'NEC Table 220.42'},
  {id:'lc07',level:'Journeyman',cat:'Load Calc',q:'Small appliance branch circuits in kitchens are calculated at minimum:',ch:['1,000 VA each','1,500 VA each','2,000 VA each','3,000 VA each'],c:1,exp:'NEC 220.52(A): Two or more 20A small appliance circuits required in kitchen; each calculated at 1,500 VA minimum.',ref:'NEC 220.52(A)'},
  {id:'lc08',level:'Journeyman',cat:'Load Calc',q:'The laundry branch circuit load is calculated at:',ch:['750 VA','1,000 VA','1,500 VA','2,000 VA'],c:2,exp:'NEC 220.52(B): At least one 20A laundry circuit required; calculated at 1,500 VA.',ref:'NEC 220.52(B)'},

  // ── TRANSFORMERS (additional) ──
  {id:'tr05',level:'Journeyman',cat:'Transformers',q:'A 480V/208Y-120V transformer is classified as:',ch:['Delta-delta','Wye-delta','Delta-wye','Wye-wye'],c:2,exp:'480V three-phase primary (delta) to 208Y/120V three-phase secondary (wye) is the most common commercial step-down configuration.',ref:'Electrical theory'},
  {id:'tr06',level:'Journeyman',cat:'Transformers',q:'Primary overcurrent protection for a transformer ≤600V not exceeding 125% of rated primary current falls under:',ch:['NEC 240.4','NEC 450.3','NEC 430.52','NEC 210.20'],c:1,exp:'NEC 450.3 covers transformer overcurrent protection. 125% of rated primary current is the standard protection value.',ref:'NEC 450.3'},

  // ── WIRING METHODS (additional) ──
  {id:'wm07',level:'Journeyman',cat:'Wiring Methods',q:'Minimum burial depth for PVC Schedule 40 conduit under a residential driveway?',ch:['6 inches','12 inches','18 inches','24 inches'],c:1,exp:'NEC 300.5 Table: PVC under a residential driveway = 12 inches minimum depth.',ref:'NEC 300.5'},
  {id:'wm08',level:'Apprentice',cat:'Wiring Methods',q:'NM cable must be supported every:',ch:['3 feet','4.5 feet','6 feet','10 feet'],c:1,exp:'NEC 334.30: NM cable must be secured every 4.5 feet and within 12 inches of every box.',ref:'NEC 334.30'},
  {id:'wm09',level:'Journeyman',cat:'Wiring Methods',q:'Liquidtight flexible metal conduit (LFMC) may serve as the equipment grounding conductor only up to what length in the ground-return path?',ch:['18 inches','24 inches','36 inches','6 feet'],c:3,exp:'NEC 250.118: LFMC qualifies as an EGC only when the fittings are listed for grounding, the length in the ground-return path is 6 ft or less, and the circuit overcurrent protection is within the limits for the trade size. Beyond that, run a separate EGC.',ref:'NEC 250.118'},
  {id:'wm10',level:'Journeyman',cat:'Wiring Methods',q:'Type MC cable with interlocking metal tape armor may be used:',ch:['Outdoors only','Indoors in dry locations only','In wet, damp, or corrosive locations if listed','Residential only'],c:2,exp:'NEC 330.10: MC cable is permitted in wet, damp, or corrosive locations when the cable and fittings are listed for such use.',ref:'NEC 330.10'},

  // ── OVERCURRENT (additional) ──
  {id:'oc06',level:'Journeyman',cat:'Overcurrent',q:'What is the maximum standard fuse or breaker size per NEC 240.6(A)?',ch:['400A','600A','800A','6000A'],c:2,exp:'NEC 240.6(A): Standard sizes go up to 6,000A. Amperes above 800A are listed in increments of 200A.',ref:'NEC 240.6(A)'},
  {id:'oc07',level:'Apprentice',cat:'Overcurrent',q:'An OCPD provides protection against:',ch:['Voltage surges','Overcurrents including overloads and short circuits','Ground faults only','All power quality issues'],c:1,exp:'OCPDs (breakers and fuses) protect conductors from overcurrents: both overloads (too much current over time) and short circuits/ground faults (very large currents).',ref:'NEC 240.1'},
  {id:'oc08',level:'Journeyman',cat:'Overcurrent',q:'Inverse-time breakers trip faster when:',ch:['Current is lower','Current is higher','Voltage is higher','Temperature is lower'],c:1,exp:'Inverse-time (thermal-magnetic) breakers have thermal elements that respond to sustained overloads — the higher the overcurrent, the faster the trip.',ref:'NEC 240.6'},

  // ── SAFETY (additional) ──
  {id:'sa06',level:'Apprentice',cat:'Safety',q:'Width of working space in front of electrical equipment must be at least:',ch:['18 inches','24 inches','30 inches or equipment width','36 inches always'],c:2,exp:'NEC 110.26(A)(2): Width of working space must be at least 30 inches or the width of the equipment — whichever is greater.',ref:'NEC 110.26(A)(2)'},
  {id:'sa07',level:'Journeyman',cat:'Safety',q:'An arc flash hazard analysis is required before working on energized equipment per:',ch:['NEC 110.26','NFPA 70E 130.5','OSHA 1910.147','NEC 250.4'],c:1,exp:'NFPA 70E 130.5: An arc flash hazard analysis must be performed and PPE selected based on incident energy level.',ref:'NFPA 70E 130.5'},
  {id:'sa08',level:'Apprentice',cat:'Safety',q:'When must electrical equipment be de-energized before work begins?',ch:['Never required','Always unless infeasible and using proper PPE','Only for 480V+ systems','Only when inspector is present'],c:1,exp:'OSHA and NFPA 70E: Equipment must be de-energized unless de-energizing creates a greater hazard or is infeasible — in which case energized electrical work permit and PPE are required.',ref:'NFPA 70E 130.2'},

  // ── NEW CATEGORY: LOAD CALCULATIONS ──
  {id:'lc09',level:'Journeyman',cat:'Load Calc',q:'Optional calculation method for dwellings uses what percentage of total connected load over 8 kW?',ch:['40%','50%','75%','100%'],c:0,exp:'NEC 220.82: Optional method for dwellings: first 8 kVA at 100% + remainder at 40% demand factor.',ref:'NEC 220.82'},
  {id:'lc10',level:'Journeyman',cat:'Load Calc',q:'Electric range load for a single dwelling unit with a 12 kW range is calculated at:',ch:['8 kW demand','10 kW demand','12 kW demand','15 kW demand'],c:0,exp:'NEC Table 220.55: Single 12 kW electric range = 8 kW demand for load calculations.',ref:'NEC Table 220.55'},

  // ── NEW CATEGORY: THREE PHASE ──
  {id:'tp01',level:'Journeyman',cat:'Three Phase',q:'On a 208/120V three-phase wye system, the line-to-neutral voltage is:',ch:['120V','208V','240V','277V'],c:0,exp:'In a 208/120V wye system, 120V is the line-to-neutral (phase) voltage. 208V is the line-to-line voltage.',ref:'Electrical theory'},
  {id:'tp02',level:'Journeyman',cat:'Three Phase',q:'Line-to-line voltage on a 480/277V wye system is:',ch:['277V','346V','480V','600V'],c:2,exp:'Line-to-line = 277 × √3 = 480V. This is standard commercial high-voltage distribution for lighting and HVAC.',ref:'Electrical theory'},
  {id:'tp03',level:'Journeyman',cat:'Three Phase',q:'Three-phase power formula: P = √3 × V_LL × I × PF. If V=208V, I=50A, PF=1.0, what is power?',ch:['10,400W','14,400W','18,000W','24,000W'],c:2,exp:'P = 1.732 × 208 × 50 × 1.0 = 18,013W ≈ 18 kW.',ref:'Electrical theory'},
  {id:'tp04',level:'Journeyman',cat:'Three Phase',q:'The high leg on a 240V delta system carries approximately what voltage to neutral?',ch:['120V','208V','240V','277V'],c:1,exp:'The high leg (wild leg) on a 240V 4-wire delta = 208V to neutral. Must be colored orange. Do NOT connect 120V loads.',ref:'NEC 110.15'},

  // ── FORMULAS IN PRACTICE ──
  {id:'fp01',level:'Journeyman',cat:'Voltage Drop',q:'A 120V, 20A circuit with #12 Cu runs 75 feet one-way. Using VD = 2×K×I×D/CM with K=12.9 and CM=6,530 for #12: VD ≈?',ch:['3.0V (2.5%)','4.4V (3.7%)','5.9V (4.9%)','7.4V (6.2%)'],c:2,exp:'VD = (2 × 12.9 × 20 × 75) ÷ 6,530 = 38,700 ÷ 6,530 = 5.93V, and 5.93 ÷ 120 = 4.9%. That is past the 3% the informational note recommends for a branch circuit, so this run wants #10.',ref:'NEC 210.19(A)'},
  {id:'fp02',level:'Journeyman',cat:'Motors',q:'A 5HP 230V single-phase motor per NEC Table 430.248 has an FLC of 28A. Max conductor size allowed (NEC 430.22)?',ch:['28A','30A','35A','40A'],c:2,exp:'Conductors ≥ 28 × 1.25 = 35A. #8 AWG Cu at 75°C = 50A ampacity — satisfies the 35A minimum.',ref:'NEC 430.22(A)'},

  // ── ADDITIONAL GFCI/AFCI ──
  {id:'ga14',level:'Journeyman',cat:'GFCI/AFCI',q:'A GFCI device tests itself by pressing the TEST button, which:',ch:['Cuts all power','Creates a 5mA internal imbalance to test the trip mechanism','Tests for arc faults','Verifies the hot and neutral are correct'],c:1,exp:'Pressing TEST creates a small internal ground fault (imbalance) that should trip the GFCI. RESET restores power.',ref:'UL 943'},
  {id:'ga15',level:'Apprentice',cat:'GFCI/AFCI',q:'Pool, spa, and fountain areas require GFCI for:',ch:['240V receptacles only','No receptacles in these areas','Receptacles within 20 feet of the pool','All outdoor receptacles'],c:2,exp:'NEC 680.22(A): Receptacles within 20 feet of a pool or spa edge require GFCI protection.',ref:'NEC 680.22(A)'},

  // ── ADDITIONAL GROUNDING ──
  {id:'gb12',level:'Journeyman',cat:'Grounding',q:'The system bonding jumper in a separately derived system is equivalent to:',ch:['The EGC','The main bonding jumper','The GEC','The neutral conductor'],c:1,exp:'In separately derived systems (like transformers), the system bonding jumper connects the neutral to ground — equivalent to the main bonding jumper at the service.',ref:'NEC 250.30(A)(1)'},
  {id:'gb13',level:'Apprentice',cat:'Grounding',q:'A ground rod must be driven to a minimum depth of:',ch:['4 feet','6 feet','8 feet','10 feet'],c:2,exp:'NEC 250.52(A)(5): Ground rods must be at least 8 feet in length and driven to full depth.',ref:'NEC 250.52(A)(5)'},

  // ── ADDITIONAL WIRING METHODS ──
  {id:'wm11',level:'Apprentice',cat:'Wiring Methods',q:'Exposed NM cable in a garage must be:',ch:['Protected by conduit','Run in walls only','Acceptable as-is if stapled','Cannot be used in garages at all'],c:0,exp:'NEC 334.15: Where exposed, NM cable must be run through conduit, protected from damage. In garages of dwellings, NM is permitted if protected.',ref:'NEC 334.15'},
  {id:'wm12',level:'Journeyman',cat:'Wiring Methods',q:'Rigid PVC conduit expansion fittings are required when:',ch:['Always','Only underground','Temperature changes cause significant expansion','Never required'],c:2,exp:'PVC has a high expansion coefficient. Expansion fittings are required per NEC 352.44 in long runs to allow for thermal movement.',ref:'NEC 352.44'},

  // ── ADDITIONAL OVERCURRENT ──
  {id:'oc09',level:'Journeyman',cat:'Overcurrent',q:'A 40A conductor can be protected by a 60A breaker if:',ch:['Never','Only with engineer approval','The conductor ampacity exceeds the standard next-size-up','The conductor is copper'],c:0,exp:'NEC 240.4(B): Next-size-up is only allowed when the conductor ampacity does not correspond to a standard device rating and the device is 800A or less.',ref:'NEC 240.4(B)'},
  {id:'oc10',level:'Apprentice',cat:'Overcurrent',q:'Type S fuses are designed to be:',ch:['Tamper-proof and non-interchangeable by ampere rating','Higher capacity than standard fuses','Used outdoors only','Resettable like breakers'],c:0,exp:'Type S (rejection-base) fuses are non-interchangeable — each ampere rating has a different base size so you cannot replace a 15A fuse with a 30A.',ref:'NEC 240.54'},
];

const EXAM_CATEGORIES = [...new Set(EXAM_QUESTIONS.map(q => q.cat))];
const EXAM_LEVELS = ['Apprentice', 'Journeyman'];

const getExamQuestions = (level, category, count) => {
  let pool = EXAM_QUESTIONS;
  if (level !== 'All') pool = pool.filter(q => q.level === level);
  if (category !== 'All') pool = pool.filter(q => q.cat === category);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
};

const NecAiScreen = ({ C, setTab, initialSearch = '', clearInitSearch, onUpgrade, onBuyPacks, isPro = IS_PRO, planType = 'free' }) => {
  const [inputText, setInputText] = React.useState(initialSearch || '');
  const [messages, setMessages] = React.useState([]);
  const [convos, setConvos] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedImage, setSelectedImage] = React.useState(null);
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingTime, setRecordingTime] = React.useState(0);
  const [remainingQuestions, setRemainingQuestions] = React.useState(null);
  const scrollRef = React.useRef(null);
  const recordingRef = React.useRef(null);
  const timerRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const sentInitial = React.useRef(false);
  const [activeMode, setActiveMode] = React.useState('general');

  // ── Keyboard: lift the input bar above the keyboard ──
  // The app has no navigation library and the tab bar is a plain sibling View,
  // so KeyboardAvoidingView's offset math has nothing reliable to anchor to.
  // Tracking the keyboard frame directly and padding the screen is exact: the
  // keyboard covers the tab bar (~70pt of it), so the content only needs to
  // rise by the difference.
  const [kbLift, setKbLift] = React.useState(0);
  React.useEffect(() => {
    const TAB_BAR_COVERED = 70;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e) => {
      try {
        const winH = Dimensions.get('window').height;
        const kbH = Math.max(0, winH - (e?.endCoordinates?.screenY ?? winH));
        setKbLift(Math.max(0, kbH - TAB_BAR_COVERED));
      } catch { /* a keyboard event must never crash the chat */ }
    };
    const s = Keyboard.addListener(showEvt, onShow);
    const h = Keyboard.addListener(hideEvt, () => setKbLift(0));
    return () => { try { s.remove(); h.remove(); } catch {} };
  }, []);

  // Modes come from core/ai/modes.js, which also owns what each one PUTS ON
  // SCREEN. They used to be four chips that swapped a hidden prompt prefix and
  // nothing else, so picking one changed nothing you could see.
  //
  // "Explain Simply" is gone from here on purpose: the other three describe a
  // kind of QUESTION and that one described a kind of ANSWER. It is now an
  // action on any response, which is where you actually decide you want it.
  const SPARKY_MODES = MODES;
  const [showHistory, setShowHistory] = useState(false);
  // What the selected mode puts on screen. Derived, so a chip can never be lit
  // while the body below it belongs to a different mode.
  const modeHome = React.useMemo(() => modeById(activeMode), [activeMode]);


  // Load conversation history from storage (cross-session memory)
  React.useEffect(() => {
    safeStorageGet('@sc_sparky_history').then(val => {
      if (val) {
        try {
          const saved = JSON.parse(val);
          if (Array.isArray(saved) && saved.length > 0) {
            // Only restore if no initialSearch forcing a fresh start
            if (!initialSearch) setMessages(saved.slice(-20));
          }
        } catch {}
      }
    });
    safeStorageGet('@sc_sparky_convos').then(val => {
      if (val) {
        try {
          const saved = JSON.parse(val);
          if (Array.isArray(saved)) setConvos(saved.slice(0, 10));
        } catch {}
      }
    });
  }, []);

  // Archive the live chat into Recent Conversations, then start fresh.
  // Only a real exchange (a question AND an answer) is worth keeping.
  const startNewConversation = () => {
    if (messages.some((m) => m.role === 'user') && messages.length >= 2) {
      const firstQ = messages.find((m) => m.role === 'user');
      const convo = {
        id: `c${Date.now()}`,
        ts: Date.now(),
        title: String(firstQ?.text || 'Photo question').slice(0, 64),
        count: messages.length,
        messages: messages.slice(-20),
      };
      const next = [convo, ...convos].slice(0, 10);
      setConvos(next);
      safeStorageSet('@sc_sparky_convos', JSON.stringify(next));
    }
    setMessages([]);
    safeStorageSet('@sc_sparky_history', '[]');
  };

  // Reopen an archived conversation as the live one (it re-archives on next new chat).
  const openConversation = (convo) => {
    const next = convos.filter((c) => c.id !== convo.id);
    setConvos(next);
    safeStorageSet('@sc_sparky_convos', JSON.stringify(next));
    setMessages(Array.isArray(convo.messages) ? convo.messages.slice(-20) : []);
  };

  const deleteConversation = (id) => {
    const next = convos.filter((c) => c.id !== id);
    setConvos(next);
    safeStorageSet('@sc_sparky_convos', JSON.stringify(next));
  };

  // Auto-fire initial search from Estimator — then clear so it doesn't re-fire
  React.useEffect(() => {
    if (initialSearch && !sentInitial.current) {
      sentInitial.current = true;
      setTimeout(() => {
        handleSend(initialSearch);
        clearInitSearch?.(); // ← clears necaiInitSearch in App so navigating back doesn't re-fire
      }, 700);
    }
  }, []);

  // Persist conversation to AsyncStorage whenever messages change
  React.useEffect(() => {
    if (messages.length > 0) {
      safeStorageSet('@sc_sparky_history', JSON.stringify(messages.slice(-20)));
    }
  }, [messages]);

  const scrollToBottom = () => setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 150);

  // ── Image picker ────────────────────────────────────────────────────────
  const handleImagePress = () => {
    Alert.alert('Add Photo to SparkAI', 'Photo a panel, wire, nameplate, diagram, or job site.', [
      { text: '📷 Take Photo',        onPress: () => pickImg(true) },
      { text: '🖼  Choose from Library', onPress: () => pickImg(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickImg = async (camera) => {
    const IP = await _loadImagePicker();
    if (!IP || typeof IP.requestCameraPermissionsAsync !== 'function') {
      Alert.alert('Photo feature', 'Run: npx expo install expo-image-picker\nThen restart Expo Go.');
      return;
    }
    try {
      if (camera) {
        const { status } = await IP.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Camera Permission', 'Allow camera in Settings → SparkConnect → Camera.'); return; }
        const result = await IP.launchCameraAsync({ quality: 0.6, base64: true, allowsEditing: false });
        if (!result.canceled && result.assets?.[0]) setSelectedImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
      } else {
        const { status } = await IP.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Photo Library Permission', 'Allow photos in Settings → SparkConnect → Photos.'); return; }
        const result = await IP.launchImageLibraryAsync({ quality: 0.6, base64: true, allowsEditing: false });
        if (!result.canceled && result.assets?.[0]) setSelectedImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
      }
    } catch(e) { safeLog('pickImg', e); Alert.alert('Photo Error', 'Could not access photos. Try again.'); }
  };

  // ── Voice recording ─────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const { Audio } = await import('expo-av');
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone needed', 'Grant microphone permission in Settings, or tap the keyboard mic key to dictate.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch(e) {
      safeLog('startRecording', e);
      Alert.alert('Voice unavailable', 'Could not start recording. Use the keyboard mic key to dictate.');
    }
  };

  const stopRecording = async () => {
    try {
      clearInterval(timerRef.current);
      setIsRecording(false);
      if (!recordingRef.current) return;
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) return;
      // Send audio to /api/transcribe on the same backend
      const transcribeURL = NEC_BACKEND_URL ? NEC_BACKEND_URL.replace('/ask-nec', '/transcribe') : null;
      if (!transcribeURL) { Alert.alert('Voice unavailable', 'Backend not connected.'); return; }
      setInputText('🎤 Transcribing...');
      const form = new FormData();
      form.append('audio', { uri, type: 'audio/m4a', name: 'voice.m4a' });
      const res = await fetch(transcribeURL, { method: 'POST', body: form });
      // A 404 here means the transcribe endpoint is not deployed. Saying that
      // out loud beats "could not transcribe", which sends the user off
      // re-recording in a quieter room to fix a problem on the server.
      if (!res.ok) {
        setInputText('');
        Alert.alert(
          res.status === 404 ? 'Voice not set up yet' : 'Transcription failed',
          res.status === 404
            ? 'The /api/transcribe endpoint is not deployed on the backend yet. Type your question, or use the keyboard mic key to dictate.'
            : `The server returned ${res.status}. Type your question, or use the keyboard mic key.`,
        );
        return;
      }
      const data = await res.json();
      if (data.text) { setInputText(data.text); inputRef.current?.focus?.(); }
      else { setInputText(''); Alert.alert('Could not transcribe', 'Try again or type your question.'); }
    } catch(e) {
      safeLog('stopRecording', e);
      setInputText('');
      Alert.alert('Voice unavailable', 'Could not reach the transcription service. Type your question, or use the keyboard mic key to dictate.');
    }
  };

  // ── Hands-free: read answers aloud ───────────────────────────────────────
  // Electricians have dirty hands and are often up a ladder. Speaking the
  // answer is the half of voice mode that needs no backend at all, so it works
  // even when transcription does not.
  const speak = useCallback(async (text) => {
    if (!text) return;
    try {
      const Speech = await import('expo-speech');
      Speech.stop();
      // Strip markdown and code refs so it does not read asterisks aloud.
      const spoken = String(text).replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 3500);
      Speech.speak(spoken, { rate: 0.98, pitch: 1.0 });
    } catch (e) { safeLog('speak', e); }
  }, []);

  const stopSpeaking = useCallback(async () => {
    try { const Speech = await import('expo-speech'); Speech.stop(); } catch (e) { /* nothing playing */ }
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSend = async (overrideText) => {
    const q = sanitizeQuery(overrideText || inputText);
    if (!q && !selectedImage) return;
    if (loading) return;
    // ── Pro gating ────────────────────────────────────────────────────────
    // Two bugs lived here and between them SparkAI never sent a message:
    //
    //   1. `getGate` was called but never imported. It is exported from
    //      ProGatingContext.js, so this threw a ReferenceError inside an async
    //      function with no catch — the send failed silently, every time.
    //   2. Even with the import, `ProGatingProvider` is not mounted anywhere,
    //      so the static ref is null and `if (!sparkyGate) return;` swallowed
    //      the send anyway.
    //
    // Now the gate is optional. When it is present it enforces the free limit
    // and opens the paywall; when it is absent the message goes through and the
    // backend's own rate limit applies (it already returns 'rate_limited'
    // below). Failing open is right here: a missing client gate must not
    // silently break the headline feature.
    // Pro gating is optional and currently inert: ProGatingProvider is not
    // mounted, so there is no gate to consult. Rather than importing the whole
    // ProGatingContext graph to reach a null, this resolves to an empty gate and
    // lets the backend's own rate limit apply (it returns 'rate_limited' below).
    // When the provider is mounted, swap this for its context value.
    const gate = {};
    if (gate.sparkyGate) {
      if (!gate.sparkyGate.checkAllowed()) {
        gate.showPaywall?.(gate.sparkyGate.hitCap ? 'sparky_cap' : 'sparky');
        return;
      }
      await gate.sparkyGate.recordUse();
    }

    const userMsg = { id: Date.now().toString(), role: 'user', text: q, imageUri: selectedImage?.uri };
    const imgBase64 = selectedImage?.base64;
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setSelectedImage(null);
    setLoading(true);
    scrollToBottom();

    const deviceId = await getDeviceId();
    // Apply mode prefix
    const modeConfig = SPARKY_MODES.find(m => m.id === activeMode);
    const modePrefix = modeConfig?.prefix || '';
    const finalQuestion = modePrefix && q ? (modePrefix + q) : (q || 'What can you see in this image? Describe what you see and give electrician field advice.');

    // Build conversation history (last 6 messages for context = SparkAI's "memory")
    const conversationHistory = messages.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text || '',
    })).filter(m => m.content.length > 0);

    const payload = {
      question: finalQuestion,
      deviceId,
      appVersion: '1.0.0',
      planType,
      conversationHistory,
      ...(imgBase64 ? { image: imgBase64, imageType: 'image/jpeg' } : {}),
    };

    // ── Everything goes through the SparkAI pipeline ─────────────────────
    //
    // The backend is no longer called first. It is injected as the LAST resort
    // inside `sparkAsk`, which means:
    //
    //   · a computable question is computed locally and never leaves the device
    //   · a question about the open project is read from confirmed data
    //   · a reviewed-reference question is quoted with its citation
    //   · only what none of those can serve reaches the model, and its answer
    //     comes back through the seal that stops it stating a specification
    //
    // Wiring the screen to the pipeline rather than the pipeline to the screen
    // is what makes the guardrails real instead of merely written.
    let rateLimited = false;
    let backendMeta = null;

    const pipeline = await sparkAsk(finalQuestion, {
      knowledge: knowledgeBase,
      // Image questions still take the model path — the backend prompt has not
      // been aligned to the observation-first vision contract yet, so routing
      // them through readPhoto would claim a structure the response does not have.
      conversation: messages.slice(-6).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.text || '',
        tool: m.tool || null,
        params: m.params || null,
      })),
      askModel: async ({ question, context }) => {
        const result = await askNecBackend({ ...payload, question, sparkContext: context });
        if (result === 'rate_limited') { rateLimited = true; throw new Error('rate_limited'); }
        if (!result?.answer) throw new Error('no answer');
        backendMeta = result;
        if (result.remainingQuestions !== undefined) setRemainingQuestions(result.remainingQuestions);
        return {
          text: result.answer,
          sources: result.references || [],
          // DO NOT INVENT A NUMBER HERE. This read `confidence: 0.8` against a
          // CONFIDENCE_FLOOR of 0.85, so sealAnswer() discarded EVERY answer the
          // backend ever returned and showed a refusal instead. The whole model
          // path was dead in production and it looked like caution.
          //
          // The client cannot know how sure the model was, so it passes through
          // what the backend reports and stays silent when nothing is reported —
          // undefined lets answer() apply its own default rather than having a
          // guess here quietly veto a real answer. A MODEL answer is still held
          // by the authority boundary, which is the guard that actually matters:
          // it may explain, and it may not state a size, a rating or a citation.
          confidence: typeof result.confidence === 'number' ? result.confidence : undefined,
        };
      },
    });

    const footer = answerFooter(pipeline);

    if (rateLimited) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(), role: 'sparky', isRateLimit: true,
        text: isPro
          ? "You've reached this month's SparkAI allowance. An answer pack tops you back up straight away."
          : rateLimitText(isPro),
      }]);
    } else if (pipeline.provenance !== SparkProvenance.REFUSED) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(), role: 'sparky',
        text: pipeline.detail ? `${pipeline.text}\n\n${pipeline.detail}` : pipeline.text,
        refs: footer.sources,
        fieldNote: backendMeta?.fieldNote || null,
        // Where the answer came from, shown rather than implied. A computed
        // answer and a generated one must not look the same on screen.
        provenanceLabel: footer.label,
        showVerifyPrompt: footer.showVerifyPrompt,
        // Surfaced from the evidence contract: an answer computed from a table
        // nobody has checked against print says so here.
        warnings: pipeline.evidence?.warnings || [],
        tool: pipeline.tool || null,
        params: pipeline.params || null,
        disclaimer: backendMeta?.disclaimer || null,
        calcTab: backendMeta?.calcTab || null,
      }]);
    } else if (pipeline.needs?.length) {
      // A partial calculation asks for exactly what is missing, by name, rather
      // than assuming a default and returning a confident wrong number.
      setMessages(prev => [...prev, {
        id: Date.now().toString(), role: 'sparky',
        text: pipeline.needsPrompts.join('\n'),
        provenanceLabel: 'Needs a couple more details',
      }]);
    } else if (pipeline.reason && !/no model is available/i.test(pipeline.reason)) {
      // A real refusal — energized work, a high-risk subject with nothing solid
      // behind it, an unverifiable citation. Shown as itself, not as an error.
      setMessages(prev => [...prev, {
        id: Date.now().toString(), role: 'sparky',
        text: pipeline.text,
        fieldNote: pipeline.reason,
        disclaimer: pipeline.suggestion || null,
        provenanceLabel: 'Not answered',
      }]);
    } else {
      // Fallback: local NEC KB scored search
      const found = scoredSearch(q);
      if (found.length > 0) {
        const top = found[0];
        setMessages(prev => [...prev, {
          id: Date.now().toString(), role: 'sparky', isLocal: true,
          text: top.short + '\n\n' + top.explain,
          refs: top.refs || [],
          fieldNote: top.example || null,
          disclaimer: 'Local NEC reference — offline mode. Always verify with your adopted code edition and local AHJ.',
          calcTab: top.calcTab || null,
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now().toString(), role: 'sparky', isError: true,
          text: "Having trouble connecting right now. Check your connection and try again. You can also browse the local NEC reference by tapping the book icon above.",
        }]);
      }
    }

    setLoading(false);
    scrollToBottom();
  };

  // ── Message bubble ───────────────────────────────────────────────────────
  const MessageBubble = React.useCallback(({ msg }) => {
    // User bubble
    if (msg.role === 'user') {
      return (
        <View style={{ alignItems: 'flex-end', marginBottom: 10, paddingLeft: 48 }}>
          {msg.imageUri && (
            <View style={{ width: 160, height: 110, backgroundColor: C.inputBg, borderRadius: 14, marginBottom: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
              <Ionicons name="image" size={32} color={C.textTert} />
              <Text style={{ fontSize: 9, color: C.textTert, marginTop: 4 }}>Photo attached</Text>
            </View>
          )}
          {!!msg.text && (
            <View style={{ backgroundColor: C.blue, borderRadius: 18, borderBottomRightRadius: 5, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: '#fff', lineHeight: 20 }}>{msg.text}</Text>
            </View>
          )}
        </View>
      );
    }

    // Sparky bubble
    const accentColor = msg.isRateLimit ? C.warning : msg.isError ? C.danger : msg.isLocal ? C.teal : C.amber;
    const bubbleBg   = msg.isRateLimit ? C.warningBg : msg.isError ? C.dangerBg : C.surface;

    return (
      <View style={{ alignItems: 'flex-start', marginBottom: 14, paddingRight: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          {/* Sparky avatar */}
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
            <Ionicons name="flash" size={15} color="#fff" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: accentColor, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
              {msg.isLocal ? 'SparkAI · Offline' : 'SparkAI'}
              {!!msg.provenanceLabel && ` · ${msg.provenanceLabel}`}
            </Text>

            {/* Main bubble */}
            <View style={{ backgroundColor: bubbleBg, borderRadius: 18, borderTopLeftRadius: 5, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: accentColor, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ fontSize: 14, color: C.text, lineHeight: 22 }}>{msg.text}</Text>

              {/* NEC / source refs */}
              {msg.refs && msg.refs.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                  {msg.refs.map(r => (
                    <View key={r} style={{ backgroundColor: C.blueSub, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: C.blue }}>{r}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Where the number came from, and what is still unchecked about
                  it. A computed answer and a generated one must not look the
                  same on screen — and an answer read off a table nobody has
                  verified against print has to say so where the user is, not
                  only in a document. */}
              {Array.isArray(msg.warnings) && msg.warnings.length > 0 && (
                <View style={{ backgroundColor: C.amberBg, borderRadius: 8, padding: 10, marginTop: 10, borderLeftWidth: 2, borderLeftColor: C.amber }}>
                  {msg.warnings.map((w, i) => (
                    <Text key={i} style={{ fontSize: 11, color: C.text, lineHeight: 16, marginTop: i ? 6 : 0 }}>{w}</Text>
                  ))}
                </View>
              )}

              {msg.showVerifyPrompt && (
                <Text style={{ fontSize: 10.5, color: C.textTert, lineHeight: 15, marginTop: 8 }}>
                  Written by SparkAI rather than calculated. Verify before relying on it.
                </Text>
              )}

              {/* Field note */}
              {!!msg.fieldNote && (
                <View style={{ backgroundColor: C.inputBg, borderRadius: 8, padding: 10, marginTop: 10, borderLeftWidth: 2, borderLeftColor: C.amber }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: C.amber, marginBottom: 3 }}>💡 FIELD NOTE</Text>
                  <Text style={{ fontSize: 12, color: C.text, lineHeight: 18 }}>{msg.fieldNote}</Text>
                </View>
              )}

              {/* Disclaimer */}
              {!!msg.disclaimer && (
                <Text style={{ fontSize: 10, color: C.textTert, marginTop: 8, lineHeight: 14 }}>⚠️ {msg.disclaimer}</Text>
              )}
            </View>

            {/* Calculator shortcut */}
            {!!msg.calcTab && (
              <TouchableOpacity onPress={() => setTab(msg.calcTab)} activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.blueSub, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginTop: 8, alignSelf: 'flex-start' }}>
                <Ionicons name="calculator" size={13} color={C.blue} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.blue }}>
                  Open {msg.calcTab === 'boxfill' ? 'Box Fill' : msg.calcTab === 'conduitfill' ? 'Conduit Fill' : msg.calcTab === 'volt' ? 'Voltage Drop' : 'Calculator'} →
                </Text>
              </TouchableOpacity>
            )}

            {/* Rate limit CTAs */}
            {msg.isRateLimit && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity onPress={() => (onUpgrade ? onUpgrade() : setTab('settings'))}
                  style={{ flex: 1, backgroundColor: C.blue, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>⚡ Go Pro</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => (onBuyPacks ? onBuyPacks() : setTab('settings'))}
                  style={{ flex: 1, backgroundColor: C.amberBg, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.amber }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.amber }}>Buy Pack</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Listen + share */}
            {!msg.isError && !msg.isRateLimit && (
              <View style={{ flexDirection: 'row', alignSelf: 'flex-end', gap: 4, marginTop: 6 }}>
                <TouchableOpacity
                  onPress={() => speak(msg.text)}
                  onLongPress={stopSpeaking}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Read this answer aloud. Long press to stop."
                  style={{ padding: 4 }}>
                  <Ionicons name="volume-medium-outline" size={15} color={C.textTert} />
                </TouchableOpacity>
                <TouchableOpacity onPress={async () => {
                  const txt = `⚡ SparkAI\n\n${msg.text}${msg.refs?.length ? '\n\nSources: ' + msg.refs.join(', ') : ''}\n\n— SparkConnect Tools`;
                  try { await Share.share({ message: txt }); } catch(e) { safeLog('share', e); }
                }} accessibilityRole="button" accessibilityLabel="Share this answer" style={{ padding: 4 }}>
                  <Ionicons name="share-outline" size={15} color={C.textTert} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }, [C, setTab, speak, stopSpeaking]);

  const EXAMPLES = [
    'Do bathroom outlets need GFCI?',
    'Price for 200A service upgrade materials',
    'Voltage drop — 20A, 150ft, #12 wire',
    'How many wires fit in ¾" EMT?',
    'EV charger circuit sizing 50A',
    'GFCI vs AFCI — when to use each?',
    'Rough estimate — 2,000 sq ft new construction',
    'What THHN wire costs per foot?',
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingBottom: kbLift }}>

      {/* ── Top bar ── */}
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="flash" size={14} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, letterSpacing: -0.2 }}>SparkAI</Text>
            {/* One line, not a paragraph. A returning electrician does not need
                the app to introduce itself on every launch. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
              <Text style={{ fontSize: 10.5, color: C.textTert }}>Your electrical copilot</Text>
              {isPro ? (
                <View style={{ backgroundColor: C.amberBg, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: C.amber }}>PRO</Text>
                </View>
              ) : null}
              {remainingQuestions !== null && !isPro ? (
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: remainingQuestions <= 1 ? C.warning : C.textTert }}>
                  · {remainingQuestions} answers left
                </Text>
              ) : null}
            </View>
          </View>
          {/* A recognisable history icon. The book icon read as "reference
              library" and opened a conversation list, which is a different
              thing entirely. */}
          <TouchableOpacity onPress={() => setShowHistory(h => !h)}
            accessibilityRole="button" accessibilityLabel="Conversation history"
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: showHistory ? C.blueSub : C.inputBg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="time-outline" size={17} color={showHistory ? C.blue : C.textSec} />
          </TouchableOpacity>
          {messages.length > 0 && (
            <TouchableOpacity onPress={startNewConversation}
              accessibilityRole="button" accessibilityLabel="Start a new conversation"
              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={18} color={C.textSec} />
            </TouchableOpacity>
          )}
        </View>
        {/* ── Sparky Modes horizontal selector ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderTopWidth: 1, borderTopColor: C.borderLight }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 7, gap: 6, flexDirection: 'row' }}>
          {SPARKY_MODES.map(mode => (
            <TouchableOpacity key={mode.id} onPress={() => setActiveMode(mode.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: activeMode === mode.id ? C.amber : C.inputBg, borderWidth: 1, borderColor: activeMode === mode.id ? C.amber : C.border }}>
              <Ionicons name={mode.icon} size={12} color={activeMode === mode.id ? '#1A1408' : C.textSec} />
              <Text style={{ fontSize: 11.5, fontWeight: activeMode === mode.id ? '800' : '600', color: activeMode === mode.id ? '#1A1408' : C.textSec }}>{mode.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── History ─────────────────────────────────────────────────────
          Saved AI work was disappearing into individual chat sessions. Grouped
          by when somebody would look for it — nobody remembers asking about
          GFCI at 11:32, they remember it was this morning. */}
      {showHistory && (
        <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, maxHeight: 300 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12 }} showsVerticalScrollIndicator={false}>
            {historyGroups(convos.map(c => ({ ...c, updatedAt: new Date(c.ts).toISOString() }))).length === 0 ? (
              <Text style={{ fontSize: 12.5, color: C.textTert, lineHeight: 19 }}>
                Nothing yet. Answers you get are kept here so they stop disappearing into
                one-off chats.
              </Text>
            ) : historyGroups(convos.map(c => ({ ...c, updatedAt: new Date(c.ts).toISOString() }))).map((g) => (
              <View key={g.label} style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: C.textTert, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 7 }}>
                  {g.label}
                </Text>
                {g.items.map((c) => (
                  <TouchableOpacity key={c.id} onPress={() => { setShowHistory(false); openConversation(c); }} activeOpacity={0.85}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg, borderRadius: 11, borderWidth: 1, borderColor: C.border, padding: 11, marginBottom: 7 }}>
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color={C.amber} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '600', color: C.text }}>{c.title}</Text>
                      <Text style={{ fontSize: 10.5, color: C.textTert, marginTop: 1 }}>{c.count} messages</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteConversation(c.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button" accessibilityLabel="Delete conversation">
                      <Ionicons name="trash-outline" size={14} color={C.textTert} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Messages ── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Empty state */}
        {/* ── The mode's own home ────────────────────────────────────────
            This used to be a large card in which SparkAI explained what it was,
            every time, followed by an identical empty box whichever mode was
            selected. The middle of the screen now belongs to the mode: the
            question it is for, and the ways into it. That is what makes the
            four chips specialised tools rather than filters. */}
        {messages.length === 0 && !loading && (
          <View>
            <View style={{ backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.amber, marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.3 }}>{modeHome.headline}</Text>
              <Text style={{ fontSize: 12.5, color: C.textSec, lineHeight: 18, marginTop: 5 }}>{modeHome.sub}</Text>
            </View>

            {/* Troubleshooting starts from a photo as often as from words. */}
            {modeHome.photoAction ? (
              <TouchableOpacity onPress={() => pickImg(true)} activeOpacity={0.85}
                accessibilityRole="button" accessibilityLabel={modeHome.photoAction.label}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.blueSub, borderWidth: 1.5, borderColor: C.blue, borderRadius: 13, paddingVertical: 14, marginBottom: 16 }}>
                <Ionicons name={modeHome.photoAction.icon} size={17} color={C.blue} />
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.blue }}>{modeHome.photoAction.label}</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={{ fontSize: 10, fontWeight: '800', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 9 }}>
              {modeHome.id === 'troubleshoot' ? 'Common issues' : modeHome.id === 'general' ? 'Try asking' : 'What do you need?'}
            </Text>
            {modeHome.entries.map((e) => (
              <TouchableOpacity key={e.id} activeOpacity={0.8}
                onPress={() => {
                  if (e.needsPhoto) { pickImg(false); return; }
                  if (e.ask) { setInputText(e.ask); return; }
                  if (e.tab && setTab) { setTab(e.tab); }
                }}
                accessibilityRole="button" accessibilityLabel={e.label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 13, marginBottom: 8 }}>
                <Ionicons name={e.icon} size={18} color={C.amber} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{e.label}</Text>
                  {e.sub ? <Text style={{ fontSize: 11, color: C.textTert, marginTop: 2, lineHeight: 15 }}>{e.sub}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.textTert} />
              </TouchableOpacity>
            ))}

            {modeHome.topics ? (
              <>
                <Text style={{ fontSize: 10, fontWeight: '800', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 9 }}>
                  Popular topics
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {modeHome.topics.map((t) => (
                    <TouchableOpacity key={t} onPress={() => handleSend(t)} activeOpacity={0.75}
                      style={{ backgroundColor: C.inputBg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: C.border }}>
                      <Text style={{ fontSize: 11.5, color: C.textSec, fontWeight: '600' }}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        )}

        {/* Message list */}
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

        {/* Loading bubble */}
        {loading && (
          <View style={{ alignItems: 'flex-start', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="flash" size={15} color="#fff" />
              </View>
              <View style={{ backgroundColor: C.surface, borderRadius: 18, borderTopLeftRadius: 5, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.amber, paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ fontSize: 14, color: C.textSec }}>Thinking<Text style={{ color: C.amber }}>...</Text></Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Image preview bar ── */}
      {selectedImage && (
        <View style={{ backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="image" size={22} color={C.blue} />
          </View>
          <Text style={{ flex: 1, fontSize: 12, color: C.textSec, fontWeight: '500' }}>Photo ready — ask SparkAI about it ↓</Text>
          <TouchableOpacity onPress={() => setSelectedImage(null)}>
            <Ionicons name="close-circle" size={22} color={C.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Recording bar ── */}
      {isRecording && (
        <View style={{ backgroundColor: C.dangerBg, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.danger, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger }} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: C.danger }}>Recording {recordingTime}s — speak your question</Text>
          <TouchableOpacity onPress={stopRecording}
            style={{ backgroundColor: C.danger, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Stop & Send</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Input bar ── */}
      <View style={{ backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 10, paddingVertical: 8, paddingBottom: Platform.OS === 'ios' ? 6 : 8, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
        {/* Camera button */}
        <TouchableOpacity onPress={handleImagePress}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: selectedImage ? C.blueSub : C.inputBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name="camera-outline" size={18} color={selectedImage ? C.blue : C.textSec} />
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          ref={inputRef}
          style={{ flex: 1, backgroundColor: C.inputBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 9 : 7, fontSize: 14, color: C.inputText, borderWidth: 1.5, borderColor: C.inputBorder, maxHeight: 100, minHeight: 44 }}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask anything electrical..."
          placeholderTextColor={C.placeholder}
          multiline
          keyboardType="default"
          returnKeyType="default"
          maxLength={500}
        />

        {/* Mic button */}
        <TouchableOpacity onPress={isRecording ? stopRecording : startRecording}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isRecording ? C.danger : C.inputBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name={isRecording ? 'stop' : 'mic-outline'} size={18} color={isRecording ? '#fff' : C.textSec} />
        </TouchableOpacity>

        {/* Send button */}
        <TouchableOpacity onPress={() => handleSend()} disabled={(!inputText.trim() && !selectedImage) || loading}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: (inputText.trim() || selectedImage) && !loading ? C.blue : C.inputBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name="send" size={15} color={(inputText.trim() || selectedImage) && !loading ? '#fff' : C.textTert} />
        </TouchableOpacity>
      </View>
    </View>
  );
};


// ─── SETTINGS ────────────────────────────────────────────────────────────────

// ─── JOB CAM SCREEN ──────────────────────────────────────────────────────────
// Folder-based job site photo organizer. Projects stored in AsyncStorage.
// expo-image-picker + expo-sharing (loaded dynamically).
const JobCamScreen = ({ C, setTab }) => {
  // ── View state ─────────────────────────────────────────────────────────
  const [view, setView] = useState('projects');     // 'projects' | 'photos' | 'detail'
  const [projects, setProjects] = useState([]);     // [{ id, name, created }]
  const [photos, setPhotos] = useState([]);         // [{ id, projectId, uri, label, note, timestamp }]
  const [activeProject, setActiveProject] = useState(null);
  const [activePhoto, setActivePhoto] = useState(null);
  const [editNote, setEditNote] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [sharePromptId, setSharePromptId] = useState(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load from AsyncStorage
  React.useEffect(() => {
    Promise.all([
      safeStorageGet('@sc_cam_projects'),
      safeStorageGet('@sc_cam_photos'),
    ]).then(([projRaw, photoRaw]) => {
      try { if (projRaw) setProjects(JSON.parse(projRaw)); } catch {}
      try { if (photoRaw) setPhotos(JSON.parse(photoRaw)); } catch {}
      setLoaded(true);
    });
  }, []);

  const saveProjects = async (next) => {
    setProjects(next);
    await safeStorageSet('@sc_cam_projects', JSON.stringify(next));
  };
  const savePhotos = async (next) => {
    setPhotos(next);
    await safeStorageSet('@sc_cam_photos', JSON.stringify(next.slice(-200))); // cap at 200 entries
  };

  const createProject = async () => {
    const name = newProjectName.trim() || ('Job Site ' + (projects.length + 1));
    const proj = { id: Date.now().toString(), name, created: new Date().toLocaleDateString() };
    await saveProjects([proj, ...projects]);
    setNewProjectName(''); setShowNewProject(false);
    setActiveProject(proj); setView('photos');
  };

  const deleteProject = (id) => {
    Alert.alert('Delete Project', 'Delete this project and all its photos?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await saveProjects(projects.filter(p => p.id !== id));
        await savePhotos(photos.filter(ph => ph.projectId !== id));
        setView('projects'); setActiveProject(null);
      }},
    ]);
  };

  // Check if ImagePicker is truly functional (not just imported as empty module in Snack)
  const [_picker, setPickerMod] = React.useState(null);
  React.useEffect(() => {
    _loadImagePicker().then(mod => setPickerMod(mod || false));
  }, []);
  const isPickerAvailable = _picker && typeof _picker.requestCameraPermissionsAsync === 'function';

  const addDemoPhoto = async (label = 'Demo Job Site Photo') => {
    // Adds a placeholder photo for testing in Snack/preview environment
    const demoPhoto = {
      id: Date.now().toString(),
      projectId: activeProject.id,
      uri: '__demo__',  // sentinel for demo mode rendering
      label,
      note: 'Demo photo — tap to add notes and tags. Real photos work in the SparkConnect app on your device.',
      timestamp: new Date().toLocaleString(),
      tag: 'General',
    };
    await savePhotos([demoPhoto, ...photos]);
    setSharePromptId(demoPhoto.id);
  };

  const pickOrCapture = async (fromCamera) => {
    if (!activeProject) { Alert.alert('Select Project', 'Choose or create a job site project first.'); return; }

    // ── Snack / preview environment — offer demo mode ──
    if (!isPickerAvailable) {
      Alert.alert(
        'Camera works on device',
        'Job Cam photos work in the full SparkConnect app.\n\n• Download from App Store / TestFlight\n• Or scan the QR code with Expo Go\n\nWant to add a demo photo to test notes and tags?',
        [
          { text: 'Add Demo Photo', onPress: () => addDemoPhoto(fromCamera ? 'Demo Camera Photo' : 'Demo Library Photo') },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }

    // ── Real device — use actual camera/gallery ──
    try {
      if (fromCamera) {
        const { status } = await _picker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Camera Permission Needed', 'Open Settings → SparkConnect → Camera → Enable.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings?.() },
          ]);
          return;
        }
        const result = await _picker.launchCameraAsync({ quality: 0.85, allowsEditing: false });
        if (!result.canceled && result.assets?.[0]?.uri) {
          const newPhoto = { id: Date.now().toString(), projectId: activeProject.id, uri: result.assets[0].uri, label: 'Job Site Photo', note: '', timestamp: new Date().toLocaleString(), tag: 'General' };
          await savePhotos([newPhoto, ...photos]);
          setSharePromptId(newPhoto.id);
        }
      } else {
        const { status } = await _picker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Photo Library Permission Needed', 'Open Settings → SparkConnect → Photos → Enable.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings?.() },
          ]);
          return;
        }
        const result = await _picker.launchImageLibraryAsync({
          quality: 0.85, allowsEditing: false, allowsMultipleSelection: true,
        });
        if (!result.canceled && result.assets?.length > 0) {
          const newPhotos = result.assets.map((a, idx) => ({
            id: `${Date.now()}_${idx}`, projectId: activeProject.id,
            uri: a.uri, label: 'Photo from Library',
            note: '', timestamp: new Date().toLocaleString(), tag: 'General',
          }));
          await savePhotos([...newPhotos, ...photos]);
          setSharePromptId(newPhotos[0].id);
        }
      }
    } catch(e) {
      safeLog('JobCam.pick', 'Image picker error');
      Alert.alert('Photo Error', 'Could not access photos. Try: Settings → SparkConnect → grant camera/photos permission.');
    }
  };
  // ^ These two closers are the fix for the launch crash that killed builds
  // 6-13. The Snack export dropped them, so this catch block swallowed the
  // next ~1,400 lines: handleShare, this screen's JSX, and then every
  // component through SplashScreen ended up function-scoped inside
  // pickOrCapture instead of at module top level. The file still parsed,
  // because two stray closers at the bottom balanced the braces - so every
  // build compiled, exported, and then died on the phone the moment App()
  // rendered <SplashScreen/>: ReferenceError, Property 'SplashScreen'
  // doesn't exist. tests/scope.test.js now fails the suite if any screen
  // component ever leaves module scope again.

  const handleShare = async (photo, caption) => {
    const shareCaption = caption || photo.note || photo.label;
    try {
      // Try expo-sharing for file-based share (passes actual image to social apps)
      const ES = await _loadSharing();
      if (ES && await ES.isAvailableAsync()) {
        await ES.shareAsync(photo.uri, { mimeType: 'image/jpeg', dialogTitle: shareCaption, UTI: 'public.jpeg' });
      } else {
        // Fallback to React Native Share (text only — image sharing limited)
        await Share.share({ message: shareCaption + '\n\n⚡ SparkConnect Tools — Electrician Field App', url: photo.uri });
      }
    } catch(e) {
      safeLog('JobCam.share', 'Share error (URI not logged)');
    }
  };

  const deletePhoto = (id) => {
    Alert.alert('Delete Photo', 'Remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const next = photos.filter(p => p.id !== id);
        await savePhotos(next);
        if (activePhoto?.id === id) { setActivePhoto(null); setView('photos'); }
      }},
    ]);
  };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (activePhoto) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* Full-size photo */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: '100%', aspectRatio: 4/3, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#555', fontSize: 12 }}>Photo preview: {activePhoto.uri.slice(-40)}</Text>
          </View>
        </View>
        {/* Controls */}
        <View style={{ backgroundColor: C.surface, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => { setActivePhoto(null); setView('photos'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="arrow-back" size={18} color={C.blue} />
              <Text style={{ fontSize: 13, color: C.blue, fontWeight: '600' }}>Back to {activeProject?.name || 'Photos'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deletePhoto(activePhoto.id)}>
              <Ionicons name="trash-outline" size={20} color={C.danger} />
            </TouchableOpacity>
          </View>
          {/* Photo Tag Selector */}
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Tag</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['General','Rough-in','Panel','Before','After','Issue','Inspection','Material'].map(tag => (
                  <TouchableOpacity key={tag} onPress={async () => {
                    const updated = photos.map(p => p.id === activePhoto.id ? {...p, tag} : p);
                    await savePhotos(updated);
                    setActivePhoto(prev => ({...prev, tag}));
                  }} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: (activePhoto.tag || 'General') === tag ? C.blue : C.inputBg, borderWidth: 1, borderColor: (activePhoto.tag || 'General') === tag ? C.blue : C.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: (activePhoto.tag || 'General') === tag ? '#fff' : C.textSec }}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
          {editingId === activePhoto.id
            ? <View>
                <TextInput value={editNote} onChangeText={setEditNote} placeholder="Add a note..." placeholderTextColor={C.placeholder}
                  style={{ backgroundColor: C.inputBg, borderRadius: 8, padding: 10, color: C.inputText, fontSize: 13, borderWidth: 1, borderColor: C.border, marginBottom: 8 }}
                  multiline maxLength={200} />
                <TouchableOpacity onPress={async () => {
                  const updated = photos.map(p => p.id === activePhoto.id ? {...p, note: editNote} : p);
                  await savePhotos(updated);
                  setActivePhoto(prev => ({...prev, note: editNote}));
                  setEditingId(null);
                }} style={{ backgroundColor: C.blue, borderRadius: 8, padding: 10, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Save Note</Text>
                </TouchableOpacity>
              </View>
            : <TouchableOpacity onPress={() => { setEditNote(activePhoto.note || ''); setEditingId(activePhoto.id); }}
                style={{ backgroundColor: C.inputBg, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ color: activePhoto.note ? C.text : C.placeholder, fontSize: 13 }}>
                  {activePhoto.note || 'Tap to add a note...'}
                </Text>
              </TouchableOpacity>}
          <Text style={{ fontSize: 10, color: C.textTert }}>{activePhoto.timestamp}</Text>
          {/* Share options */}
          <TouchableOpacity onPress={() => {
            Alert.alert('Share Photo', 'Your native share sheet will open — you can post to Instagram, TikTok, X, or save to your camera roll.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Share', onPress: () => handleShare(activePhoto) },
            ]);
          }} style={{ backgroundColor: C.blue, borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="share-social-outline" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Share to Instagram / TikTok / X / Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Project list view ───────────────────────────────────────────────────
  if (view === 'projects') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {/* New project input */}
        {showNewProject
          ? <View style={{ backgroundColor: C.surface, padding: 14, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', gap: 8 }}>
              <TextInput value={newProjectName} onChangeText={setNewProjectName} placeholder="Job site name (e.g. 123 Main St)"
                placeholderTextColor={C.placeholder} style={{ flex: 1, backgroundColor: C.inputBg, borderRadius: 8, padding: 10, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.border }}
                autoFocus returnKeyType="done" onSubmitEditing={createProject} maxLength={60} />
              <TouchableOpacity onPress={createProject} style={{ backgroundColor: C.blue, borderRadius: 8, padding: 10, justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Create</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowNewProject(false)} style={{ padding: 10, justifyContent: 'center' }}>
                <Ionicons name="close" size={20} color={C.textSec} />
              </TouchableOpacity>
            </View>
          : <TouchableOpacity onPress={() => setShowNewProject(true)}
              style={{ backgroundColor: C.blue, margin: 14, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="folder-open" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>+ New Job Site Folder</Text>
            </TouchableOpacity>}
        {projects.length === 0
          ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <Ionicons name="folder-open-outline" size={48} color={C.textTert} style={{ marginBottom: 12 }} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 }}>No Job Site Folders</Text>
              <Text style={{ fontSize: 13, color: C.textSec, textAlign: 'center', lineHeight: 20 }}>
                Create a folder for each job site. Keep rough-in photos, panel photos, and notes organized by location.
              </Text>
            </View>
          : <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 0 }} showsVerticalScrollIndicator={false}>
              {projects.map(proj => {
                const projPhotos = photos.filter(ph => ph.projectId === proj.id);
                return (
                  <TouchableOpacity key={proj.id} onPress={() => { setActiveProject(proj); setView('photos'); }} activeOpacity={0.85}
                    style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="folder" size={24} color={C.blue} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 }}>{proj.name}</Text>
                      <Text style={{ fontSize: 11, color: C.textSec }}>{projPhotos.length} photo{projPhotos.length !== 1 ? 's' : ''} · Created {proj.created}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity onPress={() => deleteProject(proj.id)} style={{ padding: 6 }}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                      </TouchableOpacity>
                      <Ionicons name="chevron-forward" size={18} color={C.textTert} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>}
        <View style={{ padding: 10, borderTopWidth: 1, borderTopColor: C.border }}>
          <Text style={{ fontSize: 10, color: C.textTert, textAlign: 'center' }}>Photos stored locally. SparkConnect does not upload your photos.</Text>
        </View>
      </View>
    );
  }

  // ── Photo detail view ─────────────────────────────────────────────────────
  if (view === 'detail' && activePhoto) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: '100%', aspectRatio: 4/3, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="image-outline" size={48} color="#64748B" />
            <Text style={{ color: '#555', fontSize: 12, marginTop: 6 }}>{activePhoto.label}</Text>
          </View>
        </View>
        <View style={{ backgroundColor: C.surface, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => { setActivePhoto(null); setView('photos'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="arrow-back" size={18} color={C.blue} />
              <Text style={{ fontSize: 13, color: C.blue, fontWeight: '600' }}>Back to {activeProject?.name || 'Photos'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deletePhoto(activePhoto.id)}>
              <Ionicons name="trash-outline" size={20} color={C.danger} />
            </TouchableOpacity>
          </View>
          {editingId === activePhoto.id
            ? <View>
                <TextInput value={editNote} onChangeText={setEditNote} placeholder="Add a note..." placeholderTextColor={C.placeholder}
                  style={{ backgroundColor: C.inputBg, borderRadius: 8, padding: 10, color: C.inputText, fontSize: 13, borderWidth: 1, borderColor: C.border, marginBottom: 8 }}
                  multiline maxLength={200} />
                <TouchableOpacity onPress={async () => {
                  const updated = photos.map(p => p.id === activePhoto.id ? {...p, note: editNote} : p);
                  await savePhotos(updated);
                  setActivePhoto(prev => ({...prev, note: editNote}));
                  setEditingId(null);
                }} style={{ backgroundColor: C.blue, borderRadius: 8, padding: 10, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Save Note</Text>
                </TouchableOpacity>
              </View>
            : <TouchableOpacity onPress={() => { setEditNote(activePhoto.note || ''); setEditingId(activePhoto.id); }}
                style={{ backgroundColor: C.inputBg, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ color: activePhoto.note ? C.text : C.placeholder, fontSize: 13 }}>{activePhoto.note || 'Tap to add a note...'}</Text>
              </TouchableOpacity>}
          <Text style={{ fontSize: 10, color: C.textTert }}>{activePhoto.timestamp}</Text>
          <TouchableOpacity onPress={() => handleShare(activePhoto)}
            style={{ backgroundColor: C.blue, borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="share-social-outline" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Share to Instagram / TikTok / X / Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Grid / main view (photos in active project) ────────────────────────────
  const projectPhotos = photos.filter(ph => ph.projectId === activeProject?.id);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Share prompt after capture */}
      {sharePromptId && (() => {
        const p = projectPhotos.find(ph => ph.id === sharePromptId);
        return p ? (
          <View style={{ backgroundColor: C.blue, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={{ flex: 1, color: '#fff', fontSize: 12, fontWeight: '600' }}>Photo saved! Share to Instagram, TikTok, or X?</Text>
            <TouchableOpacity onPress={() => { handleShare(p); setSharePromptId(null); }}
              style={{ backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSharePromptId(null)}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        ) : null;
      })()}

      {/* Project header + action buttons */}
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity onPress={() => { setActiveProject(null); setView('projects'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="arrow-back" size={18} color={C.blue} />
          <Text style={{ fontSize: 13, color: C.blue, fontWeight: '600' }}>All Sites</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.text, textAlign: 'center' }} numberOfLines={1}>{activeProject?.name}</Text>
        <Text style={{ fontSize: 11, color: C.textTert }}>{projectPhotos.length} photo{projectPhotos.length !== 1 ? 's' : ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, padding: 14 }}>
        <TouchableOpacity onPress={() => pickOrCapture(true)} activeOpacity={0.85}
          style={{ flex: 1, backgroundColor: C.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => pickOrCapture(false)} activeOpacity={0.85}
          style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: C.border }}>
          <Ionicons name="images-outline" size={20} color={C.blue} />
          <Text style={{ color: C.blue, fontWeight: '700', fontSize: 14 }}>From Gallery</Text>
        </TouchableOpacity>
      </View>

      {projectPhotos.length === 0
        ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <View style={{ width: 80, height: 80, borderRadius: 20, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="camera-outline" size={36} color={C.textTert} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 }}>No Job Site Photos</Text>
            <Text style={{ fontSize: 13, color: C.textSec, textAlign: 'center', lineHeight: 20 }}>Take photos of your job site, panel layouts, or rough-in work. Tap any photo to add notes or share to social media.</Text>
          </View>
        : <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 0, gap: 10 }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 12, color: C.textTert, marginBottom: 4 }}>{projectPhotos.length} photo{projectPhotos.length !== 1 ? 's' : ''} · Tap to view or share</Text>
            {projectPhotos.map(photo => (
              <TouchableOpacity key={photo.id} onPress={() => { setActivePhoto(photo); setView('detail'); }} activeOpacity={0.85}
                style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
                <View style={{ height: 160, backgroundColor: photo.uri === '__demo__' ? '#1A2744' : '#1E293B', alignItems: 'center', justifyContent: 'center', borderWidth: photo.uri === '__demo__' ? 1 : 0, borderColor: 'rgba(244,161,29,0.3)', borderStyle: 'dashed' }}>
                  <Ionicons name={photo.uri === '__demo__' ? 'image-outline' : 'image-outline'} size={40} color={photo.uri === '__demo__' ? '#F4A11D' : '#64748B'} />
                  <Text style={{ color: photo.uri === '__demo__' ? '#F4A11D' : '#64748B', fontSize: 11, marginTop: 4, fontWeight: photo.uri === '__demo__' ? '600' : '400' }}>{photo.uri === '__demo__' ? '📷 Demo Photo' : 'Tap to preview'}</Text>
                </View>
                <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>{photo.label}</Text>
                    {photo.note ? <Text style={{ fontSize: 11, color: C.textSec, marginTop: 2 }} numberOfLines={1}>{photo.note}</Text> : null}
                    <Text style={{ fontSize: 10, color: C.textTert, marginTop: 2 }}>{photo.timestamp}</Text>
                  </View>
                  <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); handleShare(photo); }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center', marginLeft: 10 }}>
                    <Ionicons name="share-outline" size={16} color={C.blue} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>}

      {/* Privacy note */}
      <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.border }}>
        <Text style={{ fontSize: 10, color: C.textTert, textAlign: 'center', lineHeight: 15 }}>
          Photos are stored locally on your device. SparkConnect does not upload or store your photos.
        </Text>
      </View>
    </View>
  );
};

// ─── DISCLAIMER FOOTER ────────────────────────────────────────────────────────
const DisclaimerFooter = ({ C }) => (
  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.borderLight }}>
    <Ionicons name="information-circle-outline" size={13} color={C.textTert} />
    <Text style={{ flex: 1, fontSize: 10, color: C.textTert, lineHeight: 15 }}>
      Reference tool only. NEC article numbers are cited for reference. Always verify with your adopted NEC edition (NFPA 70), local AHJ, manufacturer instructions, and qualified supervision before installation.
    </Text>
  </View>
);

// ─── FIRST-RUN ACKNOWLEDGMENT ─────────────────────────────────────────────────
// The disclaimer-only onboarding that used to live here has been removed.
// It was what actually rendered at launch, while src/OnboardingFlow.js sat
// imported and unreachable — so the role it collected was never written and
// every user ran the default Home layout. There is now one onboarding, and
// it is the one that gets rendered.

// ─── TERMS OF SERVICE ─────────────────────────────────────────────────────────
// ─── TERMS AND PRIVACY ────────────────────────────────────────────────────────
// Rendered from src/core/legal/policy.js, which is the ONE copy. Both documents
// used to be hardcoded here and a second, different pair lived on the website —
// they disagreed about whether SparkAI questions reach a third-party AI service,
// which is the most consequential sentence either document contains.

const LegalScreen = ({ C, onBack, doc }) => (
  <View style={{ flex: 1, backgroundColor: C.bg }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back"
        style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="arrow-back" size={18} color={C.blue} />
      </TouchableOpacity>
      <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>{doc.title}</Text>
    </View>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 11, color: C.textTert, marginBottom: 16 }}>Last updated {EFFECTIVE_DATE}</Text>

      <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 22 }}>
        <Text style={{ fontSize: 13.5, color: C.text, lineHeight: 20 }}>{doc.summary}</Text>
      </View>

      {doc.sections.map((s) => (
        <View key={s.title} style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 6 }}>{s.title}</Text>
          <Text style={{ fontSize: 13, color: C.textSec, lineHeight: 20 }}>{s.body}</Text>
        </View>
      ))}

      <Text style={{ fontSize: 11, color: C.textTert, marginTop: 8 }}>Questions? {CONTACT_EMAIL}</Text>
    </ScrollView>
  </View>
);

const TermsScreen = ({ C, onBack }) => <LegalScreen C={C} onBack={onBack} doc={DOCUMENTS.terms} />;
const PrivacyScreen = ({ C, onBack }) => <LegalScreen C={C} onBack={onBack} doc={DOCUMENTS.privacy} />;


// ─── SAFETY & COMPLIANCE ──────────────────────────────────────────────────────
const SafetyScreen = ({ C, onBack }) => {
  const Sec = ({ title, body }) => (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 6 }}>{title}</Text>
      <Text style={{ fontSize: 13, color: C.textSec, lineHeight: 20 }}>{body}</Text>
    </View>
  );
  const Bullet = ({ text }) => (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.blue, marginTop: 7, flexShrink: 0 }} />
      <Text style={{ flex: 1, fontSize: 13, color: C.textSec, lineHeight: 20 }}>{text}</Text>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={onBack} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={18} color={C.blue} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Safety & Compliance</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

        {/* Banner */}
        <View style={{ backgroundColor: C.warningBg, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: C.warning, padding: 14, marginBottom: 24 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.warning, marginBottom: 4 }}>⚡ Reference Tool Only</Text>
          <Text style={{ fontSize: 12, color: C.text, lineHeight: 18 }}>
            SparkConnect Tools provides reference calculations and NEC information for field planning. All outputs must be verified by a qualified electrician before installation.
          </Text>
        </View>

        <Sec title="Electrical Safety Requirements"
          body="Electrical work must be performed by qualified persons in accordance with all applicable codes, standards, and regulations. Improper electrical work can result in fire, electrocution, serious injury, or death." />

        <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 10 }}>Minimum safety requirements include:</Text>
        <Bullet text="Work only on de-energized circuits with proper lockout/tagout (LOTO) procedures per OSHA 29 CFR 1910.147" />
        <Bullet text="Test with a calibrated meter before touching any conductor" />
        <Bullet text="Use appropriate PPE including arc flash protection rated for the hazard level" />
        <Bullet text="Follow NFPA 70E for electrical safety in the workplace" />
        <Bullet text="Maintain required working clearances per NEC 110.26" />
        <Bullet text="Use listed and labeled equipment appropriate for the application" />

        <View style={{ height: 1, backgroundColor: C.border, marginVertical: 20 }} />

        <Sec title="NEC Code Compliance"
          body="SparkConnect references the National Electrical Code (NFPA 70). The NEC is adopted at the state and local level — requirements vary by jurisdiction. Always verify which edition of the NEC has been adopted locally." />

        <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 10 }}>Before installation, verify:</Text>
        <Bullet text="Which NEC edition is locally adopted (2017, 2020, or 2023)" />
        <Bullet text="Local amendments and additions made by your AHJ" />
        <Bullet text="Any state or municipal electrical codes that apply" />
        <Bullet text="Utility company requirements for service entrance work" />
        <Bullet text="OSHA requirements for commercial and industrial work" />

        <View style={{ height: 1, backgroundColor: C.border, marginVertical: 20 }} />

        <Sec title="Permits and Inspections"
          body="Most electrical work requires a permit and inspection by the Authority Having Jurisdiction (AHJ). Unpermitted work may be required to be removed, can affect insurance coverage, and may create liability. This app does not determine permit requirements." />

        <View style={{ height: 1, backgroundColor: C.border, marginVertical: 20 }} />

        <Sec title="Calculator Accuracy"
          body="All calculations in SparkConnect Tools are based on standard NEC methods and reference data. Results are starting points for field planning — they do not account for all conditions, derating factors, or site-specific variables." />

        <View style={{ height: 1, backgroundColor: C.border, marginVertical: 20 }} />

        <Sec title="SparkAI & NEC References"
          body="SparkAI provides general electrical code guidance for reference and educational purposes. All NEC article numbers are cited for reference only. SparkConnect Tools does not reproduce NEC code text verbatim. Always verify code requirements with your currently adopted NEC edition (NFPA 70), your local AHJ, and qualified supervision. NEC is a registered trademark of the National Fire Protection Association (NFPA)." />

        <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 10 }}>Always independently verify:</Text>
        <Bullet text="Voltage drop — accounts for resistive losses only; inductive reactance may apply at larger sizes" />
        <Bullet text="Ampacity — derating for ambient temperature (NEC 310.15(B)(2)) and conduit fill (NEC 310.15(C)) may apply" />
        <Bullet text="Box fill — verify with actual NEC 314.16(B) table for your adopted edition" />
        <Bullet text="Conduit fill — reference data is approximate; verify with NEC Chapter 9 Tables 4 & 5" />
        <Bullet text="Pipe bending — take-up values vary by bender manufacturer and conduit lot" />

        <View style={{ height: 1, backgroundColor: C.border, marginVertical: 20 }} />

        <Sec title="Limitation of Liability"
          body="SparkConnect and its developers are not liable for any damages, code violations, injuries, or losses resulting from use of this application. See Terms of Service for full details." />

        <View style={{ backgroundColor: C.inputBg, borderRadius: 10, padding: 14, marginTop: 8 }}>
          <Text style={{ fontSize: 11, color: C.textTert, lineHeight: 17, textAlign: 'center' }}>
            {'For emergencies, call 911.\nFor OSHA resources: osha.gov\nFor NEC: nfpa.org/70\nQuestions: support@sparkconnect.pro'}
          </Text>
        </View>

      </ScrollView>
    </View>
  );
};


// ─── CALCULATORS HUB SCREEN ─────────────────────────────────────────────────
const KEY_CALC_FAVS = '@sc_calc_favs';
const KEY_CALC_RECENTS = '@sc_calc_recents';

const CalculatorsScreen = ({ setTab, C }) => {
  const tools = [
    { icon: 'git-branch',        title: 'Pipe Bending',      sub: '90° · 45° · Offsets · Saddles',        tab: 'bend',        color: C.blue,   bg: C.blueSub },
    { icon: 'flash',             title: 'Voltage Drop',       sub: 'NEC 210.19(A) · wire recommender',     tab: 'volt',        color: C.purple, bg: C.purpleBg },
    { icon: 'cube-outline',      title: 'Box Fill',           sub: 'NEC 314.16 — required cubic inches',   tab: 'boxfill',     color: C.teal,   bg: C.tealBg },
    { icon: 'git-merge',         title: 'Conduit Fill',       sub: 'NEC Ch.9 — fill percentage check',     tab: 'conduitfill', color: C.purple, bg: C.purpleSub },
    { icon: 'speedometer-outline',title:'Ampacity Lookup',   sub: 'NEC 310.15 copper & aluminum tables',  tab: 'ampacity',    color: C.blue,   bg: C.blueSub },
    { icon: 'color-palette',     title: 'Wire Colors',        sub: 'Detail + 160-slot panel view',         tab: 'wire',        color: C.teal,   bg: C.tealBg },
    { icon: 'book-outline',      title: 'Formula Reference',  sub: "Ohm's Law · 3Φ · Motors · Transformers", tab:'formulas',  color: C.amber,  bg: C.amberBg },
    { icon: 'hammer-outline',    title: 'Material Estimator', sub: 'Rough quantity + SparkAI pricing',   tab: 'estimator',   color: C.green,  bg: C.greenBg },
  ];
  const [query, setQuery] = useState('');
  const [favs, setFavs] = useState([]);
  const [recents, setRecents] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const f = JSON.parse((await safeStorageGet(KEY_CALC_FAVS)) || '[]');
        const r = JSON.parse((await safeStorageGet(KEY_CALC_RECENTS)) || '[]');
        setFavs(Array.isArray(f) ? f.filter((id) => tools.some((t) => t.tab === id)) : []);
        setRecents(Array.isArray(r) ? r.filter((id) => tools.some((t) => t.tab === id)) : []);
      } catch (e) { safeLog('calcPrefs', e); }
    })();
  }, []);

  const toggleFav = async (tab) => {
    const next = favs.includes(tab) ? favs.filter((f) => f !== tab) : [...favs, tab];
    setFavs(next);
    await safeStorageSet(KEY_CALC_FAVS, JSON.stringify(next));
  };
  const open = async (tab) => {
    const next = [tab, ...recents.filter((r) => r !== tab)].slice(0, 4);
    setRecents(next);
    safeStorageSet(KEY_CALC_RECENTS, JSON.stringify(next)); // fire-and-forget; navigation should not wait on disk
    setTab(tab);
  };

  const q = query.trim().toLowerCase();
  const matches = q ? tools.filter((t) => (t.title + ' ' + t.sub).toLowerCase().includes(q)) : tools;
  // Favorites float to the top of the list; recents get their own strip.
  const ordered = [...matches].sort((a, b) => (favs.includes(b.tab) ? 1 : 0) - (favs.includes(a.tab) ? 1 : 0));
  const recentTools = recents.map((id) => tools.find((t) => t.tab === id)).filter(Boolean);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {/* Search */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, marginBottom: 14 }}>
        <Ionicons name="search" size={16} color={C.textTert} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search calculators…"
          placeholderTextColor={C.textTert}
          style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: C.text }}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search calculators"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={C.textTert} />
          </TouchableOpacity>
        )}
      </View>

      {/* Recents — only when not searching, only when they exist */}
      {!q && recentTools.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Recent</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {recentTools.map((t) => (
              <TouchableOpacity key={t.tab} onPress={() => open(t.tab)} activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Ionicons name={t.icon} size={14} color={t.color} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.text }}>{t.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <Text style={{ fontSize: 11, fontWeight: '700', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14 }}>All Calculators & Reference Tools</Text>
      {ordered.length === 0 && (
        <Text style={{ fontSize: 13, color: C.textSec, marginBottom: 10 }}>Nothing matches “{query.trim()}”. Try “bend”, “volt”, “fill”…</Text>
      )}
      {ordered.map(t => (
        <TouchableOpacity key={t.tab} onPress={() => open(t.tab)} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
          <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={t.icon} size={24} color={t.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 3 }}>{t.title}</Text>
            <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 16 }}>{t.sub}</Text>
          </View>
          <TouchableOpacity onPress={() => toggleFav(t.tab)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={favs.includes(t.tab) ? `Remove ${t.title} from favorites` : `Add ${t.title} to favorites`}>
            <Ionicons name={favs.includes(t.tab) ? 'star' : 'star-outline'} size={18} color={favs.includes(t.tab) ? C.amber : C.textTert} />
          </TouchableOpacity>
          <Ionicons name="chevron-forward" size={16} color={C.textTert} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={() => setTab('necai')}
        style={{ backgroundColor: '#0D1B3E', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, borderWidth: 1, borderColor: 'rgba(244,161,29,0.3)' }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="flash" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 }}>Ask SparkAI to explain any result</Text>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Every calculator has an "Explain with SparkAI" button</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
      </TouchableOpacity>
    </ScrollView>
  );
};

// ─── LEARN HUB SCREEN ────────────────────────────────────────────────────────
const LearnScreen = ({ setTab, C, onStreakUpdate }) => {
  const today = getDailyQuestion();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14 }}>Study & Practice</Text>

      {/* Code Quiz */}
      <TouchableOpacity onPress={() => setTab('examprep')} activeOpacity={0.85}
        style={{ backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: C.purpleBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="school" size={24} color={C.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 }}>Code Quiz</Text>
          <Text style={{ fontSize: 12, color: C.textSec }}>171 questions · 12 categories · Apprentice & Journeyman</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textTert} />
      </TouchableOpacity>

      {/*  */}
      <TouchableOpacity onPress={() => setTab('home')} activeOpacity={0.85}
        style={{ backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="calendar-outline" size={24} color={C.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 }}>Daily Code Question</Text>
          <Text style={{ fontSize: 12, color: C.textSec }}>Today: {today.category} · {today.difficulty}</Text>
          <Text style={{ fontSize: 11, color: C.textTert, marginTop: 2 }} numberOfLines={1}>{today.question}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textTert} />
      </TouchableOpacity>

      {/* NEC Reference (SparkAI browse) */}
      <TouchableOpacity onPress={() => setTab('necai')} activeOpacity={0.85}
        style={{ backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="book-outline" size={24} color={C.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 }}>NEC Reference</Text>
          <Text style={{ fontSize: 12, color: C.textSec }}>Tap the book icon in SparkAI to browse 20 NEC topics</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textTert} />
      </TouchableOpacity>

      {/* Formula Reference */}
      <TouchableOpacity onPress={() => setTab('formulas')} activeOpacity={0.85}
        style={{ backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: C.tealBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="calculator-outline" size={24} color={C.teal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 }}>Formula Reference</Text>
          <Text style={{ fontSize: 12, color: C.textSec }}>Ohm's Law, Power, 3Φ, Motors, Transformers, Bending</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textTert} />
      </TouchableOpacity>

      {/* UI-09 — was a greyed-out COMING SOON box, which reads as an abandoned
          product on the tab that is supposed to prove you teach. */}
      <TouchableOpacity onPress={() => setTab('wiringlab')} activeOpacity={0.85}
        style={{ backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: C.blue, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="git-network" size={21} color={C.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 }}>Wiring Simulator</Text>
          <Text style={{ fontSize: 12, color: C.textSec }}>Single-pole, three-way and four-way. Wire it, then test it.</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textTert} />
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setTab('troubleshoot')} activeOpacity={0.85}
        style={{ backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: C.amber, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="build" size={20} color={C.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 }}>Troubleshooting</Text>
          <Text style={{ fontSize: 12, color: C.textSec }}>Six real service calls. Find the fault.</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textTert} />
      </TouchableOpacity>
    </ScrollView>
  );
};

// ─── EXAM PREP SCREEN ────────────────────────────────────────────────────────
const ExamPrepScreen = ({ C, onStreakUpdate, isPro = IS_PRO }) => {
  const [level, setLevel]       = useState('All');
  const [category, setCategory] = useState('All');
  const [quizSize, setQuizSize] = useState(10);
  const [studyMode, setStudyMode] = useState(true);
  const [started, setStarted]   = useState(false);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [answers, setAnswers]   = useState([]);
  const [quizDone, setQuizDone] = useState(false);
  const [bestScore, setBestScore] = useState(null);
  const [reviewMode, setReviewMode] = useState(false); // review missed questions only
  const [missedQs, setMissedQs] = useState([]);

  // Load best score from storage
  React.useEffect(() => {
    safeStorageGet('@sc_exam_best').then(val => { if (val) setBestScore(parseInt(val, 10)); });
  }, []);

  const startQuiz = () => {
    const qs = getExamQuestions(level, category, quizSize);
    if (qs.length === 0) { Alert.alert('No Questions', 'No questions match your selections. Try a different combination.'); return; }
    setQuestions(qs); setCurrentIdx(0); setSelectedAnswer(null);
    setShowExplanation(false); setAnswers([]); setQuizDone(false); setStarted(true);
  };

  const resetToMenu = () => {
    setStarted(false); setQuizDone(false); setAnswers([]);
    setSelectedAnswer(null); setShowExplanation(false); setReviewMode(false);
  };

  const handleAnswer = (idx) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(idx);
    setAnswers(prev => [...prev, idx]);
    if (studyMode) setShowExplanation(true);
  };

  const nextQuestion = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(i => i + 1); setSelectedAnswer(null); setShowExplanation(false);
    } else {
      if (!studyMode) setShowExplanation(false);
      // Save missed questions for review mode
      const missed = questions.filter((q, i) => answers[i] !== q.correct);
      setMissedQs(missed.concat(currentIdx < questions.length - 1 ? [] : (selectedAnswer !== questions[currentIdx]?.correct ? [questions[currentIdx]] : [])));
      // Persist best score
      const finalScore = answers.filter((a, i) => a === questions[i]?.correct).length + (selectedAnswer === questions[currentIdx]?.correct ? 1 : 0);
      const finalPct = Math.round((finalScore / questions.length) * 100);
      safeStorageGet('@sc_exam_best').then(val => {
        const prev = val ? parseInt(val, 10) : 0;
        if (finalPct > prev) safeStorageSet('@sc_exam_best', String(finalPct));
      });
      // Update streak
      if (onStreakUpdate) onStreakUpdate();
      setQuizDone(true);
    }
  };

  const currentQ = questions[currentIdx];
  const score = answers.filter((a, i) => a === questions[i]?.correct).length;
  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  // ── MENU ──────────────────────────────────────────────────────────────────
  if (!started) {
    const allCats = ['All', ...EXAM_CATEGORIES];
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <Card C={C} style={{ marginBottom: 20, borderLeftWidth: 4, borderLeftColor: C.blue }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="school" size={22} color={C.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.text }}>Code Quiz</Text>
              <Text style={{ fontSize: 12, color: C.textSec }}>{EXAM_QUESTIONS.length} questions · {EXAM_CATEGORIES.length} categories</Text>
            </View>
          </View>
          <View style={{ backgroundColor: C.warningBg, borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: C.warning }}>
            <Text style={{ fontSize: 11, color: C.textSec, lineHeight: 17 }}>Study support only. Not a substitute for official licensing exam preparation. Always verify with instructor, current NEC, and local requirements.</Text>
          </View>
        </Card>

        <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Level</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {['All','Apprentice','Journeyman'].map(l => (
            <TouchableOpacity key={l} onPress={() => setLevel(l)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: level === l ? C.blue : C.surface, borderWidth: 1.5, borderColor: level === l ? C.blue : C.border }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: level === l ? '#fff' : C.textSec }}>{l}</Text>
              {l === 'Journeyman' && <Text style={{ fontSize: 9, color: level === l ? 'rgba(255,255,255,0.7)' : C.textTert, marginTop: 1 }}>Advanced</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {allCats.map(cat => (
              <Chip key={cat} label={cat} active={category === cat} onPress={() => setCategory(cat)} color={C.purple} C={C} />
            ))}
          </View>
        </ScrollView>

        <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Quiz Size</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {[10, 25, 50].map(n => {
            const avail = getExamQuestions(level, category, 999).length;
            const disabled = avail < n;
            return (
              <TouchableOpacity key={n} onPress={() => !disabled && setQuizSize(n)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: quizSize === n && !disabled ? C.purple : C.surface, borderWidth: 1.5, borderColor: quizSize === n && !disabled ? C.purple : C.border, opacity: disabled ? 0.4 : 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: quizSize === n && !disabled ? '#fff' : C.textSec }}>{n}</Text>
                <Text style={{ fontSize: 9, color: quizSize === n && !disabled ? 'rgba(255,255,255,0.7)' : C.textTert }}>questions</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Mode</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
          <TouchableOpacity onPress={() => setStudyMode(true)}
            style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: studyMode ? C.success : C.surface, borderWidth: 1.5, borderColor: studyMode ? C.success : C.border }}>
            <Ionicons name="book-outline" size={18} color={studyMode ? '#fff' : C.textSec} style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: studyMode ? '#fff' : C.textSec }}>Study</Text>
            <Text style={{ fontSize: 9, color: studyMode ? 'rgba(255,255,255,0.75)' : C.textTert }}>Answer shown immediately</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStudyMode(false)}
            style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: !studyMode ? C.amber : C.surface, borderWidth: 1.5, borderColor: !studyMode ? C.amber : C.border }}>
            <Ionicons name="timer-outline" size={18} color={!studyMode ? '#fff' : C.textSec} style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: !studyMode ? '#fff' : C.textSec }}>Test</Text>
            <Text style={{ fontSize: 9, color: !studyMode ? 'rgba(255,255,255,0.75)' : C.textTert }}>Score shown at end</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 11, color: C.textTert, textAlign: 'center', marginBottom: 16 }}>
          {getExamQuestions(level, category, 999).length} questions available for current selection
        </Text>

        <TouchableOpacity onPress={startQuiz}
          style={{ backgroundColor: C.blue, borderRadius: 14, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, shadowColor: C.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 5 }}>
          <Ionicons name="play" size={18} color="#fff" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Start Quiz</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10, marginTop: 24 }}>Categories</Text>
        <Card C={C} style={{ padding: 0, overflow: 'hidden' }}>
          {EXAM_CATEGORIES.map((cat, i) => (
            <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i < EXAM_CATEGORIES.length - 1 ? 1 : 0, borderBottomColor: C.borderLight }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.purple, marginRight: 10 }} />
              <Text style={{ flex: 1, fontSize: 13, color: C.text, fontWeight: '500' }}>{cat}</Text>
              <Text style={{ fontSize: 11, color: C.textTert }}>{EXAM_QUESTIONS.filter(q => q.cat === cat).length} Qs</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    );
  }

  // ── RESULTS ──────────────────────────────────────────────────────────────
  if (quizDone) {
    const gc = pct >= 90 ? C.success : pct >= 70 ? C.blue : pct >= 50 ? C.warning : C.danger;
    const gl = pct >= 90 ? 'Excellent! 🎉' : pct >= 70 ? 'Good Work 💪' : pct >= 50 ? 'Keep Studying 📖' : 'Needs Review 🔄';
    const missedCount = questions.filter((q, i) => answers[i] !== q.correct).length;
    const handleShareResult = async () => {
      const emoji = pct >= 90 ? '🏆' : pct >= 70 ? '⚡' : '📖';
      const msg = `${emoji} SparkConnect Code Quiz\n\nScore: ${pct}% (${score}/${questions.length})\nLevel: ${level} · ${category}\n\nStudying for my electrical license with SparkConnect Tools!\n#Electrician #ExamPrep #NEC`;
      try { await Share.share({ message: msg }); } catch(e) { safeLog('ShareResult', e); }
    };
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 48, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        {!isPro && (
        <TouchableOpacity onPress={() => {}} activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', padding: 12, backgroundColor: C.blueSub, borderRadius: 12, marginBottom: 16 }}>
          <Ionicons name="stats-chart" size={16} color={C.blue} />
          <Text style={{ fontSize: 13, color: C.blue, fontWeight: '600', flex: 1 }}>Track your progress over time → Pro</Text>
          <Ionicons name="lock-closed-outline" size={13} color={C.blue} />
        </TouchableOpacity>
      )}
      <View style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 6, borderColor: gc, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 12 }}>
          <Text style={{ fontSize: 36, fontWeight: '900', color: gc }}>{pct}%</Text>
          <Text style={{ fontSize: 13, color: C.textSec }}>{score}/{questions.length}</Text>
        </View>
        <Text style={{ fontSize: 24, fontWeight: '800', color: gc, marginBottom: 4, letterSpacing: -0.5 }}>{gl}</Text>
        <Text style={{ fontSize: 13, color: C.textSec, marginBottom: 12 }}>{level} · {category} · {studyMode ? 'Study' : 'Test'} Mode</Text>
        {bestScore !== null && <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 11, color: C.textTert }}>Personal best:</Text>
          <View style={{ backgroundColor: C.blueSub, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.blue }}>🏅 {bestScore}%</Text>
          </View>
        </View>}
        <View style={{ width: '100%', marginBottom: 20 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 12 }}>Answer Review</Text>
          {questions.map((q, i) => {
            const correct = answers[i] === q.correct;
            return (
              <View key={q.id} style={{ backgroundColor: correct ? C.successBg : C.dangerBg, borderRadius: 12, padding: 12, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: correct ? C.success : C.danger }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                  <Ionicons name={correct ? 'checkmark-circle' : 'close-circle'} size={18} color={correct ? C.success : C.danger} />
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: C.text, lineHeight: 18 }}>{q.q}</Text>
                </View>
                {!correct && <Text style={{ fontSize: 11, color: C.success, marginLeft: 26, fontWeight: '600', marginBottom: 2 }}>Correct: {q.ch[q.correct]}</Text>}
                <Text style={{ fontSize: 11, color: C.textSec, marginLeft: 26, lineHeight: 16 }}>{q.exp}</Text>
                <Text style={{ fontSize: 10, color: C.blue, marginLeft: 26, marginTop: 3, fontWeight: '600' }}>📖 {q.ref}</Text>
              </View>
            );
          })}
        </View>
        {/* Share score */}
        <TouchableOpacity onPress={handleShareResult}
          style={{ width: '100%', backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="share-outline" size={18} color="#fff" />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Share My Score</Text>
        </TouchableOpacity>
        {missedCount > 0 && <TouchableOpacity onPress={() => {
          const missed = questions.filter((q, i) => answers[i] !== q.correct);
          setMissedQs(missed);
          setQuestions(missed);
          setCurrentIdx(0); setSelectedAnswer(null); setShowExplanation(false);
          setAnswers([]); setQuizDone(false); setStarted(true); setReviewMode(true);
        }} style={{ width: '100%', backgroundColor: C.dangerBg, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1.5, borderColor: C.danger, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="refresh-circle-outline" size={18} color={C.danger} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.danger }}>Review {missedCount} Missed Question{missedCount !== 1 ? 's' : ''}</Text>
        </TouchableOpacity>}
        <TouchableOpacity onPress={startQuiz}
          style={{ width: '100%', backgroundColor: C.blue, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="refresh-outline" size={18} color="#fff" />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={resetToMenu}
          style={{ width: '100%', backgroundColor: C.surface, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: C.textSec }}>New Quiz Setup</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── ACTIVE QUIZ ───────────────────────────────────────────────────────────
  if (!currentQ) return null;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <TouchableOpacity onPress={resetToMenu}><Ionicons name="close" size={22} color={C.textSec} /></TouchableOpacity>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.textSec }}>{currentIdx + 1} / {questions.length}</Text>
          <View style={{ backgroundColor: C.blueSub, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.blue }}>{score} ✓</Text>
          </View>
        </View>
        <View style={{ height: 4, backgroundColor: C.inputBg, borderRadius: 99, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${((currentIdx + 1) / questions.length) * 100}%`, backgroundColor: C.blue, borderRadius: 99 }} />
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {reviewMode && <View style={{ backgroundColor: C.dangerBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="refresh-circle" size={12} color={C.danger} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.danger }}>Review Mode</Text>
          </View>}
          <View style={{ backgroundColor: C.blueSub, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: C.blue }}>{currentQ.cat}</Text>
          </View>
          <View style={{ backgroundColor: currentQ.level === 'Apprentice' ? C.greenBg : C.purpleBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: currentQ.level === 'Apprentice' ? C.green : C.purple }}>{currentQ.level}</Text>
          </View>
          <View style={{ backgroundColor: studyMode ? C.successBg : C.amberBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: studyMode ? C.success : C.amber }}>{studyMode ? 'Study' : 'Test'}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, lineHeight: 24, marginBottom: 20 }}>{currentQ.q}</Text>

        <View style={{ gap: 10, marginBottom: 20 }}>
          {currentQ.ch.map((choice, i) => {
            const isSel = selectedAnswer === i, isCorr = i === currentQ.correct;
            let bg = C.surface, border = C.border, tc = C.text;
            if (selectedAnswer !== null && studyMode) {
              if (isCorr)  { bg = C.successBg; border = C.success; tc = C.success; }
              else if (isSel) { bg = C.dangerBg; border = C.danger; tc = C.danger; }
            } else if (isSel) { bg = C.blueSub; border = C.blue; tc = C.blue; }
            return (
              <TouchableOpacity key={i} onPress={() => handleAnswer(i)} activeOpacity={selectedAnswer !== null ? 1 : 0.8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: bg, borderWidth: 1.5, borderColor: border }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: selectedAnswer !== null && studyMode ? (isCorr ? C.success : isSel ? C.danger : C.inputBg) : (isSel ? C.blue : C.inputBg), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: (isSel || (selectedAnswer !== null && studyMode && isCorr)) ? '#fff' : C.textSec }}>{String.fromCharCode(65 + i)}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: tc, lineHeight: 20 }}>{choice}</Text>
                {selectedAnswer !== null && studyMode && isCorr && <Ionicons name="checkmark-circle" size={20} color={C.success} />}
                {selectedAnswer !== null && studyMode && isSel && !isCorr && <Ionicons name="close-circle" size={20} color={C.danger} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {showExplanation && studyMode && (
          <View style={{ backgroundColor: selectedAnswer === currentQ.correct ? C.successBg : C.dangerBg, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: selectedAnswer === currentQ.correct ? C.success : C.danger, padding: 14, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 6 }}>
              {selectedAnswer === currentQ.correct ? '✅ Correct!' : '❌ Incorrect'}
            </Text>
            <Text style={{ fontSize: 13, color: C.textSec, lineHeight: 20, marginBottom: 6 }}>{currentQ.exp}</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.blue }}>📖 {currentQ.ref}</Text>
          </View>
        )}

        {(showExplanation || (!studyMode && selectedAnswer !== null)) && (
          <TouchableOpacity onPress={nextQuestion}
            style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center', shadowColor: C.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 5 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
              {currentIdx < questions.length - 1 ? 'Next →' : 'See Results →'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const SettingsScreen = ({ C, themePreference, setThemePreference, showDailyQ = true, onDailyQToggle, appLanguage = 'english', setAppLanguage, isPro = false, onUpgrade, onBuyPacks, onRestore }) => {
  const [keepOn, setKeepOn] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [reminderTime, setReminderTimeState] = useState({ hour: 7, minute: 30 });
  React.useEffect(() => {
    isDailyQuestionEnabled().then(setNotifEnabled);
    getReminderTime().then(setReminderTimeState);
  }, []);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [restoring, setRestoring] = useState(false);

  if (showTerms)   return <TermsScreen   C={C} onBack={() => setShowTerms(false)} />;
  if (showPrivacy) return <PrivacyScreen C={C} onBack={() => setShowPrivacy(false)} />;
  if (showSafety)  return <SafetyScreen  C={C} onBack={() => setShowSafety(false)} />;

  // Uses safeOpenURL — only opens https: and mailto: to known domains
  const openLink = safeOpenURL;
  const openFeedback = () => {
    openLink(buildMailtoURL('support@sparkconnect.pro', 'SparkConnect Feature Suggestion', 'Feature idea:\n\nWhat problem would this solve?\n\n'));
  };
  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try { await onRestore?.(); } finally { setRestoring(false); }
  };

  const SectionTitle = ({ title }) => (
    <Text style={{ fontSize: 12, fontWeight: '700', color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8, marginTop: 4 }}>{title}</Text>
  );
  const Row = ({ icon, label, val, toggle, togVal, onTog, iconBg, onPress, iconColor }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress && !onTog}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: iconBg ?? C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={16} color={iconColor ?? C.blue} />
      </View>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: C.text }}>{label}</Text>
      {val ? <Text style={{ fontSize: 12, color: C.textTert }}>{val}</Text> : null}
      {toggle ? <Switch value={togVal} onValueChange={onTog} trackColor={{ false: C.border, true: C.blue }} thumbColor="#fff" style={{ transform: [{ scale: 0.85 }] }} /> : null}
      {onPress ? <Ionicons name="chevron-forward" size={15} color={C.textTert} style={{ marginLeft: 2 }} /> : null}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

      {/* 1 — SparkConnect Pro */}
      <SectionTitle title="SparkConnect Pro" />
      <Card C={C} style={{ borderWidth: 2, borderColor: C.blue, marginBottom: 20, padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="flash" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.4 }}>SparkConnect Pro</Text>
              <Text style={{ fontSize: 12, color: C.textSec, marginTop: 1 }}>$7.99/mo · $49.99/yr Launch Special · {proAskAllowanceLabel()}</Text>
            </View>
          </View>
          {[proAskAllowanceLabel(),'Box Fill Calculator','Conduit Fill Calculator','Saved Projects & History','PDF Report Export (coming)','Priority new features'].map(f => (
            <View key={f} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 3 }}>
              <Ionicons name="checkmark-circle" size={15} color={C.blue} />
              <Text style={{ fontSize: 12, color: C.text, fontWeight: '500' }}>{f}</Text>
            </View>
          ))}
          {isPro ? (
            <View style={{ backgroundColor: C.greenBg, borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 14, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={16} color={C.green} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.green }}>Pro Active</Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={onUpgrade}
              style={{ backgroundColor: C.blue, borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 14, flexDirection: 'row', justifyContent: 'center', gap: 8, shadowColor: C.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 }}
              activeOpacity={0.85}>
              <Ionicons name="flash" size={16} color="#fff" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Upgrade to Pro</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleRestore} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 12, color: C.textTert }}>{restoring ? 'Restoring...' : 'Restore Purchases'}</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* 2 — SparkAI Answer Packs */}
      <SectionTitle title="SparkAI Answer Packs" />
      <Card C={C} style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: 12, backgroundColor: C.amberBg, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.amber }}>Need more answers? Add a SparkAI Answer Pack anytime.</Text>
        </View>
        {[{ label: '15 SparkAI Answers', price: '$1.99' },{ label: '50 SparkAI Answers', price: '$4.99' },{ label: '150 SparkAI Answers', price: '$9.99' }].map((pack, i, arr) => (
          <TouchableOpacity key={pack.label} onPress={onBuyPacks} activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: C.borderLight }}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={C.amber} style={{ marginRight: 10 }} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: C.text }}>{pack.label}</Text>
            <View style={{ backgroundColor: C.amberBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.amber }}>{pack.price}</Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={C.textTert} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        ))}
      </Card>

      {/* 3 — Follow SparkConnect */}
      <SectionTitle title="Follow SparkConnect" />
      <Card C={C} style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
        <Row icon="logo-instagram" label="Instagram" val="@sparkconnectelectricapp" iconBg="#FCE4EC" iconColor="#E1306C" onPress={() => openLink('https://instagram.com/sparkconnectelectricapp')} />
        <Row icon="logo-tiktok" label="TikTok" val="@sparkconnectelectricapp" iconBg="#F3F3F3" iconColor="#000" onPress={() => openLink('https://www.tiktok.com/@sparkconnectelectricapp')} />
        <Row icon="globe-outline" label="Website" val="sparkconnect.pro" onPress={() => openLink('https://www.sparkconnect.pro')} />
        <Row icon="bulb-outline" label="Suggest a Feature" onPress={openFeedback} />
      </Card>

      {/* 4 — Appearance */}
      <SectionTitle title="Appearance" />
      <Card C={C} style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        {[{ v: 'light', label: 'Light Mode', icon: 'sunny' },{ v: 'dark', label: 'Dark Mode', icon: 'moon' },{ v: 'system', label: 'System Default', icon: 'phone-portrait' }].map((opt, i, arr) => (
          <TouchableOpacity key={opt.v} onPress={() => setThemePreference(opt.v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: C.borderLight }}>
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={opt.icon} size={16} color={C.blue} />
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: C.text }}>{opt.label}</Text>
            {themePreference === opt.v && <Ionicons name="checkmark-circle" size={20} color={C.blue} />}
          </TouchableOpacity>
        ))}
      </Card>

      {/* 5 — App Settings */}
      <SectionTitle title="App Settings" />
      <Card C={C} style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>

        <Row icon="notifications-outline" label="Daily Code Question Alert" toggle togVal={notifEnabled} onTog={async (v) => {
          if (v) {
            const result = await enableDailyQuestionNotifications();
            setNotifEnabled(result.ok);
            if (!result.ok) {
              Alert.alert(
                result.reason === 'denied' ? 'Notifications Blocked' : 'Not Available Here',
                result.reason === 'denied'
                  ? 'Enable notifications in Settings → SparkConnect → Notifications to get your daily code question.'
                  : 'Daily reminders need the full SparkConnect app — they cannot run in Expo Go or the web preview.',
              );
            }
          } else {
            setNotifEnabled(false);
            await disableDailyQuestionNotifications();
          }
        }} iconBg={C.blueSub} iconColor={C.blue} />
        <Row icon="alarm-outline" label="Reminder Time" val={formatReminderTime(reminderTime)}
          onPress={async () => { setReminderTimeState(await cycleReminderTime()); }}
          iconBg={C.blueSub} iconColor={C.blue} />
        <Row icon="phone-portrait" label="Keep Screen On" toggle togVal={keepOn} onTog={setKeepOn} />
        <Row icon="radio-button-on" label="Haptic Feedback" toggle togVal={haptics} onTog={setHaptics} />
        <Row icon="school" label="Show Daily Question on Home" toggle togVal={showDailyQ} onTog={onDailyQToggle} iconBg={C.blueSub} iconColor={C.blue} />
        <Row icon="book-outline" label="NEC Edition" val="2023" iconBg={C.amberBg} iconColor={C.amber} />
        <Row icon="ruler-outline" label="Units" val="Imperial (in/ft)" iconBg={C.purpleBg} iconColor={C.purple} />
      </Card>

      {/* 6 — Language */}
      <SectionTitle title="Language" />
      <Card C={C} style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        {[
          { code: 'english',  flag: '🇺🇸', label: 'English',            sub: 'Default' },
          { code: 'spanish',  flag: '🇪🇸', label: 'Español (Spanish)',   sub: 'SparkAI responds in Spanish' },
          { code: 'mandarin', flag: '🇨🇳', label: '普通话 (Mandarin)',    sub: 'SparkAI responds in Mandarin' },
        ].map((lang, i, arr) => (
          <TouchableOpacity key={lang.code}
            onPress={() => { if (setAppLanguage) setAppLanguage(lang.code); safeStorageSet('@sc_app_language', lang.code); }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: C.borderLight }}>
            <Text style={{ fontSize: 20, marginRight: 10 }}>{lang.flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: C.text }}>{lang.label}</Text>
              <Text style={{ fontSize: 11, color: C.textTert }}>{lang.sub}</Text>
            </View>
            {(appLanguage || 'english') === lang.code && <Ionicons name="checkmark-circle" size={20} color={C.blue} />}
          </TouchableOpacity>
        ))}
      </Card>
      <View style={{ backgroundColor: C.amberBg, borderRadius: 10, padding: 10, marginBottom: 20, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <Ionicons name="information-circle-outline" size={14} color={C.amber} />
        <Text style={{ flex: 1, fontSize: 11, color: C.amber, lineHeight: 16 }}>Full app translation (menus, labels) coming in a future update. Currently, SparkAI will respond in the selected language — use the language mode chip inside SparkAI or change the app default here.</Text>
      </View>

      {/* 7 — Legal */}
      <SectionTitle title="Legal" />
      <Card C={C} style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        <Row icon="document-text-outline" label="Terms of Service" onPress={() => setShowTerms(true)} />
        <Row icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => setShowPrivacy(true)} />
        <Row icon="warning-outline" label="Safety & Compliance" iconBg={C.warningBg} iconColor={C.warning} onPress={() => setShowSafety(true)} />
        <Row icon="mail-outline" label="Contact Support" val="support@sparkconnect.pro" onPress={() => openLink('mailto:support@sparkconnect.pro')} />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
            <Ionicons name="information-circle-outline" size={16} color={C.textTert} />
          </View>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: C.text }}>Version</Text>
          <Text style={{ fontSize: 12, color: C.textTert }}>1.0.0</Text>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
        <Ionicons name="information-circle-outline" size={13} color={C.textTert} />
        <Text style={{ flex: 1, fontSize: 10, color: C.textTert, lineHeight: 15 }}>SparkConnect Tools is a field reference app. It does not replace professional judgment, licensed supervision, engineering review, inspections, or local AHJ requirements.</Text>
      </View>

    </ScrollView>
  );
};

// ═══ END SECTION 3 — paste Section 4 directly below ═══
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4 of 4 — Root App + Navigation + Styles
// ═══════════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'home',        icon: 'home',               label: 'Home' },
  { id: 'calculators', icon: 'calculator-outline',  label: 'Calculators' },
  { id: 'necai',       icon: 'chatbubble-ellipses',  label: 'SparkAI' },
  { id: 'projects',    icon: 'folder-open',          label: 'Projects' },
  { id: 'tools',       icon: 'construct',            label: 'Tools' },
];

const SCREEN_LABELS = {
  home: 'SparkConnect', bend: 'Pipe Bending', volt: 'Voltage Drop',
  wire: 'Wire Colors', formulas: 'Formula Reference', boxfill: 'Box Fill',
  conduitfill: 'Conduit Fill', ampacity: 'Ampacity Lookup',
  estimator: 'Material Estimator', necai: 'SparkAI',
  examprep: 'Code Quiz', jobcam: 'Job Cam', settings: 'Settings',
  calculators: 'Calculators', learn: 'Study Paths', tools: 'Tools',
  wiringlab: 'Wiring Simulator', troubleshoot: 'Troubleshoot', jobsite: 'Job Site',
  flashcards: 'Flashcards', projects: 'Projects', materials: 'Material List',
  community: 'Community', customizehome: 'Customize Home',
  permits: 'Permit Assistant', blueprint: 'Blueprint Takeoff', panelschedule: 'Panel Schedule',
  connect: 'Contractor Connect',
};

// ─── SPLASH SCREEN ───────────────────────────────────────────────────────────
const SplashScreen = ({ onDone }) => {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.85)).current;

  React.useEffect(() => {
    // Fade + scale in
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
    ]).start();

    // Hold then fade out
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => onDone());
    }, 1300); // long enough to read the brand, short enough to not feel like a gate

    return () => clearTimeout(timer);
  }, []);

  const FEATURE_PILLS = ['Pipe Bending', 'SparkAI', 'Voltage Drop', 'Ampacity', 'Wire Colors'];

  return (
    <View style={splashStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050A14" />
      <Animated.View style={[splashStyles.content, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>

        {/* SparkConnect Logo — shows actual PNG when SC_LOGO is set */}
        {SC_LOGO ? (
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 20, shadowColor: '#F4A11D', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 12 }}>
              <View style={{ width: 160, height: 70 }}>
                <Text style={{ color: '#1B2C4E', fontWeight: '900', fontSize: 22 }}>SparkConnect</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={splashStyles.iconWrap}>
            <View style={[splashStyles.glowRing, { borderColor: 'rgba(244,161,29,0.5)', backgroundColor: 'transparent', borderWidth: 3, width: 104, height: 104, borderRadius: 52 }]} />
            <View style={{ position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#F4A11D', opacity: 0.85, borderTopColor: 'transparent', transform: [{ rotate: '-30deg' }] }} />
            <View style={[splashStyles.iconCircle, { backgroundColor: '#F4A11D', shadowColor: '#F4A11D' }]}>
              <Ionicons name="flash" size={52} color="#fff" />
            </View>
          </View>
        )}
        {!SC_LOGO && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 30, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 }}>Spark</Text>
            <Text style={{ fontSize: 30, fontWeight: '900', color: '#F4A11D', letterSpacing: -0.5 }}>Connect</Text>
          </View>
        )}

        {/* Tagline */}
        <Text style={splashStyles.tagline}>Electrician Field Tools</Text>

        {/* Divider */}
        <View style={splashStyles.divider} />

        {/* Feature pills */}
        <View style={splashStyles.pillRow}>
          {FEATURE_PILLS.map((f, i) => (
            <View key={f} style={splashStyles.pill}>
              <Text style={splashStyles.pillText}>{f}</Text>
            </View>
          ))}
        </View>

        {/* Version */}
        {/* CODE-07 / UI-14 — the splash is brand recognition only. A hardcoded
            version and code edition made the app look dated the moment either
            moved on; the edition now lives with the results it applies to. */}
      </Animated.View>
    </View>
  );
};

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050A14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  glowRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  brandTop: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 6,
    marginBottom: 0,
  },
  brandBottom: {
    fontSize: 36,
    fontWeight: '900',
    color: '#3B82F6',
    letterSpacing: 8,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 28,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: '#3B82F6',
    borderRadius: 1,
    marginBottom: 24,
    opacity: 0.6,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 40,
    paddingHorizontal: 16,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  version: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 1,
  },
});

// ─── DAILY NOTIFICATION SCHEDULER ────────────────────────────────────────────
// Implementation lives in ./src/dailyNotifications. See that file for why this
// is a scheduled local notification rather than a true Home Screen widget, and
// why each day is scheduled individually instead of with a repeating trigger.
// (Two stray closers used to sit here - the other half of the launch-crash
// brace mangle fixed up in pickOrCapture's catch block above.)

// ─── LAZY SCREENS ────────────────────────────────────────────────────────────
// Importing these at the top of App.js meant a module-level failure in any one
// of them threw while App.js itself was still evaluating — which no error
// boundary catches and which, in a release build, closes the app instantly.
// Loading each on first use contains the blast radius: a broken screen shows a
// message on that screen, and everything else keeps working.
const _screenCache = {};
const lazyScreen = (name, load) => {
  const Lazy = (props) => {
    if (_screenCache[name] === undefined) {
      try {
        const mod = load();
        const Comp = (mod && mod.default) || mod;
        if (typeof Comp !== 'function') throw new Error(name + ' did not export a component');
        _screenCache[name] = Comp;
      } catch (e) {
        _screenCache[name] = e instanceof Error ? e : new Error(String(e));
      }
    }
    const cached = _screenCache[name];
    if (cached instanceof Error) {
      const C = props.C || DARK;
      return (
        <View style={{ flex: 1, backgroundColor: C.bg, padding: 22, paddingTop: 70 }}>
          <Text style={{ color: C.text, fontSize: 19, fontWeight: '800', marginBottom: 8 }}>{name} could not load</Text>
          <Text style={{ color: C.textSec, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
            The rest of the app is fine. Screenshot this and send it over.
          </Text>
          <Text selectable style={{ color: C.amber, fontSize: 12.5, fontWeight: '700' }}>{String(cached.message || cached)}</Text>
          {!!props.setTab && (
            <TouchableOpacity onPress={() => props.setTab('home')}
              style={{ marginTop: 22, backgroundColor: C.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Back to Home</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    return React.createElement(cached, props);
  };
  return Lazy;
};

const WiringLabScreen   = lazyScreen('Wiring Simulator',      () => require('./src/screens/WiringLabScreen'));
const TroubleshootScreen = lazyScreen('Troubleshooting', () => require('./src/screens/TroubleshootScreen'));
const JobsiteScreen     = lazyScreen('Job Site',        () => require('./src/screens/JobsiteScreen'));
const FlashcardsScreen  = lazyScreen('Flashcards',      () => require('./src/screens/FlashcardsScreen'));
const ProjectsScreen    = lazyScreen('Projects',        () => require('./src/screens/ProjectsScreen'));
const MaterialsScreen   = lazyScreen('Material List',   () => require('./src/screens/MaterialsScreen'));
const CommunityScreen   = lazyScreen('Community',       () => require('./src/screens/CommunityScreen'));
const PermitScreen      = lazyScreen('Permit Assistant', () => require('./src/screens/PermitScreen'));
const BlueprintScreen   = lazyScreen('Blueprint Takeoff', () => require('./src/screens/BlueprintScreen'));
const PanelScheduleScreen = lazyScreen('Panel Schedule', () => require('./src/screens/PanelScheduleScreen'));
const ContractorConnectScreen = lazyScreen('Contractor Connect', () => require('./src/screens/ContractorConnectScreen'));

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── ALL hooks must be called unconditionally, before any early return ──
  const [splashDone, setSplashDone] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  // What the FOCUS answer asked for, offered on Home instead of navigated to.
  const [firstSuggestion, setFirstSuggestion] = useState(null);
  // ── The kill switch ───────────────────────────────────────────────────
  // applyRemoteConfig has existed since RC1 and nothing ever called it, so
  // "leave room to cut a feature off if it does not work" was true in the code
  // and false in the app. This is the wire.
  //
  // Never blocks launch and never fails closed: every error path leaves the app
  // exactly as it shipped, because a kill switch that bricks the app when the
  // network is down is worse than the bug it was added to contain.
  const [remoteConfig, setRemoteConfig] = useState(EMPTY_CONFIG);
  const featureRegistry = React.useMemo(
    () => applyRemoteConfig(remoteConfig.features),
    [remoteConfig],
  );

  React.useEffect(() => {
    let live = true;
    (async () => {
      let cached = null;
      let cachedAt = null;
      try {
        const raw = await safeStorageGet('@sc_remote_config_v1');
        if (raw) {
          const saved = JSON.parse(raw);
          cached = saved.config ?? null;
          cachedAt = saved.at ?? null;
        }
      } catch (e) { safeLog('config.cache', e); }

      // Apply the cache immediately so a feature turned off yesterday stays off
      // through a launch with no signal.
      if (live && cached && cacheIsFresh(cachedAt)) setRemoteConfig(cached);

      const fetched = await fetchConfig(typeof fetch === 'function' ? fetch : null);
      if (!live) return;
      const next = resolveConfig({ cached, cachedAt, fetched });
      setRemoteConfig(next);
      try {
        await safeStorageSet('@sc_remote_config_v1', JSON.stringify({ config: next, at: Date.now() }));
      } catch (e) { safeLog('config.save', e); }
    })().catch(e => safeLog('config.load', e));
    return () => { live = false; };
  }, []);

  // The role picked during onboarding. Written since the flow was wired, and
  // until now only ever read once to seed the Home layout — so the answer
  // stopped paying rent the moment the app first launched. Customize Home uses
  // it to suggest, and the hours screen uses it to pick a ledger.
  const [role, setRole] = useState(null);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showDailyQ, setShowDailyQ] = useState(true);
  const [streak, setStreak] = useState(0);

  // ── Purchases: real RevenueCat state, not a hardcoded flag ──
  // paywall: null | 'pro' | 'packs' — which sheet is open.
  const [paywall, setPaywall] = useState(null);
  const [isPro, setIsPro] = useState(false);
  // When this subscription originally started, for the grandfathered
  // allowance. Null means the store did not tell us, which planFor resolves to
  // the generous side rather than guessing somebody down.
  const [proSince, setProSince] = useState(null);
  const [store, setStore] = useState(null);
  React.useEffect(() => {
    // initPurchases never throws; a billing SDK problem must never block launch.
    Promise.resolve(initPurchases())
      .then(({ isPro: pro, proSince: since }) => {
        if (pro) setIsPro(true);
        if (since) setProSince(since);
      })
      .catch(e => safeLog('purchases.init', e));
  }, []);

  /**
   * The plan the SERVER meters against.
   *
   * Sent as 'free' | 'pro' | 'pro_legacy' rather than a number, so the app and
   * /api/ask-nec agree on the tier and the limits live in one generated policy
   * instead of being typed into two systems.
   */
  const planType = React.useMemo(
    () => planFor({ isPro, proSince }),
    [isPro, proSince],
  );

  // Ask the store what it will sell the moment the sheet opens, so a plan that
  // cannot be bought is a disabled card rather than an alert after the tap.
  // Never throws, and a null result simply means every button behaves as before.
  React.useEffect(() => {
    if (paywall === null) return;
    let live = true;
    Promise.resolve(checkStore())
      .then(d => { if (live) setStore(d); })
      .catch(e => safeLog('purchases.checkStore', e));
    return () => { live = false; };
  }, [paywall]);

  const handlePurchase = React.useCallback(async (productId) => {
    const res = await purchaseProduct(productId);
    if (res.cancelled) return;
    if (res.ok) {
      if (res.isPro) setIsPro(true);
      setPaywall(null);
      Alert.alert(
        res.isPro ? 'Welcome to Pro! ⚡' : 'Purchase complete ⚡',
        res.isPro ? 'Everything is unlocked. Get after it.' : 'Your SparkAI answers have been added.',
      );
    } else if (res.error) {
      // A failure taught us something about the store. Fold it back in so the
      // plan that just failed is greyed out instead of inviting a second tap.
      Promise.resolve(checkStore())
        .then(d => setStore(d))
        .catch(e => safeLog('purchases.checkStore', e));
      Alert.alert(
        res.cause === 'ALREADY_OWNED' ? 'You already own this' : 'Purchase failed',
        res.error,
      );
    }
  }, []);

  const handleRestorePurchases = React.useCallback(async () => {
    const res = await rcRestorePurchases();
    if (res.ok && res.isPro) {
      setIsPro(true);
      setPaywall(null);
      Alert.alert('Restored ✅', 'Your Pro subscription is active.');
    } else if (res.ok) {
      Alert.alert('Nothing to restore', 'No active Pro subscription found for this Apple ID.');
    } else {
      Alert.alert('Restore failed', res.error || 'Please try again.');
    }
  }, []);
  React.useEffect(() => {
    // Every launch path below is wrapped. Nothing read from storage and nothing
    // scheduled with the OS is allowed to take the app down on open — an
    // unhandled rejection here is a fatal JS error, and a fatal JS error in a
    // release build is an instant close with no screen.
    safeStorageGet('@sc_onboarding_done').then(val => {
      const done = val === 'true';
      setOnboardingDone(done);
      setOnboardingChecked(true);
      // Top up the rolling notification horizon on every launch. Silent: it
      // never prompts, and does nothing unless the user already opted in.
      if (done) Promise.resolve(refreshDailyQuestionNotifications()).catch(e => safeLog('notif.refresh', e));
    }).catch(e => {
      // Storage unavailable is not a reason to show nothing. Fall through to
      // onboarding rather than sitting on a blank screen forever.
      safeLog('boot.onboarding', e);
      setOnboardingChecked(true);
    });
    safeStorageGet('@sc_show_daily_q').then(val => { if (val === 'false') setShowDailyQ(false); })
      .catch(e => safeLog('boot.showDailyQ', e));
    // Streak: check last quiz date
    safeStorageGet('@sc_streak_data').then(val => {
      if (val) {
        try {
          const { count, lastDate } = JSON.parse(val);
          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
          if (lastDate === today || lastDate === yesterday) setStreak(count);
        } catch {}
      }
    }).catch(e => safeLog('boot.streak', e));
  }, []);

  const updateStreak = async () => {
    const today = new Date().toISOString().split('T')[0];
    const val = await safeStorageGet('@sc_streak_data');
    let count = 1;
    if (val) {
      try {
        const d = JSON.parse(val);
        const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
        count = d.lastDate === yesterday ? d.count + 1 : d.lastDate === today ? d.count : 1;
      } catch {}
    }
    setStreak(count);
    await safeStorageSet('@sc_streak_data', JSON.stringify({ count, lastDate: today }));
  };
  const systemScheme = useColorScheme();
  // Dark by default. This app gets used in attics, crawlspaces and unlit
  // rough-ins, and the whole design was drawn dark first — a white screen at
  // arm's length in the dark is genuinely unpleasant.
  const [themePreference, setThemePreference] = useState('dark');
  const [appLanguage, setAppLanguage] = useState('english');
  React.useEffect(() => {
    safeStorageGet('@sc_app_language').then(v => { if (v) setAppLanguage(v); });
    // The Settings toggle was never persisted, so a chosen theme silently
    // reverted to the default on the next launch.
    safeStorageGet('@sc_theme').then(v => {
      if (v === 'light' || v === 'dark' || v === 'system') setThemePreference(v);
    });
  }, []);
  const chooseTheme = React.useCallback((v) => {
    setThemePreference(v);
    safeStorageSet('@sc_theme', v);
  }, []);
  const isDark = themePreference === 'dark' || (themePreference === 'system' && systemScheme === 'dark');
  const C = isDark ? DARK : LIGHT;
  const [tab, setTab] = useState('home');
  const [history, setHistory] = useState(['home']);

  const [homeKey, setHomeKey] = React.useState(0); // force HomeScreen remount on prefs change

  // Home is a user-chosen list of cards. Layout persists; the catalog lives in
  // src/core/home/layout.js so adding a Home feature is a data change.
  const { layout: homeLayout, save: saveHomeLayout } = useHomeLayout();

  const VALID_TABS = ['home','bend','volt','wire','formulas','boxfill','conduitfill','ampacity','estimator','necai','examprep','jobcam','settings','calculators','learn','tools','wiringlab','troubleshoot','jobsite','flashcards','customizehome','hours','projects','materials','community','permits','blueprint','panelschedule','connect'];

  // The first-run suggestion is shown once and then gone for good. A prompt
  // that keeps coming back is a nag, and the whole point of it is that it is a
  // gentler thing than being dropped into the screen unasked.
  const dismissSuggestion = React.useCallback(() => {
    setFirstSuggestion(null);
    safeStorageSet('@sc_first_suggestion_v1', '');
  }, []);

  React.useEffect(() => {
    let live = true;
    safeStorageGet('@sc_role')
      .then((r) => { if (live && r) setRole(r); })
      .catch(e => safeLog('role.load', e));
    return () => { live = false; };
  }, []);

  React.useEffect(() => {
    let live = true;
    safeStorageGet('@sc_first_suggestion_v1')
      .then((raw) => {
        if (!live || !raw) return;
        try { setFirstSuggestion(JSON.parse(raw)); } catch (e) { safeLog('suggestion.parse', e); }
      })
      .catch(e => safeLog('suggestion.load', e));
    return () => { live = false; };
  }, []);

  // Stable handlers — avoids stale closure in Settings toggle rows
  const handleDailyQToggle = React.useCallback((v) => {
    setShowDailyQ(v);
    safeStorageSet('@sc_show_daily_q', v ? 'true' : 'false');
    setHomeKey(k => k + 1); // force HomeScreen to remount with new pref
  }, []);

  // ── Daily Code Question notification: open Home on the question when tapped ──
  const openDailyQuestion = React.useCallback(() => {
    setShowDailyQ(true);
    safeStorageSet('@sc_show_daily_q', 'true');
    setTab('home');
    setHistory(['home']);
    setHomeKey(k => k + 1); // remount so the card re-reads today's question
    try { Promise.resolve(clearBadge()).catch(e => safeLog('notif.badge', e)); } catch (e) { safeLog('notif.badge', e); }
  }, []);

  React.useEffect(() => {
    // Cold start: the app was launched *by* the notification, so no listener
    // was mounted in time to see the tap.
    let unsubscribe = null;
    try {
      Promise.resolve(getInitialDailyQuestionResponse())
        .then(res => { if (res) openDailyQuestion(); })
        .catch(e => safeLog('notif.initialResponse', e));
      // Warm taps while the app is running or backgrounded.
      unsubscribe = addDailyQuestionTapListener(openDailyQuestion);
    } catch (e) {
      // No notification support in this environment. The rest of the app works.
      safeLog('notif.listen', e);
    }
    return () => { try { if (unsubscribe) unsubscribe(); } catch (e) { safeLog('notif.unlisten', e); } };
  }, [openDailyQuestion]);

  React.useEffect(() => {
    // Returning to the foreground tops the rolling horizon back up, so the
    // reminders keep coming without needing a cold start.
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      try {
        Promise.resolve(refreshDailyQuestionNotifications())
          .catch(e => safeLog('notif.refresh', e));
      } catch (e) { safeLog('notif.refresh', e); }
    });
    return () => { try { sub.remove(); } catch (e) { safeLog('AppState', e); } };
  }, []);

  const [necaiInitSearch, setNecaiInitSearch] = React.useState('');
  const navigateTo = (newTab, initSearch = '') => {
    // SECURITY: validate tab ID before navigating
    if (!VALID_TABS.includes(newTab)) { safeLog('navigateTo', `Invalid tab: ${newTab}`); return; }
    if (newTab === 'necai' && initSearch) {
      setNecaiInitSearch(initSearch);
    } else if (newTab !== 'necai') {
      // Clear any pending init search when navigating away
      setNecaiInitSearch('');
    }
    setTab(newTab);
    setHistory(prev => {
      // Don't push duplicate of current tab
      if (prev[prev.length - 1] === newTab) return prev;
      // Cap history at 50 to prevent unbounded memory growth
      const next = [...prev, newTab];
      return next.length > 50 ? next.slice(-50) : next;
    });
  };

  const goBack = () => {
    if (history.length > 1) {
      const prev = history[history.length - 2];
      setHistory(h => h.slice(0, -1));
      setTab(prev);
    }
  };

  const canGoBack = history.length > 1;

  // Splash screen shown until animation completes — AFTER all hooks
  if (!splashDone) {
    return <SplashScreen onDone={() => setSplashDone(true)} />;
  }
  if (onboardingChecked && !onboardingDone) {
    return (
      <OnboardingFlow onComplete={async (result) => {
        // Every field below is consumed. src/core/onboarding/flow.js declares
        // what each answer changes and a test fails if one changes nothing —
        // the previous flow collected a role and a tool list and wrote neither,
        // so every user has been running the default Home layout since launch.
        try {
          await safeStorageSet('@sc_onboarding_done', 'true');
          // HOME_LAYOUT. Written before the app renders Home, so the first
          // Home a person sees is already theirs.
          if (result?.role) { await safeStorageSet('@sc_role', result.role); setRole(result.role); }
          if (result?.layout?.length) await safeStorageSet('@sc_home_layout_v1', JSON.stringify(result.layout));
          // What they came for, kept as a SUGGESTION on Home rather than a
          // redirect. Answering "getting better at the trade" used to launch
          // straight into the Wiring Simulator, so a first-time user never saw
          // Home and had no idea what else the app had or how they got there.
          if (result?.suggest) await safeStorageSet('@sc_first_suggestion_v1', JSON.stringify(result.suggest));
        } catch (e) { safeLog('onboarding.persist', e); }

        setOnboardingDone(true);
        if (result?.suggest) setFirstSuggestion(result.suggest);

        // FIRST_SCREEN is always Home. It is the map — see flow.js outcome().
        if (result?.openAt && result.openAt !== 'home') navigateTo(result.openAt);

        // DAILY_NOTIFICATION — only if they said yes. Asking the OS anyway
        // after somebody declined in-app is how an app gets denied forever.
        if (result?.notifications) {
          try { Promise.resolve(enableDailyQuestionNotifications()).catch(e => safeLog('notif.enable', e)); } catch (e) { safeLog('notif.enable', e); }
        }

        // ENTITLEMENT. The offer screen records intent; the purchase itself
        // still goes through the one paywall, so there is exactly one buy path.
        if (result?.startedTrial) setPaywall(PaywallSource.SETTINGS);
      }} />
    );
  }

  // Which tab is which feature, for the kill switch. The map lives in
  // core/killSwitch.js because Home reads it too: a killed feature has to lose
  // its shortcut as well as its screen, and two copies of this list would
  // eventually disagree about which. Only tabs that CAN be switched off are on
  // it — Home, Settings and the calculators are absent, so a bad config can
  // never leave somebody with no way out.
  const TAB_FEATURE = KILLABLE_TABS;
  // Passed to Home so a killed feature's tile disappears rather than becoming
  // an advert for "Temporarily unavailable".
  const isTabHiddenNow = React.useMemo(() => tabHider(featureRegistry), [featureRegistry]);

  const renderScreen = () => {
    // A feature turned off from the website says so, rather than crashing,
    // hanging or quietly rendering a broken screen.
    const feat = TAB_FEATURE[tab];
    if (feat && featureRegistry[feat]?.disabled) {
      return (
        <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="construct-outline" size={40} color={C.textTert} />
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, marginTop: 16, textAlign: 'center' }}>
            Temporarily unavailable
          </Text>
          <Text style={{ fontSize: 13, color: C.textSec, marginTop: 8, textAlign: 'center', lineHeight: 19 }}>
            {remoteConfig.notice
              || 'This is switched off while we fix something. Everything else works, and it will come back on its own.'}
          </Text>
          <TouchableOpacity onPress={() => navigateTo('home')}
            accessibilityRole="button"
            style={{ marginTop: 22, backgroundColor: C.blue, borderRadius: 11, paddingHorizontal: 26, paddingVertical: 13 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      );
    }
    switch (tab) {
      case 'home':        return <HomeScreen key={homeKey} setTab={navigateTo} C={C} showDailyQ={showDailyQ} streak={streak} onStreakUpdate={updateStreak} homeLayout={homeLayout} suggestion={firstSuggestion} onDismissSuggestion={dismissSuggestion} isHidden={isTabHiddenNow} />;
      case 'calculators': return <CalculatorsScreen setTab={navigateTo} C={C} />;
      case 'bend':        return <BendScreen C={C} setTab={navigateTo} />;
      case 'volt':        return <VoltScreen C={C} setTab={navigateTo} />;
      case 'wire':        return <WireScreen C={C} />;
      case 'formulas':    return <FormulasScreen C={C} />;
      case 'boxfill':     return <BoxFillScreen C={C} setTab={navigateTo} />;
      case 'conduitfill': return <ConduitFillScreen C={C} setTab={navigateTo} />;
      case 'ampacity':    return <AmpacityScreen C={C} />;
      case 'estimator':   return <EstimatorScreen C={C} setTab={navigateTo} isPro={isPro} planType={planType} />;
      case 'necai':       return <NecAiScreen C={C} setTab={navigateTo} initialSearch={necaiInitSearch} clearInitSearch={() => setNecaiInitSearch('')} onUpgrade={() => setPaywall(PaywallSource.SETTINGS)} onBuyPacks={() => setPaywall('packs')} isPro={isPro} planType={planType} />;
      case 'examprep':    return <ExamPrepScreen C={C} onStreakUpdate={updateStreak} isPro={isPro} />;
      case 'tools':       return <ToolsScreen C={C} setTab={navigateTo} />;
      // Learn is still reachable — it is the study-path index now, one of
      // the tools rather than a tab competing with them.
      case 'learn':       return <LearnScreen setTab={navigateTo} C={C} onStreakUpdate={updateStreak} />;
      case 'wiringlab':   return <WiringLabScreen C={C} setTab={navigateTo} onStreakUpdate={updateStreak} />;
      case 'troubleshoot':return <TroubleshootScreen C={C} setTab={navigateTo} onStreakUpdate={updateStreak} />;
      case 'jobsite':     return <JobsiteScreen C={C} setTab={navigateTo} onStreakUpdate={updateStreak} pickImage={pickPlanImage} />;
      case 'flashcards':  return <FlashcardsScreen C={C} setTab={navigateTo} onStreakUpdate={updateStreak} />;
      case 'projects':    return <ProjectsScreen C={C} setTab={navigateTo} />;
      case 'materials':   return <MaterialsScreen C={C} setTab={navigateTo} />;
      case 'community':   return <CommunityScreen C={C} setTab={navigateTo} />;
      case 'permits':     return <PermitScreen C={C} setTab={navigateTo} onAskAi={(q) => { setNecaiInitSearch(q); navigateTo('necai'); }} />;
      case 'panelschedule': return <PanelScheduleScreen C={C} setTab={navigateTo} />;
      case 'connect':     return <ContractorConnectScreen C={C} setTab={navigateTo} />;
      case 'blueprint':   return (
        <BlueprintScreen
          C={C}
          setTab={navigateTo}
          isPro={isPro}
          onUpgrade={() => setPaywall(PaywallSource.SETTINGS)}
          pickImage={pickPlanImage}
          askBackend={askNecBackend}
        />
      );
      case 'customizehome': return <HomeCustomizeScreen C={C} layout={homeLayout} onSave={saveHomeLayout} role={role} onDone={() => { setHomeKey(k => k + 1); navigateTo('home'); }} />;
      case 'hours':       return <HoursScreen C={C} role={role} setTab={navigateTo} />;
      case 'settings':    return <SettingsScreen C={C} themePreference={themePreference} setThemePreference={chooseTheme} showDailyQ={showDailyQ} onDailyQToggle={handleDailyQToggle} appLanguage={appLanguage} setAppLanguage={setAppLanguage} isPro={isPro} onUpgrade={() => setPaywall(PaywallSource.SETTINGS)} onBuyPacks={() => setPaywall('packs')} onRestore={handleRestorePurchases} />;
      // Job Cam is a feature inside a project now. Anything still pointing
      // here — a deep link, saved nav state, an old shortcut — lands on
      // Projects, which is where its photos were migrated to.
      case 'jobcam':      return <ProjectsScreen C={C} setTab={navigateTo} />;
      default:            return <HomeScreen key={homeKey} setTab={navigateTo} C={C} showDailyQ={showDailyQ} streak={streak} onStreakUpdate={updateStreak} isHidden={isTabHiddenNow} />;
    }
  };

  // ProGatingProvider used to wrap this tree, but its import is gone and the
  // gate is deliberately inert (see the note in NecAiScreen). Rendering an
  // unimported component is a ReferenceError - the wrapper goes, not the app.
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
      <StatusBar barStyle={C.statusBar} backgroundColor={C.surface} />

      {/* ── Top Header ── */}
      <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          {canGoBack && tab !== 'home' ? (
            <TouchableOpacity onPress={goBack} style={[styles.iconBtn, { backgroundColor: C.blueSub }]}>
              <Ionicons name="arrow-back" size={18} color={C.blue} />
            </TouchableOpacity>
          ) : tab !== 'home' ? (
            <TouchableOpacity onPress={() => navigateTo('home')} style={[styles.iconBtn, { backgroundColor: C.blueSub }]}>
              <Ionicons name="home" size={18} color={C.blue} />
            </TouchableOpacity>
          ) : null}
          <View>
            <Text style={[styles.headerTitle, { color: C.text }]}>{SCREEN_LABELS[tab] ?? 'SparkConnect'}</Text>
            {tab === 'home' && <Text style={[styles.headerSub, { color: C.textSec }]}>Electrician's Field Tools</Text>}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>

          {tab !== 'settings' && (
            <TouchableOpacity onPress={() => navigateTo('settings')} style={[styles.iconBtn, { backgroundColor: C.inputBg }]}>
              <Ionicons name="settings-outline" size={18} color={C.textSec} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Screen Content ── */}
      <View style={{ flex: 1 }}>{renderScreen()}</View>

      {/* ── Bottom Tab Bar ── hidden inside the job site, which owns the whole
             screen. App navigation over a game reads as a web page. ── */}
      {tab !== 'jobsite' && (
      <View style={[styles.tabBar, { backgroundColor: C.tabBar, borderTopColor: C.tabBorder }]}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={styles.tabItem}
            onPress={() => navigateTo(t.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.tabIndicator, tab === t.id && { backgroundColor: C.blue }]} />
            <Ionicons name={t.icon} size={22} color={tab === t.id ? C.tabActive : C.tabInactive} />
            <Text style={[styles.tabLabel, { color: tab === t.id ? C.tabActive : C.tabInactive }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      )}

      {/* ── Paywall — the ONE purchase surface, wired to real RevenueCat ── */}
      {/* One paywall, one price, one entitlement — and the hero copy names the
          feature that just demonstrated the value. Somebody who ran out of
          SparkAI answers and somebody who hit a locked Job Site station are not
          convinced by the same sentence. Only the argument changes. */}
      <SparkPaywall
        visible={paywall !== null}
        isPacks={paywall === 'packs'}
        source={paywall}
        hero={paywall && paywall !== 'packs' ? heroFor(paywall) : null}
        store={store}
        onClose={() => setPaywall(null)}
        onPurchase={handlePurchase}
        onBuyPack={handlePurchase}
        onRestore={handleRestorePurchases}
      />
    </SafeAreaView>
    );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  tabIndicator: {
    width: 24,
    height: 3,
    borderRadius: 99,
    marginBottom: 2,
    backgroundColor: 'transparent',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});

// ═══ END — App.js complete. All 4 sections assembled. ═══