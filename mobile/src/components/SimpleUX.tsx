import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, SectionHeader, StatusPill } from './UI';
import { useTheme } from '../context/ThemeContext';

type Tone = 'neutral' | 'ready' | 'caution' | 'risk' | 'info';

export function HeroDecisionCard({
  eyebrow,
  title,
  body,
  accent,
  statusLabel,
  statusTone = 'neutral',
  actionLabel,
  onAction,
  children,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  accent?: string;
  statusLabel?: string;
  statusTone?: Tone;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  const { colors, fonts } = useTheme();
  const tone = accent ?? colors.accent;

  return (
    <Card style={[styles.hero, { borderColor: tone, backgroundColor: colors.card }]}>
      <View style={styles.heroTop}>
        <View style={styles.heroCopy}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: tone, fontFamily: fonts.bold }]}>{eyebrow}</Text> : null}
          <Text numberOfLines={2} style={[styles.heroTitle, { color: colors.ink, fontFamily: fonts.display }]}>{title}</Text>
          {body ? <Text numberOfLines={2} style={[styles.body, { color: colors.muted, fontFamily: fonts.medium }]}>{body}</Text> : null}
        </View>
        {statusLabel ? <StatusPill label={statusLabel} tone={statusTone} /> : null}
      </View>
      {children}
      {actionLabel && onAction ? <Button onPress={onAction}>{actionLabel}</Button> : null}
    </Card>
  );
}

export function SectionCard({
  title,
  body,
  ctaLabel,
  onPress,
  statusLabel,
  statusTone = 'neutral',
  children,
  detailLabel,
  detailChildren,
  initiallyExpanded = false,
}: {
  title: string;
  body?: string | string[];
  ctaLabel?: string;
  onPress?: () => void;
  statusLabel?: string;
  statusTone?: Tone;
  children?: ReactNode;
  detailLabel?: string;
  detailChildren?: ReactNode;
  initiallyExpanded?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const bodyRows = Array.isArray(body) ? body : body ? [body] : [];

  return (
    <Card style={styles.sectionCard}>
      <SectionHeader
        title={title}
        action={statusLabel ? <StatusPill label={statusLabel} tone={statusTone} /> : undefined}
      />
      {bodyRows.slice(0, 2).map((row, index) => (
        <Text key={`${index}-${row}`} numberOfLines={2} style={[styles.body, { color: colors.muted, fontFamily: fonts.medium }]}>{row}</Text>
      ))}
      {children}
      <View style={styles.cardActions}>
        {ctaLabel && onPress ? <Button style={styles.cardButton} variant="secondary" onPress={onPress}>{ctaLabel}</Button> : null}
        {detailLabel && detailChildren ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setExpanded(value => !value)}
            style={({ pressed }) => [styles.detailToggle, { borderColor: colors.border, backgroundColor: colors.bgElev }, pressed && { opacity: 0.82 }]}
          >
            <Ionicons name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={colors.accent} />
            <Text numberOfLines={1} style={[styles.detailToggleText, { color: colors.ink, fontFamily: fonts.bold }]}>{detailLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {expanded && detailChildren ? <View style={styles.detailBody}>{detailChildren}</View> : null}
    </Card>
  );
}

export function ActionStrip({
  actions,
}: {
  actions: Array<{
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress?: () => void;
    disabled?: boolean;
    primary?: boolean;
  }>;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.actionStrip}>
      {actions.slice(0, 3).map((action, index) => (
        <Pressable
          key={`${index}-${action.label}`}
          disabled={action.disabled}
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.actionButton,
            {
              borderColor: action.primary ? colors.accent : colors.border,
              backgroundColor: action.primary ? colors.accent : colors.bgElev,
            },
            pressed && !action.disabled && { opacity: 0.86, transform: [{ scale: 0.98 }] },
            action.disabled && { opacity: 0.45 },
          ]}
        >
          <Ionicons name={action.icon} size={18} color={action.primary ? colors.accentText : colors.accent} />
          <Text
            numberOfLines={2}
            style={[styles.actionText, { color: action.primary ? colors.accentText : colors.ink, fontFamily: fonts.bold }]}
          >
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function InfoRow({ label, value }: { label: string; value: string | number }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.faint, fontFamily: fonts.bold }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.ink, fontFamily: fonts.extraBold }]}>{value}</Text>
    </View>
  );
}

export function CollapsibleDetails({
  label,
  children,
  initiallyOpen = false,
}: {
  label: string;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.collapsible}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(value => !value)}
        style={({ pressed }) => [styles.detailToggle, { borderColor: colors.border, backgroundColor: colors.bgElev }, pressed && { opacity: 0.82 }]}
      >
        <Ionicons name={open ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={colors.accent} />
        <Text style={[styles.detailToggleText, { color: colors.ink, fontFamily: fonts.bold }]}>{label}</Text>
      </Pressable>
      {open ? <View style={styles.detailBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 8, padding: 18, gap: 14, minHeight: 132 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroCopy: { flex: 1, gap: 6, minWidth: 0 },
  eyebrow: { fontSize: 11, lineHeight: 15, letterSpacing: 0.3 },
  heroTitle: { fontSize: 24, lineHeight: 30, letterSpacing: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  sectionCard: { borderRadius: 8, padding: 15, gap: 10 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardButton: { minHeight: 46, flexGrow: 1 },
  actionStrip: { flexDirection: 'row', gap: 8, width: '100%' },
  actionButton: { flex: 1, minWidth: 0, minHeight: 56, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 8 },
  actionText: { fontSize: 12, lineHeight: 15, textAlign: 'center' },
  detailToggle: { minHeight: 42, borderWidth: 1, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 11 },
  detailToggleText: { fontSize: 13, lineHeight: 17 },
  detailBody: { gap: 8, paddingTop: 2 },
  infoRow: { borderBottomWidth: 1, paddingVertical: 10, gap: 4 },
  infoLabel: { fontSize: 11, lineHeight: 15, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, lineHeight: 19 },
  collapsible: { gap: 8 },
});
