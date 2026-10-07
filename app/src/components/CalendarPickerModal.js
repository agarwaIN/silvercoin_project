import React from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import CalendarPicker from './CalendarPicker';
import { colors } from '../theme/colors';

export { CalendarPicker };

export default function CalendarPickerModal({
  visible,
  value,
  onSelect,
  onClose,
  title = 'Select Date',
}) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <CalendarPicker
            value={value}
            onSelect={onSelect}
            onClose={onClose}
            title={title}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
  },
});
