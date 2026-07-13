import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';
import {
  loadCoachThreadsByDate,
  saveCoachThreadForDate,
} from '../services/storage';
import type { CoachMemory, CoachMessage, CoachThreadRecord } from '../types/coach';
import { getProfileGoalSummary } from '../lib/profile/profile-labels';

function defaultMemory(goalSummary: string): CoachMemory {
  return { goalSummary, updatedAt: new Date().toISOString() };
}

export function useCoachThread(date: string, memory?: CoachMemory) {
  const { profile } = useTrenr();
  const { t } = useLanguage();
  const goalSummary = profile ? getProfileGoalSummary(profile, t) : t('trainingGoal.general_fitness');
  const fallbackMemory = useMemo(() => memory ?? defaultMemory(goalSummary), [goalSummary, memory]);
  const [thread, setThread] = useState<CoachThreadRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void loadCoachThreadsByDate().then(all => {
      if (cancelled) return;
      setThread(all[date] ?? null);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [date]);

  const persist = useCallback(async (messages: CoachMessage[], nextMemory = fallbackMemory) => {
    const next = await saveCoachThreadForDate(date, messages, nextMemory);
    setThread(next);
    return next;
  }, [date, fallbackMemory]);

  const append = useCallback(async (...messages: CoachMessage[]) => {
    const nextMessages = [...(thread?.messages ?? []), ...messages];
    return persist(nextMessages);
  }, [persist, thread?.messages]);

  const clear = useCallback(async () => {
    return persist([]);
  }, [persist]);

  return {
    thread,
    messages: thread?.messages ?? [],
    memory: thread?.memory ?? fallbackMemory,
    isLoading,
    append,
    persist,
    clear,
  };
}
