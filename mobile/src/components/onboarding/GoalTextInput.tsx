import { StyleSheet } from 'react-native';
import { Field } from '../UI';

export function GoalTextInput({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <Field
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      multiline
      textAlignVertical="top"
      autoCapitalize="sentences"
      returnKeyType="done"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 80,
    paddingTop: 12,
    lineHeight: 21,
  },
});
