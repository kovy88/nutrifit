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
import { createBottomNavigationOptions } from '../components/premium/BottomNavigation';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// 5 záložek: Dnes (Today) · Jídelníček (Plan) · Coach · Uloženo (Progress) · Profil.
// Foto a Trénink jsou pushed stack screens dostupné přes akce na Today / Plan.
// Route names zůstávají v češtině kvůli stabilitě stávajících navigate() volání;
// viditelné labely jdou přes i18n.
function MainTabs() {
  const { t } = useLanguage();
  const { colors: themeColors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={createBottomNavigationOptions(themeColors, t)}
    >
      <Tab.Screen name="Dnes" component={TodayScreen} />
      <Tab.Screen name="Jídelníček" component={PlanScreen} />
      <Tab.Screen name="Coach" component={CoachScreen} />
      <Tab.Screen name="Uloženo" component={HistoryScreen} />
      <Tab.Screen name="Profil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { profile } = useTrenr();

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
            options={{ headerShown: false, presentation: 'card' }}
          />
        </>
      ) : (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      )}
    </Stack.Navigator>
  );
}
