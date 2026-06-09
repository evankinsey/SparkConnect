import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SPARKY_LIMITS } from './useRevenueCat';

const K = {
  BF: '@sc_boxfill_uses', BFD: '@sc_boxfill_date',
    CO: '@sc_conduit_uses', COD: '@sc_conduit_date',
      SP: '@sc_sparky_uses', SPD: '@sc_sparky_date',
        SPM: '@sc_sparky_month_uses', SPMD: '@sc_sparky_month',
          RC: '@sc_referral_code', RE: '@sc_referral_expiry',
          };
          const CAL = { BOX: 3, CON: 3 };

          function today() { return new Date().toISOString().split('T')[0]; }
          function month() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1); }

          async function getReset(uk, dk, lim) {
            const [u, d] = await Promise.all([AsyncStorage.getItem(uk), AsyncStorage.getItem(dk)]);
              if (d !== today()) {
                  await Promise.all([AsyncStorage.setItem(uk, '0'), AsyncStorage.setItem(dk, today())]);
                      return { uses: 0, remaining: lim };
                        }
                          const uses = parseInt(u ?? '0', 10);
                            return { uses, remaining: Math.max(0, lim - uses) };
                            }

                            export function useBoxFillGate(isPro) {
                              const [uses, setU] = useState(0);
                                const [remaining, setR] = useState(CAL.BOX);
                                  const [loaded, setL] = useState(false);
                                    useEffect(() => {
                                        if (isPro) { setL(true); return; }
                                            getReset(K.BF, K.BFD, CAL.BOX).then(({ uses: u, remaining: r }) => { setU(u); setR(r); setL(true); });
                                              }, [isPro]);
                                                const recordUse = useCallback(async () => {
                                                    if (isPro) return { allowed: true };
                                                        const n = uses + 1; const r = Math.max(0, CAL.BOX - n);
                                                            await AsyncStorage.setItem(K.BF, String(n));
                                                                setU(n); setR(r);
                                                                    return { allowed: n <= CAL.BOX, remaining: r };
                                                                      }, [isPro, uses]);
                                                                        const checkAllowed = useCallback(() => isPro || remaining > 0, [isPro, remaining]);
                                                                          return { loaded, uses, remaining, limit: CAL.BOX, checkAllowed, recordUse,
                                                                              label: isPro ? null : `${remaining} of ${CAL.BOX} free calculations today` };
                                                                              }

                                                                              export function useConduitGate(isPro) {
                                                                                const [uses, setU] = useState(0);
                                                                                  const [remaining, setR] = useState(CAL.CON);
                                                                                    const [loaded, setL] = useState(false);
                                                                                      useEffect(() => {
                                                                                          if (isPro) { setL(true); return; }
                                                                                              getReset(K.CO, K.COD, CAL.CON).then(({ uses: u, remaining: r }) => { setU(u); setR(r); setL(true); });
                                                                                                }, [isPro]);
                                                                                                  const recordUse = useCallback(async () => {
                                                                                                      if (isPro) return { allowed: true };
                                                                                                          const n = uses + 1; const r = Math.max(0, CAL.CON - n);
                                                                                                              await AsyncStorage.setItem(K.CO, String(n));
                                                                                                                  setU(n); setR(r);
                                                                                                                      return { allowed: n <= CAL.CON, remaining: r };
                                                                                                                        }, [isPro, uses]);
                                                                                                                          const checkAllowed = useCallback(() => isPro || remaining > 0, [isPro, remaining]);
                                                                                                                            return { loaded, uses, remaining, limit: CAL.CON, checkAllowed, recordUse,
                                                                                                                                label: isPro ? null : `${remaining} of ${CAL.CON} free calculations today` };
                                                                                                                                }

                                                                                                                                export function useSparkyGate(isPro) {
                                                                                                                                  const daily = isPro ? SPARKY_LIMITS.PRO_DAILY : SPARKY_LIMITS.FREE;
                                                                                                                                    const [dUses, setDU] = useState(0);
                                                                                                                                      const [dRem, setDR] = useState(daily);
                                                                                                                                        const [mUses, setMU] = useState(0);
                                                                                                                                          const [loaded, setL] = useState(false);
                                                                                                                                            useEffect(() => {
                                                                                                                                                (async () => {
                                                                                                                                                      const d = await getReset(K.SP, K.SPD, daily);
                                                                                                                                                            const [mu, mm] = await Promise.all([AsyncStorage.getItem(K.SPM), AsyncStorage.getItem(K.SPMD)]);
                                                                                                                                                                  const cur = month();
                                                                                                                                                                        let mcount = 0;
                                                                                                                                                                              if (mm !== cur) { await Promise.all([AsyncStorage.setItem(K.SPM, '0'), AsyncStorage.setItem(K.SPMD, cur)]); }
                                                                                                                                                                                    else { mcount = parseInt(mu ?? '0', 10); }
                                                                                                                                                                                          setDU(d.uses); setDR(d.remaining); setMU(mcount); setL(true);
                                                                                                                                                                                              })();
                                                                                                                                                                                                }, [isPro]);
                                                                                                                                                                                                  const checkAllowed = useCallback(() => {
                                                                                                                                                                                                      if (dRem <= 0) return false;
                                                                                                                                                                                                          if (isPro && mUses >= SPARKY_LIMITS.PRO_MONTHLY) return false;
                                                                                                                                                                                                              return true;
                                                                                                                                                                                                                }, [dRem, mUses, isPro]);
                                                                                                                                                                                                                  const recordUse = useCallback(async () => {
                                                                                                                                                                                                                      const nd = dUses + 1; const nm = mUses + 1; const rd = Math.max(0, daily - nd);
                                                                                                                                                                                                                          await Promise.all([AsyncStorage.setItem(K.SP, String(nd)), AsyncStorage.setItem(K.SPM, String(nm))]);
                                                                                                                                                                                                                              setDU(nd); setDR(rd); setMU(nm);
                                                                                                                                                                                                                                  return { allowed: nd <= daily && (!isPro || nm <= SPARKY_LIMITS.PRO_MONTHLY), remaining: rd };
                                                                                                                                                                                                                                    }, [dUses, mUses, daily, isPro]);
                                                                                                                                                                                                                                      const hitCap = isPro && mUses >= SPARKY_LIMITS.PRO_MONTHLY;
                                                                                                                                                                                                                                        const label = hitCap ? 'Monthly fair-use limit reached — add an answer pack'
                                                                                                                                                                                                                                            : `${dRem} of ${daily} ${isPro ? 'Pro' : 'free'} answers today`;
                                                                                                                                                                                                                                              return { loaded, dailyRemaining: dRem, monthUses: mUses, daily, checkAllowed, recordUse, label, hitCap };
                                                                                                                                                                                                                                              }

                                                                                                                                                                                                                                              export function useReferral() {
                                                                                                                                                                                                                                                const [code, setCode] = useState(null);
                                                                                                                                                                                                                                                  useEffect(() => {
                                                                                                                                                                                                                                                      (async () => {
                                                                                                                                                                                                                                                            let s = await AsyncStorage.getItem(K.RC);
                                                                                                                                                                                                                                                                  if (!s) {
                                                                                                                                                                                                                                                                          const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                                                                                                                                                                                                                                                                                  let r = ''; for (let i = 0; i < 4; i++) r += c[Math.floor(Math.random() * c.length)];
                                                                                                                                                                                                                                                                                          s = 'SPARK-' + r;
                                                                                                                                                                                                                                                                                                  await AsyncStorage.setItem(K.RC, s);
                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                              setCode(s);
                                                                                                                                                                                                                                                                                                                  })();
                                                                                                                                                                                                                                                                                                                    }, []);
                                                                                                                                                                                                                                                                                                                      const redeemCode = useCallback(async (input) => {
                                                                                                                                                                                                                                                                                                                          try {
                                                                                                                                                                                                                                                                                                                                const res = await fetch('https://sparkconnect-website.vercel.app/api/referral', {
                                                                                                                                                                                                                                                                                                                                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                                                                                                                                                                                                                                                                                                                body: JSON.stringify({ code: input.toUpperCase().trim() }),
                                                                                                                                                                                                                                                                                                                                                      });
                                                                                                                                                                                                                                                                                                                                                            const data = await res.json();
                                                                                                                                                                                                                                                                                                                                                                  if (data.valid) {
                                                                                                                                                                                                                                                                                                                                                                          const exp = new Date(); exp.setDate(exp.getDate() + 7);
                                                                                                                                                                                                                                                                                                                                                                                  await AsyncStorage.setItem(K.RE, exp.toISOString());
                                                                                                                                                                                                                                                                                                                                                                                          return { success: true };
                                                                                                                                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                                                                                                                                      return { success: false, error: data.error || 'Invalid code' };
                                                                                                                                                                                                                                                                                                                                                                                                          } catch (e) { return { success: false, error: 'Network error' }; }
                                                                                                                                                                                                                                                                                                                                                                                                            }, []);
                                                                                                                                                                                                                                                                                                                                                                                                              return { code, redeemCode };
                                                                                                                                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                                                                                                                              