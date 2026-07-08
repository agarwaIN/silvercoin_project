import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import StatusBadge from '../../components/StatusBadge';
import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { getLoan, getLoanMediaPreview } from '../../api/employeeApi';
import LoanDetailsView from '../../components/LoanDetailsView';
import MediaViewer from '../../components/MediaViewer';

export default function LoanDetailScreen({ route, navigation }) {
  const { loanId } = route.params;
  const [loan, setLoan] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getLoan(loanId);
    setLoan(data);
  }, [loanId]);

  useFocusEffect(useCallback(() => { void load().catch(() => {}); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  };

  if (!loan) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <Header title="Loan" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header title={loan.loanId} />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <StatusBadge status={loan.status} />
        </View>
        
        <LoanDetailsView loan={loan} />
        <MediaViewer fetchMedia={() => getLoanMediaPreview(loan.loanId)} />

        {!['approved', 'rejected'].includes(loan.status) && (
          <TouchableOpacity 
            style={styles.editBtn} 
            onPress={() => navigation.navigate('NewLoan', { existingLoan: loan })}
          >
            <Ionicons name="create-outline" size={20} color={colors.white} />
            <Text style={styles.editBtnText}>Edit Application</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  label: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.text },
  field: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.text, marginBottom: 8 },
  note: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted, marginTop: 16 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark, paddingVertical: 14, borderRadius: 12, gap: 8, marginTop: 16, marginBottom: 24 },
  editBtnText: { fontFamily: fonts.semiBold, fontSize: fontSize.base, color: colors.white },
});
