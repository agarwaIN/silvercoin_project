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
  const isAlreadyWaived = Boolean(emi?.penaltyWaived);

  const computePenaltyForDate = (dateStr) => {
    if (isAlreadyWaived || !emi?.dueDate || standardEmiDue <= 0) return 0;
    const effDate = dateStr || getTodayFormatted();
    if (effDate <= emi.dueDate) return 0;
    const diffDays = Math.max(0, Math.floor((new Date(effDate) - new Date(emi.dueDate)) / (1000 * 60 * 60 * 24)));
    if (diffDays <= 3) return 0;
    const rate = Number(loan?.penaltyRate || 0.1);
    return Math.round(standardEmiDue * (rate / 100) * diffDays);
  };

  const [paymentDate, setPaymentDate] = useState(getTodayFormatted());
  const standardPenalty = isAlreadyWaived
    ? 0
    : (Number(emi?.penaltyAmount || 0) > 0 ? Number(emi.penaltyAmount) : computePenaltyForDate(paymentDate));

  const [waivePenalty, setWaivePenalty] = useState(isAlreadyWaived);
  const [collectPenalty, setCollectPenalty] = useState(false);
  const [customPenalty, setCustomPenalty] = useState(String(standardPenalty || 0));
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash'); // 'Cash', 'UPI', 'Bank', 'Cheque'
  const [txnRef, setTxnRef] = useState('');
  const [activeDatePicker, setActiveDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waivingDirectly, setWaivingDirectly] = useState(false);

  // Re-initialize when modal opens or target EMI changes
  useEffect(() => {
    if (visible && emi) {
      const isWaived = Boolean(emi.penaltyWaived);
      const initDate = getTodayFormatted();
      const stdPen = isWaived
        ? 0
        : (Number(emi.penaltyAmount || 0) > 0 ? Number(emi.penaltyAmount) : computePenaltyForDate(initDate));
      const initCollect = !isWaived && stdPen > 0;
      setWaivePenalty(isWaived);
      setCollectPenalty(initCollect);
      setCustomPenalty(String(stdPen || 0));
      const initTotal = standardEmiDue + (initCollect ? stdPen : 0);
      setAmount(String(initTotal > 0 ? initTotal : (isWaived ? standardEmiDue : stdPen) || ''));
      setPaymentMode('Cash');
      setTxnRef('');
      setPaymentDate(initDate);
      setActiveDatePicker(false);
      setSubmitting(false);
      setWaivingDirectly(false);
    }
  }, [visible, emi?.paymentId]);

  if (!visible || !emi) return null;

  const borrowerName = loan?.borrowerName || loan?.ownerName || 'Borrower';
  const displayId = loan?.displayLoanId || loan?.applicationNumber || loan?.loanId || '';
  const emiNumber = emi?.paymentId ? emi.paymentId.split('-').pop() : '';

  const handleSelectWaiveOff = () => {
    if (waivePenalty) {
      setWaivePenalty(false);
      setCollectPenalty(false);
      setAmount(String(standardEmiDue));
    } else {
      setWaivePenalty(true);
      setCollectPenalty(false);
      setAmount(String(standardEmiDue));
    }
  };

  const handleSelectReplacePenalty = () => {
    if (collectPenalty && !waivePenalty) {
      setCollectPenalty(false);
      setAmount(String(standardEmiDue));
    } else {
      setWaivePenalty(false);
      setCollectPenalty(true);
      const pVal = parseFloat(customPenalty) || standardPenalty || 0;
      if (pVal === 0 && standardPenalty > 0) {
        setCustomPenalty(String(standardPenalty));
        setAmount(String(standardEmiDue + standardPenalty));
      } else {
        setAmount(String(standardEmiDue + pVal));
      }
    }
  };

  const handleCustomPenaltyChange = (val) => {
    const clean = val.replace(/[^0-9.]/g, '');
    setCustomPenalty(clean);
    if (collectPenalty && !waivePenalty) {
      const pVal = parseFloat(clean) || 0;
      setAmount(String(standardEmiDue + pVal));
    }
  };

  const handleResetPenalty = () => {
    setCustomPenalty(String(standardPenalty));
    if (collectPenalty && !waivePenalty) {
      setAmount(String(standardEmiDue + standardPenalty));
    }
  };

  const handleDirectWaiveOff = () => {
    showAlert(
      'Waive Off Penalty',
      `Are you sure you want to permanently waive off the late penalty (₹${standardPenalty.toLocaleString('en-IN')}) for this installment?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Waive Off',
          style: 'destructive',
          onPress: async () => {
            setWaivingDirectly(true);
            try {
              const loanId = loan?.loanId || emi.loanId;
              const paymentId = emi.paymentId;
              const isEmployee = userRole === 'employee';
              if (isEmployee) {
                await employeeApi.waiveEmiPenalty(loanId, paymentId, 'Waived off by employee');
              } else {
                await adminApi.waiveEmiPenalty(loanId, paymentId, 'Waived off by admin');
              }
              setWaivePenalty(true);
              setCollectPenalty(false);
              setCustomPenalty('0');
              setAmount(String(standardEmiDue));
              showAlert('Penalty Waived', 'Penalty has been waived off successfully for this installment.');
              if (onSuccess) {
                await onSuccess();
              }
            } catch (err) {
              showAlert('Error', err.response?.data?.message || err.message || 'Failed to waive penalty.');
            } finally {
              setWaivingDirectly(false);
            }
          },
        },
      ]
    );
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
      const effectivePenalty = waivePenalty ? 0 : (collectPenalty ? (parseFloat(customPenalty) || 0) : 0);

      let result;
      if (isEmployee) {
        result = await employeeApi.payEmi(loanId, paymentId, amountNum, paymentMode, cleanRef, paymentDate, effectivePenalty, collectPenalty, waivePenalty);
      } else {
        result = await adminApi.payEmi(loanId, paymentId, amountNum, paymentMode, cleanRef, paymentDate, effectivePenalty, collectPenalty, waivePenalty);
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
    const penaltyNum = (collectPenalty && !waivePenalty) ? (parseFloat(customPenalty) || 0) : 0;
    const fullExpected = standardEmiDue + penaltyNum;

    // Full remaining balance chip
    if (fullExpected > 0) {
      chips.push({
        id: 'full_total',
        label: waivePenalty
          ? `Full EMI (Penalty Waived): ₹${fullExpected.toLocaleString('en-IN')}`
          : (collectPenalty && penaltyNum > 0
            ? `Full (EMI + Replaced Penalty): ₹${fullExpected.toLocaleString('en-IN')}`
            : `Full EMI: ₹${fullExpected.toLocaleString('en-IN')}`),
        value: fullExpected,
        isHighlight: true,
      });
    }

    // Standard EMI only chip if penalty is active
    if (collectPenalty && !waivePenalty && penaltyNum > 0 && standardEmiDue > 0) {
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
                if (!waivePenalty && !isAlreadyWaived) {
                  const newPen = computePenaltyForDate(d);
                  if (collectPenalty) {
                    setCustomPenalty(String(newPen));
                    setAmount(String(standardEmiDue + newPen));
                  } else if (newPen > 0) {
                    setCustomPenalty(String(newPen));
                  }
                }
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

                {/* Separate Penalty Section with Standard Display, Waive Off & Replace Penalty options */}
                <View style={styles.penaltySection}>
                  <View style={styles.penaltyHeaderRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Ionicons name="time-outline" size={15} color="#D97706" />
                        <Text style={styles.penaltyHeaderTitle}>Separate Late Penalty</Text>
                        <View style={[styles.standardPenaltyBadge, (waivePenalty || isAlreadyWaived) && styles.waivedBadge]}>
                          <Text style={[styles.standardPenaltyBadgeTxt, (waivePenalty || isAlreadyWaived) && styles.waivedBadgeTxt]}>
                            {(waivePenalty || isAlreadyWaived) ? 'Penalty Waived Off (₹0)' : `Standard: ₹${standardPenalty.toLocaleString('en-IN')}`}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.penaltySubTxt}>
                        {(waivePenalty || isAlreadyWaived)
                          ? 'Late penalty is 100% waived off for this installment.'
                          : (collectPenalty && !waivePenalty && (parseFloat(customPenalty) || 0) !== standardPenalty)
                            ? `Custom penalty of ₹${(parseFloat(customPenalty) || 0).toLocaleString('en-IN')} will replace the existing penalty.`
                            : (collectPenalty && !waivePenalty)
                              ? 'Penalty is added to this collection. You can edit the amount below.'
                              : 'Choose to waive off or replace the penalty for this installment.'}
                      </Text>
                    </View>
                  </View>

                  {/* Penalty Action Buttons Row: Waive Off & Replace/Edit Penalty */}
                  <View style={styles.penaltyActionsRow}>
                    {/* Waive Off Button */}
                    <TouchableOpacity
                      style={[styles.penaltyActionBtn, styles.waiveOffBtn, waivePenalty && styles.waiveOffBtnActive]}
                      onPress={handleSelectWaiveOff}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={waivePenalty ? 'checkmark-circle' : 'close-circle-outline'}
                        size={15}
                        color={waivePenalty ? colors.white : '#DC2626'}
                      />
                      <Text style={[styles.penaltyActionBtnTxt, styles.waiveOffBtnTxt, waivePenalty && styles.waiveOffBtnTxtActive]}>
                        {waivePenalty ? 'Penalty Waived (₹0)' : 'Waive Off'}
                      </Text>
                    </TouchableOpacity>

                    {/* Replace / Edit Penalty Button */}
                    <TouchableOpacity
                      style={[styles.penaltyActionBtn, styles.replacePenaltyBtn, (collectPenalty && !waivePenalty) && styles.replacePenaltyBtnActive]}
                      onPress={handleSelectReplacePenalty}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={(collectPenalty && !waivePenalty) ? 'checkmark-circle' : 'create-outline'}
                        size={15}
                        color={(collectPenalty && !waivePenalty) ? colors.white : '#B45309'}
                      />
                      <Text style={[styles.penaltyActionBtnTxt, styles.replacePenaltyBtnTxt, (collectPenalty && !waivePenalty) && styles.replacePenaltyBtnTxtActive]}>
                        {(collectPenalty && !waivePenalty) ? 'Penalty Replaced' : 'Add / Replace Penalty'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Direct Instant Waive Off Button (if standard penalty > 0 and not yet permanently saved as waived) */}
                  {standardPenalty > 0 && !isAlreadyWaived && (
                    <TouchableOpacity
                      style={styles.instantWaiveLinkBtn}
                      onPress={handleDirectWaiveOff}
                      disabled={waivingDirectly}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="flash-outline" size={13} color="#047857" />
                      <Text style={styles.instantWaiveLinkTxt}>
                        {waivingDirectly ? 'Waiving Penalty...' : 'Permanently Waive Off Penalty for this EMI Now'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Editable Penalty Box (visible when replace penalty is active and not waived) */}
                  {collectPenalty && !waivePenalty && (
                    <View style={styles.editablePenaltyContainer}>
                      <View style={styles.editablePenaltyLabelRow}>
                        <Text style={styles.editablePenaltyLabel}>
                          Penalty Amount to Receive (₹) [Replaces Existing]:
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
                      <Text style={styles.replacementHelpTxt}>
                        This amount will replace the existing ₹{standardPenalty.toLocaleString('en-IN')} penalty for this EMI.
                      </Text>
                    </View>
                  )}
                </View>

                {/* Total To Collect Summary Banner */}
                <View style={styles.totalSummaryBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.totalSummaryTitle}>Total To Be Collected</Text>
                    <Text style={styles.totalSummarySub}>
                      Base EMI: ₹{standardEmiDue.toLocaleString('en-IN')}
                      {waivePenalty
                        ? ' • Penalty: Waived Off (₹0)'
                        : (collectPenalty && (parseFloat(customPenalty) || 0) > 0
                            ? ` + Replaced Penalty: ₹${(parseFloat(customPenalty) || 0).toLocaleString('en-IN')}`
                            : ' (Penalty not added)')}
                    </Text>
                  </View>
                  <Text style={styles.totalSummaryAmt}>
                    ₹{(standardEmiDue + (!waivePenalty && collectPenalty ? (parseFloat(customPenalty) || 0) : 0)).toLocaleString('en-IN')}
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
  waivedBadge: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  waivedBadgeTxt: {
    color: '#15803D',
  },
  penaltySubTxt: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#78350F',
    marginTop: 3,
  },
  penaltyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  penaltyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  waiveOffBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  waiveOffBtnActive: {
    backgroundColor: '#DC2626',
    borderColor: '#B91C1C',
  },
  waiveOffBtnTxt: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: '#DC2626',
  },
  waiveOffBtnTxtActive: {
    color: colors.white,
    fontFamily: fonts.bold,
  },
  replacePenaltyBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D97706',
  },
  replacePenaltyBtnActive: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  replacePenaltyBtnTxt: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: '#B45309',
  },
  replacePenaltyBtnTxtActive: {
    color: colors.white,
    fontFamily: fonts.bold,
  },
  instantWaiveLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  instantWaiveLinkTxt: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: '#047857',
    textDecorationLine: 'underline',
  },
  replacementHelpTxt: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
    color: '#92400E',
    marginTop: 4,
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
