import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAppMenu } from '../context/AppMenuContext';

export default function DrawerMenuButton() {
  const { openMenu } = useAppMenu();
  return (
    <TouchableOpacity
      onPress={openMenu}
      style={styles.btn}
      accessibilityLabel="Open menu"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="menu-outline" size={24} color={colors.white} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 4 },
});
