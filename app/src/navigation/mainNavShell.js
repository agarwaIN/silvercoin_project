import React, { useMemo, useState, useCallback } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppFooter from '../components/AppFooter';
import RightMenuModal from '../components/RightMenuModal';
import { AppMenuProvider } from '../context/AppMenuContext';
import { useAuth } from '../context/AuthContext';
import { usePopup } from '../context/PopupContext';

export function MainShell({ children, routeNames, activeRouteName, extraMenuItems }) {
  const navigation = useNavigation();
  const { signOut } = useAuth();
  const { showAlert } = usePopup();
  const [menuOpen, setMenuOpen] = useState(false);

  const menu = useMemo(
    () => ({
      openMenu: () => setMenuOpen(true),
      closeMenu: () => setMenuOpen(false),
    }),
    [],
  );

  const onSelectRoute = (name) => {
    navigation.navigate('Main', { screen: name });
    setMenuOpen(false);
  };

  const onLogout = useCallback(() => {
    setMenuOpen(false);
    showAlert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [showAlert, signOut]);

  return (
    <AppMenuProvider value={menu}>
      <View style={{ flex: 1 }}>
        {children}
        <RightMenuModal
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          routeNames={routeNames}
          activeRouteName={activeRouteName}
          onSelectRoute={onSelectRoute}
          onLogout={onLogout}
          extraMenuItems={extraMenuItems}
        />
        <AppFooter />
      </View>
    </AppMenuProvider>
  );
}

export function useMainChildRouteName() {
  const route = useRoute();
  const idx = route.state?.index;
  return idx != null && route.state?.routes ? route.state.routes[idx]?.name : undefined;
}
