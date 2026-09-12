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
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { usePopup } from '../context/PopupContext';
import { useAuth } from '../context/AuthContext';
import { uploadRegistryDocument as uploadAdminDoc } from '../api/adminApi';
import { uploadRegistryDocument as uploadEmpDoc } from '../api/employeeApi';
import { WebView } from 'react-native-webview';
import { formatDate } from '../utils/date';

const STANDARD_DOC_TYPES = [
  'Property Registry - 1',
  'Property Registry - 2',
  'Property Registry - 3',
  'Gift Deed',
  'Khasara / Khatoni',
  'Farat',
  'Property Video',
  'Property Pics',
  'Owner Pics',
];

function FullScreenVideo({ url, name, onClose, onDownload, downloading }) {
  const player = useVideoPlayer(url, (p) => {
    p.play();
  });
  return (
    <View style={styles.modalBg}>
      <VideoView style={styles.fullMedia} player={player} allowsFullscreen allowsPictureInPicture />
      <View style={styles.videoTopBar}>
        <TouchableOpacity
          style={styles.videoDownloadBtn}
          onPress={onDownload}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="download-outline" size={18} color={colors.white} />
              <Text style={styles.videoDownloadTxt}>Save to Device</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtnVideo} onPress={onClose}>
          <Ionicons name="close" size={26} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const getStandardDocTitle = (d) => {
  if (!d) return null;
  const typeStr = (d.docType || '').toLowerCase();
  const nameStr = (d.name || '').toLowerCase();
  const combined = `${typeStr} ${nameStr}`
    .replace(/[\u2010-\u2015\u2212_/-]/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Khasara / Khatoni (distinctive keywords)
  if (
    combined.includes('khasara') ||
    combined.includes('khatoni') ||
    combined.includes('khasra') ||
    combined.includes('khatauni') ||
    combined.includes('jamabandi') ||
    combined.includes('land record') ||
    combined.includes('revenue record')
  ) {
    return 'Khasara / Khatoni';
  }

  // 2. Gift Deed
  if (combined.includes('gift') || combined.includes('transfer deed') || combined.includes('hibanama')) {
    return 'Gift Deed';
  }

  // 3. Farat / Fard
  if (combined.includes('farat') || combined.includes('fard') || combined.includes('fardh') || combined.includes('nakal') || combined.includes('land right')) {
    return 'Farat';
  }

  // 4. Property Registry 3
  if (
    combined.includes('registry 3') ||
    combined.includes('registery 3') ||
    combined.includes('registry3') ||
    combined.includes('tertiary') ||
    (combined.includes('registry') && combined.includes('3')) ||
    (combined.includes('registery') && combined.includes('3'))
  ) {
    return 'Property Registry - 3';
  }

  // 5. Property Registry 2
  if (
    combined.includes('registry 2') ||
    combined.includes('registery 2') ||
    combined.includes('registry2') ||
    combined.includes('secondary') ||
    (combined.includes('registry') && combined.includes('2')) ||
    (combined.includes('registery') && combined.includes('2'))
  ) {
    return 'Property Registry - 2';
  }

  // 6. Property Registry 1 (or default registry)
  if (
    combined.includes('registry 1') ||
    combined.includes('registery 1') ||
    combined.includes('registry1') ||
    combined.includes('primary') ||
    (combined.includes('registry') && combined.includes('1')) ||
    (combined.includes('registery') && combined.includes('1')) ||
    combined.includes('registry') ||
    combined.includes('registery')
  ) {
    return 'Property Registry - 1';
  }

  return null;
};

export const isVideoFileAsset = (asset) => {
  if (!asset) return false;
  const mime = (asset.mimeType || asset.type || '').toLowerCase();
  const uri = (asset.uri || '').toLowerCase();
  const name = (asset.name || '').toLowerCase();
  return (
    mime.startsWith('video/') ||
    uri.endsWith('.mp4') || uri.endsWith('.mov') || uri.endsWith('.avi') || uri.endsWith('.mkv') || uri.endsWith('.webm') || uri.endsWith('.3gp') || uri.endsWith('.m4v') ||
    name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.avi') || name.endsWith('.mkv') || name.endsWith('.webm') || name.endsWith('.3gp') || name.endsWith('.m4v')
  );
};

export default function MediaViewer({ fetchMedia, loanId, onDocumentUploaded }) {
  const { user } = useAuth();
  const { showAlert } = usePopup();
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(!!loanId);
  const [selectedMedia, setSelectedMedia] = useState(null);

  // Custom Upload Modal State
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState('Property Registry - 1');
  const [customDocName, setCustomDocName] = useState('');
  const [docDate, setDocDate] = useState(formatDate(new Date()));
  const [pickedFile, setPickedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const downloadAndSaveMedia = async (url, originalName, mimeType) => {
    if (!url) {
      showAlert('Error', 'No media URL found to download.');
      return;
    }
    setDownloading(true);
    try {
      let ext = '.bin';
      const cleanUrl = url.split('?')[0].toLowerCase();
      if (cleanUrl.endsWith('.mp4') || (mimeType && mimeType.includes('video'))) ext = '.mp4';
      else if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) ext = '.jpg';
      else if (cleanUrl.endsWith('.png')) ext = '.png';
      else if (cleanUrl.endsWith('.pdf') || (mimeType && mimeType.includes('pdf'))) ext = '.pdf';

      const safeName = (originalName || 'file')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/\.[a-zA-Z0-9]+$/, '');
      const filename = `${safeName}_${Date.now()}${ext}`;
      const localUri = `${FileSystem.documentDirectory}${filename}`;

      const downloadRes = await FileSystem.downloadAsync(url, localUri);
      if (downloadRes.status !== 200) {
        throw new Error(`Download failed with status ${downloadRes.status}`);
      }

      const isMedia = ext === '.mp4' || ext === '.jpg' || ext === '.png';
      if (isMedia) {
        try {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === 'granted') {
            const asset = await MediaLibrary.createAssetAsync(downloadRes.uri);
            try {
              await MediaLibrary.createAlbumAsync('ShreeLoan', asset, false);
            } catch {}
            showAlert('Saved to Device', `${safeName}${ext} has been downloaded and automatically saved to your Gallery!`);
            return;
          }
        } catch (mediaErr) {
          console.warn('MediaLibrary save error:', mediaErr);
        }
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadRes.uri, {
          dialogTitle: `Save ${safeName}`,
          mimeType: ext === '.pdf' ? 'application/pdf' : (ext === '.mp4' ? 'video/mp4' : 'application/octet-stream'),
          UTI: ext === '.pdf' ? 'com.adobe.pdf' : (ext === '.mp4' ? 'public.movie' : 'public.item'),
        });
        showAlert('Downloaded', 'File downloaded successfully. You can save or open it on your device.');
      } else {
        showAlert('Downloaded', `Saved to device: ${filename}`);
      }
    } catch (err) {
      console.error('Download error:', err);
      showAlert('Download Notice', 'Opening browser to download directly.');
      Linking.openURL(url).catch(() => {});
    } finally {
      setDownloading(false);
    }
  };

  const normalizeMediaUrl = (url) => {
    if (!url) return '';
    let fixed = url;
    if (fixed.startsWith('http://13.200.237.51/api/')) {
      fixed = fixed.replace('http://13.200.237.51/api/', 'http://13.200.237.51:5000/api/');
    } else if (fixed.startsWith('/api/')) {
      fixed = `http://13.200.237.51:5000${fixed}`;
    }
    return fixed;
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMedia();
      if (Array.isArray(data)) {
        const normalized = data.map((item) => ({
          ...item,
          url: normalizeMediaUrl(item.url),
        }));
        setMedia(normalized);
      } else {
        setMedia(data);
      }
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

  const isPdf = (mediaItem) => {
    if (!mediaItem || !mediaItem.url) return false;
    const url = mediaItem.url.toLowerCase();
    const mime = (mediaItem.mimeType || '').toLowerCase();
    const name = (mediaItem.name || '').toLowerCase();
    return url.endsWith('.pdf') || mime.includes('pdf') || name.endsWith('.pdf');
  };

  const handlePress = (m) => {
    if (!m) return;
    setSelectedMedia(m);
  };

  const openUploadModal = (defaultType) => {
    setSelectedDocType(defaultType || 'Property Registry - 1');
    setCustomDocName('');
    setDocDate(formatDate(new Date()));
    setPickedFile(null);
    setUploadModalVisible(true);
  };

  const handlePickDocument = async (preferredType = 'application/pdf') => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: preferredType,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const selected = res.assets[0];
        if (isVideoFileAsset(selected)) {
          showAlert('Invalid File', 'Videos cannot be uploaded in the Document section. Please select a valid document (PDF, PNG, JPG).');
          return;
        }
        setPickedFile(selected);
      }
    } catch (err) {
      showAlert('Error', 'Failed to pick file from device.');
    }
  };

  const handleCameraDocument = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Needed', 'Allow camera access to capture document photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPickedFile({
        uri: asset.uri,
        name: `doc_camera_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
      if (!customDocName.trim()) {
        setCustomDocName(selectedDocType || 'Document Photo');
      }
    } catch (err) {
      showAlert('Camera Error', 'Could not capture document with camera.');
    }
  };

  const handleUploadSubmit = async () => {
    if (!pickedFile) {
      showAlert('Required', 'Please pick a file to upload.');
      return;
    }
    if (isVideoFileAsset(pickedFile)) {
      showAlert('Invalid File', 'Videos cannot be uploaded in the Document section. Please select a valid document (PDF, PNG, JPG).');
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
      await uploader(loanId, formData, {
        docType: selectedDocType,
        name: docName,
        date: docDate,
      });

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

  if (loading) {
    return (
      <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={colors.dark} />
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>Loading Media & Documents...</Text>
      </View>
    );
  }

  if (!media) {
    return (
      <TouchableOpacity style={styles.loadBtn} onPress={load}>
        <Ionicons name="images-outline" size={20} color={colors.white} />
        <Text style={styles.loadText}>Load Uploaded Media & Documents</Text>
      </TouchableOpacity>
    );
  }

  // Filter media items into categories
  const videos = media.filter((m) => m.type === 'video');
  const photos = media.filter((m) => m.type === 'photo' || m.type === 'image');
  const docs = media.filter((m) => m.type === 'document');

  // Standard property docs checklist state mapping with comprehensive match keys
  const standardDocsList = [
    {
      title: 'Property Registry - 1',
      matchKeys: [
        'property registry - 1', 'property registery - 1',
        'registry - 1', 'registery - 1',
        'registry 1', 'registery 1',
        'registry_1', 'registry-1', 'registry1',
        'primary property registry', 'primary registry',
      ],
      subtitle: 'Primary Property Registry',
    },
    {
      title: 'Property Registry - 2',
      matchKeys: [
        'property registry - 2', 'property registery - 2',
        'registry - 2', 'registery - 2',
        'registry 2', 'registery 2',
        'registry_2', 'registry-2', 'registry2',
        'secondary property registry', 'secondary registry',
      ],
      subtitle: 'Secondary Property Registry',
    },
    {
      title: 'Property Registry - 3',
      matchKeys: [
        'property registry - 3', 'property registery - 3',
        'registry - 3', 'registery - 3',
        'registry 3', 'registery 3',
        'registry_3', 'registry-3', 'registry3',
        'tertiary property registry', 'tertiary registry',
      ],
      subtitle: 'Tertiary Property Registry',
    },
    {
      title: 'Gift Deed',
      matchKeys: ['gift deed', 'gift_deed', 'giftdeed', 'gift', 'property transfer'],
      subtitle: 'Property Transfer / Gift Deed',
    },
    {
      title: 'Khasara / Khatoni',
      matchKeys: ['khasara', 'khatoni', 'khasra', 'khatauni', 'land record'],
      subtitle: 'Land Record Document',
    },
    {
      title: 'Farat',
      matchKeys: ['farat', 'fard', 'fardh', 'land rights'],
      subtitle: 'Land Rights Document',
    },
  ];

  // Map uploaded docs to standard docs or custom docs
  const uploadedStandardMap = {};
  const customDocsList = [];
  docs.forEach((d) => {
    let matchedTitle = getStandardDocTitle(d);

    // Smart slot allocation: If a document is a registry document and slot 1 is already taken,
    // assign it to Registry - 2 (or Registry - 3) so multiple uploaded registries aren't lost to customDocsList
    if (matchedTitle === 'Property Registry - 1' && uploadedStandardMap['Property Registry - 1']) {
      if (!uploadedStandardMap['Property Registry - 2']) {
        matchedTitle = 'Property Registry - 2';
      } else if (!uploadedStandardMap['Property Registry - 3']) {
        matchedTitle = 'Property Registry - 3';
      }
    } else if (matchedTitle === 'Property Registry - 2' && uploadedStandardMap['Property Registry - 2']) {
      if (!uploadedStandardMap['Property Registry - 3']) {
        matchedTitle = 'Property Registry - 3';
      }
    }

    if (matchedTitle && !uploadedStandardMap[matchedTitle]) {
      uploadedStandardMap[matchedTitle] = d;
    } else {
      customDocsList.push(d);
    }
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={2}>Document & Media Inventory</Text>
        {loanId && (
          <TouchableOpacity style={styles.addDocBtn} onPress={() => openUploadModal('Custom Document')}>
            <Ionicons name="add" size={15} color={colors.white} />
            <Text style={styles.addDocTxt}>Add Document</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category 1: Videos */}
      <Text style={styles.sectionHeader}>Property & Owner Videos</Text>
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
      <Text style={styles.sectionHeader}>Property & Owner Pictures</Text>
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
      <Text style={styles.sectionHeader}>Standard Property Documents</Text>
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
                    ? `Uploaded ${docItem.date ? `• ${formatDate(docItem.date)}` : ''}`
                    : stdItem.subtitle}
                </Text>
              </View>
              {isUploaded ? (
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={styles.downloadIconBtn}
                    onPress={() => downloadAndSaveMedia(docItem.url, docItem.name, docItem.mimeType)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="download-outline" size={15} color={colors.dark} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.viewDocBtn} onPress={() => handlePress(docItem)}>
                    <Ionicons name="eye-outline" size={14} color={colors.primary} />
                    <Text style={styles.viewDocTxt}>View</Text>
                  </TouchableOpacity>
                </View>
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
      <Text style={styles.sectionHeader}>Additional Documents / Custom Attachments</Text>
      {customDocsList.length > 0 ? (
        <View style={styles.checklistContainer}>
          {customDocsList.map((cDoc, idx) => (
            <View key={idx} style={styles.checkRow}>
              <Ionicons name="document-text" size={20} color={colors.dark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.checkTitle}>{cDoc.name || cDoc.docType || 'Custom Document'}</Text>
                <Text style={styles.checkSub}>{cDoc.date ? `Uploaded on ${formatDate(cDoc.date)}` : 'Custom file'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <TouchableOpacity
                  style={styles.downloadIconBtn}
                  onPress={() => downloadAndSaveMedia(cDoc.url, cDoc.name, cDoc.mimeType)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="download-outline" size={15} color={colors.dark} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.viewDocBtn} onPress={() => handlePress(cDoc)}>
                  <Ionicons name="open-outline" size={14} color={colors.primary} />
                  <Text style={styles.viewDocTxt}>Open</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyCategoryTxt}>No custom documents attached yet</Text>
      )}

      {/* Inline Fullscreen Viewer for Images, Videos & Documents */}
      <Modal visible={!!selectedMedia} transparent animationType="fade" onRequestClose={() => setSelectedMedia(null)}>
        {selectedMedia?.type === 'video' ? (
          <FullScreenVideo
            url={selectedMedia.url}
            name={selectedMedia.name}
            onClose={() => setSelectedMedia(null)}
            onDownload={() => downloadAndSaveMedia(selectedMedia.url, selectedMedia.name, 'video/mp4')}
            downloading={downloading}
          />
        ) : selectedMedia ? (
          <View style={styles.modalBg}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalMediaTitle} numberOfLines={1}>
                {selectedMedia.name || selectedMedia.docType || 'Document Preview'}
              </Text>
              <TouchableOpacity style={styles.closeBtnHeader} onPress={() => setSelectedMedia(null)}>
                <Ionicons name="close" size={26} color={colors.white} />
              </TouchableOpacity>
            </View>

            <View style={styles.previewContainer}>
              {isPdf(selectedMedia) ? (
                <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                  <Ionicons name="document-text" size={72} color={colors.primary} style={{ marginBottom: 16 }} />
                  <Text style={{ fontSize: 17, color: colors.white, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
                    {selectedMedia.name || 'PDF Document'}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 24 }}>
                    Tap below to download to your device or open directly in your PDF viewer.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <TouchableOpacity
                      style={[styles.externalBtn, { backgroundColor: colors.dark }]}
                      onPress={() => downloadAndSaveMedia(selectedMedia.url, selectedMedia.name, 'application/pdf')}
                      disabled={downloading}
                    >
                      {downloading ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <>
                          <Ionicons name="download-outline" size={18} color={colors.white} />
                          <Text style={styles.externalBtnTxt}>Save PDF to Device</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.externalBtn}
                      onPress={() => Linking.openURL(selectedMedia.url).catch(() => showAlert('Notice', 'Cannot open PDF directly.'))}
                    >
                      <Ionicons name="open-outline" size={18} color={colors.white} />
                      <Text style={styles.externalBtnTxt}>Open In PDF Reader</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <Image
                  source={{ uri: selectedMedia.url }}
                  style={styles.fullMedia}
                  resizeMode="contain"
                />
              )}
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.externalBtn, { backgroundColor: colors.dark }]}
                onPress={() => downloadAndSaveMedia(selectedMedia.url, selectedMedia.name, selectedMedia.mimeType)}
                disabled={downloading}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={18} color={colors.white} />
                    <Text style={styles.externalBtnTxt}>Save to Device</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.externalBtn} onPress={() => Linking.openURL(selectedMedia.url).catch(() => {})}>
                <Ionicons name="open-outline" size={16} color={colors.white} />
                <Text style={styles.externalBtnTxt}>Open Externally</Text>
              </TouchableOpacity>
            </View>
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
                  placeholderTextColor={colors.placeholder || '#4B5563'}
                  value={customDocName}
                  onChangeText={setCustomDocName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <Text style={styles.inputLabel}>Document Date</Text>
            <TextInput
              style={styles.textInput}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={colors.placeholder || '#4B5563'}
              value={docDate}
              onChangeText={setDocDate}
            />

            <Text style={[styles.inputLabel, { marginTop: 12 }]}>Select Document File</Text>

            {/* Primary Option: Choose Latest Downloaded PDF */}
            <TouchableOpacity
              style={[styles.pickFileBtn, { backgroundColor: '#EFF6FF', borderColor: colors.primary, marginBottom: 8, marginTop: 10 }]}
              onPress={() => handlePickDocument('application/pdf')}
            >
              <Ionicons name="document-text" size={20} color={colors.primary} />
              <Text style={[styles.pickFileTxt, { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>
                {pickedFile && (pickedFile.mimeType?.includes('pdf') || pickedFile.name?.toLowerCase().endsWith('.pdf'))
                  ? `Selected: ${pickedFile.name}`
                  : 'Choose Latest Downloaded PDF'}
              </Text>
            </TouchableOpacity>

            {/* Camera Option: Capture Document with Camera */}
            <TouchableOpacity
              style={[styles.pickFileBtn, { backgroundColor: '#F0FDF4', borderColor: colors.dark, marginBottom: 8, marginTop: 0 }]}
              onPress={handleCameraDocument}
            >
              <Ionicons name="camera-outline" size={20} color={colors.dark} />
              <Text style={[styles.pickFileTxt, { color: colors.dark, fontWeight: '700' }]} numberOfLines={1}>
                {pickedFile && (pickedFile.name?.includes('doc_camera_') || pickedFile.mimeType === 'image/jpeg')
                  ? `Captured: ${pickedFile.name}`
                  : 'Capture Document with Camera'}
              </Text>
            </TouchableOpacity>

            {/* Secondary Option: Choose Image / Photo File */}
            <TouchableOpacity
              style={[styles.pickFileBtn, { marginTop: 0 }]}
              onPress={() => handlePickDocument('*/*')}
            >
              <Ionicons name="images-outline" size={18} color={colors.muted} />
              <Text style={[styles.pickFileTxt, { color: colors.text }]} numberOfLines={1}>
                {pickedFile && !pickedFile.name?.includes('doc_camera_') && !(pickedFile.mimeType?.includes('pdf') || pickedFile.name?.toLowerCase().endsWith('.pdf'))
                  ? `Selected: ${pickedFile.name}`
                  : 'Choose Image / Photo File'}
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 },
  title: { fontSize: 13, fontFamily: fonts.bold, color: colors.dark, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1, flexShrink: 1, marginRight: 6 },
  addDocBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.dark, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, flexShrink: 0 },
  addDocTxt: { color: colors.white, fontFamily: fonts.semiBold, fontSize: 11 },
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
  downloadIconBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 6, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: colors.border },
  viewDocBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#E0F2FE' },
  viewDocTxt: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.primary },
  uploadDocBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.dark },
  uploadDocTxt: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.white },
  missingTxt: { fontFamily: fonts.medium, fontSize: 11, color: '#D97706' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  fullMedia: { width: '100%', height: '100%' },
  closeBtn: { position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 25 },
  videoTopBar: { position: 'absolute', top: Platform.OS === 'ios' ? 44 : 20, left: 16, right: 16, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  videoDownloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  videoDownloadTxt: { color: colors.white, fontFamily: fonts.semiBold, fontSize: 13 },
  closeBtnVideo: { padding: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  modalHeaderRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 44 : 20, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.9)' },
  modalMediaTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.white, flex: 1, marginRight: 12 },
  closeBtnHeader: { padding: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 },
  previewContainer: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' },
  modalFooterRow: { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.9)' },
  externalBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  externalBtnTxt: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.white },
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
