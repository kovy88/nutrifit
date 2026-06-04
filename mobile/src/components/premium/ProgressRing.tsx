import { PropsWithChildren } from 'react';
import { MacroRing } from '../MacroRing';
import { useTheme } from '../../context/ThemeContext';

export function ProgressRing({
  progress,
  size = 72,
  color,
  children,
}: PropsWithChildren<{
  progress: number;
  size?: number;
  color?: string;
}>) {
  const { colors } = useTheme();
  return (
    <MacroRing
      size={size}
      strokeWidth={8}
      progress={progress}
      color={color ?? colors.accent}
      backgroundColor={colors.border}
      glow={false}
    >
      {children}
    </MacroRing>
  );
}
