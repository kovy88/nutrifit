// ── ERROR BOUNDARY
//
// Poslední pojistka proti "bílé obrazovce". Když kterákoli obrazovka při renderu
// hodí výjimku, místo pádu appky ukážeme klidný fallback s tlačítkem "Zkusit
// znovu". Je to class component (React boundaries musí být class) a je záměrně
// SAMOSTATNÝ — nepoužívá theme/i18n hooky, protože chyba může pocházet právě
// z některého providera. Texty proto držíme staticky anglicky.

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
    console.error('Trenr crashed:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>Trenr is safe</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Your data is still stored safely on this phone.
        </Text>
        <Pressable style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10, backgroundColor: '#050806' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: '#F4F7EF', textAlign: 'center' },
  subtitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: '#C8F250', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, color: '#A2AD9B', textAlign: 'center', marginTop: 6 },
  button: { marginTop: 18, backgroundColor: '#C8F250', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { color: '#071008', fontWeight: '800', fontSize: 15 },
});
