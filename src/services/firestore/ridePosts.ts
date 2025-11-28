import ngeohash from 'ngeohash';
import { collection, CollectionReference, doc, DocumentReference, Firestore, serverTimestamp, Timestamp, WithFieldValue, PartialWithFieldValue, GeoPoint } from '@firebase/firestore';
import { getFirestoreDb } from '../firebase';

export type RidePostStatus = 'open' | 'expired' | 'canceled' | 'inTrip';

export interface RidePostOrigin {
  lat: number | null;
  lng: number | null;
  label: string;
  geohash: string;
  precision: 'exact' | 'approximate';
}

export interface RidePostDocument {
  driverId: string;
  origin: RidePostOrigin;
  destinationCampus: string;
  seatsTotal: number;
  seatsAvailable: number;
  windowStart: Timestamp;
  windowEnd: Timestamp;
  geohash: string; // duplicate for query indexes
  driverReliability?: number; // 0..1 optional
  driverRating?: number; // 0..5 optional
  originGeoPoint?: GeoPoint; // for geo queries/maps
  status: RidePostStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RidePostCreateInput {
  driverId: string;
  origin: {
    lat: number | null;
    lng: number | null;
    label: string;
    precision: RidePostOrigin['precision'];
  };
  destinationCampus: string;
  seatsTotal: number;
  windowStart: Timestamp;
  windowEnd: Timestamp;
  seatsAvailable?: number;
  driverReliability?: number;
  driverRating?: number;
}

export interface RidePostStatusUpdateInput {
  currentStatus: RidePostStatus;
  nextStatus: Exclude<RidePostStatus, 'open'>;
}

export const RIDE_POST_STATUS_TRANSITIONS: Record<RidePostStatus, ReadonlyArray<RidePostStatus>> = {
  open: ['expired', 'canceled', 'inTrip'],
  expired: [],
  canceled: [],
  inTrip: []
};

type RidePostWriteData = WithFieldValue<Omit<RidePostDocument, 'createdAt' | 'updatedAt'>> & {
  createdAt: ReturnType<typeof serverTimestamp>;
  updatedAt: ReturnType<typeof serverTimestamp>;
};

type RidePostUpdateData = PartialWithFieldValue<Omit<RidePostDocument, 'createdAt'>> & {
  updatedAt: ReturnType<typeof serverTimestamp>;
};

const LATITUDE_MIN = -90;
const LATITUDE_MAX = 90;
const LONGITUDE_MIN = -180;
const LONGITUDE_MAX = 180;

const validateLatLng = (lat: number | null, lng: number | null, precision: RidePostOrigin['precision']) => {
  if (precision === 'approximate') {
    if (lat === null || lng === null) {
      return;
    }
  }

  if (lat === null || lng === null) {
    throw new Error('Origin coordinates required for precise locations');
  }

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error('Origin coordinates must be valid numbers');
  }
  if (lat < LATITUDE_MIN || lat > LATITUDE_MAX) {
    throw new Error('Latitude out of bounds');
  }
  if (lng < LONGITUDE_MIN || lng > LONGITUDE_MAX) {
    throw new Error('Longitude out of bounds');
  }
};

const validateTimeWindow = (windowStart: Timestamp, windowEnd: Timestamp) => {
  if (windowEnd.toMillis() <= windowStart.toMillis()) {
    throw new Error('windowEnd must be after windowStart');
  }
};

const validateSeats = (seatsTotal: number, seatsAvailable: number) => {
  if (!Number.isInteger(seatsTotal) || seatsTotal <= 0) {
    throw new Error('seatsTotal must be a positive integer');
  }
  if (!Number.isInteger(seatsAvailable) || seatsAvailable < 0) {
    throw new Error('seatsAvailable must be a non-negative integer');
  }
  if (seatsAvailable > seatsTotal) {
    throw new Error('seatsAvailable cannot exceed seatsTotal');
  }
};

export const getRidePostsCollection = (db: Firestore = getFirestoreDb()): CollectionReference<RidePostDocument> =>
  collection(db, 'ridePosts') as CollectionReference<RidePostDocument>;

export const getRidePostDoc = (
  id: string,
  db: Firestore = getFirestoreDb()
): DocumentReference<RidePostDocument> => doc(getRidePostsCollection(db), id);

export const buildRidePostCreateData = ({
  driverId,
  origin,
  destinationCampus,
  seatsTotal,
  windowStart,
  windowEnd,
  seatsAvailable,
  driverReliability: inputDriverReliability,
  driverRating: inputDriverRating
}: RidePostCreateInput): RidePostWriteData => {
  if (!driverId) {
    throw new Error('driverId is required');
  }
  if (!destinationCampus) {
    throw new Error('destinationCampus is required');
  }
  if (!origin?.label) {
    throw new Error('origin.label is required');
  }

  validateLatLng(origin.lat, origin.lng, origin.precision);
  validateTimeWindow(windowStart, windowEnd);

  const totalSeats = seatsTotal;
  const availableSeats = seatsAvailable ?? seatsTotal;
  validateSeats(totalSeats, availableSeats);

  const GEOHASH_PRECISION = 7; // 6–8 per requirements; 7 is a balanced default
  const geohash = origin.lat !== null && origin.lng !== null ? ngeohash.encode(origin.lat, origin.lng, GEOHASH_PRECISION) : 'manual';

  // optional quality metrics validation (soft constraints)
  const driverReliability = typeof inputDriverReliability === 'number' ? Math.max(0, Math.min(1, inputDriverReliability)) : undefined;
  const driverRating = typeof inputDriverRating === 'number' ? Math.max(0, Math.min(5, inputDriverRating)) : undefined;

  const base: RidePostWriteData = {
    driverId,
    origin: {
      lat: origin.lat,
      lng: origin.lng,
      label: origin.label,
      geohash,
      precision: origin.precision
    },
    destinationCampus,
    seatsTotal: totalSeats,
    seatsAvailable: availableSeats,
    windowStart,
    windowEnd,
    geohash,
    status: 'open',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (driverReliability !== undefined) base.driverReliability = driverReliability;
  if (driverRating !== undefined) base.driverRating = driverRating;
  if (origin.lat !== null && origin.lng !== null) base.originGeoPoint = new GeoPoint(origin.lat, origin.lng);
  return base;
};

export const buildRidePostStatusUpdate = ({
  currentStatus,
  nextStatus
}: RidePostStatusUpdateInput): RidePostUpdateData => {
  if (!RIDE_POST_STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
    throw new Error(`Invalid status transition from ${currentStatus} to ${nextStatus}`);
  }

  return {
    status: nextStatus,
    updatedAt: serverTimestamp()
  };
};

export const buildRidePostSeatUpdate = (
  seatsAvailable: number,
  seatsTotal: number
): RidePostUpdateData => {
  validateSeats(seatsTotal, seatsAvailable);
  return {
    seatsAvailable,
    seatsTotal,
    updatedAt: serverTimestamp()
  };
};
