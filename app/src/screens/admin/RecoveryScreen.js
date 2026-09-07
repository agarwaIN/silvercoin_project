import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
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
import { formatDate } from '../../utils/date';

const getOrdinalDay = (dayNum) => {
  if (!dayNum) return '';
  const n = parseInt(dayNum, 10);
  if (isNaN(n)) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
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
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Cash'); // 'Cash', 'UPI', 'Bank'
  const [txnRef, setTxnRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isEmployee = user?.role === 'employee';

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = isEmployee
        ? await employeeApi.getRecovery()
        : await adminApi.getRecovery();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load recovery:', err);
      showAlert('Error', 'Failed to load recovery records. Please try again.');
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
      if (!nameMatch && !idMatch && !mobMatch) return false;
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
    navigation.navigate('Loans', {
      screen: 'LoanDetail',
      params: { loanId: item.loanId },
    });
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

  const openPayModal = (item) => {
    setSelectedItem(item);
    // Prefill with total overdue if overdue, or regular dueAmount
    const defaultAmount = item.totalOverdue > 0 ? item.totalOverdue : item.dueAmount;
    setPayAmount(String(defaultAmount || item.amount || ''));
    setPayMode('Cash');
    setTxnRef('');
  };

  const handleConfirmPay = async () => {
    if (!selectedItem) return;
    const amountNum = parseFloat(payAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid payment amount');
      return;
    }

    // Strictly enforce Transaction/UTR Reference for UPI or Bank
    if (['UPI', 'Bank'].includes(payMode)) {
      if (!txnRef || !txnRef.trim()) {
        showAlert(
          'UTR Reference Mandatory',
          `Transaction / UTR Reference number is mandatory for ${payMode} payments. Please enter the unique transaction reference to prevent duplicate entries.`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const cleanRef = txnRef.trim();
      if (isEmployee) {
        await employeeApi.payEmi(selectedItem.loanId, selectedItem.paymentId, amountNum, payMode, cleanRef);
      } else {
        await adminApi.payEmi(selectedItem.loanId, selectedItem.paymentId, amountNum, payMode, cleanRef);
      }
      showAlert('Success', `Recorded payment of ₹${amountNum.toLocaleString('en-IN')} successfully.`);
      setSelectedItem(null);
      await loadData();
    } catch (err) {
      showAlert('Payment Error', err.response?.data?.message || err.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" translucent backgroundColor={colors.dark} />
      <Header title="EMI Recovery & Collection" onBack={() => navigation.goBack()} />

      <View style={styles.container}>
        {/* Metrics Banner (Overdue, Advance/Upcoming, Total Balance) */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { borderLeftColor: colors.error }]}>
            <View style={styles.metricHeaderRow}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.metricLabel}>Overdue</Text>
            </View>
            <Text style={[styles.metricValue, { color: colors.error }]}>
              ₹{totalOverdueAmount.toLocaleString('en-IN')}
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
              ₹{(totalAdvanceCollected > 0 ? totalAdvanceCollected : upcomingItems.reduce((s, i) => s + (i.dueAmount || 0), 0)).toLocaleString('en-IN')}
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
              ₹{totalRemainingBalance.toLocaleString('en-IN')}
            </Text>
            <Text style={styles.metricSub}>{items.length} Active Loans</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search borrower, mobile, loan ID..."
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
                    <Ionicons name="call" size={14} color="#059669" />
                    <Text style={styles.callBtnTxt}>Call</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.waBtn}
                    onPress={() => handleWhatsApp(item.borrowerMobile, item)}
                  >
                    <Ionicons name="logo-whatsapp" size={14} color="#16A34A" />
                    <Text style={styles.waBtnTxt}>WhatsApp</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.collectBtn}
                    onPress={() => openPayModal(item)}
                  >
                    <Ionicons name="card-outline" size={15} color={colors.white} />
                    <Text style={styles.collectBtnTxt}>Collect EMI</Text>
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
                <Text style={styles.emptyTxt}>No active recoveries found</Text>
              </View>
            )
          }
        />
      </View>

      {/* Collect Payment Modal */}
      <Modal visible={!!selectedItem} transparent animationType="slide" onRequestClose={() => setSelectedItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Record EMI Payment</Text>
                <Text style={styles.modalSub}>
                  {selectedItem?.borrowerName} • {selectedItem?.displayLoanId}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedItem(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {/* Financial Overview in Modal */}
            <View style={styles.modalOverviewBox}>
              <View style={styles.modalOverviewCol}>
                <Text style={styles.modalOverviewLabel}>Monthly EMI</Text>
                <Text style={styles.modalOverviewVal}>₹{Number(selectedItem?.amount || 0).toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.modalOverviewCol}>
                <Text style={styles.modalOverviewLabel}>Current Due</Text>
                <Text style={[styles.modalOverviewVal, { color: selectedItem?.totalOverdue > 0 ? colors.error : colors.dark }]}>
                  ₹{Number(selectedItem?.dueAmount || selectedItem?.amount || 0).toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.modalOverviewCol}>
                <Text style={styles.modalOverviewLabel}>Loan Balance</Text>
                <Text style={styles.modalOverviewVal}>₹{Number(selectedItem?.totalRemainingDue || 0).toLocaleString('en-IN')}</Text>
              </View>
            </View>

            {/* Quick-fill preset chips */}
            <Text style={styles.fieldLabel}>Quick Fill Amount:</Text>
            <View style={styles.presetChipsRow}>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setPayAmount(String(selectedItem?.dueAmount || selectedItem?.amount || ''))}
              >
                <Text style={styles.presetChipTxt}>
                  {selectedItem?.isPartiallyPaid
                    ? `Remaining Due (₹${selectedItem?.dueAmount})`
                    : `1 Full EMI (₹${selectedItem?.amount})`}
                </Text>
              </TouchableOpacity>
              {selectedItem?.totalOverdue > selectedItem?.dueAmount ? (
                <TouchableOpacity
                  style={[styles.presetChip, { borderColor: colors.error, backgroundColor: '#FEE2E2' }]}
                  onPress={() => setPayAmount(String(selectedItem?.totalOverdue || ''))}
                >
                  <Text style={[styles.presetChipTxt, { color: colors.error }]}>
                    All Overdue (₹{selectedItem?.totalOverdue})
                  </Text>
                </TouchableOpacity>
              ) : null}
              {selectedItem?.amount ? (
                <TouchableOpacity
                  style={styles.presetChip}
                  onPress={() => setPayAmount(String(Number(selectedItem.amount) * 2))}
                >
                  <Text style={styles.presetChipTxt}>2 EMIs (Advance)</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <Input
              label="Payment Amount (₹)"
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="numeric"
              placeholder="Enter collected amount"
            />

            <Text style={styles.fieldLabel}>Payment Mode *</Text>
            <View style={styles.modeRow}>
              {['Cash', 'UPI', 'Bank'].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.modeChip, payMode === mode && styles.modeChipActive]}
                  onPress={() => setPayMode(mode)}
                >
                  <Text style={[styles.modeTxt, payMode === mode && styles.modeTxtActive]}>
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              label={
                ['UPI', 'Bank'].includes(payMode)
                  ? 'Transaction / UTR Reference * (Mandatory)'
                  : 'Receipt / Reference (Optional for Cash)'
              }
              value={txnRef}
              onChangeText={setTxnRef}
              placeholder={
                ['UPI', 'Bank'].includes(payMode)
                  ? 'Enter mandatory UTR / Bank Reference No.'
                  : 'Optional receipt / slip number'
              }
            />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setSelectedItem(null)}
                disabled={submitting}
              >
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleConfirmPay}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.confirmTxt}>Confirm Payment</Text>
                )}
              </TouchableOpacity>
            </View>
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
  presetChipsRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F1F5F9',
  },
  presetChipTxt: { fontFamily: fonts.medium, fontSize: 11, color: colors.text },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeChip: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modeChipActive: { borderColor: colors.dark, backgroundColor: colors.dark },
  modeTxt: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  modeTxtActive: { color: colors.white, fontFamily: fonts.bold },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelTxt: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.text },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.dark, alignItems: 'center' },
  confirmTxt: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.white },
});
