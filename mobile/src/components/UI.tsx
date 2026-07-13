import { PropsWithChildren, ReactNode, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { MacroRing } from './MacroRing';
import { typography } from '../constants/theme';
export * from './premium';

export function H1({ children }: PropsWithChildren) {
  const { colors, fonts } = useTheme();
  return <Text style={[styles.h1, { color: colors.ink, fontFamily: fonts.display }]}>{children}</Text>;
}

export function Subtitle({ children }: PropsWithChildren) {
  const { colors, fonts } = useTheme();
  return <Text style={[styles.subtitle, { color: colors.muted, fontFamily: fonts.regular }]}>{children}</Text>;
}

// Large system numeral + small caption for readiness, kcal, and key stats.
export function Stat({ value, label, color, align = 'center' }: { value: React.ReactNode; label?: string; color?: string; align?: 'center' | 'left' }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      <Text style={[styles.statValue, { color: color || colors.ink, fontFamily: fonts.number }]}>{value}</Text>
      {label ? <Text style={[styles.statLabel, { color: colors.faint, fontFamily: fonts.bold }]}>{label}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: any }>) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
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
  return (
    <TextInput
      placeholderTextColor={colors.faint}
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

/** Large selectable option row — title (+ optional subtitle) with a radio dot.
 *  Used by the one-question-per-screen onboarding. */
export function Choice({
  active,
  title,
  subtitle,
  onPress,
  compact,
}: {
  active?: boolean;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  compact?: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        compact && styles.choiceCompact,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accent + '14' : colors.card,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={styles.choiceBody}>
        <Text style={[styles.choiceTitle, compact && styles.choiceTitleCompact, { color: colors.ink, fontFamily: fonts.bold }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.choiceSub, compact && styles.choiceSubCompact, { color: colors.muted, fontFamily: fonts.regular }]}>{subtitle}</Text>
        ) : null}
      </View>
      <View
        style={[
          styles.choiceDot,
          { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accent : 'transparent' },
        ]}
      />
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
        <Pressable accessibilityRole="button" accessibilityLabel={t('a11y.back')} onPress={onBack} hitSlop={10} style={[styles.screenHeaderBack, { borderColor: colors.border, backgroundColor: colors.bgElev }]}>
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
      <Text style={[styles.sectionTitle, { color: colors.ink, fontFamily: fonts.extraBold }]}>{title}</Text>
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
    <View style={[styles.metricCard, compact && styles.metricCardCompact, { borderColor: colors.border, backgroundColor: colors.bgElev }]}>
      <Text style={[styles.metricLabel, { color: colors.faint, fontFamily: fonts.bold }]}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={[styles.metricValue, compact && styles.metricValueCompact, { color: accent, fontFamily: fonts.number }]}>{value}</Text>
        {unit ? <Text style={[styles.metricUnit, { color: colors.muted, fontFamily: fonts.bold }]}>{unit}</Text> : null}
      </View>
      {detail ? <Text style={[styles.metricDetail, { color: colors.muted, fontFamily: fonts.regular }]}>{detail}</Text> : null}
    </View>
  );
}

export function ScoreRing({
  score,
  label,
  color,
  size = 116,
}: {
  score: number;
  label: string;
  color?: string;
  size?: number;
}) {
  const { colors, fonts } = useTheme();
  const accent = color ?? colors.accent;
  return (
    <MacroRing
      size={size}
      strokeWidth={10}
      progress={score / 100}
      color={accent}
      backgroundColor={colors.border}
    >
      <Text style={[styles.scoreValue, { color: colors.ink, fontFamily: fonts.number }]}>{score}</Text>
      <Text style={[styles.scoreLabel, { color: colors.muted, fontFamily: fonts.bold }]}>{label}</Text>
    </MacroRing>
  );
}

