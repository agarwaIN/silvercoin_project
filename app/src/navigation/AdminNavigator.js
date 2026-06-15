import React, { useEffect, useMemo, useRef } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { MainShell, useMainChildRouteName } from './mainNavShell';

import AdminDashboard from '../screens/admin/DashboardScreen';
import EmployeeListScreen from '../screens/admin/EmployeeListScreen';
import CreateEmployeeScreen from '../screens/admin/CreateEmployeeScreen';
import LoanListScreen from '../screens/admin/LoanListScreen';
import LoanDetailScreen from '../screens/admin/LoanDetailScreen';
import InitialApproveScreen from '../screens/admin/InitialApproveScreen';
import OrganizationSettingsScreen from '../screens/admin/OrganizationSettingsScreen';
import ChangePasswordScreen from '../screens/auth/ChangePasswordScreen';
import { useAuth } from '../context/AuthContext';
import { usePopup } from '../context/PopupContext';

const RootStack = createStackNavigator();
const MainStack = createStackNavigator();
const EmployeeNav = createStackNavigator();
const LoansNav = createStackNavigator();

function EmployeeStack() {
  return (
    <EmployeeNav.Navigator screenOptions={{ headerShown: false }}>
      <EmployeeNav.Screen name="EmployeeList" component={EmployeeListScreen} />
      <EmployeeNav.Screen name="CreateEmployee" component={CreateEmployeeScreen} />
    </EmployeeNav.Navigator>
  );
}

function LoansStack() {
  return (
    <LoansNav.Navigator screenOptions={{ headerShown: false }}>
      <LoansNav.Screen name="LoanList" component={LoanListScreen} />
      <LoansNav.Screen name="LoanDetail" component={LoanDetailScreen} />
      <LoansNav.Screen name="InitialApprove" component={InitialApproveScreen} />
    </LoansNav.Navigator>
  );
}

function AdminInnerStack() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Dashboard" component={AdminDashboard} />
      <MainStack.Screen name="Employees" component={EmployeeStack} />
      <MainStack.Screen name="Loans" component={LoansStack} />
    </MainStack.Navigator>
  );
}

function AdminMainLayout() {
  const navigation = useNavigation();
  const activeRouteName = useMainChildRouteName();
  const extraMenuItems = useMemo(
    () => [
      {
        key: 'org',
        label: 'Organization',
        icon: 'business-outline',
        onPress: () => navigation.navigate('OrganizationSettings'),
      },
      {
        key: 'password',
        label: 'Change password',
        icon: 'key-outline',
        onPress: () => navigation.navigate('ChangePassword', { fromSettings: true }),
      },
    ],
    [navigation],
  );

  return (
    <MainShell
      routeNames={['Dashboard', 'Employees', 'Loans']}
      activeRouteName={activeRouteName}
      extraMenuItems={extraMenuItems}
    >
      <AdminInnerStack />
    </MainShell>
  );
}

export default function AdminNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Main" component={AdminMainLayout} />
      <RootStack.Screen name="OrganizationSettings" component={OrganizationSettingsScreen} />
      <RootStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
    </RootStack.Navigator>
  );
}
