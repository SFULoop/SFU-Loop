import { useEffect, useMemo, useRef, useState } from 'react';
import { FirebaseError } from '@firebase/app';
import type { PostRideSubmitPayload } from '../types/postRide';
import type {
  RidePostClientSnapshot,
  CreateRidePostFn,
  SubscribeToRidePostFn
} from '../api/ridePosts';
import {
  createRidePost as firestoreCreateRidePost,
  subscribeToRidePost as firestoreSubscribeToRidePost,
  mapFirebaseError
} from '../api/ridePosts';

export type PostRideClientStatus = 'idle' | 'posting' | 'live' | 'error' | 'queued';

export type UseCreateRidePostOptions = {
  driverId: string;
  createRidePostFn?: CreateRidePostFn;
  subscribeToRidePostFn?: SubscribeToRidePostFn;
};

export type UseCreateRidePostResult = {
  status: PostRideClientStatus;
  activePost: RidePostClientSnapshot | null;
  error: string | null;
  pendingCount: number;
  postRide: (payload: PostRideSubmitPayload) => Promise<void>;
  retryPending: () => Promise<void>;
  clearError: () => void;
};

type RidePostControllerState = {
  status: PostRideClientStatus;
  activePost: RidePostClientSnapshot | null;
  error: string | null;
  pendingCount: number;
};

type PendingPost = {
  driverId: string;
  payload: PostRideSubmitPayload;
};

const formatError = (error: FirebaseError | null, fallback: string) => {
  if (!error) {
    return fallback;
  }
  switch (error.code) {
    case 'permission-denied':
      return 'You do not have permission to post this ride.';
    case 'unavailable':
      return 'Network unavailable. Ride post queued for retry.';
    default:
      return error.message || fallback;
  }
};

type RidePostControllerDeps = {
  driverId: string;
  createRidePostFn: CreateRidePostFn;
  subscribeToRidePostFn: SubscribeToRidePostFn;
};

export class RidePostController {
  private state: RidePostControllerState = {
    status: 'idle',
    activePost: null,
    error: null,
    pendingCount: 0
  };
  private listeners = new Set<(state: RidePostControllerState) => void>();
  private pendingQueue: PendingPost[] = [];
  private unsubscribe: (() => void) | null = null;
  private hasResolvedSnapshot = false;
  private driverId: string;

  constructor(private readonly deps: RidePostControllerDeps) {
    this.driverId = deps.driverId;
  }

  getState() {
    return this.state;
  }

  subscribe(listener: (state: RidePostControllerState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setDriverId(driverId: string) {
    this.driverId = driverId;
  }

  dispose() {
    this.clearSubscription();
    this.listeners.clear();
    this.pendingQueue = [];
  }

  async postRide(payload: PostRideSubmitPayload) {
    if (this.state.status === 'posting') {
      return;
    }

    this.clearSubscription();
    this.updateState({ status: 'posting', error: null });

    try {
      const { postId, snapshot } = await this.deps.createRidePostFn({
        driverId: this.driverId,
        payload
      });

      this.handleSubscribe(postId, snapshot);
    } catch (unknownError) {
      this.clearSubscription();
      const firebaseError = mapFirebaseError(unknownError);

      if (firebaseError?.code === 'unavailable') {
        this.pendingQueue.push({ driverId: this.driverId, payload });
        this.updateState({
          status: 'queued',
          error: formatError(firebaseError, 'Network unavailable. Ride queued.'),
          activePost: null,
          pendingCount: this.pendingQueue.length
        });
        return;
      }

      this.updateState({
        status: 'error',
        error: formatError(firebaseError, 'Unable to post ride.'),
        activePost: null
      });
    }
  }

  async retryPending() {
    if (this.state.status === 'posting' || this.pendingQueue.length === 0) {
      return;
    }

    const next = this.pendingQueue.shift();
    this.updateState({ pendingCount: this.pendingQueue.length });

    if (!next) {
      return;
    }

    const originalDriverId = this.driverId;
    this.setDriverId(next.driverId);
    await this.postRide(next.payload);
    this.setDriverId(originalDriverId);
  }

  clearError() {
    if (!this.state.error) {
      return;
    }
    const nextStatus = this.state.status === 'error' && !this.state.activePost ? 'idle' : this.state.status;
    this.updateState({ error: null, status: nextStatus });
  }

  private updateState(patch: Partial<RidePostControllerState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private clearSubscription() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.unsubscribe = null;
    this.hasResolvedSnapshot = false;
  }

  private handleSubscribe(postId: string, snapshot: RidePostClientSnapshot) {
    this.hasResolvedSnapshot = false;
    this.unsubscribe = this.deps.subscribeToRidePostFn({
      postId,
      onSnapshot: (updatedSnapshot) => {
        this.hasResolvedSnapshot = true;
        this.updateState({
          activePost: updatedSnapshot,
          status: 'live',
          pendingCount: this.pendingQueue.length
        });
      },
      onError: (subscriptionError) => {
        const firebaseError = mapFirebaseError(subscriptionError);
        this.updateState({
          status: 'error',
          error: formatError(firebaseError, 'Real-time updates failed.'),
          activePost: null,
          pendingCount: this.pendingQueue.length
        });
        this.clearSubscription();
      }
    });

    if (!this.hasResolvedSnapshot) {
      this.updateState({
        activePost: snapshot,
        status: 'posting',
        pendingCount: this.pendingQueue.length
      });
    }
  }
}

export const useCreateRidePost = ({
  driverId,
  createRidePostFn = firestoreCreateRidePost,
  subscribeToRidePostFn = firestoreSubscribeToRidePost
}: UseCreateRidePostOptions): UseCreateRidePostResult => {
  const controllerRef = useRef<RidePostController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new RidePostController({
      driverId,
      createRidePostFn,
      subscribeToRidePostFn
    });
  }

  const controller = controllerRef.current!;
  const [state, setState] = useState<RidePostControllerState>(controller.getState());

  useEffect(() => {
    controller.setDriverId(driverId);
  }, [controller, driverId]);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    return () => {
      unsubscribe();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [controller]);

  return useMemo(() => ({
    status: state.status,
    activePost: state.activePost,
    error: state.error,
    pendingCount: state.pendingCount,
    postRide: (payload: PostRideSubmitPayload) => controller.postRide(payload),
    retryPending: () => controller.retryPending(),
    clearError: () => controller.clearError()
  }), [state, controller]);
};
