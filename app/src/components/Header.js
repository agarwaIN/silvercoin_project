import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import DrawerMenuButton from './DrawerMenuButton';
import SilvercoinLogoMark from './SilvercoinLogoMark';
import { useHeaderBranding } from '../context/HeaderBrandingContext';

export default function Header({
  title,
  subtitle,
  onBack,
  rightAction,
  hideDrawerMenu,
  hideBrandLogo,
  headerLogoSource,
  compact,
  showLogoMark,
}) {
  const insets = useSafeAreaInsets();
  const { headerImageSource } = useHeaderBranding();
  const resolvedLogoSource = headerLogoSource !== undefined ? headerLogoSource : headerImageSource;
  const rightSlot = hideDrawerMenu ? (
    rightAction ?? <View style={[styles.placeholder, compact && styles.placeholderCompact]} />
  ) : (
    <View style={styles.rightRow}>
      {rightAction}
      <DrawerMenuButton />
    </View>
  );
  return (
    <View style={[
      styles.container,
      compact && styles.containerCompact,
      { paddingTop: insets.top + (compact ? 2 : 8) },
    ]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.dark} />
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={[styles.backBtn, compact && styles.backBtnCompact]}>
            <Ionicons name="arrow-back" size={compact ? 20 : 22} color={colors.white} />
          </TouchableOpacity>
        ) : null}
        {showLogoMark ? (
          <SilvercoinLogoMark
            size={compact ? 30 : 36}
            style={[styles.logoMark, compact && styles.logoMarkCompact]}
          />
        ) : null}
        {!hideBrandLogo && !showLogoMark && resolvedLogoSource ? (
          <Image
            source={resolvedLogoSource}
            style={[styles.brandLogo, compact && styles.brandLogoCompact]}
            resizeMode="contain"
          />
        ) : null}
        <View style={styles.titleBlock}>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {rightSlot}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.dark, paddingBottom: 16, paddingHorizontal: 16 },
  containerCompact: { paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { padding: 4, marginRight: 8 },
  backBtnCompact: { padding: 2, marginRight: 4 },
  logoMark: { marginRight: 8 },
  logoMarkCompact: { marginRight: 6 },
  brandLogo: { width: 36, height: 36, marginRight: 8, borderRadius: 8 },
  brandLogoCompact: { width: 28, height: 28, marginRight: 6 },
  placeholder: { width: 36 },
  placeholderCompact: { width: 28 },
  rightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minWidth: 36, gap: 4 },
  titleBlock: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', minWidth: 0 },
  title: { fontFamily: fonts.semiBold, fontSize: fontSize.md, color: colors.white, flexShrink: 1 },
  titleCompact: { fontFamily: fonts.medium, fontSize: fontSize.md },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.primary, marginTop: 2, flexShrink: 1 },
});
