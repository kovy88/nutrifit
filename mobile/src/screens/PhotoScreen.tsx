import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import {
  ActionIconButton,
  Button,
  Card,
  EmptyState,
  Field,
  Label,
  LoadingState,
  MetricCard,
  ScreenHeader,
  SectionHeader,
  StatusPill,
} from '../components/UI';
import { Screen } from '../components/Screen';
import { useTrenr } from '../context/TrenrContext';
import { analyzeFoodPhoto } from '../services/api';
import { normalizeFoodEstimate, formatDateLabel } from '../utils/nutrition';
import type { FoodEstimate } from '../types';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { PaywallModal } from '../components/PaywallModal';

export function PhotoScreen() {
  const { addFood, ensureAiConsent, selectedDate, isSubscribed } = useTrenr();
  const navigation = useNavigation<any>();
  const { colors, fonts } = useTheme();
  const { t, locale } = useLanguage();
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [estimate, setEstimate] = useState<FoodEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled) {
      setImage(result.assets[0]);
      setEstimate(null);
      setError(null);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('photo.permissionTitle'), t('photo.permissionMsg'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled) {
      setImage(result.assets[0]);
      setEstimate(null);
      setError(null);
    }
  }

  async function analyze() {
    if (!image) return;
    if (!isSubscribed) {
      setPaywallOpen(true);
      return;
    }
    const consent = await ensureAiConsent();
    if (!consent) return;
    setLoading(true);
    setError(null);
    try {
      const next = await analyzeFoodPhoto(image.uri, image.mimeType || 'image/jpeg', locale);
      setEstimate(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('photo.tryAnother');
      setError(message);
      Alert.alert(t('photo.analyzeFailed'), message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!estimate) return;
    await addFood(normalizeFoodEstimate(estimate), 'photo');
    setImage(null);
    setEstimate(null);
    setError(null);
    Alert.alert(t('photo.savedTitle'), t('photo.savedMsg', { date: formatDateLabel(selectedDate, locale) }));
    navigation.navigate('Main', { screen: 'Dnes' });
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <ScreenHeader onBack={() => navigation.goBack()} eyebrow={t('photo.eyebrow')} title={t('photo.title')} subtitle={t('photo.cleanSubtitle')} />

      <Card>
        <SectionHeader
          title={image ? t('photo.previewTitle') : t('photo.startTitle')}
          action={<StatusPill label={estimate ? t('photo.reviewReady') : image ? t('photo.readyToAnalyze') : t('photo.emptyStatus')} tone={estimate ? 'ready' : image ? 'info' : 'neutral'} />}
        />
        {image ? (
          <Image source={{ uri: image.uri }} resizeMode="cover" style={[styles.image, { backgroundColor: colors.border }]} />
        ) : (
          <EmptyState title={t('photo.emptyTitle')} body={t('photo.emptyBody')} />
        )}
        <View style={styles.actionRow}>
          <ActionIconButton icon="camera-outline" label={t('photo.takePhoto')} onPress={takePhoto} />
          <ActionIconButton icon="images-outline" label={t('photo.gallery')} onPress={pickImage} />
        </View>
        {image ? (
          <ActionIconButton
            icon="sparkles-outline"
            label={loading ? t('photo.analyzing') : estimate ? t('photo.reanalyze') : t('photo.estimateMacros')}
            variant={estimate ? 'secondary' : 'primary'}
            disabled={loading}
            onPress={analyze}
          />
        ) : null}
      </Card>

      {loading ? <LoadingState title={t('photo.loadingTitle')} body={t('photo.loadingBody')} /> : null}

      {error ? (
        <Card style={{ borderColor: colors.red }}>
          <SectionHeader title={t('photo.errorTitle')} />
          <Text style={[styles.note, { color: colors.muted, fontFamily: fonts.regular }]}>{error}</Text>
          <Button variant="secondary" onPress={analyze} disabled={!image || loading}>{t('common.tryAgain')}</Button>
        </Card>
      ) : null}

      {estimate ? (
        <Card>
          <SectionHeader
            title={t('photo.reviewTitle')}
            action={<StatusPill label={estimate.confidence || t('photo.confidenceUnknown')} tone="caution" />}
          />
          <Text style={[styles.note, { color: colors.muted, fontFamily: fonts.regular }]}>{t('photo.reviewBody')}</Text>

          <Label>{t('photo.foodName')}</Label>
          <Field value={estimate.foodName} onChangeText={foodName => setEstimate(value => value && ({ ...value, foodName }))} />
          <Label>{t('photo.portion')}</Label>
          <Field value={estimate.portionGuess} onChangeText={portionGuess => setEstimate(value => value && ({ ...value, portionGuess }))} />

          <View style={styles.metricGrid}>
            <MetricInput label={t('workout.kcal')} value={estimate.kcal} onChange={kcal => setEstimate(value => value && ({ ...value, kcal }))} color={colors.accent} />
            <MetricInput label={t('home.macroProteinShort')} value={estimate.protein} onChange={protein => setEstimate(value => value && ({ ...value, protein }))} color={colors.green} />
            <MetricInput label={t('home.macroCarbsShort')} value={estimate.carbs} onChange={carbs => setEstimate(value => value && ({ ...value, carbs }))} color={colors.blue} />
            <MetricInput label={t('home.macroFatShort')} value={estimate.fat} onChange={fat => setEstimate(value => value && ({ ...value, fat }))} color={colors.orange} />
          </View>

          {estimate.note ? <Text style={[styles.note, { color: colors.faint, fontFamily: fonts.regular }]}>{estimate.note}</Text> : null}
          <Text style={[styles.disclaimer, { color: colors.faint, fontFamily: fonts.regular }]}>{t('photo.disclaimer')}</Text>
          <Button onPress={save}>{t('photo.addToDay')}</Button>
        </Card>
      ) : null}
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </Screen>
  );
}

function MetricInput({
  label,
  value,
  color,
  onChange,
}: {
  label: string;
  value: number;
  color: string;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.metricInput}>
      <MetricCard label={label} value={value} color={color} />
      <Field
        keyboardType="number-pad"
        value={String(value)}
        onChangeText={next => onChange(Number(next) || 0)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 18 },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 18 },
  actionRow: { flexDirection: 'row', gap: 10 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricInput: { width: '47%', flexGrow: 1, gap: 6 },
  note: { fontSize: 14, lineHeight: 20 },
  disclaimer: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
});
