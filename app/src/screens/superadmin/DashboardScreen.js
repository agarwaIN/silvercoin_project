import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  useWindowDimensions,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Header from '../../components/Header';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { usePopup } from '../../context/PopupContext';
import {
  getAllUsers,
  getAllLoans,
  activateUser,
  deactivateUser,
  deleteUser,
} from '../../api/superadminApi';

function StatBox({ icon, label, value, color, fourAcross }) {
  return (
    <View style={[styles.statBox, fourAcross ? styles.statBoxFlex : styles.statBoxHalf, { borderTopColor: color }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{label}</Text>
    </View>
  );
}

export default function SADashboard({ navigation }) {
  const { width } = useWindowDimensions();
  const statsFourAcross = width >= 480;
  const { user } = useAuth();
  const { showAlert } = usePopup();

  const [activeTab, setActiveTab] = useState('loans'); // 'loans' | 'admins' | 'employees'
  const [users, setUsers] = useState({ admins: [], employees: [], all: [] });
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [loanStatusFilter, setLoanStatusFilter] = useState('all'); // 'all' | 'pending' | 'active' | 'completed' | 'rejected'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, l] = await Promise.all([getAllUsers(), getAllLoans()]);
      setUsers(u);
      setLoans(l.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (err) {
      console.error('Failed to load SuperAdmin dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleToggleActive = async (targetUser) => {
    const isActivating = !targetUser.isActive;
    setActionLoadingId(targetUser.userId);
    try {
      if (isActivating) {
        await activateUser(targetUser.userId);
        showAlert('Success', `${targetUser.role === 'admin' ? 'Admin' : 'Employee'} activated successfully.`);
      } else {
        await deactivateUser(targetUser.userId);
        showAlert('Success', `${targetUser.role === 'admin' ? 'Admin' : 'Employee'} deactivated successfully.`);
      }
      await load();
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Failed to update user status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteUser = (targetUser) => {
    const roleLabel = targetUser.role === 'admin' ? 'Admin' : 'Employee';
    showAlert(
      `Delete ${roleLabel}?`,
      `Are you sure you want to permanently delete "${targetUser.name}" (${targetUser.email})? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(targetUser.userId);
            try {
              await deleteUser(targetUser.userId);
              showAlert('Success', `${roleLabel} deleted successfully.`);
              await load();
            } catch (err) {
              showAlert('Error', err.response?.data?.message || `Failed to delete ${roleLabel}.`);
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  // Filtered Loans
  const filteredLoans = loans.filter((loan) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (loan.displayLoanId && loan.displayLoanId.toLowerCase().includes(q)) ||
      (loan.applicationNumber && loan.applicationNumber.toLowerCase().includes(q)) ||
      (loan.loanId && loan.loanId.toLowerCase().includes(q)) ||
      (loan.ownerName && loan.ownerName.toLowerCase().includes(q)) ||
      (loan.adminName && loan.adminName.toLowerCase().includes(q)) ||
      (loan.employeeName && loan.employeeName.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (loanStatusFilter === 'all') return true;
    if (loanStatusFilter === 'pending') return ['submitted', 'processing', 'draft', 'agreement_submitted'].includes(loan.status);
    if (loanStatusFilter === 'active') return ['active', 'approved'].includes(loan.status);
    if (loanStatusFilter === 'completed') return loan.status === 'completed';
    if (loanStatusFilter === 'rejected') return loan.status === 'rejected';
    return true;
  });

  // Filtered Admins
  const filteredAdmins = (users.admins || []).filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    return (
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.mobile?.toLowerCase().includes(q)
    );
  });

  // Filtered Employees
  const filteredEmployees = (users.employees || []).filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    return (
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.mobile?.toLowerCase().includes(q) ||
      u.creatorName?.toLowerCase().includes(q)
    );
  });

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={`Hello, ${user?.name?.split(' ')[0] || 'SuperAdmin'} 👋`} subtitle="Control Center & Multi-Tenant Management" />
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <TouchableOpacity
          style={styles.topCreateBtn}
          onPress={() => navigation.navigate('CreateAdmin')}
        >
          <Ionicons name="person-add" size={20} color={colors.white} />
          <Text style={styles.topCreateBtnText}>Create New Admin</Text>
        </TouchableOpacity>

        {/* Metrics Grid */}
        <View style={[styles.statsRow, !statsFourAcross && styles.statsRowWrap]}>
          <StatBox fourAcross={statsFourAcross} icon="shield-checkmark" label="Admins" value={users.admins?.length || 0} color={colors.primary} />
          <StatBox fourAcross={statsFourAcross} icon="people" label="Employees" value={users.employees?.length || 0} color={colors.dark} />
          <StatBox fourAcross={statsFourAcross} icon="document-text" label="Total Loans" value={loans.length} color={colors.accent} />
          <StatBox fourAcross={statsFourAcross} icon="flash" label="Active Loans" value={loans.filter((l) => ['active', 'approved'].includes(l.status)).length} color={colors.success} />
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'loans' && styles.tabBtnActive]}
            onPress={() => { setActiveTab('loans'); setSearchQuery(''); }}
          >
            <Ionicons name="document-text-outline" size={16} color={activeTab === 'loans' ? colors.white : colors.muted} />
            <Text style={[styles.tabBtnText, activeTab === 'loans' && styles.tabBtnTextActive]}>
              Loans ({loans.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'admins' && styles.tabBtnActive]}
            onPress={() => { setActiveTab('admins'); setSearchQuery(''); }}
          >
            <Ionicons name="shield-checkmark-outline" size={16} color={activeTab === 'admins' ? colors.white : colors.muted} />
            <Text style={[styles.tabBtnText, activeTab === 'admins' && styles.tabBtnTextActive]}>
              Admins ({users.admins?.length || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'employees' && styles.tabBtnActive]}
            onPress={() => { setActiveTab('employees'); setSearchQuery(''); }}
          >
            <Ionicons name="people-outline" size={16} color={activeTab === 'employees' ? colors.white : colors.muted} />
            <Text style={[styles.tabBtnText, activeTab === 'employees' && styles.tabBtnTextActive]}>
              Employees ({users.employees?.length || 0})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeTab === 'loans'
                ? 'Search loans, borrowers, admin names...'
                : activeTab === 'admins'
                ? 'Search admin name, email, mobile...'
                : 'Search employee name, email, mobile...'
            }
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.muted}
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Status Filter Chips for Loans */}
        {activeTab === 'loans' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContainer}>
            {[
              { key: 'all', label: 'All Statuses' },
              { key: 'pending', label: 'Pending' },
              { key: 'active', label: 'Active / Approved' },
              { key: 'completed', label: 'Completed' },
              { key: 'rejected', label: 'Rejected' },
            ].map((chip) => (
              <TouchableOpacity
                key={chip.key}
                style={[styles.chip, loanStatusFilter === chip.key && styles.chipActive]}
                onPress={() => setLoanStatusFilter(chip.key)}
              >
                <Text style={[styles.chipText, loanStatusFilter === chip.key && styles.chipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* TAB 1: LOANS LIST */}
        {activeTab === 'loans' && (
          <View style={{ marginTop: 8 }}>
            {filteredLoans.map((loan) => (
              <TouchableOpacity
                key={loan.loanId}
                onPress={() => navigation.navigate('LoanDetail', { loanId: loan.loanId })}
              >
                <Card style={styles.loanCard}>
                  <View style={styles.loanCardHeader}>
                    <View>
                      <Text style={styles.loanTitle}>
                        {loan.displayLoanId || loan.applicationNumber || loan.loanId}
                      </Text>
                      <Text style={styles.borrowerName}>{loan.ownerName || 'Borrower Unnamed'}</Text>
                    </View>
                    <StatusBadge status={loan.status} />
                  </View>

                  <View style={styles.loanAmountRow}>
                    <Text style={styles.loanAmountLabel}>Amount:</Text>
                    <Text style={styles.loanAmountValue}>
                      ₹{Number(loan.approvedAmount || loan.loanAmount || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={styles.ownershipRow}>
                    <View style={styles.ownerBadge}>
                      <Ionicons name="shield-outline" size={12} color={colors.primary} />
                      <Text style={styles.ownerBadgeText}>Admin: {loan.adminName || 'Unassigned'}</Text>
                    </View>
                    <View style={[styles.ownerBadge, { backgroundColor: '#F1F5F9' }]}>
                      <Ionicons name="person-outline" size={12} color={colors.dark} />
                      <Text style={[styles.ownerBadgeText, { color: colors.dark }]}>
                        Emp: {loan.employeeName || 'Unassigned'}
                      </Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}

            {filteredLoans.length === 0 && (
              <Card style={styles.emptyCard}>
                <Ionicons name="document-text-outline" size={44} color={colors.border} />
                <Text style={styles.emptyText}>No loans match your search/filter</Text>
              </Card>
            )}
          </View>
        )}

        {/* TAB 2: ADMINS LIST */}
        {activeTab === 'admins' && (
          <View style={{ marginTop: 8 }}>
            {filteredAdmins.map((admin) => {
              const isActioning = actionLoadingId === admin.userId;
              return (
                <Card key={admin.userId} style={styles.userCard}>
                  <View style={styles.userCardRow}>
                    <View style={styles.userIconCircle}>
                      <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{admin.name}</Text>
                      <Text style={styles.userSub}>{admin.email}</Text>
                      <Text style={styles.userSub}>{admin.mobile || 'No Mobile'}</Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        style={[
                          styles.statusBadgeText,
                          { backgroundColor: admin.isActive ? '#DCFCE7' : '#FEE2E2', color: admin.isActive ? '#15803D' : '#B91C1C' },
                        ]}
                      >
                        {admin.isActive ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.userActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.actionToggleBtn,
                        { borderColor: admin.isActive ? '#F59E0B' : colors.success },
                      ]}
                      onPress={() => handleToggleActive(admin)}
                      disabled={isActioning}
                    >
                      {isActioning ? (
                        <ActivityIndicator size="small" color={colors.text} />
                      ) : (
                        <>
                          <Ionicons
                            name={admin.isActive ? 'pause-circle-outline' : 'play-circle-outline'}
                            size={16}
                            color={admin.isActive ? '#D97706' : colors.success}
                          />
                          <Text
                            style={[
                              styles.actionToggleText,
                              { color: admin.isActive ? '#D97706' : colors.success },
                            ]}
                          >
                            {admin.isActive ? 'Deactivate' : 'Activate'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionDeleteBtn}
                      onPress={() => handleDeleteUser(admin)}
                      disabled={isActioning}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={styles.actionDeleteText}>Remove Admin</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })}

            {filteredAdmins.length === 0 && (
              <Card style={styles.emptyCard}>
                <Ionicons name="people-outline" size={44} color={colors.border} />
                <Text style={styles.emptyText}>No admins found</Text>
              </Card>
            )}
          </View>
        )}

        {/* TAB 3: EMPLOYEES LIST */}
        {activeTab === 'employees' && (
          <View style={{ marginTop: 8 }}>
            {filteredEmployees.map((emp) => {
              const isActioning = actionLoadingId === emp.userId;
              return (
                <Card key={emp.userId} style={styles.userCard}>
                  <View style={styles.userCardRow}>
                    <View style={[styles.userIconCircle, { backgroundColor: '#F1F5F9' }]}>
                      <Ionicons name="person" size={22} color={colors.dark} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{emp.name}</Text>
                      <Text style={styles.userSub}>{emp.email}</Text>
                      <Text style={styles.userSub}>{emp.mobile || 'No Mobile'}</Text>
                      <Text style={styles.userAdminSub}>
                        Assigned Admin: <Text style={{ fontFamily: fonts.semiBold, color: colors.primary }}>{emp.creatorName || 'SuperAdmin'}</Text>
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        style={[
                          styles.statusBadgeText,
                          { backgroundColor: emp.isActive ? '#DCFCE7' : '#FEE2E2', color: emp.isActive ? '#15803D' : '#B91C1C' },
                        ]}
                      >
                        {emp.isActive ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.userActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.actionToggleBtn,
                        { borderColor: emp.isActive ? '#F59E0B' : colors.success },
                      ]}
                      onPress={() => handleToggleActive(emp)}
                      disabled={isActioning}
                    >
                      {isActioning ? (
                        <ActivityIndicator size="small" color={colors.text} />
                      ) : (
                        <>
                          <Ionicons
                            name={emp.isActive ? 'pause-circle-outline' : 'play-circle-outline'}
                            size={16}
                            color={emp.isActive ? '#D97706' : colors.success}
                          />
                          <Text
                            style={[
                              styles.actionToggleText,
                              { color: emp.isActive ? '#D97706' : colors.success },
                            ]}
                          >
                            {emp.isActive ? 'Deactivate' : 'Activate'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionDeleteBtn}
                      onPress={() => handleDeleteUser(emp)}
                      disabled={isActioning}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={styles.actionDeleteText}>Remove Employee</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })}

            {filteredEmployees.length === 0 && (
              <Card style={styles.emptyCard}>
                <Ionicons name="people-outline" size={44} color={colors.border} />
                <Text style={styles.emptyText}>No employees found</Text>
              </Card>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 16 },
  topCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justify: 'center',
    backgroundColor: '#047857',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 8,
    marginBottom: 16,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  topCreateBtnText: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.white },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statsRowWrap: { flexWrap: 'wrap', justifyContent: 'space-between' },
  statBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    minWidth: 0,
  },
  statBoxFlex: { flex: 1, minWidth: 0 },
  statBoxHalf: { width: '47%', maxWidth: '47%', flexGrow: 0, marginBottom: 10 },
  statValue: { fontFamily: fonts.bold, fontSize: fontSize.lg, marginTop: 4 },
  statLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted, marginTop: 2, textAlign: 'center', alignSelf: 'stretch', width: '100%' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 12, padding: 4, marginBottom: 14 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8 },
  tabBtnActive: { backgroundColor: colors.primary },
  tabBtnText: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  tabBtnTextActive: { color: colors.white, fontFamily: fonts.bold },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  chipsScroll: { marginBottom: 12 },
  chipsContainer: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipActive: { backgroundColor: colors.dark, borderColor: colors.dark },
  chipText: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  chipTextActive: { color: colors.white, fontFamily: fonts.semiBold },
  loanCard: { marginBottom: 12, padding: 14 },
  loanCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  loanTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.dark },
  borrowerName: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, marginTop: 2 },
  loanAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  loanAmountLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  loanAmountValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.success },
  ownershipRow: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 8 },
  ownerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ownerBadgeText: { fontFamily: fonts.medium, fontSize: 11, color: colors.primary },
  userCard: { marginBottom: 12, padding: 14 },
  userCardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  userIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  userName: { fontFamily: fonts.bold, fontSize: 15, color: colors.dark },
  userSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  userAdminSub: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 4 },
  statusBadgeText: { fontFamily: fonts.semiBold, fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  userActionsRow: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10 },
  actionToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  actionToggleText: { fontFamily: fonts.semiBold, fontSize: 12 },
  actionDeleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  actionDeleteText: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.error },
  emptyCard: { alignItems: 'center', paddingVertical: 36 },
  emptyText: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.muted, marginTop: 10 },
});
