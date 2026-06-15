import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Header from '../../components/Header';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { getProfile, patchProfile } from '../../api/employeeApi';
import { usePopup } from '../../context/PopupContext';
import { useAuth } from '../../context/AuthContext';
import KeyboardFormWrapper from '../../components/KeyboardFormWrapper';

export default function EmployeeAccountScreen({ navigation }) {
  const { showAlert } = usePopup();
  const { refreshUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getProfile();
      setName(p.name || '');
      setEmail(p.email || '');
      setMobile(p.mobile || '');
      setTenantName(p.tenantName || '');
    } catch {
      showAlert('Error', 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErrors({ name: 'Required' });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const p = await patchProfile({ name: trimmed });
      setName(p.name || '');
      await refreshUser({ name: p.name });
      showAlert('Saved', 'Your name was updated.');
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Could not update');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header title="Account" onBack={() => navigation.goBack()} hideDrawerMenu />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.dark} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Account" onBack={() => navigation.goBack()} hideDrawerMenu />
      <KeyboardFormWrapper contentContainerStyle={styles.scroll}>
          {tenantName ? (
            <>
              <Text style={styles.roLabel}>Organization</Text>
              <Text style={styles.roValue}>{tenantName}</Text>
            </>
          ) : null}

          <Text style={styles.section}>Your name</Text>
          <Input label="Display name" value={name} onChangeText={setName} placeholder="Your name" error={errors.name} />
          <Button title="Save" onPress={save} loading={saving} style={styles.btn} />

          <Text style={[styles.section, styles.sectionSpaced]}>Account</Text>
          <Text style={styles.roLabel}>Email</Text>
          <Text style={styles.roValue}>{email || '—'}</Text>
          <Text style={styles.roLabel}>Mobile</Text>
          <Text style={styles.roValue}>{mobile || '—'}</Text>
          <Text style={styles.lockNote}>Email and mobile cannot be changed here.</Text>

          <Button
            title="Change password"
            onPress={() => navigation.navigate('ChangePassword', { fromSettings: true })}
            style={styles.btnSpaced}
          />
      </KeyboardFormWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: colors.dark, marginBottom: 8, marginTop: 8 },
  sectionSpaced: { marginTop: 20 },
  btn: { marginTop: 8 },
  btnSpaced: { marginTop: 24 },
  roLabel: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.muted, marginTop: 12 },
  roValue: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.text, marginTop: 4 },
  lockNote: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.muted, marginTop: 16, fontStyle: 'italic' },
});
