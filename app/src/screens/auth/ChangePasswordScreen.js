import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import KeyboardFormWrapper from '../../components/KeyboardFormWrapper';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Header from '../../components/Header';
import Input from '../../components/Input';
import Button from '../../components/Button';
import {
  requestChangePasswordOtp,
  changePassword,
  resendChangePasswordOtp,
  fetchCurrentUser,
} from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import { usePopup } from '../../context/PopupContext';
import { validatePassword } from '../../utils/password';

export default function ChangePasswordScreen({ navigation, route }) {
  const fromSettings = Boolean(route.params?.fromSettings);
  const forcedFirstLogin = Boolean(route.params?.forcedFirstLogin);
  const { user, refreshUser, completeFirstLogin } = useAuth();
  const { showAlert } = usePopup();
  const isFirstLogin = user?.isFirstLogin === true && !fromSettings;
  const otpRequested = useRef(false);
  const [enteringApp, setEnteringApp] = useState(false);

  const [sessionId, setSessionId] = useState(null);
  const [maskedMobile, setMaskedMobile] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(!isFirstLogin);
  const [resending, setResending] = useState(false);
  const [errors, setErrors] = useState({});

  const sendOtp = useCallback(async () => {
    setSendingOtp(true);
    try {
      const data = await requestChangePasswordOtp();
      setSessionId(data.sessionId);
      setMaskedMobile(data.maskedMobile || '');
      setDevOtp(data.devOtp || null);
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Could not send verification code', [
        { text: 'OK' },
      ]);
    } finally {
      setSendingOtp(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (!forcedFirstLogin || fromSettings) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCurrentUser();
        if (cancelled || !data?.user || data.user.isFirstLogin === true) return;
        await completeFirstLogin(data.user);
      } catch {

      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forcedFirstLogin, fromSettings, completeFirstLogin]);

  useEffect(() => {
    if (isFirstLogin || otpRequested.current || forcedFirstLogin) return;
    otpRequested.current = true;
    void sendOtp();
  }, [isFirstLogin, forcedFirstLogin, sendOtp]);

  const validate = () => {
    const e = {};
    if (!isFirstLogin && !/^\d{6}$/.test(otp.replace(/\D/g, ''))) {
      e.otp = 'Enter the 6-digit code';
    }
    const p = validatePassword(newPassword);
    if (!p.ok) e.newPassword = p.error;
    if (newPassword !== confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handle = async () => {
    if (!isFirstLogin && !sessionId) {
      showAlert('Error', 'Verification session missing. Resend the code.');
      return;
    }
    if (!validate()) return;
    setLoading(true);
    if (isFirstLogin) {
      setEnteringApp(true);
    }
    try {
      const data = await changePassword(
        isFirstLogin ? '' : sessionId,
        isFirstLogin ? '' : otp.replace(/\D/g, ''),
        newPassword,
        confirm,
      );
      if (isFirstLogin) {
        await completeFirstLogin(data?.user);
        return;
      }
      if (data?.user) {
        await refreshUser(data.user);
      } else {
        await refreshUser({ isFirstLogin: false });
      }
      if (fromSettings) {
        showAlert('Saved', 'Your password was updated.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (err) {
      setEnteringApp(false);
      const msg = err.response?.data?.message || 'Failed to change password';
      if (
        isFirstLogin
        && msg.toLowerCase().includes('verification code is required')
      ) {
        try {
          const data = await fetchCurrentUser();
          if (data?.user && data.user.isFirstLogin !== true) {
            setEnteringApp(true);
            await completeFirstLogin(data.user);
            return;
          }
        } catch {

        }
      }
      showAlert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!sessionId) {
      await sendOtp();
      return;
    }
    setResending(true);
    try {
      const data = await resendChangePasswordOtp(sessionId);
      if (data.devOtp) setDevOtp(data.devOtp);
      setOtp('');
      setErrors({});
      showAlert('Code sent', data.message || 'A new code was sent to your mobile.');
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Could not resend code');
    } finally {
      setResending(false);
    }
  };

  if (enteringApp) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.enteringRoot}>
          <ActivityIndicator size="large" color={colors.dark} />
          <Text style={styles.enteringText}>Opening your dashboard…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {fromSettings ? (
        <Header title="Change password" onBack={() => navigation.goBack()} hideDrawerMenu />
      ) : null}
      <KeyboardFormWrapper contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={32} color={colors.white} />
          </View>
          <Text style={styles.title}>{isFirstLogin ? 'Set Your Password' : 'Change Password'}</Text>
          <Text style={styles.subtitle}>
            {isFirstLogin
              ? 'Your mobile was verified at sign-in. Choose a new password to finish setup.'
              : `Verify your mobile number, then choose a new password.${maskedMobile ? `\nCode sent to ${maskedMobile}` : ''}`}
          </Text>
        </View>

        {sendingOtp && !isFirstLogin ? (
          <ActivityIndicator size="large" color={colors.dark} style={{ marginVertical: 24 }} />
        ) : (
          <View style={styles.form}>
            {!isFirstLogin ? (
              <>
                {devOtp ? (
                  <View style={styles.devBanner}>
                    <Text style={styles.devBannerLabel}>Your verification code</Text>
                    <Text style={styles.devBannerCode}>{devOtp}</Text>
                  </View>
                ) : null}
                <Input
                  label="Mobile verification code"
                  value={otp}
                  onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  placeholder="000000"
                  error={errors.otp}
                  maxLength={6}
                />
              </>
            ) : null}
            <Input
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="6–32 characters"
              error={errors.newPassword}
            />
            <Input
              label="Confirm Password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              placeholder="Re-enter password"
              error={errors.confirm}
            />
            <Button
              title={isFirstLogin ? 'Save Password & Continue' : 'Update Password'}
              onPress={handle}
              loading={loading}
              style={{ marginTop: 8 }}
            />
            {!isFirstLogin ? (
              <TouchableOpacity onPress={handleResend} disabled={resending} style={styles.resend}>
                <Text style={styles.resendText}>{resending ? 'Sending…' : 'Resend mobile code'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </KeyboardFormWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  enteringRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  enteringText: {
    marginTop: 16,
    fontFamily: fonts.medium,
    fontSize: fontSize.base,
    color: colors.muted,
    textAlign: 'center',
  },
  scroll: { flexGrow: 1, padding: 24 },
  hero: { alignItems: 'center', paddingTop: 48, paddingBottom: 24 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.dark,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  title: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.text, textAlign: 'center', marginBottom: 12 },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  devBanner: {
    backgroundColor: `${colors.primary}30`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dark,
  },
  devBannerLabel: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.muted, marginBottom: 8 },
  devBannerCode: { fontFamily: fonts.bold, fontSize: 32, color: colors.dark, letterSpacing: 8 },
  form: { backgroundColor: colors.card, borderRadius: 20, padding: 24, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  resend: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  resendText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.primary },
});
