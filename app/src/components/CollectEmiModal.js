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
  Keyboard,
  useWindowDimensions,
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
 * Features:
 * 1. Fully scrollable with adaptive height that prevents inputs (like UPI/UTR ref) from hiding behind the keyboard.
 * 2. Separate dedicated boxes for EMI Amount and Penalty Amount.
 * 3. Both values added downwards with clear Total To Collect display.
 * 4. Penalty settled once paid: if penalty was already collected in an earlier partial payment,
 *    NO penalty will be charged or changed; it displays that penalty has already been paid and only remaining base EMI is due.
 * 5. Strict overpayment validation: entering more than the remaining EMI or penalty displays a red warning prompt
 *    and prevents submission.
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
  const { height: windowHeight } = useWindowDimensions();

  // Track keyboard visibility and height for fluid scrolling
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height || 260);
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
    ? Math.max(280, windowHeight - keyboardHeight - (Platform.OS === 'android' ? 24 : 50))
    : Math.min(windowHeight * 0.92, 740);

  // Financial calculations
  const rawEmiAmount = Number(emi?.amount || loan?.emiAmount || loan?.monthlyEmi || 0);
  const paymentsList = Array.isArray(emi?.payments) ? emi.payments : [];

  // Determine penalty collected so far
  let previousPenaltyPaid = paymentsList.reduce((sum, p) => sum + Number(p.penaltyAmount || 0), 0);
  if (previousPenaltyPaid === 0 && Number(emi?.penaltyPaidAmount || 0) > 0) {
    previousPenaltyPaid = Number(emi.penaltyPaidAmount);
  }
  if (previousPenaltyPaid === 0 && (emi?.penaltySettled || emi?.penaltyLocked) && Number(emi?.penaltyAmount || 0) > 0 && Number(emi?.paidAmount || 0) > 0) {
    previousPenaltyPaid = Number(emi.penaltyAmount);
  }

  // Determine base EMI paid so far
  let previousEmiPaid = paymentsList.reduce(
    (sum, p) => sum + Number(p.emiAmount !== undefined ? p.emiAmount : (Number(p.amount || 0) - Number(p.penaltyAmount || 0))),
    0
  );
  if (previousEmiPaid === 0 && Number(emi?.paidAmount || 0) > 0) {
    previousEmiPaid = Math.max(0, Number(emi.paidAmount) - previousPenaltyPaid);
  }

  const remainingEmiDue = Math.max(0, rawEmiAmount - previousEmiPaid);

  const isAlreadyWaived = Boolean(emi?.penaltyWaived);
  const isPenaltyAlreadyPaid = previousPenaltyPaid > 0 || (Boolean(emi?.penaltySettled) && !emi?.penaltyOnHold) || (Boolean(emi?.penaltyLocked) && Number(emi?.paidAmount || 0) > 0 && Number(emi?.penaltyAmount || 0) > 0 && !emi?.penaltyOnHold);

  const parseDateToUtcMs = (dateStr) => {
    if (!dateStr) return NaN;
    if (dateStr instanceof Date) return dateStr.getTime();
    let s = String(dateStr).trim();
    if (s.includes('T')) s = s.split('T')[0];
    const ddmmyyyy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1], 10);
      const month = parseInt(ddmmyyyy[2], 10) - 1;
      const year = parseInt(ddmmyyyy[3], 10);
      return new Date(Date.UTC(year, month, day)).getTime();
    }
    const yyyymmdd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (yyyymmdd) {
      const year = parseInt(yyyymmdd[1], 10);
      const month = parseInt(yyyymmdd[2], 10) - 1;
      const day = parseInt(yyyymmdd[3], 10);
      return new Date(Date.UTC(year, month, day)).getTime();
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? NaN : dt.getTime();
  };

  const computePenaltyForDate = (dateStr) => {
    if (isAlreadyWaived || isPenaltyAlreadyPaid || !emi?.dueDate) return 0;
    const baseTarget = remainingEmiDue > 0 ? remainingEmiDue : Number(emi?.amount || 0);
    if (baseTarget <= 0) return 0;

    const effMs = parseDateToUtcMs(dateStr || paymentDate || getTodayFormatted());
    const dueMs = parseDateToUtcMs(emi.dueDate);
    if (isNaN(effMs) || isNaN(dueMs)) return 0;

    if (effMs <= dueMs) return 0;
    const diffDays = Math.max(0, Math.floor((effMs - dueMs) / (1000 * 60 * 60 * 24)));
    if (diffDays <= 3) return 0;

    const rate = Number(loan?.penaltyRate || 0.1);
    return Math.round(baseTarget * (rate / 100) * diffDays);
  };

  const [paymentDate, setPaymentDate] = useState(getTodayFormatted());
  const standardPenalty = (isAlreadyWaived || isPenaltyAlreadyPaid)
    ? 0
    : computePenaltyForDate(paymentDate);

  const [waivePenalty, setWaivePenalty] = useState(isAlreadyWaived);
  const [collectPenalty, setCollectPenalty] = useState(false);
  const [holdPenalty, setHoldPenalty] = useState(false);
  const [penaltyAmount, setPenaltyAmount] = useState('0');
  const [emiAmount, setEmiAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash'); // 'Cash', 'UPI', 'Bank', 'Cheque'
  const [txnRef, setTxnRef] = useState('');
  const [activeDatePicker, setActiveDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waivingDirectly, setWaivingDirectly] = useState(false);

  // Re-initialize when modal opens or target EMI changes
  useEffect(() => {
    if (visible && emi) {
      const isWaived = Boolean(emi.penaltyWaived);
      const isSettled = isPenaltyAlreadyPaid;
      const initDate = getTodayFormatted();
      const stdPen = (isWaived || isSettled)
        ? 0
        : computePenaltyForDate(initDate);

      const isBasePaid = remainingEmiDue === 0 && Number(emi.paidAmount || 0) > 0;
      const initCollectPen = !isWaived && !isSettled && stdPen > 0;
      setWaivePenalty(isWaived);
      setHoldPenalty(false);
      setCollectPenalty(initCollectPen);
      setPenaltyAmount(String(stdPen || 0));
      setEmiAmount(String(remainingEmiDue || 0));
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

  // Downwards calculation
  const isBaseEmiPaid = remainingEmiDue === 0 && Number(emi?.paidAmount || 0) > 0;
  const emiVal = parseFloat(emiAmount) || 0;
  const penInputVal = parseFloat(penaltyAmount) || 0;
  const effectivePenaltyVal = (!waivePenalty && !holdPenalty && !isPenaltyAlreadyPaid)
    ? penInputVal
    : 0;
  const totalToCollect = emiVal + effectivePenaltyVal;

  // Real-time overpayment checks
  const isEmiOver = emiVal > remainingEmiDue;
  const isPenaltyOver = !isPenaltyAlreadyPaid && !waivePenalty && !holdPenalty && standardPenalty > 0 && penInputVal > standardPenalty;
  const hasValidationError = isEmiOver || isPenaltyOver;

  const handleSelectPayPenalty = () => {
    if (isPenaltyAlreadyPaid) return;
    setWaivePenalty(false);
    setHoldPenalty(false);
    setCollectPenalty(true);
    setPenaltyAmount(String(standardPenalty || 0));
  };

  const handleSelectHoldPenalty = () => {
    if (isPenaltyAlreadyPaid) return;
    setWaivePenalty(false);
    setCollectPenalty(false);
    setHoldPenalty(true);
    setPenaltyAmount('0');
  };

  const handleSelectWaiveOff = () => {
    if (isPenaltyAlreadyPaid) return;
    setWaivePenalty(true);
    setCollectPenalty(false);
    setHoldPenalty(false);
    setPenaltyAmount('0');
  };

  const handleCustomPenaltyChange = (val) => {
    if (isPenaltyAlreadyPaid) return;
    const clean = val.replace(/[^0-9.]/g, '');
    setPenaltyAmount(clean);
    setHoldPenalty(false);
    const num = parseFloat(clean) || 0;
    if (num > 0) {
      setWaivePenalty(false);
      setCollectPenalty(true);
    } else {
      setCollectPenalty(false);
    }
  };

  const handleResetPenalty = () => {
    if (isPenaltyAlreadyPaid) return;
    setWaivePenalty(false);
    setHoldPenalty(false);
    setCollectPenalty(standardPenalty > 0);
    setPenaltyAmount(String(standardPenalty || 0));
  };

  const handleEmiAmountChange = (val) => {
    const clean = val.replace(/[^0-9.]/g, '');
    setEmiAmount(clean);
  };

  const handleDirectWaiveOff = () => {
    if (isPenaltyAlreadyPaid) return;
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
              setPenaltyAmount('0');
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
    if (isNaN(emiVal) || emiVal < 0) {
      showAlert('Invalid EMI Amount', 'Please enter a valid EMI amount.');
      return;
    }

    if (emiVal > remainingEmiDue) {
      showAlert(
        'Amount Exceeds EMI Due',
        `Payment amount (₹${emiVal.toLocaleString('en-IN')}) cannot be more than the actual EMI due of ₹${remainingEmiDue.toLocaleString('en-IN')}. You can submit an amount less than actual (partial) or equal to the complete amount.`
      );
      return;
    }

    if (isPenaltyOver) {
      showAlert(
        'Penalty Exceeds Calculated',
        `Penalty amount (₹${effectivePenaltyVal.toLocaleString('en-IN')}) cannot exceed the calculated late penalty of ₹${standardPenalty.toLocaleString('en-IN')}. You can submit an amount less than actual or equal to the complete amount.`
      );
      return;
    }

    if (totalToCollect <= 0) {
      showAlert('Invalid Total', 'Total payment amount must be greater than ₹0.');
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

      let result;
      if (isEmployee) {
        result = await employeeApi.payEmi(
          loanId,
          paymentId,
          totalToCollect,
          paymentMode,
          cleanRef,
          paymentDate,
          effectivePenaltyVal,
          collectPenalty && !waivePenalty && !isPenaltyAlreadyPaid,
          waivePenalty,
          emiVal,
          holdPenalty
        );
      } else {
        result = await adminApi.payEmi(
          loanId,
          paymentId,
          totalToCollect,
          paymentMode,
          cleanRef,
          paymentDate,
          effectivePenaltyVal,
          collectPenalty && !waivePenalty && !isPenaltyAlreadyPaid,
          waivePenalty,
          emiVal,
          holdPenalty
        );
      }

      showAlert('Success', `Recorded payment of ₹${totalToCollect.toLocaleString('en-IN')} successfully.`);
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
    const penVal = (!waivePenalty && collectPenalty && !isPenaltyAlreadyPaid) ? (parseFloat(penaltyAmount) || 0) : 0;

    // Full Balance (EMI + Penalty) - only shown when penalty is not yet paid
    if (!isPenaltyAlreadyPaid && penVal > 0 && remainingEmiDue > 0) {
      chips.push({
        id: 'full_total',
        label: `Full (EMI + Penalty): ₹${(remainingEmiDue + penVal).toLocaleString('en-IN')}`,
        onPress: () => {
          setEmiAmount(String(remainingEmiDue));
          setCollectPenalty(true);
          setWaivePenalty(false);
        },
        isHighlight: true,
      });
    }

    // Full Base EMI
    if (remainingEmiDue > 0) {
      chips.push({
        id: 'full_emi',
        label: isPenaltyAlreadyPaid
          ? `Full Remaining EMI: ₹${remainingEmiDue.toLocaleString('en-IN')}`
          : (penVal > 0 ? `Standard EMI Only: ₹${remainingEmiDue.toLocaleString('en-IN')}` : `Full EMI: ₹${remainingEmiDue.toLocaleString('en-IN')}`),
        onPress: () => {
          setEmiAmount(String(remainingEmiDue));
          if (penVal > 0) {
            setCollectPenalty(false);
          }
        },
        isHighlight: isPenaltyAlreadyPaid || penVal <= 0,
      });
    }

    // 50% Partial EMI
    if (remainingEmiDue >= 2000) {
      const half = Math.round(remainingEmiDue / 2);
      chips.push({
        id: 'half',
        label: `50% Partial EMI: ₹${half.toLocaleString('en-IN')}`,
        onPress: () => {
          setEmiAmount(String(half));
        },
      });
    }

    if (chips.length === 0) return null;

    return (
      <View style={styles.presetsWrap}>
        <Text style={styles.presetsLabel}>Quick Amount Presets:</Text>
        <View style={styles.presetsRow}>
          {chips.map((chip) => (
            <TouchableOpacity
              key={chip.id}
              style={[
                styles.presetChip,
                chip.isHighlight && styles.presetChipHighlight,
              ]}
              onPress={chip.onPress}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.presetChipTxt,
                  chip.isHighlight && styles.presetChipHighlightTxt,
                ]}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.modalOverlay, isKeyboardVisible && styles.modalOverlayKeyboard]}
      >
        <View style={[styles.modalContent, { maxHeight: modalMaxHeight }]}>
          {activeDatePicker ? (
            <CalendarPicker
              title="Select Payment Received Date"
              value={paymentDate}
              onSelect={(d) => {
                setPaymentDate(d);
                const newPen = computePenaltyForDate(d);
                if (!waivePenalty && !holdPenalty) {
                  setCollectPenalty(newPen > 0);
                  setPenaltyAmount(String(newPen));
                }
                setActiveDatePicker(false);
              }}
              onClose={() => setActiveDatePicker(false)}
            />
          ) : (
            <ScrollView
              style={{ flexShrink: 1 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: isKeyboardVisible ? 90 : 24 },
              ]}
            >
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>
                    {isBaseEmiPaid ? 'Settle Pending Late Penalty' : (previousEmiPaid > 0 ? 'Collect Remaining Base EMI' : 'Collect EMI Payment')}
                  </Text>
                  <Text style={styles.modalSub}>
                    {borrowerName} • {displayId} {emiNumber ? `(Installment ${emiNumber})` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                  <Ionicons name="close" size={22} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Financial Snapshot Card */}
              <View style={styles.breakdownCard}>
                <View style={styles.breakdownRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.breakdownLabel}>
                      {previousEmiPaid > 0 ? 'Remaining Base EMI Due' : 'Base EMI Amount'}
                    </Text>
                    <Text style={styles.breakdownSub}>
                      {previousEmiPaid > 0
                        ? `Original EMI: ₹${rawEmiAmount.toLocaleString('en-IN')} (₹${previousEmiPaid.toLocaleString('en-IN')} paid)`
                        : 'Base installment amount'}
                    </Text>
                  </View>
                  <Text style={styles.breakdownVal}>₹{remainingEmiDue.toLocaleString('en-IN')}</Text>
                </View>
              </View>

              {/* Partial Payment Helper Banner */}
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle" size={16} color="#0284C7" />
                <Text style={styles.infoBannerTxt}>
                  Partial payments are accepted. You can enter any amount up to the remaining EMI; remaining balance stays active in the schedule for future collection.
                </Text>
              </View>

              {/* Preset chips */}
              {renderPresetChips()}

              {/* Box 1: Separate EMI Amount to Pay */}
              {isBaseEmiPaid ? (
                <View style={{ backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Ionicons name="checkmark-circle" size={20} color="#15803D" />
                    <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: '#15803D' }}>
                      Base EMI Fully Paid (₹{rawEmiAmount.toLocaleString('en-IN')})
                    </Text>
                  </View>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: '#166534', lineHeight: 16 }}>
                    The base installment amount is completely cleared. You can collect or permanently waive off the remaining late penalty below.
                  </Text>
                </View>
              ) : (
                <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="cash-outline" size={16} color={colors.primary} />
                  <Text style={styles.sectionHeaderTitle}>
                    {previousEmiPaid > 0 ? 'Remaining EMI Amount to Pay (₹) *' : 'EMI Amount to Pay (₹) *'}
                  </Text>
                  {remainingEmiDue > 0 && emiVal !== remainingEmiDue && (
                    <TouchableOpacity onPress={() => setEmiAmount(String(remainingEmiDue))}>
                      <Text style={styles.resetStandardLink}>Set Full (₹{remainingEmiDue.toLocaleString('en-IN')})</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={[styles.currencyInputWrap, isEmiOver && styles.currencyInputWrapError]}>
                  <Text style={[styles.currencyPrefix, isEmiOver && { color: '#DC2626' }]}>₹</Text>
                  <TextInput
                    style={[styles.currencyInput, isEmiOver && { color: '#DC2626' }]}
                    value={emiAmount}
                    onChangeText={handleEmiAmountChange}
                    placeholder={`Max ₹${remainingEmiDue}`}
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                  />
                </View>

                {isEmiOver ? (
                  <View style={styles.errorPromptBox}>
                    <Ionicons name="alert-circle" size={15} color="#DC2626" style={{ marginTop: 1 }} />
                    <Text style={styles.errorPromptTxt}>
                      Amount cannot exceed actual EMI due (₹{remainingEmiDue.toLocaleString('en-IN')}). You can submit an amount less than actual (partial) or equal to the complete amount.
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.fieldHelpTxt}>
                    {emiVal < remainingEmiDue
                      ? `Partial payment of ₹${emiVal.toLocaleString('en-IN')}. Remaining EMI balance ₹${Math.max(0, remainingEmiDue - emiVal).toLocaleString('en-IN')} will stay active in schedule.`
                      : `Full remaining EMI installment (₹${remainingEmiDue.toLocaleString('en-IN')}) will be collected.`}
                  </Text>
                )}
              </View>
              )}

              {/* Box 2: Penalty Section */}
              {isPenaltyAlreadyPaid ? (
                /* When penalty is already collected/settled: NO input box, only prominent status notice */
                <View style={styles.settledPenaltyCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Ionicons name="checkmark-circle" size={20} color="#059669" />
                    <Text style={styles.settledPenaltyTitle}>
                      {isAlreadyWaived && previousPenaltyPaid === 0
                        ? 'Late Penalty: Waived Off (₹0)'
                        : `Late Penalty Already Paid: ₹${previousPenaltyPaid.toLocaleString('en-IN')}`}
                    </Text>
                  </View>
                  <Text style={styles.settledPenaltySub}>
                    {isAlreadyWaived && previousPenaltyPaid === 0
                      ? 'Late penalty is 100% waived off for this installment. No penalty will ever be charged.'
                      : `The late penalty of ₹${previousPenaltyPaid.toLocaleString('en-IN')} has already been collected and settled for this installment. No additional penalty will be charged or changed.`}
                  </Text>
                </View>
              ) : (
                /* When penalty has NOT yet been collected/settled: ALWAYS show the settle input box! */
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Ionicons name="time-outline" size={16} color="#D97706" />
                    <Text style={styles.sectionHeaderTitle}>
                      Penalty Amount to Pay / Settle (₹)
                    </Text>
                    {standardPenalty > 0 && parseFloat(penaltyAmount) !== standardPenalty && (
                      <TouchableOpacity onPress={handleResetPenalty}>
                        <Text style={styles.resetStandardLink}>
                          Use Standard (₹{standardPenalty.toLocaleString('en-IN')})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Calculated late penalty banner */}
                  <View style={styles.penaltyInfoBanner}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.penaltyCalcLabel}>
                        Calculated Late Penalty ({formatDate(paymentDate)}):
                      </Text>
                      <Text style={styles.penaltyCalcVal}>
                        ₹{standardPenalty.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <Text style={styles.penaltyCalcSub}>
                      {standardPenalty > 0
                        ? `Standard penalty accrued up to payment date (${formatDate(paymentDate)}). Enter your agreed settlement amount below, or ₹0 to waive/defer.`
                        : 'No late penalty accrued as of the selected payment date.'}
                    </Text>
                  </View>

                  {/* Quick Action Chips: Full Standard, Waive Off, Hold for Later */}
                  <View style={styles.penaltyQuickChipsRow}>
                    {standardPenalty > 0 && (
                      <TouchableOpacity
                        style={[
                          styles.penaltyChip,
                          parseFloat(penaltyAmount) === standardPenalty && !waivePenalty && !holdPenalty && styles.penaltyChipActive,
                        ]}
                        onPress={handleResetPenalty}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.penaltyChipTxt,
                            parseFloat(penaltyAmount) === standardPenalty && !waivePenalty && !holdPenalty && styles.penaltyChipActiveTxt,
                          ]}
                        >
                          Full Standard (₹{standardPenalty.toLocaleString('en-IN')})
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.penaltyChip,
                        (waivePenalty || (parseFloat(penaltyAmount) === 0 && !holdPenalty)) && styles.penaltyChipActiveWaive,
                      ]}
                      onPress={handleSelectWaiveOff}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.penaltyChipTxt,
                          (waivePenalty || (parseFloat(penaltyAmount) === 0 && !holdPenalty)) && styles.penaltyChipActiveWaiveTxt,
                        ]}
                      >
                        Waive Off (₹0)
                      </Text>
                    </TouchableOpacity>

                    {!isBaseEmiPaid && (
                      <TouchableOpacity
                        style={[styles.penaltyChip, holdPenalty && styles.penaltyChipActiveHold]}
                        onPress={handleSelectHoldPenalty}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.penaltyChipTxt, holdPenalty && styles.penaltyChipActiveHoldTxt]}>
                          Hold for Later
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Direct Instant Waive Off Link */}
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

                  {/* Explicit Settle Amount Input Box */}
                  <Text style={styles.inputFieldSubLabel}>
                    Penalty Settlement Amount to Collect (₹):
                  </Text>
                  <View style={[styles.currencyInputWrap, isPenaltyOver && styles.currencyInputWrapError]}>
                    <Text style={[styles.currencyPrefix, isPenaltyOver && { color: '#DC2626' }]}>₹</Text>
                    <TextInput
                      style={[styles.currencyInput, isPenaltyOver && { color: '#DC2626' }]}
                      value={penaltyAmount}
                      onChangeText={handleCustomPenaltyChange}
                      placeholder="0"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                    />
                  </View>

                  {isPenaltyOver ? (
                    <View style={styles.errorPromptBox}>
                      <Ionicons name="alert-circle" size={15} color="#DC2626" style={{ marginTop: 1 }} />
                      <Text style={styles.errorPromptTxt}>
                        Penalty amount (₹{effectivePenaltyVal.toLocaleString('en-IN')}) cannot exceed calculated late penalty (₹{standardPenalty.toLocaleString('en-IN')}). You can submit an amount less than actual (settlement) or equal to complete amount.
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.fieldHelpTxt}>
                      {holdPenalty
                        ? `Base EMI will be collected today. The late penalty (₹${standardPenalty.toLocaleString('en-IN')}) will be placed on hold without accumulating further penalty.`
                        : (effectivePenaltyVal > 0
                          ? `Whatever penalty is paid today (₹${effectivePenaltyVal.toLocaleString('en-IN')}) will be final and settled. No additional penalty will be added.`
                          : 'Late penalty will be ₹0 (waived off for this installment).')}
                    </Text>
                  )}
                </View>
              )}

              {/* Summary Card: Both Values Added Downwards & Total Displayed */}
              <View style={styles.totalDownwardsCard}>
                <View style={styles.downwardRow}>
                  <Text style={styles.downwardLabel}>
                    {previousEmiPaid > 0 ? 'Remaining Base EMI to Pay' : 'EMI Amount to Pay'}
                  </Text>
                  <Text style={[styles.downwardVal, isEmiOver && { color: '#DC2626' }]}>
                    ₹{emiVal.toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={styles.downwardRow}>
                  <Text style={styles.downwardLabel}>Late Penalty</Text>
                  <Text style={[styles.downwardVal, isPenaltyAlreadyPaid ? { color: '#059669' } : (isPenaltyOver ? { color: '#DC2626' } : (effectivePenaltyVal > 0 ? { color: '#DC2626' } : {}))]}>
                    {isPenaltyAlreadyPaid
                      ? (isAlreadyWaived && previousPenaltyPaid === 0 ? 'Waived (₹0)' : `Already Paid (₹${previousPenaltyPaid.toLocaleString('en-IN')})`)
                      : (holdPenalty ? 'On Hold (₹0 today)' : (waivePenalty || effectivePenaltyVal === 0 ? 'Waived (₹0)' : `+ ₹${effectivePenaltyVal.toLocaleString('en-IN')}`))}
                  </Text>
                </View>
                <View style={styles.downwardDivider} />
                <View style={styles.downwardTotalRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.downwardTotalLabel}>TOTAL AMOUNT TO COLLECT</Text>
                    <Text style={styles.downwardTotalSub}>Payable today via {paymentMode}</Text>
                  </View>
                  <Text style={[styles.downwardTotalVal, hasValidationError && { color: '#DC2626' }]}>
                    ₹{totalToCollect.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

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

              {/* Reference / UTR Number Input - Completely scrollable and visible */}
              <Text style={styles.fieldLabel}>{getRefLabel()}</Text>
              <TextInput
                style={styles.input}
                value={txnRef}
                onChangeText={setTxnRef}
                placeholder={getRefPlaceholder()}
                placeholderTextColor={colors.placeholder || '#9CA3AF'}
                autoCapitalize="characters"
              />

              {/* Modal Actions */}
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
                  style={[styles.submitBtn, hasValidationError && styles.submitBtnDisabled]}
                  onPress={handleConfirm}
                  disabled={submitting || hasValidationError}
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
  modalOverlayKeyboard: {
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 16 : 36,
    paddingBottom: 8,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 18,
    width: '100%',
    maxWidth: 520,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
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
    padding: 12,
    marginBottom: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: 12,
  },
  infoBannerTxt: {
    flex: 1,
    fontSize: 11,
    fontFamily: fonts.regular,
    color: '#0369A1',
    lineHeight: 15,
  },
  presetsWrap: {
    marginBottom: 12,
  },
  presetsLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipHighlight: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  presetChipTxt: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  presetChipHighlightTxt: {
    color: '#15803D',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 6,
  },
  sectionHeaderTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.dark,
  },
  currencyInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  currencyInputWrapError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  currencyPrefix: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
    marginRight: 6,
  },
  currencyInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
    paddingVertical: 10,
  },
  fieldHelpTxt: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 5,
    lineHeight: 15,
  },
  errorPromptBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    gap: 6,
  },
  errorPromptTxt: {
    flex: 1,
    fontSize: 11,
    fontFamily: fonts.medium,
    color: '#B91C1C',
    lineHeight: 15,
  },
  settledPenaltyCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  settledPenaltyTitle: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: '#065F46',
  },
  settledPenaltySub: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: '#047857',
    marginTop: 2,
    lineHeight: 15,
  },
  penaltySection: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 12,
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
    gap: 8,
    marginTop: 10,
  },
  penaltyActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
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
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#DC2626',
  },
  waiveOffBtnTxtActive: {
    color: colors.white,
  },
  replacePenaltyBtn: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  replacePenaltyBtnActive: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  replacePenaltyBtnTxt: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#B45309',
  },
  replacePenaltyBtnTxtActive: {
    color: colors.white,
  },
  penaltyInfoBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  penaltyCalcLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: '#92400E',
  },
  penaltyCalcVal: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#B45309',
  },
  penaltyCalcSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#78350F',
    marginTop: 3,
    lineHeight: 15,
  },
  penaltyQuickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  penaltyChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  penaltyChipActive: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  penaltyChipActiveWaive: {
    backgroundColor: '#DC2626',
    borderColor: '#B91C1C',
  },
  penaltyChipActiveHold: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  penaltyChipTxt: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: '#475569',
  },
  penaltyChipActiveTxt: {
    color: colors.white,
    fontFamily: fonts.bold,
  },
  penaltyChipActiveWaiveTxt: {
    color: colors.white,
    fontFamily: fonts.bold,
  },
  penaltyChipActiveHoldTxt: {
    color: colors.white,
    fontFamily: fonts.bold,
  },
  inputFieldSubLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#78350F',
    marginBottom: 6,
  },
  instantWaiveLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    marginBottom: 10,
    paddingVertical: 4,
  },
  instantWaiveLinkTxt: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: '#047857',
    textDecorationLine: 'underline',
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
  },
  editablePenaltyLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#78350F',
  },
  resetStandardLink: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  replacementHelpTxt: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#92400E',
    marginTop: 4,
    lineHeight: 15,
  },
  totalDownwardsCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    padding: 14,
    marginBottom: 14,
  },
  downwardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  downwardLabel: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: '#166534',
  },
  downwardVal: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#14532D',
  },
  downwardDivider: {
    height: 1,
    backgroundColor: '#BBF7D0',
    marginVertical: 8,
  },
  downwardTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  downwardTotalLabel: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: '#14532D',
    letterSpacing: 0.3,
  },
  downwardTotalSub: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: '#166534',
    marginTop: 1,
  },
  downwardTotalVal: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: '#15803D',
  },
  fieldLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.dark,
    marginBottom: 6,
    marginTop: 4,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  datePickerTxt: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text,
  },
  modesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeTxt: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: 'center',
  },
  modeTxtActive: {
    color: colors.white,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text,
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  cancelBtnTxt: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text,
  },
  submitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.6,
  },
  submitBtnTxt: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
  },
});
