/**
 * Universal Capture pickers: camera, photo library and documents (PDF / any file).
 * Returns file references only — the capture screen uploads through `ds.capture.uploadCaptureFile`
 * after the user confirms. Size and MIME validation mirror the share-extension path (25 MB cap,
 * video rejected) so both entry points behave the same. Camera permission is requested at most once;
 * a permanently denied permission returns `permissionDenied` so the screen can offer Settings.
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { CaptureKind } from '@da/domain';
import { captureError } from '@/lib/monitoring';
import { toPermissionOutcome, type PermissionOutcome } from './permissions';
import {
  MAX_SHARE_FILE_BYTES,
  captureKindForMime,
  type ShareCaptureRejection,
} from './shareCapture';

export const MAX_CAPTURE_FILE_BYTES = MAX_SHARE_FILE_BYTES;
/** JPEG quality for camera / library exports — small enough to upload on mobile data, sharp enough for OCR. */
export const IMAGE_QUALITY = 0.85;

export type DocumentKind = Extract<CaptureKind, 'pdf' | 'file'>;

export interface PickedMedia {
  uri: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number | null;
  kind: CaptureKind;
  width?: number;
  height?: number;
}

export type PickResult =
  | { status: 'picked'; asset: PickedMedia }
  | { status: 'cancelled' }
  | { status: 'rejected'; reason: ShareCaptureRejection; asset: PickedMedia }
  | { status: 'permissionDenied'; permission: 'camera' }
  | { status: 'failed' };

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  m4a: 'audio/m4a',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

/** MIME from the picker when present, else from the file name extension, else the fallback. */
export function inferMimeType(
  fileName: string | null | undefined,
  reported: string | null | undefined,
  fallback = 'application/octet-stream',
): string {
  const mime = (reported ?? '').toLowerCase().trim();
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = /\.([a-z0-9]+)$/i.exec(fileName ?? '')?.[1]?.toLowerCase();
  if (ext && EXTENSION_MIME[ext]) return EXTENSION_MIME[ext];
  return mime || fallback;
}

/** Last path segment of a URI (query string stripped), or a generated name with the right extension. */
export function fileNameFromUri(uri: string, mimeType: string, prefix = 'capture'): string {
  const path = uri.split('?')[0] ?? uri;
  const last = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '');
  if (last && last.includes('.')) return last;
  const ext = Object.entries(EXTENSION_MIME).find(([, mime]) => mime === mimeType)?.[0] ?? 'bin';
  return `${prefix}-${Date.now()}.${ext}`;
}

/** Document picker MIME filters for the requested kinds (`file` means "anything", which includes PDF). */
export function documentTypesFor(kinds: readonly DocumentKind[]): string[] {
  if (kinds.length === 0 || kinds.includes('file')) return ['*/*'];
  return ['application/pdf'];
}

/** Size / MIME policy shared by every picker: video is unsupported, files above 25 MB are too large. */
export function validatePicked(asset: PickedMedia): PickResult {
  const kind = captureKindForMime(asset.mimeType);
  if (!kind) return { status: 'rejected', reason: 'unsupported', asset };
  if (asset.sizeBytes !== null && asset.sizeBytes > MAX_CAPTURE_FILE_BYTES)
    return { status: 'rejected', reason: 'tooLarge', asset };
  return { status: 'picked', asset: { ...asset, kind } };
}

/** File size from the file system when the picker did not report one (best effort, never throws). */
export function fileSizeOf(uri: string): number | null {
  if (Platform.OS === 'web') return null;
  try {
    const file = new File(uri);
    const size = file.size;
    return typeof size === 'number' && Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

export async function getCameraPermission(): Promise<PermissionOutcome> {
  try {
    return toPermissionOutcome(await ImagePicker.getCameraPermissionsAsync());
  } catch (e) {
    captureError(e, { where: 'media.getCameraPermission' });
    return 'undetermined';
  }
}

/** Prompts at most once; a permanently denied camera permission never re-prompts. */
export async function requestCameraPermission(): Promise<PermissionOutcome> {
  try {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return 'granted';
    if (current.status === 'denied' && current.canAskAgain === false) return 'denied';
    return toPermissionOutcome(await ImagePicker.requestCameraPermissionsAsync());
  } catch (e) {
    captureError(e, { where: 'media.requestCameraPermission' });
    return 'denied';
  }
}

function fromImageAsset(asset: ImagePicker.ImagePickerAsset): PickedMedia {
  const mimeType = inferMimeType(
    asset.fileName,
    asset.mimeType,
    asset.type === 'video' ? 'video/mp4' : 'image/jpeg',
  );
  const fileName = asset.fileName?.trim() || fileNameFromUri(asset.uri, mimeType, 'photo');
  const sizeBytes =
    typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize)
      ? asset.fileSize
      : fileSizeOf(asset.uri);
  return {
    uri: asset.uri,
    mimeType,
    fileName,
    sizeBytes,
    kind: 'image',
    width: asset.width,
    height: asset.height,
  };
}

function fromDocumentAsset(asset: DocumentPicker.DocumentPickerAsset): PickedMedia {
  const mimeType = inferMimeType(asset.name, asset.mimeType);
  const fileName = asset.name?.trim() || fileNameFromUri(asset.uri, mimeType, 'file');
  const sizeBytes =
    typeof asset.size === 'number' && Number.isFinite(asset.size)
      ? asset.size
      : fileSizeOf(asset.uri);
  return {
    uri: asset.uri,
    mimeType,
    fileName,
    sizeBytes,
    kind: captureKindForMime(mimeType) ?? 'file',
  };
}

/**
 * Camera (`camera: true`) or photo library. The library uses the system photo picker, which needs no
 * permission on iOS 14+ / Android 13+; the camera asks once.
 */
export async function pickImage(opts: { camera: boolean }): Promise<PickResult> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: IMAGE_QUALITY,
    exif: false,
    base64: false,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  try {
    if (opts.camera) {
      const permission = await requestCameraPermission();
      if (permission !== 'granted') return { status: 'permissionDenied', permission: 'camera' };
    }
    const result = opts.camera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return { status: 'cancelled' };
    const asset = result.assets[0];
    if (!asset?.uri) return { status: 'failed' };
    return validatePicked(fromImageAsset(asset));
  } catch (e) {
    captureError(e, { where: 'media.pickImage', camera: opts.camera });
    return { status: 'failed' };
  }
}

/** Document picker limited to the given kinds; files are copied to the cache so the URI stays readable for upload. */
export async function pickDocument(opts: { kinds: readonly DocumentKind[] }): Promise<PickResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: documentTypesFor(opts.kinds),
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });
    if (result.canceled) return { status: 'cancelled' };
    const asset = result.assets[0];
    if (!asset?.uri) return { status: 'failed' };
    return validatePicked(fromDocumentAsset(asset));
  } catch (e) {
    captureError(e, { where: 'media.pickDocument' });
    return { status: 'failed' };
  }
}

/** Removes a picked/recorded temporary file once uploaded (best effort). */
export function discardTemporaryFile(uri: string): void {
  if (Platform.OS === 'web' || !uri.startsWith('file:')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (e) {
    captureError(e, { where: 'media.discardTemporaryFile' });
  }
}
