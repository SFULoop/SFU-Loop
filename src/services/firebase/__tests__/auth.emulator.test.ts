import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { initializeApp } from '@firebase/app';
import {
  connectAuthEmulator,
  initializeAuth,
  inMemoryPersistence,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  type Auth
} from '@firebase/auth';
import { isMagicLinkExpired, MAGIC_LINK_TTL_MS, normalizeSfuEmail } from '../../../utils/validation';

jest.setTimeout(70000);

const PROJECT_ID = 'demo-sfu-loop';
const AUTH_HOST = '127.0.0.1';
const AUTH_PORT = 9099;
const ACTION_CODE_URL = 'https://example.com/auth/verify';

const emulatorLogs = { stdout: '', stderr: '' };

const waitForEmulator = async (proc: ChildProcessWithoutNullStreams) => {
  const start = Date.now();

  while (Date.now() - start < 30000) {
    if (proc.exitCode !== null) {
      throw new Error(
        `Auth emulator exited early with code ${proc.exitCode}. stdout: ${emulatorLogs.stdout}, stderr: ${emulatorLogs.stderr}`
      );
    }
    try {
      const response = await fetch(`http://${AUTH_HOST}:${AUTH_PORT}/emulator/v1/projects/${PROJECT_ID}/config`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Auth emulator did not start in time. stdout: ${emulatorLogs.stdout}, stderr: ${emulatorLogs.stderr}`);
};

const fetchLatestOobLink = async (email: string, apiKey: string) => {
  const response = await fetch(`http://${AUTH_HOST}:${AUTH_PORT}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const body = (await response.json()) as { oobCodes: Array<{ email: string; oobCode: string; oobLink?: string }> };
  const codes = body.oobCodes.filter((entry) => entry.email === email);

  if (!codes.length) {
    throw new Error(`No OOB codes found for ${email}`);
  }

  const latest = codes[codes.length - 1];
  if (latest.oobLink) {
    return latest.oobLink;
  }

  const url = new URL('/__/auth/action', 'http://localhost');
  url.searchParams.set('mode', 'signIn');
  url.searchParams.set('oobCode', latest.oobCode);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('continueUrl', ACTION_CODE_URL);

  return url.toString();
};

describe('Firebase Auth emulator email link flow', () => {
  let emulatorProcess: ChildProcessWithoutNullStreams | null = null;
  let auth: Auth;

  beforeAll(async () => {
    emulatorProcess = spawn('firebase', ['emulators:start', '--only', 'auth', '--project', PROJECT_ID, '--config', 'firebase.json'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    emulatorProcess.stdout?.on('data', (chunk) => {
      emulatorLogs.stdout += chunk.toString();
    });
    emulatorProcess.stderr?.on('data', (chunk) => {
      emulatorLogs.stderr += chunk.toString();
    });

    await waitForEmulator(emulatorProcess);

    const app = initializeApp({
      apiKey: 'demo-api-key',
      authDomain: 'localhost',
      projectId: PROJECT_ID,
      appId: 'demo-app-id'
    });

    auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connectAuthEmulator(auth, `http://${AUTH_HOST}:${AUTH_PORT}`, { disableWarnings: true });
  });

  afterAll(async () => {
    if (auth?.currentUser) {
      await auth.signOut();
    }

    if (!emulatorProcess) {
      return;
    }

    if (emulatorProcess.exitCode !== null) {
      return;
    }

    emulatorProcess.kill('SIGINT');
    await new Promise((resolve) => emulatorProcess?.once('exit', resolve));
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    if (auth?.currentUser) {
      await auth.signOut();
    }
  });

  it('signs in successfully with @sfu.ca email', async () => {
    await sendSignInLinkToEmail(auth, 'student@sfu.ca', {
      handleCodeInApp: true,
      url: ACTION_CODE_URL
    });

    const link = await fetchLatestOobLink('student@sfu.ca', 'demo-api-key');
    await signInWithEmailLink(auth, 'student@sfu.ca', link);

    expect(auth.currentUser?.email).toBe('student@sfu.ca');
  });

  it('rejects non-allowlisted domains client-side', () => {
    expect(normalizeSfuEmail('student@gmail.com')).toBeNull();
  });

  it('fails when reusing a magic link', async () => {
    await sendSignInLinkToEmail(auth, 'reuse@sfu.ca', {
      handleCodeInApp: true,
      url: ACTION_CODE_URL
    });

    const link = await fetchLatestOobLink('reuse@sfu.ca', 'demo-api-key');
    await signInWithEmailLink(auth, 'reuse@sfu.ca', link);

    await expect(signInWithEmailLink(auth, 'reuse@sfu.ca', link)).rejects.toThrow();
  });

  it('blocks expired magic links after 15 minutes', async () => {
    const baseTime = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(baseTime);

    await sendSignInLinkToEmail(auth, 'expired@sfu.ca', {
      handleCodeInApp: true,
      url: ACTION_CODE_URL
    });

    const link = await fetchLatestOobLink('expired@sfu.ca', 'demo-api-key');
    nowSpy.mockReturnValue(baseTime + MAGIC_LINK_TTL_MS + 1000);

    const complete = async () => {
      if (isMagicLinkExpired(baseTime)) {
        throw new Error('Link expired');
      }
      return signInWithEmailLink(auth, 'expired@sfu.ca', link);
    };

    await expect(complete()).rejects.toThrow('Link expired');
    nowSpy.mockRestore();
  });
});
