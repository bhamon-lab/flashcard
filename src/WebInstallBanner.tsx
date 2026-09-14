import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from './theme';
import { detectWebInstallTarget, getLatestApkDownloadUrl, type WebInstallTarget } from './app-update';

const DISMISS_KEY = 'reviz.installBannerDismissedAt';
const DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

const wasDismissedRecently = () => {
  if (Platform.OS !== 'web') return true;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    const dismissedAt = raw ? Number(raw) : 0;
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_DURATION_MS;
  } catch {
    return true;
  }
};

const dismiss = () => {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Stockage indisponible : la bannière réapparaîtra au prochain rendu.
  }
};

/** Sur la PWA : propose l'APK GitHub à Android, le guide « Sur l'écran d'accueil » à iPhone. */
export function WebInstallBanner() {
  const [target, setTarget] = useState<WebInstallTarget | null>(null);
  const [hidden, setHidden] = useState(true);
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  const [apkLoading, setApkLoading] = useState(false);

  useEffect(() => {
    if (wasDismissedRecently()) return;
    const detected = detectWebInstallTarget();
    if (!detected) return;
    setTarget(detected);
    setHidden(false);
  }, []);

  useEffect(() => {
    if (target !== 'android-apk') return;
    let cancelled = false;
    void getLatestApkDownloadUrl().then((url) => {
      if (!cancelled) setApkUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (hidden || !target) return null;

  const close = () => {
    dismiss();
    setHidden(true);
  };

  const downloadApk = async () => {
    setApkLoading(true);
    try {
      const url = apkUrl ?? await getLatestApkDownloadUrl();
      if (url) void Linking.openURL(url);
    } finally {
      setApkLoading(false);
    }
  };

  return (
    <View style={styles.banner}>
      <Pressable style={styles.close} onPress={close} hitSlop={10}>
        <Ionicons name="close" size={16} color={colors.muted} />
      </Pressable>
      <View style={styles.iconTile}>
        <Ionicons name={target === 'android-apk' ? 'download-outline' : 'phone-portrait-outline'} size={20} color={colors.blue} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>{target === 'android-apk' ? 'Installer Réviz’ sur ton téléphone' : 'Ajoute Réviz’ à ton écran d’accueil'}</Text>
        {target === 'android-apk' ? (
          <>
            <Text style={styles.subtitle}>Télécharge l’application Android depuis la dernière version GitHub.</Text>
            <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} disabled={apkLoading} onPress={() => void downloadApk()}>
              <Ionicons name="download" size={15} color={colors.white} />
              <Text style={styles.buttonLabel}>{apkLoading ? 'Préparation…' : 'Télécharger l’APK'}</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.subtitle}>
            Touche le bouton <Text style={styles.keyword}>Partager</Text> en bas de Safari, puis <Text style={styles.keyword}>« Sur l’écran d’accueil »</Text> pour installer l’application.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginTop: 16,
    gap: 12,
  },
  close: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  iconTile: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 6, paddingRight: 20 },
  title: { fontSize: 14, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 12.5, lineHeight: 18, color: colors.muted },
  keyword: { fontWeight: '700', color: colors.blue },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    backgroundColor: colors.blue,
    borderRadius: radius.small,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginTop: 2,
  },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: colors.white, fontSize: 13, fontWeight: '700' },
});
