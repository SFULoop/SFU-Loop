import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from '@firebase/app-check';
import { Platform } from 'react-native';
import { getFirebaseApp } from './index';
import { getFirebaseAppCheckConfig, getFirebaseEmulatorConfig } from './config';

let appCheckInstance: AppCheck | null = null;

const isWebEnvironment = () => typeof window !== 'undefined' && Platform.OS === 'web';

export const ensureAppCheck = () => {
  if (appCheckInstance) {
    return appCheckInstance;
  }

  const emulatorConfig = getFirebaseEmulatorConfig();
  if (emulatorConfig.useEmulator) {
    // App Check is unnecessary when talking to emulators and is unsupported in Node/test environments.
    return null;
  }

  if (!isWebEnvironment()) {
    // Firebase App Check JS SDK only supports browser environments; native apps should rely on platform App Attest/DeviceCheck.
    return null;
  }

  const appCheckConfig = getFirebaseAppCheckConfig();

  if (!appCheckConfig.enabled || !appCheckConfig.siteKey) {
    return null;
  }

  if (appCheckConfig.debugToken) {
    (globalThis as Record<string, unknown>).__FIREBASE_APP_CHECK_DEBUG_TOKEN = appCheckConfig.debugToken;
  }

  appCheckInstance = initializeAppCheck(getFirebaseApp(), {
    provider: new ReCaptchaV3Provider(appCheckConfig.siteKey),
    isTokenAutoRefreshEnabled: true
  });

  return appCheckInstance;
};
