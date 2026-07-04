import * as ImageManipulator from 'expo-image-manipulator';

// Gemini vision quality plateaus well below full camera resolution, and the
// backend rejects anything over ~5MB base64 (see api/analyze-food-photo.js)
// — modern phone cameras routinely exceed that at full resolution even with
// JPEG compression. Downscale before upload so ordinary food photos don't
// hit that rejection, and so upload/inference are faster and cheaper.
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.7;

/** Resizes an image for upload if it's larger than MAX_DIMENSION on its
 *  longest side, re-encoding as JPEG. Returns the original uri untouched
 *  when it's already small enough (including when dimensions are unknown,
 *  which some Android devices report as 0 — resizing an unknown-size image
 *  against a fixed width could upscale it, so we skip in that case). */
export async function resizeForUpload(
  uri: string,
  width: number,
  height: number,
): Promise<{ uri: string; mimeType: string }> {
  const longest = Math.max(width, height);
  if (longest <= 0 || longest <= MAX_DIMENSION) {
    return { uri, mimeType: 'image/jpeg' };
  }
  const scale = MAX_DIMENSION / longest;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { uri: result.uri, mimeType: 'image/jpeg' };
}
