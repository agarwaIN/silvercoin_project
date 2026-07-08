import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

export default function MediaViewer({ fetchMedia }) {
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMedia();
      setMedia(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (!media && !loading) {
    return (
      <TouchableOpacity style={styles.loadBtn} onPress={load}>
        <Ionicons name="images-outline" size={20} color={colors.white} />
        <Text style={styles.loadText}>Load Uploaded Media</Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return <ActivityIndicator style={{ margin: 20 }} color={colors.dark} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Uploaded Media & Documents</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {media.map((m, i) => (
          <TouchableOpacity key={i} style={styles.mediaBox} onPress={() => Linking.openURL(m.url)}>
            <Ionicons 
              name={m.type === 'video' ? 'videocam' : m.type === 'document' ? 'document-text' : 'image'} 
              size={32} color={colors.muted} 
            />
            <Text style={styles.mediaLabel} numberOfLines={1}>
              {m.type === 'document' ? (m.name || 'Doc') : `${m.type} ${i}`}
            </Text>
            <Text style={styles.viewText}>Tap to view</Text>
          </TouchableOpacity>
        ))}
        {media.length === 0 && <Text style={{ color: colors.muted, fontSize: 13 }}>No media uploaded yet.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark, padding: 14, borderRadius: 12, gap: 8, marginTop: 12, marginBottom: 12 },
  loadText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  container: { marginTop: 8, marginBottom: 16, backgroundColor: colors.white, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  title: { fontSize: 14, fontWeight: '700', color: colors.dark, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  scroll: { gap: 12 },
  mediaBox: { width: 100, height: 100, backgroundColor: colors.inputBg, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, padding: 8 },
  mediaLabel: { fontSize: 11, color: colors.text, marginTop: 6, textTransform: 'capitalize', fontWeight: '500' },
  viewText: { fontSize: 9, color: colors.primary, marginTop: 2 }
});
