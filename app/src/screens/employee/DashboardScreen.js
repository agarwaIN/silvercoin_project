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
import { formatDateTime, getLoanSubmissionInfo } from '../../utils/date';

const sortLoansWithReturnedFirst = (items) => {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    const aRet = a.status === 'returned' || a.status === 'rejected';
    const bRet = b.status === 'returned' || b.status === 'rejected';
    if (aRet && !bRet) return -1;
    if (!aRet && bRet) return 1;
    const bDate = new Date(b.updatedAt || b.createdAt || 0);
    const aDate = new Date(a.updatedAt || a.createdAt || 0);
    return bDate - aDate;
  });
};

export default function EmployeeDashboard({ navigation }) {
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [emiThisMonth, setEmiThisMonth] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await Promise.all([
      getLoans()
        .then((data) => setLoans(sortLoansWithReturnedFirst(data)))
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
    rejected: loans.filter((l) => ['rejected', 'returned'].includes(l.status)).length,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={`Hello, ${user?.name?.split(' ')[0]} 👋`} subtitle="Employee Dashboard" />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark} />}
      >
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statBoxWrap}
            onPress={() => navigation.navigate('Loans', { initialFilter: 'All' })}
          >
            <StatBox icon="document-text" label="Total" value={stats.total} color={colors.dark} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statBoxWrap}
            onPress={() => navigation.navigate('Loans', { initialFilter: 'In Progress' })}
          >
            <StatBox icon="create-outline" label="Draft" value={stats.draft} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statBoxWrap}
            onPress={() => navigation.navigate('Loans', { initialFilter: 'Pending' })}
          >
            <StatBox icon="time-outline" label="Pending" value={stats.pending} color="#D97706" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statBoxWrap}
            onPress={() => navigation.navigate('Loans', { initialFilter: 'Approved' })}
          >
            <StatBox icon="checkmark-circle" label="Approved" value={stats.approved} color={colors.success} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statBoxWrap}
            onPress={() => navigation.navigate('Loans', { initialFilter: 'Rejected' })}
          >
            <StatBox icon="close-circle-outline" label="Rejected" value={stats.rejected} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {stats.rejected > 0 && (
          <TouchableOpacity
            style={styles.returnedAlertBanner}
            onPress={() => navigation.navigate('Loans', { initialFilter: 'Rejected' })}
            activeOpacity={0.8}
          >
            <View style={styles.returnedAlertIcon}>
              <Ionicons name="alert-circle" size={22} color="#DC2626" />
            </View>
            <View style={styles.returnedAlertContent}>
              <Text style={styles.returnedAlertTitle}>
                {stats.rejected} Loan Application{stats.rejected > 1 ? 's' : ''} Returned by Admin
              </Text>
              <Text style={styles.returnedAlertSubtitle}>
                Action required: Tap to review remarks and correct
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#DC2626" />
          </TouchableOpacity>
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

        <Text style={styles.section}>Recent Applications</Text>
        {loans.slice(0, 6).map((loan) => {
          const isReturned = loan.status === 'returned' || loan.status === 'rejected';
          const returnRemark = loan.returnReason || loan.rejectionReason || loan.rejectReason || loan.remark;

          return (
            <TouchableOpacity key={loan.loanId} onPress={() =>
              navigation.navigate('Loans', { screen: 'LoanDetail', params: { loanId: loan.loanId } })
            }>
              <Card style={isReturned ? styles.returnedCard : undefined}>
                <View style={styles.loanRow}>
                  <View style={styles.loanLeft}>
                    <Text style={styles.loanId}>{loan.displayLoanId || loan.applicationNumber || loan.loanId}</Text>
                    <Text style={styles.ownerName}>{loan.ownerName || 'No owner yet'}</Text>
                    {(loan.approvedAmount || loan.loanAmount) ? (
                      <Text style={styles.amount}>₹{Number(loan.approvedAmount || loan.loanAmount).toLocaleString('en-IN')}</Text>
                    ) : null}
                  </View>
                  <StatusBadge status={loan.status} />
                </View>

                {isReturned && (
                  <View style={styles.returnedRemarkBanner}>
                    <View style={styles.returnedRemarkHeader}>
                      <Ionicons name="alert-circle" size={16} color="#DC2626" />
                      <Text style={styles.returnedRemarkTitle}>
                        {loan.status === 'returned' ? 'RETURNED REMARK' : 'REJECTION / RETURN REMARK'}
                      </Text>
                    </View>
                    <Text style={styles.returnedRemarkBold}>
                      {returnRemark || 'Application returned by admin for corrections.'}
                    </Text>
                  </View>
                )}

                {(() => {
                  const { time: submissionTime, label: timeLabel } = getLoanSubmissionInfo(loan);
                  if (!loan.employeeName && !submissionTime) return null;
                  return (
                    <View style={styles.submittedByRow}>
                      <Ionicons name="person" size={12} color="#047857" style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.submittedByText}>
                          Submitted / Filled By: <Text style={styles.submittedByName}>{loan.employeeName || 'Employee'}</Text>
                        </Text>
                        {submissionTime ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Ionicons name="time-outline" size={11} color={colors.muted} />
                            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
                              {timeLabel}: {formatDateTime(submissionTime)}
                            </Text>
                          </View>
                        ) : null}
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
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 20, marginTop: 8 },
  statBoxWrap: { flex: 1 },
  statBox: {
    backgroundColor: colors.card, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 2,
    alignItems: 'center', borderTopWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  statValue: { fontFamily: fonts.bold, fontSize: 15, marginTop: 4 },
  statLabel: { fontFamily: fonts.semiBold, fontSize: 9.5, color: colors.muted, marginTop: 2, textAlign: 'center' },
  returnedAlertBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    shadowColor: '#DC2626',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  returnedAlertIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnedAlertContent: {
    flex: 1,
  },
  returnedAlertTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: '#991B1B',
  },
  returnedAlertSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#B91C1C',
    marginTop: 2,
  },
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
  submittedByRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  submittedByText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  submittedByName: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.dark,
  },
  emptyCard: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.muted, marginTop: 12 },
  emptySubtext: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 4, textAlign: 'center' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  returnedCard: {
    borderColor: '#F87171',
    borderWidth: 1.5,
    backgroundColor: '#FFFDFD',
  },
  returnedRemarkBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    marginBottom: 2,
  },
  returnedRemarkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  returnedRemarkTitle: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  returnedRemarkBold: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 19,
  },
});
