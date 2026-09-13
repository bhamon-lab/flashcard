import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  createDeck,
  deleteCard,
  getCards,
  getDeck,
  getDecks,
  getDecksByIds,
  getNewCards,
  getSessionCards,
  getStatsSnapshot,
  getSubjectPrefs,
  initializeDatabase,
  markCardSeen,
  recordReview,
  resetDeckProgress,
  saveCard,
  setDeckFavorite,
  setSubjectPrefs,
  updateDailyLimit,
  updateReviewDelays,
} from './src/db';
import { colors, mono, radius } from './src/theme';
import { MathView, stripMathText } from './src/MathView';
import { syncDecks } from './src/sync';
import { checkForAppUpdate } from './src/app-update';
import { Card, Deck, ReviewDelay, ReviewDelays } from './src/types';
import { insertLaterInQueue } from './src/sessionQueue';
import type { StatsSnapshot } from './src/db';

type Route =
  | { name: 'home' }
  | { name: 'subject'; subject: string }
  | { name: 'deck'; deckId: number }
  | { name: 'settings'; deckId: number }
  | { name: 'stats' }
  | { name: 'study'; deckIds: number[]; newCardAllowance: number };

/** True si la chaîne contient du LaTeX à rendre ($…$ ou $$…$$). */
const hasMath = (text: string) => text.includes('$');

const formatDelay = (minutes: number) => {
  if (minutes === 0) return 'Immédiatement';
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 1440 === 0) return `${minutes / 1440} jour${minutes === 1440 ? '' : 's'}`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
};

const getDelayOptions = (deck: Deck): Array<{ value: ReviewDelay; title: string; subtitle: string; color: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> => [
  { value: Number(deck.again_delay_minutes), title: formatDelay(Number(deck.again_delay_minutes)), subtitle: 'À la suite', color: colors.redSoft, fg: colors.red, icon: 'refresh' },
  { value: Number(deck.soon_delay_minutes), title: formatDelay(Number(deck.soon_delay_minutes)), subtitle: 'Encore bientôt', color: colors.yellowSoft, fg: '#9A7412', icon: 'timer-outline' },
  { value: Number(deck.later_delay_minutes), title: formatDelay(Number(deck.later_delay_minutes)), subtitle: 'Plus tard', color: colors.blueSoft, fg: colors.blue, icon: 'time-outline' },
  { value: Number(deck.tomorrow_delay_minutes), title: formatDelay(Number(deck.tomorrow_delay_minutes)), subtitle: 'Demain', color: colors.greenSoft, fg: colors.green, icon: 'calendar-outline' },
];

const GLYPHS = ['π', '∑', '√', 'ƒ', 'Δ', '∞', 'θ', 'x²', 'λ', 'Ω', '§', 'æ'];
const glyphFor = (id: number) => GLYPHS[Math.abs(id) % GLYPHS.length];

type SubjectVisual = { icon: keyof typeof Ionicons.glyphMap; tint: string; fg: string };

const SUBJECT_VISUALS: Array<{ match: RegExp } & SubjectVisual> = [
  { match: /math|alg[eè]bre|g[eé]om|calcul|arithm/i, icon: 'calculator', tint: colors.blueSoft, fg: colors.blue },
  { match: /fran[cç]ais|gramm|orthographe|conjug|litt[eé]r/i, icon: 'book', tint: '#EFE7F7', fg: '#6D4FA3' },
  { match: /histoire/i, icon: 'time', tint: colors.redSoft, fg: colors.red },
  { match: /g[eé]ogr/i, icon: 'earth', tint: '#E4F3F7', fg: '#1E7E8C' },
  { match: /anglais|espagnol|allemand|latin|langue/i, icon: 'language', tint: colors.greenSoft, fg: colors.green },
  { match: /physique|chimie|science/i, icon: 'flask', tint: colors.greenSoft, fg: colors.green },
  { match: /bio|svt/i, icon: 'leaf', tint: colors.greenSoft, fg: colors.green },
  { match: /philo/i, icon: 'bulb', tint: colors.yellowSoft, fg: '#9A7412' },
  { match: /musique|art/i, icon: 'musical-notes', tint: colors.yellowSoft, fg: '#9A7412' },
  { match: /tech|info|num[eé]rique|code/i, icon: 'hardware-chip', tint: '#E4F3F7', fg: '#1E7E8C' },
];

const DEFAULT_SUBJECT_VISUAL: SubjectVisual = { icon: 'school', tint: colors.blueSoft, fg: colors.blue };

function subjectVisual(subject: string): SubjectVisual {
  return SUBJECT_VISUALS.find((entry) => entry.match.test(subject)) ?? DEFAULT_SUBJECT_VISUAL;
}

type SubjectGroup = { name: string; decks: Deck[] };

/** Regroupe les paquets par matière (comparaison insensible à la casse). */
function groupBySubject(decks: Deck[]): SubjectGroup[] {
  const groups = new Map<string, SubjectGroup>();
  for (const deck of decks) {
    const name = deck.subject?.trim() || 'Divers';
    const key = name.toLowerCase();
    const group = groups.get(key) ?? { name, decks: [] };
    group.decks.push(deck);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function Grid({ tint = colors.grid, step = 26 }: { tint?: string; step?: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
      }}
    >
      {Array.from({ length: Math.ceil(size.height / step) }, (_, index) => (
        <View key={`h${index}`} style={{ position: 'absolute', left: 0, right: 0, top: index * step, height: 1, backgroundColor: tint }} />
      ))}
      {Array.from({ length: Math.ceil(size.width / step) }, (_, index) => (
        <View key={`v${index}`} style={{ position: 'absolute', top: 0, bottom: 0, left: index * step, width: 1, backgroundColor: tint }} />
      ))}
    </View>
  );
}

function IconButton({ name, onPress, label }: { name: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Ionicons name={name} size={21} color={colors.ink} />
    </Pressable>
  );
}

function PrimaryButton({ label, onPress, icon, disabled = false }: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, disabled && styles.disabled, pressed && styles.pressed]}>
      {icon ? <Ionicons name={icon} size={19} color={colors.white} /> : null}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function CardSymbol({ card, size = 64, tone = 'ink' }: { card: Pick<Card, 'id'>; size?: number; tone?: 'ink' | 'chalk' }) {
  return (
    <View
      style={[
        styles.symbolTile,
        { width: size, height: size, borderRadius: size / 2 },
        tone === 'chalk' && styles.symbolTileChalk,
      ]}
    >
      <Text style={[styles.symbolGlyph, { fontSize: size * 0.4 }, tone === 'chalk' && styles.symbolGlyphChalk]}>{glyphFor(card.id)}</Text>
    </View>
  );
}

function CardImage({ card, style }: { card: Card; style: object }) {
  if (!card.photo_uri) return <CardSymbol card={card} size={52} />;
  return <Image source={{ uri: card.photo_uri }} style={style} resizeMode="cover" />;
}

/** Un paquet est visible s'il est marqué favori (les paquets synchronisés non favoris restent cachés). */
const isFavorite = (deck: Deck) => Number(deck.favorite) > 0;

function DeckCard({ deck, onOpen, onToggleFavorite }: { deck: Deck; onOpen: (id: number) => void; onToggleFavorite: (id: number) => void }) {
  const progress = deck.total_count ? Math.round((Number(deck.learned_count) / Number(deck.total_count)) * 100) : 0;
  const favorite = isFavorite(deck);
  return (
    <Pressable onPress={() => onOpen(deck.id)} style={({ pressed }) => [styles.deckCard, pressed && styles.cardPressed]}>
      <View style={[styles.deckMark, { backgroundColor: deck.color }]}>
        <Text style={styles.deckMarkGlyph}>{glyphFor(deck.id)}</Text>
      </View>
      <View style={styles.deckBody}>
        <View style={styles.deckTitleRow}>
          <Text style={styles.deckTitle} numberOfLines={1}>{deck.title}</Text>
          <Pressable
            onPress={() => onToggleFavorite(deck.id)}
            accessibilityLabel={favorite ? `Retirer ${deck.title} des favoris` : `Ajouter ${deck.title} aux favoris`}
            style={({ pressed }) => [styles.starButton, pressed && styles.pressed]}
          >
            <Ionicons name={favorite ? 'star' : 'star-outline'} size={20} color={favorite ? '#D9A112' : colors.muted} />
          </Pressable>
        </View>
        <Text style={styles.deckDescription} numberOfLines={1}>{stripMathText(deck.description) || `${deck.total_count} cartes`}</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
        <View style={styles.deckMeta}>
          <Text style={styles.deckMetaText}>{progress}% appris</Text>
          <View style={styles.duePill}><Text style={styles.duePillText}>{deck.due_count} à revoir</Text></View>
        </View>
      </View>
    </Pressable>
  );
}

