import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import Header from '../../components/Header';
import { useAuth } from '../../context/AuthContext';
import { getLoans, getEmployees, getEmiThisMonth } from '../../api/adminApi';

export default function AdminDashboard({ navigation }) {
  const { width } = useWindowDimensions();
  const statsFourAcross = width >= 480;
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [emiThisMonth, setEmiThisMonth] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await Promise.all([
      getLoans()
        .then((data) => setLoans(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))))
        .catch(() => {}),
      getEmployees().then(setEmployees).catch(() => {}),
      getEmiThisMonth().then(setEmiThisMonth).catch(() => {}),
    ]);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const actionNeeded = loans.filter((l) =>
    ['submitted', 'agreement_submitted', 'owner_not_interested'].includes(l.status),
  ).length;

  const pending = loans.filter((l) =>
    ['submitted', 'initially_approved', 'owner_not_interested', 'agreement_submitted'].includes(l.status),
  ).length;
  const approved = loans.filter((l) => ['approved', 'active', 'completed'].includes(l.status)).length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={`Hello, ${user?.name?.split(' ')[0]} 👋`} subtitle="Admin Dashboard" />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark} />}
      >
        <View style={[styles.statsRow, !statsFourAcross && styles.statsRowWrap]}>
          <StatBox
            fourAcross={statsFourAcross}
            icon="people"
            label="Employees"
            value={employees.length}
            color={colors.dark}
          />
          <StatBox
            fourAcross={statsFourAcross}
            icon="document-text"
            label="Total Loans"
            value={loans.length}
            color={colors.accent}
          />
          <StatBox
            fourAcross={statsFourAcross}
            icon="time"
            label="Pending"
            value={pending}
            color="#D97706"
          />
          <StatBox
            fourAcross={statsFourAcross}
            icon="checkmark-circle"
            label="Approved"
            value={approved}
            color={colors.success}
          />
        </View>

        {actionNeeded > 0 && (
          <View style={styles.alertBanner}>
            <Ionicons name="alert-circle" size={18} color="#D97706" />
            <Text style={styles.alertText}>{actionNeeded} loan{actionNeeded > 1 ? 's' : ''} awaiting your action</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Loans')}>
              <Text style={styles.alertAction}>Review →</Text>
            </TouchableOpacity>
          </View>
        )}

        {emiThisMonth?.count > 0 && (
          <View style={styles.emiBanner}>
            <Ionicons name="cash-outline" size={18} color="#1D4ED8" />
            <View style={styles.emiBannerText}>
              <Text style={styles.emiBannerTitle}>EMIs received this month: {emiThisMonth.count}</Text>
              <Text style={styles.emiBannerAmount}>Total: ₹{Number(emiThisMonth.totalAmount).toLocaleString('en-IN')}</Text>
            </View>
          </View>
        )}

        <Text style={styles.section}>Recent Loans</Text>
        {loans.slice(0, 4).map((loan) => (
          <TouchableOpacity key={loan.loanId} onPress={() =>
            navigation.navigate('Loans', { screen: 'LoanDetail', params: { loanId: loan.loanId } })
          }>
            <Card>
              <View style={styles.loanRow}>
                <View style={styles.loanLeft}>
                  <Text style={styles.loanId}>{loan.loanId}</Text>
                  <Text style={styles.ownerName}>{loan.ownerName || '—'}</Text>
                  {loan.loanAmount && <Text style={styles.amount}>₹{Number(loan.loanAmount).toLocaleString('en-IN')}</Text>}
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
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ icon, label, value, color, fourAcross }) {
  return (
    <View
      style={[
        styles.statBox,
        fourAcross ? styles.statBoxFlex : styles.statBoxHalf,
        { borderTopColor: color },
      ]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20, marginTop: 8 },
  statsRowWrap: { flexWrap: 'wrap', justifyContent: 'space-between' },
  statBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    minWidth: 0,
  },
  statBoxFlex: { flex: 1, minWidth: 0 },
  statBoxHalf: { width: '47%', maxWidth: '47%', flexGrow: 0 },
  statValue: { fontFamily: fonts.bold, fontSize: fontSize.lg, marginTop: 6 },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
    textAlign: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  alertBanner: { backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  alertText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: '#92400E', flex: 1 },
  alertAction: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: '#D97706' },
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
  emptyText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 12 },
});
