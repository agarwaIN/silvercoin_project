import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { formatDate, getTodayFormatted } from '../utils/date';
import CalendarPicker from './CalendarPicker';
import * as adminApi from '../api/adminApi';
import * as employeeApi from '../api/employeeApi';
import { usePopup } from '../context/PopupContext';

/**
 * Unified Collect EMI Payment Modal
 * Supports full or partial payments, flexible payment date, payment mode selection,
 * and mandatory UTR / Receipt / Reference numbers with dynamic validation.
 */
export default function CollectEmiModal({
  visible,
  onClose,
  loan,
  emi,
  userRole = 'admin',
  onSuccess,
}) {
  const { showAlert } = usePopup();

  // Financial calculations
  const rawEmiAmount = Number(emi?.amount || loan?.emiAmount || loan?.monthlyEmi || 0);
  const alreadyPaid = Number(emi?.paidAmount || 0);
  const standardEmiDue = Math.max(0, rawEmiAmount - alreadyPaid);

  // Standard calculated penalty for this EMI
  let calcStandardPenalty = Number(emi?.penaltyAmount || 0);
  const todayStr = getTodayFormatted();
  if (calcStandardPenalty === 0 && emi?.dueDate && emi.dueDate < todayStr && standardEmiDue > 0) {
    const diffDays = Math.max(0, Math.floor((new Date(todayStr) - new Date(emi.dueDate)) / (1000 * 60 * 60 * 24)));
    if (diffDays > 3) {
      const rate = Number(loan?.penaltyRate || 0.1);
      calcStandardPenalty = Math.round(standardEmiDue * (rate / 100) * diffDays);
    }
  }
  const standardPenalty = calcStandardPenalty;

  const [collectPenalty, setCollectPenalty] = useState(false);
  const [customPenalty, setCustomPenalty] = useState(String(standardPenalty || 0));
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash'); // 'Cash', 'UPI', 'Bank', 'Cheque'
  const [txnRef, setTxnRef] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayFormatted());
  const [activeDatePicker, setActiveDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Re-initialize when modal opens or target EMI changes
  useEffect(() => {
    if (visible && emi) {
      const initCollect = (standardEmiDue === 0 && standardPenalty > 0);
      setCollectPenalty(initCollect);
      setCustomPenalty(String(standardPenalty || 0));
      const initTotal = standardEmiDue + (initCollect ? standardPenalty : 0);
      setAmount(String(initTotal > 0 ? initTotal : standardPenalty || ''));
      setPaymentMode('Cash');
      setTxnRef('');
      setPaymentDate(getTodayFormatted());
      setActiveDatePicker(false);
      setSubmitting(false);
    }
  }, [visible, emi?.paymentId]);

  if (!visible || !emi) return null;

  const borrowerName = loan?.borrowerName || loan?.ownerName || 'Borrower';
  const displayId = loan?.displayLoanId || loan?.applicationNumber || loan?.loanId || '';
  const emiNumber = emi?.paymentId ? emi.paymentId.split('-').pop() : '';

  const handleToggleCollectPenalty = () => {
    const next = !collectPenalty;
    setCollectPenalty(next);
    const pVal = parseFloat(customPenalty) || 0;
    if (next) {
      setAmount(String(standardEmiDue + pVal));
    } else {
      setAmount(String(standardEmiDue));
    }
  };

  const handleCustomPenaltyChange = (val) => {
    const clean = val.replace(/[^0-9.]/g, '');
    setCustomPenalty(clean);
    if (collectPenalty) {
      const pVal = parseFloat(clean) || 0;
      setAmount(String(standardEmiDue + pVal));
    }
  };

  const handleResetPenalty = () => {
    setCustomPenalty(String(standardPenalty));
    if (collectPenalty) {
      setAmount(String(standardEmiDue + standardPenalty));
    }
  };

  const getRefLabel = () => {
    switch (paymentMode) {
      case 'UPI':
        return 'UTR / UPI Reference Number * (Mandatory)';
      case 'Bank':
      case 'Bank Transfer':
        return 'Bank UTR / Transaction Reference No. * (Mandatory)';
      case 'Cheque':
        return 'Cheque Number & Bank Name * (Mandatory)';
      case 'Cash':
      default:
        return 'Cash Receipt / Voucher Slip Number * (Mandatory)';
    }
  };

  const getRefPlaceholder = () => {
    switch (paymentMode) {
      case 'UPI':
        return 'Enter 12-digit UTR or UPI Transaction ID';
      case 'Bank':
      case 'Bank Transfer':
        return 'Enter Bank UTR / NEFT / RTGS Ref No.';
      case 'Cheque':
        return 'e.g. 104928 - SBI Bank';
      case 'Cash':
      default:
        return 'Enter Cash Receipt / Voucher / Slip No.';
    }
  };

  const handleConfirm = async () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid payment amount greater than ₹0.');
      return;
    }

    const cleanRef = (txnRef || '').trim();
    if (!cleanRef) {
      showAlert(
        'Reference Mandatory',
        `${getRefLabel().replace(' * (Mandatory)', '')} is mandatory. Please enter a valid number to prevent duplicate payments.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const loanId = loan?.loanId || emi.loanId;
      const paymentId = emi.paymentId;
      const isEmployee = userRole === 'employee';
      const effectivePenalty = collectPenalty ? (parseFloat(customPenalty) || 0) : 0;

      let result;
      if (isEmployee) {
        result = await employeeApi.payEmi(loanId, paymentId, amountNum, paymentMode, cleanRef, paymentDate, effectivePenalty, collectPenalty);
      } else {
        result = await adminApi.payEmi(loanId, paymentId, amountNum, paymentMode, cleanRef, paymentDate, effectivePenalty, collectPenalty);
      }

      showAlert('Success', `Recorded payment of ₹${amountNum.toLocaleString('en-IN')} successfully.`);
      if (onSuccess) {
        await onSuccess(result);
      }
      onClose();
    } catch (err) {
      showAlert('Payment Error', err.response?.data?.message || err.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  // Quick preset chips for convenience
  const renderPresetChips = () => {
    const chips = [];
    const penaltyNum = collectPenalty ? (parseFloat(customPenalty) || 0) : 0;
    const fullExpected = standardEmiDue + penaltyNum;

    // Full remaining balance chip
    if (fullExpected > 0) {
      chips.push({
        id: 'full_total',
        label: collectPenalty && penaltyNum > 0
          ? `Full (EMI + Penalty): ₹${fullExpected.toLocaleString('en-IN')}`
          : `Full EMI: ₹${fullExpected.toLocaleString('en-IN')}`,
        value: fullExpected,
        isHighlight: true,
      });
    }

    // Standard EMI only chip if penalty is active
    if (collectPenalty && penaltyNum > 0 && standardEmiDue > 0) {
      chips.push({
        id: 'emi_only',
        label: `Standard EMI Only: ₹${standardEmiDue.toLocaleString('en-IN')}`,
        value: standardEmiDue,
      });
    }

    // 50% partial payment chip
    if (fullExpected >= 2000) {
      const half = Math.round(fullExpected / 2);
      chips.push({
        id: 'half',
        label: `50% Partial: ₹${half.toLocaleString('en-IN')}`,
        value: half,
      });
    }

    if (chips.length === 0) return null;

    return (
      <View style={styles.presetsWrap}>
        <Text style={styles.presetsLabel}>Quick Amount Presets:</Text>
        <View style={styles.presetsRow}>
          {chips.map((chip) => {
            const isSelected = amount === String(chip.value);
            return (
              <TouchableOpacity
                key={chip.id}
                style={[
                  styles.presetChip,
                  chip.isHighlight && styles.presetChipHighlight,
                  isSelected && styles.presetChipActive,
                ]}
                onPress={() => setAmount(String(chip.value))}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.presetChipTxt,
                    chip.isHighlight && styles.presetChipHighlightTxt,
                    isSelected && styles.presetChipActiveTxt,
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          {activeDatePicker ? (
            <CalendarPicker
              title="Select Payment Received Date"
              value={paymentDate}
              onSelect={(d) => {
                setPaymentDate(d);
                setActiveDatePicker(false);
              }}
              onClose={() => setActiveDatePicker(false)}
            />
          ) : (
            <ScrollView
              style={{ flexShrink: 1 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>
                    {alreadyPaid > 0 ? 'Collect Remaining EMI Balance' : 'Collect EMI Payment'}
                  </Text>
                  <Text style={styles.modalSub}>
                    {borrowerName} • {displayId} {emiNumber ? `(Installment ${emiNumber})` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                  <Ionicons name="close" size={22} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Financial Snapshot: Separate Standard EMI & Separate Penalty with Add/Edit Flow */}
              <View style={styles.breakdownCard}>
                {/* Standard EMI Row */}
                <View style={styles.breakdownRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.breakdownLabel}>Standard EMI Amount</Text>
                    <Text style={styles.breakdownSub}>
                      {alreadyPaid > 0
                        ? `Original EMI: ₹${rawEmiAmount.toLocaleString('en-IN')} (₹${alreadyPaid.toLocaleString('en-IN')} paid)`
                        : 'Base installment amount'}
                    </Text>
                  </View>
                  <Text style={styles.breakdownVal}>₹{standardEmiDue.toLocaleString('en-IN')}</Text>
                </View>

                {/* Divider */}
                <View style={styles.breakdownDivider} />

                {/* Separate Penalty Section with Standard Display, Add/Collect Button & Editable Input */}
                <View style={styles.penaltySection}>
                  <View style={styles.penaltyHeaderRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Ionicons name="time-outline" size={15} color="#D97706" />
                        <Text style={styles.penaltyHeaderTitle}>Separate Late Penalty</Text>
                        <View style={styles.standardPenaltyBadge}>
                          <Text style={styles.standardPenaltyBadgeTxt}>
                            Standard: ₹{standardPenalty.toLocaleString('en-IN')}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.penaltySubTxt}>
                        {collectPenalty
                          ? 'Penalty is added to this collection. You can edit the amount below.'
                          : 'Click button to add penalty to this collection.'}
                      </Text>
                    </View>

                    {/* Toggle Button to Collect Penalty */}
                    <TouchableOpacity
                      style={[styles.collectPenaltyBtn, collectPenalty && styles.collectPenaltyBtnActive]}
                      onPress={handleToggleCollectPenalty}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={collectPenalty ? 'checkbox' : 'add-circle-outline'}
                        size={17}
                        color={collectPenalty ? colors.white : '#B45309'}
                      />
                      <Text style={[styles.collectPenaltyBtnTxt, collectPenalty && styles.collectPenaltyBtnTxtActive]}>
                        {collectPenalty ? 'Penalty Added' : '+ Add Penalty'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Editable Penalty Box (visible when collectPenalty is active) */}
                  {collectPenalty && (
                    <View style={styles.editablePenaltyContainer}>
                      <View style={styles.editablePenaltyLabelRow}>
                        <Text style={styles.editablePenaltyLabel}>
                          Penalty Amount to Receive (₹):
                        </Text>
                        {standardPenalty > 0 && parseFloat(customPenalty) !== standardPenalty && (
                          <TouchableOpacity onPress={handleResetPenalty}>
                            <Text style={styles.resetStandardLink}>
                              Reset to Standard (₹{standardPenalty.toLocaleString('en-IN')})
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={styles.editablePenaltyInputWrap}>
                        <Text style={styles.currencyPrefix}>₹</Text>
                        <TextInput
                          style={styles.editablePenaltyInput}
                          value={customPenalty}
                          onChangeText={handleCustomPenaltyChange}
                          placeholder="0"
                          placeholderTextColor="#94A3B8"
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  )}
                </View>

                {/* Total To Collect Summary Banner */}
                <View style={styles.totalSummaryBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.totalSummaryTitle}>Total To Be Collected</Text>
                    <Text style={styles.totalSummarySub}>
                      Base EMI: ₹{standardEmiDue.toLocaleString('en-IN')}
                      {collectPenalty && (parseFloat(customPenalty) || 0) > 0
                        ? ` + Penalty: ₹${(parseFloat(customPenalty) || 0).toLocaleString('en-IN')}`
                        : ' (Penalty not added)'}
                    </Text>
                  </View>
                  <Text style={styles.totalSummaryAmt}>
                    ₹{(standardEmiDue + (collectPenalty ? (parseFloat(customPenalty) || 0) : 0)).toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              {/* Partial Payment Helper Banner */}
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle" size={16} color="#0284C7" />
                <Text style={styles.infoBannerTxt}>
                  Partial payments are accepted. You can collect any amount today; the remaining balance will stay active in the schedule for future collection.
                </Text>
              </View>

              {/* Preset chips */}
              {renderPresetChips()}

              {/* Payment Amount Input */}
              <Text style={styles.fieldLabel}>Payment Amount (₹) *</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="Enter collected amount"
                placeholderTextColor={colors.placeholder || '#9CA3AF'}
                keyboardType="numeric"
              />

              {/* Payment Date Input */}
              <Text style={styles.fieldLabel}>Payment Received Date *</Text>
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => setActiveDatePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.datePickerTxt}>
                  {formatDate(paymentDate) || 'Select payment date'}
                </Text>
                <Ionicons name="calendar-outline" size={19} color={colors.primary} />
              </TouchableOpacity>

              {/* Payment Mode Selection */}
              <Text style={styles.fieldLabel}>Payment Mode *</Text>
              <View style={styles.modesRow}>
                {['Cash', 'UPI', 'Bank', 'Cheque'].map((mode) => {
                  const isSelected = paymentMode === mode;
                  const label = mode === 'Bank' ? 'Bank Transfer' : mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.modeChip, isSelected && styles.modeChipActive]}
                      onPress={() => setPaymentMode(mode)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.modeTxt, isSelected && styles.modeTxtActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Reference Number Input */}
              <Text style={styles.fieldLabel}>{getRefLabel()}</Text>
              <TextInput
                style={styles.input}
                value={txnRef}
                onChangeText={setTxnRef}
                placeholder={getRefPlaceholder()}
                placeholderTextColor={colors.placeholder || '#9CA3AF'}
                autoCapitalize="characters"
              />

              {/* Actions */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={onClose}
                  disabled={submitting}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleConfirm}
                  disabled={submitting}
                  activeOpacity={0.8}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={17} color={colors.white} />
                      <Text style={styles.submitBtnTxt}>Confirm Payment</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 18,
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  modalSub: {
    fontSize: fontSize.xs,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    marginTop: -4,
  },
  breakdownCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.dark,
  },
  breakdownSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  breakdownVal: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.dark,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  penaltySection: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
  },
  penaltyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  penaltyHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#92400E',
  },
  standardPenaltyBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  standardPenaltyBadgeTxt: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: '#B45309',
  },
  penaltySubTxt: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#78350F',
    marginTop: 3,
  },
  collectPenaltyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  collectPenaltyBtnActive: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  collectPenaltyBtnTxt: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: '#B45309',
  },
  collectPenaltyBtnTxtActive: {
    color: colors.white,
    fontFamily: fonts.bold,
  },
  editablePenaltyContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  editablePenaltyLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 4,
  },
  editablePenaltyLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: '#92400E',
  },
  resetStandardLink: {
    fontFamily: fonts.bold,
    fontSize: 10.5,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  editablePenaltyInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  currencyPrefix: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#92400E',
    marginRight: 4,
  },
  editablePenaltyInput: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#78350F',
    paddingVertical: 7,
  },
  totalSummaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    padding: 11,
    marginTop: 12,
  },
  totalSummaryTitle: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#065F46',
  },
  totalSummarySub: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: '#047857',
    marginTop: 1,
  },
  totalSummaryAmt: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: '#047857',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  infoBannerTxt: {
    flex: 1,
    fontSize: fontSize.xs,
    fontFamily: fonts.regular,
    color: '#0369A1',
    lineHeight: 16,
  },
  presetsWrap: {
    marginBottom: 12,
  },
  presetsLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.medium,
    color: colors.muted,
    marginBottom: 6,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  presetChipHighlight: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  presetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetChipTxt: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: '#334155',
  },
  presetChipHighlightTxt: {
    color: '#065F46',
    fontFamily: fonts.semiBold,
  },
  presetChipActiveTxt: {
    color: colors.white,
    fontFamily: fonts.bold,
  },
  fieldLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.semiBold,
    color: colors.text,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.inputBg || '#F9FAFB',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
    marginBottom: 12,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBg || '#F9FAFB',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 12,
  },
  datePickerTxt: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
  },
  modesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  modeChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeTxt: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text,
  },
  modeTxtActive: {
    color: colors.white,
    fontFamily: fonts.semiBold,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnTxt: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
  submitBtn: {
    flex: 1.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    gap: 6,
  },
  submitBtnTxt: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
  },
});
