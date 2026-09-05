import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../components/Header';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import { approveLoan } from '../../api/adminApi';
import { usePopup } from '../../context/PopupContext';

export default function InitialApproveScreen({ route, navigation }) {
  const { loan } = route.params;
  const { showAlert } = usePopup();
  const [loading, setLoading] = useState(false);

  // States for calculation
  const [principal, setPrincipal] = useState(loan?.loanAmount?.toString() || '');
  const [tenure, setTenure] = useState(loan?.repaymentMonths?.toString() || '');
  const [interestRate, setInterestRate] = useState('2.15');
  const [penaltyRate, setPenaltyRate] = useState('0.5');

  // Calculated values
  const [totalInterest, setTotalInterest] = useState(0);
  const [totalRepayable, setTotalRepayable] = useState(0);
  const [emi, setEmi] = useState(0);
  const [lastEmiAdjustment, setLastEmiAdjustment] = useState(0);

  useEffect(() => {
    calculateEmi();
  }, [principal, tenure, interestRate]);

  const calculateEmi = () => {
    const p = parseFloat(principal) || 0;
    const t = parseInt(tenure, 10) || 0;
    const r = parseFloat(interestRate) || 0;

    const interest = p * (r / 100) * t;
    const repayable = p + interest;

    let calculatedEmi = 0;
    let adjustment = 0;

    if (t > 0) {
      calculatedEmi = Math.round(repayable / t);
      const totalRecoveredByRegularEmi = calculatedEmi * t;
      adjustment = repayable - totalRecoveredByRegularEmi; 
    }

    setTotalInterest(interest);
    setTotalRepayable(repayable);
    setEmi(calculatedEmi);
    setLastEmiAdjustment(adjustment);
  };

  const handleApprove = async () => {
    if (!principal || !tenure || !interestRate || !penaltyRate) {
      showAlert('Error', 'Please fill in all calculation fields.');
      return;
    }
    
    setLoading(true);
    try {
      const today = new Date().toISOString();
      await approveLoan(loan.loanId, {
        loanStartDate: today,
        approvedAmount: parseFloat(principal),
        interestRate: parseFloat(interestRate),
        penaltyRate: parseFloat(penaltyRate),
        tenureMonths: parseInt(tenure, 10),
        emiAmount: emi,
        totalInterest,
        totalRepayable,
      });
      showAlert('Success', 'Loan approved and EMI schedule initialized successfully.');
      navigation.getParent()?.navigate('Dashboard');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to approve loan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title="Loan Setup & Approve" onBack={() => navigation.goBack()} />
      <ScrollView 
        style={styles.scroll} 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Application: {loan?.loanId}</Text>
          <Text style={styles.infoText}>Applicant: {loan?.ownerName}</Text>
          <Text style={styles.infoText}>Requested Amount: ₹{Number(loan?.loanAmount).toLocaleString('en-IN')}</Text>
          <Text style={styles.infoText}>Requested Tenure: {loan?.repaymentMonths} months</Text>
        </View>

        <Text style={styles.sectionHeader}>EMI Calculator & Terms Setup</Text>
        <Text style={styles.sectionDesc}>Adjust the terms below. Interest is calculated as simple monthly interest.</Text>

        <View style={styles.card}>
          <Field label="Principal Amount (₹)" value={principal} onChangeText={setPrincipal} keyboardType="numeric" />
          <Field label="Loan Tenure (Months)" value={tenure} onChangeText={setTenure} keyboardType="numeric" />
          <Field label="Monthly Interest Rate (%)" value={interestRate} onChangeText={setInterestRate} suffix="%" keyboardType="decimal-pad" />
          <Field label="Daily Penalty Rate (%)" value={penaltyRate} onChangeText={setPenaltyRate} suffix="%" keyboardType="decimal-pad" />
        </View>

        <Text style={styles.sectionHeader}>Calculation Summary</Text>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Interest</Text>
            <Text style={styles.summaryValue}>₹{totalInterest.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Repayable</Text>
            <Text style={styles.summaryValue}>₹{totalRepayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
          </View>
          <View style={[styles.summaryRow, { borderBottomWidth: 0, marginTop: 10 }]}>
            <Text style={styles.emiLabel}>Monthly EMI</Text>
            <Text style={styles.emiValue}>₹{emi.toLocaleString('en-IN')}</Text>
          </View>
          {lastEmiAdjustment !== 0 && (
            <Text style={styles.adjustmentText}>
              * The final installment will be adjusted by {lastEmiAdjustment > 0 ? '+' : ''}₹{lastEmiAdjustment.toFixed(2)} to ensure exact recovery.
            </Text>
          )}
        </View>

        <TouchableOpacity style={styles.approveBtn} onPress={handleApprove} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.white} />
              <Text style={styles.approveBtnText}>Confirm & Approve Loan</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, keyboardType = 'numeric', suffix }) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
        />
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 16 },
  infoCard: { backgroundColor: '#E0F2FE', padding: 16, borderRadius: 12, marginBottom: 20 },
  infoTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: '#0369A1', marginBottom: 6 },
  infoText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: '#0284C7', marginBottom: 2 },
  sectionHeader: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.text, marginBottom: 4 },
  sectionDesc: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginBottom: 12 },
  card: { backgroundColor: colors.white, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
  fieldContainer: { marginBottom: 16 },
  label: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.text, marginBottom: 6 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.inputBg },
  input: { flex: 1, padding: 12, fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.text },
  suffix: { paddingRight: 12, fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.muted },
  summaryCard: { backgroundColor: colors.dark, padding: 16, borderRadius: 12, marginBottom: 24 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  summaryLabel: { fontFamily: fonts.regular, fontSize: fontSize.base, color: 'rgba(255,255,255,0.8)' },
  summaryValue: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.white },
  emiLabel: { fontFamily: fonts.bold, fontSize: 18, color: colors.white },
  emiValue: { fontFamily: fonts.bold, fontSize: 22, color: colors.accent },
  adjustmentText: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8, fontStyle: 'italic' },
  approveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success, paddingVertical: 16, borderRadius: 12, gap: 10 },
  approveBtnText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.white },
});
