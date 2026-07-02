import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

type MacroRingProps = {
  size: number;
  strokeWidth: number;
  progress: number; // 0 to 1
  color: string;
  backgroundColor: string;
  /** Soft colored halo behind the ring (default on). */
  glow?: boolean;
  children?: React.ReactNode;
};

export function MacroRing({
  size,
  strokeWidth,
  progress,
  color,
  backgroundColor,
  glow = true,
  children,
}: MacroRingProps) {
  // Sanitize: useId() yields ":r0:" which breaks SVG url(#id) refs on web.
  const gid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  // Clamp progress to 0..1 range to prevent line overflow
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const strokeDashoffset = circumference - clampedProgress * circumference;

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
        glow && {
          shadowColor: color,
          shadowOpacity: 0.55,
          shadowRadius: size * 0.16,
          shadowOffset: { width: 0, height: 0 },
        },
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          {/* Progress gets a subtle sheen: full color → slightly translucent. */}
          <LinearGradient id={`g-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0.72} />
          </LinearGradient>
        </Defs>
        {/* Track circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#g-${gid})`}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children && <View style={styles.contentOverlay}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  contentOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
