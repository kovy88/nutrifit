import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { TranslationKey } from '../../lib/i18n';
import type { darkColors } from '../../constants/theme';

type Palette = typeof darkColors;

export const BOTTOM_NAV_ITEMS: {
  route: string;
  labelKey: TranslationKey;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}[] = [
  { route: 'Dnes', labelKey: 'tab.home', icon: 'today-outline', activeIcon: 'today' },
  { route: 'Jídelníček', labelKey: 'tab.plan', icon: 'calendar-outline', activeIcon: 'calendar' },
  { route: 'Coach', labelKey: 'tab.coach', icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { route: 'Uloženo', labelKey: 'tab.history', icon: 'stats-chart-outline', activeIcon: 'stats-chart' },
  { route: 'Profil', labelKey: 'tab.profile', icon: 'person-circle-outline', activeIcon: 'person-circle' },
];

export function createBottomNavigationOptions(
  colors: Palette,
  t: (key: TranslationKey) => string,
): ({ route }: { route: { name: string } }) => BottomTabNavigationOptions {
  const labels = Object.fromEntries(BOTTOM_NAV_ITEMS.map(item => [item.route, t(item.labelKey)]));
  const items = Object.fromEntries(BOTTOM_NAV_ITEMS.map(item => [item.route, item]));

  return ({ route }) => ({
    headerShown: false,
    tabBarLabel: labels[route.name] ?? route.name,
    tabBarActiveTintColor: colors.accent,
    tabBarInactiveTintColor: colors.faint,
    tabBarLabelStyle: {
      fontFamily: 'HankenGrotesk_700Bold',
      fontSize: 11,
      letterSpacing: 0,
      marginTop: 1,
    },
    tabBarItemStyle: {
      minHeight: 56,
      paddingTop: 4,
    },
    tabBarStyle: {
      borderTopColor: colors.hairline,
      borderTopWidth: 0.5,
      backgroundColor: colors.card,
      height: 74,
      paddingBottom: 10,
      paddingTop: 8,
      shadowColor: colors.shadow,
      shadowOpacity: 0.45,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: -4 },
      elevation: 6,
    },
    tabBarIcon: ({ color, focused, size }) => {
      const item = items[route.name];
      const icon = focused ? item?.activeIcon : item?.icon;
      const isCoach = route.name === 'Coach';
      return (
        <Ionicons
          name={icon ?? 'ellipse-outline'}
          size={isCoach ? size + 3 : size}
          color={isCoach || focused ? colors.accent : color}
        />
      );
    },
  });
}
