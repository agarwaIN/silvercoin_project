import React, { Suspense, lazy } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { HeaderBrandingProvider } from '../context/HeaderBrandingContext';
import AuthNavigator from './AuthNavigator';
import AdminNavigator from './AdminNavigator';
import EmployeeNavigator from './EmployeeNavigator';
import ChangePasswordScreen from '../screens/auth/ChangePasswordScreen';
import PlaceholderScreen from '../components/PlaceholderScreen';

const SuperAdminNavigator = lazy(() => import('./SuperAdminNavigator'));

function AuthLoadingFallback() {
  return (
    <View style={styles.loadingRoot}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const Stack = createStackNavigator();

function UnsupportedRoleScreen() {
  return <PlaceholderScreen title="Role not ready" message="Implement this role in the app." />;
}

function RoleHomeNavigator({ user }) {
  if (user.role === 'superadmin') {
    return (
      <Suspense fallback={<AuthLoadingFallback />}>
        <SuperAdminNavigator key="superadmin" />
      </Suspense>
    );
  }
  if (user.role === 'admin') {
    return <AdminNavigator key={`admin-${user.userId}`} />;
  }
  if (user.role === 'employee') {
    return <EmployeeNavigator key={`employee-${user.userId}`} />;
  }
  return <UnsupportedRoleScreen key="unsupported-role" />;
}

export default function AppNavigator() {
  const { user, token, justCompletedSetup } = useAuth();
  const needsPasswordSetup =
    Boolean(user?.isFirstLogin === true && user.role !== 'superadmin' && !justCompletedSetup);

  return (
    <HeaderBrandingProvider>
      {!token || !user ? (
        <AuthNavigator />
      ) : needsPasswordSetup ? (
        <View key="first-login-setup" style={{ flex: 1 }}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen
              name="ChangePassword"
              component={ChangePasswordScreen}
              initialParams={{ forcedFirstLogin: true }}
            />
          </Stack.Navigator>
        </View>
      ) : (
        <RoleHomeNavigator user={user} />
      )}
    </HeaderBrandingProvider>
  );
}

const styles = StyleSheet.create({
  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
