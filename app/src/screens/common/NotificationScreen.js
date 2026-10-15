import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';

function formatNotificationTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getNotificationVisuals(type) {
  switch (type) {
    case 'loan_submitted':
      return {
        icon: 'document-text',
        color: '#2563EB', // Blue
        bgColor: '#EFF6FF',
        badge: 'Submitted',
      };
    case 'loan_initially_approved':
      return {
        icon: 'shield-checkmark',
        color: '#0D9488', // Teal
        bgColor: '#F0FDFA',
        badge: 'Initial Approved',
      };
    case 'loan_approved':
      return {
        icon: 'checkmark-circle',
        color: '#16A34A', // Green
        bgColor: '#F0FDF4',
        badge: 'Approved',
      };
    case 'loan_disbursed':
      return {
        icon: 'cash',
        color: '#059669', // Emerald
        bgColor: '#ECFDF5',
        badge: 'Disbursed',
      };
    case 'loan_rejected':
      return {
        icon: 'close-circle',
        color: '#DC2626', // Red
        bgColor: '#FEF2F2',
        badge: 'Rejected',
      };
    case 'loan_returned':
      return {
        icon: 'arrow-undo',
        color: '#D97706', // Amber
        bgColor: '#FFFBEB',
        badge: 'Returned',
      };
    case 'loan_foreclosed':
      return {
        icon: 'ribbon',
        color: '#7C3AED', // Violet
        bgColor: '#F5F3FF',
        badge: 'Foreclosed',
      };
    case 'agreement_submitted':
      return {
        icon: 'document-attach',
        color: '#0284C7', // Sky
        bgColor: '#F0F9FF',
        badge: 'Agreement',
      };
    case 'owner_not_interested':
      return {
        icon: 'person-remove',
        color: '#6B7280', // Gray
        bgColor: '#F3F4F6',
        badge: 'Not Interested',
      };
    case 'emi_payment_collected':
      return {
        icon: 'wallet',
        color: '#10B981', // Emerald
        bgColor: '#ECFDF5',
        badge: 'EMI Collected',
      };
    case 'emi_change_request':
      return {
        icon: 'swap-horizontal',
        color: '#4F46E5', // Indigo
        bgColor: '#EEF2FF',
        badge: 'EMI Request',
      };
    case 'emi_change_approved':
      return {
        icon: 'checkmark-done-circle',
        color: '#16A34A',
        bgColor: '#F0FDF4',
        badge: 'EMI Approved',
      };
    case 'emi_change_rejected':
      return {
        icon: 'alert-circle',
        color: '#DC2626',
        bgColor: '#FEF2F2',
        badge: 'EMI Rejected',
      };
    default:
      return {
        icon: 'notifications',
        color: colors.dark,
        bgColor: '#F5F7F4',
        badge: 'Update',
      };
  }
}

