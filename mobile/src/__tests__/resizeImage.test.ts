import { describe, expect, it, vi } from 'vitest';
import { resizeForUpload } from '../lib/media/resizeImage';

const { manipulateAsync } = vi.hoisted(() => ({ manipulateAsync: vi.fn() }));

vi.mock('expo-image-manipulator', () => ({
  manipulateAsync,
  SaveFormat: { JPEG: 'jpeg' },
}));

describe('resizeForUpload', () => {
  it('leaves small images untouched', async () => {
    const result = await resizeForUpload('file://small.jpg', 800, 600);
    expect(result).toEqual({ uri: 'file://small.jpg', mimeType: 'image/jpeg' });
    expect(manipulateAsync).not.toHaveBeenCalled();
  });

  it('leaves images with unknown (zero) dimensions untouched', async () => {
    const result = await resizeForUpload('file://unknown.jpg', 0, 0);
    expect(result).toEqual({ uri: 'file://unknown.jpg', mimeType: 'image/jpeg' });
    expect(manipulateAsync).not.toHaveBeenCalled();
  });

  it('downscales large images preserving aspect ratio', async () => {
    manipulateAsync.mockResolvedValueOnce({ uri: 'file://resized.jpg', width: 1280, height: 960 });
    const result = await resizeForUpload('file://big.jpg', 4000, 3000);
    expect(manipulateAsync).toHaveBeenCalledWith(
      'file://big.jpg',
      [{ resize: { width: 1280, height: 960 } }],
      { compress: 0.7, format: 'jpeg' },
    );
    expect(result).toEqual({ uri: 'file://resized.jpg', mimeType: 'image/jpeg' });
  });

  it('scales by the longest side for portrait images', async () => {
    manipulateAsync.mockResolvedValueOnce({ uri: 'file://resized.jpg' });
    await resizeForUpload('file://portrait.jpg', 1200, 4000);
    expect(manipulateAsync).toHaveBeenCalledWith(
      'file://portrait.jpg',
      [{ resize: { width: 384, height: 1280 } }],
      { compress: 0.7, format: 'jpeg' },
    );
  });
});
