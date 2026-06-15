import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';

export default function Button({ title, onPress, loading, variant = 'primary', style, disabled }) {
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';
  const isDanger = variant === 'danger';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading || disabled}
      style={[
        styles.base,
        isPrimary && styles.primary,
        isOutline && styles.outline,
        isDanger && styles.danger,
        (loading || disabled) && styles.disabled,
        style,
      ]}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? colors.dark : colors.white} />
      ) : (
        <Text style={[styles.text, isOutline && styles.outlineText, isDanger && styles.dangerText]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primary: { backgroundColor: colors.dark },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.dark },
  danger: { backgroundColor: colors.error },
  disabled: { opacity: 0.55 },
  text: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.white },
  outlineText: { color: colors.dark },
  dangerText: { color: colors.white },
});
