import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

type MacroRingProps = {
  size: number;
  strokeWidth: number;
  progress: number; // 0 to 1
  color: string;
  backgroundColor: string;
  /** Optional soft colored halo behind the ring. */
  glow?: boolean;
  children?: React.ReactNode;
};

export function MacroRing({
  size,
  strokeWidth,
  progress,
  color,
  backgroundColor,
  glow = false,
  children,
}: MacroRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  // Clamp progress to 0..1 range to prevent line overflow
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const strokeDashoffset = circumference - clampedProgress * circumference;

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size },
        glow && {
          shadowColor: color,
          shadowOpacity: 0.18,
          shadowRadius: size * 0.1,
          shadowOffset: { width: 0, height: 0 },
        },
      ]}
    >
      <Svg width={size} height={size}>
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
          stroke={color}
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
