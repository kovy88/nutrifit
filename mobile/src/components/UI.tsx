import { PropsWithChildren, ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { typography } from '../constants/theme';
export * from './premium';

/** Muted body line. Not exported — RecoveryCard is the only remaining consumer
 *  after the unused-component cleanup. */
function Subtitle({ children }: PropsWithChildren) {
  const { colors, fonts } = useTheme();
  return <Text style={[styles.subtitle, { color: colors.muted, fontFamily: fonts.regular }]}>{children}</Text>;
}

export function H1({ children }: PropsWithChildren) {
  const { colors, fonts } = useTheme();
  return <Text style={[styles.h1, { color: colors.ink, fontFamily: fonts.display }]}>{children}</Text>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: any }>) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.hairline,
          shadowColor: colors.shadow,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({ children }: PropsWithChildren) {
  const { colors, fonts } = useTheme();
  return <Text style={[styles.label, { color: colors.faint, fontFamily: fonts.bold }]}>{children}</Text>;
}

export function Field({ style, ...props }: TextInputProps) {
  const { colors, fonts } = useTheme();
  // Browsers default a <textarea> to 2 rows of intrinsic height, which overrides minHeight
  // and breaks single-line vertical centering. Pin it to 1 row on web; native has no such default.
  const webRowsProp = Platform.OS === 'web' && props.multiline ? ({ rows: 1 } as Record<string, number>) : undefined;
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      {...webRowsProp}
      style={[
        styles.field,
        {
          color: colors.ink,
          backgroundColor: colors.bgElev,
          borderColor: colors.border,
          fontFamily: fonts.regular,
        },
        style,
      ]}
      {...props}
    />
  );
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: PropsWithChildren<{
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: any;
}>) {
  const { colors, fonts } = useTheme();

  const textColor =
    variant === 'primary' ? colors.accentText : variant === 'danger' ? '#fff' : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && {
          backgroundColor: colors.accent,
        },
        variant === 'secondary' && {
          backgroundColor: colors.bgElev,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        variant === 'danger' && { backgroundColor: colors.red },
        disabled && styles.disabled,
        pressed && !disabled && { transform: [{ scale: 0.97 }], opacity: 0.92 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: textColor, fontFamily: fonts.extraBold }]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function Pill({ active, children, onPress }: PropsWithChildren<{ active?: boolean; onPress?: () => void }>) {
  const { colors, fonts } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[
        styles.pill,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accent + '14' : colors.bgElev,
        },
      ]}
    >
      <Text
        style={[
          styles.pillText,
          {
            color: active ? colors.accent : colors.muted,
            fontFamily: fonts.bold,
          },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  action,
  onBack,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: ReactNode;
  onBack?: () => void;
}) {
  const { colors, fonts } = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.screenHeader}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('a11y.back')} onPress={onBack} hitSlop={10} style={[styles.screenHeaderBack, { borderColor: colors.hairline, backgroundColor: colors.bgElev }]}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
      ) : null}
      <View style={styles.screenHeaderText}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: colors.accent, fontFamily: fonts.bold }]}>{eyebrow}</Text> : null}
        <Text style={[styles.screenTitle, { color: colors.ink, fontFamily: fonts.display }]}>{title}</Text>
        {subtitle ? <Text style={[styles.screenSubtitle, { color: colors.muted, fontFamily: fonts.regular }]}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.screenHeaderAction}>{action}</View> : null}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.ink, fontFamily: fonts.medium }]}>{title}</Text>
      {action}
    </View>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  detail,
  color,
  compact,
}: {
  label: string;
  value: string | number;
  unit?: string;
  detail?: string;
  color?: string;
  compact?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const accent = color ?? colors.accent;
  return (
    <View style={[styles.metricCard, compact && styles.metricCardCompact, { borderColor: colors.hairline, backgroundColor: colors.bgElev }]}>
      <Text style={[styles.metricLabel, compact && styles.metricLabelCompact, { color: colors.faint, fontFamily: fonts.bold }]}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={[styles.metricValue, compact && styles.metricValueCompact, { color: accent, fontFamily: fonts.number }]}>{value}</Text>
        {unit ? <Text style={[styles.metricUnit, { color: colors.muted, fontFamily: fonts.bold }]}>{unit}</Text> : null}
      </View>
      {detail ? <Text style={[styles.metricDetail, { color: colors.muted, fontFamily: fonts.regular }]}>{detail}</Text> : null}
    </View>
  );
}