export function CoachInsightCard({
  title,
  body,
  warnings = [],
  accent,
  children,
}: PropsWithChildren<{
  title: string;
  body: string;
  warnings?: string[];
  accent?: string;
}>) {
  const { colors, fonts } = useTheme();
  const color = accent ?? colors.accent;
  return (
    <Card style={[styles.coachCard, { borderColor: `${color}4D` }]}>
      <Text style={[styles.coachTitle, { color: colors.ink, fontFamily: fonts.extraBold }]}>{title}</Text>
      <Text style={[styles.coachBody, { color: colors.muted, fontFamily: fonts.regular }]}>{body}</Text>
      {warnings.map((warning, index) => (
        <Text key={`${warning}-${index}`} style={[styles.warningLine, { color: colors.orange, fontFamily: fonts.bold }]}>
          {warning}
        </Text>
      ))}
      {children}
    </Card>
  );
}

export function NutritionTargetCard({
  kcal,
  protein,
  carbs,
  fat,
  reason,
  label,
  macroLabels,
  dayLabel,
}: {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  reason?: string;
  label: string;
  macroLabels: { kcal: string; protein: string; carbs: string; fat: string };
  dayLabel?: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Card>
      <View style={styles.cardTitleRow}>
        <SectionHeader title={label} />
        {dayLabel ? <Text style={[styles.cardBadge, { color: colors.accent, borderColor: colors.accent, backgroundColor: colors.accent + '12', fontFamily: fonts.bold }]}>{dayLabel}</Text> : null}
      </View>
      <View style={styles.metricGrid}>
        <MetricCard label={macroLabels.kcal} value={kcal} color={colors.accent} />
        <MetricCard label={macroLabels.protein} value={protein} unit="g" color={colors.macroProtein} />
        <MetricCard label={macroLabels.carbs} value={carbs} unit="g" color={colors.macroCarb} />
        <MetricCard label={macroLabels.fat} value={fat} unit="g" color={colors.macroFat} />
      </View>
      {reason ? <Subtitle>{reason}</Subtitle> : null}
    </Card>
  );
}

export function TrainingRecommendationCard({
  title,
  meta,
  note,
  cta,
  onPress,
  completed,
  intensity,
}: {
  title: string;
  meta: string;
  note?: string;
  cta?: string;
  onPress?: () => void;
  completed?: boolean;
  intensity?: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Card>
      <View style={styles.cardTitleRow}>
        <SectionHeader title={title} />
        {intensity ? <Text style={[styles.cardBadge, { color: colors.orange, borderColor: colors.orange, backgroundColor: colors.orange + '14', fontFamily: fonts.bold }]}>{intensity}</Text> : null}
      </View>
      <Text style={[styles.trainingMeta, { color: colors.ink, fontFamily: fonts.extraBold }]}>{meta}</Text>
      {note ? <Text style={[styles.trainingNote, { color: colors.muted, fontFamily: fonts.regular }]}>{note}</Text> : null}
      {cta && onPress ? (
        <Button variant={completed ? 'secondary' : 'primary'} disabled={completed} onPress={onPress}>
          {cta}
        </Button>
      ) : null}
    </Card>
  );
}

export function RecoveryCard({
  title,
  metrics,
  recommendation,
  status,
}: {
  title: string;
  metrics: Array<{ label: string; value: string; color?: string }>;
  recommendation: string;
  status?: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Card>
      <View style={styles.cardTitleRow}>
        <SectionHeader title={title} />
        {status ? <Text style={[styles.cardBadge, { color: colors.blue, borderColor: colors.blue, backgroundColor: colors.blue + '14', fontFamily: fonts.bold }]}>{status}</Text> : null}
      </View>
      <View style={styles.metricGrid}>
        {metrics.map(metric => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} color={metric.color} compact />
        ))}
      </View>
      <Subtitle>{recommendation}</Subtitle>
    </Card>
  );
}

export function WeeklyProgressCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: string; color?: string }>;
}) {
  return (
    <Card>
      <SectionHeader title={title} />
      <View style={styles.metricGrid}>
        {items.map(item => (
          <MetricCard key={item.label} label={item.label} value={item.value} color={item.color} />
        ))}
      </View>
    </Card>
  );
}

