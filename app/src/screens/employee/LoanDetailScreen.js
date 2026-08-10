import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import StatusBadge from '../../components/StatusBadge';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { getLoan, getLoanMediaPreview, requestForeclosure } from '../../api/employeeApi';
import { usePopup } from '../../context/PopupContext';
import LoanDetailsView from '../../components/LoanDetailsView';
import MediaViewer from '../../components/MediaViewer';

export default function LoanDetailScreen({ route, navigation }) {
  const { loanId } = route.params;
  const [loan, setLoan] = useState(null);
  const { showAlert } = usePopup();
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [foreclosureModalVisible, setForeclosureModalVisible] = useState(false);
  const [foreclosureData, setForeclosureData] = useState({ amount: '', reason: '' });

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

  if (!loan) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <Header title="Loan" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={loan.loanId} />
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

        {['saved', 'returned'].includes(loan.status) && (
          <TouchableOpacity 
            style={styles.editBtn} 
            onPress={() => navigation.navigate('NewLoan', { existingLoan: loan })}
          >
            <Ionicons name="create-outline" size={20} color={colors.white} />
            <Text style={styles.editBtnText}>Edit Application</Text>
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
              value={foreclosureData.amount}
              onChangeText={t => setForeclosureData({...foreclosureData, amount: t})}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Reason for foreclosure"
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
});