function HomeScreen({ onOpenSubject, onStudy, onOpenStats }: { onOpenSubject: (subject: string) => void; onStudy: (deckIds: number[], newCardAllowance: number) => void; onOpenStats: () => void }) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [prefs, setPrefs] = useState<{ hidden: string[]; custom: string[] }>({ hidden: [], custom: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [mixOpen, setMixOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const load = useCallback(async () => {
    const [nextDecks, nextPrefs] = await Promise.all([getDecks(), getSubjectPrefs()]);
    setDecks(nextDecks);
    setPrefs(nextPrefs);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const runSync = useCallback(async (announce: boolean) => {
    setSyncing(true);
    try {
      const result = await syncDecks();
      if (announce) {
        const parts: string[] = [];
        if (result.created) parts.push(`${result.created} nouveau${result.created > 1 ? 'x' : ''} paquet${result.created > 1 ? 's' : ''}`);
        if (result.updated) parts.push(`${result.updated} mis${result.updated > 1 ? 's' : ''} à jour`);
        if (result.removed) parts.push(`${result.removed} supprimé${result.removed > 1 ? 's' : ''}`);
        setSyncNote(parts.length ? `Synchronisé · ${parts.join(', ')}` : 'Paquets déjà à jour');
      }
    } catch {
      if (announce) setSyncNote('Synchronisation impossible (hors ligne ?)');
    } finally {
      setSyncing(false);
      await load();
    }
  }, [load]);

  // Synchronise les paquets du dépôt à l'ouverture de l'app.
  useEffect(() => { void runSync(false); }, [runSync]);
  useEffect(() => {
    if (!syncNote) return;
    const timer = setTimeout(() => setSyncNote(''), 5000);
    return () => clearTimeout(timer);
  }, [syncNote]);

  const subjects = groupBySubject(decks);
  const customOnly = prefs.custom
    .filter((name) => !subjects.some((group) => group.name.toLowerCase() === name.trim().toLowerCase()))
    .map((name) => ({ name: name.trim(), decks: [] as Deck[] }))
    .filter((group) => group.name.length > 0);
  const allSubjects = [...subjects, ...customOnly];
  const hiddenKeys = new Set(prefs.hidden.map((name) => name.toLowerCase()));
  const visibleSubjects = allSubjects.filter((group) => !hiddenKeys.has(group.name.toLowerCase()));

  const dueTotal = decks.filter(isFavorite).reduce((sum, deck) => sum + Number(deck.due_count), 0);
  const total = decks.filter(isFavorite).reduce((sum, deck) => sum + Number(deck.total_count), 0);

  const updatePrefs = async (next: { hidden: string[]; custom: string[] }) => {
    setPrefs(next);
    await setSubjectPrefs(next);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing || syncing}
            onRefresh={async () => { setRefreshing(true); await runSync(true); setRefreshing(false); }}
          />
        )}
      >
        <View style={styles.homeHeader}>
          <View>
            <Text style={styles.eyebrow}>MÉMENTO · MATIÈRES</Text>
            <Text style={styles.heroTitle}>Tout ce qui{`\n`}reste en tête.</Text>
          </View>
          <View style={styles.homeHeaderActions}>
            <IconButton name="stats-chart" label="Statistiques" onPress={onOpenStats} />
            <View style={styles.avatar}><Ionicons name="school" size={20} color={colors.blue} /></View>
          </View>
        </View>

        <View style={styles.todayCard}>
          <Grid tint={colors.gridChalk} step={28} />
          <View style={styles.todayCopy}>
            <Text style={styles.todayLabel}>À FAIRE AUJOURD’HUI</Text>
            <Text style={styles.todayNumber}>{dueTotal}</Text>
            <Text style={styles.todayText}>{dueTotal === 1 ? 'carte à revoir' : 'cartes à revoir'}</Text>
          </View>
          <View style={styles.todayIllustration}>
            <View style={styles.stackCardBack} />
            <View style={styles.stackCardFront}><Text style={styles.stackCardGlyph}>∑</Text></View>
          </View>
        </View>

        <Pressable onPress={() => setMixOpen(true)} style={({ pressed }) => [styles.mixCard, pressed && styles.cardPressed]}>
          <View style={styles.mixIcon}><Ionicons name="shuffle" size={22} color={colors.ink} /></View>
          <View style={styles.mixCopy}>
            <Text style={styles.mixTitle}>Session mixte</Text>
            <Text style={styles.mixCaption}>Mélange les paquets de ton choix dans une seule révision</Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.muted} />
        </Pressable>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Mes matières</Text>
            <Text style={styles.sectionCaption}>{syncing ? 'Synchronisation…' : syncNote || `${visibleSubjects.length} ${visibleSubjects.length === 1 ? 'matière' : 'matières'} · ${total} ${total === 1 ? 'carte' : 'cartes'}`}</Text>
          </View>
          <Pressable onPress={() => setEditorOpen(true)} accessibilityLabel="Modifier les matières" style={({ pressed }) => [styles.addRound, pressed && styles.pressed]}>
            <Ionicons name="options" size={22} color={colors.white} />
          </Pressable>
        </View>

        {visibleSubjects.map((group) => {
          const visual = subjectVisual(group.name);
          const favoriteDecks = group.decks.filter(isFavorite);
          const groupDue = favoriteDecks.reduce((sum, deck) => sum + Number(deck.due_count), 0);
          const groupCards = favoriteDecks.reduce((sum, deck) => sum + Number(deck.total_count), 0);
          return (
            <Pressable
              key={group.name.toLowerCase()}
              onPress={() => onOpenSubject(group.name)}
              style={({ pressed }) => [styles.subjectCard, pressed && styles.cardPressed]}
            >
              <View style={[styles.subjectIcon, { backgroundColor: visual.tint }]}>
                <Ionicons name={visual.icon} size={23} color={visual.fg} />
              </View>
              <View style={styles.subjectBody}>
                <View style={styles.deckTitleRow}>
                  <Text style={styles.subjectTitle} numberOfLines={1}>{group.name}</Text>
                  <Ionicons name="chevron-forward" size={19} color={colors.muted} />
                </View>
                <View style={styles.subjectMeta}>
                  <Text style={styles.subjectMetaText}>
                    {favoriteDecks.length === 0 ? 'Aucun paquet favori' : `${favoriteDecks.length} ${favoriteDecks.length === 1 ? 'paquet' : 'paquets'} · ${groupCards} ${groupCards === 1 ? 'carte' : 'cartes'}`}
                  </Text>
                  {groupDue > 0 ? <View style={styles.duePill}><Text style={styles.duePillText}>{groupDue} à revoir</Text></View> : null}
                </View>
              </View>
            </Pressable>
          );
        })}

        {!visibleSubjects.length ? (
          <Pressable onPress={() => setEditorOpen(true)} style={styles.newDeckCard}>
            <View style={styles.newDeckIcon}><Ionicons name="add" size={24} color={colors.blue} /></View>
            <View><Text style={styles.newDeckTitle}>Aucune matière visible</Text><Text style={styles.newDeckCaption}>Choisis les matières à afficher</Text></View>
          </Pressable>
        ) : null}

        <CustomSessionSheet
          visible={mixOpen}
          decks={decks.filter(isFavorite)}
          onClose={() => setMixOpen(false)}
          onStart={(deckIds, newCardAllowance) => { setMixOpen(false); onStudy(deckIds, newCardAllowance); }}
        />

        <SubjectsEditorModal
          visible={editorOpen}
          subjects={allSubjects}
          hidden={prefs.hidden}
          custom={prefs.custom}
          onClose={() => setEditorOpen(false)}
          onChange={updatePrefs}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function SubjectsEditorModal({ visible, subjects, hidden, custom, onClose, onChange }: {
  visible: boolean;
  subjects: SubjectGroup[];
  hidden: string[];
  custom: string[];
  onClose: () => void;
  onChange: (prefs: { hidden: string[]; custom: string[] }) => void;
}) {
  const [draftName, setDraftName] = useState('');
  useEffect(() => {
    if (visible) setDraftName('');
  }, [visible]);

  const hiddenKeys = new Set(hidden.map((name) => name.toLowerCase()));
  const toggle = (name: string) => {
    const key = name.toLowerCase();
    const next = hiddenKeys.has(key) ? hidden.filter((entry) => entry.toLowerCase() !== key) : [...hidden, name];
    onChange({ hidden: next, custom });
  };
  const addSubject = () => {
    const name = draftName.trim();
    if (!name) return;
    if (subjects.some((group) => group.name.toLowerCase() === name.toLowerCase())) {
      toggle(name);
      setDraftName('');
      return;
    }
    if (custom.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
      setDraftName('');
      return;
    }
    onChange({ hidden: hidden.filter((entry) => entry.toLowerCase() !== name.toLowerCase()), custom: [...custom, name] });
    setDraftName('');
  };
  const removeCustom = (name: string) => {
    onChange({ hidden, custom: custom.filter((entry) => entry !== name) });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Mes matières</Text>
          <Text style={styles.sheetText}>Choisis les matières affichées sur l’accueil, ou ajoute les tiennes pour y ranger tes paquets.</Text>
          <ScrollView style={styles.subjectEditorList} nestedScrollEnabled>
            {subjects.map((group, index) => {
              const visual = subjectVisual(group.name);
              const isHidden = hiddenKeys.has(group.name.toLowerCase());
              const isCustom = custom.some((entry) => entry.toLowerCase() === group.name.toLowerCase());
              return (
                <View key={group.name.toLowerCase()} style={[styles.subjectEditorRow, index < subjects.length - 1 && styles.subjectEditorRowBorder]}>
                  <View style={[styles.subjectEditorIcon, { backgroundColor: visual.tint }]}>
                    <Ionicons name={visual.icon} size={18} color={visual.fg} />
                  </View>
                  <View style={styles.subjectEditorCopy}>
                    <Text style={styles.subjectEditorTitle} numberOfLines={1}>{group.name}</Text>
                    <Text style={styles.subjectEditorMeta}>{group.decks.length === 0 ? 'Vide' : `${group.decks.length} ${group.decks.length === 1 ? 'paquet' : 'paquets'}`}</Text>
                  </View>
                  {isCustom && group.decks.length === 0 ? (
                    <Pressable onPress={() => removeCustom(group.name)} accessibilityLabel={`Supprimer ${group.name}`} style={styles.subjectEditorAction}>
                      <Ionicons name="trash-outline" size={19} color={colors.red} />
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => toggle(group.name)}
                    accessibilityLabel={isHidden ? `Afficher ${group.name}` : `Masquer ${group.name}`}
                    style={[styles.subjectEditorAction, isHidden && styles.subjectEditorActionOff]}
                  >
                    <Ionicons name={isHidden ? 'eye-off' : 'eye'} size={19} color={isHidden ? colors.muted : colors.blue} />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
          <Text style={styles.manualLabel}>AJOUTER UNE MATIÈRE</Text>
          <View style={styles.customRow}>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Ex. Physique-chimie"
              placeholderTextColor="#9AA0B2"
              style={styles.customInput}
              onSubmitEditing={addSubject}
              returnKeyType="done"
            />
            <Pressable onPress={addSubject} accessibilityLabel="Ajouter la matière" style={styles.customGo}><Ionicons name="add" size={20} color={colors.white} /></Pressable>
          </View>
          <PrimaryButton label="Terminé" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SubjectScreen({ subject, onBack, onOpenDeck, onStudy, onCreate }: {
  subject: string;
  onBack: () => void;
  onOpenDeck: (deckId: number) => void;
  onStudy: (deckIds: number[], newCardAllowance: number) => void;
  onCreate: (subject: string) => void;
}) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { void getDecks().then(setDecks); }, []);
  const group = groupBySubject(decks).find((entry) => entry.name.toLowerCase() === subject.toLowerCase())
    ?? { name: subject, decks: [] as Deck[] };

  const favoriteDecks = group.decks.filter(isFavorite);
  const visibleDecks = showAll ? group.decks : favoriteDecks;

  const toggleFavorite = async (deckId: number) => {
    const deck = decks.find((entry) => entry.id === deckId);
    if (!deck) return;
    const next = !isFavorite(deck);
    setDecks((current) => current.map((entry) => entry.id === deckId ? { ...entry, favorite: next ? 1 : 0 } : entry));
    await setDeckFavorite(deckId, next);
  };

  const dueTotal = favoriteDecks.reduce((sum, deck) => sum + Number(deck.due_count), 0);
  const newTotal = favoriteDecks.reduce((sum, deck) => sum + Number(deck.new_count), 0);
  const totalCards = favoriteDecks.reduce((sum, deck) => sum + Number(deck.total_count), 0);
  const allowance = favoriteDecks.reduce((sum, deck) => sum + Math.max(0, Number(deck.daily_new_limit) - Number(deck.introduced_today)), 0);
  const sessionCount = dueTotal + Math.min(newTotal, allowance);
  const deckIds = favoriteDecks.map((deck) => deck.id);
  const visual = subjectVisual(group.name);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.topBar}>
          <IconButton name="arrow-back" label="Retour" onPress={onBack} />
          <Text style={styles.topBarTitle} numberOfLines={1}>{group.name}</Text>
          <IconButton name="add" label="Nouveau paquet" onPress={() => onCreate(group.name)} />
        </View>

        <View style={styles.deckHero}>
          <View style={[styles.largeDeckMark, { backgroundColor: visual.tint }]}><Ionicons name={visual.icon} size={30} color={visual.fg} /></View>
          <Text style={styles.deckHeroTitle}>{group.name}</Text>
          <Text style={styles.deckHeroDescription}>{favoriteDecks.length} {favoriteDecks.length === 1 ? 'paquet favori' : 'paquets favoris'} · {totalCards} {totalCards === 1 ? 'carte' : 'cartes'}</Text>
          <View style={styles.statRow}>
            <View style={styles.stat}><Text style={styles.statValue}>{dueTotal}</Text><Text style={styles.statLabel}>À revoir</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{newTotal}</Text><Text style={styles.statLabel}>Nouvelles</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{totalCards}</Text><Text style={styles.statLabel}>Total</Text></View>
          </View>
        </View>

        <View style={styles.sessionPanel}>
          <View style={styles.panelTop}>
            <View><Text style={styles.panelTitle}>Session de matière</Text><Text style={styles.panelCaption}>Les paquets favoris de {group.name} en une file</Text></View>
            <View style={styles.sessionPanelIcon}><Ionicons name="play-circle-outline" size={30} color={colors.blue} /></View>
          </View>
          <PrimaryButton
            label={!favoriteDecks.length ? (group.decks.length ? 'Ajoute un favori pour réviser' : 'Crée un premier paquet') : sessionCount ? `Commencer · ${sessionCount} carte${sessionCount > 1 ? 's' : ''}` : 'Lancer une session'}
            icon="play"
            disabled={!deckIds.length}
            onPress={() => onStudy(deckIds, allowance)}
          />
        </View>

        <View style={styles.sectionHeaderCompact}>
          <Text style={styles.sectionTitle}>{showAll ? 'Tous les paquets' : 'Paquets favoris'}</Text>
          {group.decks.length ? (
            <Pressable onPress={() => setShowAll((value) => !value)} style={({ pressed }) => [styles.filterToggle, pressed && styles.pressed]}>
              <Ionicons name={showAll ? 'star' : 'albums-outline'} size={15} color={colors.blue} />
              <Text style={styles.filterToggleText}>{showAll ? 'Favoris' : `Tous (${group.decks.length})`}</Text>
            </Pressable>
          ) : null}
        </View>

        {visibleDecks.map((deck) => <DeckCard key={deck.id} deck={deck} onOpen={onOpenDeck} onToggleFavorite={toggleFavorite} />)}

        {!showAll && !favoriteDecks.length && group.decks.length ? (
          <Pressable onPress={() => setShowAll(true)} style={styles.newDeckCard}>
            <View style={styles.newDeckIcon}><Ionicons name="star-outline" size={24} color={colors.blue} /></View>
            <View><Text style={styles.newDeckTitle}>Aucun paquet favori</Text><Text style={styles.newDeckCaption}>Affiche tous les paquets pour en choisir</Text></View>
          </Pressable>
        ) : null}

        <Pressable onPress={() => onCreate(group.name)} style={styles.newDeckCard}>
          <View style={styles.newDeckIcon}><Ionicons name="add" size={24} color={colors.blue} /></View>
          <View><Text style={styles.newDeckTitle}>Nouveau paquet</Text><Text style={styles.newDeckCaption}>Créer une nouvelle série de cartes</Text></View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function DeckScreen({ deckId, onBack, onStudy, onSettings }: { deckId: number; onBack: () => void; onStudy: (newCardAllowance: number) => void; onSettings: () => void }) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [editorCard, setEditorCard] = useState<Card | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [manualNewCards, setManualNewCards] = useState<number | null>(null);
  const load = useCallback(async () => {
    const [nextDeck, nextCards] = await Promise.all([getDeck(deckId), getCards(deckId)]);
    setDeck(nextDeck); setCards(nextCards);
  }, [deckId]);
  useEffect(() => { load(); }, [load]);
  const visibleCards = useMemo(() => cards.filter((card) => `${card.first_name} ${card.last_name} ${card.context}`.toLowerCase().includes(query.toLowerCase())), [cards, query]);

  if (!deck) return <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>;
  const hasIntroducedToday = Number(deck.introduced_today) > 0;
  const defaultNewCards = hasIntroducedToday ? 0 : Math.max(0, Number(deck.daily_new_limit));
  const newCardsToAdd = manualNewCards ?? defaultNewCards;
  const sessionCount = Number(deck.due_count) + Math.min(Number(deck.new_count), newCardsToAdd);

  const changeLimit = async (delta: number) => {
    const nextValue = Math.max(0, newCardsToAdd + delta);
    setManualNewCards(nextValue);
    if (!hasIntroducedToday) {
      await updateDailyLimit(deckId, nextValue);
      setDeck((value) => value ? { ...value, daily_new_limit: nextValue } : value);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.topBar}>
          <IconButton name="arrow-back" label="Retour" onPress={onBack} />
          <Text style={styles.topBarTitle}>Paquet</Text>
          <IconButton name="ellipsis-horizontal" label="Réglages du paquet" onPress={onSettings} />
        </View>

        <View style={styles.deckHero}>
          <View style={[styles.largeDeckMark, { backgroundColor: deck.color }]}><Text style={styles.largeDeckGlyph}>{glyphFor(deck.id)}</Text></View>
          <Text style={styles.deckHeroTitle}>{deck.title}</Text>
          <Text style={styles.deckHeroDescription}>{stripMathText(deck.description)}</Text>
          <View style={styles.statRow}>
            <View style={styles.stat}><Text style={styles.statValue}>{deck.due_count}</Text><Text style={styles.statLabel}>À revoir</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{deck.new_count}</Text><Text style={styles.statLabel}>Nouvelles</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{deck.total_count}</Text><Text style={styles.statLabel}>Total</Text></View>
          </View>
        </View>

        <View style={styles.sessionPanel}>
          <View style={styles.panelTop}>
            <View><Text style={styles.panelTitle}>Nouvelles cartes</Text><Text style={styles.panelCaption}>{deck.introduced_today} déjà vues aujourd’hui</Text></View>
            <View style={styles.stepper}>
              <Pressable onPress={() => changeLimit(-1)} style={styles.stepperButton}><Ionicons name="remove" size={18} color={colors.ink} /></Pressable>
              <Text style={styles.stepperValue}>{newCardsToAdd}</Text>
              <Pressable onPress={() => changeLimit(1)} style={styles.stepperButton}><Ionicons name="add" size={18} color={colors.ink} /></Pressable>
            </View>
          </View>
          <PrimaryButton label={sessionCount ? `Commencer · ${sessionCount} carte${sessionCount > 1 ? 's' : ''}` : 'Lancer une session'} icon="play" onPress={() => onStudy(newCardsToAdd)} />
        </View>

        <View style={styles.sectionHeaderCompact}>
          <Text style={styles.sectionTitle}>Les cartes</Text>
          <View style={styles.actionsRow}>
            <Pressable onPress={() => setEditorCard(null)} style={styles.smallAction}><Ionicons name="add" size={19} color={colors.blue} /><Text style={styles.smallActionText}>Ajouter</Text></Pressable>
          </View>
        </View>
        <View style={styles.searchBox}><Ionicons name="search" size={19} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Chercher une question" placeholderTextColor="#9AA0B2" style={styles.searchInput} /></View>

        <View style={styles.cardList}>
          {visibleCards.map((card, index) => (
            <Pressable key={card.id} onPress={() => setEditorCard(card)} style={[styles.cardRow, index < visibleCards.length - 1 && styles.cardRowBorder]}>
              <View style={styles.cardThumbWrap}><CardImage card={card} style={styles.cardThumb} /></View>
              <View style={styles.cardText}>
                <Text style={styles.cardFront} numberOfLines={1}>{stripMathText(card.first_name)}</Text>
                <Text style={styles.cardBack} numberOfLines={1}>{stripMathText(card.last_name || card.context) || 'Pas encore de réponse'}</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: card.first_seen_at ? colors.green : colors.yellow }]} />
              <Ionicons name="chevron-forward" size={18} color="#A9AFC0" />
            </Pressable>
          ))}
          {!visibleCards.length ? <View style={styles.emptyList}><Ionicons name="albums-outline" size={30} color={colors.muted} /><Text style={styles.emptyText}>Aucune carte trouvée</Text></View> : null}
        </View>
      </ScrollView>
      <CardEditor
        visible={editorCard !== undefined}
        deckId={deckId}
        card={editorCard ?? null}
        onClose={() => setEditorCard(undefined)}
        onSaved={async () => { setEditorCard(undefined); await load(); }}
      />
    </SafeAreaView>
  );
}

function DeckSettingsScreen({ deckId, onBack }: { deckId: number; onBack: () => void }) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [delays, setDelays] = useState<ReviewDelays | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDeck(deckId).then((nextDeck) => {
      setDeck(nextDeck);
      if (nextDeck) {
        setDelays({
          again: Number(nextDeck.again_delay_minutes),
          soon: Number(nextDeck.soon_delay_minutes),
          later: Number(nextDeck.later_delay_minutes),
          tomorrow: Number(nextDeck.tomorrow_delay_minutes),
        });
      }
    });
  }, [deckId]);

  const updateDelay = (key: keyof ReviewDelays, value: string) => {
    const parsed = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
    setDelays((current) => current ? { ...current, [key]: Number.isFinite(parsed) ? parsed : 0 } : current);
  };

  const save = async () => {
    if (!delays) return;
    setSaving(true);
    await updateReviewDelays(deckId, delays);
    setSaving(false);
    onBack();
  };

  if (!deck || !delays) return <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>;

  const timerRows: Array<{ key: keyof ReviewDelays; title: string; note: string; icon: keyof typeof Ionicons.glyphMap; tint: string; fg: string }> = [
    { key: 'again', title: 'Immédiatement', note: 'La carte reste dans la session', icon: 'refresh', tint: colors.redSoft, fg: colors.red },
    { key: 'soon', title: '10 min', note: 'Pour la revoir bientôt', icon: 'timer-outline', tint: colors.yellowSoft, fg: '#9A7412' },
    { key: 'later', title: '1 h', note: 'Pour la revoir plus tard', icon: 'time-outline', tint: colors.blueSoft, fg: colors.blue },
    { key: 'tomorrow', title: '1 jour', note: 'Pour la revoir demain', icon: 'calendar-outline', tint: colors.greenSoft, fg: colors.green },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <IconButton name="arrow-back" label="Retour au paquet" onPress={onBack} />
          <Text style={styles.topBarTitle}>Réglages</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.settingsHero}>
          <View style={styles.settingsIcon}><Ionicons name="timer-outline" size={31} color={colors.blue} /></View>
          <Text style={styles.settingsTitle}>Timers de révision</Text>
          <Text style={styles.settingsText}>Choisis le délai appliqué à chaque réponse pour « {deck.title} ».</Text>
        </View>
        <Text style={styles.settingsLabel}>DURÉES EN MINUTES</Text>
        <View style={styles.timerList}>
          {timerRows.map((timer, index) => (
            <View key={timer.key} style={[styles.timerRow, index < timerRows.length - 1 && styles.timerRowBorder]}>
              <View style={[styles.timerIcon, { backgroundColor: timer.tint }]}><Ionicons name={timer.icon} size={20} color={timer.fg} /></View>
              <View style={styles.timerCopy}><Text style={styles.timerTitle}>{timer.title}</Text><Text style={styles.timerNote}>{timer.note}</Text></View>
              <View style={styles.timerInputWrap}>
                <TextInput
                  accessibilityLabel={`Durée ${timer.title} en minutes`}
                  value={String(delays[timer.key])}
                  onChangeText={(value) => updateDelay(timer.key, value)}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  style={styles.timerInput}
                />
                <Text style={styles.timerUnit}>min</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.settingsHint}>0 minute remet la carte immédiatement dans la file. Les changements s’appliqueront à la prochaine réponse.</Text>
        <PrimaryButton label={saving ? 'Enregistrement…' : 'Enregistrer les réglages'} icon="checkmark" disabled={saving} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatsScreen({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  useEffect(() => { void getStatsSnapshot().then(setStats).catch(console.error); }, []);
  if (!stats) return <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>;

  const breakdownTotal = stats.breakdownToday.again + stats.breakdownToday.soon + stats.breakdownToday.later + stats.breakdownToday.tomorrow;
  const mastery = breakdownTotal ? Math.round(((stats.breakdownToday.later + stats.breakdownToday.tomorrow) / breakdownTotal) * 100) : 0;
  const newCards = Math.max(0, stats.totalCards - stats.learnedCards);
  const learnedPercent = stats.totalCards ? Math.round((stats.learnedCards / stats.totalCards) * 100) : 0;
  const maxReviews = Math.max(1, ...stats.history.map((day) => day.reviews));
  const todayKey = stats.history[stats.history.length - 1]?.day;
  const weekDays = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  const breakdownRows: Array<{ key: keyof StatsSnapshot['breakdownToday']; label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; fg: string }> = [
    { key: 'again', label: 'À la suite', icon: 'refresh', tint: colors.redSoft, fg: colors.red },
    { key: 'soon', label: 'Encore bientôt', icon: 'timer-outline', tint: colors.yellowSoft, fg: '#9A7412' },
    { key: 'later', label: 'Plus tard', icon: 'time-outline', tint: colors.blueSoft, fg: colors.blue },
    { key: 'tomorrow', label: 'Demain', icon: 'calendar-outline', tint: colors.greenSoft, fg: colors.green },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.topBar}>
          <IconButton name="arrow-back" label="Retour" onPress={onBack} />
          <Text style={styles.topBarTitle}>Statistiques</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.statsBoard}>
          <Grid tint={colors.gridChalk} step={28} />
          <View style={styles.statsBoardRow}>
            <View style={styles.statsBoardCell}>
              <Text style={styles.statsBoardLabel}>CARTES VUES AUJOURD’HUI</Text>
              <Text style={styles.statsBoardNumber}>{stats.cardsSeenToday}</Text>
              <Text style={styles.statsBoardCaption}>{stats.reviewsToday} réponse{stats.reviewsToday > 1 ? 's' : ''} enregistrée{stats.reviewsToday > 1 ? 's' : ''}</Text>
            </View>
            <View style={styles.statsBoardDivider} />
            <View style={styles.statsBoardCell}>
              <Text style={styles.statsBoardLabel}>CARTES APPRISES</Text>
              <Text style={styles.statsBoardNumber}>{stats.learnedToday}</Text>
              <Text style={styles.statsBoardCaption}>nouvelles · « Plus tard » ou « Demain »</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsPillRow}>
          <View style={styles.statsPill}><Ionicons name="flame-outline" size={15} color={colors.red} /><Text style={styles.statsPillText}>{stats.streakDays} jour{stats.streakDays > 1 ? 's' : ''} de série</Text></View>
          <View style={styles.statsPill}><Ionicons name="albums-outline" size={15} color={colors.blue} /><Text style={styles.statsPillText}>{stats.dueCards} à revoir</Text></View>
          <View style={styles.statsPill}><Ionicons name="sparkles-outline" size={15} color="#9A7412" /><Text style={styles.statsPillText}>{stats.newSeenToday} nouvelle{stats.newSeenToday > 1 ? 's' : ''}</Text></View>
        </View>

        {!stats.reviewsToday ? (
          <Text style={styles.statsHint}>Aucune révision aujourd’hui : lance une session pour alimenter ton tableau.</Text>
        ) : null}

        <View style={styles.sectionHeaderCompact}>
          <View>
            <Text style={styles.sectionTitle}>Cette semaine</Text>
            <Text style={styles.sectionCaption}>Réponses des 7 derniers jours</Text>
          </View>
        </View>
        <View style={styles.chartCard}>
          {stats.history.map((day) => {
            const date = new Date(`${day.day}T12:00:00`);
            const isToday = day.day === todayKey;
            const height = day.reviews ? Math.max(8, Math.round((day.reviews / maxReviews) * 92)) : 4;
            const barColor = !day.reviews ? '#E4E5E9' : isToday ? colors.blue : '#B9C4F0';
            return (
              <View key={day.day} style={styles.chartColumn}>
                <Text style={styles.chartValue}>{day.reviews || ''}</Text>
                <View style={styles.chartBarTrack}><View style={[styles.chartBar, { height, backgroundColor: barColor }]} /></View>
                <Text style={[styles.chartLabel, isToday && styles.chartLabelToday]}>{weekDays[date.getDay()]}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.sectionHeaderCompact}>
          <View>
            <Text style={styles.sectionTitle}>Réponses du jour</Text>
            <Text style={styles.sectionCaption}>{mastery}% « Plus tard » ou « Demain » : tu maîtrises</Text>
          </View>
        </View>
        <View style={styles.timerList}>
          {breakdownRows.map((row, index) => (
            <View key={row.key} style={[styles.timerRow, index < breakdownRows.length - 1 && styles.timerRowBorder]}>
              <View style={[styles.timerIcon, { backgroundColor: row.tint }]}><Ionicons name={row.icon} size={20} color={row.fg} /></View>
              <View style={styles.timerCopy}>
                <Text style={styles.timerTitle}>{row.label}</Text>
                <Text style={styles.timerNote}>{breakdownTotal ? `${Math.round((stats.breakdownToday[row.key] / breakdownTotal) * 100)} % des réponses` : 'Aucune réponse aujourd’hui'}</Text>
              </View>
              <Text style={styles.statsCount}>{stats.breakdownToday[row.key]}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeaderCompact}>
          <View>
            <Text style={styles.sectionTitle}>Progression globale</Text>
            <Text style={styles.sectionCaption}>{stats.totalCards} carte{stats.totalCards > 1 ? 's' : ''} au total</Text>
          </View>
        </View>
        <View style={styles.sessionPanel}>
          <Text style={styles.statsGlobalValue}>{learnedPercent}%</Text>
          <Text style={styles.statsGlobalCaption}>des cartes ont été ouvertes au moins une fois</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${learnedPercent}%` }]} /></View>
          <View style={styles.statRow}>
            <View style={styles.stat}><Text style={styles.statValue}>{stats.learnedCards}</Text><Text style={styles.statLabel}>Apprises</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{newCards}</Text><Text style={styles.statLabel}>Nouvelles</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{stats.dueCards}</Text><Text style={styles.statLabel}>À revoir</Text></View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CardEditor({ visible, deckId, card, onClose, onSaved }: { visible: boolean; deckId: number; card: Card | null; onClose: () => void; onSaved: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [context, setContext] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setFirstName(card?.first_name ?? ''); setLastName(card?.last_name ?? '');
    setContext(card?.context ?? ''); setPhotoUri(card?.photo_uri ?? '');
  }, [visible, card]);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Accès requis', 'Autorise l’accès aux photos pour choisir un schéma.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.85 });
    if (!result.canceled) {
      const source = result.assets[0];
      if (Platform.OS === 'web') {
        setPhotoUri(source.uri);
        return;
      }
      const extension = source.fileName?.split('.').pop() || 'jpg';
      const directory = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}schemas/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const destination = `${directory}${Date.now()}.${extension}`;
      await FileSystem.copyAsync({ from: source.uri, to: destination });
      setPhotoUri(destination);
    }
  };
  const submit = async () => {
    if (!firstName.trim()) { Alert.alert('Énoncé manquant', 'Ajoute au moins une question.'); return; }
    setSaving(true);
    await saveCard({ id: card?.id, deckId, firstName, lastName, context, photoUri });
    setSaving(false); onSaved();
  };
  const remove = () => {
    if (!card) return;
    Alert.alert('Supprimer cette carte ?', `« ${card.first_name} » sera retirée du paquet.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await deleteCard(card.id); onSaved(); } },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalScreen} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.modalPage} keyboardShouldPersistTaps="handled">
            <View style={styles.topBar}>
              <IconButton name="close" label="Fermer" onPress={onClose} />
              <Text style={styles.topBarTitle}>{card ? 'Modifier la carte' : 'Nouvelle carte'}</Text>
              <View style={{ width: 44 }} />
            </View>
            <Pressable onPress={pickImage} style={styles.photoPicker}>
              {photoUri ? <Image source={{ uri: photoUri }} style={styles.photoPickerImage} /> : <><Ionicons name="image-outline" size={34} color={colors.blue} /><Text style={styles.photoPickerText}>Ajouter un schéma</Text></>}
              <View style={styles.photoEditBadge}><Ionicons name="camera" size={16} color={colors.white} /></View>
            </Pressable>
            <Text style={styles.inputLabel}>QUESTION *</Text>
            <TextInput value={firstName} onChangeText={setFirstName} placeholder="Factoriser x² − 4" style={[styles.input, styles.mathInput]} autoCapitalize="none" />
            <Text style={styles.inputLabel}>RÉPONSE</Text>
            <TextInput value={lastName} onChangeText={setLastName} placeholder="(x − 2)(x + 2)" style={[styles.input, styles.mathInput]} autoCapitalize="none" />
            <Text style={styles.inputLabel}>INDICE</Text>
            <TextInput value={context} onChangeText={setContext} placeholder="Astuce, chapitre, erreur fréquente…" style={[styles.input, styles.multilineInput]} multiline />
            <PrimaryButton label={saving ? 'Enregistrement…' : 'Enregistrer la carte'} onPress={submit} disabled={saving} />
            {card ? <Pressable onPress={remove} style={styles.deleteButton}><Ionicons name="trash-outline" size={18} color={colors.red} /><Text style={styles.deleteText}>Supprimer la carte</Text></Pressable> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function StudyScreen({ deckIds, newCardAllowance, onClose }: { deckIds: number[]; newCardAllowance: number; onClose: () => void }) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [queue, setQueue] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [rating, setRating] = useState(false);
  const [smallPhoto, setSmallPhoto] = useState(false);
  const reviewTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => () => {
    reviewTimers.current.forEach(clearTimeout);
    reviewTimers.current.clear();
  }, []);

  useEffect(() => {
    Promise.all([getDecksByIds(deckIds), getSessionCards(deckIds, newCardAllowance)]).then(([nextDecks, cards]) => {
      setDecks(nextDecks); setQueue(cards); setLoading(false);
    });
  }, [deckIds, newCardAllowance]);

  const current = queue[0];
  useEffect(() => {
    setSmallPhoto(false);
    if (!current?.photo_uri) return;

    let active = true;
    Image.getSize(current.photo_uri)
      .then(({ width, height }) => {
        if (active) setSmallPhoto(width < 800 || height < 1000);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [current?.id, current?.photo_uri]);

  useEffect(() => {
    if (current) markCardSeen(current.id).catch(console.error);
  }, [current?.id]);
  const rate = async (delay: ReviewDelay) => {
    if (!current || rating) return;
    setRating(true);
    await recordReview(current.id, delay);
    setReviewed((value) => value + 1);
    setRevealed(false);
    if (delay === 0) {
      setQueue((items) => insertLaterInQueue(items.slice(1), current));
    } else {
      setQueue((items) => items.slice(1));
      const timer = setTimeout(() => {
        reviewTimers.current.delete(timer);
        setQueue((items) => insertLaterInQueue(items, current));
      }, delay * 60_000);
      reviewTimers.current.add(timer);
    }
    setRating(false);
  };
  const addFresh = async (amount: number) => {
    const excluded = queue.map((item) => item.id);
    const fresh = await getNewCards(deckIds, amount, excluded);
    setQueue((items) => items.length ? [items[0], ...fresh, ...items.slice(1)] : fresh);
    setManualOpen(false);
    if (!fresh.length) Alert.alert('Tout est déjà là', 'Il ne reste aucune nouvelle carte dans ces paquets.');
  };
  const restartAllCards = () => {
    if (deckIds.length !== 1) return;
    Alert.alert(
      'Réinitialiser le paquet ?',
      'Toutes les cartes redeviendront nouvelles et leur historique de révision sera effacé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: async () => {
            await resetDeckProgress(deckIds[0]);
            const cards = await getSessionCards(deckIds);
            setQueue(cards);
            setReviewed(0);
          },
        },
      ],
    );
  };

  if (loading || !decks.length) return <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>;
  const isMixed = decks.length > 1;
  const sessionTitle = isMixed ? 'Session mixte' : decks[0].title;
  if (!current) {
    return (
      <SafeAreaView style={styles.studyScreen} edges={['top', 'bottom']}>
        <View style={styles.studyTop}><IconButton name="close" label="Quitter" onPress={onClose} /><Text style={styles.studyDeckName}>{sessionTitle}</Text><View style={{ width: 44 }} /></View>
        <View style={styles.completeWrap}>
          <View style={styles.completeIcon}><Ionicons name="checkmark" size={42} color={colors.blue} /></View>
          <Text style={styles.completeTitle}>Session terminée</Text>
          <Text style={styles.completeText}>{reviewed ? `${reviewed} réponse${reviewed > 1 ? 's' : ''} enregistrée${reviewed > 1 ? 's' : ''}.` : 'Aucune carte n’est due pour le moment.'}</Text>
          <View style={styles.completeActions}>
            <PrimaryButton label="Ajouter de nouvelles cartes" icon="add" onPress={() => setManualOpen(true)} />
            {!isMixed ? <Pressable onPress={restartAllCards} style={styles.resetButton}><Ionicons name="refresh-outline" size={18} color={colors.blue} /><Text style={styles.resetButtonText}>Réinitialiser toutes les cartes</Text></Pressable> : null}
            <Pressable onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Retour à l’accueil</Text></Pressable>
          </View>
        </View>
        <ManualNewModal
          visible={manualOpen}
          dailyLimit={isMixed ? undefined : Number(decks[0].daily_new_limit)}
          onClose={() => setManualOpen(false)}
          onLimitChange={isMixed ? undefined : async (limit) => { await updateDailyLimit(deckIds[0], limit); setDecks((value) => value.map((deck, index) => index === 0 ? { ...deck, daily_new_limit: limit } : deck)); }}
          onSelect={addFresh}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.studyScreen} edges={['top', 'bottom']}>
      <View style={styles.studyTop}>
        <IconButton name="close" label="Quitter" onPress={onClose} />
        <View style={styles.studyTitleWrap}><Text style={styles.studyDeckName}>{sessionTitle}</Text><Text style={styles.studyRemaining}>{isMixed ? `${decks.length} paquets · ` : ''}{queue.length} dans la file</Text></View>
        <IconButton name="library-outline" label="Ajouter de nouvelles cartes" onPress={() => setManualOpen(true)} />
      </View>
      <View style={styles.studyProgress}><View style={[styles.studyProgressFill, { width: `${Math.max(8, 100 / Math.max(queue.length, 1))}%` }]} /></View>
      <View style={styles.studyContent}>
        <View style={[styles.flashCard, smallPhoto && styles.flashCardSmall]}>
          {current.photo_uri ? <Image source={{ uri: current.photo_uri }} style={styles.flashImage} resizeMode="cover" /> : null}
          {current.photo_uri ? <View style={styles.photoShade} /> : null}
          {revealed ? (
            <View style={styles.answerPaper}>
              <Text style={styles.answerEyebrow}>RÉPONSE</Text>
              {current.last_name ? (
                hasMath(current.last_name)
                  ? <MathView text={current.last_name} fontSize={22} />
                  : <Text style={styles.answerText}>{current.last_name}</Text>
              ) : null}
              {current.context ? (!current.last_name ? (
                hasMath(current.context)
                  ? <MathView text={current.context} fontSize={22} />
                  : <Text style={styles.answerText}>{current.context}</Text>
              ) : (
                hasMath(current.context)
                  ? <MathView text={current.context} fontSize={15} color={colors.muted} />
                  : <Text style={styles.answerNote}>{current.context}</Text>
              )) : null}
              {!current.last_name && !current.context ? <Text style={styles.answerText}>Pas de réponse enregistrée</Text> : null}
            </View>
          ) : current.photo_uri ? (
            <View style={styles.questionStrip}><Text style={styles.questionStripText} numberOfLines={3}>{current.first_name}</Text></View>
          ) : (
            <View style={styles.questionStage}>
              <Text style={styles.questionEyebrow}>QUESTION</Text>
              {hasMath(current.first_name)
                ? <MathView text={current.first_name} fontSize={25} />
                : <Text style={styles.questionBig}>{current.first_name}</Text>}
            </View>
          )}
          {!revealed && current.photo_uri ? <View style={styles.questionBadge}><Ionicons name="help" size={20} color={colors.blue} /></View> : null}
        </View>
        {!revealed ? (
          <View style={styles.revealArea}>
            <PrimaryButton label="Voir la réponse" icon="eye-outline" onPress={() => setRevealed(true)} />
            <Text style={styles.hint}>Prends le temps de calculer dans ta tête avant de révéler</Text>
          </View>
        ) : (
          <View style={styles.ratingArea}>
            <Text style={styles.ratingPrompt}>Quand veux-tu la revoir ?</Text>
            <View style={styles.ratingGrid}>
              {getDelayOptions(decks[0]).map((option) => (
                <Pressable accessibilityRole="button" accessibilityLabel={`Revoir ${option.title}`} disabled={rating} key={option.icon} onPress={() => rate(option.value)} style={({ pressed }) => [styles.ratingButton, { backgroundColor: option.color }, rating && styles.disabled, pressed && styles.pressed]}>
                  <Ionicons name={option.icon} size={21} color={option.fg} />
                  <View><Text style={styles.ratingTitle}>{option.title}</Text><Text style={styles.ratingSubtitle}>{option.subtitle}</Text></View>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
      <ManualNewModal
        visible={manualOpen}
        dailyLimit={isMixed ? undefined : Number(decks[0].daily_new_limit)}
        onClose={() => setManualOpen(false)}
        onLimitChange={isMixed ? undefined : async (limit) => { await updateDailyLimit(deckIds[0], limit); setDecks((value) => value.map((deck, index) => index === 0 ? { ...deck, daily_new_limit: limit } : deck)); }}
        onSelect={addFresh}
      />
    </SafeAreaView>
  );
}

function ManualNewModal({ visible, dailyLimit, onClose, onSelect, onLimitChange }: { visible: boolean; dailyLimit?: number; onClose: () => void; onSelect: (value: number) => void; onLimitChange?: (value: number) => void }) {
  const [custom, setCustom] = useState('');
  const showQuota = dailyLimit !== undefined && onLimitChange !== undefined;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Ajouter des nouvelles cartes</Text>
          <Text style={styles.sheetText}>Elles seront placées juste après la carte en cours, même si ton quota du jour est atteint.</Text>
          {showQuota ? (
            <View style={styles.inSessionLimit}>
              <View><Text style={styles.inSessionLimitTitle}>Quota quotidien</Text><Text style={styles.inSessionLimitText}>Pour les prochaines sessions</Text></View>
              <View style={styles.stepper}>
                <Pressable onPress={() => onLimitChange(Math.max(0, dailyLimit - 1))} style={styles.stepperButton}><Ionicons name="remove" size={18} color={colors.ink} /></Pressable>
                <Text style={styles.stepperValue}>{dailyLimit}</Text>
                <Pressable onPress={() => onLimitChange(dailyLimit + 1)} style={styles.stepperButton}><Ionicons name="add" size={18} color={colors.ink} /></Pressable>
              </View>
            </View>
          ) : null}
          <Text style={styles.manualLabel}>AJOUTER MAINTENANT</Text>
          <View style={styles.amountRow}>{[1, 5, 10].map((amount) => <Pressable key={amount} onPress={() => onSelect(amount)} style={styles.amountButton}><Text style={styles.amountText}>+{amount}</Text></Pressable>)}</View>
          <View style={styles.customRow}>
            <TextInput value={custom} onChangeText={setCustom} keyboardType="number-pad" placeholder="Autre nombre" style={styles.customInput} />
            <Pressable onPress={() => onSelect(Math.max(1, Number(custom) || 1))} style={styles.customGo}><Ionicons name="arrow-forward" size={20} color={colors.white} /></Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CustomSessionSheet({ visible, decks, onClose, onStart }: { visible: boolean; decks: Deck[]; onClose: () => void; onStart: (deckIds: number[], newCardAllowance: number) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [manualNew, setManualNew] = useState<number | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelected(decks.map((deck) => deck.id));
    setManualNew(null);
    setSubjectFilter(null);
  }, [visible, decks]);

  const groups = useMemo(() => groupBySubject(decks), [decks]);
  const filterKey = subjectFilter?.trim().toLowerCase() ?? null;
  const visibleGroups = filterKey ? groups.filter((group) => group.name.toLowerCase() === filterKey) : groups;

  const defaultAllowance = decks.reduce((sum, deck) => sum + Math.max(0, Number(deck.daily_new_limit) - Number(deck.introduced_today)), 0);
  const allowance = manualNew ?? defaultAllowance;
  const selectedDecks = decks.filter((deck) => selected.includes(deck.id));
  const dueCount = selectedDecks.reduce((sum, deck) => sum + Number(deck.due_count), 0);
  const newTotal = selectedDecks.reduce((sum, deck) => sum + Number(deck.new_count), 0);
  const sessionCount = dueCount + Math.min(newTotal, allowance);

  const toggle = (deckId: number) => {
    setSelected((current) => current.includes(deckId) ? current.filter((id) => id !== deckId) : [...current, deckId]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Session mixte</Text>
          <Text style={styles.sheetText}>Choisis les paquets à mélanger : les cartes à revoir et les nouvelles cartes seront fusionnées dans une seule file.</Text>
          {groups.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mixFilterRow} contentContainerStyle={styles.mixFilterContent}>
              <Pressable onPress={() => setSubjectFilter(null)} style={({ pressed }) => [styles.mixFilterChip, !filterKey && styles.mixFilterChipOn, pressed && styles.pressed]}>
                <Ionicons name="shuffle" size={13} color={!filterKey ? colors.white : colors.blue} />
                <Text style={[styles.mixFilterChipText, !filterKey && styles.mixFilterChipTextOn]}>Toutes</Text>
              </Pressable>
              {groups.map((group) => {
                const active = filterKey === group.name.toLowerCase();
                return (
                  <Pressable
                    key={group.name.toLowerCase()}
                    onPress={() => setSubjectFilter(active ? null : group.name)}
                    style={({ pressed }) => [styles.mixFilterChip, active && styles.mixFilterChipOn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.mixFilterChipText, active && styles.mixFilterChipTextOn]} numberOfLines={1}>{group.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          <ScrollView style={styles.mixList} nestedScrollEnabled>
            {visibleGroups.map((group) => (
              <View key={group.name.toLowerCase()} style={styles.mixGroup}>
                <Text style={styles.mixGroupTitle}>{group.name}</Text>
                {group.decks.map((deck, index) => {
                  const active = selected.includes(deck.id);
                  return (
                    <Pressable key={deck.id} onPress={() => toggle(deck.id)} style={[styles.mixRow, index < group.decks.length - 1 && styles.mixRowBorder]}>
                      <View style={[styles.mixCheckbox, active && styles.mixCheckboxOn]}>
                        {active ? <Ionicons name="checkmark" size={15} color={colors.white} /> : null}
                      </View>
                      <View style={styles.mixRowCopy}>
                        <Text style={styles.mixRowTitle} numberOfLines={1}>{deck.title}</Text>
                        <Text style={styles.mixRowMeta}>{Number(deck.due_count)} à revoir · {Number(deck.new_count)} nouvelles</Text>
                      </View>
                      <View style={[styles.deckMarkSmall, { backgroundColor: deck.color }]}><Text style={styles.deckMarkSmallGlyph}>{glyphFor(deck.id)}</Text></View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            {!decks.length ? (
              <View style={styles.mixGroup}>
                <View style={styles.mixEmpty}><Text style={styles.mixEmptyText}>Crée d’abord un paquet pour lancer une session.</Text></View>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.inSessionLimit}>
            <View><Text style={styles.inSessionLimitTitle}>Nouvelles cartes</Text><Text style={styles.inSessionLimitText}>Ajoutées à la file, en plus des révisions</Text></View>
            <View style={styles.stepper}>
              <Pressable onPress={() => setManualNew(Math.max(0, allowance - 1))} style={styles.stepperButton}><Ionicons name="remove" size={18} color={colors.ink} /></Pressable>
              <Text style={styles.stepperValue}>{allowance}</Text>
              <Pressable onPress={() => setManualNew(allowance + 1)} style={styles.stepperButton}><Ionicons name="add" size={18} color={colors.ink} /></Pressable>
            </View>
          </View>
          <PrimaryButton
            label={!selected.length ? 'Choisis au moins un paquet' : sessionCount ? `Commencer · ${sessionCount} carte${sessionCount > 1 ? 's' : ''}` : 'Lancer une session'}
            icon="play"
            disabled={!selected.length}
            onPress={() => onStart(selected, allowance)}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CreateDeckModal({ visible, defaultSubject, subjects, onClose, onCreated }: { visible: boolean; defaultSubject: string; subjects: string[]; onClose: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  useEffect(() => {
    if (visible) {
      setTitle('');
      setDescription('');
      setSubject(defaultSubject);
    }
  }, [visible, defaultSubject]);
  const submit = async () => {
    if (!title.trim()) return;
    const result = await createDeck(title, description, subject.trim() || 'Divers');
    onCreated(result.lastInsertRowId);
  };
  const suggestions = subjects.filter((name) => name.toLowerCase() !== subject.trim().toLowerCase());
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalScreen} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.modalPage} keyboardShouldPersistTaps="handled">
            <View style={styles.topBar}><IconButton name="close" label="Fermer" onPress={onClose} /><Text style={styles.topBarTitle}>Nouveau paquet</Text><View style={{ width: 44 }} /></View>
            <View style={styles.createIcon}><Text style={styles.createGlyph}>π</Text></View>
            <Text style={styles.inputLabel}>NOM DU PAQUET *</Text><TextInput value={title} onChangeText={setTitle} placeholder="Tables de multiplication" style={styles.input} autoFocus />
            <Text style={styles.inputLabel}>MATIÈRE</Text>
            <TextInput value={subject} onChangeText={setSubject} placeholder="Maths" style={styles.input} />
            {suggestions.length ? (
              <View style={styles.chipRow}>
                {suggestions.slice(0, 8).map((name) => (
                  <Pressable key={name.toLowerCase()} onPress={() => setSubject(name)} style={styles.chip}>
                    <Text style={styles.chipText}>{name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.inputLabel}>DESCRIPTION</Text><TextInput value={description} onChangeText={setDescription} placeholder="Formules, théorèmes, définitions…" style={[styles.input, styles.multilineInput]} multiline />
            <PrimaryButton label="Créer le paquet" onPress={submit} disabled={!title.trim()} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function AppContent() {
  const [ready, setReady] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubject, setCreateSubject] = useState('Divers');
  const [subjects, setSubjects] = useState<string[]>([]);
  const initialize = useCallback(async () => {
    setReady(false);
    setInitializationError(null);
    try {
      await initializeDatabase();
      setReady(true);
    } catch (error) {
      console.error(error);
      setInitializationError('La base locale est déjà utilisée dans un autre onglet. Ferme les autres onglets de Mémento puis réessaie.');
    }
  }, []);
  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => {
    // Laisse l'écran de lancement disparaître avant d'afficher une éventuelle alerte.
    const timeout = setTimeout(() => void checkForAppUpdate(), 700);
    return () => clearTimeout(timeout);
  }, []);
  const openCreate = useCallback(async (subject: string) => {
    setCreateSubject(subject || 'Divers');
    const [decks, prefs] = await Promise.all([getDecks(), getSubjectPrefs()]);
    const names = new Map<string, string>();
    for (const group of groupBySubject(decks)) names.set(group.name.toLowerCase(), group.name);
    for (const name of prefs.custom) names.set(name.trim().toLowerCase(), name.trim());
    setSubjects([...names.values()]);
    setCreateOpen(true);
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'home') return false;

      if (route.name === 'deck' || route.name === 'study' || route.name === 'subject' || route.name === 'stats') {
        setRoute({ name: 'home' });
      } else {
        setRoute({ name: 'deck', deckId: route.deckId });
      }
      return true;
    });

    return () => subscription.remove();
  }, [route]);
  if (initializationError) return (
    <View style={styles.splash}>
      <View style={styles.logoError}><Ionicons name="alert-circle-outline" size={30} color={colors.red} /></View>
      <Text style={styles.splashTitle}>Mémento</Text>
      <Text style={styles.initializationError}>{initializationError}</Text>
      <PrimaryButton label="Réessayer" icon="refresh" onPress={() => void initialize()} />
    </View>
  );
  if (!ready) return <View style={styles.splash}><View style={styles.logo}><Text style={styles.logoGlyph}>π</Text></View><Text style={styles.splashTitle}>Mémento</Text><ActivityIndicator color={colors.blue} style={{ marginTop: 24 }} /></View>;

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      {route.name === 'home' ? <HomeScreen onOpenSubject={(subject) => setRoute({ name: 'subject', subject })} onStudy={(deckIds, newCardAllowance) => setRoute({ name: 'study', deckIds, newCardAllowance })} onOpenStats={() => setRoute({ name: 'stats' })} /> : null}
      {route.name === 'subject' ? <SubjectScreen subject={route.subject} onBack={() => setRoute({ name: 'home' })} onOpenDeck={(deckId) => setRoute({ name: 'deck', deckId })} onStudy={(deckIds, newCardAllowance) => setRoute({ name: 'study', deckIds, newCardAllowance })} onCreate={(subject) => void openCreate(subject)} /> : null}
      {route.name === 'deck' ? <DeckScreen deckId={route.deckId} onBack={() => setRoute({ name: 'home' })} onStudy={(newCardAllowance) => setRoute({ name: 'study', deckIds: [route.deckId], newCardAllowance })} onSettings={() => setRoute({ name: 'settings', deckId: route.deckId })} /> : null}
      {route.name === 'settings' ? <DeckSettingsScreen deckId={route.deckId} onBack={() => setRoute({ name: 'deck', deckId: route.deckId })} /> : null}
      {route.name === 'stats' ? <StatsScreen onBack={() => setRoute({ name: 'home' })} /> : null}
      {route.name === 'study' ? <StudyScreen deckIds={route.deckIds} newCardAllowance={route.newCardAllowance} onClose={() => setRoute({ name: 'home' })} /> : null}
      <CreateDeckModal visible={createOpen} defaultSubject={createSubject} subjects={subjects} onClose={() => setCreateOpen(false)} onCreated={(deckId) => { setCreateOpen(false); setRoute({ name: 'deck', deckId }); }} />
    </View>
  );
}

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}

const shadow = Platform.select({ ios: { shadowColor: '#1A2238', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 18 }, android: { elevation: 3 }, default: {} });

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.canvas },
  screen: { flex: 1, backgroundColor: colors.canvas },
  studyScreen: { flex: 1, backgroundColor: '#E7E8E2' },
  modalScreen: { flex: 1, backgroundColor: colors.canvas },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 48 },
  modalPage: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 36 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  logo: { width: 68, height: 68, borderRadius: 18, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  logoError: { width: 68, height: 68, borderRadius: 18, backgroundColor: colors.redSoft, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  logoGlyph: { fontSize: 32, fontWeight: '700', color: colors.blue, fontFamily: mono },
  splashTitle: { fontSize: 26, fontWeight: '800', color: colors.ink, marginTop: 14, letterSpacing: -0.7 },
  initializationError: { maxWidth: 300, marginTop: 12, marginBottom: 20, color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.4 },
  iconButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  primaryButton: { minHeight: 56, borderRadius: 15, paddingHorizontal: 20, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  homeHeader: { paddingTop: 25, paddingBottom: 28, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 2.3, color: colors.blue, marginBottom: 9 },
  heroTitle: { fontSize: 34, lineHeight: 38, letterSpacing: -1.4, fontWeight: '800', color: colors.ink },
  avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  todayCard: { minHeight: 174, backgroundColor: colors.board, borderRadius: radius.large, padding: 24, flexDirection: 'row', overflow: 'hidden', ...shadow },
  todayCopy: { flex: 1, zIndex: 2 },
  todayLabel: { color: colors.chalkDim, fontWeight: '800', fontSize: 11, letterSpacing: 1.2 },
  todayNumber: { color: colors.chalk, fontWeight: '700', fontSize: 52, lineHeight: 58, marginTop: 7, letterSpacing: -2, fontFamily: mono },
  todayText: { color: colors.chalk, fontWeight: '600', fontSize: 16 },
  todayIllustration: { width: 118, alignItems: 'center', justifyContent: 'center' },
  stackCardBack: { width: 82, height: 104, borderRadius: 12, backgroundColor: '#33493E', position: 'absolute', transform: [{ rotate: '10deg' }, { translateX: 12 }] },
  stackCardFront: { width: 82, height: 104, borderRadius: 12, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-5deg' }] },
  stackCardGlyph: { fontSize: 40, fontWeight: '700', color: colors.ink, fontFamily: mono },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 15 },
  sectionHeaderCompact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 31, marginBottom: 14 },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  sectionCaption: { color: colors.muted, fontSize: 13, marginTop: 3 },
  addRound: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  deckCard: { backgroundColor: colors.paper, borderRadius: radius.medium, padding: 16, flexDirection: 'row', marginBottom: 12, borderWidth: 1, borderColor: '#ECECF0', ...shadow },
  deckMark: { width: 58, height: 68, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  deckMarkGlyph: { fontSize: 27, fontWeight: '700', color: colors.blue, fontFamily: mono },
  deckBody: { flex: 1, minWidth: 0 },
  deckTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deckTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, flex: 1 },
  starButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  filterToggle: { height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.blueSoft, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterToggleText: { fontSize: 12, fontWeight: '800', color: colors.blue },
  deckDescription: { fontSize: 13, color: colors.muted, marginTop: 3 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: '#E8E9EC', overflow: 'hidden', marginTop: 13 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.blue },
  deckMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  deckMetaText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  duePill: { backgroundColor: colors.redSoft, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  duePillText: { color: colors.red, fontSize: 10, fontWeight: '800' },
  subjectCard: { backgroundColor: colors.paper, borderRadius: radius.medium, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#ECECF0', ...shadow },
  subjectIcon: { width: 50, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  subjectBody: { flex: 1, minWidth: 0 },
  subjectTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, flex: 1 },
  subjectMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  subjectMetaText: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  subjectEditorList: { maxHeight: 300, marginTop: 18 },
  subjectEditorRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11 },
  subjectEditorRowBorder: { borderBottomWidth: 1, borderBottomColor: '#ECECF1' },
  subjectEditorIcon: { width: 38, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  subjectEditorCopy: { flex: 1, minWidth: 0 },
  subjectEditorTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  subjectEditorMeta: { fontSize: 11, color: colors.muted, marginTop: 3 },
  subjectEditorAction: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  subjectEditorActionOff: { backgroundColor: '#F4F4F6' },
  sessionPanelIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  chip: { height: 34, borderRadius: 17, backgroundColor: colors.blueSoft, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.blue },
  newDeckCard: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C7CAD4', borderRadius: radius.medium, padding: 17, flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  newDeckIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  newDeckTitle: { fontWeight: '800', color: colors.ink, fontSize: 15 },
  newDeckCaption: { color: colors.muted, fontSize: 12, marginTop: 3 },
  topBar: { height: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  deckHero: { alignItems: 'center', paddingTop: 14 },
  largeDeckMark: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  largeDeckGlyph: { fontSize: 32, fontWeight: '700', color: colors.blue, fontFamily: mono },
  deckHeroTitle: { fontSize: 29, fontWeight: '900', color: colors.ink, letterSpacing: -0.8, textAlign: 'center' },
  deckHeroDescription: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 6 },
  settingsHero: { alignItems: 'center', paddingTop: 22, paddingBottom: 28 },
  settingsIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  settingsTitle: { fontSize: 28, fontWeight: '900', color: colors.ink, letterSpacing: -0.7, marginTop: 16 },
  settingsText: { maxWidth: 390, color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  settingsLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: colors.muted, marginBottom: 9 },
  timerList: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, paddingHorizontal: 15, marginBottom: 13 },
  timerRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center' },
  timerRowBorder: { borderBottomWidth: 1, borderBottomColor: '#ECECF1' },
  timerIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  timerCopy: { flex: 1, minWidth: 0 },
  timerTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  timerNote: { color: colors.muted, fontSize: 11, marginTop: 3 },
  timerInputWrap: { height: 42, minWidth: 76, borderRadius: 10, backgroundColor: '#F7F8FA', borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  timerInput: { width: 37, color: colors.ink, fontSize: 15, fontWeight: '700', textAlign: 'right', paddingVertical: 0, fontFamily: mono },
  timerUnit: { color: colors.muted, fontSize: 10, marginLeft: 4, fontWeight: '700' },
  settingsHint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 20 },
  statRow: { flexDirection: 'row', marginTop: 25, marginBottom: 22, width: '100%', justifyContent: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.ink, fontFamily: mono },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 3, fontWeight: '600' },
  statDivider: { width: 1, height: 31, backgroundColor: colors.line, alignSelf: 'center' },
  sessionPanel: { backgroundColor: colors.paper, borderRadius: radius.large, padding: 18, borderWidth: 1, borderColor: '#EAEAF0', ...shadow },
  panelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 17 },
  panelTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  panelCaption: { fontSize: 11, color: colors.muted, marginTop: 4 },
  stepper: { height: 39, flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center', overflow: 'hidden' },
  stepperButton: { width: 37, height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
  stepperValue: { width: 34, textAlign: 'center', fontWeight: '700', color: colors.ink, fontFamily: mono },
  actionsRow: { flexDirection: 'row', gap: 7 },
  smallAction: { height: 36, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.blueSoft, flexDirection: 'row', gap: 5, alignItems: 'center' },
  smallActionText: { fontSize: 12, fontWeight: '800', color: colors.blue },
  searchBox: { height: 48, backgroundColor: colors.paper, borderRadius: 13, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 11 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: colors.ink },
  cardList: { backgroundColor: colors.paper, borderRadius: radius.medium, paddingHorizontal: 15, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  cardRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center' },
  cardRowBorder: { borderBottomWidth: 1, borderBottomColor: '#ECECF1' },
  cardThumbWrap: { width: 52, height: 52, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueSoft },
  cardThumb: { width: 52, height: 52 },
  cardText: { flex: 1, paddingHorizontal: 12 },
  cardFront: { fontSize: 15, fontWeight: '700', color: colors.ink, fontFamily: mono },
  cardBack: { fontSize: 12, color: colors.muted, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  emptyList: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyText: { color: colors.muted, fontSize: 13 },
  symbolTile: { backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  symbolTileChalk: { backgroundColor: 'transparent' },
  symbolGlyph: { fontWeight: '700', color: colors.blue, fontFamily: mono },
  symbolGlyphChalk: { color: colors.chalkDim },
  photoPicker: { width: 150, height: 180, borderRadius: 20, backgroundColor: colors.blueSoft, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginVertical: 24, overflow: 'visible', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9C2E8' },
  photoPickerImage: { width: '100%', height: '100%', borderRadius: 19 },
  photoPickerText: { fontSize: 12, fontWeight: '800', color: colors.blue, marginTop: 8 },
  photoEditBadge: { position: 'absolute', right: -7, bottom: -7, width: 38, height: 38, borderRadius: 19, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.canvas },
  inputLabel: { fontSize: 11, fontWeight: '900', color: colors.muted, letterSpacing: 1, marginBottom: 7, marginTop: 14 },
  input: { minHeight: 52, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 15, color: colors.ink, fontSize: 15, marginBottom: 3 },
  mathInput: { fontFamily: mono },
  multilineInput: { minHeight: 86, paddingTop: 15, textAlignVertical: 'top', marginBottom: 24 },
  deleteButton: { height: 50, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, marginTop: 9 },
  deleteText: { color: colors.red, fontWeight: '700' },
  studyTop: { width: '100%', maxWidth: 720, alignSelf: 'center', height: 71, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  studyTitleWrap: { alignItems: 'center' },
  studyDeckName: { fontSize: 15, fontWeight: '800', color: colors.ink },
  studyRemaining: { fontSize: 10, color: colors.muted, marginTop: 2 },
  studyProgress: { height: 4, backgroundColor: '#DDDED8' },
  studyProgressFill: { height: 4, backgroundColor: colors.blue, borderRadius: 2 },
  studyContent: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
  flashCard: { flex: 1, minHeight: 320, maxHeight: 560, backgroundColor: '#F7F4ED', borderRadius: radius.large, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#DED9CD', ...shadow },
  flashCardSmall: {
    flex: 0,
    height: '54%',
    minHeight: 220,
    maxHeight: 320,
    aspectRatio: 4 / 5,
    alignSelf: 'center',
  },
  flashImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  photoShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12, 23, 42, 0.32)' },
  questionBadge: { position: 'absolute', top: 18, right: 18, width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  questionStage: { paddingHorizontal: 28, alignItems: 'center', zIndex: 2 },
  questionEyebrow: { color: '#5E6C84', fontSize: 10, fontWeight: '900', letterSpacing: 2.4, marginBottom: 14, fontFamily: mono },
  questionBig: { color: '#17233A', fontSize: 26, lineHeight: 35, fontWeight: '800', textAlign: 'center', fontFamily: mono },
  questionStrip: { position: 'absolute', left: 14, right: 14, bottom: 14, borderRadius: 16, backgroundColor: 'rgba(18, 33, 55, 0.94)', paddingVertical: 15, paddingHorizontal: 16, zIndex: 2 },
  questionStripText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center', fontFamily: mono },
  answerPaper: { position: 'absolute', left: 14, right: 14, bottom: 14, borderRadius: 16, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#DED9CD', paddingVertical: 16, paddingHorizontal: 18, alignItems: 'center', zIndex: 2 },
  answerEyebrow: { color: colors.red, fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  answerText: { color: colors.ink, fontSize: 21, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center', marginTop: 6, fontFamily: mono },
  answerNote: { color: colors.muted, fontSize: 13, marginTop: 5, fontWeight: '600' },
  revealArea: { paddingTop: 17 },
  hint: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 10 },
  ratingArea: { paddingTop: 14 },
  ratingPrompt: { color: colors.ink, fontSize: 14, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  ratingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  ratingButton: { width: '48%', flexGrow: 1, minHeight: 63, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  ratingTitle: { fontSize: 13, fontWeight: '900', color: colors.ink },
  ratingSubtitle: { fontSize: 9, color: colors.muted, marginTop: 2 },
  completeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  completeIcon: { width: 84, height: 84, borderRadius: 24, backgroundColor: colors.yellowSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  completeTitle: { fontSize: 29, fontWeight: '900', color: colors.ink, letterSpacing: -0.8 },
  completeText: { color: colors.muted, fontSize: 14, textAlign: 'center', marginTop: 8 },
  completeActions: { width: '100%', maxWidth: 400, marginTop: 31, gap: 9 },
  resetButton: { minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  resetButtonText: { color: colors.blue, fontSize: 15, fontWeight: '800' },
  secondaryButton: { minHeight: 52, justifyContent: 'center', alignItems: 'center' },
  secondaryButtonText: { fontSize: 14, color: colors.blue, fontWeight: '800' },
  scrim: { flex: 1, backgroundColor: 'rgba(16, 22, 36, 0.38)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 11, paddingBottom: Platform.OS === 'ios' ? 35 : 24 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#C9CCD6', alignSelf: 'center', marginBottom: 22 },
  sheetTitle: { fontSize: 21, fontWeight: '900', color: colors.ink, letterSpacing: -0.4 },
  sheetText: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 7 },
  inSessionLimit: { minHeight: 68, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, marginTop: 18, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inSessionLimitTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  inSessionLimitText: { fontSize: 10, color: colors.muted, marginTop: 2 },
  manualLabel: { fontSize: 10, letterSpacing: 1, fontWeight: '900', color: colors.muted, marginTop: 20 },
  amountRow: { flexDirection: 'row', gap: 9, marginTop: 9 },
  amountButton: { flex: 1, height: 55, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  amountText: { fontSize: 18, fontWeight: '700', color: colors.blue, fontFamily: mono },
  customRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  customInput: { flex: 1, height: 50, borderRadius: 13, paddingHorizontal: 15, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  customGo: { width: 50, height: 50, borderRadius: 13, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  importHero: { alignItems: 'center', paddingVertical: 25 },
  importIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  importTitle: { fontSize: 27, fontWeight: '900', color: colors.ink, marginTop: 17, letterSpacing: -0.7 },
  importText: { maxWidth: 390, textAlign: 'center', color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  formatCard: { backgroundColor: colors.board, borderRadius: radius.medium, padding: 18 },
  formatTitle: { fontSize: 12, color: colors.chalkDim, fontWeight: '800', marginBottom: 12, letterSpacing: 0.5 },
  codeText: { color: colors.chalk, fontSize: 11, lineHeight: 19, fontFamily: mono },
  formatHint: { color: colors.chalkDim, fontSize: 10, marginTop: 13 },
  dropZone: { minHeight: 145, borderRadius: radius.medium, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9BECB', alignItems: 'center', justifyContent: 'center', marginVertical: 17, paddingHorizontal: 20 },
  dropZoneReady: { backgroundColor: '#EEF2FD', borderColor: colors.blue },
  dropTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 9, textAlign: 'center' },
  dropText: { color: colors.muted, fontSize: 11, marginTop: 4 },
  resultCard: { backgroundColor: colors.greenSoft, borderRadius: 14, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  resultTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  resultText: { color: colors.muted, fontSize: 11, marginTop: 3 },
  importErrorCard: { backgroundColor: colors.redSoft, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 },
  importErrorText: { color: '#8F3227', fontSize: 12, lineHeight: 18, flex: 1 },
  errorText: { color: colors.red, fontSize: 11, marginBottom: 5 },
  createIcon: { width: 94, height: 94, borderRadius: 26, backgroundColor: colors.yellowSoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: 28 },
  createGlyph: { fontSize: 42, fontWeight: '700', color: colors.blue, fontFamily: mono },
  mixCard: { backgroundColor: colors.paper, borderRadius: radius.medium, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: '#ECECF0', marginBottom: 24, ...shadow },
  mixIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  mixCopy: { flex: 1, minWidth: 0 },
  mixTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  mixCaption: { fontSize: 12, color: colors.muted, marginTop: 3 },
  mixList: { maxHeight: 320, marginTop: 18 },
  mixFilterRow: { flexGrow: 0, marginTop: 16 },
  mixFilterContent: { gap: 7, paddingRight: 8, paddingVertical: 2 },
  mixFilterChip: { height: 34, borderRadius: 17, backgroundColor: colors.blueSoft, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 5 },
  mixFilterChipOn: { backgroundColor: colors.blue },
  mixFilterChipText: { fontSize: 12, fontWeight: '800', color: colors.blue },
  mixFilterChipTextOn: { color: colors.white },
  mixGroup: { backgroundColor: colors.paper, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, marginBottom: 10, paddingVertical: 6 },
  mixGroupTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', paddingVertical: 7 },
  mixRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11 },
  mixRowBorder: { borderBottomWidth: 1, borderBottomColor: '#ECECF1' },
  mixCheckbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: '#C7CAD4', alignItems: 'center', justifyContent: 'center' },
  mixCheckboxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  mixRowCopy: { flex: 1, minWidth: 0 },
  mixRowTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  mixRowMeta: { fontSize: 11, color: colors.muted, marginTop: 3 },
  deckMarkSmall: { width: 30, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  deckMarkSmallGlyph: { fontSize: 13, fontWeight: '700', color: colors.blue, fontFamily: mono },
  mixEmpty: { paddingVertical: 22, alignItems: 'center' },
  mixEmptyText: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  homeHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statsBoard: { backgroundColor: colors.board, borderRadius: radius.large, padding: 22, overflow: 'hidden', ...shadow },
  statsBoardRow: { flexDirection: 'row', zIndex: 2 },
  statsBoardCell: { flex: 1 },
  statsBoardDivider: { width: 1, backgroundColor: 'rgba(241, 247, 239, 0.18)', marginHorizontal: 16 },
  statsBoardLabel: { color: colors.chalkDim, fontWeight: '800', fontSize: 10, letterSpacing: 1.1 },
  statsBoardNumber: { color: colors.chalk, fontWeight: '700', fontSize: 46, lineHeight: 52, marginTop: 6, letterSpacing: -2, fontFamily: mono },
  statsBoardCaption: { color: colors.chalkDim, fontWeight: '600', fontSize: 11, marginTop: 4 },
  statsPillRow: { flexDirection: 'row', gap: 9, marginTop: 14 },
  statsPill: { flex: 1, minHeight: 42, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: '#ECECF0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  statsPillText: { fontSize: 11, fontWeight: '800', color: colors.ink },
  statsHint: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 16 },
  chartCard: { backgroundColor: colors.paper, borderRadius: radius.medium, borderWidth: 1, borderColor: '#ECECF0', padding: 16, flexDirection: 'row', ...shadow },
  chartColumn: { flex: 1, alignItems: 'center' },
  chartValue: { height: 15, fontSize: 10, fontWeight: '800', color: colors.muted, fontFamily: mono },
  chartBarTrack: { height: 96, justifyContent: 'flex-end', alignItems: 'center' },
  chartBar: { width: 18, borderRadius: 5 },
  chartLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, marginTop: 7 },
  chartLabelToday: { color: colors.blue },
  statsCount: { fontSize: 20, fontWeight: '700', color: colors.ink, fontFamily: mono },
  statsGlobalValue: { fontSize: 42, fontWeight: '700', color: colors.ink, fontFamily: mono, letterSpacing: -2 },
  statsGlobalCaption: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 13 },
});
