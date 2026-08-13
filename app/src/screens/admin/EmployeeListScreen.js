import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, StatusBar, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import Card from '../../components/Card';
import Header from '../../components/Header';
import { getEmployees, deactivateEmployee, deleteEmployee, updateEmployeeAccessRights } from '../../api/adminApi';
import { usePopup } from '../../context/PopupContext';

const AVAILABLE_RIGHTS = [
  { id: 'loan_creation', label: 'Loan Origination', icon: 'create-outline' },
  { id: 'doc_verification', label: 'Doc Verification', icon: 'document-text-outline' },
  { id: 'emi_collection', label: 'EMI Recovery', icon: 'cash-outline' },
];

export default function EmployeeListScreen({ navigation }) {
  const { showAlert } = usePopup();
  const [employees, setEmployees] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [selectedRights, setSelectedRights] = useState([]);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    const data = await getEmployees();
    setEmployees(data);
  }, []);

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleOpenEditRights = (user) => {
    setEditUser(user);
    setSelectedRights(user.accessRights || ['loan_creation', 'doc_verification', 'emi_collection']);
  };

  const toggleRight = (id) => {
    if (selectedRights.includes(id)) {
      if (selectedRights.length === 1) {
        showAlert('Warning', 'Employee must have at least one access right.');
        return;
      }
      setSelectedRights(selectedRights.filter(r => r !== id));
    } else {
      setSelectedRights([...selectedRights, id]);
    }
  };

  const handleSaveRights = async () => {
    if (!editUser) return;
    setUpdating(true);
    try {
      await updateEmployeeAccessRights(editUser.userId, selectedRights);
      setEditUser(null);
      await load();
      showAlert('Success', 'Employee access rights updated.');
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Failed to update access rights.');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeactivate = (userId, name) => {
    showAlert('Deactivate', `Deactivate ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: async () => {
        await deactivateEmployee(userId);
        load();
      }},
    ]);
  };

  const handleDelete = (userId, name) => {
    showAlert('Delete', `Are you sure you want to delete ${name}? This action cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteEmployee(userId);
        load();
      }},
    ]);
  };

  return (
    <View style={styles.safe} edges={['top']}>
      <StatusBar barStyle={'light-content'} translucent={true} backgroundColor={colors.dark} />
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
        renderItem={({ item }) => {
          const rights = item.accessRights || ['loan_creation', 'doc_verification', 'emi_collection'];
          return (
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
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity onPress={() => handleOpenEditRights(item)} style={styles.actionBtn}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    {item.isActive && (
                      <TouchableOpacity onPress={() => handleDeactivate(item.userId, item.name)} style={styles.actionBtn}>
                        <Ionicons name="person-remove-outline" size={18} color={colors.warning} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => handleDelete(item.userId, item.name)} style={styles.actionBtn}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Rights Badges */}
              <View style={styles.rightsBadgeRow}>
                <Text style={styles.rightsLabel}>Assigned Duties:</Text>
                <View style={styles.rightsChips}>
                  {AVAILABLE_RIGHTS.map(r => {
                    const hasRight = rights.includes(r.id);
                    if (!hasRight) return null;
                    return (
                      <View key={r.id} style={styles.chip}>
                        <Ionicons name={r.icon} size={11} color={colors.dark} />
                        <Text style={styles.chipText}>{r.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={colors.border} />
            <Text style={styles.emptyText}>No employees yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first employee</Text>
          </View>
        }
      />

      {/* Modal to edit access rights */}
      <Modal visible={!!editUser} transparent animationType="fade" onRequestClose={() => setEditUser(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Access Rights</Text>
            <Text style={styles.modalSub}>{editUser?.name} — {editUser?.email}</Text>
            
            <View style={{ gap: 10, marginVertical: 16 }}>
              {AVAILABLE_RIGHTS.map(r => {
                const isSelected = selectedRights.includes(r.id);
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.modalOption, isSelected && styles.modalOptionActive]}
                    onPress={() => toggleRight(r.id)}
                  >
                    <Ionicons name={r.icon} size={18} color={isSelected ? colors.dark : colors.muted} />
                    <Text style={[styles.modalOptionTxt, isSelected && styles.modalOptionTxtActive]}>{r.label}</Text>
                    <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={20} color={isSelected ? colors.dark : colors.muted} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditUser(null)} disabled={updating}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveRights} disabled={updating}>
                {updating ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSaveTxt}>Save Rights</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  actionBtn: { padding: 4 },
  rightsBadgeRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  rightsLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted },
  rightsChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  chipText: { fontFamily: fonts.medium, fontSize: 10, color: colors.dark },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.muted, marginTop: 12 },
  emptySubtext: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.white, borderRadius: 16, padding: 20 },
  modalTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.dark },
  modalSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  modalOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border },
  modalOptionActive: { borderColor: colors.dark, backgroundColor: '#F8FAFC' },
  modalOptionTxt: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  modalOptionTxtActive: { fontFamily: fonts.bold, color: colors.dark },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelTxt: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.text },
  modalSave: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.dark, alignItems: 'center' },
  modalSaveTxt: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.white },
});
