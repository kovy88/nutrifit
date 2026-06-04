import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTrenr } from '../context/TrenrContext';
import { Button, Card, FadeInView } from './UI';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
}

export function PaywallModal({ visible, onClose }: PaywallModalProps) {
  const { colors, fonts } = useTheme();
  const { purchaseSubscription, restoreSubscription, subscriptionPackages } = useTrenr();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const monthly = subscriptionPackages.find(pkg => pkg.planId === 'monthly');
  const yearly = subscriptionPackages.find(pkg => pkg.planId === 'yearly');

  async function handleSubscribe() {
    setLoading(true);
    try {
      const active = await purchaseSubscription(selectedPlan);
      if (active) onClose();
    } catch {
      // user cancelled the store sheet or the purchase failed — stay on paywall
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    setLoading(true);
    try {
      const active = await restoreSubscription();
      if (active) onClose();
      else Alert.alert('Trenr', 'Nenašli jsme žádný aktivní nákup k obnovení.');
    } catch {
      Alert.alert('Trenr', 'Obnovení se nepodařilo. Zkuste to prosím znovu.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: 'rgba(0, 0, 0, 0.85)' }]}>
        <View style={[styles.container, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.crownIcon, { backgroundColor: colors.accent + '18' }]}>
              <Ionicons name="sparkles-outline" size={28} color={colors.accent} />
            </View>
            <Text style={[styles.title, { color: colors.ink, fontFamily: fonts.display }]}>
              Trenr Premium
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted, fontFamily: fonts.regular }]}>
              Free pokryje první týden a Today doporučení. Premium odemkne adaptivní plán a hlubší koučování.
            </Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Features List */}
            <FadeInView delay={100} style={styles.features}>
              <FeatureRow
                icon="checkmark-circle-outline"
                title="Free"
                description="Onboarding, Today doporučení, jeden týdenní plán a ruční check-in."
              />
              <FeatureRow
                icon="trending-up-outline"
                title="Adaptivní plán"
                description="Úpravy po vynechaném tréninku, weekly review a bezpečné korekce podle readiness."
              />
              <FeatureRow
                icon="chatbubble-ellipses-outline"
                title="AI coach chat"
                description="Vysvětlení doporučení, meal swaps a odpovědi nad deterministicky spočítaným plánem."
              />
              <FeatureRow
                icon="analytics-outline"
                title="Recovery insights"
                description="Detailnější trendy, běžecký plán a přehled pokroku bez medicínských diagnóz."
              />
            </FadeInView>

            {/* Plans Selection */}
            <FadeInView delay={250} style={styles.plans}>
              <Pressable
                onPress={() => setSelectedPlan('monthly')}
                style={[
                  styles.planCard,
                  {
                    backgroundColor: colors.bgElev,
                    borderColor: selectedPlan === 'monthly' ? colors.accent : colors.border,
                  },
                ]}
              >
                <View style={styles.planHeader}>
                  <Text style={[styles.planTitle, { color: colors.ink, fontFamily: fonts.bold }]}>
                    Měsíční plán
                  </Text>
                  {selectedPlan === 'monthly' && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                </View>
                <Text style={[styles.planPrice, { color: colors.ink, fontFamily: fonts.number }]}>
                  {monthly?.priceString ?? '149 Kč'} <Text style={styles.planUnit}>/ měsíc</Text>
                </Text>
                <Text style={[styles.planTrial, { color: colors.accent, fontFamily: fonts.bold }]}>
                  Měsíční flexibilita
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setSelectedPlan('yearly')}
                style={[
                  styles.planCard,
                  {
                    backgroundColor: colors.bgElev,
                    borderColor: selectedPlan === 'yearly' ? colors.accent : colors.border,
                  },
                ]}
              >
                <View style={styles.badge}>
                  <Text style={[styles.badgeText, { color: colors.accentText }]}>Ušetříte 37 %</Text>
                </View>
                <View style={styles.planHeader}>
                  <Text style={[styles.planTitle, { color: colors.ink, fontFamily: fonts.bold }]}>
                    Roční plán
                  </Text>
                  {selectedPlan === 'yearly' && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                </View>
                <Text style={[styles.planPrice, { color: colors.ink, fontFamily: fonts.number }]}>
                  {yearly?.priceString ?? '1 290 Kč'} <Text style={styles.planUnit}>/ rok</Text>
                </Text>
                <Text style={[styles.planTrial, { color: colors.accent, fontFamily: fonts.bold }]}>
                  Nejlepší hodnota pro dlouhodobý plán
                </Text>
              </Pressable>
            </FadeInView>

            {/* Subscribe Action */}
            <FadeInView delay={350} style={styles.actionContainer}>
              <Button
                disabled={loading}
                onPress={handleSubscribe}
                style={styles.subscribeBtn}
              >
                {loading ? 'Zpracování...' : 'Pokračovat s Premium'}
              </Button>
              
              <Text style={[styles.disclaimer, { color: colors.faint, fontFamily: fonts.regular }]}>
                Předplatné se obnovuje podle pravidel obchodu. V Expo/dev režimu se používá lokální entitlement bez reálné platby.
              </Text>

              <Pressable onPress={handleRestore} style={styles.restoreLink}>
                <Text style={[styles.restoreText, { color: colors.muted, fontFamily: fonts.bold }]}>
                  Obnovit nákupy
                </Text>
              </Pressable>
            </FadeInView>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FeatureRow({ icon, title, description }: { icon: any; title: string; description: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.featureRow}>
      <View style={[styles.iconWrapper, { backgroundColor: colors.accent + '12' }]}>
        <Ionicons name={icon} size={22} color={colors.accent} />
      </View>
      <View style={styles.featureText}>
        <Text style={[styles.featureTitle, { color: colors.ink, fontFamily: fonts.bold }]}>
          {title}
        </Text>
        <Text style={[styles.featureDesc, { color: colors.muted, fontFamily: fonts.regular }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    height: '90%',
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
    paddingHorizontal: 12,
  },
  crownIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 8,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  features: {
    gap: 16,
    marginBottom: 28,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    gap: 3,
  },
  featureTitle: {
    fontSize: 15.5,
  },
  featureDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  plans: {
    gap: 14,
    marginBottom: 24,
  },
  planCard: {
    borderRadius: 18,
    borderWidth: 2,
    padding: 16,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    right: 16,
    top: -11,
    backgroundColor: '#00cc66',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  planTitle: {
    fontSize: 15,
  },
  planPrice: {
    fontSize: 24,
    lineHeight: 29,
    marginBottom: 4,
  },
  planUnit: {
    fontSize: 14,
    fontWeight: 'normal',
  },
  planTrial: {
    fontSize: 12.5,
  },
  actionContainer: {
    alignItems: 'center',
    gap: 14,
  },
  subscribeBtn: {
    width: '100%',
  },
  disclaimer: {
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  restoreLink: {
    paddingVertical: 8,
  },
  restoreText: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
