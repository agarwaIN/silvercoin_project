import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { colors } from '../../theme/colors';
import { createLoan, updateLoan, submitLoan } from '../../api/employeeApi';
import { usePopup } from '../../context/PopupContext';

export default function NewLoanScreen({ navigation }) {
  const { showAlert } = usePopup();
  const [ownerName, setOwnerName] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!ownerName.trim()) {
      showAlert('Missing field', 'Enter owner name.');
      return;
    }
    setLoading(true);
    try {
      const loan = await createLoan();
      await updateLoan(loan.loanId, {
        ownerName: ownerName.trim(),
        loanAmount: loanAmount ? Number(loanAmount) : undefined,
      });
      await submitLoan(loan.loanId);
      showAlert('Submitted', 'Basic loan application saved.');
      navigation.goBack();
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Could not save loan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title="New loan" />
      <View style={styles.body}>
        <Input label="Owner name" value={ownerName} onChangeText={setOwnerName} />
        <Input label="Requested amount" value={loanAmount} onChangeText={setLoanAmount} keyboardType="numeric" />
        <Button title="Save draft & submit" onPress={onSubmit} loading={loading} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: 16, gap: 12 },
});
