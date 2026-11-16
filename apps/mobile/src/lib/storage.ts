import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Token storage. SecureStore (Keychain/Keystore) on native; AsyncStorage on web
 * where SecureStore isn't available.
 */
const isWeb = Platform.OS === "web";

export async function getItem(key: string): Promise<string | null> {
  return isWeb ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) await AsyncStorage.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (isWeb) await AsyncStorage.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}
