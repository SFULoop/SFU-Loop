import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import KeyboardSafe from '../../../components/layout/KeyboardSafe';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../../navigation/types';
import { useAuth } from '../../../hooks/useAuth';
import { useProfileStore, GenderOption } from '../../../store/useProfileStore';
import { normalizeSfuEmail } from '../../../utils/validation';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

type AuthTab = 'signin' | 'create';

const SignInScreen = ({ navigation }: Props) => {
  const { initiateSignIn, authError, pendingEmail, isLoading } = useAuth();
  const setNickname = useProfileStore((state) => state.setNickname);
  const setGender = useProfileStore((state) => state.setGender);

  const [activeTab, setActiveTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState(pendingEmail ?? '');
  const [nickname, setNicknameLocal] = useState('');
  const [gender, setGenderLocal] = useState<GenderOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [genderError, setGenderError] = useState<string | null>(null);

  const handleContinue = async () => {
    setError(null);
    setNicknameError(null);
    setGenderError(null);

    if (activeTab === 'create') {
      const trimmedNickname = nickname.trim();
      if (trimmedNickname.length < 2 || trimmedNickname.length > 20) {
        setNicknameError('Nickname must be between 2 and 20 characters.');
        return;
      }

      if (!gender) {
        setGenderError('Please select a gender or choose rather not say.');
        return;
      }

      setNickname(trimmedNickname);
      setGender(gender);
    }

    try {
      await initiateSignIn(email);
      const normalizedEmail = normalizeSfuEmail(email)?.normalized ?? email.trim().toLowerCase();
      navigation.navigate('VerifyEmail', { email: normalizedEmail });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const message = error ?? authError;

  return (
    <KeyboardSafe scroll contentContainerStyle={styles.container} testID="KeyboardSafe.SignIn">
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'signin' && styles.tabActive]}
          onPress={() => setActiveTab('signin')}
        >
          <Text style={[styles.tabText, activeTab === 'signin' && styles.tabTextActive]}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'create' && styles.tabActive]}
          onPress={() => setActiveTab('create')}
        >
          <Text style={[styles.tabText, activeTab === 'create' && styles.tabTextActive]}>Create Account</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>
        {activeTab === 'signin' ? 'Welcome Back' : 'Join SFU Ride Share'}
      </Text>
      <Text style={styles.description}>
        {activeTab === 'signin'
          ? 'Enter your @sfu.ca email to receive a magic link to sign in.'
          : 'Create your profile and verify your @sfu.ca email to get started.'}
      </Text>

      {activeTab === 'create' && (
        <>
          <View style={styles.formGroup}>
            <TextInput
              style={styles.input}
              placeholder="Nickname"
              value={nickname}
              onChangeText={(value) => {
                setNicknameLocal(value);
                if (nicknameError) setNicknameError(null);
              }}
              maxLength={20}
              autoCapitalize="words"
              accessibilityLabel="Enter a nickname"
            />
            {nicknameError ? <Text style={styles.error}>{nicknameError}</Text> : null}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.segmentLabel}>Gender</Text>
            <View style={styles.segmentRow}>
              {(
                [
                  { id: 'male', label: 'Male' },
                  { id: 'female', label: 'Female' },
                  { id: 'na', label: 'Rather not say' }
                ] as const
              ).map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.segmentButton, gender === option.id && styles.segmentButtonActive]}
                  onPress={() => {
                    setGenderLocal(option.id);
                    if (genderError) setGenderError(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: gender === option.id }}
                  accessibilityLabel={`Gender ${option.label}`}
                >
                  <Text
                    style={[styles.segmentButtonText, gender === option.id && styles.segmentButtonTextActive]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {genderError ? <Text style={styles.error}>{genderError}</Text> : null}
          </View>
        </>
      )}

      <TextInput
        style={styles.input}
        placeholder="name@sfu.ca"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (error) setError(null);
        }}
        autoCapitalize="none"
        keyboardType="email-address"
        accessibilityLabel="Enter your SFU email"
      />

      {message ? <Text style={styles.error}>{message}</Text> : null}

      <TouchableOpacity
        style={[styles.cta, isLoading && styles.ctaDisabled]}
        onPress={handleContinue}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Send sign-in code"
      >
        <Text style={styles.ctaText}>
          {isLoading ? 'Sending...' : 'Send verification code'}
        </Text>
      </TouchableOpacity>
    </KeyboardSafe>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center'
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 32,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280'
  },
  tabTextActive: {
    color: '#111827'
  },
  formGroup: {
    marginBottom: 16
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12
  },
  description: {
    fontSize: 16,
    marginBottom: 24,
    color: '#4B5563'
  },
  input: {
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontSize: 16
  },
  segmentLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 12
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  segmentButtonActive: {
    borderColor: '#D4145A',
    backgroundColor: '#FCE7F3'
  },
  segmentButtonText: {
    fontSize: 14,
    color: '#111827'
  },
  segmentButtonTextActive: {
    fontWeight: '600',
    color: '#D4145A'
  },
  cta: {
    backgroundColor: '#D4145A',
    padding: 16,
    alignItems: 'center',
    borderRadius: 12,
    marginTop: 8
  },
  ctaDisabled: {
    opacity: 0.7
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16
  },
  error: {
    color: '#B91C1C',
    marginBottom: 12
  }
});

export default SignInScreen;
