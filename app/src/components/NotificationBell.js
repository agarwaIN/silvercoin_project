import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { useNotifications } from '../context/NotificationContext';

export default function NotificationBell({ color = colors.white, size = 22, style }) {
  const navigation = useNavigation();
  const { unreadCount } = useNotifications();

  const handlePress = () => {
    navigation.navigate('Notifications');
  };

  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.container, style]}
      accessibilityLabel={`Notifications, ${unreadCount} unread`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.7}
    >
      <Ionicons
        name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
        size={size}
        color={color}
      />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {displayCount}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    minHeight: 32,
  },
  badge: {
    position: 'absolute',
    top: 1,
    right: 1,
    backgroundColor: '#EF4444', // Vibrant red badge
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.dark,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 1.5,
  },
  badgeText: {
    color: colors.white,
    fontFamily: fonts.bold || fonts.semiBold,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
    fontWeight: '700',
  },
});
