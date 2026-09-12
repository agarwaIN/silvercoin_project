import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Linking, BackHandler, Modal,
  Image, Platform,
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
  getLoanMediaPreview,
} from '../../api/employeeApi';
import { usePopup } from '../../context/PopupContext';
import Header from '../../components/Header';
import { formatDate } from '../../utils/date';
import { getStandardDocTitle } from '../../components/MediaViewer';

export function resolveMediaUri(raw) {
  if (!raw) return '';
  const s = typeof raw === 'object' && raw.uri ? raw.uri : String(raw);
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('file://') || s.startsWith('content://') || s.startsWith('data:')) {
    return s;
  }
  const clean = s.replace(/^\/+/, '');
  return `http://13.200.237.51:5000/api/files/download?key=${encodeURIComponent(clean)}`;
}

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
  const cleanText = text ? text.replace(/\s*[\(—\-]?\s*optional\s*\)?/i, '').trim() : '';
  return (
    <Text style={fl.label}>
      {cleanText}
      {required ? (
        <Text style={fl.star}> *</Text>
      ) : (
        <Text style={fl.optional}> (Optional)</Text>
      )}
    </Text>
  );
}
const fl = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500', color: colors.text, marginBottom: 6, marginTop: 14 },
  star: { color: colors.error, fontWeight: '700' },
  optional: { color: colors.muted, fontWeight: '400', fontSize: 11 },
});

function StyledInput({ value, onChangeText, placeholder, keyboardType, multiline, editable = true, loading, autoCapitalize }) {
  const isEmailOrPhone = keyboardType === 'email-address' || keyboardType === 'phone-pad' || keyboardType === 'numeric' || keyboardType === 'decimal-pad';
  const autoCap = autoCapitalize !== undefined
    ? autoCapitalize
    : (isEmailOrPhone ? 'none' : (multiline ? 'sentences' : 'words'));

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
        autoCapitalize={autoCap}
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
            {title} {required ? <Text style={{ color: colors.error, fontWeight: '700' }}>*</Text> : <Text style={{ color: colors.muted, fontWeight: '400', fontSize: 11 }}>(Optional)</Text>}
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

// Open Document handler with local file sharing support
const openDoc = async (uri) => {
  if (!uri) return;
  const resolved = resolveMediaUri(uri);
  try {
    if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
      await Linking.openURL(resolved);
    } else {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(resolved);
      } else {
        await Linking.openURL(resolved);
      }
    }
  } catch (err) {
    Alert.alert('Error', 'Could not open document preview.');
  }
};

// ─── STEP 1: Owner & Verification ─────────────────────────────────────────────
function Step1({ data, setData, loanId, setLoanId }) {
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

    let activeLoanId = loanId;
    if (!activeLoanId && setLoanId) {
      try {
        const created = await createLoan();
        activeLoanId = created.loanId;
        setLoanId(activeLoanId);
      } catch (cErr) {
        console.warn('Auto createLoan on video capture failed:', cErr);
      }
    }

    if (!activeLoanId) return;

    const setUploading = isHouse ? setHouseUploading : setOwnerUploading;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('videoType', videoType);
      fd.append('name', isHouse ? 'House / Property Video' : 'Owner Verification Video');
      fd.append('video', {
        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
        name: isHouse ? 'house_video.mp4' : 'owner_video.mp4',
        type: 'video/mp4',
      });
      await uploadVideo(activeLoanId, fd, videoType, isHouse ? 'House / Property Video' : 'Owner Verification Video');
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
      <StyledInput value={data.ownerName} onChangeText={v => setData(d => ({ ...d, ownerName: v }))} placeholder="Enter Full Name" />

      <FieldLabel text="Owner Mobile" required />
      <StyledInput value={data.ownerMobile} onChangeText={v => setData(d => ({ ...d, ownerMobile: v }))} placeholder="Enter 10-Digit Mobile Number" keyboardType="phone-pad" />

      <FieldLabel text="Owner Email" />
      <StyledInput value={data.ownerEmail} onChangeText={v => setData(d => ({ ...d, ownerEmail: v }))} placeholder="Enter Email Address (Optional)" keyboardType="email-address" />

      <FieldLabel text="Owner Aadhaar Number" required />
      <StyledInput value={data.aadhaar} onChangeText={v => setData(d => ({ ...d, aadhaar: v }))} placeholder="Enter 12-Digit Aadhaar Number" keyboardType="numeric" />

      <FieldLabel text="Spouse Name (Husband/Wife)" required />
      <StyledInput value={data.spouseName} onChangeText={v => setData(d => ({ ...d, spouseName: v }))} placeholder="Enter Spouse Full Name" />
      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>Required — same as on KYC / bank records.</Text>

      <FieldLabel text="Family Occupation" required />
      <StyledInput value={data.familyOccupation} onChangeText={v => setData(d => ({ ...d, familyOccupation: v }))} placeholder="Enter Family Occupation" />

      <FieldLabel text="Monthly Income (₹)" required />
      <StyledInput value={data.monthlyIncome} onChangeText={v => setData(d => ({ ...d, monthlyIncome: v }))} placeholder="Enter Monthly Income (₹)" keyboardType="numeric" />

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
          placeholder="Enter 11-Character IFSC Code"
        />

        <FieldLabel text="Bank Name" required />
        <StyledInput value={data.bankName} onChangeText={v => setData(d => ({ ...d, bankName: v }))} placeholder="Auto-Filled From IFSC" editable={!ifscLoading} loading={ifscLoading} />
        {ifscLoading && <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>Fetching bank details...</Text>}
        {data.bankName && !ifscLoading && <Text style={{ fontSize: 11, color: colors.success, marginTop: 3 }}>✓ Bank details fetched</Text>}

        <FieldLabel text="Account Holder Name" required />
        <StyledInput value={data.accountHolder} onChangeText={v => setData(d => ({ ...d, accountHolder: v }))} placeholder="Enter Account Holder Name" />

        <FieldLabel text="Account Number" required />
        <StyledInput value={data.accountNumber} onChangeText={v => setData(d => ({ ...d, accountNumber: v }))} placeholder="Enter Bank Account Number" keyboardType="numeric" />

        {/* Bank Details Remark */}
        <FieldLabel text="Bank Details Remark" />
        <StyledInput
          value={data.bankRemark}
          onChangeText={v => setData(d => ({ ...d, bankRemark: v }))}
          placeholder="Enter Remarks For Bank Details (Optional)"
          multiline
        />
      </View>

      <FieldLabel text="Owner Residential Address" required />
      <StyledInput value={data.ownerAddress} onChangeText={v => setData(d => ({ ...d, ownerAddress: v }))} placeholder="Enter Full Residential Address" multiline />

      {/* Owner Details Remark */}
      <FieldLabel text="Owner Details Remark" />
      <StyledInput
        value={data.ownerRemark}
        onChangeText={v => setData(d => ({ ...d, ownerRemark: v }))}
        placeholder="Enter Remarks For Owner Details (Optional)"
        multiline
      />

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
        uploadLabel={data.videoUri ? 'Re-Record / Replace Owner Video' : 'Record Owner Verification Video'}
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
        uploadLabel={data.houseVideoUri ? 'Re-Record / Replace House Video' : 'Record House Walkthrough Video'}
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
  { id: 'registry_1', type: 'Property Registry - 1', title: 'Property Registry - 1', subtitle: 'Primary Property Registry' },
  { id: 'registry_2', type: 'Property Registry - 2', title: 'Property Registry - 2', subtitle: 'Secondary Property Registry' },
  { id: 'registry_3', type: 'Property Registry - 3', title: 'Property Registry - 3', subtitle: 'Tertiary Property Registry' },
  { id: 'gift_deed', type: 'Gift Deed', title: 'Gift Deed', subtitle: 'Property Transfer / Gift Deed' },
  { id: 'khasara', type: 'Khasara / Khatoni', title: 'Khasara / Khatoni', subtitle: 'Land Record Document' },
  { id: 'farat', type: 'Farat', title: 'Farat', subtitle: 'Land Rights Document' },
];

