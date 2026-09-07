import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Modal, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import StatusBadge from '../../components/StatusBadge';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import { getLoan, getLoanMediaPreview, approveLoan, rejectLoan, approveEmiChange, rejectEmiChange, processLoan, returnLoan, disburseLoan, approveForeclosure } from '../../api/adminApi';
import LoanDetailsView from '../../components/LoanDetailsView';
import MediaViewer from '../../components/MediaViewer';
import { usePopup } from '../../context/PopupContext';
import { Ionicons } from '@expo/vector-icons';
import { payEmi } from '../../api/adminApi';
import { formatDate } from '../../utils/date';

export default function LoanDetailScreen({ route, navigation }) {
  const { showAlert } = usePopup();
  const rawParams = route.params || {};
  const loanId = rawParams.loanId || rawParams.params?.loanId || rawParams.loan?.loanId;
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [processModalVisible, setProcessModalVisible] = useState(false);
  const [internalRemarks, setInternalRemarks] = useState('');
  const [riskAssessment, setRiskAssessment] = useState('');
  const [disburseModalVisible, setDisburseModalVisible] = useState(false);
  const [disburseData, setDisburseData] = useState({ date: formatDate(new Date()), amount: '', bankName: '', transactionNumber: '' });
  const [payEmiModalVisible, setPayEmiModalVisible] = useState(false);
  const [payEmiData, setPayEmiData] = useState({ paymentId: '', amount: '', dueAmount: 0, paymentMode: 'Cash', txnRef: '' });

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
      console.error('Failed to load loan details:', err);
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

  const handleApprove = () => {
    navigation.navigate('InitialApprove', { loan });
  };

  const handleReturn = async () => {
    if (!returnReason.trim()) {
      showAlert('Error', 'Please enter a return reason.');
      return;
    }
    setProcessing(true);
    try {
      await returnLoan(loanId, returnReason.trim());
      setReturnModalVisible(false);
      await load();
      showAlert('Success', 'Loan returned to employee.');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to return loan.');
    } finally {
      setProcessing(false);
    }
  };

  const handleProcess = async () => {
    if (!internalRemarks.trim() || !riskAssessment.trim()) {
      showAlert('Error', 'Please fill all processing details.');
      return;
    }
    setProcessing(true);
    try {
      await processLoan(loanId, { internalRemarks, riskAssessment });
      setProcessModalVisible(false);
      await load();
      showAlert('Success', 'Loan moved to processing state.');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to process loan.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDisburse = async () => {
    if (!disburseData.amount || !disburseData.bankName || !disburseData.transactionNumber) {
      showAlert('Error', 'Please fill all disbursement details.');
      return;
    }
    setProcessing(true);
    try {
      await disburseLoan(loanId, disburseData);
      setDisburseModalVisible(false);
      await load();
      showAlert('Success', 'Disbursement recorded. Loan is now active.');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to disburse loan.');
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveForeclosure = async () => {
    setProcessing(true);
    try {
      await approveForeclosure(loanId);
      await load();
      showAlert('Success', 'Foreclosure approved and loan completed.');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to approve foreclosure.');
    } finally {
      setProcessing(false);
    }
  };

  const handlePayEmi = async () => {
    if (!payEmiData.amount || Number(payEmiData.amount) <= 0) {
      showAlert('Error', 'Please enter a valid amount.');
      return;
    }
    const mode = payEmiData.paymentMode || 'Cash';
    const cleanRef = (payEmiData.txnRef || '').trim();
    if (['UPI', 'Bank'].includes(mode) && !cleanRef) {
      showAlert('Required Field Missing', 'Transaction / UTR reference number is mandatory for UPI and Bank payments.');
      return;
    }
    setProcessing(true);
    try {
      await payEmi(loanId, payEmiData.paymentId, payEmiData.amount, mode, cleanRef);
      setPayEmiModalVisible(false);
      await load();
      showAlert('Success', 'EMI payment recorded.');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to record EMI payment.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      showAlert('Error', 'Please enter a reason for rejection.');
      return;
    }
    setProcessing(true);
    try {
      await rejectLoan(loanId, rejectReason.trim());
      setRejectModalVisible(false);
      await load();
      showAlert('Success', 'Loan rejected successfully.');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to reject loan.');
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveEmiChange = async () => {
    setProcessing(true);
    try {
      await approveEmiChange(loanId);
      await load();
      showAlert('Success', 'EMI change request approved. New terms applied.');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to approve EMI change.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectEmiChange = async () => {
    setProcessing(true);
    try {
      await rejectEmiChange(loanId);
      await load();
      showAlert('Success', 'EMI change request rejected.');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to reject EMI change.');
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
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <StatusBadge status={loan.status} />
        </View>
        <LoanDetailsView loan={loan} />
        <MediaViewer fetchMedia={() => getLoanMediaPreview(loan.loanId)} loanId={loan.loanId} onDocumentUploaded={load} />

        {loan.status === 'submitted' && (
          <View style={styles.actionContainer}>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => { setReturnReason(''); setReturnModalVisible(true); }} disabled={processing}>
              <Ionicons name="return-down-back-outline" size={20} color={colors.error} />
              <Text style={styles.rejectBtnText}>Return</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.approveBtn} onPress={() => { setInternalRemarks(''); setRiskAssessment(''); setProcessModalVisible(true); }} disabled={processing}>
              <Ionicons name="document-text-outline" size={20} color={colors.white} />
              <Text style={styles.approveBtnText}>Process Application</Text>
            </TouchableOpacity>
          </View>
        )}

        {loan.status === 'processing' && (
          <View style={styles.actionContainer}>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => { setRejectReason(''); setRejectModalVisible(true); }} disabled={processing}>
              <Ionicons name="close-circle-outline" size={20} color={colors.error} />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.approveBtn} onPress={handleApprove} disabled={processing}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />
              <Text style={styles.approveBtnText}>Approve Terms</Text>
            </TouchableOpacity>
          </View>
        )}

        {loan.status === 'approved' && (
          <View style={styles.actionContainer}>
            <TouchableOpacity style={styles.approveBtn} onPress={() => { setDisburseData({ date: formatDate(new Date()), amount: loan.approvedAmount || '', bankName: '', transactionNumber: '' }); setDisburseModalVisible(true); }} disabled={processing}>
              <Ionicons name="cash-outline" size={20} color={colors.white} />
              <Text style={styles.approveBtnText}>Record Disbursement</Text>
            </TouchableOpacity>
          </View>
        )}

        {loan.foreclosureRequest?.status === 'pending' && (
          <View style={styles.emiChangeCard}>
            <View style={styles.emiChangeHeader}>
              <Ionicons name="warning-outline" size={20} color="#991B1B" />
              <Text style={[styles.emiChangeTitle, { color: '#991B1B' }]}>Pending Foreclosure Request</Text>
            </View>
            <View style={styles.emiChangeBody}>
              <View style={styles.emiChangeRow}>
                <Text style={styles.emiChangeLabel}>Amount</Text>
                <Text style={styles.emiChangeValue}>₹{Number(loan.foreclosureRequest.foreclosureAmount || 0).toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.emiChangeRow}>
                <Text style={styles.emiChangeLabel}>Reason</Text>
                <Text style={[styles.emiChangeValue, { flex: 1, textAlign: 'right', marginLeft: 16 }]}>{loan.foreclosureRequest.reason}</Text>
              </View>
            </View>
            <View style={styles.actionContainer}>
              <TouchableOpacity style={styles.approveBtn} onPress={handleApproveForeclosure} disabled={processing}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />
                <Text style={styles.approveBtnText}>Approve Foreclosure</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loan.emiChangeRequest && loan.emiChangeRequest.status === 'pending' && (
          <View style={styles.emiChangeCard}>
            <View style={styles.emiChangeHeader}>
              <Ionicons name="calculator" size={20} color="#0369A1" />
              <Text style={styles.emiChangeTitle}>Pending EMI Change Request</Text>
            </View>
            <View style={styles.emiChangeBody}>
              <View style={styles.emiChangeRow}>
                <Text style={styles.emiChangeLabel}>Proposed Principal</Text>
                <Text style={styles.emiChangeValue}>₹{Number(loan.emiChangeRequest.approvedAmount || 0).toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.emiChangeRow}>
                <Text style={styles.emiChangeLabel}>Proposed EMI</Text>
                <Text style={styles.emiChangeValue}>₹{Number(loan.emiChangeRequest.emiAmount || 0).toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.emiChangeRow}>
                <Text style={styles.emiChangeLabel}>Proposed Tenure</Text>
                <Text style={styles.emiChangeValue}>{loan.emiChangeRequest.tenureMonths} months</Text>
              </View>
            </View>
            
            <View style={styles.actionContainer}>
              <TouchableOpacity style={styles.rejectBtn} onPress={handleRejectEmiChange} disabled={processing}>
                <Ionicons name="close-circle-outline" size={20} color={colors.error} />
                <Text style={styles.rejectBtnText}>Reject Change</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.approveBtn} onPress={handleApproveEmiChange} disabled={processing}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />
                <Text style={styles.approveBtnText}>Approve Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loan.emis && loan.emis.length > 0 && (
          <View style={[styles.emiChangeCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', marginTop: 0 }]}>
            <View style={styles.emiChangeHeader}>
              <Ionicons name="calendar-outline" size={20} color="#15803D" />
              <Text style={[styles.emiChangeTitle, { color: '#15803D' }]}>EMI Schedule</Text>
            </View>
            <View style={styles.emiChangeBody}>
              {loan.emis.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).map((emi, idx) => {
                const totalDue = Number(emi.amount) + Number(emi.penaltyAmount || 0);
                const isPaid = emi.status === 'paid';
                return (
                  <View key={emi.paymentId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: idx !== loan.emis.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.dark }}>Due: {formatDate(emi.dueDate)}</Text>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.muted }}>Status: {emi.status.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: isPaid ? colors.success : colors.error }}>₹{totalDue.toLocaleString('en-IN')}</Text>
                      {emi.paidAmount > 0 && <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.success }}>Paid: ₹{Number(emi.paidAmount).toLocaleString('en-IN')}</Text>}
                      {emi.penaltyAmount > 0 && <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.error }}>Penalty: ₹{Number(emi.penaltyAmount).toLocaleString('en-IN')}</Text>}
                    </View>
                    {!isPaid && loan.status === 'active' && (
                      <TouchableOpacity 
                        style={{ marginLeft: 12, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                        onPress={() => {
                          setPayEmiData({
                            paymentId: emi.paymentId,
                            amount: (totalDue - (emi.paidAmount || 0)).toString(),
                            dueAmount: totalDue - (emi.paidAmount || 0),
                            paymentMode: 'Cash',
                            txnRef: '',
                          });
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

      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reject Loan</Text>
            <Text style={styles.modalSubtitle}>Please enter the remarks/reason for rejection. This will be visible to the employee.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Incomplete documents, mismatch in address..."
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRejectModalVisible(false)} disabled={processing}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleReject} disabled={processing}>
                {processing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Reject Loan</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={returnModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Return Application</Text>
            <Text style={styles.modalSubtitle}>Enter the reason for returning the application to the employee.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Needs clearer photos of property..."
              value={returnReason}
              onChangeText={setReturnReason}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setReturnModalVisible(false)} disabled={processing}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleReturn} disabled={processing}>
                {processing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Return</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={processModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Process Application</Text>
            <Text style={styles.modalSubtitle}>Enter internal verification and risk assessment details.</Text>
            <TextInput
              style={styles.modalInputSmall}
              placeholder="Internal Remarks"
              value={internalRemarks}
              onChangeText={setInternalRemarks}
            />
            <TextInput
              style={styles.modalInputSmall}
              placeholder="Risk Assessment (e.g. Low, Medium, High)"
              value={riskAssessment}
              onChangeText={setRiskAssessment}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setProcessModalVisible(false)} disabled={processing}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: colors.primary }]} onPress={handleProcess} disabled={processing}>
                {processing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Process</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={disburseModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Record Disbursement</Text>
            <Text style={styles.modalSubtitle}>Enter bank transaction details to mark this loan as Active.</Text>
            <TextInput
              style={styles.modalInputSmall}
              placeholder="Date (DD/MM/YYYY)"
              value={disburseData.date}
              onChangeText={t => setDisburseData({...disburseData, date: t})}
            />
            <TextInput
              style={styles.modalInputSmall}
              placeholder="Amount (₹)"
              value={disburseData.amount?.toString()}
              onChangeText={t => setDisburseData({...disburseData, amount: t})}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.modalInputSmall}
              placeholder="Bank Name"
              value={disburseData.bankName}
              onChangeText={t => setDisburseData({...disburseData, bankName: t})}
            />
            <TextInput
              style={styles.modalInputSmall}
              placeholder="Transaction Number / UTR"
              value={disburseData.transactionNumber}
              onChangeText={t => setDisburseData({...disburseData, transactionNumber: t})}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setDisburseModalVisible(false)} disabled={processing}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: colors.primary }]} onPress={handleDisburse} disabled={processing}>
                {processing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Disburse</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={payEmiModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Receive Payment</Text>
            <Text style={styles.modalSubtitle}>Enter the amount received from the customer. Remaining due: ₹{payEmiData.dueAmount}</Text>
            
            <TextInput
              style={styles.modalInputSmall}
              placeholder="Amount (₹)"
              value={payEmiData.amount?.toString()}
              onChangeText={t => setPayEmiData({...payEmiData, amount: t})}
              keyboardType="numeric"
            />

            <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginTop: 12, marginBottom: 6 }}>
              Payment Mode *
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {['Cash', 'UPI', 'Bank'].map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: payEmiData.paymentMode === mode ? colors.primary : colors.border,
                    backgroundColor: payEmiData.paymentMode === mode ? colors.primary : colors.white,
                    alignItems: 'center',
                  }}
                  onPress={() => setPayEmiData({ ...payEmiData, paymentMode: mode })}
                >
                  <Text
                    style={{
                      fontFamily: fonts.semiBold,
                      fontSize: 13,
                      color: payEmiData.paymentMode === mode ? colors.white : colors.text,
                    }}
                  >
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginBottom: 6 }}>
              {['UPI', 'Bank'].includes(payEmiData.paymentMode)
                ? 'Transaction / UTR Reference * (Mandatory)'
                : 'Receipt / Reference (Optional for Cash)'}
            </Text>
            <TextInput
              style={[styles.modalInputSmall, { marginBottom: 16 }]}
              placeholder={
                ['UPI', 'Bank'].includes(payEmiData.paymentMode)
                  ? 'Enter mandatory UTR / Bank Reference No.'
                  : 'Optional receipt / slip number'
              }
              value={payEmiData.txnRef}
              onChangeText={t => setPayEmiData({ ...payEmiData, txnRef: t })}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setPayEmiModalVisible(false)} disabled={processing}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: colors.primary }]} onPress={handlePayEmi} disabled={processing}>
                {processing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Confirm Payment</Text>}
              </TouchableOpacity>
            </View>
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
  label: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.text },
  field: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.text, marginBottom: 8 },
  note: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 16 },
  actionContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16, marginBottom: 24 },
  rejectBtn: { flex: 1, minWidth: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FEF2F2', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.error },
  rejectBtnText: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: colors.error, textAlign: 'center', flexShrink: 1 },
  approveBtn: { flex: 1, minWidth: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.success, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12 },
  approveBtnText: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: colors.white, textAlign: 'center', flexShrink: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.white, borderRadius: 16, padding: 20 },
  modalTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginBottom: 8 },
  modalSubtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginBottom: 16 },
  modalInput: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: 'top', fontSize: 14, color: colors.text, marginBottom: 20 },
  modalInputSmall: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.text, marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  modalCancelText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.text },
  modalSubmit: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: colors.error },
  modalSubmitText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.white },
  emiChangeCard: { backgroundColor: '#E0F2FE', borderRadius: 12, padding: 16, marginTop: 16, marginBottom: 24, borderWidth: 1, borderColor: '#BAE6FD' },
  emiChangeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  emiChangeTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: '#0369A1' },
  emiChangeBody: { backgroundColor: colors.white, borderRadius: 8, padding: 12, marginBottom: 16 },
  emiChangeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  emiChangeLabel: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.text },
  emiChangeValue: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: '#0284C7' },
  statusStateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  statusStateText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, marginTop: 12 },
  statusStateTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginTop: 12, marginBottom: 6 },
  statusStateSubtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.white },
});
