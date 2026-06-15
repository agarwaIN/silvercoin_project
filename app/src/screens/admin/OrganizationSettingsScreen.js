import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { colors } from '../../theme/colors';
import { getProfile, patchProfile } from '../../api/adminApi';
import { usePopup } from '../../context/PopupContext';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

export default function OrganizationSettingsScreen({ navigation }) {
  const { showAlert } = usePopup();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useFocusEffect(useCallback(() => {
    getProfile().then((p) => setName(p.name || '')).catch(() => {});
  }, []));

  const onSave = async () => {
    setLoading(true);
    try {
      await patchProfile({ name: name.trim() });
      showAlert('Saved', 'Profile updated.');
      navigation.goBack();
    } catch (err) {
      showAlert('Not implemented', err.response?.data?.message || 'Implement profile update on the API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title="Organization" />
      <View style={styles.body}>
        <Input label="Display name" value={name} onChangeText={setName} />
        <Button title="Save" onPress={onSave} loading={loading} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: 16, gap: 12 },
});
