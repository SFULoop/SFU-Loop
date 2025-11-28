import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth as getWebAuth,
  connectAuthEmulator as connectAuthEmulatorWeb,
  type Auth,
  initializeAuth as initializeWebAuth,
  browserLocalPersistence,
  setPersistence
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { Platform } from 'react-native';
import { getFirebaseClientConfig, getFirebaseEmulatorConfig } from './config';

// Lazy-load RN-specific auth to avoid Metro resolving web builds on native.
type ReactNativeAuthModule = typeof import('@firebase/auth/dist/rn/index.js');
let nativeAuthModule: ReactNativeAuthModule | null = null;

const getNativeAuthModule = () => {
  if (!nativeAuthModule) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    nativeAuthModule = require('@firebase/auth/dist/rn/index.js') as ReactNativeAuthModule;
  }
  return nativeAuthModule;
};

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;
let functionsInstance: Functions | null = null;

const initializeFirebaseApp = () => {
  if (appInstance) {
    return appInstance;
  }
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(getFirebaseClientConfig());
  appInstance = app;
  return appInstance;
};

const initializeFirebaseAuth = () => {
  if (authInstance) {
    return authInstance;
  }

  const app = initializeFirebaseApp();
  const emulatorConfig = getFirebaseEmulatorConfig();

  // React Native requires explicit persistence; fall back to browser local storage on web.
  const auth =
    Platform.OS === 'web'
      ? initializeWebAuth(app)
      : getNativeAuthModule().initializeAuth(app, {
          persistence: getNativeAuthModule().getReactNativePersistence(AsyncStorage)
        });

  if (Platform.OS === 'web') {
    void setPersistence(auth, browserLocalPersistence);
  }

  if (emulatorConfig.useEmulator) {
    const connect = Platform.OS === 'web' ? connectAuthEmulatorWeb : getNativeAuthModule().connectAuthEmulator;
    connect(auth, `http://${emulatorConfig.host}:${emulatorConfig.authPort}`, {
      disableWarnings: true
    });
  }

  authInstance = auth;
  return authInstance;
};

export const getFirebaseApp = () => initializeFirebaseApp();

export const getFirebaseAuth = () => initializeFirebaseAuth();

export const getFirestoreDb = () => {
  if (firestoreInstance) {
    return firestoreInstance;
  }
  const app = initializeFirebaseApp();
  const emulatorConfig = getFirebaseEmulatorConfig();
  const db = getFirestore(app);

  if (emulatorConfig.useEmulator) {
    connectFirestoreEmulator(db, emulatorConfig.host, emulatorConfig.firestorePort);
  }

  firestoreInstance = db;
  return firestoreInstance;
};

export const getFirebaseFunctions = () => {
  if (functionsInstance) {
    return functionsInstance;
  }
  const app = initializeFirebaseApp();
  const emulatorConfig = getFirebaseEmulatorConfig();
  const func = getFunctions(app);

  if (emulatorConfig.useEmulator) {
    connectFunctionsEmulator(func, emulatorConfig.host, emulatorConfig.functionsPort);
  }

  functionsInstance = func;
  return functionsInstance;
};
