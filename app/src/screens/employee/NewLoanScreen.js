import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Linking, BackHandler, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import {
  createLoan, updateLoan, submitLoan,
  uploadVideo, uploadPropertyPhotos, uploadRegistryDocument,
} from '../../api/employeeApi';
import { usePopup } from '../../context/PopupContext';
import Header from '../../components/Header';
import { formatDate } from '../../utils/date';

// ─── Step Progress Bar ────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Owner &\nVerification' },
  { label: 'Property\nDetails' },
  { label: 'Loan\nDetails' },
  { label: 'Review &\nSubmit' },
];

function StepBar({ current }) {
  return (
    <View style={sb.row}>
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            <View style={sb.item}>
              <View style={[sb.circle, done && sb.done, active && sb.active]}>
                {done
                  ? <Ionicons name="checkmark" size={14} color={colors.white} />
                  : <Text style={[sb.num, active && sb.numActive]}>{i + 1}</Text>}
              </View>
              <Text style={[sb.label, active && sb.labelActive]}>{s.label}</Text>
            </View>
            {i < STEPS.length - 1 && <View style={[sb.line, done && sb.lineDone]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}
const sb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.bg },
  item: { alignItems: 'center', width: 68 },
  circle: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: colors.dark },
  active: { backgroundColor: colors.dark },
  num: { fontSize: 13, fontWeight: '600', color: colors.muted },
  numActive: { color: colors.white },
  label: { fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: 4, lineHeight: 13 },
  labelActive: { color: colors.dark, fontWeight: '700' },
  line: { flex: 1, height: 2, backgroundColor: colors.border, marginTop: 15 },
  lineDone: { backgroundColor: colors.dark },
});

// ─── Reusable Components ─────────────────────────────────────────────────────
function FieldLabel({ text, required }) {
  return (
    <Text style={fl.label}>
      {text}{required && <Text style={fl.star}> *</Text>}
    </Text>
  );
}
const fl = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500', color: colors.text, marginBottom: 6, marginTop: 14 },
  star: { color: colors.error },
});

function StyledInput({ value, onChangeText, placeholder, keyboardType, multiline, editable = true, loading }) {
  return (
    <View>
      <TextInput
        style={[si.input, multiline && si.multi, !editable && si.disabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        editable={editable && !loading}
      />
      {loading && (
        <ActivityIndicator size="small" color={colors.dark} style={si.spinner} />
      )}
    </View>
  );
}
const si = StyleSheet.create({
  input: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 12, color: colors.text },
  multi: { minHeight: 80, textAlignVertical: 'top' },
  disabled: { backgroundColor: colors.inputBg, color: colors.muted },
  spinner: { position: 'absolute', right: 12, top: 14 },
});

function SectionTitle({ title }) {
  return <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 8, marginBottom: 4 }}>{title}</Text>;
}