// ─── STEP 2: Property Details ──────────────────────────────────────────────────
function Step2({ data, setData, loanId, setLoanId }) {
  const [locLoading, setLocLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);

  // Document upload modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState('Property Registry - 1');
  const [docNameInput, setDocNameInput] = useState('');
  const [pickedAsset, setPickedAsset] = useState(null);

  // Remove photo/video
  const removePhoto = (uri) =>
    setData(d => ({ ...d, propertyPhotos: d.propertyPhotos.filter(p => p.uri !== uri) }));

  // ActionSheet — Cancel / Photo Library / Camera
  const showPhotoOptions = () => {
    Alert.alert(
      'Property Photos',
      'Take a new photo or choose from your library (you can select several).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Photo Library',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission Needed', 'Allow gallery access to select photos.'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              allowsMultipleSelection: true,
              quality: 0.8,
            });
            if (result.canceled || !result.assets?.length) return;
            const newItems = result.assets.map(a => ({
              uri: a.uri,
              localUri: a.uri,
              type: a.type || 'image',
              uploaded: false,
            }));
            const allPhotos = [...(data.propertyPhotos || []), ...newItems].slice(0, 15);
            setData(d => ({ ...d, propertyPhotos: allPhotos }));

            let activeLoanId = loanId;
            if (!activeLoanId && setLoanId) {
              try {
                const created = await createLoan();
                activeLoanId = created.loanId;
                setLoanId(activeLoanId);
              } catch (cErr) {
                console.warn('Auto createLoan on photo upload failed:', cErr);
              }
            }

            if (!activeLoanId) return;
            setPhotoUploading(true);
            try {
              const fd = new FormData();
              newItems.forEach((item, i) => {
                const isVid = item.type === 'video' || (item.uri && (item.uri.toLowerCase().endsWith('.mp4') || item.uri.toLowerCase().endsWith('.mov')));
                fd.append('photos', {
                  uri: Platform.OS === 'android' ? item.uri : item.uri.replace('file://', ''),
                  name: isVid ? `photo_vid_${Date.now()}_${i}.mp4` : `photo_${Date.now()}_${i}.jpg`,
                  type: isVid ? 'video/mp4' : 'image/jpeg',
                });
              });
              await uploadPropertyPhotos(activeLoanId, fd);
              setData(d => ({
                ...d,
                propertyPhotos: (d.propertyPhotos || []).map(p => newItems.some(ni => ni.uri === p.uri) ? { ...p, uploaded: true } : p)
              }));
            } catch {
              Alert.alert('Upload Notice', 'Photos saved locally. Will retry on submit.');
            } finally { setPhotoUploading(false); }
          }
        },
        {
          text: 'Camera',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission Needed', 'Allow camera access to take photo.'); return; }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              quality: 0.8,
              videoMaxDuration: 120,
            });
            if (result.canceled || !result.assets?.[0]) return;
            const isVid = result.assets[0].type === 'video' || (result.assets[0].uri && (result.assets[0].uri.toLowerCase().endsWith('.mp4') || result.assets[0].uri.toLowerCase().endsWith('.mov')));
            const newItem = {
              uri: result.assets[0].uri,
              localUri: result.assets[0].uri,
              type: isVid ? 'video' : (result.assets[0].type || 'image'),
              uploaded: false,
            };
            const updated = [...(data.propertyPhotos || []), newItem].slice(0, 15);
            setData(d => ({ ...d, propertyPhotos: updated }));

            let activeLoanId = loanId;
            if (!activeLoanId && setLoanId) {
              try {
                const created = await createLoan();
                activeLoanId = created.loanId;
                setLoanId(activeLoanId);
              } catch (cErr) {
                console.warn('Auto createLoan on camera photo failed:', cErr);
              }
            }

            if (!activeLoanId) return;
            setPhotoUploading(true);
            try {
              const fd = new FormData();
              fd.append('photos', {
                uri: Platform.OS === 'android' ? newItem.uri : newItem.uri.replace('file://', ''),
                name: isVid ? `photo_vid_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`,
                type: isVid ? 'video/mp4' : 'image/jpeg',
              });
              await uploadPropertyPhotos(activeLoanId, fd);
              setData(d => ({
                ...d,
                propertyPhotos: (d.propertyPhotos || []).map(p => p.uri === newItem.uri ? { ...p, uploaded: true } : p)
              }));
            } catch {
              console.warn('Camera photo upload deferred to submit');
            } finally { setPhotoUploading(false); }
          }
        },
      ]
    );
  };

  const captureLocation = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission denied', 'Location permission is required to capture property coordinates.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const results = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      const geo = (results && results.length > 0) ? results[0] : {};
      const address = [geo.name, geo.street, geo.district, geo.city, geo.postalCode].filter(Boolean).join(', ');
      const locName = [geo.name, geo.street].filter(Boolean).join(', ') || geo.subregion || geo.city || '';
      const district = geo.district || geo.subregion || geo.city || '';
      const now = new Date();
      const dateStr = formatDate(now);
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      setData(d => ({
        ...d,
        geoLat: loc.coords.latitude.toFixed(4),
        geoLng: loc.coords.longitude.toFixed(4),
        geoAddress: address || d.geoAddress,
        geoLocName: locName || d.geoLocName,
        geoDistrict: district || d.geoDistrict,
        geoDate: `${dateStr}, ${timeStr}`,
      }));
    } catch { Alert.alert('Error', 'Could not get location.'); }
    finally { setLocLoading(false); }
  };


  const openUploadModal = (docType) => {
    setSelectedDocType(docType || 'Custom Document');
    setDocNameInput(docType || '');
    setPickedAsset(null);
    setModalVisible(true);
  };

  const chooseFile = async (preferredType = 'application/pdf') => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: preferredType,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPickedAsset(asset);
      if (!docNameInput.trim()) {
        setDocNameInput(asset.name || selectedDocType);
      }
    } catch (err) {
      Alert.alert('Document Error', 'Could not open document picker.');
    }
  };

  const captureDocWithCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Allow camera access to capture document photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const cameraAsset = {
        uri: asset.uri,
        name: `doc_camera_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      };
      setPickedAsset(cameraAsset);
      if (!docNameInput.trim()) {
        setDocNameInput(selectedDocType || 'Document Photo');
      }
    } catch (err) {
      Alert.alert('Camera Error', 'Could not capture document with camera.');
    }
  };

  const handleModalUpload = async () => {
    if (!pickedAsset) {
      Alert.alert('Required', 'Please select a document file to upload.');
      return;
    }
    const finalName = docNameInput.trim() || pickedAsset.name || selectedDocType;
    const recognizedStd = getStandardDocTitle({ docType: selectedDocType, name: finalName });
    const effectiveDocType = (selectedDocType === 'Custom Document' && recognizedStd) ? recognizedStd : selectedDocType;

    const newDoc = {
      id: Date.now().toString(),
      uri: pickedAsset.uri,
      localUri: pickedAsset.uri,
      name: finalName,
      docType: effectiveDocType,
      date: formatDate(new Date()),
      uploaded: false,
      mimeType: pickedAsset.mimeType || 'application/pdf',
    };

    // Filter existing matching standard doc or append new doc
    setData(d => {
      const existingDocs = d.propertyDocs || [];
      const updated = effectiveDocType === 'Custom Document'
        ? [...existingDocs, newDoc]
        : [...existingDocs.filter(doc => doc.docType !== effectiveDocType && doc.name !== effectiveDocType && getStandardDocTitle(doc) !== effectiveDocType), newDoc];
      return { ...d, propertyDocs: updated };
    });

    setModalVisible(false);

    let activeLoanId = loanId;
    if (!activeLoanId && setLoanId) {
      try {
        const created = await createLoan();
        activeLoanId = created.loanId;
        setLoanId(activeLoanId);
      } catch (cErr) {
        console.warn('Auto createLoan on doc upload failed:', cErr);
      }
    }

    if (!activeLoanId) return;
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append('document', {
        uri: Platform.OS === 'android' ? pickedAsset.uri : pickedAsset.uri.replace('file://', ''),
        name: pickedAsset.name || 'document',
        type: pickedAsset.mimeType || 'application/pdf',
      });
      fd.append('docType', effectiveDocType);
      fd.append('name', finalName);
      fd.append('date', newDoc.date);
      const res = await uploadRegistryDocument(activeLoanId, fd, {
        docType: effectiveDocType,
        name: finalName,
        date: newDoc.date,
      });
      setData(d => ({
        ...d,
        propertyDocs: (d.propertyDocs || []).map(d2 => d2.id === newDoc.id ? { ...d2, uploaded: true, serverKey: res?.key, uri: d2.localUri || d2.uri } : d2)
      }));
    } catch {
      Alert.alert('Upload Notice', 'Document saved locally. Will retry on submit.');
    } finally {
      setDocUploading(false);
    }
  };

  const removeDoc = (id) => setData(d => ({ ...d, propertyDocs: (d.propertyDocs || []).filter(doc => doc.id !== id) }));

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionTitle title="Property Details" />

      {/* ── Property Photos ── */}
      <FieldLabel text="Property Photos" required />
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
        <Text style={ph.addText}>Add Property Photos{'\n'}(Camera or Library)</Text>
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
      <FieldLabel text="Standard Property Documents (Optional)" />
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>
        Upload any available property documents. All items below are non-essential.
      </Text>

      <View style={stdS.container}>
        {STANDARD_PROPERTY_DOCS.map((std) => {
          const uploadedDoc = (data.propertyDocs || []).find(
            (d) => d.docType === std.type || getStandardDocTitle(d) === std.title
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
                    <TouchableOpacity style={stdS.viewBtn} onPress={() => openDoc(uploadedDoc.localUri || uploadedDoc.uri)}>
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
      <FieldLabel text="Additional Documents (Optional)" />
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
      {(data.propertyDocs || []).filter(d => !STANDARD_PROPERTY_DOCS.some(std => std.type === d.docType || std.title.toLowerCase() === d.name?.toLowerCase()) && !getStandardDocTitle(d)).map(doc => (
        <View key={doc.id} style={docS.row}>
          <Ionicons name="document-text-outline" size={20} color={colors.dark} />
          <View style={{ flex: 1 }}>
            <Text style={docS.name} numberOfLines={1}>{doc.name}</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>{doc.docType || 'Custom Document'}</Text>
          </View>
          {doc.uploaded && <Ionicons name="checkmark-circle" size={16} color={colors.success} />}
          <TouchableOpacity onPress={() => openDoc(doc.localUri || doc.uri)} style={{ paddingHorizontal: 6 }}>
            <Ionicons name="eye-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => removeDoc(doc.id)} style={{ paddingHorizontal: 6 }}>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>
      ))}

      {/* ── Property Area ── */}
      <FieldLabel text="Property Area (Sq. M)" required />
      <StyledInput value={data.propertyArea} onChangeText={v => setData(d => ({ ...d, propertyArea: v }))} placeholder="e.g. 250" keyboardType="numeric" />

      {/* ── Market Value ── */}
      <FieldLabel text="Market Value (₹)" required />
      <StyledInput value={data.marketValue} onChangeText={v => setData(d => ({ ...d, marketValue: v }))} placeholder="e.g. 1000000" keyboardType="numeric" />

      {/* ── Descendants ── */}
      <FieldLabel text="Transferred To Descendant (Count)" required />
      <StyledInput value={data.descendantCount} onChangeText={v => setData(d => ({ ...d, descendantCount: v }))} placeholder="e.g. 2" keyboardType="numeric" />

      {/* ── Other Loan ── */}
      <FieldLabel text="Any Other Loan On This Property?" required />
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
        {['Yes', 'No'].map(opt => (
          <TouchableOpacity key={opt} style={[tog.btn, data.otherLoan === opt && tog.active]} onPress={() => setData(d => ({ ...d, otherLoan: opt }))}>
            <Text style={[tog.txt, data.otherLoan === opt && tog.txtActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {data.otherLoan === 'Yes' && (
        <>
          <FieldLabel text="Other Loan Remark" required />
          <StyledInput value={data.otherLoanDetails} onChangeText={v => setData(d => ({ ...d, otherLoanDetails: v }))} placeholder="Bank name, outstanding amount, EMI etc." multiline />
        </>
      )}

      {/* ── Property Address ── */}
      <FieldLabel text="Property Address" required />
      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>Auto-filled from geo location capture.</Text>
      <StyledInput value={data.geoAddress || ''} onChangeText={v => setData(d => ({ ...d, geoAddress: v }))} placeholder="Will be filled after geo capture" multiline />

      {/* ── Possession Status ── */}
      <FieldLabel text="Possession Status (Optional)" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        {['Self Occupied', 'Tenant Occupied', 'Vacant', 'Under Construction'].map(opt => (
          <TouchableOpacity key={opt} style={[chip.btn, data.possessionStatus === opt && chip.active]} onPress={() => setData(d => ({ ...d, possessionStatus: opt }))}>
            <Text style={[chip.txt, data.possessionStatus === opt && chip.txtActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Geo Location ── */}
      <FieldLabel text="Geo Location" required />
      {data.geoLat ? (
        <View style={geo.box}>
          <Ionicons name="location" size={18} color={colors.dark} />
          <View style={{ flex: 1 }}>
            <Text style={geo.coords}>Captured: {data.geoLat}, {data.geoLng}</Text>
            <Text style={geo.date}>{data.geoDate || 'Coordinates captured'}</Text>
          </View>
          <TouchableOpacity onPress={captureLocation}>
            <Text style={{ fontSize: 12, color: colors.dark, fontWeight: '600' }}>Re-Capture</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={geo.captureBtn} onPress={captureLocation} disabled={locLoading}>
          {locLoading
            ? <ActivityIndicator color={colors.white} size="small" />
            : <><Ionicons name="location-outline" size={20} color={colors.white} /><Text style={geo.captureTxt}>Capture Geo Location</Text></>}
        </TouchableOpacity>
      )}

      {/* ── Geo Location Name & District ── */}
      <FieldLabel text="Location / Area Name" required />
      <StyledInput
        value={data.geoLocName}
        onChangeText={v => setData(d => ({ ...d, geoLocName: v }))}
        placeholder="Auto-Filled From GPS Or Enter Location Name"
      />

      <FieldLabel text="District" required />
      <StyledInput
        value={data.geoDistrict}
        onChangeText={v => setData(d => ({ ...d, geoDistrict: v }))}
        placeholder="Auto-Filled From GPS Or Enter District"
      />

      {/* ── Property Details Remark ── */}
      <FieldLabel text="Property Details Remark" />
      <StyledInput
        value={data.propertyRemark}
        onChangeText={v => setData(d => ({ ...d, propertyRemark: v }))}
        placeholder="Enter Remarks For Property Details (Optional)"
        multiline
      />

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

            <Text style={stdS.modalLabel}>Select Document File:</Text>
            {/* Primary Action: Direct to Latest Downloaded PDF */}
            <TouchableOpacity
              style={[stdS.filePickerBtn, { marginBottom: 8, backgroundColor: '#EFF6FF', borderColor: colors.primary }]}
              onPress={() => chooseFile('application/pdf')}
            >
              <Ionicons name="document-text" size={20} color={colors.primary} />
              <Text style={[stdS.filePickerTxt, { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>
                {pickedAsset && (pickedAsset.mimeType?.includes('pdf') || pickedAsset.name?.toLowerCase().endsWith('.pdf'))
                  ? `Selected: ${pickedAsset.name}`
                  : 'Choose Latest Downloaded PDF'}
              </Text>
            </TouchableOpacity>

            {/* Camera Action: Capture Document with Camera */}
            <TouchableOpacity
              style={[stdS.filePickerBtn, { marginBottom: 8, backgroundColor: '#F0FDF4', borderColor: colors.dark }]}
              onPress={captureDocWithCamera}
            >
              <Ionicons name="camera-outline" size={20} color={colors.dark} />
              <Text style={[stdS.filePickerTxt, { color: colors.dark, fontWeight: '700' }]} numberOfLines={1}>
                {pickedAsset && (pickedAsset.name?.includes('doc_camera_') || pickedAsset.mimeType === 'image/jpeg')
                  ? `Captured: ${pickedAsset.name}`
                  : 'Capture Document with Camera'}
              </Text>
            </TouchableOpacity>

            {/* Secondary Action: Image or Other File */}
            <TouchableOpacity
              style={[stdS.filePickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
              onPress={() => chooseFile('*/*')}
            >
              <Ionicons name="images-outline" size={18} color={colors.muted} />
              <Text style={[stdS.filePickerTxt, { color: colors.text }]} numberOfLines={1}>
                {pickedAsset && !pickedAsset.name?.includes('doc_camera_') && !(pickedAsset.mimeType?.includes('pdf') || pickedAsset.name?.toLowerCase().endsWith('.pdf'))
                  ? `Selected: ${pickedAsset.name}`
                  : 'Choose Image / Other Document File'}
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

      <FieldLabel text="Requested Loan Tenure (Months)" />
      <StyledInput
        value={data.repaymentMonths}
        onChangeText={v => setData(d => ({ ...d, repaymentMonths: v }))}
        placeholder="e.g. 24"
        keyboardType="numeric"
      />

      <FieldLabel text="Purpose Of Loan" />
      <StyledInput
        value={data.loanPurpose}
        onChangeText={v => setData(d => ({ ...d, loanPurpose: v }))}
        placeholder="e.g. Home Renovation, Agriculture, Business"
        multiline
      />

      {/* Loan Details Remark */}
      <FieldLabel text="Loan Details Remark" />
      <StyledInput
        value={data.loanRemark}
        onChangeText={v => setData(d => ({ ...d, loanRemark: v }))}
        placeholder="Enter Remarks For Loan Details (Optional)"
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

// ─── MEDIA PREVIEW MODALS FOR STEP 4 ──────────────────────────────────────────
function ReviewVideoModal({ visible, uri, title, onClose }) {
  const resolvedUri = resolveMediaUri(uri);
  const player = useVideoPlayer(resolvedUri || null, p => {
    if (visible && resolvedUri) p.play();
  });

  if (!visible || !uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={rv.modalBg}>
        <View style={rv.modalHeader}>
          <Text style={rv.modalTitle} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={rv.modalCloseBtn}>
            <Ionicons name="close" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
        <VideoView style={rv.fullVideo} player={player} allowsFullscreen allowsPictureInPicture />
      </View>
    </Modal>
  );
}

function ReviewImageModal({ visible, uri, onClose }) {
  if (!visible || !uri) return null;
  const resolvedUri = resolveMediaUri(uri);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={rv.modalBg}>
        <View style={rv.modalHeader}>
          <Text style={rv.modalTitle}>Property Photo Preview</Text>
          <TouchableOpacity onPress={onClose} style={rv.modalCloseBtn}>
            <Ionicons name="close" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
        <Image source={{ uri: resolvedUri }} style={rv.fullImage} resizeMode="contain" />
      </View>
    </Modal>
  );
}

// ─── STEP 4: Review & Submit ───────────────────────────────────────────────────
function Step4({ data, loanId }) {
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [serverMedia, setServerMedia] = useState([]);

  useEffect(() => {
    if (loanId) {
      getLoanMediaPreview(loanId)
        .then((items) => {
          if (Array.isArray(items)) setServerMedia(items);
        })
        .catch(() => {});
    }
  }, [loanId]);

  const Row = ({ label, value }) => (
    <View style={rv.row}>
      <Text style={rv.label}>{label}</Text>
      <Text style={rv.value}>{value || '—'}</Text>
    </View>
  );

  const serverOwnerVideo = serverMedia.find(m => m.type === 'video' && (m.videoType === 'owner' || m.name?.toLowerCase().includes('owner')));
  const serverHouseVideo = serverMedia.find(m => m.type === 'video' && (m.videoType === 'house' || m.name?.toLowerCase().includes('house') || m.name?.toLowerCase().includes('property')));

  const rawOwnerUri = data.videoUri || serverOwnerVideo?.url;
  const rawHouseUri = data.houseVideoUri || serverHouseVideo?.url;
  const ownerVideoUri = rawOwnerUri ? resolveMediaUri(rawOwnerUri) : null;
  const houseVideoUri = rawHouseUri ? resolveMediaUri(rawHouseUri) : null;

  const serverPhotos = serverMedia.filter(m => m.type === 'photo' || m.type === 'image');
  const photos = (data.propertyPhotos && data.propertyPhotos.length > 0)
    ? data.propertyPhotos.map(p => ({ ...p, uri: resolveMediaUri(p.uri || p) }))
    : serverPhotos.map(m => ({ uri: m.url, type: 'image' }));

  const serverDocs = serverMedia.filter(m => m.type === 'document');
  const docs = (data.propertyDocs && data.propertyDocs.length > 0)
    ? data.propertyDocs.map(d => ({ ...d, uri: resolveMediaUri(d.localUri || d.uri) }))
    : serverDocs.map(m => ({ uri: m.url, name: m.name, docType: m.docType, date: m.date, mimeType: m.mimeType }));

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionTitle title="Review & Submit" />
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>
        Please verify all details and media attachments before submitting.
      </Text>

      {/* ── Owner Details Card ── */}
      <View style={rv.card}>
        <Text style={rv.section}>Owner Details</Text>
        <Row label="Owner Name" value={data.ownerName} />
        <Row label="Mobile Number" value={data.ownerMobile} />
        <Row label="Email Address" value={data.ownerEmail} />
        <Row label="Aadhaar Number" value={data.aadhaar} />
        <Row label="Spouse Name" value={data.spouseName} />
        <Row label="Family Occupation" value={data.familyOccupation} />
        <Row label="Monthly Income" value={data.monthlyIncome ? `₹${Number(data.monthlyIncome).toLocaleString('en-IN')}` : ''} />
        <Row label="Owner Address" value={data.ownerAddress} />
        <Row label="Owner Details Remark" value={data.ownerRemark} />
      </View>

      {/* ── Bank Details Card ── */}
      <View style={rv.card}>
        <Text style={rv.section}>Bank Details</Text>
        <Row label="IFSC Code" value={data.ifsc} />
        <Row label="Bank Name" value={data.bankName} />
        <Row label="Account Holder" value={data.accountHolder} />
        <Row label="Account Number" value={data.accountNumber} />
        <Row label="Bank Details Remark" value={data.bankRemark} />
      </View>

      {/* ── Property Details Card ── */}
      <View style={rv.card}>
        <Text style={rv.section}>Property Details</Text>
        <Row label="Property Area" value={data.propertyArea ? `${data.propertyArea} sq.m` : ''} />
        <Row label="Market Value" value={data.marketValue ? `₹${Number(data.marketValue).toLocaleString('en-IN')}` : ''} />
        <Row label="Transferred To Descendant" value={data.descendantCount} />
        <Row label="Any Other Loan" value={data.otherLoan} />
        {data.otherLoan === 'Yes' && <Row label="Other Loan Remark" value={data.otherLoanDetails} />}
        <Row label="Possession Status" value={data.possessionStatus} />
        <Row label="Geo Coordinates" value={data.geoLat ? `${data.geoLat}, ${data.geoLng}` : ''} />
        <Row label="Location / Area Name" value={data.geoLocName} />
        <Row label="District" value={data.geoDistrict} />
        <Row label="Property Address" value={data.geoAddress} />
        <Row label="Property Details Remark" value={data.propertyRemark} />
      </View>

      {/* ── Loan Details Card ── */}
      <View style={rv.card}>
        <Text style={rv.section}>Loan Details</Text>
        <Row label="Requested Loan Amount" value={data.loanAmount ? `₹${Number(data.loanAmount).toLocaleString('en-IN')}` : ''} />
        <Row label="Purpose Of Loan" value={data.loanPurpose} />
        <Row label="Requested Loan Tenure" value={data.repaymentMonths ? `${data.repaymentMonths} months` : ''} />
        <Row label="Loan Details Remark" value={data.loanRemark || data.notes} />
      </View>

      {/* ── Rich Media & Attached Documents Review Card ── */}
      <View style={rv.card}>
        <View style={rv.mediaHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="images-outline" size={18} color={colors.dark} />
            <Text style={rv.section}>Media & Documents Review</Text>
          </View>
          <View style={rv.mediaCountBadge}>
            <Text style={rv.mediaCountBadgeTxt}>
              {(ownerVideoUri ? 1 : 0) + (houseVideoUri ? 1 : 0) + photos.length + docs.length} Items
            </Text>
          </View>
        </View>

        {/* Category A: Recorded Videos */}
        <Text style={rv.subHeader}>Recorded Verification Videos</Text>
        <View style={rv.videoGrid}>
          {/* Owner Video */}
          <TouchableOpacity
            style={[rv.mediaTile, !ownerVideoUri && rv.mediaTileEmpty]}
            onPress={() => ownerVideoUri && setSelectedVideo({ uri: ownerVideoUri, title: 'Owner Verification Video' })}
            disabled={!ownerVideoUri}
            activeOpacity={0.7}
          >
            <View style={rv.mediaTileIconBox}>
              <Ionicons name="videocam" size={24} color={ownerVideoUri ? '#D97706' : colors.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={rv.mediaTileTitle} numberOfLines={1}>Owner Verification</Text>
              <Text style={[rv.mediaTileStatus, ownerVideoUri ? { color: colors.success } : { color: colors.muted }]}>
                {ownerVideoUri ? '✓ Recorded (Tap to Watch)' : 'Not recorded'}
              </Text>
            </View>
            {ownerVideoUri && (
              <Ionicons name="play-circle" size={26} color="#D97706" />
            )}
          </TouchableOpacity>

          {/* House Video */}
          <TouchableOpacity
            style={[rv.mediaTile, !houseVideoUri && rv.mediaTileEmpty]}
            onPress={() => houseVideoUri && setSelectedVideo({ uri: houseVideoUri, title: 'House / Property Video' })}
            disabled={!houseVideoUri}
            activeOpacity={0.7}
          >
            <View style={rv.mediaTileIconBox}>
              <Ionicons name="videocam" size={24} color={houseVideoUri ? '#D97706' : colors.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={rv.mediaTileTitle} numberOfLines={1}>House / Property Walkthrough</Text>
              <Text style={[rv.mediaTileStatus, houseVideoUri ? { color: colors.success } : { color: colors.muted }]}>
                {houseVideoUri ? '✓ Recorded (Tap to Watch)' : 'Not recorded'}
              </Text>
            </View>
            {houseVideoUri && (
              <Ionicons name="play-circle" size={26} color="#D97706" />
            )}
          </TouchableOpacity>
        </View>

        {/* Category B: Property Photos */}
        <Text style={rv.subHeader}>
          Property Photos {photos.length > 0 ? `(${photos.length})` : ''}
        </Text>
        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rv.photoScroll}>
            {photos.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={rv.photoThumbWrapper}
                onPress={() => setSelectedImage(item.uri)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: item.uri }} style={rv.photoThumb} resizeMode="cover" />
                <View style={rv.photoBadge}>
                  <Text style={rv.photoBadgeTxt}>#{idx + 1}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <Text style={rv.emptyNotice}>No property photos attached</Text>
        )}

        {/* Category C: Property Documents */}
        <Text style={rv.subHeader}>
          Attached Documents {docs.length > 0 ? `(${docs.length})` : ''}
        </Text>
        {docs.length > 0 ? (
          <View style={{ gap: 8 }}>
            {docs.map((d, idx) => {
              const uriStr = typeof d.uri === 'string' ? d.uri.toLowerCase() : '';
              const isImg = d.mimeType?.includes('image') || uriStr.endsWith('.jpg') || uriStr.endsWith('.jpeg') || uriStr.endsWith('.png');
              return (
                <View key={d.id || idx} style={rv.docCard}>
                  <Ionicons
                    name={isImg ? 'image-outline' : 'document-text-outline'}
                    size={22}
                    color={colors.dark}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={rv.docName} numberOfLines={1}>{d.name || d.docType || 'Document'}</Text>
                    <Text style={rv.docSub}>
                      {d.docType || 'Custom Document'} {d.date ? `• ${d.date}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={rv.viewDocBtn}
                    onPress={() => {
                      if (isImg) {
                        setSelectedImage(d.uri);
                      } else {
                        openDoc(d.uri);
                      }
                    }}
                  >
                    <Ionicons name="eye-outline" size={14} color={colors.primary} />
                    <Text style={rv.viewDocTxt}>View</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={rv.emptyNotice}>No property documents attached</Text>
        )}
      </View>

      {/* Video Preview Modal */}
      {selectedVideo && (
        <ReviewVideoModal
          visible={!!selectedVideo}
          uri={selectedVideo.uri}
          title={selectedVideo.title}
          onClose={() => setSelectedVideo(null)}
        />
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <ReviewImageModal
          visible={!!selectedImage}
          uri={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </View>
  );
}

const rv = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  section: { fontSize: 13, fontWeight: '700', color: colors.dark, textTransform: 'uppercase', letterSpacing: 0.5 },
  subHeader: { fontSize: 12, fontWeight: '700', color: colors.text, marginTop: 14, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.inputBg },
  label: { fontSize: 13, color: colors.muted, flex: 1 },
  value: { fontSize: 13, color: colors.text, fontWeight: '500', flex: 1.5, textAlign: 'right' },
  mediaHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  mediaCountBadge: { backgroundColor: '#E0F2FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  mediaCountBadgeTxt: { fontSize: 11, fontWeight: '700', color: colors.primary },
  videoGrid: { gap: 8 },
  mediaTile: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.inputBg, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  mediaTileEmpty: { opacity: 0.6 },
  mediaTileIconBox: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  mediaTileTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  mediaTileStatus: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  photoScroll: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  photoThumbWrapper: { position: 'relative', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  photoThumb: { width: 76, height: 76, borderRadius: 8, backgroundColor: colors.border },
  photoBadge: { position: 'absolute', bottom: 3, right: 3, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  photoBadgeTxt: { fontSize: 10, color: colors.white, fontWeight: '700' },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.inputBg, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border },
  docName: { fontSize: 13, fontWeight: '600', color: colors.text },
  docSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  viewDocBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  viewDocTxt: { fontSize: 12, fontWeight: '700', color: colors.primary },
  emptyNotice: { fontSize: 12, color: colors.muted, fontStyle: 'italic', marginVertical: 4 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, zIndex: 10 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.white, flex: 1 },
  modalCloseBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 },
  fullVideo: { width: '100%', height: 350, borderRadius: 12 },
  fullImage: { width: '100%', height: '80%', borderRadius: 12 },
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
  ownerAddress: '',
  ownerRemark: '',
  ifsc: '',
  bankName: '',
  accountHolder: '',
  accountNumber: '',
  bankRemark: '',
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
  geoLocName: '',
  geoDistrict: '',
  geoDate: '',
  geoAddress: '',
  possessionStatus: '',
  propertyDocs: [],
  propertyRemark: '',
  loanAmount: '',
  loanPurpose: '',
  repaymentMonths: '',
  loanRemark: '',
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
    ownerAddress: existingLoan?.ownerAddress || '',
    ownerRemark: existingLoan?.ownerRemark || existingLoan?.remarks?.owner || '',
    ifsc: existingLoan?.bankDetails?.ifsc || '', 
    bankName: existingLoan?.bankDetails?.bankName || '', 
    accountHolder: existingLoan?.bankDetails?.accountHolder || '', 
    accountNumber: existingLoan?.bankDetails?.accountNumber || '',
    bankRemark: existingLoan?.bankRemark || existingLoan?.bankDetails?.remark || existingLoan?.remarks?.bank || '',
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
    geoLocName: existingLoan?.geoLocation?.locationName || existingLoan?.locationName || '',
    geoDistrict: existingLoan?.geoLocation?.district || existingLoan?.propertyDistrict || existingLoan?.district || '',
    geoDate: '', 
    geoAddress: existingLoan?.propertyAddress || '',
    possessionStatus: existingLoan?.possessionStatus || '', 
    propertyDocs: existingLoan?.propertyDocs || [],
    propertyRemark: existingLoan?.propertyRemark || existingLoan?.remarks?.property || '',
    loanAmount: existingLoan?.loanAmount?.toString() || '', 
    loanPurpose: existingLoan?.loanPurpose || '', 
    repaymentMonths: existingLoan?.repaymentMonths?.toString() || '', 
    loanRemark: existingLoan?.loanRemark || existingLoan?.remarks?.loan || existingLoan?.notes || '',
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

  const validateStep = (stepIndex, data) => {
    if (stepIndex === 0) {
      if (!data.ownerName?.trim()) return 'Please enter Owner Name.';
      const mobile = (data.ownerMobile || '').trim();
      if (!mobile || !/^\d{10}$/.test(mobile)) return 'Please enter a valid 10-digit Owner Mobile number.';
      const aadhar = (data.aadhaar || '').trim();
      if (!aadhar || !/^\d{12}$/.test(aadhar)) return 'Please enter a valid 12-digit Aadhaar Number.';
      if (!data.spouseName?.trim()) return 'Please enter Spouse Name.';
      if (!data.familyOccupation?.trim()) return 'Please enter Family Occupation.';
      if (!data.monthlyIncome || Number(data.monthlyIncome) <= 0) return 'Please enter a valid Monthly Income.';
      const ifsc = (data.ifsc || '').trim();
      if (!ifsc || ifsc.length !== 11) return 'Please enter a valid 11-character IFSC code.';
      if (!data.bankName?.trim()) return 'Please enter or fetch Bank Name.';
      if (!data.accountHolder?.trim()) return 'Please enter Account Holder Name.';
      const accNum = (data.accountNumber || '').trim();
      if (!accNum || accNum.length < 6) return 'Please enter a valid Bank Account Number.';
      if (!data.ownerAddress?.trim()) return 'Please enter residential Owner Address.';
      if (!data.videoUri) return 'Please record or upload the Owner Verification Video.';
      if (!data.houseVideoUri) return 'Please record or upload the House / Property Video.';
    }

    if (stepIndex === 1) {
      if (!data.propertyPhotos || data.propertyPhotos.length === 0) return 'Please upload at least one Property Photo.';
      if (!data.propertyArea || Number(data.propertyArea) <= 0) return 'Please enter Property Area (Sq. M).';
      if (!data.marketValue || Number(data.marketValue) <= 0) return 'Please enter Market Value of the property.';
      if (data.descendantCount === '' || data.descendantCount === null || isNaN(Number(data.descendantCount))) {
        return 'Please enter Transferred To Descendant count (enter 0 if none).';
      }
      if (data.otherLoan === 'Yes' && !data.otherLoanDetails?.trim()) {
        return 'Please provide remark/details for the existing loan on this property.';
      }
      if (!data.geoLat || !data.geoLng) return 'Please capture the Geo Location of the property.';
      if (!data.geoLocName?.trim()) return 'Please enter Location / Area Name.';
      if (!data.geoDistrict?.trim()) return 'Please enter District name.';
      if (!data.geoAddress?.trim()) return 'Please enter Property Address.';
    }

    if (stepIndex === 2) {
      if (!data.loanAmount || Number(data.loanAmount) <= 0) return 'Please enter Requested Loan Amount.';
    }

    return null;
  };

  const handleNext = async () => {
    const validationError = validateStep(step, formData);
    if (validationError) {
      showAlert('Required Field Missing', validationError);
      return;
    }

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
          ownerName: formData.ownerName?.trim(),
          ownerMobile: formData.ownerMobile?.trim(),
          ownerEmail: formData.ownerEmail?.trim() || '',
          aadhaar: formData.aadhaar?.trim(),
          spouseName: formData.spouseName?.trim(),
          familyOccupation: formData.familyOccupation?.trim(),
          monthlyIncome: Number(formData.monthlyIncome),
          ownerAddress: formData.ownerAddress?.trim(),
          ownerRemark: formData.ownerRemark?.trim() || '',
          bankDetails: {
            ifsc: formData.ifsc?.trim(),
            bankName: formData.bankName?.trim(),
            accountHolder: formData.accountHolder?.trim(),
            accountNumber: formData.accountNumber?.trim(),
            remark: formData.bankRemark?.trim() || '',
          },
          bankRemark: formData.bankRemark?.trim() || '',
        });

        // Upload Owner Video if pending
        if (formData.videoUri && !formData.videoUploaded) {
          try {
            const fd = new FormData();
            fd.append('videoType', 'owner');
            fd.append('name', 'Owner Verification Video');
            fd.append('video', {
              uri: Platform.OS === 'android' ? formData.videoUri : formData.videoUri.replace('file://', ''),
              name: 'owner_video.mp4',
              type: 'video/mp4'
            });
            await uploadVideo(currentLoanId, fd, 'owner', 'Owner Verification Video');
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
            fdHouse.append('videoType', 'house');
            fdHouse.append('name', 'House / Property Video');
            fdHouse.append('video', {
              uri: Platform.OS === 'android' ? formData.houseVideoUri : formData.houseVideoUri.replace('file://', ''),
              name: 'house_video.mp4',
              type: 'video/mp4'
            });
            await uploadVideo(currentLoanId, fdHouse, 'house', 'House / Property Video');
            setFormData(d => ({ ...d, houseVideoUploaded: true }));
          } catch (hErr) {
            console.warn('House video upload error:', hErr);
            showAlert('Notice', 'House video saved locally. It will upload upon application submit.');
          }
        }
      }
      if (step === 1) {
        await updateLoan(currentLoanId, {
          propertyArea: Number(formData.propertyArea),
          marketValue: Number(formData.marketValue),
          descendantCount: Number(formData.descendantCount),
          otherLoan: formData.otherLoan === 'Yes',
          otherLoanDetails: formData.otherLoanDetails?.trim() || '',
          geoLocation: {
            lat: formData.geoLat,
            lng: formData.geoLng,
            locationName: formData.geoLocName?.trim() || '',
            district: formData.geoDistrict?.trim() || '',
          },
          locationName: formData.geoLocName?.trim() || '',
          propertyDistrict: formData.geoDistrict?.trim() || '',
          propertyAddress: formData.geoAddress?.trim() || '',
          possessionStatus: formData.possessionStatus,
          propertyRemark: formData.propertyRemark?.trim() || '',
        });

        // Upload any pending property photos
        const unuploadedPhotos = (formData.propertyPhotos || []).filter(p => !p.uploaded && p.uri);
        if (unuploadedPhotos.length > 0) {
          try {
            const fd = new FormData();
            unuploadedPhotos.forEach((item, i) => {
              const isVid = item.type === 'video' || (item.uri && (item.uri.toLowerCase().endsWith('.mp4') || item.uri.toLowerCase().endsWith('.mov')));
              fd.append('photos', {
                uri: Platform.OS === 'android' ? item.uri : item.uri.replace('file://', ''),
                name: isVid ? `photo_vid_${Date.now()}_${i}.mp4` : `photo_${Date.now()}_${i}.jpg`,
                type: isVid ? 'video/mp4' : 'image/jpeg'
              });
            });
            await uploadPropertyPhotos(currentLoanId, fd);
            setFormData(d => ({
              ...d,
              propertyPhotos: (d.propertyPhotos || []).map(p => ({ ...p, uploaded: true }))
            }));
          } catch (pErr) {
            console.warn('Property photos upload error:', pErr);
          }
        }

        // Upload any pending property documents
        const unuploadedDocs = (formData.propertyDocs || []).filter(doc => !doc.uploaded && doc.uri);
        for (const uDoc of unuploadedDocs) {
          try {
            const fd = new FormData();
            const recognizedStd = getStandardDocTitle({ docType: uDoc.docType, name: uDoc.name });
            const effectiveDocType = (uDoc.docType === 'Custom Document' && recognizedStd) ? recognizedStd : (uDoc.docType || 'Custom Document');
            fd.append('document', {
              uri: Platform.OS === 'android' ? uDoc.uri : uDoc.uri.replace('file://', ''),
              name: uDoc.name || 'document',
              type: uDoc.mimeType || 'application/pdf',
            });
            fd.append('docType', effectiveDocType);
            fd.append('name', uDoc.name || 'Document');
            fd.append('date', uDoc.date || formatDate(new Date()));
            const res = await uploadRegistryDocument(currentLoanId, fd, {
              docType: effectiveDocType,
              name: uDoc.name || 'Document',
              date: uDoc.date || formatDate(new Date()),
            });
            setFormData(d => ({
              ...d,
              propertyDocs: (d.propertyDocs || []).map(item => item.id === uDoc.id ? { ...item, uploaded: true, serverKey: res?.key, uri: item.localUri || item.uri } : item)
            }));
          } catch (dErr) {
            console.warn('Property doc upload error:', dErr);
          }
        }
      }
      if (step === 2) {
        await updateLoan(currentLoanId, {
          loanAmount: Number(formData.loanAmount),
          loanPurpose: formData.loanPurpose?.trim() || '',
          repaymentMonths: formData.repaymentMonths ? Number(formData.repaymentMonths) : null,
          loanRemark: formData.loanRemark?.trim() || '',
          notes: formData.loanRemark?.trim() || formData.notes?.trim() || '',
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
          fd.append('videoType', 'owner');
          fd.append('name', 'Owner Verification Video');
          fd.append('video', {
            uri: Platform.OS === 'android' ? formData.videoUri : formData.videoUri.replace('file://', ''),
            name: 'owner_video.mp4',
            type: 'video/mp4'
          });
          await uploadVideo(loanId, fd, 'owner', 'Owner Verification Video');
          setFormData(d => ({ ...d, videoUploaded: true }));
        } catch (vErr) {
          console.warn('Submit owner video upload error:', vErr);
        }
      }
      if (formData.houseVideoUri && !formData.houseVideoUploaded && loanId) {
        try {
          const fdHouse = new FormData();
          fdHouse.append('videoType', 'house');
          fdHouse.append('name', 'House / Property Video');
          fdHouse.append('video', {
            uri: Platform.OS === 'android' ? formData.houseVideoUri : formData.houseVideoUri.replace('file://', ''),
            name: 'house_video.mp4',
            type: 'video/mp4'
          });
          await uploadVideo(loanId, fdHouse, 'house', 'House / Property Video');
          setFormData(d => ({ ...d, houseVideoUploaded: true }));
        } catch (hErr) {
          console.warn('Submit house video upload error:', hErr);
        }
      }
      // Ensure pending photos are uploaded before final submit
      const pendingPhotos = (formData.propertyPhotos || []).filter(p => !p.uploaded && p.uri);
      if (pendingPhotos.length > 0 && loanId) {
        try {
          const fdPhotos = new FormData();
          pendingPhotos.forEach((item, i) => {
            const isVid = item.type === 'video' || (item.uri && (item.uri.toLowerCase().endsWith('.mp4') || item.uri.toLowerCase().endsWith('.mov')));
            fdPhotos.append('photos', {
              uri: Platform.OS === 'android' ? item.uri : item.uri.replace('file://', ''),
              name: isVid ? `photo_vid_${Date.now()}_${i}.mp4` : `photo_${Date.now()}_${i}.jpg`,
              type: isVid ? 'video/mp4' : 'image/jpeg'
            });
          });
          await uploadPropertyPhotos(loanId, fdPhotos);
          setFormData(d => ({
            ...d,
            propertyPhotos: (d.propertyPhotos || []).map(p => ({ ...p, uploaded: true }))
          }));
        } catch (pErr) {
          console.warn('Submit photos upload error:', pErr);
        }
      }
      // Ensure pending documents are uploaded before final submit
      const pendingDocs = (formData.propertyDocs || []).filter(d => !d.uploaded && d.uri);
      if (pendingDocs.length > 0 && loanId) {
        for (const pDoc of pendingDocs) {
          try {
            const fdDoc = new FormData();
            const recognizedStd = getStandardDocTitle({ docType: pDoc.docType, name: pDoc.name });
            const effectiveDocType = (pDoc.docType === 'Custom Document' && recognizedStd) ? recognizedStd : (pDoc.docType || 'Custom Document');
            fdDoc.append('document', {
              uri: Platform.OS === 'android' ? pDoc.uri : pDoc.uri.replace('file://', ''),
              name: pDoc.name || 'document',
              type: pDoc.mimeType || 'application/pdf',
            });
            fdDoc.append('docType', effectiveDocType);
            fdDoc.append('name', pDoc.name || 'Document');
            fdDoc.append('date', pDoc.date || formatDate(new Date()));
            await uploadRegistryDocument(loanId, fdDoc, {
              docType: effectiveDocType,
              name: pDoc.name || 'Document',
              date: pDoc.date || formatDate(new Date()),
            });
            setFormData(d => ({
              ...d,
              propertyDocs: (d.propertyDocs || []).map(item => item.id === pDoc.id ? { ...item, uploaded: true, uri: item.localUri || item.uri } : item)
            }));
          } catch (dErr) {
            console.warn('Submit doc upload error:', dErr);
          }
        }
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
        {step === 0 && <Step1 data={formData} setData={setFormData} loanId={loanId} setLoanId={setLoanId} />}
        {step === 1 && <Step2 data={formData} setData={setFormData} loanId={loanId} setLoanId={setLoanId} />}
        {step === 2 && <Step3 data={formData} setData={setFormData} />}
        {step === 3 && <Step4 data={formData} loanId={loanId} />}
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