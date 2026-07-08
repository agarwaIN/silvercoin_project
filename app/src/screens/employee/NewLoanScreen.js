import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import {
  createLoan, updateLoan, submitLoan,
  uploadVideo, uploadPropertyPhotos, uploadRegistryDocument,
} from '../../api/employeeApi';
import { usePopup } from '../../context/PopupContext';
import Header from '../../components/Header';

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

// ─── Reusable Components ──────────────────────────────────────────────────────
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

// ─── STEP 1: Owner & Verification ─────────────────────────────────────────────
function Step1({ data, setData, loanId }) {
  const [ifscLoading, setIfscLoading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const player = useVideoPlayer(data.videoUri || null, p => { p.loop = false; });

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

  const pickAndUploadVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access to record video.'); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 60,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    setData(d => ({ ...d, videoUri: uri, videoUploaded: false }));
    if (!loanId) return;
    setVideoUploading(true);
    try {
      const fd = new FormData();
      fd.append('video', { uri, name: 'owner_video.mp4', type: 'video/mp4' });
      await uploadVideo(loanId, fd);
      setData(d => ({ ...d, videoUploaded: true }));
    } catch {
      Alert.alert('Upload failed', 'Video saved locally. Will retry on submit.');
    } finally { setVideoUploading(false); }
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

      {/* Owner Verification Video */}
      <View style={{ marginTop: 20, marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
          Owner Verification Video <Text style={{ color: colors.error }}>*</Text>
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4, marginBottom:4 }}>
          Record the owner stating their name, property details, and loan purpose. Max 60 seconds.
        </Text>
        {data.videoUri ? (
          <>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 6, marginBottom: 8 }}>
              Preview — play to verify. Tap Re-record to replace.
            </Text>
            <VideoView
              player={player}
              style={{ width: '100%', height: 220, borderRadius: 10, backgroundColor: '#000', marginBottom: 12 }}
              allowsFullscreen
              allowsPictureInPicture
            />
            {data.videoUploaded && <Text style={{ fontSize: 12, color: colors.success, marginBottom: 8 }}>✓ Video uploaded successfully</Text>}
          </>
        ) : null}
        <TouchableOpacity style={vid.btn} onPress={pickAndUploadVideo} disabled={videoUploading}>
          <View style={vid.inner}>
            {videoUploading
              ? <ActivityIndicator color={colors.dark} />
              : <Ionicons name="videocam" size={28} color={colors.dark} />}
            <Text style={vid.text}>
              {videoUploading ? 'Uploading video...' : data.videoUri ? 'Re-record / replace video' : 'Record verification video'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const vid = StyleSheet.create({
  btn: { borderWidth: 1.5, borderColor: colors.dark, borderStyle: 'dashed', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 8 },
  inner: { alignItems: 'center', gap: 8 },
  text: { fontSize: 13, color: colors.dark, fontWeight: '600' },
});

// ─── STEP 2: Property Details ──────────────────────────────────────────────────
function Step2({ data, setData, loanId }) {
  const [locLoading, setLocLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);

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
      const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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

  const pickAndUploadDoc = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const doc = result.assets[0];
    const newDoc = { uri: doc.uri, name: doc.name, id: Date.now().toString(), uploaded: false, mimeType: doc.mimeType };
    setData(d => ({ ...d, propertyDocs: [...(d.propertyDocs || []), newDoc] }));
    if (!loanId) return;
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append('document', { uri: doc.uri, name: doc.name, type: doc.mimeType || 'application/pdf' });
      await uploadRegistryDocument(loanId, fd);
      setData(d => ({ ...d, propertyDocs: d.propertyDocs.map(d2 => d2.id === newDoc.id ? { ...d2, uploaded: true } : d2) }));
    } catch {
      Alert.alert('Upload notice', 'Document saved locally. Will retry on submit.');
    } finally { setDocUploading(false); }
  };

  const removeDoc = (id) => setData(d => ({ ...d, propertyDocs: d.propertyDocs.filter(doc => doc.id !== id) }));
  const openDoc = (uri) => Linking.openURL(uri).catch(() => Alert.alert('Error', 'Could not open document.'));

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

      {/* ── Property Registry ── */}
      <FieldLabel text="Property registry (optional)" />
      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 10 }}>
        Upload the property registry paper as PDF or a clear photo. You can preview after upload.
      </Text>

      <TouchableOpacity style={docS.uploadBtn} onPress={pickAndUploadDoc} disabled={docUploading}>
        {docUploading
          ? <ActivityIndicator color={colors.white} size="small" />
          : <Ionicons name="document-attach-outline" size={20} color={colors.white} />}
        <Text style={docS.uploadTxt}>
          {docUploading ? 'Uploading...' : (data.propertyDocs || []).length > 0 ? 'Replace registry document' : 'Upload registry document'}
        </Text>
      </TouchableOpacity>

      {(data.propertyDocs || []).map(doc => (
        <View key={doc.id}>
          <View style={docS.row}>
            <Ionicons name="document-text-outline" size={20} color={colors.dark} />
            <Text style={docS.name} numberOfLines={1}>{doc.name}</Text>
            {doc.uploaded && <Ionicons name="checkmark-circle" size={16} color={colors.success} />}
            <TouchableOpacity onPress={() => removeDoc(doc.id)}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={docS.previewBox} onPress={() => openDoc(doc.uri)}>
            <Ionicons name="document-outline" size={36} color={colors.muted} />
            <Text style={docS.previewTxt}>Tap to open PDF</Text>
          </TouchableOpacity>
        </View>
      ))}

      {(data.propertyDocs || []).length === 0 && (
        <View style={docS.previewBox}>
          <Ionicons name="document-outline" size={36} color={colors.muted} />
          <Text style={docS.previewTxt}>Tap to open PDF</Text>
        </View>
      )}
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
        <Row label="Video" value={data.videoUri ? '✓ Recorded' : 'Not recorded'} />
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

