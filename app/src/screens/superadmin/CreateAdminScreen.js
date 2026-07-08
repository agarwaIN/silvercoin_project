import React, { useState } from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Header from '../../components/Header';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { createAdmin } from '../../api/superadminApi';
import { usePopup } from '../../context/PopupContext';
import { normalizeMobileToE164 } from '../../utils/phone';
import KeyboardFormWrapper from '../../components/KeyboardFormWrapper';

export default function CreateAdminScreen({ navigation }) {
  const { showAlert } = usePopup();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

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
      const resData = await createAdmin({ name: name.trim(), email: email.trim().toLowerCase(), mobile: m.e164 });
      showAlert('Admin Created', `Login credentials sent to ${email}.\nTemporary Password: ${resData.tempPassword || 'Check email'}`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Failed to create admin');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.safe} edges={['top']}>
      <StatusBar barStyle={'light-content'} translucent={true} backgroundColor={"transparent"} />
      <Header title="Add Admin" onBack={() => navigation.goBack()} />
      <KeyboardFormWrapper contentContainerStyle={styles.scroll}>
          <Text style={styles.info}>
            A temporary password will be generated and sent to the admin's email. They must change it on first login.
          </Text>
          <Input label="Full Name" value={name} onChangeText={setName} placeholder="Admin Name" error={errors.name} />
          <Input label="Email Address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="admin@company.com" error={errors.email} />
          <Input label="Mobile number" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder="9876543210" error={errors.mobile} />
          <Button title="Create Admin" onPress={handle} loading={loading} style={styles.btn} />
      </KeyboardFormWrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  info: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, backgroundColor: colors.primary + '25', borderRadius: 10, padding: 14, marginBottom: 24, lineHeight: 18 },
  btn: { marginTop: 8 },
});
