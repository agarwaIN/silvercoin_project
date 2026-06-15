import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';

export default function AppFooter() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}>
      <Text style={styles.text}>
        Made with <Text style={styles.heart}>♥</Text> by MANYA SHUKLA · 2026
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  text: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.muted,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  heart: {
    color: colors.dark,
    fontFamily: fonts.semiBold,
  },
});
