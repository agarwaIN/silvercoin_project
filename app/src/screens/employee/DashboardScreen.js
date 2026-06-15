import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import Header from '../../components/Header';
import { useAuth } from '../../context/AuthContext';
import { getLoans, getEmiThisMonth } from '../../api/employeeApi';

export default function EmployeeDashboard({ navigation }) {
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [emiThisMonth, setEmiThisMonth] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await Promise.all([
      getLoans()
        .then((data) => setLoans(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))))
        .catch(() => {}),
      getEmiThisMonth().then(setEmiThisMonth).catch(() => {}),
    ]);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const stats = {
    total: loans.length,
    draft: loans.filter((l) => l.status === 'draft').length,
    pending: loans.filter((l) => ['submitted', 'initially_approved', 'owner_not_interested', 'agreement_submitted'].includes(l.status)).length,
    approved: loans.filter((l) => ['approved', 'active', 'completed'].includes(l.status)).length,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={`Hello, ${user?.name?.split(' ')[0]} 👋`} subtitle="Employee Dashboard" />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark} />}
      >
        {}
        <View style={styles.statsRow}>
          <StatBox icon="document-text" label="Total" value={stats.total} color={colors.dark} />
          <StatBox icon="create-outline" label="Draft" value={stats.draft} color={colors.muted} />
          <StatBox icon="time-outline" label="Pending" value={stats.pending} color="#D97706" />
          <StatBox icon="checkmark-circle" label="Approved" value={stats.approved} color={colors.success} />
        </View>

        {emiThisMonth?.count > 0 && (
          <View style={styles.emiBanner}>
            <Ionicons name="cash-outline" size={18} color="#1D4ED8" />
            <View style={styles.emiBannerText}>
              <Text style={styles.emiBannerTitle}>EMIs received this month: {emiThisMonth.count}</Text>
              <Text style={styles.emiBannerAmount}>Total: ₹{Number(emiThisMonth.totalAmount).toLocaleString('en-IN')}</Text>
            </View>
          </View>
        )}

        {}
        <Text style={styles.section}>Recent Applications</Text>
        {loans.slice(0, 3).map((loan) => (
          <TouchableOpacity key={loan.loanId} onPress={() =>
            navigation.navigate('Loans', { screen: 'LoanDetail', params: { loanId: loan.loanId } })
          }>
            <Card>
              <View style={styles.loanRow}>
                <View style={styles.loanLeft}>
                  <Text style={styles.loanId}>{loan.loanId}</Text>
                  <Text style={styles.ownerName}>{loan.ownerName || 'No owner yet'}</Text>
                  {loan.loanAmount ? (
                    <Text style={styles.amount}>₹{Number(loan.loanAmount).toLocaleString('en-IN')}</Text>
                  ) : null}
                </View>
                <StatusBadge status={loan.status} />
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {loans.length === 0 && (
          <Card style={styles.emptyCard}>
            <Ionicons name="document-outline" size={40} color={colors.border} />
            <Text style={styles.emptyText}>No loan applications yet</Text>
            <Text style={styles.emptySubtext}>Tap + to create your first loan application</Text>
          </Card>
        )}
      </ScrollView>

      {}
      <TouchableOpacity
        style={styles.fab}
        onPress={() =>
          navigation.navigate('Loans', {
            screen: 'NewLoan',
            params: {},
            merge: false,
          })
        }
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function StatBox({ icon, label, value, color }) {
  return (
    <View style={[styles.statBox, { borderTopColor: color }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24, marginTop: 8 },
  statBox: {
    flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 12,
    alignItems: 'center', borderTopWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  statValue: { fontFamily: fonts.bold, fontSize: fontSize.lg, marginTop: 6 },
  statLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted, marginTop: 2 },
  emiBanner: { backgroundColor: '#DBEAFE', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  emiBannerText: { flex: 1 },
  emiBannerTitle: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: '#1E40AF' },
  emiBannerAmount: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: '#1D4ED8', marginTop: 2 },
  section: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.text, marginBottom: 12 },
  loanRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loanLeft: { flex: 1 },
  loanId: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: colors.dark },
  ownerName: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.text, marginTop: 2 },
  amount: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.success, marginTop: 2 },
  emptyCard: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.muted, marginTop: 12 },
  emptySubtext: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 4, textAlign: 'center' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
});
