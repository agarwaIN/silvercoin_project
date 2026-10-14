import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../components/Header';
import DatePickerField from '../../components/DatePickerField';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import { formatDate, getTodayFormatted } from '../../utils/date';
import { getForeclosureQuote, forecloseLoan } from '../../api/adminApi';
import { usePopup } from '../../context/PopupContext';

const PAYMENT_MODE_OPTIONS = [
  'Cash',
  'Online / UPI',
  'Cheque',
  'Bank Transfer',
  'NEFT / RTGS',
];

export default function ForecloseLoanScreen({ route, navigation }) {
  const { loan, loanId: paramLoanId, onSettled } = route.params || {};
  const loanId = paramLoanId || loan?.loanId;
  const { showAlert } = usePopup();

  // Selected closure date (defaults to today in DD-MM-YYYY format)
  const [foreclosureDate, setForeclosureDate] = useState(() => getTodayFormatted());

  // Quote & loading state
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quote, setQuote] = useState(null);

  // Editable 3 columns: Principal, Interest, Penalty
  const [principalInput, setPrincipalInput] = useState('');
  const [interestInput, setInterestInput] = useState('');
  const [penaltyApplicable, setPenaltyApplicable] = useState(false);
  const [penaltyInput, setPenaltyInput] = useState('0');
  const [reason, setReason] = useState('Early settlement requested by customer');

  // Split payment modes
  const [paymentModes, setPaymentModes] = useState([
    {
      id: 'pm-1',
      mode: 'Online / UPI',
      amount: '',
      txnRef: '',
      bankName: '',
      date: getTodayFormatted(),
    },
  ]);

  // Confirmation modal & submitting state
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch quote whenever foreclosureDate or loanId changes
  const loadQuote = useCallback(async (selectedDate) => {
    if (!loanId) return;
    setQuoteLoading(true);
    try {
      const q = await getForeclosureQuote(loanId, selectedDate);
      setQuote(q);

      // Pre-fill fields from quote
      setPrincipalInput(String(q.outstandingPrincipal || 0));
      setInterestInput(String(q.accruedInterest || 0));

      // 6-month rule: if before 6 months, suggest penalty by default, else 0
      const isUnderSix = Boolean(q.isBeforeSixMonths);
      setPenaltyApplicable(isUnderSix && Number(q.suggestedPenalty || 0) > 0);
      setPenaltyInput(isUnderSix && Number(q.suggestedPenalty || 0) > 0 ? String(q.suggestedPenalty) : '0');

      // Auto-set the single payment mode amount to total settlement
      const initialTotal = Math.round(
        Number(q.outstandingPrincipal || 0) +
        Number(q.accruedInterest || 0) +
        (isUnderSix ? Number(q.suggestedPenalty || 0) : 0)
      );

      setPaymentModes((prev) => {
        if (prev.length <= 1) {
          return [
            {
              id: prev[0]?.id || 'pm-1',
              mode: prev[0]?.mode || 'Online / UPI',
              amount: String(initialTotal),
              txnRef: prev[0]?.txnRef || '',
              bankName: prev[0]?.bankName || '',
              date: selectedDate || getTodayFormatted(),
            },
          ];
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to get foreclosure quote:', err);
      showAlert('Calculation Error', err?.response?.data?.message || 'Failed to analyze foreclosure for this date.');
    } finally {
      setQuoteLoading(false);
    }
  }, [loanId, showAlert]);

  useEffect(() => {
    loadQuote(foreclosureDate);
  }, [loanId]);

  const handleDateChange = (newDate) => {
    setForeclosureDate(newDate);
    loadQuote(newDate);
  };

  // Live calculation of 3 components and total
  const numPrincipal = Math.max(0, Math.round(Number(principalInput) || 0));
  const numInterest = Math.max(0, Math.round(Number(interestInput) || 0));
  const numPenalty = penaltyApplicable ? Math.max(0, Math.round(Number(penaltyInput) || 0)) : 0;
  const totalSettlement = numPrincipal + numInterest + numPenalty;

  // Allocated payment modes total
  const allocatedTotal = useMemo(() => {
    return paymentModes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [paymentModes]);

  const remainingBalance = totalSettlement - allocatedTotal;
  const isBalanceReconciled = Math.abs(remainingBalance) <= 1 && totalSettlement > 0;

  // Payment mode handlers
  const handleAddPaymentMode = () => {
    const nextAmount = remainingBalance > 0 ? String(remainingBalance) : '';
    setPaymentModes((prev) => [
      ...prev,
      {
        id: `pm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        mode: 'Cash',
        amount: nextAmount,
        txnRef: '',
        bankName: '',
        date: foreclosureDate || getTodayFormatted(),
      },
    ]);
  };

  const handleRemovePaymentMode = (id) => {
    if (paymentModes.length <= 1) {
      showAlert('Notice', 'At least one payment mode is required.');
      return;
    }
    setPaymentModes((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUpdatePaymentMode = (id, field, value) => {
    setPaymentModes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleAutoFillRemaining = (id) => {
    const otherAllocated = paymentModes
      .filter((p) => p.id !== id)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const need = Math.max(0, totalSettlement - otherAllocated);
    handleUpdatePaymentMode(id, 'amount', String(need));
  };

  // Validation before opening confirmation
  const handleProceedToConfirm = () => {
    if (totalSettlement <= 0) {
      showAlert('Invalid Settlement', 'Total foreclosure settlement amount must be greater than zero.');
      return;
    }

    if (Math.abs(remainingBalance) > 1) {
      if (remainingBalance > 0) {
        showAlert(
          'Allocation Incomplete',
          `₹${remainingBalance.toLocaleString('en-IN')} remains unallocated. Please distribute the full settlement amount among the payment modes.`
        );
      } else {
        showAlert(
          'Excess Allocation',
          `Allocated payment modes exceed total settlement by ₹${Math.abs(remainingBalance).toLocaleString('en-IN')}. Please adjust payment mode amounts.`
        );
      }
      return;
    }

    // Check that each payment mode has a valid amount and reference number
    for (let i = 0; i < paymentModes.length; i++) {
      const pm = paymentModes[i];
      const amt = Number(pm.amount);
      if (isNaN(amt) || amt <= 0) {
        showAlert('Invalid Amount', `Payment mode #${i + 1} (${pm.mode}) has an invalid amount.`);
        return;
      }
      if (!pm.txnRef || !pm.txnRef.trim()) {
        showAlert(
          'Reference Required',
          `Please enter a Receipt, Cheque, or Transaction reference number for payment mode #${i + 1} (${pm.mode}).`
        );
        return;
      }
    }

    setConfirmModalVisible(true);
  };

  // Final execution of foreclosure
  const handleExecuteForeclosure = async () => {
    setSubmitting(true);
    try {
      const payload = {
        foreclosureDate,
        principalAmount: numPrincipal,
        interestAmount: numInterest,
        penaltyAmount: numPenalty,
        totalAmount: totalSettlement,
        penaltyApplicable,
        monthsElapsed: quote?.monthsElapsed || 0,
        daysInterestCalculated: quote?.daysElapsed || 0,
        lastCoveredDate: quote?.lastCoveredDate || null,
        reason: reason.trim(),
        paymentModes: paymentModes.map((pm) => ({
          mode: pm.mode,
          amount: Number(pm.amount),
          txnRef: pm.txnRef.trim(),
          bankName: pm.bankName ? pm.bankName.trim() : null,
          date: pm.date || foreclosureDate,
        })),
      };

      await forecloseLoan(loanId, payload);
      setConfirmModalVisible(false);
      showAlert('Foreclosure Completed', 'The loan has been successfully foreclosed and settled.', [
        {
          text: 'OK',
          onPress: () => {
            if (onSettled) onSettled();
            navigation.goBack();
          },
        },
      ]);
    } catch (err) {
      console.error('Foreclose Error:', err);
      showAlert('Foreclosure Failed', err?.response?.data?.message || 'Failed to process foreclosure settlement.');
    } finally {
      setSubmitting(false);
    }
  };

  const borrowerName = loan?.borrowerName || loan?.applicantName || loan?.name || 'Borrower';
  const displayId = loan?.displayLoanId || loan?.applicationNumber || loan?.loanId || '';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Header title="Foreclose Loan" showBack />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Borrower & Loan Info Card */}
          <View style={styles.loanBanner}>
            <View style={styles.bannerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.borrowerName}>{borrowerName}</Text>
                <Text style={styles.loanDisplayId}>Loan ID: {displayId}</Text>
              </View>
              <View style={styles.badgeActive}>
                <Ionicons name="shield-checkmark" size={14} color="#047857" />
                <Text style={styles.badgeActiveText}>Active Loan</Text>
              </View>
            </View>

            <View style={styles.bannerGrid}>
              <View style={styles.bannerCol}>
                <Text style={styles.bannerLabel}>Sanctioned Amount</Text>
                <Text style={styles.bannerValue}>
                  ₹{Number(loan?.approvedAmount || loan?.loanAmount || 0).toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.bannerCol}>
                <Text style={styles.bannerLabel}>Interest Rate</Text>
                <Text style={styles.bannerValue}>{loan?.interestRate || 2.15}% / mo</Text>
              </View>
              <View style={styles.bannerCol}>
                <Text style={styles.bannerLabel}>Tenure</Text>
                <Text style={styles.bannerValue}>{loan?.tenureMonths || loan?.tenure || 12} Months</Text>
              </View>
            </View>
          </View>

          {/* Section 1: Foreclosure Date Picker */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="calendar" size={20} color={colors.dark} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.sectionTitle}>1. Settlement & Closure Date</Text>
                <Text style={styles.sectionSubtitle}>
                  Choose the exact date on which the loan is getting closed.
                </Text>
              </View>
            </View>

            <View style={{ marginTop: 12 }}>
              <DatePickerField
                label="Foreclosure Date (DD-MM-YYYY)"
                value={foreclosureDate}
                onChange={handleDateChange}
                placeholder="DD-MM-YYYY"
              />
            </View>
          </View>

          {/* Section 2: Loan Timeline & Rule Analysis */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="analytics" size={20} color="#0369A1" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.sectionTitle, { color: '#0369A1' }]}>
                  2. System Analysis & Timeline
                </Text>
                <Text style={styles.sectionSubtitle}>
                  Analysis calculated from loan start and last covered EMI.
                </Text>
              </View>
              {quoteLoading && <ActivityIndicator size="small" color="#0369A1" />}
            </View>

            {quote ? (
              <View style={styles.analysisContainer}>
                <View style={styles.analysisRow}>
                  <View style={styles.analysisItem}>
                    <Text style={styles.analysisLabel}>Loan Started On</Text>
                    <Text style={styles.analysisValue}>{formatDate(quote.startDate)}</Text>
                  </View>
                  <View style={styles.analysisItem}>
                    <Text style={styles.analysisLabel}>EMIs Paid / Total</Text>
                    <Text style={styles.analysisValue}>
                      {quote.paidEmiCount} of {quote.tenure} ({quote.unpaidEmiCount} unpaid)
                    </Text>
                  </View>
                </View>

                <View style={styles.analysisRow}>
                  <View style={styles.analysisItem}>
                    <Text style={styles.analysisLabel}>Last Covered Due Date</Text>
                    <Text style={styles.analysisValue}>{formatDate(quote.lastCoveredDate)}</Text>
                  </View>
                  <View style={styles.analysisItem}>
                    <Text style={styles.analysisLabel}>Days Elapsed to Foreclose</Text>
                    <Text style={[styles.analysisValue, { color: '#0369A1' }]}>
                      {quote.daysElapsed} Day{quote.daysElapsed === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>

                <View style={styles.analysisRow}>
                  <View style={styles.analysisItem}>
                    <Text style={styles.analysisLabel}>Loan Duration Elapsed</Text>
                    <Text style={styles.analysisValue}>
                      {quote.monthsElapsed} Months ({quote.totalDaysSinceStart} days)
                    </Text>
                  </View>
                  <View style={styles.analysisItem}>
                    <Text style={styles.analysisLabel}>Daily Interest Accrual</Text>
                    <Text style={styles.analysisValue}>₹{quote.dailyInterest} / day</Text>
                  </View>
                </View>

                {/* 6-Month Threshold Rule Alert */}
                {quote.isBeforeSixMonths ? (
                  <View style={styles.ruleAlertWarning}>
                    <Ionicons name="warning" size={20} color="#B45309" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.ruleAlertTitle}>Foreclosing Before 6 Months</Text>
                      <Text style={styles.ruleAlertText}>
                        Borrower is closing after {quote.monthsElapsed} months (&lt; 6 months). Penalty is applicable. As Admin, you may accept, adjust, or waive the penalty below.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.ruleAlertSuccess}>
                    <Ionicons name="checkmark-circle" size={20} color="#059669" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.ruleAlertTitle}>Completed &ge; 6 Months Duration</Text>
                      <Text style={styles.ruleAlertText}>
                        Borrower has served {quote.monthsElapsed} months (&ge; 6 months). Pre-closure penalty is exempt by policy (₹0 suggested).
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ marginTop: 8, color: colors.muted }}>Calculating breakdown...</Text>
              </View>
            )}
          </View>

          {/* Section 3: 3 Separate Columns (Principal, Interest, Penalty) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="grid" size={20} color={colors.dark} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.sectionTitle}>3. Foreclosure Settlement Breakdown</Text>
                <Text style={styles.sectionSubtitle}>
                  3 distinct columns for Principal, Interest, and Penalty.
                </Text>
              </View>
            </View>

            <View style={styles.threeColumnsContainer}>
              {/* Column 1: PRINCIPAL AMOUNT */}
              <View style={[styles.columnCard, { borderColor: '#93C5FD', backgroundColor: '#EFF6FF' }]}>
                <View style={styles.columnHeader}>
                  <Ionicons name="cash" size={16} color="#1D4ED8" />
                  <Text style={[styles.columnTitle, { color: '#1D4ED8' }]}>PRINCIPAL AMOUNT</Text>
                </View>
                <Text style={styles.columnDesc}>
                  Unpaid Principal ({quote?.unpaidEmiCount || 0} EMIs)
                </Text>

                <View style={styles.columnInputWrapper}>
                  <Text style={styles.rupeePrefix}>₹</Text>
                  <TextInput
                    style={styles.columnInput}
                    keyboardType="numeric"
                    value={principalInput}
                    onChangeText={setPrincipalInput}
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <Text style={styles.columnFormula}>
                  Suggested: ₹{Number(quote?.outstandingPrincipal || 0).toLocaleString('en-IN')}
                </Text>
              </View>

              {/* Column 2: INTEREST */}
              <View style={[styles.columnCard, { borderColor: '#C4B5FD', backgroundColor: '#F5F3FF' }]}>
                <View style={styles.columnHeader}>
                  <Ionicons name="trending-up" size={16} color="#6D28D9" />
                  <Text style={[styles.columnTitle, { color: '#6D28D9' }]}>INTEREST</Text>
                </View>
                <Text style={styles.columnDesc}>
                  Accrued for {quote?.daysElapsed || 0} days
                </Text>

                <View style={styles.columnInputWrapper}>
                  <Text style={styles.rupeePrefix}>₹</Text>
                  <TextInput
                    style={styles.columnInput}
                    keyboardType="numeric"
                    value={interestInput}
                    onChangeText={setInterestInput}
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <Text style={styles.columnFormula}>
                  @ ₹{quote?.dailyInterest || 0}/day ({loan?.interestRate || 2.15}%)
                </Text>
              </View>

              {/* Column 3: PENALTY */}
              <View style={[styles.columnCard, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
                <View style={styles.columnHeader}>
                  <Ionicons name="alert-circle" size={16} color="#B45309" />
                  <Text style={[styles.columnTitle, { color: '#B45309' }]}>PENALTY</Text>
                </View>
                <Text style={styles.columnDesc}>
                  {quote?.isBeforeSixMonths ? '< 6 Months Fee' : 'Exempt (>= 6 Mo)'}
                </Text>

                {/* Admin Toggle */}
                <View style={styles.penaltyToggleRow}>
                  <Text style={styles.penaltyToggleLabel}>Apply Fee:</Text>
                  <Switch
                    value={penaltyApplicable}
                    onValueChange={(val) => {
                      setPenaltyApplicable(val);
                      if (val && (!penaltyInput || penaltyInput === '0')) {
                        setPenaltyInput(String(quote?.suggestedPenalty || 0));
                      }
                    }}
                    trackColor={{ false: '#D1D5DB', true: '#F59E0B' }}
                    thumbColor={penaltyApplicable ? '#B45309' : '#F4F4F5'}
                  />
                </View>

                <View style={[styles.columnInputWrapper, !penaltyApplicable && styles.disabledInputWrapper]}>
                  <Text style={[styles.rupeePrefix, !penaltyApplicable && { color: '#9CA3AF' }]}>₹</Text>
                  <TextInput
                    style={[styles.columnInput, !penaltyApplicable && { color: '#9CA3AF' }]}
                    keyboardType="numeric"
                    editable={penaltyApplicable}
                    value={penaltyApplicable ? penaltyInput : '0'}
                    onChangeText={setPenaltyInput}
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <Text style={styles.columnFormula}>
                  {penaltyApplicable ? 'Admin Specified' : 'Fee Waived / Nil'}
                </Text>
              </View>
            </View>

            {/* Total Settlement Amount Highlight */}
            <View style={styles.totalSettlementBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.totalBoxLabel}>TOTAL SETTLEMENT AMOUNT</Text>
                <Text style={styles.totalBoxFormula}>
                  Principal (₹{numPrincipal.toLocaleString('en-IN')}) + Interest (₹{numInterest.toLocaleString('en-IN')}) + Penalty (₹{numPenalty.toLocaleString('en-IN')})
                </Text>
              </View>
              <Text style={styles.totalBoxAmount}>₹{totalSettlement.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          {/* Section 4: Optimal Modes of Payment (Split Payment Support) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="card" size={20} color={colors.dark} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.sectionTitle}>4. Payment Collection & Modes</Text>
                <Text style={styles.sectionSubtitle}>
                  Support multiple/partial payment modes (e.g. ₹100 Cheque + ₹15 Cash).
                </Text>
              </View>
            </View>

            {/* List of Payment Mode Rows */}
            <View style={{ marginTop: 12, gap: 12 }}>
              {paymentModes.map((pm, idx) => (
                <View key={pm.id} style={styles.paymentModeRowCard}>
                  <View style={styles.pmRowHeader}>
                    <View style={styles.pmNumberBadge}>
                      <Text style={styles.pmNumberText}>#{idx + 1}</Text>
                    </View>
                    <Text style={styles.pmRowTitle}>Payment Mode #{idx + 1}</Text>
                    {paymentModes.length > 1 && (
                      <TouchableOpacity
                        style={styles.pmDeleteBtn}
                        onPress={() => handleRemovePaymentMode(pm.id)}
                      >
                        <Ionicons name="trash-outline" size={16} color="#DC2626" />
                        <Text style={styles.pmDeleteText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Mode Selector Chips */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.modeChipsScroll}
                  >
                    {PAYMENT_MODE_OPTIONS.map((opt) => {
                      const isSelected = pm.mode === opt;
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.modeChip, isSelected && styles.modeChipSelected]}
                          onPress={() => handleUpdatePaymentMode(pm.id, 'mode', opt)}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={
                              opt === 'Cash'
                                ? 'cash-outline'
                                : opt === 'Cheque'
                                ? 'document-text-outline'
                                : 'globe-outline'
                            }
                            size={14}
                            color={isSelected ? '#FFFFFF' : '#4B5563'}
                          />
                          <Text style={[styles.modeChipText, isSelected && styles.modeChipTextSelected]}>
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Amount & Quick Fill */}
                  <View style={styles.pmInputsGrid}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputMiniLabel}>Amount (₹) *</Text>
                      <View style={styles.pmAmountWrapper}>
                        <Text style={styles.rupeeMini}>₹</Text>
                        <TextInput
                          style={styles.pmAmountInput}
                          keyboardType="numeric"
                          value={pm.amount}
                          onChangeText={(val) => handleUpdatePaymentMode(pm.id, 'amount', val)}
                          placeholder="0"
                          placeholderTextColor="#9CA3AF"
                        />
                      </View>
                    </View>

                    {remainingBalance !== 0 && (
                      <TouchableOpacity
                        style={styles.quickFillBtn}
                        onPress={() => handleAutoFillRemaining(pm.id)}
                      >
                        <Ionicons name="flash-outline" size={14} color="#0369A1" />
                        <Text style={styles.quickFillText}>Fit Balance</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Reference / Txn / Cheque number */}
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.inputMiniLabel}>
                      {pm.mode === 'Cheque'
                        ? 'Cheque Number *'
                        : pm.mode === 'Cash'
                        ? 'Receipt / Cash Voucher No *'
                        : 'Txn / UTR Reference No *'}
                    </Text>
                    <TextInput
                      style={styles.pmTextInput}
                      value={pm.txnRef}
                      onChangeText={(val) => handleUpdatePaymentMode(pm.id, 'txnRef', val)}
                      placeholder={
                        pm.mode === 'Cheque'
                          ? 'e.g. CHQ-482910'
                          : pm.mode === 'Cash'
                          ? 'e.g. RCPT-2026-001'
                          : 'e.g. UPI/2026/08/987123'
                      }
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="characters"
                    />
                  </View>

                  {/* Bank Name (optional or for Cheque / Transfer) */}
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.inputMiniLabel}>Bank / Issuer Name (Optional)</Text>
                    <TextInput
                      style={styles.pmTextInput}
                      value={pm.bankName}
                      onChangeText={(val) => handleUpdatePaymentMode(pm.id, 'bankName', val)}
                      placeholder="e.g. State Bank of India / HDFC Bank"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>
              ))}

              {/* Add payment mode button */}
              <TouchableOpacity
                style={styles.addPaymentBtn}
                onPress={handleAddPaymentMode}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={18} color="#059669" />
                <Text style={styles.addPaymentText}>+ Add Another Payment Mode (Split Payment)</Text>
              </TouchableOpacity>
            </View>

            {/* Reconciliation Balance Meter */}
            <View
              style={[
                styles.reconBox,
                isBalanceReconciled
                  ? styles.reconBoxSuccess
                  : remainingBalance > 0
                  ? styles.reconBoxWarning
                  : styles.reconBoxDanger,
              ]}
            >
              <View style={styles.reconRow}>
                <Text style={styles.reconLabel}>Total Required:</Text>
                <Text style={styles.reconValue}>₹{totalSettlement.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.reconRow}>
                <Text style={styles.reconLabel}>Total Allocated:</Text>
                <Text style={styles.reconValue}>₹{allocatedTotal.toLocaleString('en-IN')}</Text>
              </View>
              <View style={[styles.reconRow, { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 6, marginTop: 4 }]}>
                <Text style={styles.reconLabelBold}>Balance Difference:</Text>
                <Text
                  style={[
                    styles.reconValueBold,
                    isBalanceReconciled
                      ? { color: '#059669' }
                      : remainingBalance > 0
                      ? { color: '#D97706' }
                      : { color: '#DC2626' },
                  ]}
                >
                  {isBalanceReconciled
                    ? '✓ ₹0 (Fully Reconciled)'
                    : remainingBalance > 0
                    ? `₹${remainingBalance.toLocaleString('en-IN')} Unallocated`
                    : `₹${Math.abs(remainingBalance).toLocaleString('en-IN')} Overallocated`}
                </Text>
              </View>
            </View>
          </View>

          {/* Section 5: Foreclosure Remarks */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="chatbubble-ellipses" size={20} color={colors.dark} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.sectionTitle}>5. Foreclosure Remarks / Notes</Text>
                <Text style={styles.sectionSubtitle}>
                  Recorded in the audit trail and future closure statements.
                </Text>
              </View>
            </View>
            <TextInput
              style={styles.remarksInput}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Borrower settled outstanding amount via multiple modes on customer request"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Settle & Foreclose Action Button */}
          <TouchableOpacity
            style={[styles.submitBtn, !isBalanceReconciled && styles.submitBtnDisabled]}
            onPress={handleProceedToConfirm}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>
                  Proceed to Settle Foreclosure (₹{totalSettlement.toLocaleString('en-IN')})
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Confirmation & Summary Modal */}
      <Modal visible={confirmModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="shield-alert" size={24} color="#991B1B" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.modalHeaderTitle}>Confirm Foreclosure Settlement</Text>
                <Text style={styles.modalHeaderSubtitle}>Permanent Loan Settlement</Text>
              </View>
              <TouchableOpacity onPress={() => setConfirmModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380, marginTop: 12 }}>
              <View style={styles.confirmSummaryBox}>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Borrower</Text>
                  <Text style={styles.confirmValue}>{borrowerName}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Foreclosure Date</Text>
                  <Text style={styles.confirmValue}>{foreclosureDate}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Principal Outstanding</Text>
                  <Text style={styles.confirmValue}>₹{numPrincipal.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Accrued Interest ({quote?.daysElapsed || 0}d)</Text>
                  <Text style={styles.confirmValue}>₹{numInterest.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Pre-Closure Penalty</Text>
                  <Text style={styles.confirmValue}>
                    {numPenalty > 0 ? `₹${numPenalty.toLocaleString('en-IN')}` : 'Nil / Exempt'}
                  </Text>
                </View>
                <View style={[styles.confirmRow, { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[styles.confirmLabel, { fontWeight: '700', color: colors.dark }]}>Total Settlement</Text>
                  <Text style={[styles.confirmValue, { fontWeight: '800', color: '#991B1B', fontSize: 16 }]}>
                    ₹{totalSettlement.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              <Text style={styles.confirmSectionHeading}>Payment Breakdown ({paymentModes.length} modes):</Text>
              {paymentModes.map((pm, i) => (
                <View key={pm.id} style={styles.confirmModeItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.confirmModeName}>
                      {i + 1}. {pm.mode} {pm.bankName ? `(${pm.bankName})` : ''}
                    </Text>
                    <Text style={styles.confirmModeRef}>Ref: {pm.txnRef}</Text>
                  </View>
                  <Text style={styles.confirmModeAmt}>
                    ₹{Number(pm.amount || 0).toLocaleString('en-IN')}
                  </Text>
                </View>
              ))}

              <View style={styles.confirmWarningBox}>
                <Ionicons name="information-circle-outline" size={18} color="#991B1B" />
                <Text style={styles.confirmWarningText}>
                  Foreclosing will mark remaining unpaid EMIs as foreclosed and complete this loan permanently.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setConfirmModalVisible(false)}
                disabled={submitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleExecuteForeclosure}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                    <Text style={styles.modalConfirmText}>Confirm & Close Loan</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loanBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  borrowerName: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: '#111827',
  },
  loanDisplayId: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: '#6B7280',
    marginTop: 2,
  },
  badgeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    gap: 4,
  },
  badgeActiveText: {
    fontFamily: fonts.semiBold,
    fontSize: 11.5,
    color: '#065F46',
  },
  bannerGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bannerCol: {
    flex: 1,
  },
  bannerLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  bannerValue: {
    fontFamily: fonts.semiBold,
    fontSize: 13.5,
    color: '#1F2937',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 10,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: '#111827',
  },
  sectionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 2,
  },
  analysisContainer: {
    marginTop: 12,
  },
  analysisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  analysisItem: {
    flex: 1,
  },
  analysisLabel: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: '#6B7280',
  },
  analysisValue: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: '#111827',
    marginTop: 2,
  },
  ruleAlertWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  ruleAlertSuccess: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  ruleAlertTitle: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    color: '#92400E',
  },
  ruleAlertText: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: '#78350F',
    marginTop: 2,
    lineHeight: 16,
  },
  threeColumnsContainer: {
    marginTop: 14,
    gap: 12,
  },
  columnCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  columnTitle: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    letterSpacing: 0.5,
  },
  columnDesc: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#4B5563',
    marginTop: 2,
    marginBottom: 8,
  },
  columnInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 44,
  },
  disabledInputWrapper: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  rupeePrefix: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: '#374151',
    marginRight: 6,
  },
  columnInput: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 4,
  },
  columnFormula: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
  },
  penaltyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  penaltyToggleLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11.5,
    color: '#92400E',
  },
  totalSettlementBox: {
    marginTop: 16,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalBoxLabel: {
    fontFamily: fonts.bold,
    fontSize: 11.5,
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  totalBoxFormula: {
    fontFamily: fonts.regular,
    fontSize: 10.5,
    color: '#CBD5E1',
    marginTop: 2,
    marginRight: 8,
  },
  totalBoxAmount: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: '#38BDF8',
  },
  paymentModeRowCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pmRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pmNumberBadge: {
    backgroundColor: '#E5E7EB',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  pmNumberText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#374151',
  },
  pmRowTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#1F2937',
    flex: 1,
  },
  pmDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pmDeleteText: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: '#DC2626',
  },
  modeChipsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  modeChipSelected: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  modeChipText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#374151',
  },
  modeChipTextSelected: {
    color: '#FFFFFF',
    fontFamily: fonts.bold,
  },
  pmInputsGrid: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  inputMiniLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: '#4B5563',
    marginBottom: 4,
  },
  pmAmountWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
  },
  rupeeMini: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#4B5563',
    marginRight: 6,
  },
  pmAmountInput: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#111827',
  },
  quickFillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    height: 42,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  quickFillText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#0369A1',
  },
  pmTextInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#111827',
  },
  addPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 6,
  },
  addPaymentText: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    color: '#059669',
  },
  reconBox: {
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
  },
  reconBoxSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  reconBoxWarning: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  reconBoxDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  reconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  reconLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#4B5563',
  },
  reconValue: {
    fontFamily: fonts.semiBold,
    fontSize: 12.5,
    color: '#1F2937',
  },
  reconLabelBold: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    color: '#1F2937',
  },
  reconValueBold: {
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  remarksInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#111827',
    minHeight: 70,
    textAlignVertical: 'top',
    marginTop: 10,
  },
  submitBtn: {
    backgroundColor: '#991B1B',
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    shadowColor: '#991B1B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 12,
  },
  modalHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: '#111827',
  },
  modalHeaderSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  confirmSummaryBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  confirmLabel: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: '#6B7280',
  },
  confirmValue: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: '#1F2937',
  },
  confirmSectionHeading: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },
  confirmModeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  confirmModeName: {
    fontFamily: fonts.semiBold,
    fontSize: 12.5,
    color: '#1F2937',
  },
  confirmModeRef: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#6B7280',
  },
  confirmModeAmt: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#059669',
  },
  confirmWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
    gap: 8,
  },
  confirmWarningText: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: '#991B1B',
    flex: 1,
    lineHeight: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: '#4B5563',
  },
  modalConfirmBtn: {
    flex: 2,
    backgroundColor: '#991B1B',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
});
