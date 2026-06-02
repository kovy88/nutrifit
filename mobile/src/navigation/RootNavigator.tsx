import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { CoachScreen } from '../screens/CoachScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PhotoScreen } from '../screens/PhotoScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TrainingScreen } from '../screens/TrainingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// 5 záložek: Dnes (Today) · Jídelníček (Plan) · Uloženo (Progress) · Coach · Profil.
// Foto a Trénink jsou pushed stack screens (ne top-level taby) — dostupné přes
// akce na Today / Plan. Route names zůstávají v češtině kvůli stabilitě
// stávajících navigation.navigate() volání; viditelné labely jdou přes i18n.
function MainTabs() {
  const { t } = useLanguage();
  const { colors: themeColors } = useTheme();
  const tabLabels: Record<string, string> = {
    Dnes: t('tab.home'),
    Jídelníček: t('tab.plan'),
    Uloženo: t('tab.history'),
    Coach: t('tab.coach'),
    Profil: t('tab.profile'),
  };
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarLabel: tabLabels[route.name] ?? route.name,
        tabBarActiveTintColor: themeColors.accent,
        tabBarInactiveTintColor: themeColors.faint,
        tabBarLabelStyle: { fontFamily: 'HankenGrotesk_700Bold', fontSize: 11, letterSpacing: 0.2 },
        tabBarStyle: {
          borderTopColor: themeColors.border,
          backgroundColor: themeColors.card,
          height: 72,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dnes: 'today-outline',
            Jídelníček: 'restaurant-outline',
            Uloženo: 'stats-chart-outline',
            Coach: 'sparkles-outline',
            Profil: 'person-circle-outline',
          };
          return <Ionicons name={icons[route.name] || 'ellipse-outline'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dnes" component={TodayScreen} />
      <Tab.Screen name="Jídelníček" component={PlanScreen} />
      <Tab.Screen name="Uloženo" component={HistoryScreen} />
      <Tab.Screen name="Coach" component={CoachScreen} />
      <Tab.Screen name="Profil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { profile } = useTrenr();
  const { t } = useLanguage();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {profile ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          {/* Pushed screens reached from Today/Plan actions. No header (own H1);
              back via swipe / hardware back, or their own navigation actions. */}
          <Stack.Screen name="Trénink" component={TrainingScreen} />
          <Stack.Screen name="Foto" component={PhotoScreen} />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ headerShown: true, title: t('settings.title'), presentation: 'card' }}
          />
        </>
      ) : (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      )}
    </Stack.Navigator>
  );
}
