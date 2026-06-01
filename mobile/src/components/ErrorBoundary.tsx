// ── ERROR BOUNDARY
//
// Poslední pojistka proti "bílé obrazovce". Když kterákoli obrazovka při renderu
// hodí výjimku, místo pádu appky ukážeme klidný fallback s tlačítkem "Zkusit
// znovu". Je to class component (React boundaries musí být class) a je záměrně
// SAMOSTATNÝ — nepoužívá theme/i18n hooky, protože chyba může pocházet právě
// z některého providera. Texty proto držíme dvojjazyčně inline.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Necháme v konzoli / crash reporteru (Sentry až přibude) pro diagnostiku.
    console.error('NutriPlan crashed:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>🌿</Text>
        <Text style={styles.title}>Něco se pokazilo</Text>
        <Text style={styles.subtitle}>Something went wrong</Text>
        <Text style={styles.body}>
          Appka narazila na neočekávanou chybu. Tvoje data jsou v bezpečí uložená v telefonu.
        </Text>
        <Pressable style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonText}>Zkusit znovu · Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10, backgroundColor: '#0B0B0E' },
  emoji: { fontSize: 44 },
  title: { fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 14, fontWeight: '700', color: '#9aa0a6', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, color: '#c5cad0', textAlign: 'center', marginTop: 6 },
  button: { marginTop: 18, backgroundColor: '#22A06B', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
