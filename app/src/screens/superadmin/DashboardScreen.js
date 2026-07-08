import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, useWindowDimensions, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Header from '../../components/Header';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { getAllUsers, getAllLoans } from '../../api/superadminApi';

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
  const [users, setUsers] = useState({ admins: [], employees: [] });
  const [loans, setLoans] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, l] = await Promise.all([getAllUsers(), getAllLoans()]);
      setUsers(u);
      setLoans(l.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const recentUsers = [...(users.admins || []), ...(users.employees || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={`Hello, ${user?.name?.split(' ')[0]} 👋`} subtitle="Super Admin Dashboard" />
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark} />}
      >
        <View style={[styles.statsRow, !statsFourAcross && styles.statsRowWrap]}>
          <StatBox fourAcross={statsFourAcross} icon="shield-checkmark" label="Admins" value={users.admins?.length || 0} color={colors.primary} />
          <StatBox fourAcross={statsFourAcross} icon="people" label="Employees" value={users.employees?.length || 0} color={colors.dark} />
          <StatBox fourAcross={statsFourAcross} icon="document-text" label="Total Loans" value={loans.length} color={colors.accent} />
          <StatBox fourAcross={statsFourAcross} icon="flash" label="Active" value={loans.filter(l => ['active', 'approved'].includes(l.status)).length} color={colors.success} />
        </View>

        <Text style={styles.section}>Recent Loans</Text>
        {loans.slice(0, 5).map((loan) => (
          <TouchableOpacity key={loan.loanId} onPress={() => navigation.navigate('LoanDetail', { loanId: loan.loanId })}>
            <Card>
              <View style={styles.row}>
                <View style={styles.left}>
                  <Text style={styles.titleText}>{loan.loanId}</Text>
                  <Text style={styles.subText}>{loan.ownerName || '—'}</Text>
                  {loan.loanAmount && <Text style={styles.amount}>₹{Number(loan.loanAmount).toLocaleString('en-IN')}</Text>}
                </View>
                <StatusBadge status={loan.status} />
              </View>
            </Card>
          </TouchableOpacity>
        ))}
        {loans.length === 0 && (
          <Card style={styles.emptyCard}>
            <Ionicons name="document-outline" size={40} color={colors.border} />
            <Text style={styles.emptyText}>No loans available</Text>
          </Card>
        )}

        <Text style={[styles.section, { marginTop: 12 }]}>Recent Users</Text>
        {recentUsers.map((u) => (
          <Card key={u.userId}>
            <View style={styles.row}>
              <View style={styles.left}>
                <Text style={styles.titleText}>{u.name}</Text>
                <Text style={styles.subText}>{u.email}</Text>
                <Text style={styles.subText}>{u.mobile}</Text>
              </View>
              <View style={styles.badgeWrap}>
                <Text style={[styles.roleBadge, u.role === 'admin' ? styles.adminBadge : styles.employeeBadge]}>{u.role}</Text>
                {!u.isActive && <Text style={[styles.roleBadge, { backgroundColor: colors.danger, marginTop: 4 }]}>Inactive</Text>}
              </View>
            </View>
          </Card>
        ))}
        {recentUsers.length === 0 && (
          <Card style={styles.emptyCard}>
            <Ionicons name="people-outline" size={40} color={colors.border} />
            <Text style={styles.emptyText}>No recent users</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20, marginTop: 8 },
  statsRowWrap: { flexWrap: 'wrap', justifyContent: 'space-between' },
  statBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
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
  statValue: { fontFamily: fonts.bold, fontSize: fontSize.lg, marginTop: 6 },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
    textAlign: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  section: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.text, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  left: { flex: 1 },
  titleText: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: colors.dark },
  subText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  amount: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.success, marginTop: 2 },
  badgeWrap: { alignItems: 'flex-end' },
  roleBadge: { fontFamily: fonts.medium, fontSize: 10, color: colors.white, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  adminBadge: { backgroundColor: colors.primary },
  employeeBadge: { backgroundColor: colors.dark },
  emptyCard: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.muted, marginTop: 12 },
});
