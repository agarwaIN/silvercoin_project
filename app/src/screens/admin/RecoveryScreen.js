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

export default function RecoveryScreen({ navigation }) {
  const { user } = useAuth();
  const { showAlert } = usePopup();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'overdue', 'today', 'upcoming'

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
  const todayItems = items.filter(
    (i) => i.recoveryStatus === 'today' || i.dueDate === todayStr,
  );
  const upcomingItems = items.filter(
    (i) => i.recoveryStatus === 'upcoming' || (i.dueDate && i.dueDate > todayStr),
  );

  const totalOverdueAmount = overdueItems.reduce(
    (sum, i) => sum + (i.totalOverdue != null ? i.totalOverdue : (i.dueAmount || 0)),
    0,
  );
  const todayAmount = todayItems.reduce((sum, i) => sum + (i.dueAmount || 0), 0);
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
      return item.recoveryStatus === 'overdue' || item.dueDate < todayStr;
    }
    if (activeTab === 'today') {
      return item.recoveryStatus === 'today' || item.dueDate === todayStr;
    }
    if (activeTab === 'upcoming') {
      return item.recoveryStatus === 'upcoming' || item.dueDate > todayStr;
    }
    return true;
  });

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

    setSubmitting(true);
    try {
      if (isEmployee) {
        await employeeApi.payEmi(selectedItem.loanId, selectedItem.paymentId, amountNum);
      } else {
        await adminApi.payEmi(selectedItem.loanId, selectedItem.paymentId, amountNum);
      }
      showAlert('Success', `Recorded payment of ₹${amountNum.toLocaleString('en-IN')} successfully.`);
      setSelectedItem(null);
      await loadData();
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" translucent backgroundColor={colors.dark} />
      <Header title="EMI Recovery & Collection" onBack={() => navigation.goBack()} />

      <View style={styles.container}>
        {/* Metrics Banner */}
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

          <View style={[styles.metricCard, { borderLeftColor: '#D97706' }]}>
            <View style={styles.metricHeaderRow}>
              <Ionicons name="calendar-outline" size={16} color="#D97706" />
              <Text style={styles.metricLabel}>Due Today</Text>
            </View>
            <Text style={[styles.metricValue, { color: '#D97706' }]}>
              ₹{todayAmount.toLocaleString('en-IN')}
            </Text>
            <Text style={styles.metricSub}>{todayItems.length} Loans</Text>
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

        {/* Tabs */}
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
            style={[styles.tab, activeTab === 'today' && styles.tabActive]}
            onPress={() => setActiveTab('today')}
          >
            <Text style={[styles.tabTxt, activeTab === 'today' && styles.tabTxtActive]}>
              Today ({todayItems.length})
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
            const isOverdue = item.recoveryStatus === 'overdue' || (item.dueDate && item.dueDate < todayStr);
            const isToday = item.recoveryStatus === 'today' || item.dueDate === todayStr;

            const progressPct =
              item.totalCount && item.totalCount > 0
                ? Math.min(100, Math.round(((item.paidCount || 0) / item.totalCount) * 100))
                : 0;

            return (
              <Card style={styles.card}>
                {/* Header: Borrower & Status */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.borrowerName}>{item.borrowerName}</Text>
                    <View style={styles.loanIdBadge}>
                      <Ionicons name="document-text-outline" size={12} color={colors.muted} />
                      <Text style={styles.loanIdTxt}>{item.displayLoanId || item.loanId}</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusTag,
                      {
                        backgroundColor: isOverdue
                          ? '#FEE2E2'
                          : isToday
                          ? '#FEF3C7'
                          : '#E0F2FE',
                      },
                    ]}
                  >
                    <Ionicons
                      name={isOverdue ? 'alert-circle' : isToday ? 'time-outline' : 'checkmark-circle-outline'}
                      size={12}
                      color={isOverdue ? colors.error : isToday ? '#D97706' : '#0284C7'}
                      style={{ marginRight: 3 }}
                    />
                    <Text
                      style={[
                        styles.statusTxt,
                        {
                          color: isOverdue ? colors.error : isToday ? '#D97706' : '#0284C7',
                        },
                      ]}
                    >
                      {isOverdue
                        ? item.overdueCount > 1
                          ? `${item.overdueCount} EMIs Overdue`
                          : item.daysOverdue > 0
                          ? `Overdue (${item.daysOverdue}d)`
                          : 'Overdue'
                        : isToday
                        ? 'Due Today'
                        : 'Upcoming'}
                    </Text>
                  </View>
                </View>

                {/* Progress Bar (Paid Count / Total Tenure) */}
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

                {/* Overdue Warning Callout (if loan has overdue installments) */}
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
                    <Text style={styles.detailVal}>{formatDate(item.dueDate)}</Text>
                  </View>
                  <View style={styles.detailCol}>
                    <Text style={styles.detailLabel}>Monthly EMI</Text>
                    <Text style={styles.detailVal}>₹{Number(item.amount || 0).toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.detailCol}>
                    <Text style={styles.detailLabel}>Current Due</Text>
                    <Text style={[styles.detailVal, { color: isOverdue ? colors.error : colors.dark, fontFamily: fonts.bold }]}>
                      ₹{Number(item.dueAmount || item.amount || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={[styles.detailCol, { alignItems: 'flex-end' }]}>
                    <Text style={styles.detailLabel}>Total Balance</Text>
                    <Text style={[styles.detailVal, { color: colors.primary, fontFamily: fonts.semiBold }]}>
                      ₹{Number(item.totalRemainingDue || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

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
                <Text style={styles.modalOverviewLabel}>Current EMI</Text>
                <Text style={styles.modalOverviewVal}>₹{Number(selectedItem?.dueAmount || 0).toLocaleString('en-IN')}</Text>
              </View>
              {selectedItem?.totalOverdue > 0 ? (
                <View style={styles.modalOverviewCol}>
                  <Text style={[styles.modalOverviewLabel, { color: colors.error }]}>Overdue</Text>
                  <Text style={[styles.modalOverviewVal, { color: colors.error }]}>
                    ₹{Number(selectedItem?.totalOverdue || 0).toLocaleString('en-IN')}
                  </Text>
                </View>
              ) : null}
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
                onPress={() => setPayAmount(String(selectedItem?.dueAmount || ''))}
              >
                <Text style={styles.presetChipTxt}>Current EMI (₹{selectedItem?.dueAmount})</Text>
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
            </View>

            <Input
              label="Payment Amount (₹)"
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="numeric"
              placeholder="Enter collected amount"
            />

            <Text style={styles.fieldLabel}>Payment Mode</Text>
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
              label="Transaction / UTR Reference (Optional)"
              value={txnRef}
              onChangeText={setTxnRef}
              placeholder="Reference number if UPI or Bank"
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
    paddingHorizontal: 11,
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  borrowerName: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.dark },
  loanIdBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  loanIdTxt: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.muted },
  statusTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusTxt: { fontFamily: fonts.semiBold, fontSize: 10 },
  progressContainer: { marginTop: 10, marginBottom: 4 },
  progressBarBg: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progressText: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted },
  progressPercent: { fontFamily: fonts.semiBold, fontSize: 10, color: colors.dark },
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
