import React, { createContext, useContext } from 'react';
import { Modal } from 'react-native';
import { useRevenueCat } from './useRevenueCat';
import PaywallScreen from './components/PaywallScreen';

const ProContext = createContext({
  isPro: false,
    isLoading: true,
      showPaywall: () => {},
        hidePaywall: () => {},
        });

        export function ProProvider({ children }) {
          const rc = useRevenueCat();
            const [paywallVisible, setPaywallVisible] = React.useState(false);
              const [paywallTrigger, setPaywallTrigger] = React.useState('general');

                const showPaywall = React.useCallback((trigger = 'general') => {
                    setPaywallTrigger(trigger);
                        setPaywallVisible(true);
                          }, []);

                            const hidePaywall = React.useCallback(() => setPaywallVisible(false), []);

                              const handleDismiss = React.useCallback((reason) => {
                                  setPaywallVisible(false);
                                      if (reason === 'purchased' || reason === 'restored') rc.checkEntitlement();
                                        }, [rc]);

                                          return (
                                              <ProContext.Provider value={{
                                                    isPro: rc.isPro,
                                                          isLoading: rc.isLoading,
                                                                offerings: rc.offerings,
                                                                      showPaywall,
                                                                            hidePaywall,
                                                                                }}>
                                                                                      {children}
                                                                                            <Modal
                                                                                                    visible={paywallVisible}
                                                                                                            animationType="slide"
                                                                                                                    presentationStyle="pageSheet"
                                                                                                                            onRequestClose={() => handleDismiss('dismissed')}
                                                                                                                                  >
                                                                                                                                          <PaywallScreen onDismiss={handleDismiss} trigger={paywallTrigger} />
                                                                                                                                                </Modal>
                                                                                                                                                    </ProContext.Provider>
                                                                                                                                                      );
                                                                                                                                                      }

                                                                                                                                                      export function usePro() {
                                                                                                                                                        return useContext(ProContext);
                                                                                                                                                        }
                                                                                                                                                        