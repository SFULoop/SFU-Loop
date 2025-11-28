import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  onSnapshot as fsOnSnapshot,
  query,
  getDocs,
  where,
  orderBy,
  startAt,
  endAt
} from '@firebase/firestore';
import { getFirestoreDb } from '../../../services/firebase';

export type RideFeedItem = {
  id: string;
  destinationCampus: string;
  seatsAvailable: number;
  status: string;
};

export type RideFeedState = {
  items: Array<RideFeedItem & { isStale: boolean }>;
  offline: boolean;
  refreshing: boolean;
  lastServerSyncAt: number | null;
};

export type SubscribeToRideFeedFn = (options: {
  onSnapshot: (items: RideFeedItem[], fromServer: boolean) => void;
  onError: (error: unknown) => void;
  geohashPrefixes?: string[];
}) => () => void;

export type RefreshRideFeedFn = () => Promise<RideFeedItem[]>;

const FIVE_MIN = 5 * 60_000;

type RideFeedControllerDeps = {
  subscribe: SubscribeToRideFeedFn;
  refreshFn: RefreshRideFeedFn;
  now?: () => number;
};

export class RideFeedController {
  private state: RideFeedState = { items: [], offline: false, refreshing: false, lastServerSyncAt: null };
  private listeners = new Set<(state: RideFeedState) => void>();
  private unsubscribe: (() => void) | null = null;
  private now: () => number;

  constructor(private readonly deps: RideFeedControllerDeps) {
    this.now = deps.now ?? Date.now;
  }

  getState() { return this.state; }

  subscribe(listener: (state: RideFeedState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    if (!this.unsubscribe) {
      this.unsubscribe = this.deps.subscribe({
        onSnapshot: (items, fromServer) => {
          const ts = fromServer ? this.now() : this.state.lastServerSyncAt;
          this.state = {
            ...this.state,
            items: this.tagStale(items, ts),
            offline: !fromServer && (this.state.offline || true),
            lastServerSyncAt: ts ?? null
          };
          this.emit();
        },
        onError: (_e) => {
          this.state = { ...this.state, offline: true };
          this.emit();
        }
      });
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
    this.listeners.clear();
  }

  async refresh() {
    if (this.state.refreshing) return;
    this.state = { ...this.state, refreshing: true };
    this.emit();
    try {
      const items = await this.deps.refreshFn();
      const ts = this.now();
      this.state = { items: this.tagStale(items, ts), offline: false, refreshing: false, lastServerSyncAt: ts };
      this.emit();
    } catch (e) {
      // keep previous items, mark offline, and recompute staleness vs current time
      const retagged = this.tagStale(this.state.items, this.state.lastServerSyncAt);
      this.state = { ...this.state, items: retagged, refreshing: false, offline: true };
      this.emit();
    }
  }

  private tagStale(items: RideFeedItem[] | (RideFeedItem & { isStale?: boolean })[], lastServerSyncAt: number | null) {
    const now = this.now();
    const tooOld = lastServerSyncAt ? now - lastServerSyncAt > FIVE_MIN : true;
    return items.map((it: any) => ({ id: it.id, destinationCampus: it.destinationCampus, seatsAvailable: it.seatsAvailable, status: it.status, isStale: tooOld }));
  }

  private emit() {
    for (const l of this.listeners) l(this.state);
  }
}

// Default Firestore-powered subscribe/refresh
const defaultSubscribe: SubscribeToRideFeedFn = ({ onSnapshot: push, onError, geohashPrefixes }) => {
  const db = getFirestoreDb();
  let qRef: any;
  if (geohashPrefixes && geohashPrefixes.length === 1) {
    const prefix = geohashPrefixes[0];
    const start = prefix;
    const end = prefix + '\uf8ff';
    qRef = query(
      collection(db, 'ridePosts'),
      where('status', '==', 'open'),
      orderBy('geohash'),
      startAt(start),
      endAt(end)
    );
  } else {
    qRef = query(collection(db, 'ridePosts'), where('status', '==', 'open'));
  }
  const unsub = fsOnSnapshot(
    qRef,
    (snap: any) => {
      const now = Date.now();
      const items: RideFeedItem[] = snap.docs
        .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
        .filter((d: any) => d.status === 'open' && (d.seatsAvailable ?? 0) > 0 && (!d.windowEnd?.toMillis || d.windowEnd.toMillis() > now))
        .map((d: any) => ({ id: d.id, destinationCampus: d.destinationCampus, seatsAvailable: d.seatsAvailable ?? 0, status: d.status }));
      const fromServer = !(snap.metadata?.fromCache ?? false);
      push(items, fromServer);
    },
    onError as any
  );
  return unsub;
};

const defaultRefresh: RefreshRideFeedFn = async () => {
  const db = getFirestoreDb();
  const q = query(collection(db, 'ridePosts'));
  const snap = await getDocs(q);
  return snap.docs
    .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
    .filter((d: any) => d.status === 'open')
    .map((d: any) => ({ id: d.id, destinationCampus: d.destinationCampus, seatsAvailable: d.seatsAvailable ?? 0, status: d.status }));
};

export const useRideFeed = (
  deps: Partial<{ subscribe: SubscribeToRideFeedFn; refreshFn: RefreshRideFeedFn; now: () => number; geohashPrefixes: string[] }> = {}
) => {
  const controllerRef = useRef<RideFeedController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new RideFeedController({
      subscribe: (opts) => (deps.subscribe ?? defaultSubscribe)({ ...opts, geohashPrefixes: deps.geohashPrefixes }),
      refreshFn: deps.refreshFn ?? defaultRefresh,
      now: deps.now
    });
  }
  const controller = controllerRef.current!;
  const [state, setState] = useState<RideFeedState>(controller.getState());

  useEffect(() => {
    const unsub = controller.subscribe(setState);
    return () => {
      unsub();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [controller]);

  return useMemo(() => ({
    ...state,
    refresh: () => controller.refresh()
  }), [state, controller]);
};
