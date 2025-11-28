import { useEffect, useMemo, useRef, useState } from 'react';
import { FirebaseError } from '@firebase/app';
import { requestRide as realRequestRide, cancelRequest as realCancelRequest, cancelBooking as realCancelBooking } from '../api/requests';

type QueueItem =
  | { type: 'request'; args: [Parameters<typeof realRequestRide>[0]] }
  | { type: 'cancelRequest'; args: Parameters<typeof realCancelRequest> }
  | { type: 'cancelBooking'; args: Parameters<typeof realCancelBooking> };

export type RiderActionsState = {
  status: 'idle' | 'queued' | 'processing' | 'error';
  pendingCount: number;
  error: string | null;
};

type Deps = {
  requestRide: typeof realRequestRide;
  cancelRequest: typeof realCancelRequest;
  cancelBooking: typeof realCancelBooking;
};

export class RiderActionsController {
  private state: RiderActionsState = { status: 'idle', pendingCount: 0, error: null };
  private listeners = new Set<(s: RiderActionsState) => void>();
  private queue: QueueItem[] = [];

  constructor(private readonly deps: Deps) {}

  getState() { return this.state; }
  subscribe(listener: (s: RiderActionsState) => void) { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); }; }
  private emit() { for (const l of this.listeners) l(this.state); }

  private setError(error: FirebaseError | unknown, fallback: string) {
    const message = error instanceof FirebaseError ? error.message : fallback;
    this.state = { ...this.state, status: 'error', error: message };
    this.emit();
  }

  async requestRide(args: Parameters<typeof realRequestRide>[0]) {
    try {
      this.state = { ...this.state, status: 'processing', error: null };
      this.emit();
      await this.deps.requestRide(args);
      this.state = { ...this.state, status: this.queue.length ? 'queued' : 'idle' };
      this.emit();
    } catch (e) {
      const fe = e as FirebaseError & { message?: string };
      if (fe?.code === 'unavailable') {
        this.queue.push({ type: 'request', args: [args] });
        this.state = { status: 'queued', pendingCount: this.queue.length, error: null };
        this.emit();
        return;
      }
      if ((e as any)?.message === 'OUT_OF_RADIUS') {
        this.state = { ...this.state, status: 'error', error: "You're outside the ride zone" };
        this.emit();
        return;
      }
      this.setError(e, 'Action failed');
    }
  }

  async cancelRequest(...args: Parameters<typeof realCancelRequest>) {
    try {
      this.state = { ...this.state, status: 'processing', error: null };
      this.emit();
      await this.deps.cancelRequest(...args);
      this.state = { ...this.state, status: this.queue.length ? 'queued' : 'idle' };
      this.emit();
    } catch (e) {
      const fe = e as FirebaseError;
      if (fe?.code === 'unavailable') {
        this.queue.push({ type: 'cancelRequest', args });
        this.state = { status: 'queued', pendingCount: this.queue.length, error: null };
        this.emit();
        return;
      }
      this.setError(e, 'Action failed');
    }
  }

  async cancelBooking(...args: Parameters<typeof realCancelBooking>) {
    try {
      this.state = { ...this.state, status: 'processing', error: null };
      this.emit();
      await this.deps.cancelBooking(...args);
      this.state = { ...this.state, status: this.queue.length ? 'queued' : 'idle' };
      this.emit();
    } catch (e) {
      const fe = e as FirebaseError;
      if (fe?.code === 'unavailable') {
        this.queue.push({ type: 'cancelBooking', args });
        this.state = { status: 'queued', pendingCount: this.queue.length, error: null };
        this.emit();
        return;
      }
      this.setError(e, 'Action failed');
    }
  }

  async retryPending() {
    if (this.queue.length === 0) return;
    const next = this.queue.shift();
    this.state = { ...this.state, status: 'processing', pendingCount: this.queue.length };
    this.emit();
    if (!next) return;
    try {
      if (next.type === 'request') {
        await this.deps.requestRide(next.args[0] as any);
      } else if (next.type === 'cancelRequest') {
        const args = next.args as Parameters<typeof realCancelRequest>;
        await this.deps.cancelRequest(...args);
      } else if (next.type === 'cancelBooking') {
        const args = next.args as Parameters<typeof realCancelBooking>;
        await this.deps.cancelBooking(...args);
      }
      this.state = { ...this.state, status: this.queue.length ? 'queued' : 'idle' };
      this.emit();
    } catch (e) {
      const fe = e as FirebaseError;
      if (fe?.code === 'unavailable') {
        // push back to queue
        this.queue.unshift(next);
        this.state = { status: 'queued', pendingCount: this.queue.length, error: null };
        this.emit();
        return;
      }
      this.setError(e, 'Retry failed');
    }
  }
}

export const useRiderActions = (deps?: Partial<Deps>) => {
  const controllerRef = useRef<RiderActionsController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new RiderActionsController({
      requestRide: deps?.requestRide ?? realRequestRide,
      cancelRequest: deps?.cancelRequest ?? realCancelRequest,
      cancelBooking: deps?.cancelBooking ?? realCancelBooking
    });
  }
  const controller = controllerRef.current!;
  const [state, setState] = useState<RiderActionsState>(controller.getState());
  useEffect(() => {
    const unsub = controller.subscribe(setState);
    return () => { unsub(); };
  }, [controller]);
  return useMemo(() => ({
    ...state,
    requestRide: (args: Parameters<typeof realRequestRide>[0]) => controller.requestRide(args),
    cancelRequest: (...args: Parameters<typeof realCancelRequest>) => controller.cancelRequest(...args),
    cancelBooking: (...args: Parameters<typeof realCancelBooking>) => controller.cancelBooking(...args),
    retryPending: () => controller.retryPending()
  }), [state, controller]);
};
