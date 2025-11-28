import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import { storage } from '../utils/storage';
import { FirebaseError } from '@firebase/app';
import { isSignInWithEmailLink, onAuthStateChanged, sendSignInLinkToEmail, signInWithEmailLink } from '@firebase/auth';
import { ensureAppCheck } from '../services/firebase/appCheck';
import { getFirebaseAuth } from '../services/firebase';
import { isMagicLinkExpired, normalizeSfuEmail } from '../utils/validation';

type AuthUser = {
  email: string;
  uid: string;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  pendingEmail: string | null;
  authError: string | null;
  initiateSignIn: (email: string) => Promise<void>;
  completeSignIn: (codeOrLink: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PENDING_EMAIL_KEY = 'auth.pendingEmail';
const PENDING_SENT_AT_KEY = 'auth.pendingSentAt';

const ACTION_CODE_URL = Linking.createURL('/auth/verify');
const RESEND_THROTTLE_MS = 30_000;

const persistPendingEmail = async (email: string | null, sentAt: number | null) => {
  if (email) {
    await storage.setItem(PENDING_EMAIL_KEY, email);
  } else {
    await storage.deleteItem(PENDING_EMAIL_KEY);
  }

  if (sentAt) {
    await storage.setItem(PENDING_SENT_AT_KEY, String(sentAt));
  } else {
    await storage.deleteItem(PENDING_SENT_AT_KEY);
  }
};

const parseStoredTimestamp = (value: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildSignInLinkFromCode = (codeOrLink: string, apiKey: string, authDomain: string) => {
  const trimmed = codeOrLink.trim();
  if (trimmed.includes('http')) {
    return trimmed;
  }

  const sanitizedDomain = authDomain.startsWith('http') ? authDomain : `https://${authDomain}`;
  const url = new URL('/__/auth/action', sanitizedDomain);
  url.searchParams.set('mode', 'signIn');
  url.searchParams.set('oobCode', trimmed);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('continueUrl', ACTION_CODE_URL);

  return url.toString();
};

const humanizeFirebaseAuthError = (error: FirebaseError) => {
  switch (error.code) {
    case 'auth/network-request-failed':
      return 'Check your connection and try again. Offline sends are throttled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment before retrying.';
    case 'auth/invalid-email':
      return 'Enter a valid @sfu.ca email address.';
    case 'auth/invalid-action-code':
    case 'auth/expired-action-code':
      return 'This link is no longer valid. Request a new one.';
    default:
      return 'We could not verify your email. Please try again.';
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingSentAt, setPendingSentAt] = useState<number | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const auth = getFirebaseAuth();

    const loadPending = async () => {
      try {
        const [storedEmail, storedSentAt] = await Promise.all([
          storage.getItem(PENDING_EMAIL_KEY),
          storage.getItem(PENDING_SENT_AT_KEY)
        ]);

        if (isCancelled) {
          return;
        }

        setPendingEmail(storedEmail);
        setPendingSentAt(parseStoredTimestamp(storedSentAt));
      } catch (error) {
        console.warn('Failed to load pending auth state', error);
      }
    };

    void loadPending();

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (isCancelled) {
        return;
      }

      if (firebaseUser?.email) {
        setUser({ email: firebaseUser.email, uid: firebaseUser.uid });
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }

      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, []);

  const initiateSignIn = useCallback<AuthContextValue['initiateSignIn']>(async (email) => {
    const normalized = normalizeSfuEmail(email);

    if (!normalized) {
      const message = 'Use a valid @sfu.ca or approved subdomain email (plus tags only on @sfu.ca).';
      setAuthError(message);
      throw new Error(message);
    }

    const now = Date.now();
    if (pendingSentAt && now - pendingSentAt < RESEND_THROTTLE_MS) {
      const message = 'Please wait a moment before requesting another link.';
      setAuthError(message);
      throw new Error(message);
    }

    setIsLoading(true);
    setAuthError(null);

    try {
      ensureAppCheck();
      const auth = getFirebaseAuth();

      const actionCodeSettings = {
        handleCodeInApp: true,
        url: ACTION_CODE_URL
      };
      console.log('Sending sign-in link with settings:', actionCodeSettings);

      await sendSignInLinkToEmail(auth, normalized.normalized, actionCodeSettings);

      setPendingEmail(normalized.normalized);
      setPendingSentAt(now);
      await persistPendingEmail(normalized.normalized, now);
    } catch (error) {
      const friendly = error instanceof FirebaseError ? humanizeFirebaseAuthError(error) : undefined;
      setAuthError(friendly ?? 'Unable to send sign-in link. Try again.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [pendingSentAt]);

  const completeSignIn = useCallback<AuthContextValue['completeSignIn']>(async (codeOrLink) => {
    if (!pendingEmail) {
      const errorMessage = 'No pending sign-in request found. Start again.';
      setAuthError(errorMessage);
      throw new Error(errorMessage);
    }

    if (!pendingSentAt || isMagicLinkExpired(pendingSentAt)) {
      const errorMessage = 'This link expired. Request a new one to continue.';
      setAuthError(errorMessage);
      await persistPendingEmail(null, null);
      throw new Error(errorMessage);
    }

    setIsLoading(true);
    setAuthError(null);

    try {
      const auth = getFirebaseAuth();
      const apiKey = auth.app.options.apiKey;
      const authDomain = auth.app.options.authDomain ?? 'localhost';

      if (!apiKey) {
        throw new Error('Missing Firebase API key configuration.');
      }

      const link = buildSignInLinkFromCode(codeOrLink, apiKey, authDomain);

      await signInWithEmailLink(auth, pendingEmail, link);

      setPendingEmail(null);
      setPendingSentAt(null);
      await persistPendingEmail(null, null);
    } catch (error) {
      const friendly = error instanceof FirebaseError ? humanizeFirebaseAuthError(error) : undefined;
      setAuthError(friendly ?? 'We could not verify your email. Please try again.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [pendingEmail, pendingSentAt]);

  useEffect(() => {
    const auth = getFirebaseAuth();

    const handleUrl = ({ url }: { url: string }) => {
      if (url && isSignInWithEmailLink(auth, url)) {
        void completeSignIn(url).catch((error) => {
          const message = error instanceof Error ? error.message : 'Failed to complete magic link sign-in.';
          setAuthError(message);
          console.warn('Failed to complete magic link sign-in', error);
        });
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);
    void Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl && isSignInWithEmailLink(auth, initialUrl)) {
        handleUrl({ url: initialUrl });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [completeSignIn]);

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    setIsLoading(true);
    try {
      const auth = getFirebaseAuth();
      await auth.signOut();
      setIsAuthenticated(false);
      setUser(null);
      setPendingEmail(null);
      setPendingSentAt(null);
      await persistPendingEmail(null, null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      user,
      pendingEmail,
      authError,
      initiateSignIn,
      completeSignIn,
      signOut
    }),
    [authError, completeSignIn, initiateSignIn, isAuthenticated, isLoading, pendingEmail, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
