import { afterEach, describe, expect, it } from 'vitest';
import {
  NoopNotificationScheduler,
  createNotificationScheduler,
} from '../lib/notifications';

describe('createNotificationScheduler', () => {
  it('mode=noop returns Noop', () => {
    const s = createNotificationScheduler('noop');
    expect(s.name).toBe('noop');
  });

  it('mode=expo returns Expo (real wrapper, unavailable without package)', async () => {
    const s = createNotificationScheduler('expo');
    expect(s.name).toBe('expo');
    // Without expo-notifications package installed in tests, falls through to unavailable
    const perm = await s.getPermission();
    expect(perm).toBe('unavailable');
  });

  it('mode=auto returns Noop today (no expo-notifications installed yet)', () => {
    const s = createNotificationScheduler('auto');
    expect(s.name).toBe('noop');
  });
});

describe('NoopNotificationScheduler', () => {
  afterEach(async () => {
    await NoopNotificationScheduler.purge();
  });

  it('starts with no scheduled items', async () => {
    const s = new NoopNotificationScheduler();
    expect(await s.listScheduled()).toEqual([]);
  });

  it('permission is undetermined (cannot probe without native module)', async () => {
    const s = new NoopNotificationScheduler();
    expect(await s.getPermission()).toBe('undetermined');
    expect(await s.requestPermission()).toBe('unavailable');
  });

  it('scheduleAt roundtrips', async () => {
    const s = new NoopNotificationScheduler();
    await s.scheduleAt({ id: 'x', title: 't', body: 'b', triggerInSeconds: 60 });
    const ids = await s.listScheduled();
    expect(ids).toContain('x');
  });

  it('scheduleDaily roundtrips', async () => {
    const s = new NoopNotificationScheduler();
    await s.scheduleDaily({ id: 'morning', title: 't', body: 'b', hour: 7, minute: 0 });
    const ids = await s.listScheduled();
    expect(ids).toContain('morning');
  });

  it('scheduleDaily overwrites by id', async () => {
    const s = new NoopNotificationScheduler();
    await s.scheduleDaily({ id: 'morning', title: 'A', body: 'A', hour: 7, minute: 0 });
    await s.scheduleDaily({ id: 'morning', title: 'B', body: 'B', hour: 8, minute: 30 });
    const dump = await s.dump();
    const morning = dump.filter(e => e.type === 'daily' && e.notification.id === 'morning');
    expect(morning.length).toBe(1);
    if (morning[0].type === 'daily') {
      expect(morning[0].notification.title).toBe('B');
      expect(morning[0].notification.hour).toBe(8);
    }
  });

  it('cancel by id removes only that notification', async () => {
    const s = new NoopNotificationScheduler();
    await s.scheduleDaily({ id: 'a', title: 't', body: 'b', hour: 7, minute: 0 });
    await s.scheduleDaily({ id: 'b', title: 't', body: 'b', hour: 8, minute: 0 });
    await s.cancel('a');
    const ids = await s.listScheduled();
    expect(ids).toEqual(['b']);
  });

  it('cancelAll empties everything', async () => {
    const s = new NoopNotificationScheduler();
    await s.scheduleDaily({ id: 'a', title: 't', body: 'b', hour: 7, minute: 0 });
    await s.scheduleAt({ id: 'b', title: 't', body: 'b', triggerInSeconds: 60 });
    await s.cancelAll();
    expect(await s.listScheduled()).toEqual([]);
  });

  it('purge clears storage even between instances', async () => {
    const s1 = new NoopNotificationScheduler();
    await s1.scheduleDaily({ id: 'a', title: 't', body: 'b', hour: 7, minute: 0 });
    await NoopNotificationScheduler.purge();
    const s2 = new NoopNotificationScheduler();
    expect(await s2.listScheduled()).toEqual([]);
  });
});
