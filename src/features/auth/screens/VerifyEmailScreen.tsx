import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../hooks/useAuth';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

const VerifyEmailScreen = ({ route }: Props) => {
  const { completeSignIn, authError, isLoading, pendingEmail } = useAuth();
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const email = route.params?.email ?? pendingEmail ?? '';

  const handleCodeSubmit = async () => {
    setLocalError(null);
    try {
      await completeSignIn(code);
    } catch (error) {
      setLocalError((error as Error).message);
    }
  };

  const message = localError ?? authError;
  const isCodeValid = code.trim().length >= 6;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter your verification code</Text>
      <Text style={styles.body}>
        We sent a magic link to {email || 'your SFU email'}. Paste the link or one-time code to finish signing in.
      </Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(value) => {
          setCode(value.trim());
          if (localError) {
            setLocalError(null);
          }
        }}
        placeholder="Paste link or code"
        keyboardType="default"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="oneTimeCode"
      />
      {message ? <Text style={styles.error}>{message}</Text> : null}
      <TouchableOpacity
        style={[styles.cta, (!isCodeValid || isLoading) && styles.ctaDisabled]}
        onPress={handleCodeSubmit}
        disabled={!isCodeValid || isLoading}
      >
        <Text style={styles.ctaText}>{isLoading ? 'Verifying…' : 'Verify and continue'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center'
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12
  },
  body: {
    fontSize: 16,
    marginBottom: 24
  },
  input: {
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 16
  },
  error: {
    color: '#B91C1C',
    marginBottom: 16,
    textAlign: 'center'
  },
  cta: {
    backgroundColor: '#D4145A',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  ctaDisabled: {
    opacity: 0.6
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '600'
  }
});

export default VerifyEmailScreen;
