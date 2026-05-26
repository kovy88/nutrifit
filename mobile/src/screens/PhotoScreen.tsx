import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, H1, Label, Subtitle } from '../components/UI';
import { Screen } from '../components/Screen';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { analyzeFoodPhoto } from '../services/api';
import { normalizeFoodEstimate } from '../utils/nutrition';
import type { FoodEstimate } from '../types';

export function PhotoScreen() {
  const { addFood } = useNutriFit();
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

  async function analyze() {
    if (!image) return;
    setLoading(true);
    try {
      const next = await analyzeFoodPhoto(image.uri, image.mimeType || 'image/jpeg');
      setEstimate(next);
    } catch (err) {
      Alert.alert('Analýza selhala', err instanceof Error ? err.message : 'Zkus jinou fotku.');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!estimate) return;
    await addFood(normalizeFoodEstimate(estimate), 'photo');
    setImage(null);
    setEstimate(null);
    Alert.alert('Uloženo', 'Jídlo je přidané do dnešního příjmu.');
  }

  return (
    <Screen>
      <H1>Foto jídla</H1>
      <Subtitle>AI odhad je vždy editovatelný. Před uložením si zkontroluj porci i makra.</Subtitle>
      <Card>
        <Button onPress={pickImage}>Vybrat fotku</Button>
        {image && <Image source={{ uri: image.uri }} style={styles.image} />}
        {image && <Button disabled={loading} variant="secondary" onPress={analyze}>Odhadnout makra</Button>}
        {loading && <ActivityIndicator color={colors.green} />}
      </Card>

      {estimate && (
        <Card>
          <Label>Upravit odhad</Label>
          <Field value={estimate.foodName} onChangeText={foodName => setEstimate(v => v && ({ ...v, foodName }))} />
          <Field value={estimate.portionGuess} onChangeText={portionGuess => setEstimate(v => v && ({ ...v, portionGuess }))} />
          <View style={styles.row}>
            <Field keyboardType="number-pad" value={String(estimate.kcal)} onChangeText={kcal => setEstimate(v => v && ({ ...v, kcal: Number(kcal) || 0 }))} placeholder="kcal" />
            <Field keyboardType="number-pad" value={String(estimate.protein)} onChangeText={protein => setEstimate(v => v && ({ ...v, protein: Number(protein) || 0 }))} placeholder="B" />
          </View>
          <View style={styles.row}>
            <Field keyboardType="number-pad" value={String(estimate.carbs)} onChangeText={carbs => setEstimate(v => v && ({ ...v, carbs: Number(carbs) || 0 }))} placeholder="S" />
            <Field keyboardType="number-pad" value={String(estimate.fat)} onChangeText={fat => setEstimate(v => v && ({ ...v, fat: Number(fat) || 0 }))} placeholder="T" />
          </View>
          <Text style={styles.note}>{estimate.confidence} jistota · {estimate.note}</Text>
          <Button onPress={save}>Přidat do dne</Button>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 240, borderRadius: 16, backgroundColor: colors.border },
  row: { flexDirection: 'row', gap: 10 },
  note: { color: colors.muted, lineHeight: 20 },
});
