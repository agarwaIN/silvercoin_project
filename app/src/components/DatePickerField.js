import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { formatDate } from '../utils/date';
import CalendarPickerModal from './CalendarPickerModal';

export default function DatePickerField({
  label,
  value,
  onChange,
  placeholder = 'DD-MM-YYYY',
  title,
  style,
  disabled = false,
  useModal = false,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  // Normalize displayed value to DD-MM-YYYY format
  const displayVal = value ? formatDate(value) : '';

  const handleSelect = (selectedDateStr) => {
    onChange(selectedDateStr);
    setPickerOpen(false);
  };

  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <TouchableOpacity
        style={[styles.inputRow, disabled && styles.inputDisabled]}
        onPress={() => !disabled && setPickerOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.valueText, !displayVal && styles.placeholderText]}>
          {displayVal || placeholder}
        </Text>

        <View style={styles.iconButton}>
          <Ionicons name="calendar-outline" size={20} color={colors.dark || '#4B6B4E'} />
        </View>
      </TouchableOpacity>

      <CalendarPickerModal
        visible={pickerOpen}
        value={displayVal}
        onSelect={handleSelect}
        onClose={() => setPickerOpen(false)}
        title={title || label || 'Select Date'}
        useModal={useModal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.text,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  valueText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
  },
  placeholderText: {
    fontFamily: fonts.regular,
    color: colors.placeholder || '#4B5563',
  },
  iconButton: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
