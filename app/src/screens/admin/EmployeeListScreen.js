import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Card from '../../components/Card';
import Header from '../../components/Header';
import { getEmployees, deactivateEmployee } from '../../api/adminApi';
import { usePopup } from '../../context/PopupContext';

export default function EmployeeListScreen({ navigation }) {
  const { showAlert } = usePopup();
  const [employees, setEmployees] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getEmployees();
    setEmployees(data);
  }, []);

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleDeactivate = (userId, name) => {
    showAlert('Deactivate', `Deactivate ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: async () => {
        await deactivateEmployee(userId);
        load();
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header
        title="Employees"
        rightAction={
          <TouchableOpacity onPress={() => navigation.navigate('CreateEmployee')} style={styles.addBtn}>
            <Ionicons name="person-add-outline" size={22} color={colors.white} />
          </TouchableOpacity>
        }
      />
      <FlatList
        style={styles.listFlex}
        data={employees}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark} />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name[0].toUpperCase()}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.email}>{item.email}</Text>
                <Text style={styles.mobile}>{item.mobile}</Text>
              </View>
              <View style={styles.actions}>
                <View style={[styles.badge, { backgroundColor: item.isActive ? colors.success + '25' : '#FEE2E2' }]}>
                  <Text style={[styles.badgeText, { color: item.isActive ? colors.success : colors.error }]}>
                    {item.isActive ? 'Active' : 'Inactive'}
                  </Text>
                </View>
                {item.isActive && (
                  <TouchableOpacity onPress={() => handleDeactivate(item.userId, item.name)} style={styles.deactivateBtn}>
                    <Ionicons name="person-remove-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={colors.border} />
            <Text style={styles.emptyText}>No employees yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first employee</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  listFlex: { flex: 1 },
  list: { padding: 16, paddingBottom: 80, flexGrow: 1 },
  addBtn: { padding: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bold, fontSize: fontSize.md, color: colors.white },
  info: { flex: 1 },
  name: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.text },
  email: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  mobile: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.muted },
  actions: { alignItems: 'flex-end', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontFamily: fonts.semiBold, fontSize: 10 },
  deactivateBtn: { padding: 4 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.muted, marginTop: 12 },
  emptySubtext: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 4 },
});
