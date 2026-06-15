import React, { useState } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';

export default function Input({ label, error, secureTextEntry, multiline, style, ...props }) {
  const [visible, setVisible] = useState(false);
  const isPassword = secureTextEntry !== undefined;

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.row, error && styles.errorBorder, multiline && styles.multilineRow]}>
        <TextInput
          style={[styles.input, multiline && styles.multilineInput]}
          placeholderTextColor={colors.muted}
          secureTextEntry={isPassword && !visible}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'auto'}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity onPress={() => setVisible(!visible)} style={styles.eye}>
            <Ionicons name={visible ? 'eye' : 'eye-off'} size={20} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.text, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  errorBorder: { borderColor: colors.error },
  multilineRow: { alignItems: 'flex-start' },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.text,
    paddingVertical: 13,
  },
  multilineInput: {
    minHeight: 96,
    paddingTop: 13,
  },
  eye: { padding: 4 },
  error: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.error, marginTop: 4 },
});
