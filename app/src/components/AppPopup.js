import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';

export default function AppPopup({ visible, config, onDismiss, onAlertButton, onPromptConfirm }) {
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    if (visible && config?.kind === 'prompt') {
      setPromptValue(config.defaultValue || '');
    }
  }, [visible, config]);

  if (!config) return null;

  const handleBackdrop = () => {
    if (config.kind === 'prompt') {
      onDismiss();
      return;
    }
    const hasCancel = config.buttons?.some((b) => b.style === 'cancel');
    if (hasCancel || (config.buttons?.length === 1 && config.buttons[0].text === 'OK')) {
      onDismiss();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
      >
        <Pressable style={styles.overlay} onPress={handleBackdrop}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.title}>{config.title}</Text>
              {config.message ? (
                <Text style={styles.message}>{config.message}</Text>
              ) : null}

              {config.kind === 'prompt' && (
                <TextInput
                  style={styles.promptInput}
                  value={promptValue}
                  onChangeText={setPromptValue}
                  placeholder="Optional"
                  placeholderTextColor={colors.muted}
                  multiline
                  maxLength={500}
                />
              )}
            </ScrollView>

            {config.kind === 'alert' && (
              <View style={[styles.btnRow, config.buttons.length > 2 && styles.btnRowWrap]}>
                {config.buttons.map((btn, i) => (
                  <Pressable
                    key={`${btn.text}-${i}`}
                    onPress={() => onAlertButton(btn)}
                    style={({ pressed }) => [
                      styles.alertBtn,
                      config.buttons.length <= 2 && styles.alertBtnFlex,
                      btn.style === 'destructive' && styles.alertBtnDanger,
                      btn.style === 'cancel' && styles.alertBtnCancel,
                      pressed && styles.alertBtnPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.alertBtnText,
                        btn.style === 'destructive' && styles.alertBtnTextDanger,
                        btn.style === 'cancel' && styles.alertBtnTextCancel,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {config.kind === 'prompt' && (
              <View style={styles.btnRow}>
                <Pressable
                  onPress={onDismiss}
                  style={({ pressed }) => [styles.alertBtn, styles.alertBtnFlex, styles.alertBtnCancel, pressed && styles.alertBtnPressed]}
                >
                  <Text style={[styles.alertBtnText, styles.alertBtnTextCancel]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => onPromptConfirm(promptValue)}
                  style={({ pressed }) => [
                    styles.alertBtn,
                    styles.alertBtnFlex,
                    config.confirmStyle === 'destructive' && styles.alertBtnDanger,
                    pressed && styles.alertBtnPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.alertBtnText,
                      config.confirmStyle === 'destructive' && styles.alertBtnTextLight,
                    ]}
                  >
                    {config.confirmText || 'OK'}
                  </Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center' },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: 8,
  },
  message: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.muted,
    lineHeight: 20,
  },
  promptInput: {
    marginTop: 12,
    minHeight: 80,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.text,
    backgroundColor: colors.inputBg,
    textAlignVertical: 'top',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    justifyContent: 'flex-end',
  },
  btnRowWrap: { flexWrap: 'wrap' },
  alertBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark,
    minWidth: 88,
  },
  alertBtnFlex: { flex: 1 },
  alertBtnDanger: { backgroundColor: colors.error },
  alertBtnCancel: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
  alertBtnPressed: { opacity: 0.85 },
  alertBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.white,
  },
  alertBtnTextDanger: { color: colors.white },
  alertBtnTextCancel: { color: colors.dark },
  alertBtnTextLight: { color: colors.white },
});
