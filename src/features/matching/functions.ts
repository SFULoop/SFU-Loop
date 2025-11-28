import { collection, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp, setDoc, Timestamp, where, Firestore } from '@firebase/firestore';
import { getFirestoreDb } from '../../services/firebase';
import { geodesicDistanceMeters } from '../../utils/geo';

type RiderFilters = {
  destinationCampus: string;
  pickup: { lat: number; lng: number };
  radiusMeters: number;
};

type MatchEntry = {
  postId: string;
  destinationCampus: string;
  seatsAvailable: number;
  driverRating?: number;
  driverReliability?: number;
  windowStartMs: number;
  distanceMeters: number;
  score?: number;
};

const readRiderFilters = async (riderId: string, db: Firestore) => {
  const ref = doc(db, 'users', riderId);
  const snap = await getDoc(ref);
  const data = snap.exists() ? (snap.data() as any) : {};
  const f = data.matching ?? {};
  const destinationCampus = f.destinationCampus ?? data.preferredCampus ?? 'Burnaby';
  const pickup = f.pickup ?? { lat: 0, lng: 0 };
  const radiusMeters = typeof f.radiusMeters === 'number' ? f.radiusMeters : 1000;
  const filters: RiderFilters = { destinationCampus, pickup, radiusMeters };
  return filters;
};

export const recomputeMatchesForRider = async (
  riderId: string,
  { db = getFirestoreDb(), now = Date.now, topN = 10 }: { db?: Firestore; now?: () => number; topN?: number } = {}
) => {
  const filters = await readRiderFilters(riderId, db);
  const postsCol = collection(db, 'ridePosts');
  // Prefer using destinationCampus + windowStart ordering; status filtered in-memory for simplicity.
  const q = query(postsCol, where('destinationCampus', '==', filters.destinationCampus), orderBy('windowStart', 'desc'));
  const snap = await getDocs(q);
  const nowMs = now();
  const candidates: MatchEntry[] = [];
  for (const d of snap.docs) {
    const post: any = d.data();
    if (post.status !== 'open') continue;
    if ((post.seatsAvailable ?? 0) <= 0) continue;
    const ws: Timestamp | null = post.windowStart ?? null;
    if (ws && ws.toMillis && ws.toMillis() + 6 * 60_000 < nowMs) {
      // drop if window in far past (grace 6 minutes)
      continue;
    }
    const lat = post.origin?.lat;
    const lng = post.origin?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const distance = geodesicDistanceMeters({ lat, lng }, filters.pickup);
    if (Number.isFinite(distance) && distance <= filters.radiusMeters) {
      candidates.push({
        postId: d.id,
        destinationCampus: post.destinationCampus,
        seatsAvailable: post.seatsAvailable ?? 0,
        driverRating: post.driverRating,
        driverReliability: post.driverReliability,
        windowStartMs: ws?.toMillis ? ws.toMillis() : nowMs,
        distanceMeters: Math.round(distance)
      });
    }
  }
  // Compute composite score per spec
  // score = 0.4*timeDeltaScore + 0.35*geoScore + 0.15*reliabilityScore + 0.1*ratingScore
  // Normalization:
  //  - timeDeltaScore: 1 - min(delta, horizon)/horizon (horizon = 60 min)
  //  - geoScore: 1 - (distance/radius)
  //  - reliabilityScore: clamp in [0,1] (default 0.5 if missing)
  //  - ratingScore: (rating/5) (default 0.5 if missing)
  const horizonMs = 60 * 60_000;
  const radius = Math.max(1, filters.radiusMeters);
  for (const c of candidates) {
    const delta = Math.max(0, c.windowStartMs - nowMs);
    const timeDeltaScore = 1 - Math.min(delta, horizonMs) / horizonMs;
    const geoScore = 1 - Math.min(Math.max(c.distanceMeters, 0), radius) / radius;
    const reliabilityScore = typeof c.driverReliability === 'number' ? Math.min(Math.max(c.driverReliability, 0), 1) : 0.5;
    const ratingScore = typeof c.driverRating === 'number' ? Math.min(Math.max(c.driverRating / 5, 0), 1) : 0.5;
    c.score = 0.4 * timeDeltaScore + 0.35 * geoScore + 0.15 * reliabilityScore + 0.1 * ratingScore;
  }

  // Sort by score desc, tie-break by proximity asc, then recency desc
  candidates.sort((a, b) => (b.score! - a.score!) || (a.distanceMeters - b.distanceMeters) || (b.windowStartMs - a.windowStartMs));
  const top = candidates.slice(0, topN).map((e) => {
    const out: any = {
      postId: e.postId,
      destinationCampus: e.destinationCampus,
      seatsAvailable: e.seatsAvailable,
      windowStartMs: e.windowStartMs,
      distanceMeters: e.distanceMeters,
      score: e.score
    };
    if (typeof e.driverRating === 'number') out.driverRating = e.driverRating;
    if (typeof e.driverReliability === 'number') out.driverReliability = e.driverReliability;
    return out;
  });

  const matchesRef = doc(db, 'matches', riderId);
  await runTransaction(db, async (tx) => {
    tx.set(matchesRef, { riderId, top, updatedAt: serverTimestamp() } as any, { merge: true } as any);
  });
};

export const sweepMatchesForRider = async (
  riderId: string,
  { db = getFirestoreDb(), now = Date.now }: { db?: Firestore; now?: () => number } = {}
) => {
  const matchRef = doc(db, 'matches', riderId);
  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) return;
  const top = (matchSnap.data() as any)?.top ?? [];
  const nowMs = now();
  const cleaned: any[] = [];
  for (const m of top) {
    const postRef = doc(db, 'ridePosts', m.postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) continue;
    const post: any = postSnap.data();
    const valid = post.status === 'open' && (post.seatsAvailable ?? 0) > 0 && (!post.windowEnd?.toMillis || post.windowEnd.toMillis() > nowMs);
    if (valid) cleaned.push(m);
  }
  await setDoc(matchRef, { top: cleaned, updatedAt: serverTimestamp() } as any, { merge: true });
};
