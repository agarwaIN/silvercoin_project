import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import { colors } from '../theme/colors';

export default function CustomSplash({ onDone }) {
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(600),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => onDone?.());
  }, [onDone, opacity]);

  return (
    <View style={styles.root}>
      <Animated.View style={{ opacity }}>
        <Image source={require('../../assets/silvercoin-logo.png')} style={styles.logo} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  logo: { width: 180, height: 180 },
});
