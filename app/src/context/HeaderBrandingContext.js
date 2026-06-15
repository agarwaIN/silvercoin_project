import React, { createContext, useContext, useMemo } from 'react';
import { SILVERCOIN_LOGO } from '../branding/silvercoin';

const HeaderBrandingContext = createContext({
  headerImageSource: SILVERCOIN_LOGO,
  refreshBranding: () => {},
});

export function HeaderBrandingProvider({ children }) {
  const value = useMemo(
    () => ({ headerImageSource: SILVERCOIN_LOGO, refreshBranding: () => {} }),
    [],
  );

  return (
    <HeaderBrandingContext.Provider value={value}>
      {children}
    </HeaderBrandingContext.Provider>
  );
}

export function useHeaderBranding() {
  return useContext(HeaderBrandingContext);
}