export function PlanDayCard({
  title,
  subtitle,
  selected,
  markers = [],
  onPress,
  isRest,
  isLongRun,
  children,
}: PropsWithChildren<{
  title: string;
  subtitle: string;
  selected?: boolean;
  markers?: string[];
  onPress?: () => void;
  isRest?: boolean;
  isLongRun?: boolean;
}>) {
  const { colors, fonts } = useTheme();

  let backgroundColor = colors.card;
  let borderColor = colors.border;

  if (selected) {
    backgroundColor = colors.accent + '14';
    borderColor = colors.accent;
  } else if (isRest) {
    backgroundColor = colors.bgElev;
    borderColor = colors.border;
  } else if (isLongRun) {
    backgroundColor = colors.accent + '0F';
    borderColor = colors.border;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.planDayCard,
        {
          backgroundColor,
          borderColor,
          opacity: !selected && isRest ? 0.75 : 1,
        },
        pressed && { opacity: 0.86 },
      ]}
    >
      <View style={styles.planDayHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.planDayTitle, { color: colors.ink, fontFamily: fonts.extraBold }]}>{title}</Text>
          <Text style={[styles.planDaySubtitle, { color: colors.muted, fontFamily: fonts.regular }]}>{subtitle}</Text>
        </View>
        {markers.length ? (
          <View style={styles.markerRow}>
            {markers.map(marker => {
              let bg = colors.accent;
              let fg = colors.accentText;
              const isRestMarker = marker === 'Rest' || marker === 'Volno';
              const isLongMarker = marker === 'Long run' || marker === 'Dlouhý běh' || marker === 'Long';
              if (isRestMarker) {
                bg = colors.border;
                fg = colors.muted;
              } else if (isLongMarker) {
                bg = colors.orange;
                fg = '#fff';
              }
              return (
                <Text key={marker} style={[styles.marker, { color: fg, backgroundColor: bg, fontFamily: fonts.bold }]}>
                  {marker}
                </Text>
              );
            })}
          </View>
        ) : null}
      </View>
      {children}
    </Pressable>
  );
}

export function QuickActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        { borderColor: colors.border, backgroundColor: colors.bgElev },
        pressed && !disabled && { opacity: 0.82 },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={[styles.quickActionText, { color: colors.ink, fontFamily: fonts.bold }]}>{label}</Text>
    </Pressable>
  );
}

