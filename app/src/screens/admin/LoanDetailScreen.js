import React, { useCallback, useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Modal, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import StatusBadge from '../../components/StatusBadge';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import { getLoan, getLoanMediaPreview, approveLoan, rejectLoan, approveEmiChange, rejectEmiChange, processLoan, returnLoan, disburseLoan, approveForeclosure, updateLoanDates, forecloseLoan, changeLoanEmi } from '../../api/adminApi';
import LoanDetailsView from '../../components/LoanDetailsView';
import MediaViewer from '../../components/MediaViewer';
import { usePopup } from '../../context/PopupContext';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, getTodayFormatted } from '../../utils/date';
import CalendarPicker from '../../components/CalendarPicker';
import CollectEmiModal from '../../components/CollectEmiModal';
import EmiScheduleLedger from '../../components/EmiScheduleLedger';

export default function LoanDetailScreen({ route, navigation }) {
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const disburseScrollRef = useRef(null);
  const payEmiScrollRef = useRef(null);
  const changeEmiScrollRef = useRef(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates ? e.endCoordinates.height : 280);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const isKeyboardVisible = keyboardHeight > 0;
  const modalMaxHeight = isKeyboardVisible
    ? Math.max(220, windowHeight - keyboardHeight - (Platform.OS === 'android' ? 48 : 64))
    : Math.min(windowHeight * 0.88, 620);

  const { showAlert } = usePopup();
  const rawParams = route.params || {};
  const scrollRef = useRef(null);
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
  const [disburseData, setDisburseData] = useState({ date: formatDate(new Date()), amount: '', bankName: '', transactionNumber: '', remark: '' });
  const [payEmiModalVisible, setPayEmiModalVisible] = useState(false);
  const [selectedPayEmi, setSelectedPayEmi] = useState(null);
  const [editDatesModalVisible, setEditDatesModalVisible] = useState(false);
  const [datesData, setDatesData] = useState({ disbursementDate: '', emiStartDate: '' });
  const [activeDatePicker, setActiveDatePicker] = useState(null);

  const [forecloseModalVisible, setForecloseModalVisible] = useState(false);
  const [foreclosureData, setForeclosureData] = useState({ amount: '', reason: '' });
  const [changeEmiModalVisible, setChangeEmiModalVisible] = useState(false);
  const [changeEmiData, setChangeEmiData] = useState({
    principal: '',
    tenure: '',
    interestRate: '',
    penaltyRate: '',
    emiAmount: 0,
    totalInterest: 0,
    totalRepayable: 0
  });


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

  const handleApproveForeclosure = () => {
    navigation.navigate('ForecloseLoan', {
      loan,
      loanId,
      onSettled: () => {
        load();
      }
    });
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

  const calculateAdminEmi = (pVal, tVal, rVal) => {
    const p = parseFloat(pVal) || 0;
    const t = parseInt(tVal, 10) || 0;
    const r = parseFloat(rVal) || 0;
    const interest = p * (r / 100) * t;
    const repayable = p + interest;
    const emi = t > 0 ? Math.round(repayable / t) : 0;
    return { emiAmount: emi, totalInterest: interest, totalRepayable: repayable };
  };

  const handleOpenChangeEmiModal = () => {
    const p = loan.approvedAmount || loan.loanAmount || '';
    const t = loan.tenureMonths || loan.repaymentMonths || '12';
    const r = loan.interestRate || '2.15';
    const pr = loan.penaltyRate || '0.5';
    const calc = calculateAdminEmi(p, t, r);
    setChangeEmiData({
      principal: p ? p.toString() : '',
      tenure: t ? t.toString() : '',
      interestRate: r ? r.toString() : '',
      penaltyRate: pr ? pr.toString() : '',
      ...calc
    });
    setChangeEmiModalVisible(true);
  };

  const handleOpenForeclosureModal = () => {
    navigation.navigate('ForecloseLoan', {
      loan,
      loanId,
      onSettled: () => {
        load();
      }
    });
  };

  const handleDirectChangeEmi = async () => {
    if (!changeEmiData.principal || !changeEmiData.tenure || !changeEmiData.interestRate) {
      showAlert('Error', 'Please fill in all calculation fields.');
      return;
    }
    setProcessing(true);
    try {
      await changeLoanEmi(loanId, {
        approvedAmount: parseFloat(changeEmiData.principal),
        tenureMonths: parseInt(changeEmiData.tenure, 10),
        interestRate: parseFloat(changeEmiData.interestRate),
        penaltyRate: parseFloat(changeEmiData.penaltyRate || '0.5'),
        emiAmount: changeEmiData.emiAmount,
        totalInterest: changeEmiData.totalInterest,
        totalRepayable: changeEmiData.totalRepayable
      });
      setChangeEmiModalVisible(false);
      await load();
      showAlert('Success', 'EMI terms updated and remaining schedule recalculated.');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to update EMI terms.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveDates = async () => {
    if (!datesData.disbursementDate && !datesData.emiStartDate) {
      showAlert('Error', 'Please enter at least one valid date.');
      return;
    }
    setProcessing(true);
    try {
      await updateLoanDates(loanId, datesData);
      setEditDatesModalVisible(false);
      await load();
      showAlert('Success', 'Disbursement Date and EMI Start Date updated successfully.');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to update dates.');
    } finally {
      setProcessing(false);
    }
  };

  const cleanDateStr = (d) => {
    if (!d) return '';
    return formatDate(d);
  };

  const handleOpenEditDates = () => {
    const rawDisbDate = loan.disbursements?.[0]?.date || loan.disbursementDate || new Date();
    const rawEmiDate = loan.emiStartDate || loan.loanStartDate || new Date();
    setDatesData({ disbursementDate: cleanDateStr(rawDisbDate), emiStartDate: cleanDateStr(rawEmiDate) });
    setActiveDatePicker(null);
    setEditDatesModalVisible(true);
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
  const isFirstEmiCollected = Boolean(
    loan?.firstEmiCollected ||
    loan?.emis?.some(e => e.status === 'paid' || e.status === 'partial' || Number(e.paidAmount || 0) > 0)
  );

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

        {isFirstEmiCollected && (
          <View style={[styles.lockedBanner, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#15803D" />
            <Text style={[styles.lockedBannerText, { color: '#15803D' }]}>
              First EMI collected. Application details and media are locked for employees.
            </Text>
          </View>
        )}

        <LoanDetailsView loan={loan} onEditDates={handleOpenEditDates} />

        <MediaViewer
          fetchMedia={() => getLoanMediaPreview(loan.loanId)}
          loanId={loan.loanId}
          onDocumentUploaded={load}
          allowUpload={true}
          loanStatus={loan.status}
          isFirstEmiCollected={false}
        />

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
            <TouchableOpacity style={styles.approveBtn} onPress={() => { setDisburseData({ date: formatDate(new Date()), amount: loan.approvedAmount || '', bankName: '', transactionNumber: '', remark: '' }); setDisburseModalVisible(true); }} disabled={processing}>
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

        {['approved', 'active'].includes(loan.status) && loan.status !== 'completed' && (
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, marginBottom: 16 }}>
            {(!loan.emiChangeRequest || loan.emiChangeRequest.status !== 'pending') && (
              <TouchableOpacity 
                style={[styles.approveBtn, { flex: 1, backgroundColor: '#0284C7', minWidth: 120 }]} 
                onPress={handleOpenChangeEmiModal}
                disabled={processing}
              >
                <Ionicons name="calculator-outline" size={18} color={colors.white} />
                <Text style={styles.approveBtnText}>Change EMI</Text>
              </TouchableOpacity>
            )}

            {(!loan.foreclosureRequest || loan.foreclosureRequest.status !== 'pending') && (
              <TouchableOpacity 
                style={[styles.approveBtn, { flex: 1, backgroundColor: '#991B1B', minWidth: 120 }]} 
                onPress={handleOpenForeclosureModal}
                disabled={processing}
              >
                <Ionicons name="warning-outline" size={18} color={colors.white} />
                <Text style={styles.approveBtnText}>Foreclose</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {['approved', 'active', 'completed', 'foreclosed'].includes(loan.status) && loan.emis && loan.emis.length > 0 && (
          <View
            onLayout={(e) => {
              if (rawParams.scrollToEmi) {
                setTimeout(() => {
                  scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 20), animated: true });
                }, 250);
              }
            }}
            style={{ marginTop: 16 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="calendar" size={20} color={colors.primary} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.dark }}>EMI Schedule & Repayment Ledger</Text>
            </View>
            <EmiScheduleLedger
              emis={loan.emis}
              loan={loan}
              canCollect={Boolean((loan.status === 'active' || (Array.isArray(loan.disbursements) && loan.disbursements.length > 0) || loan.disbursementDate) && loan.status !== 'completed' && loan.status !== 'foreclosed' && !loan.isForeclosed)}
              onPayEmi={(targetEmi) => {
                setSelectedPayEmi(targetEmi);
                setPayEmiModalVisible(true);
              }}
            />
          </View>
        )}

      </ScrollView>

      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalOverlay, isKeyboardVisible && styles.modalOverlayKeyboard]}
        >
          <View style={[styles.modalContent, { maxHeight: modalMaxHeight }]}>
            <ScrollView
              style={{ flexShrink: 1 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              <Text style={styles.modalTitle}>Reject Loan</Text>
              <Text style={styles.modalSubtitle}>Please enter the remarks/reason for rejection. This will be visible to the employee.</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Incomplete documents, mismatch in address..."
                placeholderTextColor={colors.placeholder || '#4B5563'}
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={returnModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalOverlay, isKeyboardVisible && styles.modalOverlayKeyboard]}
        >
          <View style={[styles.modalContent, { maxHeight: modalMaxHeight }]}>
            <ScrollView
              style={{ flexShrink: 1 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              <Text style={styles.modalTitle}>Return Application</Text>
              <Text style={styles.modalSubtitle}>Enter the reason for returning the application to the employee.</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Needs clearer photos of property..."
                placeholderTextColor={colors.placeholder || '#4B5563'}
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={processModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalOverlay, isKeyboardVisible && styles.modalOverlayKeyboard]}
        >
          <View style={[styles.modalContent, { maxHeight: modalMaxHeight }]}>
            <ScrollView
              style={{ flexShrink: 1 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              <Text style={styles.modalTitle}>Process Application</Text>
              <Text style={styles.modalSubtitle}>Enter internal verification and risk assessment details.</Text>
              <TextInput
                style={styles.modalInputSmall}
                placeholder="Internal Remarks"
                placeholderTextColor={colors.placeholder || '#4B5563'}
                value={internalRemarks}
                onChangeText={setInternalRemarks}
              />
              <TextInput
                style={styles.modalInputSmall}
                placeholder="Risk Assessment (e.g. Low, Medium, High)"
                placeholderTextColor={colors.placeholder || '#4B5563'}
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={disburseModalVisible} transparent animationType="fade" onRequestClose={() => { setActiveDatePicker(null); setDisburseModalVisible(false); }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalOverlay, isKeyboardVisible && styles.modalOverlayKeyboard]}
        >
          <View style={[styles.modalContent, { maxHeight: modalMaxHeight }]}>
            {activeDatePicker === 'disburseDate' ? (
              <CalendarPicker
                title="Select Disbursement Date"
                value={disburseData.date}
                onSelect={(t) => {
                  setDisburseData({ ...disburseData, date: t });
                  setActiveDatePicker(null);
                }}
                onClose={() => setActiveDatePicker(null)}
              />
            ) : (
              <ScrollView
                ref={disburseScrollRef}
                style={{ flexShrink: 1 }}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
                contentContainerStyle={{ paddingBottom: 28 }}
              >
                <Text style={styles.modalTitle}>Record Disbursement</Text>
                <Text style={styles.modalSubtitle}>Enter bank transaction details to mark this loan as Active.</Text>
                <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginBottom: 6 }}>
                  Disbursement Date (DD-MM-YYYY) *
                </Text>
                <TouchableOpacity
                  style={styles.datePickerInput}
                  onPress={() => setActiveDatePicker('disburseDate')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.datePickerValueText}>
                    {formatDate(disburseData.date) || 'DD-MM-YYYY'}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color={colors.dark || '#4B6B4E'} />
                </TouchableOpacity>

                <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginBottom: 6 }}>
                  Disbursement Amount (₹) *
                </Text>
                <TextInput
                  style={styles.modalInputSmall}
                  placeholder="Amount (₹)"
                  placeholderTextColor={colors.placeholder || '#4B5563'}
                  value={disburseData.amount?.toString()}
                  onChangeText={t => setDisburseData({...disburseData, amount: t})}
                  keyboardType="numeric"
                />

                <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginBottom: 6 }}>
                  Bank Name *
                </Text>
                <TextInput
                  style={styles.modalInputSmall}
                  placeholder="Bank Name"
                  placeholderTextColor={colors.placeholder || '#4B5563'}
                  value={disburseData.bankName}
                  onChangeText={t => setDisburseData({...disburseData, bankName: t})}
                  onFocus={() => {
                    setTimeout(() => disburseScrollRef.current?.scrollTo({ y: 120, animated: true }), 150);
                  }}
                />

                <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginBottom: 6 }}>
                  Transaction Number / UTR *
                </Text>
                <TextInput
                  style={styles.modalInputSmall}
                  placeholder="Transaction Number / UTR"
                  placeholderTextColor={colors.placeholder || '#4B5563'}
                  value={disburseData.transactionNumber}
                  onChangeText={t => setDisburseData({...disburseData, transactionNumber: t})}
                  onFocus={() => {
                    setTimeout(() => disburseScrollRef.current?.scrollTo({ y: 220, animated: true }), 150);
                  }}
                />

                <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginBottom: 6 }}>
                  Remark / Notes
                </Text>
                <TextInput
                  style={styles.modalInputSmall}
                  placeholder="e.g. Disbursed via RTGS / Bank Transfer..."
                  placeholderTextColor={colors.placeholder || '#4B5563'}
                  value={disburseData.remark}
                  onChangeText={t => setDisburseData({...disburseData, remark: t})}
                  onFocus={() => {
                    setTimeout(() => disburseScrollRef.current?.scrollToEnd({ animated: true }), 150);
                  }}
                />

                <View style={[styles.modalActions, { marginTop: 8 }]}>
                  <TouchableOpacity style={styles.modalCancel} onPress={() => { setActiveDatePicker(null); setDisburseModalVisible(false); }} disabled={processing}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: colors.primary }]} onPress={handleDisburse} disabled={processing}>
                    {processing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Disburse</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Unified Collect EMI Modal */}
      <CollectEmiModal
        visible={payEmiModalVisible}
        onClose={() => {
          setPayEmiModalVisible(false);
          setSelectedPayEmi(null);
        }}
        loan={loan}
        emi={selectedPayEmi}
        userRole="admin"
        onSuccess={async () => {
          await load();
        }}
      />

      <Modal visible={editDatesModalVisible} transparent animationType="fade" onRequestClose={() => { setActiveDatePicker(null); setEditDatesModalVisible(false); }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalOverlay, isKeyboardVisible && styles.modalOverlayKeyboard]}
        >
          <View style={[styles.modalContent, { maxHeight: modalMaxHeight }]}>
            {activeDatePicker ? (
              <CalendarPicker
                title={activeDatePicker === 'disbursementDate' ? 'Select Disbursement Date' : 'Select EMI Start Date'}
                value={activeDatePicker === 'disbursementDate' ? datesData.disbursementDate : datesData.emiStartDate}
                onSelect={(d) => {
                  if (activeDatePicker === 'disbursementDate') {
                    setDatesData({ ...datesData, disbursementDate: d });
                  } else {
                    setDatesData({ ...datesData, emiStartDate: d });
                  }
                  setActiveDatePicker(null);
                }}
                onClose={() => setActiveDatePicker(null)}
              />
            ) : (
              <ScrollView
                style={{ flexShrink: 1 }}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                <Text style={styles.modalTitle}>Edit Loan Dates</Text>
                <Text style={styles.modalSubtitle}>Update Disbursement Date and EMI Schedule Start Date</Text>

                <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginBottom: 6 }}>
                  Disbursement Date (DD-MM-YYYY)
                </Text>
                <TouchableOpacity
                  style={styles.datePickerInput}
                  onPress={() => setActiveDatePicker('disbursementDate')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.datePickerValueText}>
                    {formatDate(datesData.disbursementDate) || 'DD-MM-YYYY'}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color={colors.dark || '#4B6B4E'} />
                </TouchableOpacity>

                <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginTop: 8, marginBottom: 6 }}>
                  EMI Start Date (DD-MM-YYYY)
                </Text>
                <TouchableOpacity
                  style={[styles.datePickerInput, { marginBottom: 20 }]}
                  onPress={() => setActiveDatePicker('emiStartDate')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.datePickerValueText}>
                    {formatDate(datesData.emiStartDate) || 'DD-MM-YYYY'}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color={colors.dark || '#4B6B4E'} />
                </TouchableOpacity>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancel} onPress={() => { setActiveDatePicker(null); setEditDatesModalVisible(false); }} disabled={processing}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: colors.primary }]} onPress={handleSaveDates} disabled={processing}>
                    {processing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Save Dates</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change EMI Modal */}
      <Modal visible={changeEmiModalVisible} transparent animationType="fade" onRequestClose={() => setChangeEmiModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalOverlay, isKeyboardVisible && styles.modalOverlayKeyboard]}
        >
          <View style={[styles.modalContent, { maxHeight: modalMaxHeight }]}>
            <ScrollView
              ref={changeEmiScrollRef}
              style={{ flexShrink: 1 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              contentContainerStyle={{ paddingBottom: 28 }}
            >
              <Text style={styles.modalTitle}>Change EMI Terms</Text>
              <Text style={styles.modalSubtitle}>Adjust principal, tenure, or interest rate. Schedule will be recalculated.</Text>

              <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginBottom: 4 }}>Principal Amount (₹)</Text>
              <TextInput
                style={styles.modalInputSmall}
                placeholder="Principal (₹)"
                placeholderTextColor={colors.placeholder || '#4B5563'}
                value={changeEmiData.principal}
                onChangeText={t => {
                  const updated = { ...changeEmiData, principal: t };
                  const calc = calculateAdminEmi(t, updated.tenure, updated.interestRate);
                  setChangeEmiData({ ...updated, ...calc });
                }}
                keyboardType="numeric"
              />

              <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginBottom: 4 }}>Tenure (Months)</Text>
              <TextInput
                style={styles.modalInputSmall}
                placeholder="Tenure in months"
                placeholderTextColor={colors.placeholder || '#4B5563'}
                value={changeEmiData.tenure}
                onChangeText={t => {
                  const updated = { ...changeEmiData, tenure: t };
                  const calc = calculateAdminEmi(updated.principal, t, updated.interestRate);
                  setChangeEmiData({ ...updated, ...calc });
                }}
                keyboardType="numeric"
              />

              <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginBottom: 4 }}>Monthly Interest Rate (%)</Text>
              <TextInput
                style={styles.modalInputSmall}
                placeholder="Interest rate (%)"
                placeholderTextColor={colors.placeholder || '#4B5563'}
                value={changeEmiData.interestRate}
                onChangeText={t => {
                  const updated = { ...changeEmiData, interestRate: t };
                  const calc = calculateAdminEmi(updated.principal, updated.tenure, t);
                  setChangeEmiData({ ...updated, ...calc });
                }}
                keyboardType="numeric"
                onFocus={() => {
                  setTimeout(() => changeEmiScrollRef.current?.scrollToEnd({ animated: true }), 150);
                }}
              />

              <View style={{ backgroundColor: '#F0FDF4', padding: 12, borderRadius: 8, marginVertical: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: '#166534' }}>Calculated EMI:</Text>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: '#15803D' }}>₹{Number(changeEmiData.emiAmount || 0).toLocaleString('en-IN')}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: '#166534' }}>Total Repayable:</Text>
                  <Text style={{ fontFamily: fonts.semiBold, fontSize: 12, color: '#15803D' }}>₹{Number(changeEmiData.totalRepayable || 0).toLocaleString('en-IN')}</Text>
                </View>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setChangeEmiModalVisible(false)} disabled={processing}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: colors.primary }]} onPress={handleDirectChangeEmi} disabled={processing}>
                  {processing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Apply EMI Terms</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  modalOverlayKeyboard: {
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 24 : 44,
  },
  modalContent: { backgroundColor: colors.white, borderRadius: 16, padding: 20, overflow: 'hidden' },
  modalTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginBottom: 8 },
  modalSubtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginBottom: 16 },
  modalInput: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: 'top', fontSize: 14, color: colors.text, marginBottom: 20 },
  modalInputSmall: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.text, marginBottom: 12 },
  datePickerInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12 },
  datePickerValueText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
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
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  lockedBannerText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#1E293B',
    lineHeight: 16,
  },
});