export default function NotificationScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const {
    notifications,
    unreadCount,
    loading,
    refreshing,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const [filter, setFilter] = useState('all'); // 'all' | 'unread'

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') {
      return (notifications || []).filter((n) => !n.isRead);
    }
    return notifications || [];
  }, [notifications, filter]);

  const handleNotificationPress = useCallback(
    (item) => {
      if (!item) return;

      if (!item.isRead) {
        markAsRead(item.notificationId);
      }

      if (item.loanId) {
        try {
          // Standard nested navigation works across both Admin and Employee navigators
          navigation.navigate('Main', {
            screen: 'Loans',
            params: {
              screen: 'LoanDetail',
              params: { loanId: item.loanId },
            },
          });
        } catch (e) {
          // Fallback direct navigate if in loan stack
          try {
            navigation.navigate('LoanDetail', { loanId: item.loanId });
          } catch (err) {
            console.warn('Navigation error:', err);
          }
        }
      }
    },
    [markAsRead, navigation]
  );

  const isAdmin = user?.role === 'admin';
  const headerSubtitle = isAdmin
    ? 'Activity & updates from employees'
    : 'Decisions & updates from admin';

  const renderItem = ({ item }) => {
    const visuals = getNotificationVisuals(item.type);
    const timeFormatted = formatNotificationTime(item.createdAt);
    const isUnread = !item.isRead;

    return (
      <TouchableOpacity
        style={[
          styles.notificationCard,
          isUnread && styles.unreadCard,
        ]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: visuals.bgColor }]}>
            <Ionicons name={visuals.icon} size={20} color={visuals.color} />
          </View>

          <View style={styles.headerTextWrap}>
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.notificationTitle,
                  isUnread && styles.unreadTitle,
                ]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>

            <View style={styles.metaRow}>
              <View style={[styles.badgeWrap, { backgroundColor: visuals.bgColor }]}>
                <Text style={[styles.badgeText, { color: visuals.color }]}>
                  {visuals.badge}
                </Text>
              </View>
              {item.displayLoanId ? (
                <View style={styles.loanPill}>
                  <Text style={styles.loanPillText}>{item.displayLoanId}</Text>
                </View>
              ) : null}
              <Text style={styles.timeText}>{timeFormatted}</Text>
            </View>
          </View>
        </View>

        <Text
          style={[
            styles.notificationBody,
            isUnread && styles.unreadBody,
          ]}
          numberOfLines={3}
        >
          {item.body}
        </Text>

        {item.loanId ? (
          <View style={styles.footerRow}>
            <Text style={styles.viewLoanText}>Tap to view loan details</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.dark} />
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading && !refreshing) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.dark} />
          <Text style={styles.emptyText}>Loading notifications...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Ionicons
            name={filter === 'unread' ? 'mail-open-outline' : 'notifications-off-outline'}
            size={48}
            color={colors.muted}
          />
        </View>
        <Text style={styles.emptyTitle}>
          {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {isAdmin
            ? 'When employees submit loan applications, agreements, or collect EMIs, you will receive notifications here.'
            : 'When the administrator approves, rejects, returns, or disburses your loan applications, you will receive notifications here.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header
        title="Notifications"
        subtitle={headerSubtitle}
        onBack={() => navigation.goBack()}
        hideNotificationBell={true}
        rightAction={
          unreadCount > 0 ? (
            <TouchableOpacity
              onPress={markAllAsRead}
              style={styles.markAllBtn}
              activeOpacity={0.7}
              accessibilityLabel="Mark all as read"
            >
              <Ionicons name="checkmark-done" size={18} color={colors.white} />
              <Text style={styles.markAllText}>Read All</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, filter === 'all' && styles.activeTab]}
          onPress={() => setFilter('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, filter === 'all' && styles.activeTabText]}>
            All
          </Text>
          <View style={[styles.countPill, filter === 'all' && styles.activeCountPill]}>
            <Text style={[styles.countPillText, filter === 'all' && styles.activeCountPillText]}>
              {(notifications || []).length}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, filter === 'unread' && styles.activeTab]}
          onPress={() => setFilter('unread')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, filter === 'unread' && styles.activeTabText]}>
            Unread
          </Text>
          {unreadCount > 0 ? (
            <View style={styles.unreadCountPill}>
              <Text style={styles.unreadCountPillText}>{unreadCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredNotifications}
        keyExtractor={(item) => item.notificationId}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[
          styles.listContent,
          filteredNotifications.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchNotifications(true)}
            tintColor={colors.dark}
            colors={[colors.dark]}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
  },
  markAllText: {
    color: colors.white,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  activeTab: {
    backgroundColor: colors.dark,
  },
  tabText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  activeTabText: {
    color: colors.white,
    fontFamily: fonts.semiBold,
  },
  countPill: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
  },
  activeCountPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  countPillText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.muted,
  },
  activeCountPillText: {
    color: colors.white,
  },
  unreadCountPill: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
  },
  unreadCountPillText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.white,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  notificationCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  unreadCard: {
    backgroundColor: '#FAFDF9',
    borderColor: colors.accent,
    borderLeftWidth: 4,
    borderLeftColor: colors.dark,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notificationTitle: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: fontSize.base,
    color: colors.text,
  },
  unreadTitle: {
    fontFamily: fonts.semiBold,
    color: '#0F172A',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  badgeWrap: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    textTransform: 'uppercase',
  },
  loanPill: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  loanPillText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.dark,
  },
  timeText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  notificationBody: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: '#4B5563',
    lineHeight: 18,
    marginTop: 2,
  },
  unreadBody: {
    color: '#1F2937',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 4,
  },
  viewLoanText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.medium,
    color: colors.dark,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.base,
    color: colors.muted,
    marginTop: 12,
  },
});
