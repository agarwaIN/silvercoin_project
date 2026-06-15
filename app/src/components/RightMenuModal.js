import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';

const win = Dimensions.get('window');

export const menuPanelWidth = Math.min(win.width * 0.66, 232);

function iconForRoute(routeName, focused) {
  const icons = {
    Dashboard: focused ? 'grid' : 'grid-outline',
    Loans: focused ? 'document-text' : 'document-text-outline',
    Employees: focused ? 'people' : 'people-outline',
    Users: focused ? 'people' : 'people-outline',
    Recovery: focused ? 'wallet' : 'wallet-outline',
  };
  return icons[routeName] || 'ellipse-outline';
}

function labelForRoute(routeName) {
  const labels = {
    Dashboard: 'Dashboard',
    Loans: 'Loans',
    Employees: 'Employees',
    Users: 'Users',
    Recovery: 'Recovery',
  };
  return labels[routeName] || routeName;
}

export default function RightMenuModal({
  visible,
  onClose,
  routeNames,
  activeRouteName,
  onSelectRoute,
  onLogout,
  extraMenuItems,
}) {
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 10);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.scrimFlex} onPress={onClose} activeOpacity={1} accessibilityLabel="Close menu" />
        <View
          style={[
            styles.panel,
            {
              width: menuPanelWidth,
              marginTop: topPad,
              marginBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          <View style={styles.accentBar} />
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="leaf" size={18} color={colors.white} />
            </View>
            <View>
              <Text style={styles.brand}>Silvercoin</Text>
              <Text style={styles.headerSub}>Navigate</Text>
            </View>
          </View>

          <View style={styles.list}>
            {routeNames.map((name) => {
              const focused = activeRouteName === name;
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.row, focused && styles.rowFocused]}
                  onPress={() => onSelectRoute(name)}
                  activeOpacity={0.65}
                >
                  <View style={[styles.rowIcon, focused && styles.rowIconOn]}>
                    <Ionicons
                      name={iconForRoute(name, focused)}
                      size={18}
                      color={focused ? colors.dark : colors.muted}
                    />
                  </View>
                  <Text style={[styles.label, focused && styles.labelFocused]} numberOfLines={1}>
                    {labelForRoute(name)}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={focused ? colors.dark : colors.border} />
                </TouchableOpacity>
              );
            })}
          </View>

          {extraMenuItems?.length ? (
            <View style={styles.extraBlock}>
              {extraMenuItems.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    item.onPress();
                  }}
                  activeOpacity={0.65}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name={item.icon || 'ellipse-outline'} size={18} color={colors.muted} />
                  </View>
                  <Text style={styles.label} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.border} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View style={styles.logoutRule} />
          <TouchableOpacity
            style={styles.logoutRow}
            onPress={onLogout}
            activeOpacity={0.65}
            accessibilityLabel="Log out"
          >
            <View style={styles.logoutIconWrap}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
            </View>
            <Text style={styles.logoutLabel}>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'flex-start',
  },
  scrimFlex: { flex: 1, alignSelf: 'stretch' },
  panel: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    paddingBottom: 10,
    paddingHorizontal: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: -6, height: 8 },
    elevation: 14,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.dark,
    borderTopLeftRadius: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 6,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.dark,
    letterSpacing: 0.2,
  },
  headerSub: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 1,
  },
  list: {
    gap: 4,
  },
  extraBlock: {
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 10,
  },
  rowFocused: {
    backgroundColor: `${colors.primary}28`,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconOn: {
    backgroundColor: `${colors.primary}40`,
  },
  label: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  labelFocused: {
    fontFamily: fonts.semiBold,
    color: colors.dark,
  },
  logoutRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: 4,
    marginTop: 6,
    marginBottom: 4,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 10,
  },
  logoutIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: `${colors.error}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.error,
  },
});
