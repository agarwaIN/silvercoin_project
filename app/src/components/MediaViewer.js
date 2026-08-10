import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking, StyleSheet, ScrollView, Modal, Image, SafeAreaView } from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

// Subcomponent to handle video playback cleanly with the hook
function FullScreenVideo({ url, onClose }) {
  const player = useVideoPlayer(url, player => {
    player.play();
  });
  return (
    <View style={styles.modalBg}>
      <VideoView style={styles.fullMedia} player={player} allowsFullscreen allowsPictureInPicture />
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={30} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

export default function MediaViewer({ fetchMedia }) {
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);

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

  const handlePress = (m) => {
    if (m.type === 'document') {
      Linking.openURL(m.url);
    } else {
      setSelectedMedia(m);
    }
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
          <TouchableOpacity key={i} style={styles.mediaBox} onPress={() => handlePress(m)}>
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

      {/* Inline Fullscreen Viewer */}
      <Modal visible={!!selectedMedia} transparent animationType="fade" onRequestClose={() => setSelectedMedia(null)}>
        {selectedMedia?.type === 'video' ? (
          <FullScreenVideo url={selectedMedia.url} onClose={() => setSelectedMedia(null)} />
        ) : selectedMedia?.type === 'photo' || selectedMedia?.type === 'image' ? (
          <View style={styles.modalBg}>
            <Image source={{ uri: selectedMedia.url }} style={styles.fullMedia} resizeMode="contain" />
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedMedia(null)}>
              <Ionicons name="close" size={30} color={colors.white} />
            </TouchableOpacity>
          </View>
        ) : null}
      </Modal>
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
  viewText: { fontSize: 9, color: colors.primary, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  fullMedia: { width: '100%', height: '100%' },
  closeBtn: { position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 25 }
});