// ─── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function NewLoanScreen({ route, navigation }) {
  const { showAlert } = usePopup();
  const existingLoan = route.params?.existingLoan;
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loanId, setLoanId] = useState(existingLoan?.loanId || null);
  const scrollRef = useRef(null);

  const [formData, setFormData] = useState({
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

  const validateStep = () => {
    if (step === 0) {
      if (!formData.ownerName.trim()) { showAlert('Missing', 'Enter owner name.'); return false; }
      if (!formData.ownerMobile.trim()) { showAlert('Missing', 'Enter owner mobile.'); return false; }
      if (!formData.aadhaar.trim()) { showAlert('Missing', 'Enter Aadhaar number.'); return false; }
      if (!formData.videoUri) { showAlert('Missing', 'Record owner verification video.'); return false; }
    }
    if (step === 1) {
      if (!formData.propertyPhotos.length) { showAlert('Missing', 'Add at least one property photo.'); return false; }
      if (!formData.propertyArea.trim()) { showAlert('Missing', 'Enter property area.'); return false; }
      if (!formData.geoLat) { showAlert('Missing', 'Capture geo location.'); return false; }
    }
    if (step === 2) {
      if (!formData.loanAmount.trim()) { showAlert('Missing', 'Enter loan amount.'); return false; }
      if (!formData.loanPurpose.trim()) { showAlert('Missing', 'Enter loan purpose.'); return false; }
    }
    return true;
  };

  const handleNext = async () => {
    // if (!validateStep()) return;
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
        if (formData.videoUri && !formData.videoUploaded) {
          const fd = new FormData();
          fd.append('video', { uri: formData.videoUri, name: 'owner_video.mp4', type: 'video/mp4' });
          await uploadVideo(currentLoanId, fd);
          setFormData(d => ({ ...d, videoUploaded: true }));
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
    if (step > 0) {
      setStep(s => s - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      navigation.goBack();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await submitLoan(loanId);
      showAlert('Submitted!', 'Loan application submitted successfully.');
      navigation.goBack();
    } catch (err) {
      showAlert('Error', err.response?.data?.message || 'Could not submit loan.');
    } finally { setLoading(false); }
  };

  return (
    <View style={ms.safe} edges={['bottom', 'left', 'right']}>
      {/* <View style={ms.header}>
        <TouchableOpacity onPress={handleBack} style={ms.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <View style={ms.logoBox}>
          <Text style={ms.logoText}>S</Text>
        </View>
        <Text style={ms.headerTitle}>New Loan Application</Text>
        <TouchableOpacity style={ms.menuBtn}>
          <Ionicons name="menu" size={24} color={colors.white} />
        </TouchableOpacity>
      </View> */}
  <Header title={"New Loan Application"} onBack={()=>navigation.goBack()} />

      <StepBar current={step} />

      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {step === 0 && <Step1 data={formData} setData={setFormData} loanId={loanId} />}
        {step === 1 && <Step2 data={formData} setData={setFormData} loanId={loanId} />}
        {step === 2 && <Step3 data={formData} setData={setFormData} />}
        {step === 3 && <Step4 data={formData} />}
      </ScrollView>

      {/* Footer — Back + Next/Submit side by side */}
      <View style={ms.footer}>
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
        {/* <Text style={ms.footer_credit}>Made with ❤️ by MANYA SHUKLA · 2026</Text> */}
      </View>
    </View>
  );
}

const ms = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.dark, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  backBtn: { padding: 2 },
  logoBox: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#D4AF37', fontWeight: '900', fontSize: 16 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.white },
  menuBtn: { padding: 2 },
  footer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  footerRow: { flexDirection: 'row', gap: 10 },
  backBtnFooter: { flex: 1, borderWidth: 1, borderColor: colors.dark, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.white },
  backTxtFooter: { fontSize: 16, fontWeight: '700', color: colors.dark },
  nextBtn: { flex: 2, backgroundColor: colors.dark, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  nextTxt: { fontSize: 16, fontWeight: '700', color: colors.white },
  footer_credit: { textAlign: 'center', fontSize: 11, color: colors.muted, marginTop: 8 },
});