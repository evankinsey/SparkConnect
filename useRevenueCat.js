import { useState, useEffect, useCallback } from 'react';
import { Platform, AppState } from 'react-native';

export const PRODUCT_IDS = {
  MONTHLY: 'sparkconnect_pro_monthly',
    ANNUAL: 'sparkconnect_pro_yearly',
    };
    export const ENTITLEMENT_ID = 'pro';
    // 20/day Pro + 400/month fair-use cap. Free = 3/day.
    export const SPARKY_LIMITS = { FREE: 3, PRO_DAILY: 20, PRO_MONTHLY: 400 };

    export function useRevenueCat() {
      const [isPro, setIsPro] = useState(false);
        const [offerings, setOfferings] = useState(null);
          const [isLoading, setIsLoading] = useState(true);
            const [purchaseError, setPurchaseError] = useState(null);

              const checkEntitlement = useCallback(async () => {
                  try {
                        const P = require('react-native-purchases').default;
                              const info = await P.getCustomerInfo();
                                    setIsPro(!!info.entitlements.active[ENTITLEMENT_ID]);
                                        } catch (e) {
                                              // RevenueCat not available in Snack preview
                                                  } finally {
                                                        setIsLoading(false);
                                                            }
                                                              }, []);

                                                                useEffect(() => {
                                                                    try {
                                                                          const P = require('react-native-purchases').default;
                                                                                const apiKey = Platform.OS === 'ios'
                                                                                        ? process.env.EXPO_PUBLIC_RC_IOS_KEY
                                                                                                : process.env.EXPO_PUBLIC_RC_ANDROID_KEY;
                                                                                                      if (apiKey) P.configure({ apiKey });
                                                                                                          } catch (e) {}
                                                                                                              checkEntitlement();
                                                                                                                }, []);

                                                                                                                  useEffect(() => {
                                                                                                                      const sub = AppState.addEventListener('change', (s) => {
                                                                                                                            if (s === 'active') checkEntitlement();
                                                                                                                                });
                                                                                                                                    return () => sub.remove();
                                                                                                                                      }, [checkEntitlement]);

                                                                                                                                        const purchasePackage = useCallback(async (pkg) => {
                                                                                                                                            setPurchaseError(null);
                                                                                                                                                try {
                                                                                                                                                      const P = require('react-native-purchases').default;
                                                                                                                                                            const { customerInfo } = await P.purchasePackage(pkg);
                                                                                                                                                                  const active = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
                                                                                                                                                                        setIsPro(active);
                                                                                                                                                                              return { success: active };
                                                                                                                                                                                  } catch (e) {
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
                                                                                                                                                                                                                                            } catch (e) {
                                                                                                                                                                                                                                                  return { restored: false };
                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                        }, []);

                                                                                                                                                                                                                                                          return { isPro, offerings, isLoading, purchaseError, purchasePackage, restorePurchases, checkEntitlement };
                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                          