import { Alert } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Checks for EAS Over-The-Air (OTA) updates.
 * - In dev mode (__DEV__), alerts that OTA is for release builds.
 * - When an update is available, downloads it and displays a prompt to restart.
 * - When no update is available (if manual check), notifies that the app is already up to date.
 */
export async function checkForAppUpdates({ manual = false, onStart, onFinish } = {}) {
  if (__DEV__) {
    if (manual) {
      Alert.alert(
        'Development Mode',
        'Over-The-Air (OTA) updates run on installed APK/Release builds only.',
      );
    }
    return false;
  }

  try {
    if (onStart) onStart();
    const check = await Updates.checkForUpdateAsync();

    if (check.isAvailable) {
      if (manual) {
        Alert.alert('Update Found', 'Downloading the latest update in the background...');
      }
      await Updates.fetchUpdateAsync();
      Alert.alert(
        '🚀 Update Ready',
        'A new version has been downloaded successfully. Restart the app now to apply the updates?',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Restart Now',
            style: 'default',
            onPress: () => {
              Updates.reloadAsync();
            },
          },
        ],
        { cancelable: false },
      );
      return true;
    } else {
      if (manual) {
        Alert.alert(
          'App Up to Date',
          `You are already using the latest version of ShreeLoan (v${Updates.runtimeVersion || '1.0.0'}).`,
        );
      }
      return false;
    }
  } catch (err) {
    console.log('[OTA Updates] Check error:', err?.message || err);
    if (manual) {
      Alert.alert(
        'Update Check',
        'Could not reach the update server. Please check your internet connection and try again.',
      );
    }
    return false;
  } finally {
    if (onFinish) onFinish();
  }
}

