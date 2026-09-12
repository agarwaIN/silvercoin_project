import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '../utils/date';
import * as Location from 'expo-location';

export default function LoanDetailsView({ loan }) {
  if (!loan) return null;

  const changedFields = loan.changedFields || [];

  const [resolvedLocName, setResolvedLocName] = useState(loan.geoLocation?.locationName || '');
  const [resolvedDistrict, setResolvedDistrict] = useState(loan.geoLocation?.district || loan.propertyDistrict || '');

  useEffect(() => {
    if (loan.geoLocation?.lat && loan.geoLocation?.lng && (!resolvedLocName || !resolvedDistrict)) {
      const lat = parseFloat(loan.geoLocation.lat);
      const lng = parseFloat(loan.geoLocation.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
          .then((results) => {
            if (results && results.length > 0) {
              const r = results[0];
              const name = [r.name, r.street].filter(Boolean).join(', ') || r.subregion || r.city || '';
              const dist = r.district || r.subregion || r.city || '';
              if (!resolvedLocName && name) setResolvedLocName(name);
              if (!resolvedDistrict && dist) setResolvedDistrict(dist);
            }
          })
          .catch(() => {});
      }
    }
  }, [loan.geoLocation, resolvedLocName, resolvedDistrict]);

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
          <Ionicons name="information-circle" size={18} color={colors.dark} />
          <Text style={rv.section}>Application Details</Text>
        </View>
        <Row label="Application Number" value={loan.applicationNumber || loan.loanId} />
        <Row label="Loan ID" value={loan.displayLoanId || loan.officialLoanId || 'Pending Disbursement'} />
        {loan.internalRemarks && <Row label="Internal Remarks" value={loan.internalRemarks} />}
        {loan.riskAssessment && <Row label="Risk Assessment" value={loan.riskAssessment} />}
      </View>

      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="person" size={18} color={colors.dark} />
          <Text style={rv.section}>Owner Details</Text>
        </View>
        <Row label="Owner Name" value={loan.ownerName} fieldKey="ownerName" />
        <Row label="Mobile Number" value={loan.ownerMobile} fieldKey="ownerMobile" />
        <Row label="Email Address" value={loan.ownerEmail} fieldKey="ownerEmail" />
        <Row label="Aadhaar Number" value={loan.aadhaar} fieldKey="aadhaar" />
        <Row label="Spouse Name" value={loan.spouseName} fieldKey="spouseName" />
        <Row label="Family Occupation" value={loan.familyOccupation} fieldKey="familyOccupation" />
        <Row label="Monthly Income" value={loan.monthlyIncome ? `₹${loan.monthlyIncome.toLocaleString('en-IN')}` : ''} fieldKey="monthlyIncome" />
        <Row label="Residential Address" value={loan.ownerAddress} fieldKey="ownerAddress" />
        <Row label="Owner Details Remark" value={loan.ownerRemark || loan.remarks?.owner} fieldKey="ownerRemark" />
        <Row label="Owner Verification Video" value={loan.videoUri ? '✓ Recorded' : 'Not recorded'} fieldKey="videoUri" />
      </View>

      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="card" size={18} color={colors.dark} />
          <Text style={rv.section}>Bank Details</Text>
        </View>
        <Row label="IFSC Code" value={loan.bankDetails?.ifsc} fieldKey="bankDetails" />
        <Row label="Bank Name" value={loan.bankDetails?.bankName} fieldKey="bankDetails" />
        <Row label="Account Holder Name" value={loan.bankDetails?.accountHolder} fieldKey="bankDetails" />
        <Row label="Account Number" value={loan.bankDetails?.accountNumber} fieldKey="bankDetails" />
        <Row label="Bank Details Remark" value={loan.bankRemark || loan.bankDetails?.remark || loan.remarks?.bank} fieldKey="bankRemark" />
      </View>

      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="home" size={18} color={colors.dark} />
          <Text style={rv.section}>Property Details</Text>
        </View>
        <Row label="Property Area" value={loan.propertyArea ? `${loan.propertyArea} sq.m` : ''} fieldKey="propertyArea" />
        <Row label="Market Value" value={loan.marketValue ? `₹${loan.marketValue.toLocaleString('en-IN')}` : ''} fieldKey="marketValue" />
        <Row label="Transferred To Descendant" value={loan.descendantCount} fieldKey="descendantCount" />
        <Row label="Any Other Loan" value={loan.otherLoan ? 'Yes' : 'No'} fieldKey="otherLoan" />
        {loan.otherLoan && <Row label="Other Loan Remark" value={loan.otherLoanDetails} fieldKey="otherLoanDetails" /> }
        <Row label="Possession Status" value={loan.possessionStatus} fieldKey="possessionStatus" />
        <Row label="Geo Coordinates" value={loan.geoLocation?.lat ? `${loan.geoLocation.lat}, ${loan.geoLocation.lng}` : ''} fieldKey="geoLocation" />
        <Row label="Location / Area Name" value={loan.geoLocation?.locationName || loan.locationName || resolvedLocName} fieldKey="geoLocationName" />
        <Row label="District" value={loan.geoLocation?.district || loan.propertyDistrict || loan.district || resolvedDistrict} fieldKey="propertyDistrict" />
        <Row label="Property Details Remark" value={loan.propertyRemark || loan.remarks?.property} fieldKey="propertyRemark" />
        <Row label="House / Property Video" value={loan.houseVideoUri ? '✓ Recorded' : (loan.propertyPhotos?.some(p => p.type === 'video') ? '✓ Recorded' : 'Not recorded')} fieldKey="houseVideoUri" />
        <Row label="Photos Uploaded" value={loan.propertyPhotos?.length ? `${loan.propertyPhotos.length} item(s)` : ''} fieldKey="propertyPhotos" />
        <Row label="Documents Uploaded" value={loan.propertyDocs?.length ? `${loan.propertyDocs.length} doc(s)` : ''} fieldKey="propertyDocs" />
      </View>

      <View style={rv.card}>
        <View style={rv.headerRow}>
          <Ionicons name="cash" size={18} color={colors.dark} />
          <Text style={rv.section}>Loan Request</Text>
        </View>
        <Row label="Requested Loan Amount" value={loan.loanAmount ? `₹${loan.loanAmount.toLocaleString('en-IN')}` : ''} fieldKey="loanAmount" />
        <Row label="Purpose Of Loan" value={loan.loanPurpose} fieldKey="loanPurpose" />
        <Row label="Requested Loan Tenure" value={loan.repaymentMonths ? `${loan.repaymentMonths} months` : ''} fieldKey="repaymentMonths" />
        <Row label="Loan Details Remark" value={loan.loanRemark || loan.remarks?.loan || loan.notes} fieldKey="loanRemark" />
        {loan.notes && loan.notes !== loan.loanRemark && (
          <Row label="Additional Notes" value={loan.notes} fieldKey="notes" />
        )}
      </View>

      {['approved', 'active', 'completed'].includes(loan.status) && (
        <View style={[rv.card, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}>
          <View style={[rv.headerRow, { borderBottomColor: '#D1FAE5' }]}>
            <Ionicons name="checkmark-done-circle" size={18} color="#059669" />
            <Text style={[rv.section, { color: '#065F46' }]}>Approved Terms</Text>
          </View>
          <Row label="Principal Amount" value={`₹${Number(loan.approvedAmount || 0).toLocaleString('en-IN')}`} />
          <Row label="Tenure" value={`${loan.tenureMonths || 0} months`} />
          <Row label="Interest Rate" value={`${loan.interestRate || 0}% per month`} />
          <Row label="Penalty Rate" value={`${loan.penaltyRate || 0}% per day`} />
          <Row label="Total Interest" value={`₹${Number(loan.totalInterest || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} />
          <Row label="Total Repayable" value={`₹${Number(loan.totalRepayable || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} />
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#D1FAE5', flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: '#065F46', fontWeight: 'bold' }}>Final EMI</Text>
            <Text style={{ fontSize: 16, color: '#059669', fontWeight: 'bold' }}>₹{Number(loan.emiAmount || 0).toLocaleString('en-IN')}</Text>
          </View>
        </View>
      )}

      {loan.disbursements && loan.disbursements.length > 0 && (
        <View style={rv.card}>
          <View style={rv.headerRow}>
            <Ionicons name="list-circle" size={18} color={colors.dark} />
            <Text style={rv.section}>Disbursement History</Text>
          </View>
          {loan.disbursements.map((d, index) => (
            <View key={index} style={{ marginBottom: index !== loan.disbursements.length - 1 ? 12 : 0, borderBottomWidth: index !== loan.disbursements.length - 1 ? 1 : 0, borderBottomColor: colors.border, paddingBottom: 8 }}>
              <Row label="Date" value={formatDate(d.date)} />
              <Row label="Amount" value={`₹${Number(d.amount).toLocaleString('en-IN')}`} />
              <Row label="Bank" value={d.bankName} />
              <Row label="Txn No" value={d.transactionNumber} />
            </View>
          ))}
        </View>
      )}
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
