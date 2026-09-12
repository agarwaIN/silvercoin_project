import React, { useState } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Header from '../../components/Header';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { createEmployee } from '../../api/adminApi';
import { usePopup } from '../../context/PopupContext';
import { normalizeMobileToE164 } from '../../utils/phone';
import KeyboardFormWrapper from '../../components/KeyboardFormWrapper';

const AVAILABLE_RIGHTS = [
  { id: 'loan_creation', title: 'New Loan Origination', desc: 'Create loan, enter details & photos', icon: 'create-outline' },
  { id: 'doc_verification', title: 'Document Verification', desc: 'Verify & upload property documents', icon: 'document-text-outline' },
  { id: 'emi_collection', title: 'EMI Recovery & Collection', desc: 'Access recovery list & collect EMIs', icon: 'cash-outline' },
];

export default function CreateEmployeeScreen({ navigation }) {
  const { showAlert } = usePopup();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [accessRights, setAccessRights] = useState(['loan_creation', 'doc_verification', 'emi_collection']);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const toggleRight = (rightId) => {
    if (accessRights.includes(rightId)) {
      if (accessRights.length === 1) {
        showAlert('Warning', 'Employee must have at least one access right.');
        return;
      }
      setAccessRights(accessRights.filter(r => r !== rightId));
    } else {
      setAccessRights([...accessRights, rightId]);
    }
  };

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Required';
    if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Invalid email';
    const m = normalizeMobileToE164(mobile);
    if (!m.ok) e.mobile = m.error;
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handle = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const m = normalizeMobileToE164(mobile);
      const resData = await createEmployee({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        mobile: m.e164,
        accessRights,
      });
      showAlert('Employee Created', `Login credentials sent to ${email}.\nTemporary Password: ${resData.tempPassword || 'Check email'}`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Failed to create employee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.safe} edges={['top']}>
      <StatusBar barStyle={'light-content'} translucent={true} backgroundColor={colors.dark} />
      <Header title="Add Employee" onBack={() => navigation.goBack()} />
      <KeyboardFormWrapper contentContainerStyle={styles.scroll}>
        <Text style={styles.info}>
          A temporary password will be generated and sent to the employee's email. Assign specific duties below.
        </Text>
        <Input label="Full Name" value={name} onChangeText={setName} placeholder="John Doe" error={errors.name} />
        <Input label="Email Address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="employee@company.com" error={errors.email} />
        <Input label="Mobile Number" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder="9876543210" error={errors.mobile} />

        <Text style={styles.sectionTitle}>Employee Access Rights & Duties</Text>
        <Text style={styles.sectionSub}>Select what actions this employee can perform:</Text>
        
        <View style={styles.rightsContainer}>
          {AVAILABLE_RIGHTS.map(right => {
            const isSelected = accessRights.includes(right.id);
            return (
              <TouchableOpacity
                key={right.id}
                style={[styles.rightCard, isSelected && styles.rightCardActive]}
                onPress={() => toggleRight(right.id)}
                activeOpacity={0.7}
              >
                <View style={styles.rightIconBox}>
                  <Ionicons name={right.icon} size={20} color={isSelected ? colors.dark : colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rightTitle, isSelected && styles.rightTitleActive]}>{right.title}</Text>
                  <Text style={styles.rightDesc}>{right.desc}</Text>
                </View>
                <Ionicons
                  name={isSelected ? "checkbox" : "square-outline"}
                  size={22}
                  color={isSelected ? colors.dark : colors.muted}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <Button title="Create Employee" onPress={handle} loading={loading} style={styles.btn} />
      </KeyboardFormWrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  info: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, backgroundColor: colors.primary + '25', borderRadius: 10, padding: 14, marginBottom: 20, lineHeight: 18 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.dark, marginTop: 12 },
  sectionSub: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.muted, marginBottom: 12, marginTop: 2 },
  rightsContainer: { gap: 10, marginBottom: 20 },
  rightCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border },
  rightCardActive: { borderColor: colors.dark, backgroundColor: '#F8FAFC' },
  rightIconBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },
  rightTitle: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: colors.text },
  rightTitleActive: { color: colors.dark, fontFamily: fonts.bold },
  rightDesc: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 2 },
  btn: { marginTop: 8 },
});
