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
        {loans.slice(0, 4).map((loan) => {
          const hasPendingEmi = loan.emiChangeRequest && loan.emiChangeRequest.status === 'pending';
          return (
            <TouchableOpacity key={loan.loanId} onPress={() =>
              navigation.navigate('Loans', { screen: 'LoanDetail', params: { loanId: loan.loanId } })
            }>
              <Card>
                <View style={styles.loanRow}>
                  <View style={styles.loanLeft}>
                    <Text style={styles.loanId}>{loan.loanId}</Text>
                    <Text style={styles.ownerName}>{loan.ownerName || '—'}</Text>
                    {loan.loanAmount && <Text style={styles.amount}>Principal: ₹{Number(loan.loanAmount).toLocaleString('en-IN')}</Text>}
                  </View>
                  <StatusBadge status={loan.status} />
                </View>

                {hasPendingEmi && (() => {
                  const req = loan.emiChangeRequest;
                  const fields = [
                    { label: 'Principal', old: loan.approvedAmount || loan.loanAmount, new: req.approvedAmount, isCurrency: true },
                    { label: 'Tenure', old: loan.tenureMonths, new: req.tenureMonths, suffix: 'm' },
                    { label: 'Interest', old: loan.interestRate, new: req.interestRate, suffix: '%' },
                    { label: 'Penalty', old: loan.penaltyRate, new: req.penaltyRate, suffix: '%' },
                    { label: 'Tot Int', old: loan.totalInterest, new: req.totalInterest, isCurrency: true },
                    { label: 'Tot Repay', old: loan.totalRepayable, new: req.totalRepayable, isCurrency: true },
                  ];
                  const changedFields = fields.filter(f => Number(f.old || 0) !== Number(f.new || 0));

                  return (
                    <View style={styles.emiChangePreview}>
                      <View style={styles.emiChangePreviewHeader}>
                        <Ionicons name="alert-circle" size={14} color="#D97706" />
                        <Text style={styles.emiChangePreviewTitle}>EMI Change Requested</Text>
                      </View>
                      
                      {changedFields.map((f, i) => (
                        <View key={i} style={styles.diffRow}>
                          <Text style={styles.diffLabel}>{f.label}:</Text>
                          <Text style={styles.diffOld}>{f.isCurrency ? '₹' : ''}{Number(f.old || 0).toLocaleString('en-IN')}{f.suffix || ''}</Text>
                          <Ionicons name="arrow-forward" size={12} color={colors.muted} />
                          <Text style={styles.diffNew}>{f.isCurrency ? '₹' : ''}{Number(f.new || 0).toLocaleString('en-IN')}{f.suffix || ''}</Text>
                        </View>
                      ))}
                      
                      <View style={[styles.diffRow, { marginTop: 4, borderTopWidth: 1, borderTopColor: '#FDE68A', paddingTop: 6 }]}>
                        <Text style={[styles.diffLabel, { color: '#B45309', fontFamily: fonts.bold }]}>Final EMI:</Text>
                        <Text style={styles.diffOld}>₹{Number(loan.emiAmount || 0).toLocaleString('en-IN')}</Text>
                        <Ionicons name="arrow-forward" size={12} color={colors.muted} />
                        <Text style={[styles.diffNew, { color: '#059669', fontFamily: fonts.bold }]}>₹{Number(req.emiAmount || 0).toLocaleString('en-IN')}</Text>
                      </View>
                    </View>
                  );
                })()}
              </Card>
            </TouchableOpacity>
          );
        })}

        {loans.length === 0 && (
          <Card style={styles.emptyCard}>
            <Ionicons name="document-outline" size={40} color={colors.border} />
            <Text style={styles.emptyText}>No loan applications yet</Text>
          </Card>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent Employees</Text>
          <TouchableOpacity 
            style={styles.createBtn}
            onPress={() => navigation.navigate('Employees', { screen: 'CreateEmployee' })}
          >
            <Ionicons name="add" size={16} color={colors.white} />
            <Text style={styles.createBtnText}>Create</Text>
          </TouchableOpacity>
        </View>
        {employees.slice(0, 3).map((emp) => (
          <Card key={emp.userId}>
            <View style={styles.loanRow}>
              <View style={styles.loanLeft}>
                <Text style={styles.loanId}>{emp.name}</Text>
                <Text style={styles.ownerName}>{emp.mobile}</Text>
                <Text style={styles.ownerName}>{emp.email}</Text>
              </View>
              <View>
                {emp.isActive ? (
                  <Text style={[styles.activeBadge, { backgroundColor: colors.success }]}>Active</Text>
                ) : (
                  <Text style={[styles.activeBadge, { backgroundColor: colors.danger }]}>Inactive</Text>
                )}
              </View>
            </View>
          </Card>
        ))}
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
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 12 },
  sectionTitle: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.text },
  createBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.dark, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 4 },
  createBtnText: { fontFamily: fonts.medium, fontSize: 12, color: colors.white },
  loanRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loanLeft: { flex: 1 },
  loanId: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: colors.dark },
  ownerName: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.text, marginTop: 2 },
  amount: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.success, marginTop: 2 },
  emptyCard: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 12 },
  activeBadge: { fontFamily: fonts.medium, fontSize: 10, color: colors.white, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  emiChangePreview: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8 },
  emiChangePreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  emiChangePreviewTitle: { fontFamily: fonts.semiBold, fontSize: 12, color: '#D97706' },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  diffLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.text, width: 70 },
  diffOld: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, textDecorationLine: 'line-through' },
  diffNew: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.success },
});