export function ActionIconButton({
  icon,
  label,
  onPress,
  variant = 'secondary',
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const foreground = isPrimary ? colors.accentText : isDanger ? '#fff' : colors.ink;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionIconButton,
        {
          backgroundColor: isPrimary ? colors.accent : isDanger ? colors.red : colors.bgElev,
          borderColor: isPrimary ? colors.accent : isDanger ? colors.red : colors.border,
        },
        pressed && !disabled && { opacity: 0.86, transform: [{ scale: 0.98 }] },
        disabled && styles.disabled,
      ]}
    >
      <Ionicons name={icon} size={18} color={foreground} />
      <Text style={[styles.actionIconText, { color: foreground, fontFamily: fonts.bold }]}>{label}</Text>
    </Pressable>
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

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.bgElev, borderColor: colors.border }]}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && { backgroundColor: colors.accent + '16' }]}
          >
            <Text style={[styles.segmentText, { color: active ? colors.accent : colors.muted, fontFamily: fonts.bold }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
    <View style={[styles.settingRow, { borderColor: colors.border, backgroundColor: colors.bgElev }]}>
      <View style={styles.settingText}>
        <Text style={[styles.settingTitle, { color: colors.ink, fontFamily: fonts.extraBold }]}>{title}</Text>
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
    <View style={[styles.sourceCard, { borderColor: colors.border, backgroundColor: colors.bgElev }]}>
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

export function ErrorState({
  title,
  body,
  cta,
  onPress,
}: {
  title: string;
  body: string;
  cta?: string;
  onPress?: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Card style={[styles.stateCard, { borderColor: colors.red }]}>
      <Text style={[styles.stateTitle, { color: colors.red, fontFamily: fonts.extraBold }]}>{title}</Text>
      <Text style={[styles.stateBody, { color: colors.muted, fontFamily: fonts.regular }]}>{body}</Text>
      {cta && onPress ? <Button variant="secondary" onPress={onPress}>{cta}</Button> : null}
    </Card>
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
}

const styles = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: '800', letterSpacing: 0, lineHeight: 38 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  statValue: { fontSize: 42, fontWeight: '700', letterSpacing: 0, lineHeight: 48 },
  statLabel: { fontSize: 11, fontWeight: '600', lineHeight: 15, letterSpacing: 0, marginTop: 2 },
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
  field: { minHeight: 52, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, fontSize: typography.bodyLarge },
  button: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  disabled: { opacity: 0.45 },
  buttonText: { fontSize: 15.5, fontWeight: '700', letterSpacing: 0 },
  pill: { minHeight: 42, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 14, fontWeight: '600' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16 },
  choiceCompact: { gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  choiceBody: { flex: 1, gap: 2 },
  choiceTitle: { fontSize: 16.5, fontWeight: '600', letterSpacing: 0 },
  choiceTitleCompact: { fontSize: 15.5, lineHeight: 20 },
  choiceSub: { fontSize: 13, lineHeight: 18 },
  choiceSubCompact: { fontSize: 12.5, lineHeight: 17 },
  choiceDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  screenHeaderText: { flex: 1, gap: 3 },
  screenHeaderAction: { alignItems: 'flex-end' },
  screenHeaderBack: { width: 40, height: 40, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 0 },
  screenTitle: { fontSize: typography.screenTitle, fontWeight: '800', lineHeight: 38, letterSpacing: 0 },
  screenSubtitle: { fontSize: typography.body, lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCard: { flex: 1, minWidth: '47%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, gap: 2 },
  metricCardCompact: { minWidth: '22%', paddingHorizontal: 10, paddingVertical: 10 },
  metricLabel: { fontSize: 11, fontWeight: '600', lineHeight: 15, letterSpacing: 0 },
  metricValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  metricValue: { fontSize: 25, fontWeight: '700', lineHeight: 30, letterSpacing: 0 },
  metricValueCompact: { fontSize: 20, lineHeight: 25 },
  metricUnit: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  metricDetail: { fontSize: 11, lineHeight: 15 },
  scoreValue: { fontSize: typography.metric, fontWeight: '700', lineHeight: 46, letterSpacing: 0 },
  scoreLabel: { fontSize: 10, fontWeight: '600', lineHeight: 14, letterSpacing: 0 },
  coachCard: { borderWidth: StyleSheet.hairlineWidth },
  coachTitle: { fontSize: typography.title, fontWeight: '700', lineHeight: 25 },
  coachBody: { fontSize: 14, lineHeight: 20 },
  warningLine: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  trainingMeta: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  trainingNote: { fontSize: 14, lineHeight: 20 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardBadge: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 10, fontWeight: '600', lineHeight: 14, letterSpacing: 0 },
  planDayCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 12 },
  planDayHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  planDayTitle: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
  planDaySubtitle: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  markerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'flex-end' },
  marker: { fontSize: 10, fontWeight: '600', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  quickAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, flex: 1, minWidth: '47%' },
  quickActionText: { fontSize: 13, fontWeight: '600', lineHeight: 17 },
  actionIconButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, flex: 1 },
  actionIconText: { fontSize: 13, lineHeight: 17 },
  statusPill: { alignSelf: 'flex-start', fontSize: 10, fontWeight: '600', lineHeight: 14, letterSpacing: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  segmented: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentText: { fontSize: 13, fontWeight: '600', lineHeight: 17, textAlign: 'center' },
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
  stateCard: { alignItems: 'stretch' },
  stateTitle: { fontSize: 17, fontWeight: '700', lineHeight: 23, textAlign: 'center' },
  stateBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  skeletonRow: { gap: 10, width: '100%' },
  skeletonBlock: { height: 88, borderRadius: 16, opacity: 0.8 },
  skeletonLine: { height: 14, width: '66%', alignSelf: 'center', borderRadius: 999, opacity: 0.8 },
});
