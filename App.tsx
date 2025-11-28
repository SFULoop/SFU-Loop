import { useMemo } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';

import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/contexts/AuthContext';
import { NotificationsProvider } from './src/contexts/NotificationsContext';
import { AppThemeProvider } from './src/theme/AppThemeProvider';
import { navigationTheme } from './src/theme/navigationTheme';
import { linkingConfig } from './src/navigation/linking';
import { MapProvider } from './src/contexts/MapContext';

const App = () => {
  const queryClient = useMemo(() => new QueryClient(), []);



  return (
    <GestureHandlerRootView style={{ flex: 1, ...(Platform.OS === 'web' ? { height: '100vh', overflow: 'hidden' } : {}) } as any}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NotificationsProvider>
            <AppThemeProvider>
              <MapProvider>
                <NavigationContainer theme={navigationTheme} linking={linkingConfig}>
                  <StatusBar style="auto" />
                  <AppNavigator />
                </NavigationContainer>
              </MapProvider>
            </AppThemeProvider>
          </NotificationsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
};

export default App;
