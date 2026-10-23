import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  StatusBar,
  Linking,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Card from '../../components/Card';
import Header from '../../components/Header';
import Input from '../../components/Input';
import * as adminApi from '../../api/adminApi';
import * as employeeApi from '../../api/employeeApi';
import { usePopup } from '../../context/PopupContext';
import { useAuth } from '../../context/AuthContext';
import { formatDate, getTodayFormatted } from '../../utils/date';
import CalendarPicker from '../../components/CalendarPicker';
import CollectEmiModal from '../../components/CollectEmiModal';
import EmiScheduleLedger from '../../components/EmiScheduleLedger';

const getOrdinalDay = (dayNum) => {
  if (!dayNum) return '';
  const n = parseInt(dayNum, 10);
  if (isNaN(n)) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/**
 * Formats currency amounts cleanly:
 * - Strictly 0 decimal digits (all fractional values rounded)
 * - Exact Lakhs formatted concisely without decimals (e.g. 4,00,000 -> ₹4L, 10,00,000 -> ₹10L)
 * - Exact Crores formatted concisely without decimals (e.g. 1,00,00,000 -> ₹1Cr)
 * - Other amounts formatted with Indian comma notation (e.g. 5,53,256.8 -> ₹5,53,257)
 */
const formatCurrencyClean = (amount) => {
  if (amount == null || isNaN(amount)) return '₹0';
  const rounded = Math.round(Number(amount));
  if (rounded === 0) return '₹0';
  const abs = Math.abs(rounded);
  const sign = rounded < 0 ? '-' : '';

  if (abs >= 10000000 && abs % 10000000 === 0) {
    return `${sign}₹${abs / 10000000}Cr`;
  }
  if (abs >= 100000 && abs % 100000 === 0) {
    return `${sign}₹${abs / 100000}L`;
  }

  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

export default function RecoveryScreen({ navigation }) {
  const { user } = useAuth();
  const { showAlert } = usePopup();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'overdue', 'upcoming'

  // Payment Modal State
  const [selectedItem, setSelectedItem] = useState(null);

  // Selected Loan for EMI Schedule View on Recovery Page
  const [selectedScheduleLoan, setSelectedScheduleLoan] = useState(null);
  const [scheduleLoanEmis, setScheduleLoanEmis] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [scheduleTab, setScheduleTab] = useState('all'); // 'all', 'pending', 'paid'

  // Edit Dates Modal State
  const [editDatesModalVisible, setEditDatesModalVisible] = useState(false);
  const [editDatesItem, setEditDatesItem] = useState(null);
  const [datesData, setDatesData] = useState({ disbursementDate: '', emiStartDate: '' });
  const [submittingDates, setSubmittingDates] = useState(false);
  const [activeDatePicker, setActiveDatePicker] = useState(null);

  const isEmployee = user?.role === 'employee';

  const cleanDateStr = (d) => {
    if (!d) return '';
    return formatDate(d);
  };

  const handleOpenEditDates = (item) => {
    setEditDatesItem(item);
    setDatesData({
      disbursementDate: cleanDateStr(item.disbursementDate),
      emiStartDate: cleanDateStr(item.emiOpeningDate || item.dueDate),
    });
    setActiveDatePicker(null);
    setEditDatesModalVisible(true);
  };

  const handleSaveDates = async () => {
    if (!editDatesItem) return;
    if (!datesData.disbursementDate?.trim() && !datesData.emiStartDate?.trim()) {
      showAlert('Error', 'Please enter at least one valid date.');
      return;
    }
    setSubmittingDates(true);
    try {
      if (isEmployee) {
        await employeeApi.updateLoanDates(editDatesItem.loanId, datesData);
      } else {
        await adminApi.updateLoanDates(editDatesItem.loanId, datesData);
      }
      showAlert('Success', 'Disbursement Date and EMI Start Date updated successfully.');
      setEditDatesModalVisible(false);
      setEditDatesItem(null);
      await loadData();
    } catch (err) {
      showAlert('Error', err.response?.data?.message || err.message || 'Failed to update dates.');
    } finally {
      setSubmittingDates(false);
    }
  };

  const loadFreshLoanSchedule = async (loanId) => {
    if (!loanId) return;
    try {
      setLoadingSchedule(true);
      const data = isEmployee
        ? await employeeApi.getLoan(loanId)
        : await adminApi.getLoan(loanId);
      if (data) {
        if (Array.isArray(data.emis)) {
          setScheduleLoanEmis(data.emis);
        }
        setSelectedScheduleLoan((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            ...data,
            emis: data.emis || prev.emis,
          };
        });
      }
    } catch (e) {
      console.warn('Failed to load fresh loan schedule:', e);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const handleOpenEmiSchedule = (item) => {
    setSelectedScheduleLoan(item);
    setScheduleLoanEmis(Array.isArray(item.emis) ? item.emis : []);
    setScheduleTab('all');
    if (item.loanId) {
      loadFreshLoanSchedule(item.loanId);
    }
  };

  const loadData = useCallback(async (isRetry = false) => {
    try {
      if (!isRetry) setLoading(true);
      const data = isEmployee
        ? await employeeApi.getRecovery()
        : await adminApi.getRecovery();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      if (!isRetry) {
        setTimeout(() => {
          loadData(true);
        }, 800);
        return;
      }
      console.error('Failed to load recovery:', err);
      showAlert('Error', 'Failed to load recovery records. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [isEmployee, showAlert]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  const overdueItems = items.filter(
    (i) => i.recoveryStatus === 'overdue' || (i.dueDate && i.dueDate < todayStr),
  );
  const advanceItems = items.filter(
    (i) => i.isAdvancePaid || (i.totalAdvanceAmount && i.totalAdvanceAmount > 0),
  );
  const upcomingItems = items.filter(
    (i) => i.recoveryStatus !== 'overdue' && (!i.dueDate || i.dueDate >= todayStr),
  );

  const totalOverdueAmount = overdueItems.reduce(
    (sum, i) => sum + (i.totalOverdue != null ? i.totalOverdue : (i.dueAmount || 0)),
    0,
  );
  const totalAdvanceCollected = items.reduce(
    (sum, i) => sum + (Number(i.totalAdvanceAmount) || 0),
    0,
  );
  const totalRemainingBalance = items.reduce(
    (sum, i) => sum + (i.totalRemainingDue != null ? i.totalRemainingDue : (i.dueAmount || 0)),
    0,
  );

  const filteredItems = items.filter((item) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const nameMatch = (item.borrowerName || '').toLowerCase().includes(q);
      const idMatch = (item.displayLoanId || item.loanId || '').toLowerCase().includes(q);
      const mobMatch = (item.borrowerMobile || '').includes(q);

      // Check Aadhaar Number (Full or Last 4 digits)
      const aadhaar = String(item.borrowerAadhaar || item.aadhaar || '').replace(/\D/g, '');
      const queryDigits = q.replace(/\D/g, '');
      let aadhaarMatch = false;
      if (aadhaar) {
        if (queryDigits.length >= 4) {
          aadhaarMatch = aadhaar.slice(-4) === queryDigits || aadhaar.endsWith(queryDigits) || aadhaar.includes(queryDigits);
        }
        if (!aadhaarMatch) {
          aadhaarMatch = (item.borrowerAadhaar || item.aadhaar || '').toLowerCase().includes(q);
        }
      }

      if (!nameMatch && !idMatch && !mobMatch && !aadhaarMatch) return false;
    }

    if (activeTab === 'overdue') {
      return item.recoveryStatus === 'overdue' || (item.dueDate && item.dueDate < todayStr);
    }
    if (activeTab === 'upcoming') {
      return item.recoveryStatus !== 'overdue' && (!item.dueDate || item.dueDate >= todayStr);
    }
    return true;
  });

  const handleCardPress = (item) => {
    handleOpenEmiSchedule(item);
  };

  const handleCall = (mobile) => {
    if (!mobile) {
      showAlert('No Mobile', 'No mobile number recorded for borrower');
      return;
    }
    const cleanMobile = mobile.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanMobile}`).catch(() =>
      showAlert('Error', 'Unable to open phone dialer'),
    );
  };

  const handleWhatsApp = (mobile, item) => {
    if (!mobile) {
      showAlert('No Mobile', 'No mobile number recorded for borrower');
      return;
    }
    const cleanMobile = mobile.replace(/[^0-9]/g, '').slice(-10);
    const pendingAmount = item.totalOverdue > 0 ? item.totalOverdue : item.dueAmount;
    const msg = `Dear ${item.borrowerName}, your loan EMI payment of ₹${pendingAmount.toLocaleString('en-IN')} for Loan ID ${item.displayLoanId} is due on ${formatDate(item.dueDate)}. Please ensure timely payment to avoid penalties. Thank you, ShreeLoan.`;
    Linking.openURL(`https://wa.me/91${cleanMobile}?text=${encodeURIComponent(msg)}`).catch(() =>
      showAlert('Error', 'Unable to open WhatsApp'),
    );
  };

  const openPayModal = (item, targetEmi = null) => {
    let resolvedEmi = targetEmi;
    if (!resolvedEmi && Array.isArray(item.emis)) {
      const unpaids = item.emis.filter((e) => e.status !== 'paid').sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
      if (unpaids.length > 0) resolvedEmi = unpaids[0];
    }
    const target = resolvedEmi || {
      paymentId: item.paymentId,
      amount: Number(item.amount || 0),
      penaltyAmount: Number(item.penaltyAmount || 0),
      paidAmount: Number(item.isPartiallyPaid ? item.partialPaidAmount : (item.paidAmount || 0)),
      dueDate: item.dueDate,
      status: item.currentEmiStatus || (item.isPartiallyPaid ? 'partial' : 'pending'),
    };
    setSelectedItem({
      ...item,
      targetEmi: target,
    });
  };

  const renderEmiScheduleView = () => {
    if (!selectedScheduleLoan) return null;

    const rawEmis = scheduleLoanEmis && scheduleLoanEmis.length > 0
      ? scheduleLoanEmis
      : (selectedScheduleLoan.emis || []);

    const emisSorted = [...rawEmis].sort((a, b) => new Date(a?.dueDate || 0) - new Date(b?.dueDate || 0));

    const paidEmis = emisSorted.filter((e) => e.status === 'paid');
    const unpaidEmis = emisSorted.filter((e) => e.status !== 'paid');
    const overdueEmis = unpaidEmis.filter((e) => e.dueDate && e.dueDate < todayStr);

    let displayEmis = emisSorted;
    if (scheduleTab === 'pending') {
      displayEmis = unpaidEmis;
    } else if (scheduleTab === 'paid') {
      displayEmis = paidEmis;
    }

    const totalCount = emisSorted.length;
    const paidCount = paidEmis.length;
    const progressPct = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;
    const totalRemainingDue = Math.round(
      unpaidEmis.reduce((s, e) => {
        const penalty = e.penaltyWaived ? 0 : Number(e.penaltyAmount || 0);
        return s + Math.max(0, (Number(e.amount || 0) + penalty) - Number(e.paidAmount || 0));
      }, 0)
    );

    // Metric 1: Total Principal Amount Disbursed
    const totalPrincipal = Math.round(Number(
      selectedScheduleLoan.approvedAmount ||
      selectedScheduleLoan.loanAmount ||
      selectedScheduleLoan.principalAmount ||
      selectedScheduleLoan.principal ||
      selectedScheduleLoan.disbursedAmount ||
      selectedScheduleLoan.disbursementAmount ||
      (selectedScheduleLoan.disbursements && selectedScheduleLoan.disbursements[0]?.amount) ||
      0
    ));

    // Metric 2: Total EMI Amount to be Collected (Tenure * Monthly EMI)
    const totalTenure = Number(selectedScheduleLoan.tenureMonths || totalCount || emisSorted.length || 0);
    const monthlyEmiVal = Number(selectedScheduleLoan.emiAmount || selectedScheduleLoan.amount || (emisSorted[0]?.amount || 0));
    const scheduledEmisSum = emisSorted.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalEmiToCollect = Math.round(
      scheduledEmisSum > 0
        ? scheduledEmisSum
        : (Number(selectedScheduleLoan.totalRepayable || 0) || (monthlyEmiVal * totalTenure))
    );

    // Metric 3: Total Amount Collected through EMIs up to the current date
    const computedCollected = emisSorted.reduce((sum, e) => {
      const p = Number(e.paidAmount || 0);
      if (p > 0) return sum + p;
      if (e.status === 'paid') return sum + Number(e.amount || 0);
      if (Array.isArray(e.payments) && e.payments.length > 0) {
        return sum + e.payments.reduce((pSum, pm) => pSum + Number(pm.amount || 0), 0);
      }
      return sum;
    }, 0);
    const totalEmiCollected = Math.max(
      0,
      Math.round(
        computedCollected > 0
          ? computedCollected
          : Number(
              selectedScheduleLoan.totalCollected ||
              selectedScheduleLoan.totalPaid ||
              selectedScheduleLoan.totalPaidAmount ||
              selectedScheduleLoan.amountPaid ||
              0
            )
      )
    );

    // Metric 4: Total Overdue (EMI Due Total + All Implied Penalties with + sign)
    let finalOverdueEmiDue = overdueEmis.reduce(
      (sum, e) => sum + Math.max(0, Number(e.amount || 0) - Number(e.paidAmount || 0)),
      0
    );
    if (finalOverdueEmiDue === 0 && Number(selectedScheduleLoan.overdueEmiDue || 0) > 0) {
      finalOverdueEmiDue = Number(selectedScheduleLoan.overdueEmiDue);
    } else if (finalOverdueEmiDue === 0 && Number(selectedScheduleLoan.totalOverdue || 0) > 0) {
      finalOverdueEmiDue = Math.max(0, Number(selectedScheduleLoan.totalOverdue || 0) - Number(selectedScheduleLoan.penaltyAmount || 0));
    }
    finalOverdueEmiDue = Math.round(finalOverdueEmiDue);

    // All penalties ever implied/added to client across all EMIs (collected or not, excluding waived)
    const allPenaltiesImplied = Math.round(Math.max(
      emisSorted.reduce((sum, e) => sum + (e.penaltyWaived ? 0 : Number(e.penaltyAmount || 0)), 0),
      Number(selectedScheduleLoan.totalPenaltyImplied || selectedScheduleLoan.totalPenalty || selectedScheduleLoan.penaltyAmount || 0)
    ));

    return (
      <ScrollView
        style={styles.scheduleScroll}
        contentContainerStyle={styles.scheduleContent}
        refreshControl={
          <RefreshControl
            refreshing={loadingSchedule}
            onRefresh={() => loadFreshLoanSchedule(selectedScheduleLoan.loanId)}
            colors={[colors.dark]}
          />
        }
      >
        {/* Loan Summary Card */}
        <Card style={styles.scheduleSummaryCard}>
          <View style={styles.scheduleBorrowerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.scheduleBorrowerName}>{selectedScheduleLoan.borrowerName}</Text>
              <View style={styles.scheduleIdRow}>
                <View style={styles.loanIdBadge}>
                  <Ionicons name="document-text-outline" size={12} color={colors.muted} />
                  <Text style={styles.loanIdTxt}>{selectedScheduleLoan.displayLoanId || selectedScheduleLoan.loanId}</Text>
                </View>
                {selectedScheduleLoan.borrowerAadhaar ? (
                  <View style={styles.aadhaarBadge}>
                    <Ionicons name="card-outline" size={12} color={colors.muted} />
                    <Text style={styles.aadhaarBadgeTxt}>
                      Aadhaar: •••• {String(selectedScheduleLoan.borrowerAadhaar).replace(/[^0-9]/g, '').slice(-4)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Call & WhatsApp Quick Actions */}
            <View style={styles.scheduleContactActions}>
              <TouchableOpacity
                style={styles.scheduleCallBtn}
                onPress={() => handleCall(selectedScheduleLoan.borrowerMobile)}
              >
                <Ionicons name="call" size={14} color="#059669" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.scheduleWaBtn}
                onPress={() => handleWhatsApp(selectedScheduleLoan.borrowerMobile, selectedScheduleLoan)}
              >
                <Ionicons name="logo-whatsapp" size={15} color="#16A34A" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Key Metrics Grid */}
          <View style={styles.scheduleMetricsGrid}>
            {/* Row 1: Principal Disbursed & Total Contractual EMI Amount */}
            <View style={styles.scheduleMetricsRow}>
              {/* Metric 1: Total Principal Amount Disbursed */}
              <View style={styles.scheduleMetricItem}>
                <Text style={styles.scheduleMetricLabel}>Total Principal</Text>
                <Text style={styles.scheduleMetricVal}>
                  {formatCurrencyClean(totalPrincipal)}
                </Text>
              </View>

              {/* Metric 2: Total EMI Amount to be Collected (Tenure * Monthly EMI) */}
              <View style={styles.scheduleMetricItem}>
                <Text style={styles.scheduleMetricLabel}>Total EMI Amount</Text>
                <Text style={styles.scheduleMetricVal}>
                  {formatCurrencyClean(totalEmiToCollect)}
                </Text>
              </View>
            </View>

            <View style={styles.scheduleMetricsDivider} />

            {/* Row 2: Total Collected to Date & Total Remaining Balance */}
            <View style={styles.scheduleMetricsRow}>
              {/* Metric 3: Total Amount Collected through EMIs to date */}
              <View style={styles.scheduleMetricItem}>
                <Text style={styles.scheduleMetricLabel}>Total Collected</Text>
                <Text style={[styles.scheduleMetricVal, { color: '#059669', fontFamily: fonts.bold }]}>
                  {formatCurrencyClean(totalEmiCollected)}
                </Text>
              </View>

              {/* Metric 4: Total Remaining Balance */}
              <View style={styles.scheduleMetricItem}>
                <Text style={styles.scheduleMetricLabel}>Total Balance</Text>
                <Text style={[styles.scheduleMetricVal, { color: colors.primary, fontFamily: fonts.bold }]}>
                  {formatCurrencyClean(totalRemainingDue || selectedScheduleLoan.totalRemainingDue || 0)}
                </Text>
              </View>
            </View>

            <View style={styles.scheduleMetricsDivider} />

            {/* Row 3: Total Overdue (Full width for clear presentation of Base + Penalties) */}
            <View style={styles.scheduleMetricsRow}>
              <View style={[styles.scheduleMetricItem, { flex: 1 }]}>
                <Text style={styles.scheduleMetricLabel}>Total Overdue</Text>
                {(finalOverdueEmiDue > 0 || allPenaltiesImplied > 0) ? (
                  <View>
                    <Text
                      style={[
                        styles.scheduleMetricVal,
                        {
                          color: colors.error,
                          fontFamily: fonts.bold,
                          fontSize: 14,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {formatCurrencyClean(finalOverdueEmiDue)}
                      {allPenaltiesImplied > 0 ? (
                        <Text style={{ color: colors.error, fontFamily: fonts.bold, fontSize: 13 }}>
                          {' '}+ {formatCurrencyClean(allPenaltiesImplied)}
                        </Text>
                      ) : null}
                    </Text>
                    {allPenaltiesImplied > 0 ? (
                      <Text style={{ fontSize: 9.5, color: colors.muted, fontFamily: fonts.medium, marginTop: 1 }}>
                        EMI Due + Total Penalty Added
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={[styles.scheduleMetricVal, { color: colors.dark, fontFamily: fonts.bold }]}>
                    ₹0
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.scheduleProgressBox}>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
            </View>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressText}>
                Repayment Progress: {paidCount} / {totalCount} EMIs Paid
              </Text>
              <Text style={styles.progressPercent}>{progressPct}%</Text>
            </View>
          </View>

          {/* Quick Pay Action Banner */}
          {unpaidEmis.length > 0 && (
            <View style={styles.quickPayBanner}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.quickPayTitle}>
                  {selectedScheduleLoan.totalOverdue > 0 ? 'Overdue Dues Pending' : 'Next Installment Due'}
                </Text>
                <Text style={styles.quickPayAmount}>
                  {formatCurrencyClean(selectedScheduleLoan.totalOverdue > 0 ? selectedScheduleLoan.totalOverdue : (unpaidEmis[0]?.amount || selectedScheduleLoan.dueAmount || 0))}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.quickPayBtn}
                onPress={() => openPayModal(selectedScheduleLoan, unpaidEmis[0])}
              >
                <Ionicons name="card-outline" size={15} color={colors.white} />
                <Text style={styles.quickPayBtnTxt}>Collect Payment</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* Schedule Filter Tabs */}
        <View style={styles.scheduleTabsRow}>
          <TouchableOpacity
            style={[styles.scheduleTabBtn, scheduleTab === 'all' && styles.scheduleTabBtnActive]}
            onPress={() => setScheduleTab('all')}
          >
            <Text style={[styles.scheduleTabTxt, scheduleTab === 'all' && styles.scheduleTabTxtActive]}>
              All ({totalCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scheduleTabBtn, scheduleTab === 'pending' && styles.scheduleTabBtnActive]}
            onPress={() => setScheduleTab('pending')}
          >
            <Text style={[styles.scheduleTabTxt, scheduleTab === 'pending' && styles.scheduleTabTxtActive]}>
              Due / Overdue ({unpaidEmis.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scheduleTabBtn, scheduleTab === 'paid' && styles.scheduleTabBtnActive]}
            onPress={() => setScheduleTab('paid')}
          >
            <Text style={[styles.scheduleTabTxt, scheduleTab === 'paid' && styles.scheduleTabTxtActive]}>
              Paid ({paidCount})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Schedule List with Itemized Ledger */}
        <EmiScheduleLedger
          emis={displayEmis}
          loan={selectedScheduleLoan}
          canCollect={true}
          onPayEmi={(targetEmi) => openPayModal(selectedScheduleLoan, targetEmi)}
        />

        {/* View Full Loan Profile Link */}
        <TouchableOpacity
          style={styles.viewFullLoanLink}
          onPress={() => navigation.navigate('Loans', { screen: 'LoanDetail', params: { loanId: selectedScheduleLoan.loanId } })}
        >
          <Text style={styles.viewFullLoanLinkTxt}>View Full Loan Profile & Documents</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" translucent backgroundColor={colors.dark} />
      {selectedScheduleLoan ? (
        <Header
          title="EMI Schedule"
          subtitle={`${selectedScheduleLoan.borrowerName} • ${selectedScheduleLoan.displayLoanId}`}
          onBack={() => {
            setSelectedScheduleLoan(null);
            setScheduleTab('all');
          }}
        />
      ) : (
        <Header title="EMI Recovery & Collection" onBack={() => navigation.goBack()} />
      )}

      {selectedScheduleLoan ? (
        renderEmiScheduleView()
      ) : (

        <View style={styles.container}>
          {/* Metrics Banner (Overdue, Advance/Upcoming, Total Balance) */}
          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, { borderLeftColor: colors.error }]}>
              <View style={styles.metricHeaderRow}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.metricLabel}>Overdue</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.error }]}>
                {formatCurrencyClean(totalOverdueAmount)}
              </Text>
              <Text style={styles.metricSub}>{overdueItems.length} Loans</Text>
            </View>

            <View style={[styles.metricCard, { borderLeftColor: totalAdvanceCollected > 0 ? '#059669' : '#D97706' }]}>
              <View style={styles.metricHeaderRow}>
                <Ionicons
                  name={totalAdvanceCollected > 0 ? 'shield-checkmark' : 'calendar-outline'}
                  size={16}
                  color={totalAdvanceCollected > 0 ? '#059669' : '#D97706'}
                />
                <Text style={styles.metricLabel}>
                  {totalAdvanceCollected > 0 ? 'Advance Collected' : 'Upcoming Due'}
                </Text>
              </View>
              <Text style={[styles.metricValue, { color: totalAdvanceCollected > 0 ? '#059669' : '#D97706' }]}>
                {formatCurrencyClean(totalAdvanceCollected > 0 ? totalAdvanceCollected : upcomingItems.reduce((s, i) => s + (i.dueAmount || 0), 0))}
              </Text>
              <Text style={styles.metricSub}>
                {totalAdvanceCollected > 0 ? `${advanceItems.length} Loans in Advance` : `${upcomingItems.length} Loans`}
              </Text>
            </View>

            <View style={[styles.metricCard, { borderLeftColor: colors.primary }]}>
              <View style={styles.metricHeaderRow}>
                <Ionicons name="wallet-outline" size={16} color={colors.primary} />
                <Text style={styles.metricLabel}>Total Balance</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.primary }]}>
                {formatCurrencyClean(totalRemainingBalance)}
              </Text>
              <Text style={styles.metricSub}>{items.length} Active Loans</Text>
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search Borrower, Mobile, Loan ID..."
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Filter Tabs (All, Overdue, Upcoming) */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'all' && styles.tabActive]}
              onPress={() => setActiveTab('all')}
            >
              <Text style={[styles.tabTxt, activeTab === 'all' && styles.tabTxtActive]}>
                All ({items.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'overdue' && styles.tabActive]}
              onPress={() => setActiveTab('overdue')}
            >
              <Text style={[styles.tabTxt, activeTab === 'overdue' && styles.tabTxtActive]}>
                Overdue ({overdueItems.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
              onPress={() => setActiveTab('upcoming')}
            >
              <Text style={[styles.tabTxt, activeTab === 'upcoming' && styles.tabTxtActive]}>
                Upcoming ({upcomingItems.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Recovery List */}
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.loanId || item.paymentId}
            contentContainerStyle={styles.listContainer}
            initialNumToRender={8}
            maxToRenderPerBatch={10}
            windowSize={7}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark} />
            }
            renderItem={({ item }) => {
              const isOverdue =
                item.recoveryStatus === 'overdue' || (item.dueDate && item.dueDate < todayStr);
              const isAdvance = !isOverdue && item.totalAdvanceAmount > 0;

              const progressPct =
                item.totalCount && item.totalCount > 0
                  ? Math.min(100, Math.round(((item.paidCount || 0) / item.totalCount) * 100))
                  : 0;

              const monthlyEmiDayStr = item.dueDayNumber
                ? `${getOrdinalDay(item.dueDayNumber)} of every month`
                : item.dueDate
                  ? `${getOrdinalDay(parseInt(item.dueDate.slice(8, 10), 10))} of every month`
                  : 'Monthly';

              return (
                <Card style={styles.card}>
                  {/* Tappable Header & Body -> Navigates to Loan Details */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleCardPress(item)}
                    style={styles.cardClickableArea}
                  >
                    {/* Header: Borrower, Loan ID, and Status Badge */}
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.borrowerName}>{item.borrowerName}</Text>
                        <View style={styles.idAndDetailRow}>
                          <View style={styles.loanIdBadge}>
                            <Ionicons name="document-text-outline" size={12} color={colors.muted} />
                            <Text style={styles.loanIdTxt}>{item.displayLoanId || item.loanId}</Text>
                          </View>
                          <View style={styles.viewDetailsHint}>
                            <Text style={styles.viewDetailsHintTxt}>Details</Text>
                            <Ionicons name="chevron-forward" size={11} color={colors.primary} />
                          </View>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.statusTag,
                          {
                            backgroundColor: isOverdue ? '#FEE2E2' : isAdvance ? '#D1FAE5' : item.isPartiallyPaid ? '#FEF3C7' : '#E0F2FE',
                          },
                        ]}
                      >
                        <Ionicons
                          name={isOverdue ? 'alert-circle' : isAdvance ? 'shield-checkmark' : item.isPartiallyPaid ? 'pie-chart' : 'checkmark-circle-outline'}
                          size={12}
                          color={isOverdue ? colors.error : isAdvance ? '#047857' : item.isPartiallyPaid ? '#B45309' : '#0284C7'}
                          style={{ marginRight: 3 }}
                        />
                        <Text
                          style={[
                            styles.statusTxt,
                            {
                              color: isOverdue ? colors.error : isAdvance ? '#047857' : item.isPartiallyPaid ? '#B45309' : '#0284C7',
                            },
                          ]}
                        >
                          {isOverdue
                            ? item.overdueCount > 1
                              ? `${item.overdueCount} EMIs Overdue`
                              : item.daysOverdue > 0
                                ? `Overdue (${item.daysOverdue}d)`
                                : 'Overdue'
                            : isAdvance
                              ? `Advance (${item.advanceEmisCount || 1} EMIs)`
                              : item.isPartiallyPaid
                                ? 'Part Paid'
                                : 'Upcoming'}
                        </Text>
                      </View>
                    </View>

                    {/* Repayment Progress Bar */}
                    {item.totalCount ? (
                      <View style={styles.progressContainer}>
                        <View style={styles.progressBarBg}>
                          <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
                        </View>
                        <View style={styles.progressLabelRow}>
                          <Text style={styles.progressText}>
                            Repaid: {item.paidCount || 0} / {item.totalCount} EMIs
                          </Text>
                          <Text style={styles.progressPercent}>{progressPct}%</Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Advance Payment Callout (if borrower has paid ahead) */}
                    {isAdvance ? (
                      <View style={styles.advanceCallout}>
                        <Ionicons name="shield-checkmark" size={16} color="#059669" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.advanceCalloutTxt}>
                            EMI Advance Paid: <Text style={{ fontFamily: fonts.bold }}>₹{Number(item.totalAdvanceAmount).toLocaleString('en-IN')}</Text>
                            {item.advanceEmisCount > 0 ? ` (${item.advanceEmisCount} EMIs paid ahead)` : ''}
                          </Text>
                          <Text style={styles.advanceSubTxt}>
                            Next Upcoming EMI Date: <Text style={{ fontFamily: fonts.semiBold }}>{formatDate(item.upcomingEmiDate || item.dueDate)}</Text>
                            {' '}(No payment due until then)
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Part Payment Callout (if borrower paid a partial amount on current EMI) */}
                    {item.isPartiallyPaid ? (
                      <View style={styles.partPaymentCallout}>
                        <Ionicons name="pie-chart-outline" size={15} color="#D97706" />
                        <Text style={styles.partPaymentCalloutTxt}>
                          Part Payment Recorded: <Text style={{ fontFamily: fonts.bold }}>₹{Number(item.partialPaidAmount || 0).toLocaleString('en-IN')}</Text>
                          {' '}| Remaining for this EMI: <Text style={{ fontFamily: fonts.bold }}>₹{Number(item.dueAmount || 0).toLocaleString('en-IN')}</Text>
                        </Text>
                      </View>
                    ) : null}

                    {/* Disbursement, Opening Date & Recurring Monthly Payment Cycle */}
                    <View style={styles.scheduleInfoBox}>
                      <View style={styles.scheduleItem}>
                        <Text style={styles.scheduleLabel}>Disbursed On</Text>
                        <Text style={styles.scheduleVal}>{formatDate(item.disbursementDate) || '—'}</Text>
                      </View>
                      <View style={styles.scheduleDivider} />
                      <View style={styles.scheduleItem}>
                        <Text style={styles.scheduleLabel}>EMI Opening Date</Text>
                        <Text style={styles.scheduleVal}>{formatDate(item.emiOpeningDate) || '—'}</Text>
                      </View>
                      <View style={styles.scheduleDivider} />
                      <View style={styles.scheduleItem}>
                        <Text style={styles.scheduleLabel}>Monthly Due Day</Text>
                        <Text style={[styles.scheduleVal, { color: colors.primary, fontFamily: fonts.bold }]}>
                          {monthlyEmiDayStr}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.editDatesPillBtn}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          handleOpenEditDates(item);
                        }}
                      >
                        <Ionicons name="pencil" size={11} color="#047857" />
                        <Text style={styles.editDatesPillTxt}>Edit</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Overdue Warning Callout */}
                    {item.totalOverdue > 0 ? (
                      <View style={styles.overdueCallout}>
                        <Ionicons name="warning-outline" size={15} color={colors.error} />
                        <Text style={styles.overdueCalloutTxt}>
                          Total Overdue Dues:{' '}
                          <Text style={{ fontFamily: fonts.bold }}>
                            ₹{item.totalOverdue.toLocaleString('en-IN')}
                          </Text>
                          {item.penaltyAmount > 0 ? ` (incl. ₹${item.penaltyAmount} penalty)` : ''}
                        </Text>
                      </View>
                    ) : null}

                    {/* Financial Summary Grid */}
                    <View style={styles.detailRow}>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>Next Due Date</Text>
                        <Text style={styles.detailVal}>{formatDate(item.upcomingEmiDate || item.dueDate)}</Text>
                      </View>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>Monthly EMI</Text>
                        <Text style={styles.detailVal}>₹{Number(item.amount || 0).toLocaleString('en-IN')}</Text>
                      </View>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>Current Due</Text>
                        <Text
                          style={[
                            styles.detailVal,
                            {
                              color: isOverdue ? colors.error : isAdvance ? '#059669' : colors.dark,
                              fontFamily: fonts.bold,
                            },
                          ]}
                        >
                          {isAdvance ? `₹0 (Paid Ahead)` : `₹${Number(item.dueAmount || item.amount || 0).toLocaleString('en-IN')}`}
                        </Text>
                      </View>
                      <View style={[styles.detailCol, { alignItems: 'flex-end' }]}>
                        <Text style={styles.detailLabel}>Total Balance</Text>
                        <Text style={[styles.detailVal, { color: colors.primary, fontFamily: fonts.semiBold }]}>
                          ₹{Number(item.totalRemainingDue || 0).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    </View>

                    {/* Last EMI Paid Date (if available) */}
                    {item.lastPaidDate ? (
                      <View style={styles.lastPaymentRow}>
                        <Ionicons name="checkmark-circle" size={13} color="#059669" />
                        <Text style={styles.lastPaymentTxt}>
                          Last Payment: ₹{Number(item.lastPaidAmount || item.amount || 0).toLocaleString('en-IN')} on {formatDate(item.lastPaidDate)}
                        </Text>
                      </View>
                    ) : null}

                    {/* Borrower Contact & Address */}
                    {item.borrowerMobile ? (
                      <View style={styles.contactRow}>
                        <Ionicons name="call-outline" size={13} color={colors.muted} />
                        <Text style={styles.mobileTxt}>{item.borrowerMobile}</Text>
                        {item.borrowerAddress ? (
                          <>
                            <Text style={styles.bulletDot}>•</Text>
                            <Text style={styles.addressTxt} numberOfLines={1}>
                              {item.borrowerAddress}
                            </Text>
                          </>
                        ) : null}
                      </View>
                    ) : null}
                  </TouchableOpacity>

                  {/* Actions Row */}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => handleCall(item.borrowerMobile)}
                    >
                      <Ionicons name="call" size={13} color="#059669" />
                      <Text style={styles.callBtnTxt}>Call</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.waBtn}
                      onPress={() => handleWhatsApp(item.borrowerMobile, item)}
                    >
                      <Ionicons name="logo-whatsapp" size={13} color="#16A34A" />
                      <Text style={styles.waBtnTxt}>WA</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.scheduleBtn}
                      onPress={() => handleOpenEmiSchedule(item)}
                    >
                      <Ionicons name="calendar-outline" size={13} color="#1D4ED8" />
                      <Text style={styles.scheduleBtnTxt}>Ledger</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.collectBtn}
                      onPress={() => openPayModal(item)}
                    >
                      <Ionicons name="card-outline" size={14} color={colors.white} />
                      <Text style={styles.collectBtnTxt}>
                        {item.isPartiallyPaid ? `Pay Left: ₹${Number(item.dueAmount || 0).toLocaleString('en-IN')}` : 'Collect'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            }}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator size="large" color={colors.dark} style={{ marginTop: 40 }} />
              ) : (
                <View style={styles.empty}>
                  <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.muted} />
                  <Text style={styles.emptyTxt}>No Active Recoveries Found</Text>
                </View>
              )
            }
          />
        </View>
      )}

      {/* Unified Collect EMI Modal */}
      <CollectEmiModal
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        loan={selectedItem}
        emi={selectedItem?.targetEmi || selectedItem}
        userRole={isEmployee ? 'employee' : 'admin'}
        onSuccess={async () => {
          await loadData();
          if (selectedScheduleLoan) {
            await loadFreshLoanSchedule(selectedScheduleLoan.loanId);
          }
        }}
      />

      {/* Edit Loan Dates Modal */}
      <Modal visible={editDatesModalVisible} transparent animationType="fade" onRequestClose={() => { setActiveDatePicker(null); setEditDatesModalVisible(false); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
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
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Edit Loan Dates</Text>
                    <Text style={styles.modalSub}>
                      {editDatesItem?.borrowerName} • {editDatesItem?.displayLoanId}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setEditDatesModalVisible(false)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={22} color={colors.muted} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Disbursement Date (DD-MM-YYYY)</Text>
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

                <Text style={[styles.fieldLabel, { marginTop: 10 }]}>EMI Start Date (DD-MM-YYYY)</Text>
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

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => { setActiveDatePicker(null); setEditDatesModalVisible(false); }}
                    disabled={submittingDates}
                  >
                    <Text style={styles.cancelTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={handleSaveDates}
                    disabled={submittingDates}
                  >
                    {submittingDates ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <Text style={styles.confirmTxt}>Save Dates</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 14 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricCard: {
    flex: 1,
    backgroundColor: colors.white,
    padding: 10,
    borderRadius: 10,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  metricHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricLabel: { fontFamily: fonts.medium, fontSize: 10, color: colors.muted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSize.md, marginTop: 4 },
  metricSub: { fontFamily: fonts.regular, fontSize: 9, color: colors.muted, marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.text, padding: 0 },
  tabsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  tab: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.dark, borderColor: colors.dark },
  tabTxt: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted },
  tabTxtActive: { color: colors.white, fontFamily: fonts.semiBold },
  listContainer: { paddingBottom: 80 },
  card: { marginBottom: 12, padding: 14, borderRadius: 12 },
  cardClickableArea: { marginBottom: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  borrowerName: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.dark },
  idAndDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  loanIdBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  loanIdTxt: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.muted },
  viewDetailsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  viewDetailsHintTxt: { fontFamily: fonts.medium, fontSize: 9, color: colors.primary },
  statusTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusTxt: { fontFamily: fonts.semiBold, fontSize: 10 },
  progressContainer: { marginTop: 10, marginBottom: 6 },
  progressBarBg: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progressText: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted },
  progressPercent: { fontFamily: fonts.semiBold, fontSize: 10, color: colors.dark },
  advanceCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 8,
  },
  advanceCalloutTxt: { fontFamily: fonts.medium, fontSize: 11, color: '#065F46' },
  advanceSubTxt: { fontFamily: fonts.regular, fontSize: 10, color: '#047857', marginTop: 2 },
  partPaymentCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  partPaymentCalloutTxt: { fontFamily: fonts.medium, fontSize: 11, color: '#92400E' },
  scheduleInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scheduleItem: { flex: 1, alignItems: 'center' },
  scheduleDivider: { width: 1, height: 24, backgroundColor: '#CBD5E1' },
  scheduleLabel: { fontFamily: fonts.regular, fontSize: 9, color: colors.muted },
  scheduleVal: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.dark, marginTop: 2 },
  overdueCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  overdueCalloutTxt: { fontFamily: fonts.medium, fontSize: 11, color: colors.error },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailCol: { alignItems: 'flex-start' },
  detailLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted },
  detailVal: { fontFamily: fonts.semiBold, fontSize: fontSize.xs, color: colors.text, marginTop: 2 },
  lastPaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  lastPaymentTxt: { fontFamily: fonts.regular, fontSize: 10, color: '#047857' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  mobileTxt: { fontFamily: fonts.medium, fontSize: 11, color: colors.dark },
  bulletDot: { color: colors.muted, fontSize: 10 },
  addressTxt: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, flex: 1 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#D1FAE5',
  },
  callBtnTxt: { fontFamily: fonts.semiBold, fontSize: 11, color: '#047857' },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
  },
  waBtnTxt: { fontFamily: fonts.semiBold, fontSize: 11, color: '#15803D' },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  scheduleBtnTxt: { fontFamily: fonts.semiBold, fontSize: 11, color: '#1D4ED8' },
  collectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.dark,
  },
  collectBtnTxt: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.white },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyTxt: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.muted, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.white, borderRadius: 16, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  modalTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.dark },
  modalSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  modalOverviewBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  modalOverviewCol: { alignItems: 'center' },
  modalOverviewLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted },
  modalOverviewVal: { fontFamily: fonts.bold, fontSize: 13, color: colors.dark, marginTop: 2 },
  fieldLabel: { fontFamily: fonts.semiBold, fontSize: fontSize.xs, color: colors.text, marginBottom: 6 },
  presetChipsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F1F5F9',
  },
  presetChipActive: {
    borderColor: colors.dark || '#4B6B4E',
    backgroundColor: colors.dark || '#4B6B4E',
  },
  presetChipOverdue: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  presetChipOverdueActive: {
    borderColor: colors.error || '#E53E3E',
    backgroundColor: colors.error || '#E53E3E',
  },
  presetChipTxt: { fontFamily: fonts.medium, fontSize: 11, color: colors.text },
  presetChipTxtActive: { color: colors.white, fontFamily: fonts.bold },
  presetChipOverdueTxt: { fontFamily: fonts.medium, fontSize: 11, color: colors.error || '#E53E3E' },
  presetChipOverdueTxtActive: { color: colors.white, fontFamily: fonts.bold },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeChip: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modeChipActive: { borderColor: colors.dark, backgroundColor: colors.dark },
  modeTxt: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  modeTxtActive: { color: colors.white, fontFamily: fonts.bold },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelTxt: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.text },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.dark, alignItems: 'center' },
  confirmTxt: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.white },
  editDatesPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 6,
  },
  editDatesPillTxt: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: '#047857',
  },
  modalInputSmall: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text,
  },
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
  datePickerValueText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
  },
  scheduleScroll: { flex: 1, backgroundColor: colors.background },
  scheduleContent: { padding: 16, paddingBottom: 40 },
  scheduleSummaryCard: { padding: 16, marginBottom: 16 },
  scheduleBorrowerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  scheduleBorrowerName: { fontFamily: fonts.bold, fontSize: 17, color: colors.dark },
  scheduleIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  scheduleContactActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  scheduleCallBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center' },
  scheduleWaBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  scheduleMetricsGrid: { marginBottom: 14, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  scheduleMetricsRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  scheduleMetricsDivider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  scheduleMetricItem: { flex: 1, minWidth: 0 },
  scheduleMetricLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted },
  scheduleMetricVal: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.dark, marginTop: 2 },
  scheduleProgressBox: { marginBottom: 14 },
  quickPayBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FEF3C7', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' },
  quickPayTitle: { fontFamily: fonts.medium, fontSize: 11, color: '#B45309' },
  quickPayAmount: { fontFamily: fonts.bold, fontSize: 17, color: '#92400E', marginTop: 1 },
  quickPayBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.dark, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  quickPayBtnTxt: { color: colors.white, fontFamily: fonts.semiBold, fontSize: 12 },
  scheduleTabsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  scheduleTabBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  scheduleTabBtnActive: { backgroundColor: colors.dark, borderColor: colors.dark },
  scheduleTabTxt: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  scheduleTabTxtActive: { color: colors.white, fontFamily: fonts.bold },
  emptyScheduleBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  emptyScheduleTxt: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  installmentCard: { backgroundColor: colors.white, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  installmentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  instNumCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },
  instNumTxt: { fontFamily: fonts.bold, fontSize: 11, color: colors.dark },
  instDueDate: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.dark },
  instPaidDate: { fontFamily: fonts.regular, fontSize: 10, color: '#15803D', marginTop: 1 },
  instBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  instBadgePaid: { backgroundColor: '#DCFCE7' },
  instBadgeOverdue: { backgroundColor: '#FEE2E2' },
  instBadgeDue: { backgroundColor: '#FEF3C7' },
  instBadgeUpcoming: { backgroundColor: '#F1F5F9' },
  instBadgeTxt: { fontFamily: fonts.bold, fontSize: 10 },
  instFinancialRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  instFinancialCol: { flex: 1 },
  instFinancialLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted },
  instFinancialVal: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.dark, marginTop: 2 },
  instRefRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  instRefTxt: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  instActionRow: { marginTop: 10 },
  instCollectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.dark, paddingVertical: 9, borderRadius: 10 },
  instCollectBtnTxt: { color: colors.white, fontFamily: fonts.semiBold, fontSize: 12 },
  viewFullLoanLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 10 },
  viewFullLoanLinkTxt: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.primary },
});
