import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Modal, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import StatusBadge from '../../components/StatusBadge';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import { getLoan, getLoanMediaPreview, approveLoan, rejectLoan, approveEmiChange, rejectEmiChange } from '../../api/adminApi';
import LoanDetailsView from '../../components/LoanDetailsView';
import MediaViewer from '../../components/MediaViewer';
import { usePopup } from '../../context/PopupContext';
import { Ionicons } from '@expo/vector-icons';

export default function LoanDetailScreen({ route, navigation }) {
  const { showAlert } = usePopup();
  const { loanId } = route.params;
  const [loan, setLoan] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    const data = await getLoan(loanId);
    setLoan(data);
  }, [loanId]);

  useFocusEffect(useCallback(() => { void load().catch(() => {}); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  };

  const handleApprove = () => {
    navigation.navigate('InitialApprove', { loan });
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
        <Header title="Loan" />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={loan.loanId} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <StatusBadge status={loan.status} />
        </View>
        <LoanDetailsView loan={loan} />
        <MediaViewer fetchMedia={() => getLoanMediaPreview(loan.loanId)} />

        {loan.status === 'submitted' && (
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
  actionContainer: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 24 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.error },
  rejectBtnText: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.error },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.success, paddingVertical: 14, borderRadius: 12 },
  approveBtnText: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.white },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.white, borderRadius: 16, padding: 20 },
  modalTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginBottom: 8 },
  modalSubtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginBottom: 16 },
  modalInput: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: 'top', fontSize: 14, color: colors.text, marginBottom: 20 },
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
});
