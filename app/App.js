import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Platform, ActivityIndicator } from 'react-native';
import { colors } from './src/theme/colors';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { PopupProvider } from './src/context/PopupContext';
import AppNavigator from './src/navigation/AppNavigator';
import CustomSplash from './src/components/CustomSplash';
import SessionGuard from './src/components/SessionGuard';
SplashScreen.preventAutoHideAsync();
const skipIntroSplash = __DEV__ && Platform.OS === 'web';

function AppContent() {
  const auth = useAuth();
  const loading = auth?.loading ?? true;
  const user = auth?.user;
  const token = auth?.token;
  const navigationKey = !token || !user
    ? 'logged-out'
    : user.isFirstLogin === true && user.role !== 'superadmin' && !auth.justCompletedSetup
      ? `setup-${user.userId}`
      : `home-${user.userId}-${user.role}`;
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [showSplash, setShowSplash] = useState(!skipIntroSplash);
  const onSplashDone = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    Font.loadAsync({
      Poppins_400Regular,
      Poppins_500Medium,
      Poppins_600SemiBold,
      Poppins_700Bold,
    }).then(() => setFontsLoaded(true));
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  if (showSplash) {
    return (
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <CustomSplash onDone={onSplashDone} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
          <ActivityIndicator size="large" color={colors.dark} />
        </View>
      ) : (
        <NavigationContainer key={navigationKey}>
          <AppNavigator />
        </NavigationContainer>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PopupProvider>
        <AuthProvider>
          <SessionGuard>
            <AppContent />
          </SessionGuard>
        </AuthProvider>
      </PopupProvider>
    </SafeAreaProvider>
  );
}
