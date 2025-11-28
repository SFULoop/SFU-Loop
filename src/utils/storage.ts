import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Platform-agnostic storage utility.
 * Uses SecureStore on native platforms for sensitive data.
 * Uses AsyncStorage on web (not secure, but functional for this demo).
 */

export const storage = {
    async setItem(key: string, value: string): Promise<void> {
        if (Platform.OS === 'web') {
            await AsyncStorage.setItem(key, value);
        } else {
            await SecureStore.setItemAsync(key, value);
        }
    },

    async getItem(key: string): Promise<string | null> {
        if (Platform.OS === 'web') {
            return await AsyncStorage.getItem(key);
        } else {
            return await SecureStore.getItemAsync(key);
        }
    },

    async deleteItem(key: string): Promise<void> {
        if (Platform.OS === 'web') {
            await AsyncStorage.removeItem(key);
        } else {
            await SecureStore.deleteItemAsync(key);
        }
    }
};
