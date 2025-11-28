import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, where, Firestore } from '@firebase/firestore';
import { getFirestoreDb } from '../../../services/firebase';

export const cancelRidePostWithNotify = async (postId: string, { db = getFirestoreDb() }: { db?: Firestore } = {}) => {
  const postRef = doc(db, 'ridePosts', postId);
  await runTransaction(db, async (tx) => {
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists()) return;
    const post = postSnap.data() as any;
    if (post.status === 'canceled') return;
    tx.update(postRef, { status: 'canceled', updatedAt: serverTimestamp() });
    // notify driver (self) about cancel
    try {
      const notifRef = doc(collection(db, 'notifications'));
      tx.set(notifRef, { userId: post.driverId, type: 'post_canceled', data: { postId }, createdAt: serverTimestamp() } as any);
    } catch {}
  });

  // best-effort notify riders with pending/booked
  const pendingQ = query(collection(db, 'rideRequests'), where('postId', '==', postId));
  const snap = await getDocs(pendingQ);
  for (const d of snap.docs) {
    const req = d.data() as any;
    const notifRef = doc(collection(db, 'notifications'));
    await setDoc(notifRef, { userId: req.riderId, type: 'post_canceled', data: { postId, requestId: d.id }, createdAt: serverTimestamp() } as any);
  }
};