export function RecoveryCard({
  title,
  metrics,
  recommendation,
  status,
  detailsLabel,
}: {
  title: string;
  metrics: { label: string; value: string; color?: string }[];
  recommendation: string;
  status?: string;
  /** When set, the recommendation copy is tucked behind a collapsible "why" toggle. */
  detailsLabel?: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Card>
      <View style={styles.cardTitleRow}>
        <Text style={[styles.sectionTitle, { color: colors.ink, fontFamily: fonts.medium }]}>{title}</Text>
        {status ? <Text style={[styles.cardBadge, { color: colors.blue, borderColor: colors.blue + '44', backgroundColor: colors.blue + '12', fontFamily: fonts.bold }]}>{status}</Text> : null}
      </View>
      <View style={styles.recoveryMetricsRow}>
        {metrics.map((metric, i) => (
          <View
            key={metric.label}
            style={[
              styles.recoveryMetricCell,
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
            ]}
          >
            <Text style={[styles.recoveryMetricValue, { color: metric.color ?? colors.ink, fontFamily: fonts.number }]}>{metric.value}</Text>
            <Text style={[styles.recoveryMetricLabel, { color: colors.faint, fontFamily: fonts.medium }]}>{metric.label}</Text>
          </View>
        ))}
      </View>
      {detailsLabel ? (
        <CollapsibleDetails label={detailsLabel}>
          <Subtitle>{recommendation}</Subtitle>
        </CollapsibleDetails>
      ) : (
        <Subtitle>{recommendation}</Subtitle>
      )}
    </Card>
  );
}

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'ready' | 'caution' | 'risk' | 'info';
}) {
  const { colors, fonts } = useTheme();
  const toneColor =
    tone === 'ready' ? colors.green :
    tone === 'caution' ? colors.orange :
    tone === 'risk' ? colors.red :
    tone === 'info' ? colors.blue :
    colors.border;
  return (
    <Text
      style={[
        styles.statusPill,
        {
          color: tone === 'neutral' ? colors.muted : toneColor,
          borderColor: toneColor,
          backgroundColor: tone === 'neutral' ? colors.bgElev : toneColor + '12',
          fontFamily: fonts.bold,
        },
      ]}
    >
      {label}
    </Text>
  );
}

export function SettingRow({
  title,
  body,
  meta,
  action,
  children,
}: PropsWithChildren<{
  title: string;
  body?: string;
  meta?: string;
  action?: ReactNode;
}>) {
  const { colors, fonts } = useTheme();
  return (
    <View style={[styles.settingRow, { borderColor: colors.hairline, backgroundColor: colors.bgElev }]}>
      <View style={styles.settingText}>
        <Text style={[styles.settingTitle, { color: colors.ink, fontFamily: fonts.bold }]}>{title}</Text>
        {body ? <Text style={[styles.settingBody, { color: colors.muted, fontFamily: fonts.regular }]}>{body}</Text> : null}
        {meta ? <Text style={[styles.settingMeta, { color: colors.faint, fontFamily: fonts.bold }]}>{meta}</Text> : null}
      </View>
      {action ? <View style={styles.settingAction}>{action}</View> : null}
      {children ? <View style={styles.settingChildren}>{children}</View> : null}
    </View>
  );
}

