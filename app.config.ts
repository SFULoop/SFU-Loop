/* eslint-disable @typescript-eslint/no-var-requires */
import type { ExpoConfig } from '@expo/config';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const envLocalPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envLocalPath)) {
  // Load .env.local if present to support local dev without polluting global env.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: envLocalPath });
}

const baseConfig = require('./app.json') as { expo: ExpoConfig };

const SUPPORTED_ENVIRONMENTS = ['development', 'staging', 'production'] as const;
type SupportedEnvironment = (typeof SUPPORTED_ENVIRONMENTS)[number];

type FirebaseEnvConfig = {
  apiKey?: string | null;
  authDomain?: string | null;
  projectId?: string | null;
  storageBucket?: string | null;
  messagingSenderId?: string | null;
  appId?: string | null;
  measurementId?: string | null;
  useEmulator?: boolean;
  emulatorHost?: string | null;
  emulatorAuthPort?: number | null;
  emulatorFirestorePort?: number | null;
  emulatorFunctionsPort?: number | null;
  appCheckSiteKey?: string | null;
  appCheckDebugToken?: string | null;
};

const normalizeEnvironment = (value: string | undefined): SupportedEnvironment => {
  const normalized = (value ?? 'development').toLowerCase();

  if ((SUPPORTED_ENVIRONMENTS as readonly string[]).includes(normalized)) {
    return normalized as SupportedEnvironment;
  }

  console.warn(`Unsupported APP_ENV "${value}" provided. Falling back to development.`);
  return 'development';
};

const resolveApiKey = (environment: SupportedEnvironment): string => {
  const directKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const scopedKey = process.env[`GOOGLE_MAPS_API_KEY_${environment.toUpperCase() as 'DEVELOPMENT'}`];
  const trimmedScopedKey = scopedKey?.trim();

  const apiKey = trimmedScopedKey || directKey;

  if (!apiKey) {
    throw new Error(
      `Missing Google Maps API key. Provide GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY_${environment.toUpperCase()} in your environment file.`
    );
  }

  return apiKey;
};

const resolveFirebaseConfig = (): FirebaseEnvConfig => {
  const useEmulator = process.env.USE_FIREBASE_EMULATORS === 'true';

  const readPort = (value?: string | null) => {
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    apiKey: process.env.FIREBASE_API_KEY?.trim() || (useEmulator ? 'demo-api-key' : null),
    authDomain: process.env.FIREBASE_AUTH_DOMAIN?.trim() || (useEmulator ? 'localhost' : null),
    projectId: process.env.FIREBASE_PROJECT_ID?.trim() || (useEmulator ? 'demo-sfu-loop' : null),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET?.trim() || null,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID?.trim() || null,
    appId: process.env.FIREBASE_APP_ID?.trim() || (useEmulator ? 'demo-app-id' : null),
    measurementId: process.env.FIREBASE_MEASUREMENT_ID?.trim() || null,
    useEmulator,
    emulatorHost: process.env.FIREBASE_EMULATOR_HOST?.trim() || null,
    emulatorAuthPort: readPort(process.env.FIREBASE_AUTH_EMULATOR_PORT),
    emulatorFirestorePort: readPort(process.env.FIRESTORE_EMULATOR_PORT),
    emulatorFunctionsPort: readPort(process.env.FUNCTIONS_EMULATOR_PORT),
    appCheckSiteKey: process.env.FIREBASE_APPCHECK_SITE_KEY?.trim() || null,
    appCheckDebugToken: process.env.FIREBASE_APPCHECK_DEBUG_TOKEN?.trim() || null
  };
};

export default (): ExpoConfig => {
  const environment = normalizeEnvironment(process.env.APP_ENV);
  const apiKey = resolveApiKey(environment);
  const firebase = resolveFirebaseConfig();

  const expoConfig: ExpoConfig = {
    ...baseConfig.expo,
    extra: {
      ...(baseConfig.expo.extra ?? {}),
      environment,
      googleMaps: {
        apiKey,
        mapId: process.env.GOOGLE_MAPS_MAP_ID?.trim() || null,
        channel: process.env.GOOGLE_MAPS_CHANNEL?.trim() || null
      },
      firebase: {
        ...firebase
      }
    }
  };

  return expoConfig;
};
