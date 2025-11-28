import { collection, doc, getDocs, orderBy, query, startAfter, Timestamp, where, Firestore } from '@firebase/firestore';
import { getFirestoreDb } from '../../../services/firebase';
import { geodesicDistanceMeters } from '../../../utils/geo';

export type PaginatedSearchCursor = {
  windowStartMs: number;
  lastId?: string;
  lastDistance?: number;
};

export type PaginatedSearchParams = {
  riderId: string;
  destinationCampus: string;
  pickup: { lat: number; lng: number };
  radiusMeters: number;
  limit?: number; // default 10
  cursor?: PaginatedSearchCursor;
  db?: Firestore;
  now?: () => number;
};

export type PaginatedItem = {
  id: string;
  destinationCampus: string;
  windowStartMs: number;
  distanceMeters: number;
  seatsAvailable: number;
};

export type PaginatedSearchResult = {
  items: PaginatedItem[];
  nextCursor: PaginatedSearchCursor | null;
};

// simple in-memory rate limiter per riderId (≤10 queries/30s)
const QUERY_WINDOW_MS = 30_000;
const MAX_QUERIES_PER_WINDOW = 10;
const rateMap = new Map<string, number[]>();

const checkRateLimit = (riderId: string, nowMs: number) => {
  const list = rateMap.get(riderId) ?? [];
  const pruned = list.filter((t) => nowMs - t < QUERY_WINDOW_MS);
  if (pruned.length >= MAX_QUERIES_PER_WINDOW) {
    throw new Error('THROTTLED');
  }
  pruned.push(nowMs);
  rateMap.set(riderId, pruned);
};

export const paginatedSearch = async ({
  riderId,
  destinationCampus,
  pickup,
  radiusMeters,
  limit = 10,
  cursor,
  db = getFirestoreDb(),
  now = Date.now
}: PaginatedSearchParams): Promise<PaginatedSearchResult> => {
  const nowMs = now();
  checkRateLimit(riderId, nowMs);

  const postsCol = collection(db, 'ridePosts');
  let qRef: any = query(postsCol, where('destinationCampus', '==', destinationCampus), orderBy('windowStart', 'desc'));
  if (cursor?.windowStartMs) {
    qRef = query(qRef, startAfter(Timestamp.fromMillis(cursor.windowStartMs)));
  }

  const pageItems: PaginatedItem[] = [];
  const snap = await getDocs(qRef);
  for (const d of snap.docs) {
    const data: any = d.data();
    if (data.status !== 'open') continue;
    if ((data.seatsAvailable ?? 0) <= 0) continue;
    const end: Timestamp | null = data.windowEnd ?? null;
    if (end?.toMillis && end.toMillis() <= nowMs) continue;
    const ws: Timestamp | null = data.windowStart ?? null;
    const wsMs = ws?.toMillis ? ws.toMillis() : nowMs;
    const lat = data.origin?.lat;
    const lng = data.origin?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const dist = geodesicDistanceMeters({ lat, lng }, pickup);
    if (!Number.isFinite(dist) || dist > radiusMeters) continue;
    pageItems.push({ id: d.id, destinationCampus: data.destinationCampus, windowStartMs: wsMs, distanceMeters: Math.round(dist), seatsAvailable: data.seatsAvailable ?? 0 });
    if (pageItems.length >= limit) break;
  }

  if (pageItems.length === 0) {
    return { items: [], nextCursor: null };
  }
  // items naturally in windowStart desc order due to query; keep that for continuity
  const last = pageItems[pageItems.length - 1];
  const nextCursor: PaginatedSearchCursor = { windowStartMs: last.windowStartMs, lastId: last.id, lastDistance: last.distanceMeters };
  return { items: pageItems, nextCursor };
};

