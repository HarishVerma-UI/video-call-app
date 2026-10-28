// Face sign-in on the phone.
//
// When you turn it on, the server gives this phone a random key. We keep it in
// the iOS Keychain / Android Keystore with `requireAuthentication`, so the OS
// only hands it back after Face ID, face unlock or fingerprint succeeds. Your
// face is checked by the phone itself; the app and the server never see it.
//
// A small unprotected note (name + email) is kept next to it so the sign-in
// screen can say "Continue as Asha" without asking for your face first.

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'huddle.faceKey';
const META = 'huddle.faceKey.meta';

export interface FaceMeta {
  userId: string;
  name: string;
  email: string;
  deviceId: string;
}

export class FaceCancelled extends Error {
  constructor() {
    super('Face sign-in was cancelled.');
  }
}

/** Whether this phone can do it, and what to call it ("Face ID", "face unlock", "fingerprint"). */
export async function faceSupport(): Promise<{ available: boolean; label: string }> {
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const label = Platform.OS === 'ios' ? (face ? 'Face ID' : 'Touch ID') : face ? 'face unlock' : 'fingerprint';
    return { available: hardware && enrolled && SecureStore.canUseBiometricAuthentication(), label };
  } catch {
    return { available: false, label: 'face unlock' };
  }
}

/** Ask the phone to check your face (used before creating a face-only account). */
export async function confirmFace(promptMessage: string): Promise<void> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel', disableDeviceFallback: false });
  if (!r.success) throw new FaceCancelled();
}

export async function saveFaceKey(device: { id: string; secret: string }, meta: Omit<FaceMeta, 'deviceId'>, label: string) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(device), {
    requireAuthentication: true,
    authenticationPrompt: `Turn on ${label} sign-in for Huddle`,
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(META, JSON.stringify({ ...meta, deviceId: device.id }));
}

export async function faceMeta(): Promise<FaceMeta | null> {
  try {
    return JSON.parse((await SecureStore.getItemAsync(META)) ?? 'null');
  } catch {
    return null;
  }
}

/** Shows the Face ID / face unlock prompt; returns the key once the phone confirms it's you. */
export async function unlockFaceKey(label: string): Promise<{ id: string; secret: string }> {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(KEY, {
      requireAuthentication: true,
      authenticationPrompt: `Sign in to Huddle with ${label}`,
      keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    });
  } catch (err) {
    const msg = String((err as Error)?.message ?? '');
    // Android drops the key when you add a new face or fingerprint; start over.
    if (/invalidated|KeyPermanentlyInvalidated|could not be found/i.test(msg)) {
      await clearFaceKey();
      throw new Error('Your phone’s face or fingerprint settings changed, so face sign-in was turned off. Sign in with your password, then turn it on again.');
    }
    throw new FaceCancelled();
  }
  if (!raw) {
    await clearFaceKey();
    throw new Error('Face sign-in isn’t set up on this phone any more. Sign in with your password.');
  }
  return JSON.parse(raw);
}

export async function clearFaceKey() {
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
  await SecureStore.deleteItemAsync(META).catch(() => {});
}

export const deviceName = () => (Platform.OS === 'ios' ? (Platform.isPad ? 'iPad' : 'iPhone') : 'Android phone');