export function SourceStatusCard({
  title,
  body,
  meta,
  status,
  statusTone = 'neutral',
  action,
  error,
}: {
  title: string;
  body: string;
  meta?: string;
  status?: string;
  statusTone?: 'neutral' | 'ready' | 'caution' | 'risk' | 'info';
  action?: ReactNode;
  error?: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={[styles.sourceCard, { borderColor: colors.hairline, backgroundColor: colors.bgElev }]}>
      <View style={styles.sourceCardHeader}>
        <Text style={[styles.sourceCardTitle, { color: colors.ink, fontFamily: fonts.extraBold }]}>{title}</Text>
        {status ? <StatusPill label={status} tone={statusTone} /> : null}
      </View>
      <Text style={[styles.sourceCardBody, { color: colors.muted, fontFamily: fonts.regular }]}>{body}</Text>
      {meta ? <Text style={[styles.sourceCardMeta, { color: colors.faint, fontFamily: fonts.bold }]}>{meta}</Text> : null}
      {error ? <Text style={[styles.sourceCardError, { color: colors.red, fontFamily: fonts.bold }]}>{error}</Text> : null}
      {action ? <View style={styles.sourceCardAction}>{action}</View> : null}
    </View>
  );
}

export function EmptyState({
  title,
  body,
  cta,
  onPress,
}: {
  title: string;
  body?: string;
  cta?: string;
  onPress?: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Card style={styles.stateCard}>
      <Text style={[styles.stateTitle, { color: colors.ink, fontFamily: fonts.extraBold }]}>{title}</Text>
      {body ? <Text style={[styles.stateBody, { color: colors.muted, fontFamily: fonts.regular }]}>{body}</Text> : null}
      {cta && onPress ? <Button onPress={onPress}>{cta}</Button> : null}
    </Card>
  );
}

export function LoadingState({ title, body }: { title: string; body?: string }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.stateCard}>
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonBlock, { backgroundColor: colors.bgElev }]} />
        <View style={[styles.skeletonLine, { backgroundColor: colors.bgElev }]} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.ink }]}>{title}</Text>
      {body ? <Text style={[styles.stateBody, { color: colors.muted }]}>{body}</Text> : null}
    </Card>
  );
}

/** Collapsible settings/section card — a title + one-line summary that expands to its
 *  editable content on tap. Keeps long forms (Profile) calm: scan summaries, tap to edit. */
export function SectionCard({
  title,
  summary,
  defaultOpen = false,
  children,
}: PropsWithChildren<{ title: string; summary?: string; defaultOpen?: boolean }>) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(value => !value)}
        style={({ pressed }) => [styles.sectionCardHead, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.sectionCardHeadText}>
          <Text style={[styles.sectionCardTitle, { color: colors.ink, fontFamily: fonts.extraBold }]}>{title}</Text>
          {summary ? (
            <Text style={[styles.sectionCardSummary, { color: colors.muted, fontFamily: fonts.regular }]} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {open ? <View style={styles.sectionCardBody}>{children}</View> : null}
    </Card>
  );
}

/** Lightweight disclosure — keeps a short "why" / detail behind a tap so the primary
 *  card stays calm. Used for readiness explanation, recovery recommendation, etc. */
export function CollapsibleDetails({
  label,
  children,
  defaultOpen = false,
}: PropsWithChildren<{ label: string; defaultOpen?: boolean }>) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.collapsible}>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => setOpen(value => !value)}
        style={({ pressed }) => [styles.collapsibleToggle, pressed && { opacity: 0.7 }]}
      >
        <Text style={[styles.collapsibleLabel, { color: colors.muted, fontFamily: fonts.bold }]}>{label}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={colors.muted} />
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

