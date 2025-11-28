import { collection, getDocs, query, where, Firestore, doc, getDoc } from '@firebase/firestore';
import { getFirestoreDb } from '../../../services/firebase';

export type SearchOpenRidesParams = {
  destinationCampus?: string;
  minDriverRating?: number;
  db?: Firestore;
};

export const searchOpenRides = async ({ destinationCampus, minDriverRating = 0, db = getFirestoreDb() }: SearchOpenRidesParams) => {
  const postsCol = collection(db, 'ridePosts');
  const q = destinationCampus ? query(postsCol, where('status', '==', 'open'), where('destinationCampus', '==', destinationCampus)) : query(postsCol, where('status', '==', 'open'));
  const snap = await getDocs(q);
  const results: any[] = [];
  for (const d of snap.docs) {
    const post = d.data() as any;
    const driverRef = doc(db, 'users', post.driverId ?? '');
    const driver = await getDoc(driverRef);
    const rating = driver.exists() ? Number(driver.data()?.rating ?? 0) : 0;
    if (rating >= minDriverRating) {
      results.push({ id: d.id, ...post, driverRating: rating });
    }
  }
  return results;
};

