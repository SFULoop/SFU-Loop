global.self = global;
const NativeModules = require('react-native/Libraries/BatchedBridge/NativeModules');

if (!NativeModules.UIManager) {
  Object.defineProperty(NativeModules, 'UIManager', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {}
  });
}

if (!NativeModules.Linking) {
  Object.defineProperty(NativeModules, 'Linking', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {}
  });
}

if (!NativeModules.NativeUnimoduleProxy) {
  Object.defineProperty(NativeModules, 'NativeUnimoduleProxy', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {
      viewManagersMetadata: {},
      modulesConstants: {
        mockDefinition: {
          ExponentConstants: {
            experienceUrl: { mock: '' }
          }
        }
      }
    }
  });
}
