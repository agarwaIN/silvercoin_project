import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

export default function LoanDetailsView({ loan }) {
  if (!loan) return null;

  const Row = ({ label, value }) => (
    <View style={rv.row}>
      <Text style={rv.label}>{label}</Text>
      <Text style={rv.value}>{value || '—'}</Text>
    </View>
  );

  return (
    <View style={rv.container}>
      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="person" size={18} color={colors.dark} />
          <Text style={rv.section}>Owner Details</Text>
        </View>
        <Row label="Name" value={loan.ownerName} />
        <Row label="Mobile" value={loan.ownerMobile} />
        <Row label="Email" value={loan.ownerEmail} />
        <Row label="Aadhaar" value={loan.aadhaar} />
        <Row label="Spouse" value={loan.spouseName} />
        <Row label="Occupation" value={loan.familyOccupation} />
        <Row label="Monthly Income" value={loan.monthlyIncome ? `₹${loan.monthlyIncome.toLocaleString('en-IN')}` : ''} />
        <Row label="Address" value={loan.ownerAddress} />
        <Row label="Verification Video" value={loan.videoUri ? '✓ Recorded' : 'Not recorded'} />
      </View>

      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="card" size={18} color={colors.dark} />
          <Text style={rv.section}>Bank Details</Text>
        </View>
        <Row label="IFSC Code" value={loan.bankDetails?.ifsc} />
        <Row label="Bank Name" value={loan.bankDetails?.bankName} />
        <Row label="Account Holder" value={loan.bankDetails?.accountHolder} />
        <Row label="Account Number" value={loan.bankDetails?.accountNumber} />
      </View>

      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="home" size={18} color={colors.dark} />
          <Text style={rv.section}>Property Details</Text>
        </View>
        <Row label="Area" value={loan.propertyArea ? `${loan.propertyArea} sq.m` : ''} />
        <Row label="Market Value" value={loan.marketValue ? `₹${loan.marketValue.toLocaleString('en-IN')}` : ''} />
        <Row label="Descendants" value={loan.descendantCount} />
        <Row label="Other Loan" value={loan.otherLoan ? 'Yes' : 'No'} />
        {loan.otherLoan && <Row label="Loan Details" value={loan.otherLoanDetails} />}
        <Row label="Possession" value={loan.possessionStatus} />
        <Row label="Geo Location" value={loan.geoLocation?.lat ? `${loan.geoLocation.lat}, ${loan.geoLocation.lng}` : ''} />
        <Row label="Property Address" value={loan.propertyAddress} />
        <Row label="Photos Uploaded" value={loan.propertyPhotos?.length ? `${loan.propertyPhotos.length} photo(s)` : ''} />
        <Row label="Docs Uploaded" value={loan.propertyDocs?.length ? `${loan.propertyDocs.length} doc(s)` : ''} />
      </View>

      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="cash" size={18} color={colors.dark} />
          <Text style={rv.section}>Loan Request</Text>
        </View>
        <Row label="Requested Amount" value={loan.loanAmount ? `₹${loan.loanAmount.toLocaleString('en-IN')}` : ''} />
        <Row label="Purpose" value={loan.loanPurpose} />
        <Row label="Repayment Tenure" value={loan.repaymentMonths ? `${loan.repaymentMonths} months` : ''} />
        <Row label="Additional Notes" value={loan.notes} />
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
});
