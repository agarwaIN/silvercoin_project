import React, { createContext, useContext } from 'react';

const AppMenuContext = createContext({
  openMenu: () => {},
  closeMenu: () => {},
});

export function useAppMenu() {
  return useContext(AppMenuContext);
}

export const AppMenuProvider = AppMenuContext.Provider;
