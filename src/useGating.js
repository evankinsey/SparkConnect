import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
const KEYS = { su:'@sc_sparky_uses_v2', sd:'@sc_sparky_date_v2', cu:'@sc_calc_uses_v2', cd:'@sc_calc_date_v2' };
const LIMITS = { sparky:3, calc:5 };
const today = () => new Date().toISOString().slice(0,10);
async function getCount(uk, dk) {
  const [u,d] = await Promise.all([AsyncStorage.getItem(uk), AsyncStorage.getItem(dk)]);
  return d !== today() ? 0 : parseInt(u||'0',10);
}
async function increment(uk, dk) {
  const c = await getCount(uk, dk);
  await Promise.all([AsyncStorage.setItem(uk, String(c+1)), AsyncStorage.setItem(dk, today())]);
  return c+1;
}
export function useGating() {
  const [sparkyToday, setSparky] = useState(0);
  const [calcToday, setCalc] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([getCount(KEYS.su,KEYS.sd), getCount(KEYS.cu,KEYS.cd)]).then(([s,c]) => {
      setSparky(s); setCalc(c); setReady(true);
    });
  }, []);
  const canUseSparky = useCallback(() => sparkyToday < LIMITS.sparky, [sparkyToday]);
  const canUseCalc   = useCallback(() => calcToday   < LIMITS.calc,   [calcToday]);
  const recordSparkyUse = useCallback(async () => { const n = await increment(KEYS.su,KEYS.sd); setSparky(n); return n; }, []);
  const recordCalcUse   = useCallback(async () => { const n = await increment(KEYS.cu,KEYS.cd); setCalc(n);   return n; }, []);
  return { ready, canUseSparky, canUseCalc, recordSparkyUse, recordCalcUse,
    sparkyToday, calcToday, sparkyRemaining: Math.max(0,LIMITS.sparky-sparkyToday),
    calcRemaining: Math.max(0,LIMITS.calc-calcToday), LIMITS };
}
