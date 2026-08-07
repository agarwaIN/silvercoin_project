import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Header from '../../components/Header';
import Card from '../../components/Card';
import { getAdminReports } from '../../api/adminApi';

export default function ReportsScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const [reports, setReports] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('operational'); // operational, financial, employee

  const load = useCallback(async () => {
    try {
      const data = await getAdminReports();
      setReports(data);
    } catch (err) {
      console.log('Failed to load reports', err);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderTab = (key, label, icon) => {
    const isActive = activeTab === key;
    return (
      <TouchableOpacity
        style={[styles.tab, isActive && styles.tabActive]}
        onPress={() => setActiveTab(key)}
      >
        <Ionicons name={icon} size={18} color={isActive ? colors.primary : colors.muted} />
        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderStatBox = (label, value, icon, color = colors.primary, isCurrency = false) => {
    return (
      <View style={[styles.statBox, { borderLeftColor: color }]}>
        <View style={styles.statIconWrap}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        <View style={styles.statContent}>
          <Text style={styles.statLabel}>{label}</Text>
          <Text style={[styles.statValue, { color }]}>
            {isCurrency ? '₹' : ''}
            {typeof value === 'number' ? value.toLocaleString('en-IN') : value || 0}
          </Text>
        </View>
      </View>
    );
  };

  const renderOperational = () => {
    if (!reports?.operational) return null;
    const { dailyApplications, loanApprovals, totalDisbursement, activeLoans, pendingRecovery } = reports.operational;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Operational Reports</Text>
        <View style={styles.grid}>
          {renderStatBox('Daily Applications', dailyApplications, 'document-text-outline', colors.dark)}
          {renderStatBox('Loan Approvals', loanApprovals, 'checkmark-circle-outline', colors.success)}
          {renderStatBox('Disbursements', totalDisbursement, 'cash-outline', '#D97706', true)}
          {renderStatBox('Active Loans', activeLoans, 'pulse-outline', colors.primary)}
          {renderStatBox('Pending Recovery', pendingRecovery, 'warning-outline', colors.danger)}
        </View>
      </View>
    );
  };

  const renderFinancial = () => {
    if (!reports?.financial) return null;
    const { loanOutstanding, interestEarned, penalty, collectionSummary } = reports.financial;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Financial Reports</Text>
        <View style={styles.grid}>
          {renderStatBox('Loan Outstanding', loanOutstanding, 'wallet-outline', '#D97706', true)}
          {renderStatBox('Interest Earned', interestEarned, 'trending-up-outline', colors.success, true)}
          {renderStatBox('Penalty Collected', penalty, 'alert-circle-outline', colors.danger, true)}
          {renderStatBox('Total Collections', collectionSummary, 'cash-outline', colors.primary, true)}
        </View>
      </View>
    );
  };

  const renderEmployee = () => {
    if (!reports?.employee) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Employee Reports</Text>
        {reports.employee.length === 0 ? (
          <Text style={styles.emptyText}>No employee data found</Text>
        ) : (
          reports.employee.map((emp, index) => (
            <Card key={index} style={styles.empCard}>
              <View style={styles.empHeader}>
                <View style={styles.empAvatar}>
                  <Text style={styles.empInitials}>{emp.name ? emp.name.charAt(0).toUpperCase() : 'U'}</Text>
                </View>
                <Text style={styles.empName}>{emp.name}</Text>
              </View>
              
              <View style={styles.empStatsRow}>
                <View style={styles.empStat}>
                  <Text style={styles.empStatValue}>{emp.pendingTasks}</Text>
                  <Text style={styles.empStatLabel}>Pending Tasks</Text>
                </View>
                <View style={styles.empStatDivider} />
                <View style={styles.empStat}>
                  <Text style={styles.empStatValue}>{emp.productivity}</Text>
                  <Text style={styles.empStatLabel}>Productivity (Loans)</Text>
                </View>
                <View style={styles.empStatDivider} />
                <View style={styles.empStat}>
                  <Text style={[styles.empStatValue, { color: colors.success }]}>
                    ₹{emp.collections.toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.empStatLabel}>Collections</Text>
                </View>
              </View>
            </Card>
          ))
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title="Reports" subtitle="Performance and Analytics" />
      
      <View style={styles.tabsContainer}>
        {renderTab('operational', 'Operational', 'business-outline')}
        {renderTab('financial', 'Financial', 'bar-chart-outline')}
        {renderTab('employee', 'Employee', 'people-outline')}
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark} />}
      >
        {!reports ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading reports...</Text>
          </View>
        ) : (
          <>
            {activeTab === 'operational' && renderOperational()}
            {activeTab === 'financial' && renderFinancial()}
            {activeTab === 'employee' && renderEmployee()}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 16 },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#EEF2FF',
  },
  tabText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: 16,
  },
  grid: {
    gap: 12,
  },
  statBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.muted,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 32,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: fonts.medium,
    color: colors.muted,
  },
  empCard: {
    marginBottom: 12,
    padding: 16,
  },
  empHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  empAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  empInitials: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.base,
    color: colors.white,
  },
  empName: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.base,
    color: colors.text,
  },
  empStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
  },
  empStat: {
    flex: 1,
    alignItems: 'center',
  },
  empStatDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  empStatValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.dark,
    marginBottom: 2,
  },
  empStatLabel: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.muted,
    textAlign: 'center',
  },
});
