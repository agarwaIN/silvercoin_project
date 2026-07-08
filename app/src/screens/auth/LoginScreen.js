import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import KeyboardFormWrapper from '../../components/KeyboardFormWrapper';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { login } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import { usePopup } from '../../context/PopupContext';
import SilvercoinLogoMark from '../../components/SilvercoinLogoMark';
import { normalizeMobileToE164 } from '../../utils/phone';

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const { showAlert } = usePopup();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    const m = normalizeMobileToE164(mobile);
    if (!m.ok) e.mobile = m.error;
    if (!password) e.password = 'Password is required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    const m = normalizeMobileToE164(mobile);
    setLoading(true);
    try {
      const data = await login(m.e164, password);
      if (data.otpRequired && data.sessionId) {
        navigation.navigate('OtpVerify', {
          sessionId: data.sessionId,
          maskedMobile: data.maskedMobile,
          maskedEmail: data.maskedEmail,
          emailOtpDelivered: data.emailOtpDelivered,
          devOtp: data.devOtp,
        });
        return;
      }
      if (data.accessToken && data.user) {
        await signIn(data.accessToken, data.user);
        return;
      }
      showAlert('Login Failed', 'Unexpected response from server.');
    } catch (err) {
      if (__DEV__) {
        const cfg = err.config;
        console.error('[login]', {
          message: err.message,
          code: err.code,
          status: err.response?.status,
          url: cfg ? `${cfg.baseURL || ''}${cfg.url || ''}` : undefined,
        });
      }
      const status = err.response?.status;
      const d = err.response?.data;
      const serverMsg =
        d?.message
        || (Array.isArray(d?.errors) && d.errors[0]?.msg)
        || null;

      if (status === 404) {
        showAlert(
          'Account not found',
          serverMsg || 'No account found with this mobile number.',
        );
        return;
      }

      if (status === 401) {
        showAlert(
          'Incorrect password',
          serverMsg || 'The password you entered is incorrect.',
        );
        return;
      }

      if (status === 403) {
        showAlert('Account inactive', serverMsg || 'This account is not active.');
        return;
      }

      const msg =
        serverMsg
        || (err.message && !err.response ? err.message : null)
        || 'Something went wrong. Check your network and API URL.';
      showAlert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardFormWrapper contentContainerStyle={styles.scroll}>
          <View style={styles.hero}>
            <View style={styles.logoCircle}>
              <SilvercoinLogoMark size={80} />
            </View>
            <Text style={styles.appName}>Silvercoin</Text>
            <Text style={styles.tagline}>Your Assets Are In Safe Hands</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.heading}>Welcome Back</Text>
            <Text style={styles.subheading}>Sign in with your mobile number</Text>

            <Input
              label="Mobile Number"
              value={mobile}
              onChangeText={setMobile}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="9876543210"
              error={errors.mobile}
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter your password"
              error={errors.password}
            />

            <Button title="Sign in" onPress={handleLogin} loading={loading} style={styles.btn} />

            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              style={styles.forgot}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {__DEV__ && (
              <View style={styles.devSection}>
                <Text style={styles.devTitle}>🛠 Quick Dev Login</Text>
                <View style={styles.devButtons}>
                  <TouchableOpacity
                    style={styles.devBtn}
                    onPress={() => { setMobile('7078813158'); setPassword('your_secure_password'); }}
                  >
                    <Text style={styles.devBtnText}>SuperAdmin</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.devBtn}
                    onPress={() => { setMobile('9999999999'); setPassword('admin_pass'); }}
                  >
                    <Text style={styles.devBtnText}>Admin</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.devBtn}
                    onPress={() => { setMobile('8888888888'); setPassword('emp_pass'); }}
                  >
                    <Text style={styles.devBtnText}>Employee</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.devNote}>Update placeholders in code if needed, then tap Sign In.</Text>
              </View>
            )}
          </View>
      </KeyboardFormWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: 24 },
  hero: { alignItems: 'center', paddingTop: 32, paddingBottom: 40 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: '#111111',
    marginBottom: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  appName: { fontFamily: fonts.bold, fontSize: fontSize.xxl, color: colors.dark },
  tagline: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 4, textAlign: 'center' },
  form: { backgroundColor: colors.card, borderRadius: 20, padding: 24, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  heading: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.text, marginBottom: 4 },
  subheading: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginBottom: 24 },
  btn: { marginTop: 8 },
  forgot: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  forgotText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.dark },
  devSection: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  devTitle: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: colors.muted, marginBottom: 12, textAlign: 'center' },
  devButtons: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  devBtn: { backgroundColor: colors.bg, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  devBtnText: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.dark },
  devNote: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: 8 },
});
