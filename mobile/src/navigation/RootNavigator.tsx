import type { ComponentType } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { CoachScreen } from '../screens/CoachScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PhotoScreen } from '../screens/PhotoScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TrainingScreen } from '../screens/TrainingScreen';
import { WeeklyScheduleScreen } from '../screens/WeeklyScheduleScreen';
import { createBottomNavigationOptions } from '../components/premium/BottomNavigation';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/** Wraps a screen in its own ErrorBoundary so a crash there shows the "Zkusit
 *  znovu" fallback for that screen only — the rest of the tab bar / nav tree
 *  (and any other tab's state) stays intact instead of the whole app going
 *  white-screen from the single root-level boundary in App.tsx. */
function withScreenErrorBoundary<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
  function Boundary(props: P) {
    return (
      <ErrorBoundary>
        <Screen {...props} />
      </ErrorBoundary>
    );
  }
  Boundary.displayName = `WithErrorBoundary(${Screen.displayName || Screen.name || 'Screen'})`;
  return Boundary;
}

const SafeTodayScreen = withScreenErrorBoundary(TodayScreen);
const SafePlanScreen = withScreenErrorBoundary(PlanScreen);
const SafeCoachScreen = withScreenErrorBoundary(CoachScreen);
const SafeHistoryScreen = withScreenErrorBoundary(HistoryScreen);
const SafeProfileScreen = withScreenErrorBoundary(ProfileScreen);
const SafeTrainingScreen = withScreenErrorBoundary(TrainingScreen);
const SafePhotoScreen = withScreenErrorBoundary(PhotoScreen);
const SafeSettingsScreen = withScreenErrorBoundary(SettingsScreen);
const SafeWeeklyScheduleScreen = withScreenErrorBoundary(WeeklyScheduleScreen);
const SafeOnboardingScreen = withScreenErrorBoundary(OnboardingScreen);

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
      <Tab.Screen name="Dnes" component={SafeTodayScreen} />
      <Tab.Screen name="Jídelníček" component={SafePlanScreen} />
      <Tab.Screen name="Coach" component={SafeCoachScreen} />
      <Tab.Screen name="Uloženo" component={SafeHistoryScreen} />
      <Tab.Screen name="Profil" component={SafeProfileScreen} />
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
          <Stack.Screen name="Trénink" component={SafeTrainingScreen} />
          <Stack.Screen name="Foto" component={SafePhotoScreen} />
          <Stack.Screen
            name="Settings"
            component={SafeSettingsScreen}
            options={{ headerShown: false, presentation: 'card' }}
          />
          <Stack.Screen
            name="MujTyden"
            component={SafeWeeklyScheduleScreen}
            options={{ headerShown: false, presentation: 'card' }}
          />
        </>
      ) : (
        <Stack.Screen name="Onboarding" component={SafeOnboardingScreen} />
      )}
    </Stack.Navigator>
  );
}
