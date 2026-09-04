import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
  ScrollView,
  Modal,
  Image,
  TextInput,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as DocumentPicker from 'expo-document-picker';
import { usePopup } from '../context/PopupContext';
import { useAuth } from '../context/AuthContext';
import { uploadRegistryDocument as uploadAdminDoc } from '../api/adminApi';
import { uploadRegistryDocument as uploadEmpDoc } from '../api/employeeApi';

const STANDARD_DOC_TYPES = [
  'Property Registery - 1',
  'Registery - 2',
  'Registery - 3',
  'Gift Deed',
  'Khasara / Khatoni',
  'Farat',
  'Property Video',
  'Property Pics',
  'Owner Pics',
];

function FullScreenVideo({ url, onClose }) {
  const player = useVideoPlayer(url, (p) => {
    p.play();
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

export default function MediaViewer({ fetchMedia, loanId, onDocumentUploaded }) {
  const { user } = useAuth();
  const { showAlert } = usePopup();
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);

  // Custom Upload Modal State
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState('Property Registery - 1');
  const [customDocName, setCustomDocName] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [pickedFile, setPickedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

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

  useEffect(() => {
    if (loanId) {
      load();
    }
  }, [loanId]);

  const handlePress = (m) => {
    if (m.type === 'document') {
      if (m.url) Linking.openURL(m.url);
    } else {
      setSelectedMedia(m);
    }
  };

  const openUploadModal = (defaultType) => {
    setSelectedDocType(defaultType || 'Property Registery - 1');
    setCustomDocName('');
    setDocDate(new Date().toISOString().split('T')[0]);
    setPickedFile(null);
    setUploadModalVisible(true);
  };

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'video/*'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setPickedFile(res.assets[0]);
      }
    } catch (err) {
      showAlert('Error', 'Failed to pick file.');
    }
  };

  const handleUploadSubmit = async () => {
    if (!pickedFile) {
      showAlert('Required', 'Please pick a file to upload.');
      return;
    }
    if (!loanId) {
      showAlert('Error', 'Loan ID not provided.');
      return;
    }

    const docName =
      selectedDocType === 'Custom Document' || !selectedDocType
        ? customDocName.trim() || pickedFile.name
        : selectedDocType;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', {
        uri: Platform.OS === 'android' ? pickedFile.uri : pickedFile.uri.replace('file://', ''),
        name: pickedFile.name || 'document',
        type: pickedFile.mimeType || 'application/octet-stream',
      });
      formData.append('docType', selectedDocType);
      formData.append('name', docName);
      formData.append('date', docDate);

      const uploader = user?.role === 'admin' ? uploadAdminDoc : uploadEmpDoc;
      await uploader(loanId, formData);

      showAlert('Success', `${docName} uploaded successfully!`);
      setUploadModalVisible(false);
      await load();
      if (onDocumentUploaded) onDocumentUploaded();
    } catch (err) {
      console.error('Upload error:', err);
      showAlert('Error', err.response?.data?.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  if (!media && !loading) {
    return (
      <TouchableOpacity style={styles.loadBtn} onPress={load}>
        <Ionicons name="images-outline" size={20} color={colors.white} />
        <Text style={styles.loadText}>Load Uploaded Media & Documents</Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return <ActivityIndicator style={{ margin: 20 }} color={colors.dark} />;
  }

  // Filter media items into categories
  const videos = media.filter((m) => m.type === 'video');
  const photos = media.filter((m) => m.type === 'photo' || m.type === 'image');
  const docs = media.filter((m) => m.type === 'document');

  // Standard property docs checklist state mapping
  const standardDocsList = [
    { title: 'Property Registery - 1', subtitle: 'Primary Property Registry' },
    { title: 'Registery - 2', subtitle: 'Secondary Property Registry' },
    { title: 'Registery - 3', subtitle: 'Tertiary Property Registry' },
    { title: 'Gift Deed', subtitle: 'Property Transfer / Gift Deed' },
    { title: 'Khasara / Khatoni', subtitle: 'Land Record Document' },
    { title: 'Farat', subtitle: 'Land Rights Document' },
  ];

  // Map uploaded docs to standard docs or custom docs
  const uploadedStandardMap = {};
  const customDocsList = [];

  docs.forEach((d) => {
    const matchedStd = standardDocsList.find(
      (s) =>
        s.title.toLowerCase() === (d.docType || d.name || '').toLowerCase() ||
        (d.name || '').toLowerCase().includes(s.title.toLowerCase()),
    );
    if (matchedStd) {
      uploadedStandardMap[matchedStd.title] = d;
    } else {
      customDocsList.push(d);
    }
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Document & Media Inventory</Text>
        {loanId && (
          <TouchableOpacity style={styles.addDocBtn} onPress={() => openUploadModal('Custom Document')}>
            <Ionicons name="add" size={16} color={colors.white} />
            <Text style={styles.addDocTxt}>+ Add Document</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category 1: Videos */}
      <Text style={styles.sectionHeader}>🎥 Property & Owner Video</Text>
      {videos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {videos.map((m, i) => (
            <TouchableOpacity key={i} style={styles.mediaBox} onPress={() => handlePress(m)}>
              <Ionicons name="videocam" size={28} color="#D97706" />
              <Text style={styles.mediaLabel} numberOfLines={1}>
                {m.name || `Video ${i + 1}`}
              </Text>
              <Text style={styles.viewText}>Watch Video</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.emptyCategoryTxt}>No video recorded</Text>
      )}

      {/* Category 2: Photos / Images */}
      <Text style={styles.sectionHeader}>🖼️ Property & Owner Pictures</Text>
      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {photos.map((m, i) => (
            <TouchableOpacity key={i} style={styles.mediaBox} onPress={() => handlePress(m)}>
              <Ionicons name="image" size={28} color={colors.primary} />
              <Text style={styles.mediaLabel} numberOfLines={1}>
                {m.name || `Photo ${i + 1}`}
              </Text>
              <Text style={styles.viewText}>View Image</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.emptyCategoryTxt}>No property/owner photos uploaded</Text>
      )}

      {/* Category 3: Standard Property Documents Checklist */}
      <Text style={styles.sectionHeader}>📑 Standard Property Documents</Text>
      <View style={styles.checklistContainer}>
        {standardDocsList.map((stdItem) => {
          const docItem = uploadedStandardMap[stdItem.title];
          const isUploaded = !!docItem;

          return (
            <View key={stdItem.title} style={styles.checkRow}>
              <Ionicons
                name={isUploaded ? 'checkmark-circle' : 'alert-circle-outline'}
                size={22}
                color={isUploaded ? colors.success : '#D97706'}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.checkTitle}>{stdItem.title}</Text>
                <Text style={styles.checkSub}>
                  {isUploaded
                    ? `Uploaded ${docItem.date ? `• ${docItem.date}` : ''}`
                    : stdItem.subtitle}
                </Text>
              </View>
              {isUploaded ? (
                <TouchableOpacity style={styles.viewDocBtn} onPress={() => handlePress(docItem)}>
                  <Ionicons name="eye-outline" size={14} color={colors.primary} />
                  <Text style={styles.viewDocTxt}>View</Text>
                </TouchableOpacity>
              ) : loanId ? (
                <TouchableOpacity
                  style={styles.uploadDocBtn}
                  onPress={() => openUploadModal(stdItem.title)}
                >
                  <Ionicons name="cloud-upload-outline" size={14} color={colors.white} />
                  <Text style={styles.uploadDocTxt}>Upload</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.missingTxt}>Missing</Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Category 4: Custom / Rest Documents */}
      <Text style={styles.sectionHeader}>📁 Rest Documents / Custom Attachments</Text>
      {customDocsList.length > 0 ? (
        <View style={styles.checklistContainer}>
          {customDocsList.map((cDoc, idx) => (
            <View key={idx} style={styles.checkRow}>
              <Ionicons name="document-text" size={20} color={colors.dark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.checkTitle}>{cDoc.name || cDoc.docType || 'Custom Document'}</Text>
                <Text style={styles.checkSub}>{cDoc.date ? `Uploaded on ${cDoc.date}` : 'Custom file'}</Text>
              </View>
              <TouchableOpacity style={styles.viewDocBtn} onPress={() => handlePress(cDoc)}>
                <Ionicons name="open-outline" size={14} color={colors.primary} />
                <Text style={styles.viewDocTxt}>Open</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyCategoryTxt}>No custom documents attached yet</Text>
      )}

      {/* Inline Fullscreen Viewer for Images/Videos */}
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

      {/* Upload Custom / Standard Document Modal */}
      <Modal visible={uploadModalVisible} transparent animationType="slide" onRequestClose={() => setUploadModalVisible(false)}>
        <View style={styles.modalBg}>
          <View style={styles.uploadModalCard}>
            <Text style={styles.uploadModalTitle}>Upload Property Document</Text>

            <Text style={styles.inputLabel}>Select Document Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
              {[...STANDARD_DOC_TYPES, 'Custom Document'].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, selectedDocType === t && styles.typeChipActive]}
                  onPress={() => setSelectedDocType(t)}
                >
                  <Text style={[styles.typeChipTxt, selectedDocType === t && styles.typeChipTxtActive]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {selectedDocType === 'Custom Document' && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inputLabel}>Document Name / Title</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Electricity Bill / NOC"
                  placeholderTextColor={colors.muted}
                  value={customDocName}
                  onChangeText={setCustomDocName}
                />
              </View>
            )}

            <Text style={styles.inputLabel}>Document Date</Text>
            <TextInput
              style={styles.textInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.muted}
              value={docDate}
              onChangeText={setDocDate}
            />

            <TouchableOpacity style={styles.pickFileBtn} onPress={handlePickDocument}>
              <Ionicons name={pickedFile ? 'document-attach' : 'cloud-upload'} size={20} color={colors.dark} />
              <Text style={styles.pickFileTxt}>
                {pickedFile ? pickedFile.name : 'Choose PDF or Image File'}
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setUploadModalVisible(false)}
                disabled={uploading}
              >
                <Text style={styles.cancelModalTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleUploadSubmit}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.submitModalTxt}>Upload File</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark, padding: 14, borderRadius: 12, gap: 8, marginTop: 12, marginBottom: 12 },
  loadText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  container: { marginTop: 8, marginBottom: 16, backgroundColor: colors.white, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 14, fontFamily: fonts.bold, color: colors.dark, textTransform: 'uppercase', letterSpacing: 0.5 },
  addDocBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.dark, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  addDocTxt: { color: colors.white, fontFamily: fonts.medium, fontSize: 11 },
  sectionHeader: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  scroll: { gap: 10, paddingBottom: 6 },
  mediaBox: { width: 100, height: 90, backgroundColor: colors.inputBg, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, padding: 8 },
  mediaLabel: { fontSize: 11, color: colors.text, marginTop: 6, textTransform: 'capitalize', fontFamily: fonts.medium },
  viewText: { fontSize: 9, color: colors.primary, marginTop: 2, fontFamily: fonts.semiBold },
  emptyCategoryTxt: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, fontStyle: 'italic', marginBottom: 6 },
  checklistContainer: { gap: 8, marginTop: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  checkTitle: { fontFamily: fonts.semiBold, fontSize: fontSize.xs, color: colors.dark },
  checkSub: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted, marginTop: 1 },
  viewDocBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#E0F2FE' },
  viewDocTxt: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.primary },
  uploadDocBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.dark },
  uploadDocTxt: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.white },
  missingTxt: { fontFamily: fonts.medium, fontSize: 11, color: '#D97706' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  fullMedia: { width: '100%', height: '100%' },
  closeBtn: { position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 25 },
  uploadModalCard: { width: '100%', backgroundColor: colors.white, borderRadius: 16, padding: 20 },
  uploadModalTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.dark, marginBottom: 14 },
  inputLabel: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.text, marginBottom: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg },
  typeChipActive: { backgroundColor: colors.dark, borderColor: colors.dark },
  typeChipTxt: { fontFamily: fonts.medium, fontSize: 11, color: colors.text },
  typeChipTxtActive: { color: colors.white, fontFamily: fonts.bold },
  textInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  pickFileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderStyle: 'dashed', borderWidth: 1.5, borderColor: colors.dark, padding: 14, borderRadius: 10, backgroundColor: '#F8FAFC', marginTop: 10 },
  pickFileTxt: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.dark },
  cancelModalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelModalTxt: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.text },
  submitModalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.dark, alignItems: 'center' },
  submitModalTxt: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.white },
});
