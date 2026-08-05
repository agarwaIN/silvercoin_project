import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

export default function LoanDetailsView({ loan }) {
  if (!loan) return null;

  const changedFields = loan.changedFields || [];

  const Row = ({ label, value, fieldKey }) => {
    const isChanged = fieldKey && changedFields.includes(fieldKey);
    return (
      <View style={[rv.row, isChanged && rv.changedRow]}>
        <Text style={[rv.label, isChanged && rv.changedLabel]}>
          {label} {isChanged && <Ionicons name="alert-circle" size={12} color="#B8860B" />}
        </Text>
        <Text style={[rv.value, isChanged && rv.changedValue]}>{value || '—'}</Text>
      </View>
    );
  };

  return (
    <View style={rv.container}>
      {loan.status === 'rejected' && loan.rejectReason && (
        <View style={[rv.card, { borderColor: colors.error, backgroundColor: '#FEF2F2' }]}>
          <View style={[rv.headerRow, { borderBottomColor: '#FEE2E2' }]}>
            <Ionicons name="warning" size={18} color={colors.error} />
            <Text style={[rv.section, { color: colors.error }]}>Rejection Remarks</Text>
          </View>
          <Text style={{ fontSize: 14, color: colors.error, marginTop: 4 }}>{loan.rejectReason}</Text>
        </View>
      )}

      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="person" size={18} color={colors.dark} />
          <Text style={rv.section}>Owner Details</Text>
        </View>
        <Row label="Name" value={loan.ownerName} fieldKey="ownerName" />
        <Row label="Mobile" value={loan.ownerMobile} fieldKey="ownerMobile" />
        <Row label="Email" value={loan.ownerEmail} fieldKey="ownerEmail" />
        <Row label="Aadhaar" value={loan.aadhaar} fieldKey="aadhaar" />
        <Row label="Spouse" value={loan.spouseName} fieldKey="spouseName" />
        <Row label="Occupation" value={loan.familyOccupation} fieldKey="familyOccupation" />
        <Row label="Monthly Income" value={loan.monthlyIncome ? `₹${loan.monthlyIncome.toLocaleString('en-IN')}` : ''} fieldKey="monthlyIncome" />
        <Row label="Address" value={loan.ownerAddress} fieldKey="ownerAddress" />
        <Row label="Verification Video" value={loan.videoUri ? '✓ Recorded' : 'Not recorded'} fieldKey="videoUri" />
      </View>

      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="card" size={18} color={colors.dark} />
          <Text style={rv.section}>Bank Details</Text>
        </View>
        <Row label="IFSC Code" value={loan.bankDetails?.ifsc} fieldKey="bankDetails" />
        <Row label="Bank Name" value={loan.bankDetails?.bankName} fieldKey="bankDetails" />
        <Row label="Account Holder" value={loan.bankDetails?.accountHolder} fieldKey="bankDetails" />
        <Row label="Account Number" value={loan.bankDetails?.accountNumber} fieldKey="bankDetails" />
      </View>

      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="home" size={18} color={colors.dark} />
          <Text style={rv.section}>Property Details</Text>
        </View>
        <Row label="Area" value={loan.propertyArea ? `${loan.propertyArea} sq.m` : ''} fieldKey="propertyArea" />
        <Row label="Market Value" value={loan.marketValue ? `₹${loan.marketValue.toLocaleString('en-IN')}` : ''} fieldKey="marketValue" />
        <Row label="Descendants" value={loan.descendantCount} fieldKey="descendantCount" />
        <Row label="Other Loan" value={loan.otherLoan ? 'Yes' : 'No'} fieldKey="otherLoan" />
        {loan.otherLoan && <Row label="Loan Details" value={loan.otherLoanDetails} fieldKey="otherLoanDetails" /> }
        <Row label="Possession" value={loan.possessionStatus} fieldKey="possessionStatus" />
        <Row label="Geo Location" value={loan.geoLocation?.lat ? `${loan.geoLocation.lat}, ${loan.geoLocation.lng}` : ''} fieldKey="geoLocation" />
        <Row label="Property Address" value={loan.propertyAddress} fieldKey="propertyAddress" />
        <Row label="Photos Uploaded" value={loan.propertyPhotos?.length ? `${loan.propertyPhotos.length} photo(s)` : ''} fieldKey="propertyPhotos" />
        <Row label="Docs Uploaded" value={loan.propertyDocs?.length ? `${loan.propertyDocs.length} doc(s)` : ''} fieldKey="propertyDocs" />
      </View>

      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="cash" size={18} color={colors.dark} />
          <Text style={rv.section}>Loan Request</Text>
        </View>
        <Row label="Requested Amount" value={loan.loanAmount ? `₹${loan.loanAmount.toLocaleString('en-IN')}` : ''} fieldKey="loanAmount" />
        <Row label="Purpose" value={loan.loanPurpose} fieldKey="loanPurpose" />
        <Row label="Repayment Tenure" value={loan.repaymentMonths ? `${loan.repaymentMonths} months` : ''} fieldKey="repaymentMonths" />
        <Row label="Additional Notes" value={loan.notes} fieldKey="notes" />
      </View>
    </View>
  );
}

const rv = StyleSheet.create({
  container: { marginTop: 8 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.inputBg, paddingBottom: 8 },
  section: { fontSize: 14, fontWeight: '700', color: colors.dark, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  label: { fontSize: 13, color: colors.muted, flex: 1 },
  value: { fontSize: 13, color: colors.text, fontWeight: '600', flex: 1.5, textAlign: 'right' },
  changedRow: { backgroundColor: '#FFF9C4', paddingHorizontal: 6, borderRadius: 6, marginHorizontal: -6 },
  changedLabel: { color: '#997000', fontWeight: '600' },
  changedValue: { color: '#B8860B', fontWeight: '700' },
});
