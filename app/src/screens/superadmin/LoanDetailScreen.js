import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../components/Header';
import StatusBadge from '../../components/StatusBadge';
import LoanDetailsView from '../../components/LoanDetailsView';
import MediaViewer from '../../components/MediaViewer';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import { getLoan, getMediaPreview } from '../../api/superadminApi';
import { formatDate } from '../../utils/date';

export default function LoanDetailScreen({ route }) {
  const rawParams = route.params || {};
  const loanId = rawParams.loanId || rawParams.params?.loanId || rawParams.loan?.loanId;
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  const load = useCallback(async () => {
    if (!loanId) {
      setLoading(false);
      setErrorMessage('Loan ID is missing or invalid.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await getLoan(loanId);
      setLoan(data);
    } catch (err) {
      console.error('Failed to load superadmin loan:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to load loan details.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!loan) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <Header title="Loan Details" onBack={() => navigation.goBack()} />
        {loading ? (
          <View style={styles.statusStateContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusStateText}>Loading loan details...</Text>
          </View>
        ) : (
          <View style={styles.statusStateContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
            <Text style={styles.statusStateTitle}>Unable to Load Loan</Text>
            <Text style={styles.statusStateSubtitle}>
              {errorMessage || 'Loan details could not be loaded.'}
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Ionicons name="refresh" size={16} color={colors.white} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={loan.displayLoanId || loan.applicationNumber || loan.loanId} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Application Status</Text>
          <StatusBadge status={loan.status} />
        </View>

        {/* Creator & Admin Details Card */}
        <View style={styles.assignmentCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="people" size={18} color={colors.primary} />
            <Text style={styles.cardHeaderTitle}>Management & Ownership</Text>
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Assigned Admin</Text>
              <Text style={styles.infoValue}>{loan.adminName || 'Unassigned'}</Text>
              {loan.adminMobile ? <Text style={styles.infoSub}>{loan.adminMobile}</Text> : null}
              {loan.adminEmail ? <Text style={styles.infoSub}>{loan.adminEmail}</Text> : null}
            </View>
            <View style={styles.divider} />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Created By Employee</Text>
              <Text style={styles.infoValue}>{loan.employeeName || 'Unassigned'}</Text>
              {loan.employeeMobile ? <Text style={styles.infoSub}>{loan.employeeMobile}</Text> : null}
              {loan.employeeEmail ? <Text style={styles.infoSub}>{loan.employeeEmail}</Text> : null}
            </View>
          </View>
        </View>

        {/* Full Loan Details Component */}
        <LoanDetailsView loan={loan} />

        {/* Media & Documents Gallery Component */}
        <MediaViewer fetchMedia={() => getMediaPreview(loan.loanId)} loanId={loan.loanId} onDocumentUploaded={load} />

        {/* EMI Repayment Schedule */}
        {loan.emis && loan.emis.length > 0 && (
          <View style={styles.emiCard}>
            <View style={styles.emiHeader}>
              <Ionicons name="calendar-outline" size={20} color="#15803D" />
              <Text style={styles.emiTitle}>EMI Repayment Schedule ({loan.emis.length} Months)</Text>
            </View>
            <View style={styles.emiBody}>
              {loan.emis.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).map((emi, idx) => {
                const totalDue = Number(emi.amount || 0) + Number(emi.penaltyAmount || 0);
                const isPaid = emi.status === 'paid';
                return (
                  <View key={emi.paymentId || idx} style={[styles.emiRow, idx !== loan.emis.length - 1 && styles.borderBottom]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dueDateText}>Due: {formatDate(emi.dueDate)}</Text>
                      <Text style={styles.statusText}>Status: {(emi.status || 'pending').toUpperCase()}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.amountText, { color: isPaid ? colors.success : colors.error }]}>
                        ₹{totalDue.toLocaleString('en-IN')}
                      </Text>
                      {emi.paidAmount > 0 && (
                        <Text style={styles.subAmountPaid}>Paid: ₹{Number(emi.paidAmount).toLocaleString('en-IN')}</Text>
                      )}
                      {emi.penaltyAmount > 0 && (
                        <Text style={styles.subAmountPenalty}>Penalty: ₹{Number(emi.penaltyAmount).toLocaleString('en-IN')}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 16 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusLabel: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.text },
  assignmentCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.inputBg, paddingBottom: 8 },
  cardHeaderTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.dark, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoGrid: { flexDirection: 'row', alignItems: 'center' },
  infoCol: { flex: 1 },
  divider: { width: 1, backgroundColor: '#E2E8F0', height: '80%', marginHorizontal: 12 },
  infoLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginBottom: 2 },
  infoValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.dark },
  infoSub: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 1 },
  emiCard: { backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#BBF7D0' },
  emiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  emiTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: '#15803D' },
  emiBody: { backgroundColor: colors.white, borderRadius: 12, padding: 12 },
  emiRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: colors.border },
  dueDateText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.dark },
  statusText: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 2 },
  amountText: { fontFamily: fonts.bold, fontSize: 14 },
  subAmountPaid: { fontFamily: fonts.regular, fontSize: 11, color: colors.success, marginTop: 1 },
  subAmountPenalty: { fontFamily: fonts.regular, fontSize: 11, color: colors.error, marginTop: 1 },
  statusStateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  statusStateText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, marginTop: 12 },
  statusStateTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginTop: 12, marginBottom: 6 },
  statusStateSubtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.white },
});
