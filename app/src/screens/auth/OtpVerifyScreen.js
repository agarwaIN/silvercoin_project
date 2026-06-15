import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import KeyboardFormWrapper from '../../components/KeyboardFormWrapper';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Input from '../../components/Input';
import Button from '../../components/Button';
import Header from '../../components/Header';
import { verifyOtp, resendOtp } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import { usePopup } from '../../context/PopupContext';

export default function OtpVerifyScreen({ route, navigation }) {
  const {
    sessionId,
    maskedMobile,
    maskedEmail,
    emailOtpDelivered,
    devOtp: initialDevOtp,
  } = route.params || {};
  const { signIn } = useAuth();
  const { showAlert } = usePopup();
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(initialDevOtp || null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');

  if (!sessionId) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Verify code" onBack={() => navigation.goBack()} hideDrawerMenu />
        <View style={styles.center}>
          <Text style={styles.errorText}>Session missing. Please sign in again.</Text>
          <Button title="Back to sign in" onPress={() => navigation.navigate('Login')} />
        </View>
      </SafeAreaView>
    );
  }

  const handleVerify = async () => {
    const code = otp.replace(/\D/g, '');
    if (code.length !== 6) {
      setError('Enter the 6-digit verification code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await verifyOtp(sessionId, code);
      await signIn(data.accessToken, data.user);
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid or expired code';
      setError(msg);
      if (msg.toLowerCase().includes('sign in again')) {
        showAlert('Session expired', msg, [
          { text: 'OK', onPress: () => navigation.navigate('Login') },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const data = await resendOtp(sessionId);
      if (data.devOtp) setDevOtp(data.devOtp);
      showAlert('Code sent', data.message || 'A new code was sent to your mobile.');
      setOtp('');
      setError('');
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not resend code';
      showAlert('Resend failed', msg);
      if (msg.toLowerCase().includes('sign in again')) {
        navigation.navigate('Login');
      }
    } finally {
      setResending(false);
    }
  };

  const otpHint = () => {
    if (devOtp) {
      return 'Local development: use the code shown below.';
    }
    if (emailOtpDelivered && maskedEmail) {
      return `We sent a 6-digit code to ${maskedMobile || 'your mobile'} and ${maskedEmail}. You can use either code.`;
    }
    return `We sent a 6-digit code to ${maskedMobile || 'your mobile'}.`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Verify code" onBack={() => navigation.goBack()} hideDrawerMenu />
      <KeyboardFormWrapper contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>{emailOtpDelivered ? 'Check your mobile & email' : 'Check your mobile'}</Text>
        <Text style={styles.subheading}>{otpHint()}</Text>

        {devOtp ? (
          <View style={styles.devBanner}>
            <Text style={styles.devBannerLabel}>Your verification code</Text>
            <Text style={styles.devBannerCode}>{devOtp}</Text>
          </View>
        ) : null}

        <Input
          label="One-time code"
          value={otp}
          onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="000000"
          error={error}
          maxLength={6}
        />

        <Button title="Verify & sign in" onPress={handleVerify} loading={loading} style={styles.btn} />

        <TouchableOpacity onPress={handleResend} disabled={resending} style={styles.resend}>
          <Text style={styles.resendText}>
            {resending ? 'Sending…' : "Didn't get it? Resend code"}
          </Text>
        </TouchableOpacity>
      </KeyboardFormWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: 24 },
  center: { flex: 1, padding: 24, justifyContent: 'center' },
  heading: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.text, marginBottom: 8 },
  subheading: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginBottom: 24, lineHeight: 20 },
  devBanner: {
    backgroundColor: `${colors.primary}30`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dark,
  },
  devBannerLabel: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.muted, marginBottom: 8 },
  devBannerCode: { fontFamily: fonts.bold, fontSize: 32, color: colors.dark, letterSpacing: 8 },
  btn: { marginTop: 8 },
  resend: { marginTop: 20, alignItems: 'center', paddingVertical: 8 },
  resendText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.dark },
  errorText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.muted, marginBottom: 16, textAlign: 'center' },
});
