import type { TrainingCompletionRecord, TrainingCompletionStatus } from '../types';
import { useTrenr } from '../context/TrenrContext';

export function useTrainingCompletion(date?: string) {
  const { selectedDate, trainingCompletions, currentTrainingCompletion, markTrainingCompletion } = useTrenr();
  const key = date ?? selectedDate;
  const completion = key === selectedDate ? currentTrainingCompletion : trainingCompletions[key] ?? null;

  return {
    completion,
    mark: (
      status: TrainingCompletionStatus,
      details?: Partial<Pick<TrainingCompletionRecord, 'actualDurationMinutes' | 'actualDistanceKm' | 'rpe' | 'note' | 'pairedWorkoutId' | 'source'>>,
      unit?: 'primary' | 'second',
    ) => markTrainingCompletion(status, details, unit),
  };
}
