const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === '@firebase/app') {
        return {
            filePath: path.resolve(__dirname, 'node_modules/@firebase/app/dist/index.cjs.js'),
            type: 'sourceFile',
        };
    }
    // Chain to the standard Metro resolver.
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
