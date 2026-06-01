import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Label, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useTrenr } from '../context/TrenrContext';
import { analyzeFoodPhoto } from '../services/api';
import { normalizeFoodEstimate, formatDateLabel } from '../utils/nutrition';
import type { FoodEstimate } from '../types';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export function PhotoScreen() {
  const { addFood, ensureAiConsent, selectedDate } = useTrenr();
  const navigation = useNavigation<any>();
  const { colors: themeColors } = useTheme();
  const { t } = useLanguage();
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [estimate, setEstimate] = useState<FoodEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled) {
      setImage(result.assets[0]);
      setEstimate(null);
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
    }
  }

  async function analyze() {
    if (!image) return;
    const consent = await ensureAiConsent();
    if (!consent) return;
    setLoading(true);
    try {
      const next = await analyzeFoodPhoto(image.uri, image.mimeType || 'image/jpeg');
      setEstimate(next);
    } catch (err) {
      Alert.alert(t('photo.analyzeFailed'), err instanceof Error ? err.message : t('photo.tryAnother'));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!estimate) return;
    await addFood(normalizeFoodEstimate(estimate), 'photo');
    setImage(null);
    setEstimate(null);
    Alert.alert(t('photo.savedTitle'), t('photo.savedMsg', { date: formatDateLabel(selectedDate) }));
    navigation.navigate('Main', { screen: 'Dnes' });
  }

  return (
    <Screen>
      <H1>{t('photo.title')}</H1>
      <Subtitle>{t('photo.subtitle')}</Subtitle>
      <Card>
        <View style={styles.row}>
          <Button style={{ flex: 1 }} onPress={takePhoto}>{t('photo.takePhoto')}</Button>
          <Button style={{ flex: 1 }} variant="secondary" onPress={pickImage}>{t('photo.gallery')}</Button>
        </View>
        {image && <Image source={{ uri: image.uri }} style={[styles.image, { backgroundColor: themeColors.border }]} />}
        {image && <Button disabled={loading} style={{ marginTop: 6 }} variant="secondary" onPress={analyze}>{t('photo.estimateMacros')}</Button>}
        {loading && <ActivityIndicator color={themeColors.green} />}
      </Card>

      {estimate && (
        <Card>
          <Label>{t('photo.editEstimate')}</Label>
          <Field value={estimate.foodName} onChangeText={foodName => setEstimate(v => v && ({ ...v, foodName }))} />
          <Field value={estimate.portionGuess} onChangeText={portionGuess => setEstimate(v => v && ({ ...v, portionGuess }))} />
          <View style={styles.row}>
            <Field keyboardType="number-pad" value={String(estimate.kcal)} onChangeText={kcal => setEstimate(v => v && ({ ...v, kcal: Number(kcal) || 0 }))} placeholder="kcal" />
            <Field keyboardType="number-pad" value={String(estimate.protein)} onChangeText={protein => setEstimate(v => v && ({ ...v, protein: Number(protein) || 0 }))} placeholder={t('home.macroProteinShort')} />
          </View>
          <View style={styles.row}>
            <Field keyboardType="number-pad" value={String(estimate.carbs)} onChangeText={carbs => setEstimate(v => v && ({ ...v, carbs: Number(carbs) || 0 }))} placeholder={t('home.macroCarbsShort')} />
            <Field keyboardType="number-pad" value={String(estimate.fat)} onChangeText={fat => setEstimate(v => v && ({ ...v, fat: Number(fat) || 0 }))} placeholder={t('home.macroFatShort')} />
          </View>
          <Text style={[styles.note, { color: themeColors.muted }]}>{t('photo.confidenceNote', { confidence: estimate.confidence ?? '', note: estimate.note ?? '' })}</Text>
          <Button onPress={save}>{t('photo.addToDay')}</Button>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 240, borderRadius: 16, marginTop: 10 },
  row: { flexDirection: 'row', gap: 10 },
  note: { fontSize: 13, lineHeight: 20 },
});
