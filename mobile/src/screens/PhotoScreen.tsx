import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Field,
  Label,
  LoadingState,
  MetricCard,
  ScreenHeader,
} from '../components/UI';
import { ActionStrip, CollapsibleDetails, InfoRow, SectionCard } from '../components/SimpleUX';
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
      const next = await analyzeFoodPhoto(image.uri, image.mimeType || 'image/jpeg');
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
      <ScreenHeader onBack={() => navigation.goBack()} eyebrow={t('photo.eyebrow')} title={t('photo.title')} subtitle={photoHeaderCopy(locale)} />

      <SectionCard
        title={image ? t('photo.previewTitle') : t('photo.startTitle')}
        body={image ? photoPreviewCopy(locale) : photoEmptyCopy(locale)}
        statusLabel={estimate ? t('photo.reviewReady') : image ? t('photo.readyToAnalyze') : undefined}
        statusTone={estimate ? 'ready' : image ? 'info' : 'neutral'}
      >
        {image ? (
          <Image source={{ uri: image.uri }} resizeMode="cover" style={[styles.image, { backgroundColor: colors.border }]} />
        ) : (
          <View style={[styles.emptyPreview, { borderColor: colors.border, backgroundColor: colors.bgElev }]}>
            <Text style={[styles.emptyPreviewTitle, { color: colors.ink, fontFamily: fonts.bold }]}>{t('photo.emptyTitle')}</Text>
          </View>
        )}
        <ActionStrip
          actions={[
            { icon: 'camera-outline', label: t('photo.takePhoto'), onPress: takePhoto },
            { icon: 'images-outline', label: t('photo.gallery'), onPress: pickImage },
            ...(image ? [{
              icon: 'sparkles-outline' as const,
              label: loading ? t('photo.analyzing') : estimate ? photoRecheckLabel(locale) : photoEstimateLabel(locale),
              onPress: analyze,
              disabled: loading,
              primary: !estimate,
            }] : []),
          ]}
        />
      </SectionCard>

      {loading ? <LoadingState title={t('photo.loadingTitle')} body={photoLoadingCopy(locale)} /> : null}

      {error ? (
        <SectionCard title={t('photo.errorTitle')} statusLabel={t('common.error')} statusTone="risk">
          <Text style={[styles.note, { color: colors.muted, fontFamily: fonts.regular }]}>{error}</Text>
          <Button variant="secondary" onPress={analyze} disabled={!image || loading}>{t('common.tryAgain')}</Button>
        </SectionCard>
      ) : null}

      {estimate ? (
        <SectionCard
          title={estimate.foodName || t('photo.reviewTitle')}
          body={estimate.portionGuess ? [estimate.portionGuess, photoReviewCopy(locale)] : photoReviewCopy(locale)}
        >
          <InfoRow label={photoEnergyLabel(locale)} value={estimate.kcal} />
          <InfoRow label={t('home.protein')} value={`${estimate.protein} g`} />
          <Button onPress={save}>{t('photo.addToDay')}</Button>
          <CollapsibleDetails label={photoEditLabel(locale)}>
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
            {estimate.confidence ? <Text style={[styles.note, { color: colors.faint, fontFamily: fonts.regular }]}>{estimate.confidence}</Text> : null}
            {estimate.note ? <Text style={[styles.note, { color: colors.faint, fontFamily: fonts.regular }]}>{estimate.note}</Text> : null}
          </CollapsibleDetails>
          <Text style={[styles.disclaimer, { color: colors.faint, fontFamily: fonts.regular }]}>{t('photo.disclaimer')}</Text>
        </SectionCard>
      ) : null}
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </Screen>
  );
}

function photoHeaderCopy(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'Pick a photo, check the estimate, then add it to today.'
    : 'Vyber fotku, zkontroluj odhad a přidej ho do dne.';
}

function photoEmptyCopy(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'Start with one clear photo. You can adjust the estimate before saving.'
    : 'Začni jednou jasnou fotkou. Odhad můžeš před uložením upravit.';
}

function photoPreviewCopy(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'Check that this is the meal you want to log.'
    : 'Zkontroluj, že je to jídlo, které chceš zapsat.';
}

function photoLoadingCopy(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'Looking for the meal and a practical portion estimate.'
    : 'Hledám jídlo a praktický odhad porce.';
}

function photoReviewCopy(locale: 'cs' | 'en'): string {
  return locale === 'en'
    ? 'If the portion looks close, add it. Edit details only when needed.'
    : 'Pokud porce sedí, přidej ji. Detaily uprav jen když je potřeba.';
}

function photoEstimateLabel(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Estimate meal' : 'Odhadnout jídlo';
}

function photoRecheckLabel(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Recheck' : 'Zkontrolovat znovu';
}

function photoEditLabel(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Edit details' : 'Upravit detaily';
}

function photoEnergyLabel(locale: 'cs' | 'en'): string {
  return locale === 'en' ? 'Energy' : 'Energie';
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
  screen: { gap: 14 },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8 },
  emptyPreview: { minHeight: 132, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  emptyPreviewTitle: { fontSize: 15, lineHeight: 20, textAlign: 'center' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricInput: { width: '47%', flexGrow: 1, gap: 6 },
  note: { fontSize: 14, lineHeight: 20 },
  disclaimer: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
});
