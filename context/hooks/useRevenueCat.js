import { useState, useEffect, useCallback } from 'react';
import { Platform, AppState } from 'react-native';

// RC keys — set in app.config.js as EXPO_PUBLIC_RC_IOS_KEY / EXPO_PUBLIC_RC_ANDROID_KEY
// Snack: RevenueCat SDK not available, so we stub isPro for preview
const IS_SNACK = typeof __DEV__ !== 'undefined';

export const PRODUCT_IDS = {
  MONTHLY: 'sparkconnect_pro_monthly',
    ANNUAL:  'sparkconnect_pro_yearly',
    };

    // Sparky AI limits
    export const SPARKY_LIMITS = {
      FREE: 5,   // free users: 5/day
        PRO: 20,   // Pro users: 20/day — enough for real job use, protects margins
        };

        export const ENTITLEMENT_ID = 'pro';

        export function useRevenueCat() {
          const [isPro, setIsPro]         = useState(false);
            const [offerings, setOfferings] = useState(null);
              const [isLoading, setIsLoading] = useState(true);
                const [purchaseError, setPurchaseError] = useState(null);

                  useEffect(() => {
                      // In Snack / dev without RC keys, just mark loaded
                          if (IS_SNACK) { setIsLoading(false); return; }
                              let Purchases;
                                  try { Purchases = require('react-native-purchases').default; } catch(e) {
                                        setIsLoading(false); return;
                                            }
                                                const apiKey = Platform.OS === 'ios'
                                                      ? process.env.EXPO_PUBLIC_RC_IOS_KEY
                                                            : process.env.EXPO_PUBLIC_RC_ANDROID_KEY;
                                                                if (!apiKey) { setIsLoading(false); return; }
                                                                    Purchases.configure({ apiKey });
                                                                        checkEntitlement(Purchases);
                                                                            fetchOfferings(Purchases);
                                                                              }, []);

                                                                                useEffect(() => {
                                                                                    const sub = AppState.addEventListener('change', (state) => {
                                                                                          if (state === 'active') checkEntitlement();
                                                                                              });
                                                                                                  return () => sub.remove();
                                                                                                    }, []);

                                                                                                      const checkEntitlement = useCallback(async (PurchasesArg) => {
                                                                                                          try {
                                                                                                                const P = PurchasesArg || require('react-native-purchases').default;
                                                                                                                      const info = await P.getCustomerInfo();
                                                                                                                            setIsPro(!!info.entitlements.active[ENTITLEMENT_ID]);
                                                                                                                                } catch(e) { /* noop in Snack */ }
                                                                                                                                    finally { setIsLoading(false); }
                                                                                                                                      }, []);

                                                                                                                                        const fetchOfferings = useCallback(async (PurchasesArg) => {
                                                                                                                                            try {
                                                                                                                                                  const P = PurchasesArg || require('react-native-purchases').default;
                                                                                                                                                        const data = await P.getOfferings();
                                                                                                                                                              if (data.current) setOfferings(data.current);
                                                                                                                                                                  } catch(e) {}
                                                                                                                                                                    }, []);

                                                                                                                                                                      const purchasePackage = useCallback(async (pkg) => {
                                                                                                                                                                          setPurchaseError(null);
                                                                                                                                                                              try {
                                                                                                                                                                                    const P = require('react-native-purchases').default;
                                                                                                                                                                                          const { customerInfo } = await P.purchasePackage(pkg);
                                                                                                                                                                                                const active = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
                                                                                                                                                                                                      setIsPro(active);
                                                                                                                                                                                                            return { success: active };
                                                                                                                                                                                                                } catch(e) {
                                                                                                                                                                                                                      if (!e.userCancelled) setPurchaseError(e.message);
                                                                                                                                                                                                                            return { success: false, cancelled: e.userCancelled };
                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                  }, []);

                                                                                                                                                                                                                                    const restorePurchases = useCallback(async () => {
                                                                                                                                                                                                                                        try {
                                                                                                                                                                                                                                              const P = require('react-native-purchases').default;
                                                                                                                                                                                                                                                    const info = await P.restorePurchases();
                                                                                                                                                                                                                                                          const restored = !!info.entitlements.active[ENTITLEMENT_ID];
                                                                                                                                                                                                                                                                setIsPro(restored);
                                                                                                                                                                                                                                                                      return { restored };
                                                                                                                                                                                                                                                                          } catch(e) {
                                                                                                                                                                                                                                                                                setPurchaseError(e.message);
                                                                                                                                                                                                                                                                                      return { restored: false };
                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                            }, []);

                                                                                                                                                                                                                                                                                              return { isPro, offerings, isLoading, purchaseError, purchasePackage, restorePurchases, checkEntitlement };
                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                              