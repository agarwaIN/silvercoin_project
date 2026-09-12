import React, { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import Header from '../../components/Header';
import { getLoans } from '../../api/adminApi';
import { formatDate } from '../../utils/date';
import { loanMatchesSearch } from '../../utils/loanSearch';

const FILTERS = ['All', 'Draft', 'Pending', 'Approved', 'Rejected'];
const filterMap = {
  All: null,
  Draft: ['draft'],
  Pending: ['submitted', 'initially_approved', 'owner_not_interested', 'agreement_submitted'],
  Approved: ['approved', 'active', 'completed'],
  Rejected: ['rejected'],
};

export default function AdminLoanListScreen({ navigation }) {
  const [loans, setLoans] = useState([]);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getLoans();
    setLoans(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  }, []);

  useFocusEffect(
    useCallback(() => { load(); }, [load])
  );
  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const byStatus = filterMap[filter] ? loans.filter((l) => filterMap[filter].includes(l.status)) : loans;
    return byStatus.filter((l) => loanMatchesSearch(l, search));
  }, [loans, filter, search]);

  return (
    <View style={styles.safe} edges={['top']}>
       <StatusBar barStyle={'light-content'} translucent={true} backgroundColor={"green"} />
      <Header title="Loan Applications" />
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color={colors.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search Owner Name Or Loan ID"
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
      <View style={styles.tabs}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.tab, filter === f && styles.tabActive]}>
            <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        style={styles.listFlex}
        data={filtered}
        keyExtractor={(item) => item.loanId}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark} />}
        renderItem={({ item }) => {
          const hasPendingEmi = item.emiChangeRequest && item.emiChangeRequest.status === 'pending';
          return (
            <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('LoanDetail', { loanId: item.loanId })}>
              <Card>
                <View style={styles.row}>
                  <View style={styles.left}>
                    <Text style={styles.id}>{item.displayLoanId || item.applicationNumber || item.loanId}</Text>
                    <Text style={styles.owner}>{item.ownerName || '—'}</Text>
                    {(item.approvedAmount || item.loanAmount) ? (
                      <Text style={styles.amount}>Principal: ₹{Number(item.approvedAmount || item.loanAmount).toLocaleString('en-IN')}</Text>
                    ) : null}
                    <Text style={styles.date}>
                      {item.createdAt ? formatDate(item.createdAt) : ''}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <StatusBadge status={item.status} />
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginTop: 8 }} />
                  </View>
                </View>

                {hasPendingEmi && (() => {
                  const req = item.emiChangeRequest;
                  const fields = [
                    { label: 'Principal', old: item.approvedAmount || item.loanAmount, new: req.approvedAmount, isCurrency: true },
                    { label: 'Tenure', old: item.tenureMonths, new: req.tenureMonths, suffix: 'm' },
                    { label: 'Interest', old: item.interestRate, new: req.interestRate, suffix: '%' },
                    { label: 'Penalty', old: item.penaltyRate, new: req.penaltyRate, suffix: '%' },
                    { label: 'Tot Int', old: item.totalInterest, new: req.totalInterest, isCurrency: true },
                    { label: 'Tot Repay', old: item.totalRepayable, new: req.totalRepayable, isCurrency: true },
                  ];
                  const changedFields = fields.filter(f => Number(f.old || 0) !== Number(f.new || 0));

                  return (
                    <View style={styles.emiChangePreview}>
                      <View style={styles.emiChangePreviewHeader}>
                        <Ionicons name="alert-circle" size={14} color="#D97706" />
                        <Text style={styles.emiChangePreviewTitle}>EMI Change Requested</Text>
                      </View>
                      
                      {changedFields.map((f, i) => (
                        <View key={i} style={styles.diffRow}>
                          <Text style={styles.diffLabel}>{f.label}:</Text>
                          <Text style={styles.diffOld}>{f.isCurrency ? '₹' : ''}{Number(f.old || 0).toLocaleString('en-IN')}{f.suffix || ''}</Text>
                          <Ionicons name="arrow-forward" size={12} color={colors.muted} />
                          <Text style={styles.diffNew}>{f.isCurrency ? '₹' : ''}{Number(f.new || 0).toLocaleString('en-IN')}{f.suffix || ''}</Text>
                        </View>
                      ))}
                      
                      <View style={[styles.diffRow, { marginTop: 4, borderTopWidth: 1, borderTopColor: '#FDE68A', paddingTop: 6 }]}>
                        <Text style={[styles.diffLabel, { color: '#B45309', fontFamily: fonts.bold }]}>Final EMI:</Text>
                        <Text style={styles.diffOld}>₹{Number(item.emiAmount || 0).toLocaleString('en-IN')}</Text>
                        <Ionicons name="arrow-forward" size={12} color={colors.muted} />
                        <Text style={[styles.diffNew, { color: '#059669', fontFamily: fonts.bold }]}>₹{Number(req.emiAmount || 0).toLocaleString('en-IN')}</Text>
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
            <Text style={styles.emptyText}>No Loans Match Your Filters</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  listFlex: { flex: 1 },
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
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexWrap: 'wrap' },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: `${colors.border}80` },
  tabActive: { backgroundColor: colors.dark },
  tabText: { fontFamily: fonts.medium, fontSize: 10, color: colors.muted },
  tabTextActive: { color: colors.white },
  list: { padding: 16, paddingTop: 0, paddingBottom: 80, flexGrow: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  left: { flex: 1 },
  right: { alignItems: 'flex-end' },
  id: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: colors.dark },
  tag: { fontFamily: fonts.semiBold, fontSize: fontSize.xs, color: colors.primary, marginTop: 2 },
  owner: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.text, marginTop: 2 },
  amount: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.success, marginTop: 2 },
  date: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.muted, marginTop: 4 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 12 },
  emiChangePreview: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8 },
  emiChangePreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  emiChangePreviewTitle: { fontFamily: fonts.semiBold, fontSize: 12, color: '#D97706' },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  diffLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.text, width: 70 },
  diffOld: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, textDecorationLine: 'line-through' },
  diffNew: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.success },
});
