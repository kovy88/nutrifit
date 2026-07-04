import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { HealthConnectProvider } from '../lib/health/HealthConnectProvider';

const {
  getSdkStatusMock,
  initializeMock,
  getGrantedPermissionsMock,
  requestPermissionMock,
  readRecordsMock,
  SdkAvailabilityStatus,
} = vi.hoisted(() => ({
  getSdkStatusMock: vi.fn(),
  initializeMock: vi.fn(),
  getGrantedPermissionsMock: vi.fn(),
  requestPermissionMock: vi.fn(),
  readRecordsMock: vi.fn(),
  SdkAvailabilityStatus: { SDK_UNAVAILABLE: 1, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2, SDK_AVAILABLE: 3 },
}));

vi.mock('react-native-health-connect', () => ({
  getSdkStatus: getSdkStatusMock,
  initialize: initializeMock,
  getGrantedPermissions: getGrantedPermissionsMock,
  requestPermission: requestPermissionMock,
  readRecords: readRecordsMock,
  SdkAvailabilityStatus,
}));

describe('HealthConnectProvider', () => {
  let provider: HealthConnectProvider;
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'android';
    provider = new HealthConnectProvider();
    getSdkStatusMock.mockReset().mockResolvedValue(SdkAvailabilityStatus.SDK_AVAILABLE);
    initializeMock.mockReset().mockResolvedValue(true);
    getGrantedPermissionsMock.mockReset().mockResolvedValue([]);
    requestPermissionMock.mockReset().mockResolvedValue([]);
    readRecordsMock.mockReset().mockResolvedValue({ records: [] });
  });

  afterEach(() => {
    Platform.OS = originalPlatformOS;
    vi.restoreAllMocks();
  });

  it('isSupported() is a static platform gate, not an instance check', () => {
    expect(HealthConnectProvider.isSupported()).toBe(true);
    Platform.OS = 'ios';
    expect(HealthConnectProvider.isSupported()).toBe(false);
  });

  it('everything reports unavailable/empty on non-Android platforms, without touching the native module', async () => {
    Platform.OS = 'ios';
    expect(await provider.isAvailable()).toBe(false);
    expect(await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(getSdkStatusMock).not.toHaveBeenCalled();
  });

  it('isAvailable is false when the SDK reports unavailable', async () => {
    getSdkStatusMock.mockResolvedValue(SdkAvailabilityStatus.SDK_UNAVAILABLE);
    expect(await provider.isAvailable()).toBe(false);
    expect(initializeMock).not.toHaveBeenCalled();
  });

  it('isAvailable is false when initialize() fails even though the SDK is available', async () => {
    initializeMock.mockResolvedValue(false);
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable is true when the SDK is available and initializes successfully', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('aggregates Steps/ActiveCaloriesBurned/Distance into one DailyActivitySummary per day', async () => {
    readRecordsMock.mockImplementation(async (recordType: string) => {
      if (recordType === 'Steps') {
        return { records: [{ startTime: '2026-05-01T00:00:00Z', endTime: '2026-05-01T23:59:59Z', count: 8000 }] };
      }
      if (recordType === 'ActiveCaloriesBurned') {
        return { records: [{ startTime: '2026-05-01T00:00:00Z', endTime: '2026-05-01T23:59:59Z', energy: { value: 400, unit: 'kilocalories' } }] };
      }
      if (recordType === 'Distance') {
        return { records: [{ startTime: '2026-05-01T00:00:00Z', endTime: '2026-05-01T23:59:59Z', distance: { value: 5000, unit: 'meters' } }] };
      }
      return { records: [] };
    });

    const [activity] = await provider.getDailyActivityRange(new Date('2026-05-01'), new Date('2026-05-02'));
    expect(activity.date).toBe('2026-05-01');
    expect(activity.steps).toBe(8000);
    expect(activity.activeEnergyKcal).toBe(400);
    expect(activity.distanceKm).toBe(5);
    expect(activity.source).toBe('health_connect');
  });

  it('maps ExerciseSession records to WorkoutSummary, including unrecognized exerciseType to "other"', async () => {
    readRecordsMock.mockImplementation(async (recordType: string) => {
      if (recordType !== 'ExerciseSession') return { records: [] };
      return {
        records: [
          { startTime: '2026-05-01T07:00:00Z', endTime: '2026-05-01T07:30:00Z', exerciseType: 56, metadata: { id: 'abc' } }, // RUNNING
          { startTime: '2026-05-01T08:00:00Z', endTime: '2026-05-01T08:10:00Z', exerciseType: 9999 },
        ],
      };
    });

    const [run, unknown] = await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-02'));
    expect(run.kind).toBe('run');
    expect(run.durationMinutes).toBe(30);
    expect(run.externalId).toBe('abc');
    expect(unknown.kind).toBe('other');
  });

  it('summarizes sleep stages: excludes AWAKE/OUT_OF_BED from totalMinutes, sums DEEP/REM separately', async () => {
    readRecordsMock.mockImplementation(async (recordType: string) => {
      if (recordType !== 'SleepSession') return { records: [] };
      return {
        records: [{
          startTime: '2026-05-01T12:00:00Z',
          endTime: '2026-05-01T20:00:00Z', // 8h session, kept mid-day UTC to avoid local-midnight rollover in toDateKey
          stages: [
            { startTime: '2026-05-01T12:00:00Z', endTime: '2026-05-01T13:00:00Z', stage: 5 }, // DEEP, 60min
            { startTime: '2026-05-01T13:00:00Z', endTime: '2026-05-01T14:00:00Z', stage: 6 }, // REM, 60min
            { startTime: '2026-05-01T14:00:00Z', endTime: '2026-05-01T19:30:00Z', stage: 4 }, // LIGHT, 330min
            { startTime: '2026-05-01T19:30:00Z', endTime: '2026-05-01T20:00:00Z', stage: 1 }, // AWAKE, 30min
          ],
        }],
      };
    });

    const [summary] = await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-02'));
    expect(summary.deepMinutes).toBe(60);
    expect(summary.remMinutes).toBe(60);
    expect(summary.awakeMinutes).toBe(30);
    expect(summary.totalMinutes).toBe(450); // 60+60+330, excludes the 30min awake
    expect(summary.efficiency).toBeCloseTo(450 / 480);
  });

  it('falls back to session start/end duration when a sleep record has no stages', async () => {
    readRecordsMock.mockImplementation(async (recordType: string) => {
      if (recordType !== 'SleepSession') return { records: [] };
      return { records: [{ startTime: '2026-05-01T12:00:00Z', endTime: '2026-05-01T20:00:00Z' }] };
    });

    const [summary] = await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-02'));
    expect(summary.totalMinutes).toBe(480);
    expect(summary.deepMinutes).toBeUndefined();
  });

  it('getHrv reports metric rmssd and converts heartRateVariabilityMillis', async () => {
    readRecordsMock.mockImplementation(async (recordType: string) => {
      if (recordType !== 'HeartRateVariabilityRmssd') return { records: [] };
      return { records: [{ time: '2026-05-01T06:00:00Z', heartRateVariabilityMillis: 42 }] };
    });

    const hrv = await provider.getHrv(new Date('2026-05-01'));
    expect(hrv).toEqual({ date: '2026-05-01', ms: 42, metric: 'rmssd', source: 'health_connect' });
  });

  it('getRestingHeartRate picks the latest sample in the day', async () => {
    readRecordsMock.mockImplementation(async (recordType: string) => {
      if (recordType !== 'RestingHeartRate') return { records: [] };
      return {
        records: [
          { time: '2026-05-01T04:00:00Z', beatsPerMinute: 58 },
          { time: '2026-05-01T06:00:00Z', beatsPerMinute: 55 },
        ],
      };
    });

    const rhr = await provider.getRestingHeartRate(new Date('2026-05-01'));
    expect(rhr).toEqual({ date: '2026-05-01', bpm: 55, source: 'health_connect' });
  });

  it('getLatestBodyWeight converts non-kilogram units to kg', async () => {
    readRecordsMock.mockResolvedValue({ records: [{ time: '2026-05-01T08:00:00Z', weight: { value: 165, unit: 'pounds' } }] });

    const weight = await provider.getLatestBodyWeight();
    expect(weight?.weightKg).toBeCloseTo(74.84, 1);
    expect(weight?.source).toBe('health_connect');
  });

  it('follows pageToken pagination across multiple pages', async () => {
    let stepsCall = 0;
    readRecordsMock.mockImplementation(async (recordType: string) => {
      if (recordType !== 'Steps') return { records: [] };
      stepsCall += 1;
      if (stepsCall === 1) {
        return { records: [{ startTime: '2026-05-01T09:00:00Z', endTime: '2026-05-01T09:01:00Z', count: 100 }], pageToken: 'PAGE2' };
      }
      return { records: [{ startTime: '2026-05-02T09:00:00Z', endTime: '2026-05-02T09:01:00Z', count: 200 }] };
    });

    const activity = await provider.getDailyActivityRange(new Date('2026-05-01'), new Date('2026-05-03'));

    expect(readRecordsMock.mock.calls.filter(c => c[0] === 'Steps')).toHaveLength(2);
    expect(activity.map(a => a.steps).sort()).toEqual([100, 200]);
  });

  it('getRecoveryInputs combines sleep, RHR, and HRV per date', async () => {
    readRecordsMock.mockImplementation(async (recordType: string) => {
      if (recordType === 'SleepSession') {
        return { records: [{ startTime: '2026-05-01T08:00:00Z', endTime: '2026-05-01T16:00:00Z' }] };
      }
      if (recordType === 'RestingHeartRate') {
        return { records: [{ time: '2026-05-01T09:00:00Z', beatsPerMinute: 54 }] };
      }
      if (recordType === 'HeartRateVariabilityRmssd') {
        return { records: [{ time: '2026-05-01T09:00:00Z', heartRateVariabilityMillis: 40 }] };
      }
      return { records: [] };
    });

    const inputs = await provider.getRecoveryInputs(new Date('2026-05-01'), new Date('2026-05-02'));
    const day = inputs.find(i => i.date === '2026-05-01');
    expect(day?.todaySleepMinutes).toBe(480);
    expect(day?.todayRhrBpm).toBe(54);
    expect(day?.todayHrvMs).toBe(40);
  });
});
