import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Header from '../../components/Header';
import { useAuth } from '../../context/AuthContext';
import { getAllUsers, getAllLoans } from '../../api/superadminApi';

export default function SADashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState({ admins: [], employees: [] });
  const [loans, setLoans] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, l] = await Promise.all([getAllUsers(), getAllLoans()]);
      setUsers(u);
      setLoans(l);
    } catch {
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={`Hello, ${user?.name?.split(' ')[0]}`} subtitle="Super Admin" />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.card}>
          <Text style={styles.label}>Admins</Text>
          <Text style={styles.value}>{users.admins?.length || 0}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Employees</Text>
          <Text style={styles.value}>{users.employees?.length || 0}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Loans</Text>
          <Text style={styles.value}>{loans.length}</Text>
        </View>
        <Text style={styles.note}>Extend superadmin flows in the app and API.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  label: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted },
  value: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.text, marginTop: 4 },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 8,
    textAlign: 'center',
  },
});
