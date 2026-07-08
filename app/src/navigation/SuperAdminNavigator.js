import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { MainShell, useMainChildRouteName } from './mainNavShell';
import SADashboard from '../screens/superadmin/DashboardScreen';
import LoanDetailScreen from '../screens/superadmin/LoanDetailScreen';
import CreateAdminScreen from '../screens/superadmin/CreateAdminScreen';

const RootStack = createStackNavigator();
const MainStack = createStackNavigator();

function SuperAdminInnerStack() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Dashboard" component={SADashboard} />
      <MainStack.Screen name="LoanDetail" component={LoanDetailScreen} />
      <MainStack.Screen name="CreateAdmin" component={CreateAdminScreen} />
    </MainStack.Navigator>
  );
}

function SuperAdminMainLayout() {
  const activeRouteName = useMainChildRouteName();
  return (
    <MainShell routeNames={['Dashboard']} activeRouteName={activeRouteName}>
      <SuperAdminInnerStack />
    </MainShell>
  );
}

export default function SuperAdminNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Main" component={SuperAdminMainLayout} />
    </RootStack.Navigator>
  );
}
