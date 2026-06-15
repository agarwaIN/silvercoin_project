import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';

export default function StepIndicator({ steps, current }) {
  return (
    <View style={styles.container}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            <View style={styles.step}>
              <View style={[styles.circle, done && styles.done, active && styles.active]}>
                <Text style={[styles.num, (done || active) && styles.numActive]}>
                  {done ? '✓' : i + 1}
                </Text>
              </View>
              <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
            </View>
            {i < steps.length - 1 && (
              <View style={[styles.line, done && styles.lineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 12, marginVertical: 16 },
  step: { alignItems: 'center', width: 60 },
  circle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  done: { backgroundColor: colors.success },
  active: { backgroundColor: colors.dark },
  num: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.muted },
  numActive: { color: colors.white },
  label: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: 4 },
  labelActive: { color: colors.dark, fontFamily: fonts.medium },
  line: { flex: 1, height: 2, backgroundColor: colors.border, marginTop: 15 },
  lineDone: { backgroundColor: colors.success },
});
