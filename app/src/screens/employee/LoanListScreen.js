import React, { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import Header from '../../components/Header';
import { getLoans } from '../../api/employeeApi';
import { formatDate, formatDateTime, getLoanSubmissionInfo, getLoanSubmissionTimestamp, getLoanNumericSeq } from '../../utils/date';
import { loanMatchesSearch } from '../../utils/loanSearch';

const FILTERS = ['All', 'In Progress', 'Pending', 'Approved', 'Completed / Foreclosed', 'Rejected'];
const filterMap = {
  All: null,
  'In Progress': ['draft'],
  Pending: ['submitted', 'initially_approved', 'owner_not_interested', 'agreement_submitted'],
  Approved: ['approved', 'active'],
  'Completed / Foreclosed': ['completed', 'foreclosed'],
  Completed: ['completed', 'foreclosed'],
  Foreclosed: ['completed', 'foreclosed'],
  Rejected: ['rejected', 'returned'],
};

export const sortLoansWithReturnedFirst = (items) => {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    const aRet = a.status === 'returned';
    const bRet = b.status === 'returned';
    if (aRet && !bRet) return -1;
    if (!aRet && bRet) return 1;
    const bTime = getLoanSubmissionTimestamp(b);
    const aTime = getLoanSubmissionTimestamp(a);
    if (bTime !== aTime) return bTime - aTime;
    const bAlt = new Date(b.createdAt || b.updatedAt || 0).getTime();
    const aAlt = new Date(a.createdAt || a.updatedAt || 0).getTime();
    if (bAlt !== aAlt) return bAlt - aAlt;
    return getLoanNumericSeq(b) - getLoanNumericSeq(a);
  });
};

export default function LoanListScreen({ navigation, route }) {
  const [loans, setLoans] = useState([]);
  const [filter, setFilter] = useState(route?.params?.initialFilter || 'All');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getLoans();
    setLoans(sortLoansWithReturnedFirst(data));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (route?.params?.initialFilter) {
        setFilter(route.params.initialFilter);
      }
      load();
    }, [load, route?.params?.initialFilter])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    let byStatus = loans;
    if (filter === 'Completed / Foreclosed' || filter === 'Completed' || filter === 'Foreclosed') {
      byStatus = loans.filter((l) =>
        l.status === 'completed' ||
        l.status === 'foreclosed' ||
        l.isForeclosed ||
        Boolean(l.foreclosureDetails)
      );
    } else if (filter === 'Approved') {
      byStatus = loans.filter((l) =>
        (l.status === 'approved' || l.status === 'active') &&
        !l.isForeclosed &&
        !l.foreclosureDetails &&
        l.status !== 'completed' &&
        l.status !== 'foreclosed'
      );
    } else if (filterMap[filter]) {
      byStatus = loans.filter((l) => filterMap[filter].includes(l.status));
    }
    const searchFiltered = byStatus.filter((l) => loanMatchesSearch(l, search));
    return sortLoansWithReturnedFirst(searchFiltered);
  }, [loans, filter, search]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header
        title="My Loan Applications"
        rightAction={
          <TouchableOpacity
            onPress={() => navigation.navigate({ name: 'NewLoan', params: {}, merge: false })}
            style={styles.addBtn}
          >
            <Ionicons name="add" size={24} color={colors.white} />
          </TouchableOpacity>
        }
      />
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color={colors.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search Name, Loan ID, or Aadhaar (full / last 4)"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScrollContent}
        >
          {FILTERS.map((f) => (
            <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.tab, filter === f && styles.tabActive]}>
              <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <FlatList
        style={styles.listFlex}
        data={filtered}
        keyExtractor={(item) => item.loanId}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark} />}
        renderItem={({ item }) => {
          const isReturned = item.status === 'returned' || item.status === 'rejected';
          const returnRemark = item.returnReason || item.rejectionReason || item.rejectReason || item.remark;

          return (
            <TouchableOpacity onPress={() => navigation.navigate('LoanDetail', { loanId: item.loanId })}>
              <Card style={isReturned ? styles.returnedCard : undefined}>
                <View style={styles.row}>
                  <View style={styles.left}>
                    <Text style={styles.id}>{item.displayLoanId || item.applicationNumber || item.loanId}</Text>
                    <Text style={styles.owner}>{item.ownerName || '—'}</Text>
                    {(item.approvedAmount || item.loanAmount) ? (
                      <Text style={styles.amount}>₹{Number(item.approvedAmount || item.loanAmount).toLocaleString('en-IN')}</Text>
                    ) : null}
                    <Text style={styles.date}>
                      {item.createdAt ? formatDate(item.createdAt) : ''}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <StatusBadge status={(item.isForeclosed || item.foreclosureDetails || item.status === 'foreclosed') ? 'foreclosed' : item.status} />
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginTop: 8 }} />
                  </View>
                </View>

                {isReturned && (
                  <View style={styles.returnedRemarkBanner}>
                    <View style={styles.returnedRemarkHeader}>
                      <Ionicons name="alert-circle" size={16} color="#DC2626" />
                      <Text style={styles.returnedRemarkTitle}>
                        {item.status === 'returned' ? 'RETURNED REMARK' : 'REJECTION REMARK'}
                      </Text>
                    </View>
                    <Text style={styles.returnedRemarkBold}>
                      {returnRemark || (item.status === 'returned' ? 'Application returned by admin for corrections.' : 'Application rejected.')}
                    </Text>
                  </View>
                )}

                {(() => {
                  const { time: submissionTime, label: timeLabel } = getLoanSubmissionInfo(item);
                  if (!item.employeeName && !submissionTime) return null;
                  return (
                    <View style={styles.submittedByRow}>
                      <Ionicons name="person" size={12} color="#047857" style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.submittedByText}>
                          Submitted / Filled By: <Text style={styles.submittedByName}>{item.employeeName || 'Employee'}</Text>
                        </Text>
                        {submissionTime ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Ionicons name="time-outline" size={11} color={colors.muted} />
                            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.muted }}>
                              {timeLabel}: {formatDateTime(submissionTime)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })()}
              </Card>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-outline" size={48} color={colors.border} />
            <Text style={styles.emptyText}>No Applications Match Your Filters</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  listFlex: { flex: 1 },
  list: { padding: 16, paddingTop: 0, paddingBottom: 80, flexGrow: 1 },
  addBtn: { padding: 4 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  searchIcon: { marginRight: 4 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.text, padding: 0 },
  tabsWrapper: { paddingVertical: 8 },
  tabsScrollContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row', alignItems: 'center' },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexWrap: 'wrap' },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: `${colors.border}80` },
  tabActive: { backgroundColor: colors.dark },
  tabText: { fontFamily: fonts.medium, fontSize: 10, color: colors.muted },
  tabTextActive: { color: colors.white },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  left: { flex: 1 },
  right: { alignItems: 'flex-end' },
  id: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: colors.dark },
  tag: { fontFamily: fonts.semiBold, fontSize: fontSize.xs, color: colors.primary, marginTop: 2 },
  owner: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.text, marginTop: 2 },
  amount: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.success, marginTop: 2 },
  date: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.muted, marginTop: 4 },
  submittedByRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  submittedByText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  submittedByName: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.dark,
  },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 12 },
  returnedCard: {
    borderColor: '#F87171',
    borderWidth: 1.5,
    backgroundColor: '#FFFDFD',
  },
  returnedRemarkBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    marginBottom: 2,
  },
  returnedRemarkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  returnedRemarkTitle: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  returnedRemarkBold: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 19,
  },
});