export function FadeInView({
  children,
  delay = 0,
  duration = 420,
  style,
}: PropsWithChildren<{
  delay?: number;
  duration?: number;
  style?: any;
}>) {
  /* eslint-disable react-hooks/refs -- Animated.Value refs are stable mutable
     animation drivers meant to be read directly here, not React render state. */
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: duration,
        useNativeDriver: true,
        delay: delay,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: duration,
        useNativeDriver: true,
        delay: delay,
      }),
    ]).start();
  }, [delay, duration, fadeAnim, slideAnim]);

  return (
    <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }, style]}>
      {children}
    </Animated.View>
  );
  /* eslint-enable react-hooks/refs */
}

const styles = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: '800', letterSpacing: 0, lineHeight: 38 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 16, letterSpacing: 0 },
  field: { minHeight: 52, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 16, fontSize: typography.bodyLarge, lineHeight: 20, textAlignVertical: 'center' },
  button: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  disabled: { opacity: 0.45 },
  buttonText: { fontSize: 15.5, fontWeight: '700', letterSpacing: 0 },
  pill: { minHeight: 42, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 14, fontWeight: '600' },
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  screenHeaderText: { flex: 1, gap: 3 },
  screenHeaderAction: { alignItems: 'flex-end' },
  screenHeaderBack: { width: 40, height: 40, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 0 },
  screenTitle: { fontSize: typography.screenTitle, fontWeight: '800', lineHeight: 38, letterSpacing: 0 },
  screenSubtitle: { fontSize: typography.body, lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  metricCard: { flex: 1, minWidth: '47%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, gap: 2 },
  metricCardCompact: { minWidth: '22%', paddingHorizontal: 10, paddingVertical: 10 },
  metricLabel: { fontSize: 11, fontWeight: '600', lineHeight: 15, letterSpacing: 0 },
  metricLabelCompact: { fontSize: 9, letterSpacing: 0.2 },
  metricValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  metricValue: { fontSize: 25, fontWeight: '700', lineHeight: 30, letterSpacing: 0 },
  metricValueCompact: { fontSize: 20, lineHeight: 25 },
  metricUnit: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  metricDetail: { fontSize: 11, lineHeight: 15 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardBadge: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 10, fontWeight: '600', lineHeight: 14, letterSpacing: 0 },
  statusPill: { alignSelf: 'flex-start', fontSize: 10, fontWeight: '600', lineHeight: 14, letterSpacing: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  settingRow: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 10 },
  settingText: { flex: 1, gap: 3 },
  settingTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  settingBody: { fontSize: 13, lineHeight: 18 },
  settingMeta: { fontSize: 12, lineHeight: 16, letterSpacing: 0, marginTop: 2 },
  settingAction: { alignSelf: 'flex-start' },
  settingChildren: { gap: 8 },
  sourceCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 8 },
  sourceCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  sourceCardTitle: { flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  sourceCardBody: { fontSize: 13, lineHeight: 18 },
  sourceCardMeta: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  sourceCardError: { fontSize: 12, lineHeight: 17 },
  sourceCardAction: { marginTop: 2 },
  sectionCardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionCardHeadText: { flex: 1, gap: 2 },
  sectionCardTitle: { fontSize: 15, lineHeight: 20 },
  sectionCardSummary: { fontSize: 13, lineHeight: 18 },
  sectionCardBody: { gap: 12, marginTop: 4 },
  collapsible: { gap: 8 },
  collapsibleToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  collapsibleLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7 },
  collapsibleBody: { gap: 6 },
  stateCard: { alignItems: 'stretch' },
  stateTitle: { fontSize: 17, fontWeight: '700', lineHeight: 23, textAlign: 'center' },
  stateBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  skeletonRow: { gap: 10, width: '100%' },
  skeletonBlock: { height: 88, borderRadius: 16, opacity: 0.8 },
  skeletonLine: { height: 14, width: '66%', alignSelf: 'center', borderRadius: 999, opacity: 0.8 },
  recoveryMetricsRow: { flexDirection: 'row', marginVertical: 2 },
  recoveryMetricCell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  recoveryMetricValue: { fontSize: 22, lineHeight: 26, letterSpacing: 0 },
  recoveryMetricLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
});
