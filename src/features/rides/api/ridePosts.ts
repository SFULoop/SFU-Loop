import {
  addDoc,
  doc,
  onSnapshot,
  Timestamp,
  Firestore
} from '@firebase/firestore';
import { FirebaseError } from '@firebase/app';
import { getRidePostsCollection, buildRidePostCreateData, RidePostStatus } from '../../../services/firestore/ridePosts';
import { getFirestoreDb } from '../../../services/firebase';
import type { PostRideSubmitPayload, DestinationCampus, OriginPrecision } from '../types/postRide';

export type RidePostClientSnapshot = {
  postId: string;
  status: RidePostStatus;
  seatsAvailable: number;
  seatsTotal: number;
  destinationCampus: DestinationCampus;
  windowStart: Date;
  windowEnd: Date;
  originLabel: string;
  originPrecision: OriginPrecision;
};

export type CreateRidePostParams = {
  driverId: string;
  payload: PostRideSubmitPayload;
  db?: Firestore;
  now?: () => number;
};

export type CreateRidePostResult = {
  postId: string;
  snapshot: RidePostClientSnapshot;
};

export type CreateRidePostFn = (params: CreateRidePostParams) => Promise<CreateRidePostResult>;

const toMillis = (value: number) => value * 60_000;

export const createRidePost: CreateRidePostFn = async ({
  driverId,
  payload,
  db = getFirestoreDb(),
  now = Date.now
}) => {
  const baseTime = now();
  const windowStart = Timestamp.fromMillis(baseTime + toMillis(payload.departureOffsetMinutes));
  const windowEnd = Timestamp.fromMillis(windowStart.toMillis() + toMillis(payload.windowDurationMinutes));

  const docRef = await addDoc(
    getRidePostsCollection(db),
    buildRidePostCreateData({
      driverId,
      origin: {
        lat: payload.origin.latitude,
        lng: payload.origin.longitude,
        label: payload.origin.label,
        precision: payload.origin.precision
      },
      destinationCampus: payload.destinationCampus,
      seatsTotal: payload.seats,
      windowStart,
      windowEnd,
      seatsAvailable: payload.seats
    })
  );

  return {
    postId: docRef.id,
    snapshot: {
      postId: docRef.id,
      status: 'open',
      seatsAvailable: payload.seats,
      seatsTotal: payload.seats,
      destinationCampus: payload.destinationCampus,
      windowStart: new Date(windowStart.toMillis()),
      windowEnd: new Date(windowEnd.toMillis()),
      originLabel: payload.origin.label,
      originPrecision: payload.origin.precision
    }
  };
};

export type SubscribeToRidePostParams = {
  postId: string;
  onSnapshot: (snapshot: RidePostClientSnapshot) => void;
  onError: (error: unknown) => void;
  db?: Firestore;
};

export type SubscribeToRidePostFn = (params: SubscribeToRidePostParams) => () => void;

const mapSnapshot = (postId: string, data: any): RidePostClientSnapshot => ({
  postId,
  status: data.status,
  seatsAvailable: data.seatsAvailable,
  seatsTotal: data.seatsTotal,
  destinationCampus: data.destinationCampus,
  windowStart: data.windowStart instanceof Timestamp ? new Date(data.windowStart.toMillis()) : new Date(),
  windowEnd: data.windowEnd instanceof Timestamp ? new Date(data.windowEnd.toMillis()) : new Date(),
  originLabel: data.origin?.label ?? 'Unknown origin',
  originPrecision: data.origin?.precision ?? 'approximate'
});

export const subscribeToRidePost: SubscribeToRidePostFn = ({
  postId,
  onSnapshot: handleSnapshot,
  onError,
  db = getFirestoreDb()
}) => {
  const docRef = doc(getRidePostsCollection(db), postId);
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        return;
      }
      const data = snapshot.data();
      handleSnapshot(mapSnapshot(snapshot.id, data));
    },
    (error) => {
      onError?.(error);
    }
  );
};

export const mapFirebaseError = (error: unknown): FirebaseError | null => {
  if (error instanceof FirebaseError) {
    return error;
  }
  return null;
};
