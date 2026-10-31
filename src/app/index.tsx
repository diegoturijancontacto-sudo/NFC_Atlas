import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL =
  'https://script.google.com/macros/s/AKfycbxhfk9X86NZY6nhPzjiQtmUUoglYv1q5sZcEudiOc1QjT8P-25N0umBRyr2QwhcThR4JA/exec';
const CERTIFICATE_URL = 'https://rtbrok.mx/Certificados/';

type Certificate = {
  id: string;
  nombreObra?: string;
  autor?: string;
  categoria?: string;
  certificadoUrl?: string;
};

export default function HomeScreen() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCertificates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}?action=list`);
      if (!response.ok) throw new Error('No se pudo consultar el registro.');
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        certificados?: Certificate[];
      };
      if (!payload.ok) throw new Error(payload.message || 'La API devolvió un error.');
      setCertificates(Array.isArray(payload.certificados) ? payload.certificados : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Error al cargar certificados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCertificates();
  }, [loadCertificates]);

  const filteredCertificates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return certificates;
    return certificates.filter((certificate) =>
      [certificate.id, certificate.nombreObra, certificate.autor]
        .some((value) => value?.toLocaleLowerCase().includes(normalized)),
    );
  }, [certificates, query]);

  const writeCertificate = async () => {
    if (!selectedId || writing) return;
    if (Platform.OS === 'web') {
      setError('La escritura NFC requiere la app instalada en un iPhone compatible.');
      return;
    }

    setWriting(true);
    setError('');
    setNotice('Acerca el iPhone al chip NFC…');
    let sessionRequested = false;
    let cancelNfcSession: (() => Promise<void>) | undefined;
    try {
      // Load the native module only when NFC is used. Importing it at module
      // scope crashes Expo Go before Expo Router can load this screen.
      const { default: NfcManager, Ndef, NfcTech } = await import('react-native-nfc-manager');
      cancelNfcSession = () => NfcManager.cancelTechnologyRequest();
      await NfcManager.start();
      if (!(await NfcManager.isSupported(NfcTech.Ndef))) {
        throw new Error('Este dispositivo no admite etiquetas NFC NDEF.');
      }
      sessionRequested = true;
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: 'Acerca el iPhone a una etiqueta NFC para escribir el certificado.',
      });
      const url = `${CERTIFICATE_URL}${selectedId}`;
      await NfcManager.writeNdefMessage(Ndef.encodeMessage([Ndef.uriRecord(url)]));
      setNotice(`Certificado escrito correctamente: ${url}`);
    } catch (cause) {
      setNotice('');
      const message = cause instanceof Error ? cause.message : '';
      setError(message.includes('native module is unavailable')
        ? 'NFC requiere una Development Build instalada. Expo Go no incluye este módulo nativo.'
        : message || 'No se pudo escribir el chip NFC.');
    } finally {
      if (sessionRequested && cancelNfcSession) {
        try {
          await cancelNfcSession();
        } catch {
          // La sesión puede haberse cerrado automáticamente en iOS.
        }
      }
      setWriting(false);
    }
  };

  const selected = certificates.find((certificate) => certificate.id === selectedId);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={filteredCertificates}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadCertificates} tintColor="#b89456" />}
        ListHeaderComponent={(
          <View>
            <Text style={styles.eyebrow}>RTBROK · CERTIFICADOS</Text>
            <Text style={styles.title}>Escribe un certificado</Text>
            <Text style={styles.subtitle}>Selecciona un certificado y acércalo a un chip NFC para guardar su enlace.</Text>
            <TextInput
              accessibilityLabel="Buscar certificados"
              placeholder="Buscar por obra, autor o ID"
              placeholderTextColor="#858585"
              value={query}
              onChangeText={setQuery}
              style={styles.search}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            {!!notice && <Text style={styles.notice}>{notice}</Text>}
            {loading && certificates.length === 0 && <ActivityIndicator color="#b89456" style={styles.loader} />}
            {!loading && !error && certificates.length === 0 && (
              <Text style={styles.empty}>No hay certificados disponibles en el registro.</Text>
            )}
            {!loading && certificates.length > 0 && filteredCertificates.length === 0 && (
              <Text style={styles.empty}>No hay resultados para esa búsqueda.</Text>
            )}
            <Text style={styles.sectionLabel}>REGISTRO · {certificates.length}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const active = item.id === selectedId;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => { setSelectedId(item.id); setNotice(''); setError(''); }}
              style={[styles.card, active && styles.cardSelected]}>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.nombreObra || 'Certificado'}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>{item.autor || 'Autor no especificado'}</Text>
                <Text style={styles.cardId}>{item.id}</Text>
              </View>
              <Text style={[styles.radio, active && styles.radioSelected]}>{active ? '✓' : '+'}</Text>
            </Pressable>
          );
        }}
        ListFooterComponent={<View style={styles.footerSpace} />}
      />
      <View style={styles.bottomBar}>
        <Text style={styles.selectedLabel} numberOfLines={1}>
          {selected ? `SELECCIONADO · ${selected.nombreObra || selected.id}` : 'ELIGE UN CERTIFICADO'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !selectedId || writing }}
          disabled={!selectedId || writing}
          onPress={writeCertificate}
          style={[styles.writeButton, (!selectedId || writing) && styles.writeButtonDisabled]}>
          {writing ? <ActivityIndicator color="#151515" /> : <Text style={styles.writeButtonText}>ESCRIBIR EN NFC</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#111111' },
  content: { paddingHorizontal: 22, paddingTop: 24 },
  eyebrow: { color: '#b89456', fontSize: 11, fontWeight: '700', letterSpacing: 2.4 },
  title: { color: '#f5f1e8', fontSize: 32, fontWeight: '600', marginTop: 12, letterSpacing: -0.8 },
  subtitle: { color: '#aaa69e', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 22 },
  search: { backgroundColor: '#1c1c1b', borderColor: '#33312d', borderWidth: 1, borderRadius: 12, color: '#f5f1e8', paddingHorizontal: 15, paddingVertical: 14, fontSize: 15 },
  sectionLabel: { color: '#77746d', fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginTop: 28, marginBottom: 12 },
  card: { alignItems: 'center', backgroundColor: '#1a1a19', borderColor: '#2e2d2a', borderWidth: 1, borderRadius: 14, flexDirection: 'row', marginBottom: 10, minHeight: 83, paddingHorizontal: 16, paddingVertical: 13 },
  cardSelected: { borderColor: '#b89456', backgroundColor: '#211f1a' },
  cardText: { flex: 1, gap: 4 },
  cardTitle: { color: '#f4f0e7', fontSize: 16, fontWeight: '600' },
  cardMeta: { color: '#aaa69e', fontSize: 13 },
  cardId: { color: '#77746d', fontSize: 10, letterSpacing: 1.3, marginTop: 3 },
  radio: { borderColor: '#5c5952', borderRadius: 20, borderWidth: 1, color: '#89857d', fontSize: 16, height: 28, lineHeight: 26, overflow: 'hidden', textAlign: 'center', width: 28 },
  radioSelected: { backgroundColor: '#b89456', borderColor: '#b89456', color: '#151515', fontWeight: '700' },
  error: { backgroundColor: '#381f1d', borderRadius: 10, color: '#f3aaa2', fontSize: 13, lineHeight: 19, marginTop: 14, padding: 12 },
  notice: { color: '#d1bd95', fontSize: 13, lineHeight: 19, marginTop: 14 },
  empty: { color: '#aaa69e', fontSize: 14, lineHeight: 21, marginTop: 20 },
  loader: { marginTop: 24 },
  footerSpace: { height: 18 },
  bottomBar: { backgroundColor: '#171716', borderColor: '#302f2b', borderTopWidth: 1, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 12 },
  selectedLabel: { color: '#aaa69e', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 10 },
  writeButton: { alignItems: 'center', backgroundColor: '#c6a66b', borderRadius: 12, justifyContent: 'center', minHeight: 52 },
  writeButtonDisabled: { backgroundColor: '#514a3e' },
  writeButtonText: { color: '#171512', fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
});
