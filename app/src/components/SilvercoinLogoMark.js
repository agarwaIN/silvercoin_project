import React from 'react';
import { Image } from 'react-native';

const logo = require('../../assets/silvercoin-logo.png');

export default function SilvercoinLogoMark({ size = 56, style }) {
  return (
    <Image
      source={logo}
      style={[{ width: size, height: size, resizeMode: 'contain' }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Silvercoin"
    />
  );
}
