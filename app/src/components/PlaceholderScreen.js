import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from './Header';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';

export default function PlaceholderScreen({ title = 'Coming soon', message = 'Implement this screen.' }) {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={title} />
      <View style={styles.body}>
        <Text style={styles.message}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: 24, justifyContent: 'center' },
  message: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 24,
  },
});
