import React, { useCallback, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import StatusBadge from '../../components/StatusBadge';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { getLoan, getLoanMediaPreview, requestForeclosure, payEmi } from '../../api/employeeApi';
import { usePopup } from '../../context/PopupContext';
import LoanDetailsView from '../../components/LoanDetailsView';
import MediaViewer from '../../components/MediaViewer';
import { formatDate, getTodayFormatted } from '../../utils/date';
import CalendarPicker from '../../components/CalendarPicker';

export default function LoanDetailScreen({ route, navigation }) {
  const rawParams = route.params || {};
  const scrollRef = useRef(null);
  const loanId = rawParams.loanId || rawParams.params?.loanId || rawParams.loan?.loanId;
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const { showAlert } = usePopup();
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [foreclosureModalVisible, setForeclosureModalVisible] = useState(false);
  const [foreclosureData, setForeclosureData] = useState({ amount: '', reason: '' });
  const [payEmiModalVisible, setPayEmiModalVisible] = useState(false);
  const [payEmiData, setPayEmiData] = useState({ paymentId: '', amount: '', dueAmount: 0, paymentMode: 'Cash', txnRef: '', paymentDate: '' });
  const [activeDatePicker, setActiveDatePicker] = useState(null);

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
      console.error('Failed to load employee loan:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to load loan details.';
      setErrorMessage(msg);
      showAlert('Unable to Load Loan', msg);
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

  const handleRequestForeclosure = async () => {
    if (!foreclosureData.amount || !foreclosureData.reason.trim()) {
      showAlert('Error', 'Please enter foreclosure amount and reason.');
      return;
    }
    setProcessing(true);
    try {
      await requestForeclosure(loanId, { foreclosureAmount: foreclosureData.amount, reason: foreclosureData.reason });
      setForeclosureModalVisible(false);
      await load();
      showAlert('Success', 'Foreclosure request submitted to Admin.');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to request foreclosure.');
    } finally {
      setProcessing(false);
    }
  };

  const handlePayEmi = async () => {
    if (!payEmiData.amount || Number(payEmiData.amount) <= 0) {
      showAlert('Error', 'Please enter a valid payment amount.');
      return;
    }
    if (!payEmiData.txnRef || !payEmiData.txnRef.trim()) {
      showAlert(
        'Receipt Reference Mandatory',
        'Receipt / Reference number is mandatory for all payments. Please enter a valid number to prevent duplicate entries.',
      );
      return;
    }
    setProcessing(true);
    try {
      await payEmi(
        loanId,
        payEmiData.paymentId,
        Number(payEmiData.amount),
        payEmiData.paymentMode,
        payEmiData.txnRef.trim(),
        payEmiData.paymentDate || getTodayFormatted(),
      );
      setPayEmiModalVisible(false);
      setActiveDatePicker(null);
      await load();
      showAlert('Success', 'Payment recorded successfully.');
    } catch (error) {
      showAlert('Payment Error', error.response?.data?.message || error.message || 'Failed to record payment.');
    } finally {
      setProcessing(false);
    }
  };

  if (!loan) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <Header title="Loan" onBack={() => navigation.goBack()} />
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
        ref={scrollRef}
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <StatusBadge status={loan.status} />
        </View>

        {['draft', 'in_progress', 'saved', 'returned'].includes(loan.status) && (
          <TouchableOpacity 
            style={styles.continueCardBtn} 
            onPress={() => navigation.navigate('NewLoan', { existingLoan: loan })}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-forward-circle" size={24} color={colors.white} />
            <Text style={styles.continueCardBtnText}>Continue Filling Application</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        )}

        <LoanDetailsView loan={loan} />
        <MediaViewer fetchMedia={() => getLoanMediaPreview(loan.loanId)} loanId={loan.loanId} onDocumentUploaded={load} />

        {loan.emiChangeRequest && loan.emiChangeRequest.status === 'pending' && (
          <View style={styles.pendingBanner}>
            <Ionicons name="time-outline" size={20} color="#B45309" />
            <Text style={styles.pendingText}>EMI Change Request Pending Approval</Text>
          </View>
        )}

        {loan.emiChangeRequest && loan.emiChangeRequest.status === 'approved' && (
          <View style={[styles.pendingBanner, { backgroundColor: '#D1FAE5', borderColor: '#A7F3D0' }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#047857" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.pendingText, { color: '#065F46' }]}>Admin has approved your EMI change request.</Text>
              <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: '#047857', marginTop: 4 }}>
                Final EMI: ₹{Number(loan.emiChangeRequest.emiAmount || 0).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        )}

        {loan.emiChangeRequest && loan.emiChangeRequest.status === 'rejected' && (
          <View style={[styles.pendingBanner, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
            <Ionicons name="close-circle-outline" size={20} color="#B91C1C" />
            <Text style={[styles.pendingText, { color: '#991B1B' }]}>Admin rejected your EMI change request.</Text>
          </View>
        )}

        {['draft', 'in_progress', 'saved', 'returned'].includes(loan.status) && (
          <TouchableOpacity 
            style={styles.editBtn} 
            onPress={() => navigation.navigate('NewLoan', { existingLoan: loan })}
          >
            <Ionicons name="create-outline" size={20} color={colors.white} />
            <Text style={styles.editBtnText}>Continue Filling Application</Text>
          </TouchableOpacity>
        )}

        {['approved', 'active'].includes(loan.status) && (!loan.emiChangeRequest || loan.emiChangeRequest.status !== 'pending') && (
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 24 }}>
            <TouchableOpacity 
              style={[styles.emiBtn, { flex: 1, marginTop: 0, marginBottom: 0 }]} 
              onPress={() => navigation.navigate('EmiChangeRequest', { loan })}
            >
              <Ionicons name="calculator-outline" size={20} color={colors.white} />
              <Text style={styles.emiBtnText}>Change EMI</Text>
            </TouchableOpacity>

            {(!loan.foreclosureRequest || loan.foreclosureRequest.status !== 'pending') && (
              <TouchableOpacity 
                style={[styles.emiBtn, { flex: 1, marginTop: 0, marginBottom: 0, backgroundColor: '#991B1B' }]} 
                onPress={() => setForeclosureModalVisible(true)}
              >
                <Ionicons name="warning-outline" size={20} color={colors.white} />
                <Text style={styles.emiBtnText}>Foreclose</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {loan.emis && loan.emis.length > 0 && (
          <View
            onLayout={(e) => {
              if (rawParams.scrollToEmi) {
                setTimeout(() => {
                  scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 20), animated: true });
                }, 250);
              }
            }}
            style={[styles.emiChangeCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', marginTop: 16 }]}
          >
            <View style={styles.emiChangeHeader}>
              <Ionicons name="calendar-outline" size={20} color="#15803D" />
              <Text style={[styles.emiChangeTitle, { color: '#15803D' }]}>EMI Schedule</Text>
            </View>
            <View style={styles.emiChangeBody}>
              {[...(loan.emis || [])].sort((a, b) => new Date(a?.dueDate || 0) - new Date(b?.dueDate || 0)).map((emi, idx) => {
                const totalDue = Number(emi.amount) + Number(emi.penaltyAmount || 0);
                const isPaid = emi.status === 'paid';
                return (
                  <View key={emi.paymentId || idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: idx !== loan.emis.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.dark }}>Due: {formatDate(emi.dueDate)}</Text>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>Status: {emi.status.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: isPaid ? colors.success : colors.error }}>₹{totalDue.toLocaleString('en-IN')}</Text>
                      {emi.paidAmount > 0 && <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.success }}>Paid: ₹{Number(emi.paidAmount).toLocaleString('en-IN')}</Text>}
                      {emi.penaltyAmount > 0 && <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.error }}>Penalty: ₹{Number(emi.penaltyAmount).toLocaleString('en-IN')}</Text>}
                    </View>
                    {!isPaid && (loan.status === 'active' || loan.status === 'approved') && (
                      <TouchableOpacity 
                        style={{ marginLeft: 12, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                        onPress={() => {
                          setPayEmiData({
                            paymentId: emi.paymentId,
                            amount: (totalDue - (emi.paidAmount || 0)).toString(),
                            dueAmount: totalDue - (emi.paidAmount || 0),
                            paymentMode: 'Cash',
                            txnRef: '',
                            paymentDate: getTodayFormatted(),
                          });
                          setActiveDatePicker(null);
                          setPayEmiModalVisible(true);
                        }}
                      >
                        <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.white }}>Pay</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Foreclosure Modal */}
      <Modal visible={foreclosureModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Request Foreclosure</Text>
            <Text style={styles.modalSubtitle}>Enter the settled amount and the reason for closing this loan.</Text>
            <TextInput
              style={styles.modalInputSmall}
              placeholder="Amount (₹)"
              placeholderTextColor={colors.placeholder || '#4B5563'}
              value={foreclosureData.amount}
              onChangeText={t => setForeclosureData({...foreclosureData, amount: t})}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Reason for foreclosure"
              placeholderTextColor={colors.placeholder || '#4B5563'}
              value={foreclosureData.reason}
              onChangeText={t => setForeclosureData({...foreclosureData, reason: t})}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setForeclosureModalVisible(false)} disabled={processing}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: '#991B1B' }]} onPress={handleRequestForeclosure} disabled={processing}>
                {processing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Request</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pay EMI Modal */}
      <Modal visible={payEmiModalVisible} transparent animationType="fade" onRequestClose={() => { setActiveDatePicker(null); setPayEmiModalVisible(false); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {activeDatePicker === 'payEmiDate' ? (
              <CalendarPicker
                title="Select Payment Received Date"
                value={payEmiData.paymentDate || getTodayFormatted()}
                onSelect={(d) => {
                  setPayEmiData({ ...payEmiData, paymentDate: d });
                  setActiveDatePicker(null);
                }}
                onClose={() => setActiveDatePicker(null)}
              />
            ) : (
              <>
                <Text style={styles.modalTitle}>Receive EMI Payment</Text>
                <Text style={styles.modalSubtitle}>Record EMI installment repayment from borrower.</Text>

                <Text style={styles.fieldLabel}>Payment Received Date</Text>
                <TouchableOpacity
                  style={styles.datePickerInput}
                  onPress={() => setActiveDatePicker('payEmiDate')}
                >
                  <Text style={styles.datePickerValueText}>
                    {payEmiData.paymentDate || getTodayFormatted()}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                </TouchableOpacity>

                <Text style={styles.fieldLabel}>Payment Mode</Text>
                <View style={styles.modeRow}>
                  {['Cash', 'UPI', 'Bank'].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.modeChip, payEmiData.paymentMode === m && styles.modeChipActive]}
                      onPress={() => setPayEmiData({ ...payEmiData, paymentMode: m })}
                    >
                      <Text style={[styles.modeTxt, payEmiData.paymentMode === m && styles.modeTxtActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>
                  Receipt / Transaction Ref <Text style={{ color: colors.error }}>*</Text>
                </Text>
                <TextInput
                  style={styles.modalInputSmall}
                  placeholder="Receipt / Transaction No. (Required)"
                  placeholderTextColor={colors.placeholder || '#4B5563'}
                  value={payEmiData.txnRef}
                  onChangeText={(t) => setPayEmiData({ ...payEmiData, txnRef: t })}
                  autoCapitalize="characters"
                />

                <Text style={styles.fieldLabel}>Amount (₹)</Text>
                <TextInput
                  style={styles.modalInputSmall}
                  placeholder="Amount (₹)"
                  placeholderTextColor={colors.placeholder || '#4B5563'}
                  value={payEmiData.amount}
                  onChangeText={(t) => setPayEmiData({ ...payEmiData, amount: t })}
                  keyboardType="numeric"
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancel} onPress={() => setPayEmiModalVisible(false)} disabled={processing}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: colors.primary }]} onPress={handlePayEmi} disabled={processing}>
                    {processing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Confirm Payment</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  continueCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#047857',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 10,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  continueCardBtnText: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.white,
  },
  label: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.text },
  field: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.text, marginBottom: 8 },
  note: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 16 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark, paddingVertical: 14, borderRadius: 12, gap: 8, marginTop: 16, marginBottom: 24 },
  editBtnText: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.white },
  emiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, gap: 8, marginTop: 16, marginBottom: 24 },
  emiBtnText: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.white },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', padding: 12, borderRadius: 8, marginBottom: 16, gap: 8, borderWidth: 1, borderColor: '#FDE68A' },
  pendingText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: '#B45309' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.white, borderRadius: 16, padding: 20 },
  modalTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginBottom: 8 },
  modalSubtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginBottom: 16 },
  modalInputSmall: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.text, marginBottom: 12 },
  modalInput: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: 'top', fontSize: 14, color: colors.text, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  modalCancelText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.text },
  modalSubmit: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  modalSubmitText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.white },
  statusStateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  statusStateText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, marginTop: 12 },
  statusStateTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginTop: 12, marginBottom: 6 },
  statusStateSubtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.white },
  emiChangeCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  emiChangeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  emiChangeTitle: { fontFamily: fonts.bold, fontSize: fontSize.base },
  emiChangeBody: { gap: 4 },
  fieldLabel: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.text, marginBottom: 6 },
  datePickerInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  datePickerValueText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeChip: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg, alignItems: 'center' },
  modeChipActive: { borderColor: colors.dark, backgroundColor: colors.dark },
  modeTxt: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  modeTxtActive: { color: colors.white, fontFamily: fonts.bold },
});
