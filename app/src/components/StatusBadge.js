import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';

const STATUS_MAP = {
  draft: { label: 'In Progress', bg: '#EFF6FF', text: '#3B82F6' },
  submitted: { label: 'Submitted', bg: '#FEF3C7', text: '#D97706' },
  initially_approved: { label: 'Initially Approved', bg: '#D1FAE5', text: '#059669' },
  owner_not_interested: { label: 'Owner Not Interested', bg: '#FEF3C7', text: '#B45309' },
  agreement_submitted: { label: 'Awaiting Final Approval', bg: '#DBEAFE', text: '#2563EB' },
  approved: { label: 'Approved', bg: '#D1FAE5', text: colors.success },
  rejected: { label: 'Rejected', bg: '#FEE2E2', text: colors.error },
  active: { label: 'Active', bg: '#DBEAFE', text: '#3B82F6' },
  completed: { label: 'Completed', bg: '#D1FAE5', text: colors.success },
  pending: { label: 'Pending', bg: '#FEF3C7', text: '#D97706' },
  paid: { label: 'Paid', bg: '#D1FAE5', text: colors.success },
  overdue: { label: 'Overdue', bg: '#FEE2E2', text: colors.error },
};

export default function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, bg: '#F3F4F6', text: colors.muted };
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.text }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  text: { fontFamily: fonts.semiBold, fontSize: fontSize.xs },
});
