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
import { formatDateTime, getLoanSubmissionInfo, sortLoansByLatestSubmitted } from '../../utils/date';

const sortLoansWithReturnedFirst = (items) => sortLoansByLatestSubmitted(items);

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
        .then((data) => setLoans(sortLoansWithReturnedFirst(data)))
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
  const approved = loans.filter((l) => l.status === 'approved').length;
  const activeLoans = loans.filter((l) => l.status === 'active').length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={`Hello, ${user?.name?.split(' ')[0]} 👋`} subtitle="Admin Dashboard" />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark} />}
      >
        <View style={[styles.statsRow, !statsFourAcross && styles.statsRowWrap]}>
          <TouchableOpacity
            style={statsFourAcross ? styles.statTouchFlex : styles.statTouchHalf}
            onPress={() => navigation.navigate('Loans', { screen: 'LoanList', params: { initialFilter: 'All' } })}
            activeOpacity={0.7}
          >
            <StatBox
              icon="document-text"
              label="Total Loans"
              value={loans.length}
              color={colors.dark}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={statsFourAcross ? styles.statTouchFlex : styles.statTouchHalf}
            onPress={() => navigation.navigate('Loans', { screen: 'LoanList', params: { initialFilter: 'Pending' } })}
            activeOpacity={0.7}
          >
            <StatBox
              icon="time"
              label="Pending Loans"
              value={pending}
              color="#D97706"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={statsFourAcross ? styles.statTouchFlex : styles.statTouchHalf}
            onPress={() => navigation.navigate('Loans', { screen: 'LoanList', params: { initialFilter: 'Approved' } })}
            activeOpacity={0.7}
          >
            <StatBox
              icon="checkmark-circle"
              label="Approved Loans"
              value={approved}
              color={colors.success}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={statsFourAcross ? styles.statTouchFlex : styles.statTouchHalf}
            onPress={() => navigation.navigate('Loans', { screen: 'LoanList', params: { initialFilter: 'Active' } })}
            activeOpacity={0.7}
          >
            <StatBox
              icon="flash"
              label="Active Loans"
              value={activeLoans}
              color={colors.accent}
            />
          </TouchableOpacity>
        </View>

        {actionNeeded > 0 && (
          <View style={styles.alertBanner}>
            <Ionicons name="alert-circle" size={18} color="#D97706" />
            <Text style={styles.alertText}>{actionNeeded} loan{actionNeeded > 1 ? 's' : ''} awaiting your action</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Loans', { screen: 'LoanList', params: { initialFilter: 'Pending' } })}>
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

        <View style={[styles.sectionHeaderRow, { marginTop: 4 }]}>
          <Text style={styles.sectionTitle}>Recent Loans</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Loans', { screen: 'LoanList', params: { initialFilter: 'All' } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            activeOpacity={0.7}
          >
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.dark }}>View All</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.dark} />
          </TouchableOpacity>
        </View>

        {loans.filter((l) => l.status !== 'rejected').slice(0, 6).map((loan) => {
          const hasPendingEmi = loan.emiChangeRequest && loan.emiChangeRequest.status === 'pending';
          const isReturned = loan.status === 'returned';
          const returnRemark = loan.returnReason || loan.remark;

          return (
            <TouchableOpacity key={loan.loanId} onPress={() =>
              navigation.navigate('Loans', { screen: 'LoanDetail', params: { loanId: loan.loanId } })
            }>
              <Card style={isReturned ? styles.returnedCard : undefined}>
                <View style={styles.loanRow}>
                  <View style={styles.loanLeft}>
                    <Text style={styles.loanId}>{loan.displayLoanId || loan.applicationNumber || loan.loanId}</Text>
                    <Text style={styles.ownerName}>{loan.ownerName || '—'}</Text>
                    {(loan.approvedAmount || loan.loanAmount) ? (
                      <Text style={styles.amount}>Principal: ₹{Number(loan.approvedAmount || loan.loanAmount).toLocaleString('en-IN')}</Text>
                    ) : null}
                  </View>
                  <StatusBadge status={loan.status} />
                </View>

                {isReturned && (
                  <View style={styles.returnedRemarkBanner}>
                    <View style={styles.returnedRemarkHeader}>
                      <Ionicons name="alert-circle" size={16} color="#DC2626" />
                      <Text style={styles.returnedRemarkTitle}>
                        RETURNED REMARK
                      </Text>
                    </View>
                    <Text style={styles.returnedRemarkBold}>
                      {returnRemark || 'Application returned to employee for corrections.'}
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

        {loans.filter((l) => l.status !== 'rejected').length === 0 && (
          <Card style={styles.emptyCard}>
            <Ionicons name="document-outline" size={40} color={colors.border} />
            <Text style={styles.emptyText}>No loan applications yet</Text>
          </Card>
        )}

        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={() => navigation.navigate('Employees')}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionTitle}>Employees ({employees.length})</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.dark} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity 
              style={styles.employeeBtn}
              onPress={() => navigation.navigate('Employees')}
              activeOpacity={0.7}
            >
              <Ionicons name="people" size={14} color={colors.white} />
              <Text style={styles.employeeBtnText}>Employees ({employees.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.createBtn}
              onPress={() => navigation.navigate('Employees', { screen: 'CreateEmployee' })}
            >
              <Ionicons name="add" size={16} color={colors.white} />
              <Text style={styles.createBtnText}>Create</Text>
            </TouchableOpacity>
          </View>
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

function StatBox({ icon, label, value, color }) {
  return (
    <View style={[styles.statBox, { borderTopColor: color }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 16 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20, marginTop: 8 },
  statsRowWrap: { flexWrap: 'wrap', justifyContent: 'space-between', gap: 0 },
  statTouchFlex: { flex: 1, minWidth: 100 },
  statTouchHalf: { width: '48.5%', marginBottom: 12 },
  statBox: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 3.5,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  statValue: { fontFamily: fonts.bold, fontSize: fontSize.xl, marginTop: 6, lineHeight: 26 },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
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
  employeeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 4 },
  employeeBtnText: { fontFamily: fonts.medium, fontSize: 12, color: colors.white },
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
  emptyText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 12 },
  activeBadge: { fontFamily: fonts.medium, fontSize: 10, color: colors.white, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  emiChangePreview: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8 },
  emiChangePreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  emiChangePreviewTitle: { fontFamily: fonts.semiBold, fontSize: 12, color: '#D97706' },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  diffLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.text, width: 70 },
  diffOld: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, textDecorationLine: 'line-through' },
  diffNew: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.success },
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
