import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  View,
  ViewStyle
} from 'react-native';

type KeyboardSafeProps = {
  children: ReactNode;
  /** When true, wraps content in a ScrollView for longer forms. */
  scroll?: boolean;
  /** Additional style for the container. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Offset for iOS to account for headers/navigation bars. */
  keyboardVerticalOffset?: number;
  /** testID for querying in tests */
  testID?: string;
};

/**
 * KeyboardSafe: standard wrapper to avoid keyboard overlapping inputs.
 * - iOS: uses `behavior="padding"` and accepts a `keyboardVerticalOffset` to compensate headers.
 * - Android: uses `behavior="height"`.
 * Use `scroll` for multi-input forms; otherwise a static container is applied.
 */
export const KeyboardSafe = ({
  children,
  scroll = false,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  testID
}: KeyboardSafeProps) => {
  const behavior = Platform.select({ ios: 'padding', android: 'height', default: undefined }) as
    | 'height'
    | 'position'
    | 'padding'
    | undefined;

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      testID={testID ?? 'KeyboardSafe.Scroll'}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={contentContainerStyle} testID={testID ?? 'KeyboardSafe.View'}>
      {children}
    </View>
  );

  if (Platform.OS === 'web') {
    return <View style={{ flex: 1 }}>{content}</View>;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={behavior}
      // Only apply offset on iOS where padding pushes content up under a header
      keyboardVerticalOffset={Platform.OS === 'ios' ? keyboardVerticalOffset : 0}
      testID="KeyboardSafe.Root"
    >
      {content}
    </KeyboardAvoidingView>
  );
};

export default KeyboardSafe;

