import type { TrainingCompletionRecord, TrainingCompletionStatus } from '../types';
import { useNutriFit } from '../context/NutriFitContext';

export function useTrainingCompletion(date?: string) {
  const { selectedDate, trainingCompletions, currentTrainingCompletion, markTrainingCompletion } = useNutriFit();
  const key = date ?? selectedDate;
  const completion = key === selectedDate ? currentTrainingCompletion : trainingCompletions[key] ?? null;

  return {
    completion,
    mark: (
      status: TrainingCompletionStatus,
      details?: Partial<Pick<TrainingCompletionRecord, 'actualDurationMinutes' | 'actualDistanceKm' | 'rpe' | 'note' | 'pairedWorkoutId' | 'source'>>,
    ) => markTrainingCompletion(status, details),
  };
}
