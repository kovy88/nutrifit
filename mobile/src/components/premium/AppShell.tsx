import type { ComponentProps } from 'react';
import { Screen } from '../Screen';

type AppShellProps = ComponentProps<typeof Screen>;

export function AppShell(props: AppShellProps) {
  return <Screen {...props} />;
}
