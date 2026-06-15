import React, { useMemo } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { MainShell, useMainChildRouteName } from './mainNavShell';

import EmployeeDashboard from '../screens/employee/DashboardScreen';
import LoanListScreen from '../screens/employee/LoanListScreen';
import NewLoanScreen from '../screens/employee/NewLoanScreen';
import AgreementScreen from '../screens/employee/AgreementScreen';
import LoanDetailScreen from '../screens/employee/LoanDetailScreen';
import EmployeeAccountScreen from '../screens/employee/EmployeeAccountScreen';
import ChangePasswordScreen from '../screens/auth/ChangePasswordScreen';

const RootStack = createStackNavigator();
const MainStack = createStackNavigator();
const LoansNav = createStackNavigator();

function LoansStack() {
  return (
    <LoansNav.Navigator screenOptions={{ headerShown: false }}>
      <LoansNav.Screen name="LoanList" component={LoanListScreen} />
      <LoansNav.Screen name="NewLoan" component={NewLoanScreen} />
      <LoansNav.Screen name="LoanDetail" component={LoanDetailScreen} />
      <LoansNav.Screen name="Agreement" component={AgreementScreen} />
    </LoansNav.Navigator>
  );
}

function EmployeeInnerStack() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Dashboard" component={EmployeeDashboard} />
      <MainStack.Screen name="Loans" component={LoansStack} />
    </MainStack.Navigator>
  );
}

function EmployeeMainLayout() {
  const navigation = useNavigation();
  const activeRouteName = useMainChildRouteName();
  const extraMenuItems = useMemo(
    () => [
      {
        key: 'account',
        label: 'Account',
        icon: 'person-outline',
        onPress: () => navigation.navigate('Account'),
      },
    ],
    [navigation],
  );

  return (
    <MainShell
      routeNames={['Dashboard', 'Loans']}
      activeRouteName={activeRouteName}
      extraMenuItems={extraMenuItems}
    >
      <EmployeeInnerStack />
    </MainShell>
  );
}

export default function EmployeeNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Main" component={EmployeeMainLayout} />
      <RootStack.Screen name="Account" component={EmployeeAccountScreen} />
      <RootStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
    </RootStack.Navigator>
  );
}
