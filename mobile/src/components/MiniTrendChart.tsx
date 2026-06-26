// ── MINI TREND CHART
//
// Kompaktní SVG sparkline + plněná oblast. Použití:
//   <MiniTrendChart
//     data={[{date:'2026-05-20', value:80.2}, ...]}
//     height={90}
//     color="#26734d"
//     unit="kg"
//   />
//
// Pravidla:
//   - prázdné `value` (null/undefined) → "díra" v lince (path Move bez Line)
//   - min < 4 platné body → vrátíme prázdný state ("málo dat")
//   - poslední hodnota se vykreslí jako větší bod + label
//   - Y osa scale-to-fit (min..max + 10% padding)

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Line } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export type TrendPoint = {
  date: string;          // YYYY-MM-DD
  value: number | null;
};

export type MiniTrendChartProps = {
  data: TrendPoint[];
  /** SVG drawing height in px. Default 90. */
  height?: number;
  /** SVG drawing width — vyplní container. Pokud null, použijeme 280 (default karta). */
  width?: number;
  /** Stroke + dot color. Default theme green. */
  color?: string;
  /** Jednotka pro label ("kg" / "ms" / "min" / "TRIMP"). */
  unit?: string;
  /** Optional formatter for the latest-value label. Default: `Math.round(v) + unit`. */
  format?: (value: number) => string;
};

const PADDING = { top: 14, right: 8, bottom: 16, left: 8 };

export function MiniTrendChart({
  data,
  height = 90,
  width = 280,
  color,
  unit = '',
  format,
}: MiniTrendChartProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const strokeColor = color ?? colors.green;
  const validPoints = data.filter(d => d.value != null);

  if (validPoints.length < 2) {
    return (
      <View style={[styles.emptyBox, { borderColor: colors.hairline }]}>
        <Text style={[styles.emptyText, { color: colors.faint }]}>
          {validPoints.length === 0 ? t('chart.noData') : t('chart.needTwoDays')}
        </Text>
      </View>
    );
  }

  // Y-axis scale: extend by 10 % below/above so the line doesn't kiss the frame.
  const values = validPoints.map(d => d.value as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1); // avoid div-by-zero on flat trends
  const yMin = min - span * 0.1;
  const yMax = max + span * 0.1;

  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;

  const xOf = (i: number) => PADDING.left + (i / (data.length - 1)) * innerW;
  const yOf = (v: number) => PADDING.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  // Build polyline path with breaks where value is null.
  let linePath = '';
  let areaPath = '';
  let firstSegmentStart = -1;
  data.forEach((point, i) => {
    if (point.value == null) {
      firstSegmentStart = -1;
      return;
    }
    const x = xOf(i);
    const y = yOf(point.value);
    if (firstSegmentStart === -1) {
      linePath += `${linePath ? ' ' : ''}M ${x} ${y}`;
      areaPath += `${areaPath ? ' M ' + x + ' ' + (PADDING.top + innerH) + ' L ' : 'M ' + x + ' ' + (PADDING.top + innerH) + ' L '}${x} ${y}`;
      firstSegmentStart = i;
    } else {
      linePath += ` L ${x} ${y}`;
      areaPath += ` L ${x} ${y}`;
    }
    // Close area: drop down to baseline before next gap
    const next = data[i + 1];
    if (!next || next.value == null) {
      areaPath += ` L ${x} ${PADDING.top + innerH} Z`;
    }
  });

  const last = validPoints[validPoints.length - 1];
  const lastIndex = data.findIndex(d => d.date === last.date);
  const lastX = xOf(lastIndex);
  const lastY = yOf(last.value as number);
  const formatter = format ?? ((v: number) => `${Math.round(v * 10) / 10}${unit ? ' ' + unit : ''}`);

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={[styles.minMax, { color: colors.faint }]}>min {formatter(min)}</Text>
        <Text style={[styles.minMax, { color: colors.faint }]}>max {formatter(max)}</Text>
      </View>
      <Svg width={width} height={height}>
        {/* Zero baseline */}
        <Line
          x1={PADDING.left}
          x2={width - PADDING.right}
          y1={PADDING.top + innerH}
          y2={PADDING.top + innerH}
          stroke={colors.border}
          strokeWidth={1}
        />
        {/* Filled area below the line */}
        <Path d={areaPath} fill={strokeColor} opacity={0.12} />
        {/* The line itself */}
        <Path
          d={linePath}
          stroke={strokeColor}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots for each valid point */}
        {data.map((p, i) => {
          if (p.value == null) return null;
          const isLast = p.date === last.date;
          return (
            <Circle
              key={p.date}
              cx={xOf(i)}
              cy={yOf(p.value)}
              r={isLast ? 4 : 2}
              fill={strokeColor}
            />
          );
        })}
        {/* Last value label */}
        <Circle cx={lastX} cy={lastY} r={6} fill={strokeColor} opacity={0.25} />
      </Svg>
      <View style={styles.footerRow}>
        <Text style={[styles.dateLabel, { color: colors.faint }]}>{shortDate(data[0]?.date)}</Text>
        <Text style={[styles.latestLabel, { color: strokeColor }]}>
          dnes {formatter(last.value as number)}
        </Text>
        <Text style={[styles.dateLabel, { color: colors.faint }]}>{shortDate(data[data.length - 1]?.date)}</Text>
      </View>
    </View>
  );
}

function shortDate(d?: string): string {
  if (!d) return '';
  const [, m, day] = d.split('-');
  return `${parseInt(day, 10)}. ${parseInt(m, 10)}.`;
}

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  minMax: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginTop: 6 },
  dateLabel: { fontSize: 10, fontWeight: '700' },
  latestLabel: { fontSize: 13, fontWeight: '900' },
  emptyBox: {
    height: 90,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { fontSize: 12, fontWeight: '600' },
});
