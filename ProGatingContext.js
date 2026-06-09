// ProGatingContext.js — v2 with static gate accessor for use in callbacks
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Modal } from 'react-native';
import { useRevenueCat } from './useRevenueCat';
import { useBoxFillGate, useConduitGate, useSparkyGate, useReferral } from './useProGating';
import PaywallScreen from './components/PaywallScreen';

const Ctx = createContext(null);

// Static accessor — safe to call from async callbacks / non-hook contexts
let _gateRef = null;
export const getGate = () => _gateRef;

export function ProGatingProvider({ children }) {
  const rc = useRevenueCat();
    const IS_PRO = rc.isPro;
      const [visible, setVisible] = useState(false);
        const [trigger, setTrigger] = useState('general');

          const showPaywall = useCallback((t = 'general') => {
              setTrigger(t); setVisible(true);
                }, []);

                  const onDismiss = useCallback((reason) => {
                      setVisible(false);
                          if (reason === 'purchased' || reason === 'restored' ||
                                  reason === 'pack_purchased' || reason === 'lifetime_purchased') {
                                        rc.checkEntitlement();
                                            }
                                              }, [rc]);

                                                const boxFillGate  = useBoxFillGate(IS_PRO);
                                                  const conduitGate  = useConduitGate(IS_PRO);
                                                    const sparkyGate   = useSparkyGate(IS_PRO);
                                                      const referral     = useReferral();

                                                        const value = { IS_PRO, isPro: IS_PRO, isLoading: rc.isLoading, showPaywall,
                                                            boxFillGate, conduitGate, sparkyGate, referral, offerings: rc.offerings };

                                                              // Keep static ref in sync so callbacks can access without hooks
                                                                _gateRef = value;

                                                                  return (
                                                                      <Ctx.Provider value={value}>
                                                                            {children}
                                                                                  <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
                                                                                          onRequestClose={() => onDismiss('dismissed')}>
                                                                                                  <PaywallScreen onDismiss={onDismiss} trigger={trigger} />
                                                                                                        </Modal>
                                                                                                            </Ctx.Provider>
                                                                                                              );
                                                                                                              }

                                                                                                              export function useProGating() {
                                                                                                                const ctx = useContext(Ctx);
                                                                                                                  if (!ctx) throw new Error('useProGating must be inside ProGatingProvider');
                                                                                                                    return ctx;
                                                                                                                    }
                                                                                                                    