import '@testing-library/jest-native/extend-expect';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: {} },
    manifest: { extra: {} }
  }
}));

const secureStoreData = {};
jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn(async (key) => secureStoreData[key] ?? null),
  setItemAsync: jest.fn(async (key, value) => {
    secureStoreData[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key) => {
    delete secureStoreData[key];
  }),
  __reset: () => {
    Object.keys(secureStoreData).forEach((key) => delete secureStoreData[key]);
  }
}));

jest.mock('expo-linking', () => ({
  __esModule: true,
  createURL: (path = '/') => `https://example.com${path}`,
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn(async () => null),
  parse: jest.fn(),
  openURL: jest.fn(),
  canOpenURL: jest.fn(async () => true)
}));

jest.mock('expo-location', () => ({
  __esModule: true,
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied'
  },
  Accuracy: {
    Balanced: 3
  },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: {
      latitude: 49.2827,
      longitude: -123.1207,
      accuracy: 5
    },
    timestamp: Date.now()
  }))
}));

jest.mock('firebase/functions', () => ({
  __esModule: true,
  getFunctions: jest.fn(() => ({}))
}));

jest.mock('zustand', () => {
  const actual = jest.requireActual('zustand');
  const { act } = jest.requireActual('@testing-library/react-native');
  const storeResetFns = new Set();

  const resettableCreate = (createState) => {
    const store = actual.create((set, get, api) => {
      const initialState = createState(set, get, api);
      storeResetFns.add(() => api.setState(initialState, true));
      return initialState;
    });

    store.resetAll = () => {
      storeResetFns.forEach((resetFn) => {
        act(() => {
          resetFn();
        });
      });
    };

    return store;
  };

  return {
    __esModule: true,
    ...actual,
    create: (createState) => {
      if (typeof createState !== 'function') {
        return actual.create(createState);
      }
      return resettableCreate(createState);
    }
  };
});

// Vector icons are rendered via native fonts; mock them as simple components.
jest.mock('@expo/vector-icons/MaterialIcons', () => {
  const React = require('react');
  return ({ name, color, size }: { name: string; color?: string; size?: number }) =>
    React.createElement('Icon', { name, color, size });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockNavigation = jest.fn(() => ({ navigate: jest.fn() }));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: mockNavigation
  };
});

// Expose mock for test suites that need to tweak navigation behavior.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.__mockedUseNavigation = mockNavigation;
