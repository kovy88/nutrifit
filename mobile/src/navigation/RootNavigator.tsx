import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../constants/theme';
import { useNutriFit } from '../context/NutriFitContext';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PhotoScreen } from '../screens/PhotoScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          borderTopColor: colors.border,
          height: 70,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dnes: 'today-outline',
            Jídelníček: 'restaurant-outline',
            Foto: 'camera-outline',
            Historie: 'time-outline',
            Profil: 'person-circle-outline',
          };
          return <Ionicons name={icons[route.name] || 'ellipse-outline'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dnes" component={HomeScreen} />
      <Tab.Screen name="Jídelníček" component={PlanScreen} />
      <Tab.Screen name="Foto" component={PhotoScreen} />
      <Tab.Screen name="Historie" component={HistoryScreen} />
      <Tab.Screen name="Profil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { profile } = useNutriFit();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {profile ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      )}
    </Stack.Navigator>
  );
}
