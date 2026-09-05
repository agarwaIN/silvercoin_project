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
import Button from '../../components/Button';
import { getRecovery, payEmi } from '../../api/adminApi';
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecovery();
      setItems(data);
    } catch (err) {
      console.error('Failed to load recovery:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  const overdueItems = items.filter((i) => i.dueDate < todayStr);
  const todayItems = items.filter((i) => i.dueDate === todayStr);
  const upcomingItems = items.filter((i) => i.dueDate > todayStr);

  const totalOverdueAmount = overdueItems.reduce((sum, i) => sum + (i.dueAmount || 0), 0);
  const todayAmount = todayItems.reduce((sum, i) => sum + (i.dueAmount || 0), 0);

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.borrowerName.toLowerCase().includes(search.toLowerCase()) ||
      item.displayLoanId.toLowerCase().includes(search.toLowerCase()) ||
      item.borrowerMobile.includes(search);

    if (!matchesSearch) return false;

    if (activeTab === 'overdue') return item.dueDate < todayStr;
    if (activeTab === 'today') return item.dueDate === todayStr;
    if (activeTab === 'upcoming') return item.dueDate > todayStr;
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
    const msg = `Dear ${item.borrowerName}, your EMI payment of ₹${item.dueAmount} for Loan ID ${item.displayLoanId} is due on ${formatDate(item.dueDate)}. Please make payment to avoid penalties. Thank you, ShreeLoan.`;
    Linking.openURL(`https://wa.me/91${cleanMobile}?text=${encodeURIComponent(msg)}`).catch(() =>
      showAlert('Error', 'Unable to open WhatsApp'),
    );
  };

  const openPayModal = (item) => {
    setSelectedItem(item);
    setPayAmount(String(item.dueAmount || item.amount));
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
      await payEmi(selectedItem.loanId, selectedItem.paymentId, amountNum);
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
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={[styles.metricValue, { color: colors.error }]}>
              ₹{totalOverdueAmount.toLocaleString('en-IN')}
            </Text>
            <Text style={styles.metricLabel}>Overdue ({overdueItems.length})</Text>
          </View>

          <View style={[styles.metricCard, { borderLeftColor: '#D97706' }]}>
            <Ionicons name="calendar-outline" size={18} color="#D97706" />
            <Text style={[styles.metricValue, { color: '#D97706' }]}>
              ₹{todayAmount.toLocaleString('en-IN')}
            </Text>
            <Text style={styles.metricLabel}>Due Today ({todayItems.length})</Text>
          </View>

          <View style={[styles.metricCard, { borderLeftColor: colors.primary }]}>
            <Ionicons name="documents-outline" size={18} color={colors.primary} />
            <Text style={[styles.metricValue, { color: colors.primary }]}>{items.length}</Text>
            <Text style={styles.metricLabel}>Total Due</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search customer, mobile, loan ID..."
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
          keyExtractor={(item) => item.paymentId}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark} />
          }
          renderItem={({ item }) => {
            const isOverdue = item.dueDate < todayStr;
            const isToday = item.dueDate === todayStr;

            return (
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.borrowerName}>{item.borrowerName}</Text>
                    <Text style={styles.loanIdTxt}>{item.displayLoanId}</Text>
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
                    <Text
                      style={[
                        styles.statusTxt,
                        {
                          color: isOverdue ? colors.error : isToday ? '#D97706' : '#0284C7',
                        },
                      ]}
                    >
                      {isOverdue ? 'Overdue' : isToday ? 'Due Today' : 'Upcoming'}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <View style={styles.detailCol}>
                    <Text style={styles.detailLabel}>Due Date</Text>
                    <Text style={styles.detailVal}>{formatDate(item.dueDate)}</Text>
                  </View>
                  <View style={styles.detailCol}>
                    <Text style={styles.detailLabel}>EMI Amount</Text>
                    <Text style={styles.detailVal}>₹{item.amount.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.detailCol}>
                    <Text style={styles.detailLabel}>Net Pending</Text>
                    <Text style={[styles.detailVal, { color: colors.error, fontFamily: fonts.bold }]}>
                      ₹{item.dueAmount.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                {item.borrowerMobile ? (
                  <Text style={styles.mobileTxt}>📱 {item.borrowerMobile}</Text>
                ) : null}

                {/* Actions */}
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
                    <Ionicons name="card-outline" size={14} color={colors.white} />
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
                <Text style={styles.emptyTxt}>No EMI recoveries found</Text>
              </View>
            )
          }
        />
      </View>

      {/* Collect Payment Modal */}
      <Modal visible={!!selectedItem} transparent animationType="slide" onRequestClose={() => setSelectedItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Record EMI Payment</Text>
            <Text style={styles.modalSub}>
              {selectedItem?.borrowerName} ({selectedItem?.displayLoanId})
            </Text>

            <Input
              label="Payment Amount (₹)"
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="numeric"
              placeholder="Enter amount"
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
              placeholder="Ref number if UPI/Bank"
            />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
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
                  <Text style={styles.confirmTxt}>Confirm & Collect</Text>
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
  container: { flex: 1, padding: 16 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
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
  metricValue: { fontFamily: fonts.bold, fontSize: fontSize.md, marginTop: 4 },
  metricLabel: { fontFamily: fonts.medium, fontSize: 10, color: colors.muted, marginTop: 2 },
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
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.text, padding: 0 },
  tabsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  tab: {
    paddingHorizontal: 10,
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
  card: { marginBottom: 10, padding: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  borrowerName: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.dark },
  loanIdTxt: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  statusTxt: { fontFamily: fonts.semiBold, fontSize: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  detailCol: { alignItems: 'flex-start' },
  detailLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted },
  detailVal: { fontFamily: fonts.semiBold, fontSize: fontSize.xs, color: colors.text, marginTop: 2 },
  mobileTxt: { fontFamily: fonts.medium, fontSize: 11, color: colors.dark, marginTop: 8 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#D1FAE5' },
  callBtnTxt: { fontFamily: fonts.semiBold, fontSize: 11, color: '#047857' },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#DCFCE7' },
  waBtnTxt: { fontFamily: fonts.semiBold, fontSize: 11, color: '#15803D' },
  collectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.dark },
  collectBtnTxt: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.white },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyTxt: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.muted, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.white, borderRadius: 16, padding: 20 },
  modalTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.dark },
  modalSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginBottom: 14 },
  fieldLabel: { fontFamily: fonts.semiBold, fontSize: fontSize.xs, color: colors.text, marginBottom: 6 },
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
