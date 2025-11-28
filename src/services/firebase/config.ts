import Constants from 'expo-constants';

export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

export type FirebaseEmulatorConfig = {
  useEmulator: boolean;
  host: string;
  authPort: number;
  firestorePort: number;
  functionsPort: number;
};

export type FirebaseAppCheckConfig = {
  enabled: boolean;
  siteKey?: string;
  debugToken?: string;
};

type FirebaseExtraConfig = Partial<FirebaseClientConfig> & {
  useEmulator?: boolean;
  emulatorHost?: string;
  emulatorAuthPort?: number;
  emulatorFirestorePort?: number;
  emulatorFunctionsPort?: number;
  appCheckSiteKey?: string;
  appCheckDebugToken?: string;
};

type ExpoExtra = {
  firebase?: FirebaseExtraConfig;
};

class FirebaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirebaseConfigurationError';
  }
}

const readExpoExtra = (): ExpoExtra => {
  const expoExtra = Constants.expoConfig?.extra as ExpoExtra | undefined;
  const manifestExtra = (Constants.manifest as { extra?: ExpoExtra } | null)?.extra;
  return expoExtra ?? manifestExtra ?? {};
};

const readEnv = (key: string): string | undefined => {
  const envValue = process.env[key] ?? process.env[`EXPO_PUBLIC_${key}`];
  return envValue?.trim() || undefined;
};

const resolveClientConfig = (): FirebaseClientConfig => {
  const extra = readExpoExtra().firebase ?? {};
  const useEmulatorFlag = extra.useEmulator ?? readEnv('USE_FIREBASE_EMULATORS') === 'true';

  const resolvedProjectId = extra.projectId ?? readEnv('FIREBASE_PROJECT_ID') ?? (useEmulatorFlag ? 'demo-sfu-loop' : undefined);

  const clientConfig: Partial<FirebaseClientConfig> = {
    apiKey: extra.apiKey ?? readEnv('FIREBASE_API_KEY') ?? (useEmulatorFlag ? 'demo-api-key' : undefined),
    authDomain: extra.authDomain ?? readEnv('FIREBASE_AUTH_DOMAIN') ?? (useEmulatorFlag ? 'localhost' : undefined),
    projectId: resolvedProjectId,
    storageBucket: extra.storageBucket ?? readEnv('FIREBASE_STORAGE_BUCKET') ?? (useEmulatorFlag && resolvedProjectId ? `${resolvedProjectId}.appspot.com` : undefined),
    messagingSenderId: extra.messagingSenderId ?? readEnv('FIREBASE_MESSAGING_SENDER_ID') ?? (useEmulatorFlag ? '000000000000' : undefined),
    appId: extra.appId ?? readEnv('FIREBASE_APP_ID') ?? (useEmulatorFlag ? 'demo-app-id' : undefined),
    measurementId: extra.measurementId ?? readEnv('FIREBASE_MEASUREMENT_ID')
  };

  const requiredKeys: (keyof FirebaseClientConfig)[] = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId'
  ];

  const missingKeys = requiredKeys.filter((key) => !clientConfig[key]);

  if (missingKeys.length > 0) {
    throw new FirebaseConfigurationError(
      `Missing Firebase config values: ${missingKeys.join(', ')}. Provide them in app config extra.firebase or env variables.`
    );
  }

  return clientConfig as FirebaseClientConfig;
};

const DEFAULT_EMULATOR_HOST = '127.0.0.1';

export const getFirebaseClientConfig = (): FirebaseClientConfig => resolveClientConfig();

export const getFirebaseEmulatorConfig = (): FirebaseEmulatorConfig => {
  const extra = readExpoExtra().firebase ?? {};
  const useEmulatorFlag = extra.useEmulator ?? readEnv('USE_FIREBASE_EMULATORS') === 'true';

  return {
    useEmulator: !!useEmulatorFlag,
    host: extra.emulatorHost ?? readEnv('FIREBASE_EMULATOR_HOST') ?? DEFAULT_EMULATOR_HOST,
    authPort: extra.emulatorAuthPort ?? Number(readEnv('FIREBASE_AUTH_EMULATOR_PORT') ?? 9099),
    firestorePort: extra.emulatorFirestorePort ?? Number(readEnv('FIRESTORE_EMULATOR_PORT') ?? 8080),
    functionsPort: extra.emulatorFunctionsPort ?? Number(readEnv('FUNCTIONS_EMULATOR_PORT') ?? 5001)
  };
};

export const getFirebaseAppCheckConfig = (): FirebaseAppCheckConfig => {
  const extra = readExpoExtra().firebase ?? {};

  const rawSiteKey = extra.appCheckSiteKey ?? readEnv('FIREBASE_APPCHECK_SITE_KEY');
  const rawDebugToken = extra.appCheckDebugToken ?? readEnv('FIREBASE_APPCHECK_DEBUG_TOKEN');

  // Ensure values are strings and not empty or objects
  const siteKey = typeof rawSiteKey === 'string' && rawSiteKey.trim().length > 0 ? rawSiteKey.trim() : undefined;
  const debugToken = typeof rawDebugToken === 'string' && rawDebugToken.trim().length > 0 ? rawDebugToken.trim() : undefined;

  // Only enable if we have a valid site key
  const enabled = !!siteKey;

  return {
    enabled,
    siteKey,
    debugToken
  };
};