// ─── Video Section Card Component ───────────────────────────────────────────────
function VideoSectionCard({
  title,
  required,
  description,
  videoUri,
  videoUploaded,
  player,
  onRecordOrPick,
  onRemove,
  uploading,
  uploadLabel,
}) {
  return (
    <View style={vid.card}>
      <View style={vid.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={vid.title}>
            {title} {required && <Text style={{ color: colors.error }}>*</Text>}
          </Text>
          <Text style={vid.sub}>{description}</Text>
        </View>
        {videoUploaded && (
          <View style={vid.badgeUploaded}>
            <Ionicons name="checkmark-circle" size={15} color={colors.success} />
            <Text style={vid.badgeUploadedText}>Uploaded</Text>
          </View>
        )}
      </View>

      {videoUri ? (
        <View style={vid.playerWrapper}>
          <Text style={vid.previewHint}>Preview — play to verify recorded video:</Text>
          <VideoView
            player={player}
            style={vid.player}
            allowsFullscreen
            allowsPictureInPicture
          />
          <View style={vid.previewActions}>
            <TouchableOpacity
              style={vid.replaceBtn}
              onPress={onRecordOrPick}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.dark} />
              ) : (
                <Ionicons name="videocam-outline" size={16} color={colors.dark} />
              )}
              <Text style={vid.replaceBtnText}>
                {uploading ? 'Uploading...' : 'Re-record / Replace'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={vid.removeBtn}
              onPress={onRemove}
              disabled={uploading}
            >
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={vid.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={vid.btn}
          onPress={onRecordOrPick}
          disabled={uploading}
          activeOpacity={0.7}
        >
          <View style={vid.inner}>
            {uploading ? (
              <ActivityIndicator color={colors.dark} />
            ) : (
              <Ionicons name="videocam" size={28} color={colors.dark} />
            )}
            <Text style={vid.text}>
              {uploading ? 'Uploading video...' : uploadLabel}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── STEP 1: Owner & Verification ─────────────────────────────────────────────
function Step1({ data, setData, loanId }) {
  const [ifscLoading, setIfscLoading] = useState(false);
  const [ownerUploading, setOwnerUploading] = useState(false);
  const [houseUploading, setHouseUploading] = useState(false);

  const ownerPlayer = useVideoPlayer(data.videoUri || null, p => { p.loop = false; });
  const housePlayer = useVideoPlayer(data.houseVideoUri || null, p => { p.loop = false; });

  const fetchBankFromIFSC = async (ifsc) => {
    if (ifsc.length !== 11) { setData(d => ({ ...d, bankName: '' })); return; }
    setIfscLoading(true);
    try {
      const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`);
      if (res.ok) {
        const json = await res.json();
        setData(d => ({ ...d, bankName: `${json.BANK} — ${json.BRANCH}` }));
      } else {
        setData(d => ({ ...d, bankName: '' }));
      }
    } catch { } finally { setIfscLoading(false); }
  };

  const pickVideo = (videoType = 'owner') => {
    const isHouse = videoType === 'house';
    Alert.alert(
      isHouse ? 'House / Property Video' : 'Owner Verification Video',
      'Choose how to capture the video:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record Video (Camera)',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Allow camera access to record video.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Videos,
              videoMaxDuration: 60,
            });
            if (result.canceled || !result.assets?.[0]) return;
            handleVideoCaptured(result.assets[0].uri, videoType);
          },
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Allow gallery access to select video.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Videos,
            });
            if (result.canceled || !result.assets?.[0]) return;
            handleVideoCaptured(result.assets[0].uri, videoType);
          },
        },
      ]
    );
  };

  const handleVideoCaptured = async (uri, videoType) => {
    const isHouse = videoType === 'house';
    if (isHouse) {
      setData(d => ({ ...d, houseVideoUri: uri, houseVideoUploaded: false }));
    } else {
      setData(d => ({ ...d, videoUri: uri, videoUploaded: false }));
    }

    if (!loanId) return;

    const setUploading = isHouse ? setHouseUploading : setOwnerUploading;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('video', {
        uri,
        name: isHouse ? 'house_video.mp4' : 'owner_video.mp4',
        type: 'video/mp4',
      });
      fd.append('videoType', videoType);
      await uploadVideo(loanId, fd);
      if (isHouse) {
        setData(d => ({ ...d, houseVideoUploaded: true }));
      } else {
        setData(d => ({ ...d, videoUploaded: true }));
      }
    } catch {
      Alert.alert('Upload notice', 'Video saved locally. Will retry on next step or submit.');
    } finally {
      setUploading(false);
    }
  };

  const removeVideo = (videoType) => {
    if (videoType === 'house') {
      setData(d => ({ ...d, houseVideoUri: null, houseVideoUploaded: false }));
    } else {
      setData(d => ({ ...d, videoUri: null, videoUploaded: false }));
    }
  };

  return (
    <View style={{ paddingHorizontal: 19 }}>
      <SectionTitle title="Owner Details" />

      <FieldLabel text="Owner Name" required />
      <StyledInput value={data.ownerName} onChangeText={v => setData(d => ({ ...d, ownerName: v }))} placeholder="Full name" />

      <FieldLabel text="Owner Mobile" required />
      <StyledInput value={data.ownerMobile} onChangeText={v => setData(d => ({ ...d, ownerMobile: v }))} placeholder="9876543210" keyboardType="phone-pad" />

      <FieldLabel text="Owner Email (optional)" />
      <StyledInput value={data.ownerEmail} onChangeText={v => setData(d => ({ ...d, ownerEmail: v }))} placeholder="owner@email.com" keyboardType="email-address" />

      <FieldLabel text="Owner Aadhaar Number" required />
      <StyledInput value={data.aadhaar} onChangeText={v => setData(d => ({ ...d, aadhaar: v }))} placeholder="12-digit Aadhaar" keyboardType="numeric" />

      <FieldLabel text="Spouse Name (Husband/Wife)" required />
      <StyledInput value={data.spouseName} onChangeText={v => setData(d => ({ ...d, spouseName: v }))} placeholder="Full name of spouse" />
      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>Required — same as on KYC / bank records.</Text>

      <FieldLabel text="Family Occupation" required />
      <StyledInput value={data.familyOccupation} onChangeText={v => setData(d => ({ ...d, familyOccupation: v }))} placeholder="e.g. Farming, Business, Service" />

      <FieldLabel text="Monthly Income (₹)" required />
      <StyledInput value={data.monthlyIncome} onChangeText={v => setData(d => ({ ...d, monthlyIncome: v }))} placeholder="e.g. 60000" keyboardType="numeric" />

      {/* Bank Details */}
      <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, padding: 14, marginTop: 18, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.dark, marginBottom: 2 }}>Bank Details</Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Required — disbursement is credited to this account.</Text>

        <FieldLabel text="IFSC Code" required />
        <StyledInput
          value={data.ifsc}
          onChangeText={v => {
            const val = v.toUpperCase();
            setData(d => ({ ...d, ifsc: val }));
            fetchBankFromIFSC(val);
          }}
          placeholder="e.g. HDFC0000003"
        />

        <FieldLabel text="Bank Name" required />
        <StyledInput value={data.bankName} onChangeText={v => setData(d => ({ ...d, bankName: v }))} placeholder="Auto-filled from IFSC" editable={!ifscLoading} loading={ifscLoading} />
        {ifscLoading && <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>Fetching bank details...</Text>}
        {data.bankName && !ifscLoading && <Text style={{ fontSize: 11, color: colors.success, marginTop: 3 }}>✓ Bank details fetched</Text>}

        <FieldLabel text="Account Holder Name" required />
        <StyledInput value={data.accountHolder} onChangeText={v => setData(d => ({ ...d, accountHolder: v }))} placeholder="As per bank records" />

        <FieldLabel text="Account Number" required />
        <StyledInput value={data.accountNumber} onChangeText={v => setData(d => ({ ...d, accountNumber: v }))} placeholder="Account number" keyboardType="numeric" />
      </View>

      <FieldLabel text="Owner Address" required />
      <StyledInput value={data.ownerAddress} onChangeText={v => setData(d => ({ ...d, ownerAddress: v }))} placeholder="Full residential address" multiline />

      {/* Video 1: Owner Verification Video */}
      <VideoSectionCard
        title="Owner Verification Video"
        required
        description="Record the owner stating their name, property details, and loan purpose. Max 60 seconds."
        videoUri={data.videoUri}
        videoUploaded={data.videoUploaded}
        player={ownerPlayer}
        onRecordOrPick={() => pickVideo('owner')}
        onRemove={() => removeVideo('owner')}
        uploading={ownerUploading}
        uploadLabel={data.videoUri ? 'Re-record / replace owner video' : 'Record owner verification video'}
      />

      {/* Video 2: House / Property Video */}
      <VideoSectionCard
        title="House / Property Video"
        required
        description="Record or upload a video walkthrough of the house / property (exterior & interior). Max 60 seconds."
        videoUri={data.houseVideoUri}
        videoUploaded={data.houseVideoUploaded}
        player={housePlayer}
        onRecordOrPick={() => pickVideo('house')}
        onRemove={() => removeVideo('house')}
        uploading={houseUploading}
        uploadLabel={data.houseVideoUri ? 'Re-record / replace house video' : 'Record house walkthrough video'}
      />
    </View>
  );
}
const vid = StyleSheet.create({
  card: { marginTop: 18, marginBottom: 8, backgroundColor: colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 16 },
  badgeUploaded: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeUploadedText: { fontSize: 11, fontWeight: '600', color: colors.success },
  playerWrapper: { marginTop: 6, marginBottom: 4 },
  previewHint: { fontSize: 12, color: colors.muted, marginBottom: 6 },
  player: { width: '100%', height: 210, borderRadius: 10, backgroundColor: '#000', marginBottom: 10 },
  previewActions: { flexDirection: 'row', gap: 10 },
  replaceBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg },
  replaceBtnText: { fontSize: 12, fontWeight: '600', color: colors.dark },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FEE2E2', backgroundColor: '#FEF2F2' },
  removeBtnText: { fontSize: 12, fontWeight: '600', color: colors.error },
  btn: { borderWidth: 1.5, borderColor: colors.dark, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 20, paddingHorizontal: 16, alignItems: 'center', backgroundColor: colors.inputBg, marginTop: 4 },
  inner: { alignItems: 'center', gap: 8 },
  text: { fontSize: 13, color: colors.dark, fontWeight: '600', textAlign: 'center' },
});

// ─── STANDARD PROPERTY DOCS LIST ─────────────────────────────────────────────
const STANDARD_PROPERTY_DOCS = [
  { id: 'registry_1', type: 'Property Registery - 1', title: 'Property Registery - 1', subtitle: 'Primary Property Registry' },
  { id: 'registry_2', type: 'Registery - 2', title: 'Registery - 2', subtitle: 'Secondary Property Registry' },
  { id: 'registry_3', type: 'Registery - 3', title: 'Registery - 3', subtitle: 'Tertiary Property Registry' },
  { id: 'gift_deed', type: 'Gift Deed', title: 'Gift Deed', subtitle: 'Property Transfer / Gift Deed' },
  { id: 'khasara', type: 'Khasara / Khatoni', title: 'Khasara / Khatoni', subtitle: 'Land Record Document' },
  { id: 'farat', type: 'Farat', title: 'Farat', subtitle: 'Land Rights Document' },
];

// ─── STEP 2: Property Details ──────────────────────────────────────────────────
function Step2({ data, setData, loanId }) {
  const [locLoading, setLocLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);

  // Document upload modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState('Property Registery - 1');
  const [docNameInput, setDocNameInput] = useState('');
  const [pickedAsset, setPickedAsset] = useState(null);

  // Remove photo/video
  const removePhoto = (uri) =>
    setData(d => ({ ...d, propertyPhotos: d.propertyPhotos.filter(p => p.uri !== uri) }));

  // ActionSheet — Cancel / Photo Library / Camera
  const showPhotoOptions = () => {
    Alert.alert(
      'Property photos',
      'Take a new photo or choose from your library (you can select several).',
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'PHOTO LIBRARY',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission needed'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              allowsMultipleSelection: true,
              quality: 0.8,
            });
            if (result.canceled || !result.assets?.length) return;
            const newItems = result.assets.map(a => ({ uri: a.uri, type: a.type || 'image' }));
            const allPhotos = [...(data.propertyPhotos || []), ...newItems].slice(0, 15);
            setData(d => ({ ...d, propertyPhotos: allPhotos }));
            if (!loanId) return;
            setPhotoUploading(true);
            try {
              const fd = new FormData();
              newItems.forEach((item, i) => fd.append('photos', { uri: item.uri, name: `photo_${Date.now()}_${i}.jpg`, type: 'image/jpeg' }));
              await uploadPropertyPhotos(loanId, fd);
            } catch {
              Alert.alert('Upload notice', 'Photos saved locally. Will retry on submit.');
            } finally { setPhotoUploading(false); }
          }
        },
        {
          text: 'CAMERA',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission needed'); return; }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              quality: 0.8,
              videoMaxDuration: 120,
            });
            if (result.canceled || !result.assets?.[0]) return;
            const newItem = { uri: result.assets[0].uri, type: result.assets[0].type || 'image' };
            setData(d => ({ ...d, propertyPhotos: [...(d.propertyPhotos || []), newItem].slice(0, 15) }));
          }
        },
      ]
    );
  };

  const captureLocation = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission denied'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      const address = [geo.name, geo.street, geo.district, geo.city, geo.postalCode].filter(Boolean).join(', ');
      const now = new Date();
      const dateStr = formatDate(now);
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      setData(d => ({
        ...d,
        geoLat: loc.coords.latitude.toFixed(4),
        geoLng: loc.coords.longitude.toFixed(4),
        geoAddress: address,
        geoDate: `${dateStr}, ${timeStr}`,
      }));
    } catch { Alert.alert('Error', 'Could not get location.'); }
    finally { setLocLoading(false); }
  };

  // Open Document handler with local file sharing support
  const openDoc = async (uri) => {
    if (!uri) return;
    try {
      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        await Linking.openURL(uri);
      } else {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri);
        } else {
          await Linking.openURL(uri);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open document preview.');
    }
  };

  const openUploadModal = (docType) => {
    setSelectedDocType(docType || 'Custom Document');
    setDocNameInput(docType || '');
    setPickedAsset(null);
    setModalVisible(true);
  };

  const chooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPickedAsset(asset);
    if (!docNameInput.trim()) {
      setDocNameInput(asset.name || selectedDocType);
    }
  };

  const handleModalUpload = async () => {
    if (!pickedAsset) {
      Alert.alert('Required', 'Please pick a file to upload.');
      return;
    }
    const finalName = docNameInput.trim() || pickedAsset.name || selectedDocType;
    const newDoc = {
      id: Date.now().toString(),
      uri: pickedAsset.uri,
      name: finalName,
      docType: selectedDocType,
      date: formatDate(new Date()),
      uploaded: false,
      mimeType: pickedAsset.mimeType || 'application/pdf',
    };

    // Filter existing matching standard doc or append new doc
    setData(d => {
      const existingDocs = d.propertyDocs || [];
      const updated = selectedDocType === 'Custom Document'
        ? [...existingDocs, newDoc]
        : [...existingDocs.filter(doc => doc.docType !== selectedDocType && doc.name !== selectedDocType), newDoc];
      return { ...d, propertyDocs: updated };
    });

    setModalVisible(false);

    if (!loanId) return;
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append('document', { uri: pickedAsset.uri, name: pickedAsset.name || 'document', type: pickedAsset.mimeType || 'application/pdf' });
      fd.append('docType', selectedDocType);
      fd.append('name', finalName);
      fd.append('date', newDoc.date);
      await uploadRegistryDocument(loanId, fd);
      setData(d => ({
        ...d,
        propertyDocs: (d.propertyDocs || []).map(d2 => d2.id === newDoc.id ? { ...d2, uploaded: true } : d2)
      }));
    } catch {
      Alert.alert('Upload notice', 'Document saved locally. Will retry on submit.');
    } finally {
      setDocUploading(false);
    }
  };

  const removeDoc = (id) => setData(d => ({ ...d, propertyDocs: (d.propertyDocs || []).filter(doc => doc.id !== id) }));

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionTitle title="Property Details" />

      {/* ── Property Photos ── */}
      <FieldLabel text="Property photos" required />
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 6 }}>
        Add multiple angles of the property (max 15 total).
      </Text>

      {/* Status line */}
      {(data.propertyPhotos || []).length > 0 && (
        <Text style={{ fontSize: 13, color: colors.dark, fontWeight: '600', marginBottom: 4 }}>
          {data.propertyPhotos.length} photo/video saved — add more below or continue.
        </Text>
      )}
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>
        Tap a thumbnail to confirm it looks correct.
      </Text>

      {/* Main Add Button */}
      <TouchableOpacity style={ph.addBox} onPress={showPhotoOptions}>
        <Ionicons name="images-outline" size={28} color={colors.dark} />
        <Text style={ph.addText}>Add property photos{'\n'}(camera or library)</Text>
      </TouchableOpacity>

      {/* Thumbnails + Add More */}
      {(data.propertyPhotos || []).length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {data.propertyPhotos.map((item, i) => (
            <View key={i} style={ph.thumb}>
              <View style={ph.thumbBox}>
                <Ionicons
                  name={item.type === 'video' ? 'videocam' : 'image'}
                  size={24} color={colors.muted}
                />
              </View>
              <TouchableOpacity style={ph.del} onPress={() => removePhoto(item.uri)}>
                <Ionicons name="close-circle" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}
          {/* Add more thumbnail button */}
          <TouchableOpacity
            style={[ph.thumbBox, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dark }]}
            onPress={showPhotoOptions}
          >
            <Ionicons name="add" size={24} color={colors.dark} />
          </TouchableOpacity>
        </View>
      )}
      {photoUploading && <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>Uploading...</Text>}

      {/* ── Standard Property Documents (Non-essential/Optional) ── */}
      <FieldLabel text="Standard Property Documents — optional" />
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>
        Upload any available property documents. All items below are non-essential.
      </Text>

      <View style={stdS.container}>
        {STANDARD_PROPERTY_DOCS.map((std) => {
          const uploadedDoc = (data.propertyDocs || []).find(
            (d) => d.docType === std.type || d.name?.toLowerCase() === std.title.toLowerCase()
          );
          return (
            <View key={std.id} style={stdS.card}>
              <View style={stdS.info}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons
                    name={uploadedDoc ? "checkmark-circle" : "document-text-outline"}
                    size={20}
                    color={uploadedDoc ? colors.success : colors.dark}
                  />
                  <Text style={stdS.title}>{std.title}</Text>
                </View>
                <Text style={stdS.subtitle}>{std.subtitle}</Text>
                {uploadedDoc && (
                  <Text style={stdS.fileName} numberOfLines={1}>
                    Named: {uploadedDoc.name} {uploadedDoc.uploaded ? '✓' : '(local)'}
                  </Text>
                )}
              </View>
              <View style={stdS.actions}>
                {uploadedDoc ? (
                  <>
                    <TouchableOpacity style={stdS.viewBtn} onPress={() => openDoc(uploadedDoc.uri)}>
                      <Ionicons name="eye-outline" size={15} color={colors.primary} />
                      <Text style={stdS.viewTxt}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={stdS.removeBtn} onPress={() => removeDoc(uploadedDoc.id)}>
                      <Ionicons name="trash-outline" size={15} color={colors.error} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={stdS.uploadBtn} onPress={() => openUploadModal(std.type)} disabled={docUploading}>
                    <Ionicons name="cloud-upload-outline" size={15} color={colors.white} />
                    <Text style={stdS.uploadTxt}>Upload</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Custom / Additional Property Documents ── */}
      <FieldLabel text="Additional Documents — optional" />
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
        Upload electricity bill, tax receipts, or custom papers.
      </Text>

      <TouchableOpacity style={docS.uploadBtn} onPress={() => openUploadModal('Custom Document')} disabled={docUploading}>
        {docUploading
          ? <ActivityIndicator color={colors.white} size="small" />
          : <Ionicons name="add-circle-outline" size={20} color={colors.white} />}
        <Text style={docS.uploadTxt}>
          {docUploading ? 'Uploading...' : '+ Add Other Document'}
        </Text>
      </TouchableOpacity>

      {/* Render Custom Documents List */}
      {(data.propertyDocs || []).filter(d => !STANDARD_PROPERTY_DOCS.some(std => std.type === d.docType || std.title.toLowerCase() === d.name?.toLowerCase())).map(doc => (
        <View key={doc.id} style={docS.row}>
          <Ionicons name="document-text-outline" size={20} color={colors.dark} />
          <View style={{ flex: 1 }}>
            <Text style={docS.name} numberOfLines={1}>{doc.name}</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>{doc.docType || 'Custom Document'}</Text>
          </View>
          {doc.uploaded && <Ionicons name="checkmark-circle" size={16} color={colors.success} />}
          <TouchableOpacity onPress={() => openDoc(doc.uri)} style={{ paddingHorizontal: 6 }}>
            <Ionicons name="eye-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => removeDoc(doc.id)} style={{ paddingHorizontal: 6 }}>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>
      ))}

      {/* ── Property Area ── */}
      <FieldLabel text="Property Area (sq. m)" required />
      <StyledInput value={data.propertyArea} onChangeText={v => setData(d => ({ ...d, propertyArea: v }))} placeholder="e.g. 250" keyboardType="numeric" />

      {/* ── Market Value ── */}
      <FieldLabel text="Market Value (₹)" required />
      <StyledInput value={data.marketValue} onChangeText={v => setData(d => ({ ...d, marketValue: v }))} placeholder="e.g. 1000000" keyboardType="numeric" />

      {/* ── Descendants ── */}
      <FieldLabel text="Transferred to Descendant (Count)" required />
      <StyledInput value={data.descendantCount} onChangeText={v => setData(d => ({ ...d, descendantCount: v }))} placeholder="e.g. 2" keyboardType="numeric" />

      {/* ── Other Loan ── */}
      <FieldLabel text="Any Other Loan on This Property?" required />
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
        {['Yes', 'No'].map(opt => (
          <TouchableOpacity key={opt} style={[tog.btn, data.otherLoan === opt && tog.active]} onPress={() => setData(d => ({ ...d, otherLoan: opt }))}>
            <Text style={[tog.txt, data.otherLoan === opt && tog.txtActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {data.otherLoan === 'Yes' && (
        <>
          <FieldLabel text="Remark" required />
          <StyledInput value={data.otherLoanDetails} onChangeText={v => setData(d => ({ ...d, otherLoanDetails: v }))} placeholder="Bank name, outstanding amount, EMI etc." multiline />
        </>
      )}

      {/* ── Property Address ── */}
      <FieldLabel text="Property Address" required />
      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>Auto-filled from geo location capture.</Text>
      <StyledInput value={data.geoAddress || ''} onChangeText={v => setData(d => ({ ...d, geoAddress: v }))} placeholder="Will be filled after geo capture" multiline />

      {/* ── Possession Status ── */}
      <FieldLabel text="Possession Status — optional" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        {['Self Occupied', 'Tenant Occupied', 'Vacant', 'Under Construction'].map(opt => (
          <TouchableOpacity key={opt} style={[chip.btn, data.possessionStatus === opt && chip.active]} onPress={() => setData(d => ({ ...d, possessionStatus: opt }))}>
            <Text style={[chip.txt, data.possessionStatus === opt && chip.txtActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Geo Location ── */}
      <FieldLabel text="Geo location" required />
      {data.geoLat ? (
        <View style={geo.box}>
          <Ionicons name="location" size={18} color={colors.dark} />
          <View style={{ flex: 1 }}>
            <Text style={geo.coords}>Captured: {data.geoLat}, {data.geoLng}</Text>
            <Text style={geo.date}>{data.geoDate}</Text>
          </View>
          <TouchableOpacity onPress={captureLocation}>
            <Text style={{ fontSize: 12, color: colors.dark, fontWeight: '600' }}>Re-capture</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={geo.captureBtn} onPress={captureLocation} disabled={locLoading}>
          {locLoading
            ? <ActivityIndicator color={colors.white} size="small" />
            : <><Ionicons name="location-outline" size={20} color={colors.white} /><Text style={geo.captureTxt}>Capture Geo Location</Text></>}
        </TouchableOpacity>
      )}

      {/* ── Document Upload Modal with Naming Field ── */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={stdS.modalOverlay}>
          <View style={stdS.modalContent}>
            <View style={stdS.modalHeader}>
              <Text style={stdS.modalTitle}>Upload Document</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={stdS.modalLabel}>Document Category:</Text>
            <View style={stdS.categoryBadge}>
              <Text style={stdS.categoryBadgeTxt}>{selectedDocType}</Text>
            </View>

            <Text style={stdS.modalLabel}>Document Name / Title:</Text>
            <TextInput
              style={stdS.modalInput}
              value={docNameInput}
              onChangeText={setDocNameInput}
              placeholder="e.g. Property Registry 1"
              placeholderTextColor={colors.muted}
            />

            <Text style={stdS.modalLabel}>Select File (PDF or Image):</Text>
            <TouchableOpacity style={stdS.filePickerBtn} onPress={chooseFile}>
              <Ionicons name="attach" size={20} color={colors.dark} />
              <Text style={stdS.filePickerTxt} numberOfLines={1}>
                {pickedAsset ? pickedAsset.name : 'Tap to choose file from device'}
              </Text>
            </TouchableOpacity>

            <View style={stdS.modalActions}>
              <TouchableOpacity style={stdS.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={stdS.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={stdS.modalSubmitBtn} onPress={handleModalUpload}>
                <Text style={stdS.modalSubmitTxt}>Save Document</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles for Step2 ──
const ph = StyleSheet.create({
  addBox: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dark, borderRadius: 10, paddingVertical: 20, alignItems: 'center', gap: 8, backgroundColor: colors.white },
  addText: { fontSize: 12, color: colors.dark, textAlign: 'center', fontWeight: '600' },
  thumb: { position: 'relative' },
  thumbBox: { width: 70, height: 70, backgroundColor: colors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  del: { position: 'absolute', top: -6, right: -6 },
});
const tog = StyleSheet.create({
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.white },
  active: { backgroundColor: colors.dark, borderColor: colors.dark },
  txt: { fontSize: 14, fontWeight: '600', color: colors.text },
  txtActive: { color: colors.white },
});
const chip = StyleSheet.create({
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  active: { backgroundColor: colors.dark, borderColor: colors.dark },
  txt: { fontSize: 13, color: colors.text },
  txtActive: { color: colors.white },
});
const geo = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EAF2EA', borderRadius: 10, padding: 12, marginBottom: 4 },
  coords: { fontSize: 13, fontWeight: '700', color: colors.dark },
  date: { fontSize: 11, color: colors.muted, marginTop: 2 },
  captureBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.dark, borderRadius: 10, paddingVertical: 14 },
  captureTxt: { fontSize: 14, fontWeight: '700', color: colors.white },
});
const docS = StyleSheet.create({
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.dark, borderRadius: 10, paddingVertical: 14, marginBottom: 10 },
  uploadTxt: { fontSize: 14, fontWeight: '700', color: colors.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.inputBg, borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
  name: { flex: 1, fontSize: 13, color: colors.text },
  previewBox: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingVertical: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, marginBottom: 10, gap: 8 },
  previewTxt: { fontSize: 13, color: colors.muted },
});

const stdS = StyleSheet.create({
  container: { marginBottom: 16 },
  card: { backgroundColor: colors.white, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  info: { flex: 1, paddingRight: 8 },
  title: { fontSize: 13, fontWeight: '700', color: colors.dark },
  subtitle: { fontSize: 11, color: colors.muted, marginTop: 2 },
  fileName: { fontSize: 11, color: colors.primary, marginTop: 4, fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.dark, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  uploadTxt: { fontSize: 12, color: colors.white, fontWeight: '600' },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  viewTxt: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  removeBtn: { padding: 8, borderRadius: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FEE2E2' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.white, borderRadius: 16, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.dark },
  modalLabel: { fontSize: 12, fontWeight: '600', color: colors.text, marginTop: 10, marginBottom: 4 },
  categoryBadge: { backgroundColor: colors.inputBg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  categoryBadgeTxt: { fontSize: 13, fontWeight: '600', color: colors.dark },
  modalInput: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text },
  filePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inputBg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dark, borderRadius: 8, padding: 12 },
  filePickerTxt: { fontSize: 12, color: colors.dark, flex: 1 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelTxt: { fontSize: 13, fontWeight: '600', color: colors.text },
  modalSubmitBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.dark, alignItems: 'center' },
  modalSubmitTxt: { fontSize: 13, fontWeight: '600', color: colors.white },
});
// const ph = StyleSheet.create({
//   addBox: { width: 150, height: 100, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dark, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 4 },
//   addText: { fontSize: 11, color: colors.dark, textAlign: 'center' },
//   thumb: { position: 'relative' },
//   del: { position: 'absolute', top: -6, right: -6 },
// });
// const tog = StyleSheet.create({
//   btn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.white },
//   active: { backgroundColor: colors.dark, borderColor: colors.dark },
//   txt: { fontSize: 14, fontWeight: '600', color: colors.text },
//   txtActive: { color: colors.white },
// });
// const chip = StyleSheet.create({
//   btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
//   active: { backgroundColor: colors.dark, borderColor: colors.dark },
//   txt: { fontSize: 13, color: colors.text },
//   txtActive: { color: colors.white },
// });
// const geo = StyleSheet.create({
//   box: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EAF2EA', borderRadius: 10, padding: 12, marginBottom: 4 },
//   coords: { fontSize: 13, fontWeight: '700', color: colors.dark },
//   date: { fontSize: 11, color: colors.muted, marginTop: 2 },
//   captureBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.dark, borderRadius: 10, paddingVertical: 14 },
//   captureTxt: { fontSize: 14, fontWeight: '700', color: colors.white },
// });
// const docS = StyleSheet.create({
//   uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.dark, borderRadius: 10, paddingVertical: 14, marginBottom: 10 },
//   uploadTxt: { fontSize: 14, fontWeight: '700', color: colors.white },
//   row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.inputBg, borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
//   name: { flex: 1, fontSize: 13, color: colors.text },
//   previewBox: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingVertical: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, marginBottom: 10, gap: 8 },
//   previewTxt: { fontSize: 13, color: colors.muted },
// });

// ─── STEP 3: Loan Details ──────────────────────────────────────────────────────
function Step3({ data, setData }) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionTitle title="Loan Details" />

      <FieldLabel text="Requested Loan Amount (₹)" required />
      <StyledInput
        value={data.loanAmount}
        onChangeText={v => setData(d => ({ ...d, loanAmount: v }))}
        placeholder="e.g. 500000"
        keyboardType="numeric"
      />

      <FieldLabel text="Requested Loan Tenure (months)" />
      <StyledInput
        value={data.repaymentMonths}
        onChangeText={v => setData(d => ({ ...d, repaymentMonths: v }))}
        placeholder="e.g. 24"
        keyboardType="numeric"
      />

      <FieldLabel text="Purpose of Loan" />
      <StyledInput
        value={data.loanPurpose}
        onChangeText={v => setData(d => ({ ...d, loanPurpose: v }))}
        placeholder="e.g. Home renovation, Agriculture, Business"
        multiline
      />

      {/* Info box */}
      <View style={{ backgroundColor: colors.inputBg, borderRadius: 10, padding: 14, marginTop: 14, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
          Admin will set the approved amount, EMI, and repayment schedule after reviewing this application.
        </Text>
      </View>
    </View>
  );
}

// ─── STEP 4: Review & Submit ───────────────────────────────────────────────────
function Step4({ data }) {
  const Row = ({ label, value }) => (
    <View style={rv.row}>
      <Text style={rv.label}>{label}</Text>
      <Text style={rv.value}>{value || '—'}</Text>
    </View>
  );
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionTitle title="Review & Submit" />
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>Please verify all details before submitting.</Text>
      <View style={rv.card}>
        <Text style={rv.section}>Owner Details</Text>
        <Row label="Name" value={data.ownerName} />
        <Row label="Mobile" value={data.ownerMobile} />
        <Row label="Email" value={data.ownerEmail} />
        <Row label="Aadhaar" value={data.aadhaar} />
        <Row label="Spouse" value={data.spouseName} />
        <Row label="Occupation" value={data.familyOccupation} />
        <Row label="Monthly Income" value={data.monthlyIncome ? `₹${data.monthlyIncome}` : ''} />
        <Row label="Address" value={data.ownerAddress} />
        <Row label="Owner Video" value={data.videoUri ? '✓ Recorded' : 'Not recorded'} />
        <Row label="House Video" value={data.houseVideoUri ? '✓ Recorded' : 'Not recorded'} />
      </View>
      <View style={rv.card}>
        <Text style={rv.section}>Bank Details</Text>
        <Row label="IFSC" value={data.ifsc} />
        <Row label="Bank" value={data.bankName} />
        <Row label="Account Holder" value={data.accountHolder} />
        <Row label="Account No." value={data.accountNumber} />
      </View>
      <View style={rv.card}>
        <Text style={rv.section}>Property Details</Text>
        <Row label="Area" value={data.propertyArea ? `${data.propertyArea} sq.m` : ''} />
        <Row label="Market Value" value={data.marketValue ? `₹${data.marketValue}` : ''} />
        <Row label="Descendants" value={data.descendantCount} />
        <Row label="Other Loan" value={data.otherLoan} />
        {data.otherLoan === 'Yes' && <Row label="Loan Details" value={data.otherLoanDetails} />}
        <Row label="Possession" value={data.possessionStatus} />
        <Row label="Geo Location" value={data.geoLat ? `${data.geoLat}, ${data.geoLng}` : ''} />
        <Row label="Property Address" value={data.geoAddress} />
        <Row label="Photos" value={data.propertyPhotos?.length ? `${data.propertyPhotos.length} photo(s)` : ''} />
        <Row label="Documents" value={data.propertyDocs?.length ? `${data.propertyDocs.length} doc(s)` : ''} />
      </View>
      <View style={rv.card}>
        <Text style={rv.section}>Loan Details</Text>
        <Row label="Amount" value={data.loanAmount ? `₹${data.loanAmount}` : ''} />
        <Row label="Purpose" value={data.loanPurpose} />
        <Row label="Repayment" value={data.repaymentMonths ? `${data.repaymentMonths} months` : ''} />
        <Row label="Notes" value={data.notes} />
      </View>
    </View>
  );
}
const rv = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  section: { fontSize: 13, fontWeight: '700', color: colors.dark, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.inputBg },
  label: { fontSize: 13, color: colors.muted, flex: 1 },
  value: { fontSize: 13, color: colors.text, fontWeight: '500', flex: 1.5, textAlign: 'right' },
});

// ─── INITIAL FORM DATA ────────────────────────────────────────────────────────
const initialFormData = {
  ownerName: '',
  ownerMobile: '',
  ownerEmail: '',
  aadhaar: '',
  spouseName: '',
  familyOccupation: '',
  monthlyIncome: '',
  ifsc: '',
  bankName: '',
  accountHolder: '',
  accountNumber: '',
  ownerAddress: '',
  videoUri: null,
  videoUploaded: false,
  houseVideoUri: null,
  houseVideoUploaded: false,
  propertyPhotos: [],
  propertyArea: '',
  marketValue: '',
  descendantCount: '',
  otherLoan: 'No',
  otherLoanDetails: '',
  geoLat: '',
  geoLng: '',
  geoDate: '',
  geoAddress: '',
  possessionStatus: '',
  propertyDocs: [],
  loanAmount: '',
  loanPurpose: '',
  repaymentMonths: '',
  notes: '',
};

// ─── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function NewLoanScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { showAlert } = usePopup();
  const existingLoan = route.params?.existingLoan;
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loanId, setLoanId] = useState(existingLoan?.loanId || null);
  const scrollRef = useRef(null);

  const [formData, setFormData] = useState({
    ...initialFormData,
    ownerName: existingLoan?.ownerName || '', 
    ownerMobile: existingLoan?.ownerMobile || '', 
    ownerEmail: existingLoan?.ownerEmail || '', 
    aadhaar: existingLoan?.aadhaar || '',
    spouseName: existingLoan?.spouseName || '', 
    familyOccupation: existingLoan?.familyOccupation || '', 
    monthlyIncome: existingLoan?.monthlyIncome?.toString() || '',
    ifsc: existingLoan?.bankDetails?.ifsc || '', 
    bankName: existingLoan?.bankDetails?.bankName || '', 
    accountHolder: existingLoan?.bankDetails?.accountHolder || '', 
    accountNumber: existingLoan?.bankDetails?.accountNumber || '',
    ownerAddress: existingLoan?.ownerAddress || '', 
    videoUri: existingLoan?.videoUri || null, 
    videoUploaded: !!existingLoan?.videoUri,
    houseVideoUri: existingLoan?.houseVideoUri || null,
    houseVideoUploaded: !!existingLoan?.houseVideoUri,
    propertyPhotos: existingLoan?.propertyPhotos || [], 
    propertyArea: existingLoan?.propertyArea?.toString() || '', 
    marketValue: existingLoan?.marketValue?.toString() || '',
    descendantCount: existingLoan?.descendantCount?.toString() || '', 
    otherLoan: existingLoan?.otherLoan ? 'Yes' : 'No', 
    otherLoanDetails: existingLoan?.otherLoanDetails || '',
    geoLat: existingLoan?.geoLocation?.lat || '', 
    geoLng: existingLoan?.geoLocation?.lng || '', 
    geoDate: '', 
    geoAddress: existingLoan?.propertyAddress || '',
    possessionStatus: existingLoan?.possessionStatus || '', 
    propertyDocs: existingLoan?.propertyDocs || [],
    loanAmount: existingLoan?.loanAmount?.toString() || '', 
    loanPurpose: existingLoan?.loanPurpose || '', 
    repaymentMonths: existingLoan?.repaymentMonths?.toString() || '', 
    notes: existingLoan?.notes || '',
  });

  const hasFilledData = () => {
    return (
      !!formData.ownerName?.trim() ||
      !!formData.ownerMobile?.trim() ||
      !!formData.aadhaar?.trim() ||
      !!formData.videoUri ||
      !!formData.houseVideoUri ||
      (formData.propertyPhotos && formData.propertyPhotos.length > 0) ||
      !!formData.propertyArea?.trim() ||
      !!formData.loanAmount?.trim()
    );
  };

  const handleRefreshConfirm = () => {
    if (!hasFilledData()) {
      showAlert('Form is Empty', 'No data has been entered yet to reset.');
      return;
    }
    showAlert(
      'Reset Form?',
      'Are you sure you want to clear all filled data? All unsaved information will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Clear Data',
          style: 'destructive',
          onPress: () => {
            setFormData(initialFormData);
            setStep(0);
            setLoanId(null);
            showAlert('Cleared', 'Form data has been cleared.');
          },
        },
      ]
    );
  };

  const handleBackConfirm = () => {
    if (step > 0) {
      setStep(s => s - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else if (hasFilledData()) {
      showAlert(
        'Discard Application?',
        'You have unsaved form data. Are you sure you want to go back and discard it?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard & Exit',
            style: 'destructive',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  useEffect(() => {
    const onHardwareBack = () => {
      handleBackConfirm();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [step, formData]);

  const handleNext = async () => {
    setLoading(true);
    try {
      let currentLoanId = loanId;
      if (!currentLoanId) {
        const loan = await createLoan();
        currentLoanId = loan.loanId;
        setLoanId(currentLoanId);
      }
      if (step === 0) {
        await updateLoan(currentLoanId, {
          ownerName: formData.ownerName, ownerMobile: formData.ownerMobile,
          ownerEmail: formData.ownerEmail, aadhaar: formData.aadhaar,
          spouseName: formData.spouseName, familyOccupation: formData.familyOccupation,
          monthlyIncome: Number(formData.monthlyIncome),
          bankDetails: { ifsc: formData.ifsc, bankName: formData.bankName, accountHolder: formData.accountHolder, accountNumber: formData.accountNumber },
          ownerAddress: formData.ownerAddress,
        });

        // Upload Owner Video if pending
        if (formData.videoUri && !formData.videoUploaded) {
          try {
            const fd = new FormData();
            fd.append('video', { uri: formData.videoUri, name: 'owner_video.mp4', type: 'video/mp4' });
            fd.append('videoType', 'owner');
            await uploadVideo(currentLoanId, fd);
            setFormData(d => ({ ...d, videoUploaded: true }));
          } catch (vErr) {
            console.warn('Owner video upload error:', vErr);
            showAlert('Notice', 'Owner video saved locally. It will upload upon application submit.');
          }
        }

        // Upload House Video if pending
        if (formData.houseVideoUri && !formData.houseVideoUploaded) {
          try {
            const fdHouse = new FormData();
            fdHouse.append('video', { uri: formData.houseVideoUri, name: 'house_video.mp4', type: 'video/mp4' });
            fdHouse.append('videoType', 'house');
            await uploadVideo(currentLoanId, fdHouse);
            setFormData(d => ({ ...d, houseVideoUploaded: true }));
          } catch (hErr) {
            console.warn('House video upload error:', hErr);
            showAlert('Notice', 'House video saved locally. It will upload upon application submit.');
          }
        }
      }
      if (step === 1) {
        await updateLoan(currentLoanId, {
          propertyArea: Number(formData.propertyArea), marketValue: Number(formData.marketValue),
          descendantCount: Number(formData.descendantCount), otherLoan: formData.otherLoan === 'Yes',
          otherLoanDetails: formData.otherLoanDetails,
          geoLocation: { lat: formData.geoLat, lng: formData.geoLng },
          propertyAddress: formData.geoAddress, possessionStatus: formData.possessionStatus,
        });
      }
      if (step === 2) {
        await updateLoan(currentLoanId, {
          loanAmount: Number(formData.loanAmount), loanPurpose: formData.loanPurpose,
          repaymentMonths: Number(formData.repaymentMonths), notes: formData.notes,
        });
      }
      setStep(s => s + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Could not save. Please retry.');
    } finally { setLoading(false); }
  };

  const handleBack = () => {
    handleBackConfirm();
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Ensure pending videos are uploaded before final submit
      if (formData.videoUri && !formData.videoUploaded && loanId) {
        try {
          const fd = new FormData();
          fd.append('video', { uri: formData.videoUri, name: 'owner_video.mp4', type: 'video/mp4' });
          fd.append('videoType', 'owner');
          await uploadVideo(loanId, fd);
          setFormData(d => ({ ...d, videoUploaded: true }));
        } catch {}
      }
      if (formData.houseVideoUri && !formData.houseVideoUploaded && loanId) {
        try {
          const fdHouse = new FormData();
          fdHouse.append('video', { uri: formData.houseVideoUri, name: 'house_video.mp4', type: 'video/mp4' });
          fdHouse.append('videoType', 'house');
          await uploadVideo(loanId, fdHouse);
          setFormData(d => ({ ...d, houseVideoUploaded: true }));
        } catch {}
      }
      await submitLoan(loanId);
      showAlert('Submitted!', 'Loan application submitted successfully.');
      navigation.goBack();
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Could not submit loan.');
    } finally { setLoading(false); }
  };

  return (
    <View style={ms.safe}>
      <Header
        title="New Loan Application"
        onBack={handleBackConfirm}
        rightAction={
          <TouchableOpacity
            onPress={handleRefreshConfirm}
            style={ms.headerActionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Refresh and reset form"
          >
            <Ionicons name="refresh" size={20} color={colors.white} />
          </TouchableOpacity>
        }
      />

      <StepBar current={step} />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 40 }}
      >
        {step === 0 && <Step1 data={formData} setData={setFormData} loanId={loanId} />}
        {step === 1 && <Step2 data={formData} setData={setFormData} loanId={loanId} />}
        {step === 2 && <Step3 data={formData} setData={setFormData} />}
        {step === 3 && <Step4 data={formData} />}
      </ScrollView>

      {/* Footer — Back + Next/Submit side by side with Android navigation safe area */}
      <View style={[ms.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={ms.footerRow}>
          {step > 0 && (
            <TouchableOpacity style={ms.backBtnFooter} onPress={handleBack} disabled={loading}>
              <Text style={ms.backTxtFooter}>Back</Text>
            </TouchableOpacity>
          )}
          {step === 3 ? (
            <TouchableOpacity style={[ms.nextBtn, step > 0 && { flex: 1 }]} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.white} /> : <Text style={ms.nextTxt}>Submit Application</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[ms.nextBtn, step > 0 && { flex: 1 }]} onPress={handleNext} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.white} /> : <Text style={ms.nextTxt}>Next</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const ms = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.dark, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  headerActionBtn: { padding: 4, marginRight: 6 },
  backBtn: { padding: 2 },
  logoBox: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#D4AF37', fontWeight: '900', fontSize: 16 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.white },
  menuBtn: { padding: 2 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  footerRow: { flexDirection: 'row', gap: 10 },
  backBtnFooter: { flex: 1, borderWidth: 1, borderColor: colors.dark, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.white },
  backTxtFooter: { fontSize: 16, fontWeight: '700', color: colors.dark },
  nextBtn: { flex: 2, backgroundColor: colors.dark, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  nextTxt: { fontSize: 16, fontWeight: '700', color: colors.white },
  footer_credit: { textAlign: 'center', fontSize: 11, color: colors.muted, marginTop: 8 },
});