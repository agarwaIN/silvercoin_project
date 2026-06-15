import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import KeyboardFormWrapper from '../../components/KeyboardFormWrapper';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Header from '../../components/Header';
import Input from '../../components/Input';
import Button from '../../components/Button';
import {
  requestForgotPasswordOtp,
  confirmForgotPassword,
  resendForgotPasswordOtp,
} from '../../api/authApi';
import { usePopup } from '../../context/PopupContext';
import { validatePassword } from '../../utils/password';
import { normalizeMobileToE164 } from '../../utils/phone';

export default function ForgotPasswordScreen({ navigation }) {
  const { showAlert } = usePopup();
  const [step, setStep] = useState(1);
  const [mobile, setMobile] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [maskedMobile, setMaskedMobile] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errors, setErrors] = useState({});

  const handleRequestOtp = async () => {
    const e = {};
    const m = normalizeMobileToE164(mobile);
    if (!m.ok) e.mobile = m.error;
    setErrors(e);
    if (Object.keys(e).length) return;

    setLoading(true);
    try {
      const data = await requestForgotPasswordOtp(m.e164);
      setSessionId(data.sessionId);
      setMaskedMobile(data.maskedMobile || '');
      setDevOtp(data.devOtp || null);
      setStep(2);
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Could not start password reset');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    const e = {};
    if (!/^\d{6}$/.test(otp.replace(/\D/g, ''))) e.otp = 'Enter the 6-digit code';
    const p = validatePassword(newPassword);
    if (!p.ok) e.newPassword = p.error;
    if (newPassword !== confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    if (Object.keys(e).length) return;

    setLoading(true);
    try {
      await confirmForgotPassword(sessionId, otp.replace(/\D/g, ''), newPassword, confirm);
      showAlert('Password reset', 'Your password was updated. Sign in with your new password.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!sessionId) return;
    setResending(true);
    try {
      const data = await resendForgotPasswordOtp(sessionId);
      if (data.devOtp) setDevOtp(data.devOtp);
      setOtp('');
      showAlert('Code sent', data.message || 'A new code was sent to your mobile.');
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Could not resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Forgot password"
        onBack={() => navigation.goBack()}
        hideDrawerMenu
        hideBrandLogo
        showLogoMark
        compact
      />
      <KeyboardFormWrapper contentContainerStyle={styles.scroll}>
        {step === 1 ? (
          <View style={styles.form}>
            <Text style={styles.heading}>Reset your password</Text>
            <Text style={styles.subheading}>
              Enter your registered mobile number. We will send a verification code by SMS.
            </Text>
            <Input
              label="Mobile Number"
              value={mobile}
              onChangeText={setMobile}
              keyboardType="phone-pad"
              autoCapitalize="none"
              placeholder="9876543210"
              error={errors.mobile}
            />
            <Button title="Send verification code" onPress={handleRequestOtp} loading={loading} />
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.heading}>Verify mobile</Text>
            <Text style={styles.subheading}>
              {devOtp
                ? 'Local development: use the code shown below.'
                : `Enter the 6-digit code sent to ${maskedMobile || 'your mobile'}.`}
            </Text>
            {devOtp ? (
              <View style={styles.devBanner}>
                <Text style={styles.devBannerLabel}>Your verification code</Text>
                <Text style={styles.devBannerCode}>{devOtp}</Text>
              </View>
            ) : null}
            <Input
              label="Verification code"
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="000000"
              error={errors.otp}
              maxLength={6}
            />
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
            <Button title="Reset password" onPress={handleReset} loading={loading} style={{ marginTop: 8 }} />
            <TouchableOpacity onPress={handleResend} disabled={resending} style={styles.resend}>
              <Text style={styles.resendText}>{resending ? 'Sending…' : 'Resend code'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardFormWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: 24 },
  form: { backgroundColor: colors.card, borderRadius: 20, padding: 24, marginTop: 8 },
  heading: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.text, marginBottom: 8 },
  subheading: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginBottom: 20, lineHeight: 20 },
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
  resend: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  resendText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.dark },
});
