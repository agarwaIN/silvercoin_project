import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { formatDate } from '../utils/date';

/**
 * EmiScheduleLedger Component
 * Renders an interactive EMI repayment schedule with itemized payment history/ledger,
 * showing every partial payment, UTR/receipt reference, mode, and date.
 */
export default function EmiScheduleLedger({
  emis = [],
  loan = {},
  onPayEmi = null,
  canCollect = false,
}) {
  if (!emis || emis.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="calendar-outline" size={36} color={colors.muted} />
        <Text style={styles.emptyTxt}>No EMI schedule generated yet.</Text>
      </View>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const sortedEmis = [...emis].sort((a, b) => new Date(a?.dueDate || 0) - new Date(b?.dueDate || 0));

  const approvedEmi = Number(loan?.approvedAmount ? loan?.emiAmount : loan?.emiAmount || 0);

  const isDisbursed = Boolean(
    loan?.status === 'active' ||
    loan?.status === 'completed' ||
    (Array.isArray(loan?.disbursements) && loan?.disbursements.length > 0) ||
    loan?.disbursementDate
  );
  const effectiveCanCollect = Boolean(canCollect && isDisbursed);

  return (
    <View style={styles.container}>
      {!isDisbursed && (
        <View style={styles.notDisbursedBanner}>
          <Ionicons name="information-circle-outline" size={18} color="#B45309" />
          <Text style={styles.notDisbursedTxt}>
            EMI collection will be enabled once the loan disbursement is recorded.
          </Text>
        </View>
      )}
      {sortedEmis.map((emi, idx) => {
        const paidAmount = Math.round(Number(emi.paidAmount || 0));
        const rawBase = (approvedEmi > 0 && emi.status !== 'paid' && paidAmount === 0)
          ? approvedEmi
          : Number(emi.amount || 0);
        const baseAmount = Math.round(rawBase);

        const penalty = Math.round(emi.penaltyWaived ? 0 : Number(emi.penaltyAmount || 0));
        const totalRequired = baseAmount + penalty;
        const remainingDue = Math.max(0, totalRequired - paidAmount);

        // Accurate paid status: status is 'paid' OR fully paid (remainingDue is 0 with paidAmount >= baseAmount or > 0)
        const isPaid = emi.status === 'paid' || (remainingDue === 0 && paidAmount > 0 && paidAmount >= baseAmount);
        const isForeclosed = emi.status === 'foreclosed';
        const isPartial = !isPaid && !isForeclosed && (emi.status === 'partial' || (paidAmount > 0 && remainingDue > 0));
        const isOverdue = !isPaid && !isForeclosed && emi.dueDate && emi.dueDate < todayStr;
        const isDueToday = !isPaid && !isForeclosed && emi.dueDate && emi.dueDate === todayStr;

        // Calculate days late at actual time of payment
        const paidDateStr = emi.paidDate ? String(emi.paidDate).slice(0, 10) : '';
        const dueDateStr = emi.dueDate ? String(emi.dueDate).slice(0, 10) : '';
        let daysLateAtPayment = 0;
        if (paidDateStr && dueDateStr && paidDateStr > dueDateStr) {
          const pD = new Date(paidDateStr);
          const dD = new Date(dueDateStr);
          if (!isNaN(pD.getTime()) && !isNaN(dD.getTime())) {
            daysLateAtPayment = Math.max(0, Math.floor((pD - dD) / (1000 * 60 * 60 * 24)));
          }
        }

        // Determine if late penalty was waived:
        // 1. Explicitly flagged as emi.penaltyWaived
        // 2. Cleared or fully paid after the 3-day grace period with zero penalty
        const isPenaltyWaived = Boolean(
          emi.penaltyWaived ||
          (daysLateAtPayment > 3 && penalty === 0 && (isPaid || paidAmount >= baseAmount))
        );

        // Bounced installment detection: strictly unpaid installment where a later installment has already been paid
        const isBounced = !isPaid && !isForeclosed && sortedEmis.slice(idx + 1).some(
          (laterEmi) => laterEmi.status === 'paid' || (Number(laterEmi.paidAmount || 0) > 0)
        );

        // Installment Payments Array
        const paymentsList = Array.isArray(emi.payments) && emi.payments.length > 0
          ? emi.payments
          : (paidAmount > 0 ? [{
            paymentInstallmentId: `${emi.paymentId}-P1`,
            amount: paidAmount,
            paymentMode: emi.paymentMode || 'Cash',
            transactionRef: emi.transactionRef || emi.txnRef || '',
            paidDate: emi.paidDate,
          }] : []);

        // Status Badge details
        let badgeBg = '#F1F5F9';
        let badgeColor = '#64748B';
        let badgeText = 'PENDING';
        let badgeIcon = 'calendar-outline';

        if (isPaid) {
          badgeBg = '#DCFCE7';
          badgeColor = '#15803D';
          badgeText = 'PAID';
          badgeIcon = 'checkmark-circle';
        } else if (isPartial) {
          badgeBg = '#FEF3C7';
          badgeColor = '#B45309';
          badgeText = `PARTIAL • ₹${remainingDue.toLocaleString('en-IN')}`;
          badgeIcon = 'pie-chart';
        } else if (isForeclosed) {
          badgeBg = '#F5F3FF';
          badgeColor = '#7C3AED';
          badgeText = 'FORECLOSED';
          badgeIcon = 'ribbon';
        } else if (isBounced) {
          badgeBg = '#FFEDD5';
          badgeColor = '#EA580C';
          badgeText = isOverdue ? 'BOUNCED • OVERDUE' : 'BOUNCED';
          badgeIcon = null; // Overdue icon removed per user instructions
        } else if (isOverdue) {
          badgeBg = '#FFEDD5';
          badgeColor = '#EA580C';
          badgeText = 'OVERDUE';
          badgeIcon = null; // Overdue icon removed per user instructions
        } else if (isDueToday) {
          badgeBg = '#FFFBEB';
          badgeColor = '#D97706';
          badgeText = 'DUE TODAY';
          badgeIcon = 'time';
        }

        return (
          <View key={emi.paymentId || idx} style={[styles.card, isBounced && styles.cardBounced]}>
            {/* Top Row: Installment #, Due Date & Status Badge */}
            <View style={styles.headerRow}>
              <View style={styles.indexDueWrap}>
                <View style={[styles.indexPill, isOverdue ? styles.indexPillOverdue : styles.indexPillNormal]}>
                  <Text style={[styles.indexTxt, isOverdue ? styles.indexTxtOverdue : styles.indexTxtNormal]}>
                    #{idx + 1}
                  </Text>
                </View>
                <View style={styles.dueInfoCol}>
                  <View style={styles.dueDateRow}>
                    <Text style={styles.dueTxt}>Due: {formatDate(emi.dueDate)}</Text>
                    {isBounced && (
                      <View style={styles.bouncedTag}>
                        <Text style={styles.bouncedTagTxt}>Bounced</Text>
                      </View>
                    )}
                  </View>
                  {isPaid && emi.paidDate ? (
                    <Text style={styles.paidDateTxt}>
                      Completed on {formatDate(emi.paidDate)}{daysLateAtPayment > 3 ? ` (${daysLateAtPayment}d late)` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                {badgeIcon ? <Ionicons name={badgeIcon} size={11} color={badgeColor} style={{ marginRight: 3 }} /> : null}
                <Text style={[styles.statusBadgeTxt, { color: badgeColor }]} numberOfLines={1}>
                  {badgeText}
                </Text>
              </View>
            </View>

            {/* Financial Overview Grid */}
            <View style={styles.financialsGrid}>
              <View style={styles.finCol}>
                <Text style={styles.finLabel} numberOfLines={1}>EMI Amount</Text>
                <Text style={styles.finVal} numberOfLines={1}>₹{baseAmount.toLocaleString('en-IN')}</Text>
              </View>

              {penalty > 0 ? (
                <View style={styles.finCol}>
                  <Text style={styles.finLabel} numberOfLines={1}>Late Penalty</Text>
                  <Text style={[styles.finVal, { color: colors.error }]} numberOfLines={1}>+₹{penalty.toLocaleString('en-IN')}</Text>
                </View>
              ) : isPenaltyWaived ? (
                <View style={styles.finCol}>
                  <Text style={styles.finLabel} numberOfLines={1}>Late Penalty</Text>
                  <Text style={[styles.finVal, { color: '#059669' }]} numberOfLines={1}>Waived (₹0)</Text>
                </View>
              ) : null}

              {paidAmount > 0 ? (
                <View style={styles.finCol}>
                  <Text style={styles.finLabel} numberOfLines={1}>{isPaid ? 'Total Collected' : 'Part Collected'}</Text>
                  <Text style={[styles.finVal, { color: '#059669' }]} numberOfLines={1}>
                    ₹{paidAmount.toLocaleString('en-IN')}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.finCol, { alignItems: 'flex-end' }]}>
                <Text style={styles.finLabel} numberOfLines={1}>{isPaid ? 'Final Status' : 'Remaining Due'}</Text>
                <Text style={[styles.finVal, isPaid ? styles.finValPaid : styles.finValDue]} numberOfLines={1}>
                  {isPaid ? 'Fully Cleared' : `₹${remainingDue.toLocaleString('en-IN')}`}
                </Text>
              </View>
            </View>

            {/* Complete Payment Ledger Breakdown (UTR / Receipt Number / Mode / Date) */}
            {paymentsList.length > 0 ? (
              <View style={styles.ledgerContainer}>
                <View style={styles.ledgerHeaderRow}>
                  <Ionicons name="receipt-outline" size={13} color="#0369A1" />
                  <Text style={styles.ledgerHeaderTitle}>
                    Payment Ledger Receipts ({paymentsList.length} {paymentsList.length > 1 ? 'parts' : 'entry'}):
                  </Text>
                </View>

                {paymentsList.map((p, pIdx) => {
                  const mode = p.paymentMode || 'Cash';
                  const isDigital = ['UPI', 'Bank', 'Bank Transfer'].includes(mode);
                  const refLabel = isDigital ? 'UTR / Ref' : 'Receipt No';

                  return (
                    <View key={p.paymentInstallmentId || pIdx} style={styles.ledgerEntryRow}>
                      <View style={styles.ledgerEntryLeft}>
                        <View style={styles.partPill}>
                          <Text style={styles.partPillTxt}>Part {pIdx + 1}</Text>
                        </View>
                        <Text style={styles.partAmountTxt}>
                          ₹{Math.round(Number(p.amount || 0)).toLocaleString('en-IN')}
                        </Text>
                        <View style={styles.modeBadge}>
                          <Text style={styles.modeBadgeTxt}>{mode}</Text>
                        </View>
                        <Text style={styles.partDateTxt}>
                          {formatDate(p.paidDate)}
                        </Text>
                      </View>

                      {p.transactionRef ? (
                        <View style={styles.refBadge}>
                          <Ionicons name="pricetag-outline" size={11} color="#0369A1" />
                          <Text style={styles.refBadgeTxt}>
                            {refLabel}: <Text style={{ fontFamily: fonts.bold }}>{p.transactionRef}</Text>
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Action Row: Collect Payment or Pay Remaining */}
            {!isPaid && !isForeclosed && effectiveCanCollect && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.payBtn, isPartial && styles.payBtnPartial]}
                  onPress={() => onPayEmi && onPayEmi(emi)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={isPartial ? 'cash-outline' : 'card-outline'} size={15} color={colors.white} />
                  <Text style={styles.payBtnTxt}>
                    {isPartial
                      ? `Pay Remaining Balance: ₹${remainingDue.toLocaleString('en-IN')}`
                      : `Collect EMI: ₹${remainingDue.toLocaleString('en-IN')}`}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  emptyWrap: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTxt: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.muted,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  cardBounced: {
    borderColor: '#FB923C', // subtle light orange boundary not too loud
    borderWidth: 1.5,
    backgroundColor: '#FFFDF9',
  },
  bouncedTag: {
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  bouncedTagTxt: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    color: '#EA580C',
    letterSpacing: 0.2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 10,
    width: '100%',
  },
  indexDueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    marginRight: 4,
  },
  dueInfoCol: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  indexPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  indexPillOverdue: {
    backgroundColor: '#FFEDD5',
    borderColor: '#FED7AA',
    borderWidth: 1,
  },
  indexPillNormal: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
    borderWidth: 1,
  },
  indexTxt: {
    fontSize: 12,
  },
  indexTxtOverdue: {
    color: '#EA580C', // Orange number for overdue installments
    fontFamily: fonts.bold,
  },
  indexTxtNormal: {
    color: '#15803D', // Green number for non-overdue installments
    fontFamily: fonts.bold,
  },
  dueTxt: {
    fontSize: 12.5,
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  paidDateTxt: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: '#059669',
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
    flexShrink: 0,
    alignSelf: 'center',
  },
  statusBadgeTxt: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    letterSpacing: 0.2,
  },
  financialsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    marginBottom: 8,
    gap: 4,
  },
  finCol: {
    flex: 1,
    minWidth: 0,
  },
  finLabel: {
    fontSize: 9,
    fontFamily: fonts.medium,
    color: colors.muted,
  },
  finVal: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.text,
    marginTop: 2,
  },
  finValPaid: {
    color: '#15803D',
    fontFamily: fonts.bold,
  },
  finValDue: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  ledgerContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 10,
    marginTop: 4,
    marginBottom: 8,
    gap: 8,
  },
  ledgerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E0F2FE',
  },
  ledgerHeaderTitle: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: '#0369A1',
    textTransform: 'uppercase',
  },
  ledgerEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 2,
  },
  ledgerEntryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  partPill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  partPillTxt: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: '#0284C7',
  },
  partAmountTxt: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: '#0F172A',
  },
  modeBadge: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  modeBadgeTxt: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: '#334155',
  },
  partDateTxt: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  refBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  refBadgeTxt: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: '#0369A1',
  },
  actionRow: {
    marginTop: 6,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  payBtnPartial: {
    backgroundColor: '#0D9488', // Teal accent for collecting remaining balance
  },
  payBtnTxt: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.white,
  },
  notDisbursedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 8,
  },
  notDisbursedTxt: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.medium,
    color: '#92400E',
    lineHeight: 16,
  },
});
