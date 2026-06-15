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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import Header from '../../components/Header';
import { getLoans } from '../../api/employeeApi';
import { loanMatchesSearch } from '../../utils/loanSearch';

const FILTERS = ['All', 'In Progress', 'Pending', 'Approved', 'Rejected'];
const filterMap = {
  All: null,
  'In Progress': ['draft'],
  Pending: ['submitted', 'initially_approved', 'owner_not_interested', 'agreement_submitted'],
  Approved: ['approved', 'active', 'completed'],
  Rejected: ['rejected'],
};

export default function LoanListScreen({ navigation }) {
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
          placeholder="Search owner name or loan ID"
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
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate('LoanDetail', { loanId: item.loanId })}>
            <Card>
              <View style={styles.row}>
                <View style={styles.left}>
                  <Text style={styles.id}>{item.loanId}</Text>
                  <Text style={styles.owner}>{item.ownerName || '—'}</Text>
                  {item.loanAmount ? (
                    <Text style={styles.amount}>₹{Number(item.loanAmount).toLocaleString('en-IN')}</Text>
                  ) : null}
                  <Text style={styles.date}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN') : ''}
                  </Text>
                </View>
                <View style={styles.right}>
                  <StatusBadge status={item.status} />
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginTop: 8 }} />
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-outline" size={48} color={colors.border} />
            <Text style={styles.emptyText}>No applications match your filters</Text>
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
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 12 },
});
