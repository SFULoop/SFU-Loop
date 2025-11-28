import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { getFirestore } from '@firebase/firestore';
import { getFirestoreDb } from '../../../services/firebase';
import { acceptRequest, declineRequest } from '../api/requests';
import { collection, onSnapshot, query, where, getDoc, doc } from '@firebase/firestore';
import { useDriverStateStore } from '../../../store/useDriverStateStore';

type PendingItem = {
  id: string;
  riderId: string;
  postId: string;
  pickupLabel: string;
};

const DriverConsoleScreen = () => {
  const { driverId } = useDriverStateStore();
  const [items, setItems] = useState<PendingItem[]>([]);
  const db = getFirestoreDb();

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'rideRequests'), where('status', '==', 'pending')),
      async (snap) => {
        const list: PendingItem[] = [];
        for (const docSnap of snap.docs) {
          const data = docSnap.data() as any;
          // filter to driver's posts
          const postSnap = await getDoc(doc(db, 'ridePosts', data.postId));
          if (postSnap.exists() && postSnap.data()?.driverId === driverId) {
            list.push({
              id: docSnap.id,
              riderId: data.riderId,
              postId: data.postId,
              pickupLabel: data.pickup?.label ?? 'Pickup'
            });
          }
        }
        setItems(list);
      }
    );
    return () => unsub();
  }, [db, driverId]);

  const handleAccept = async (id: string) => {
    try {
      await acceptRequest(id, { db });
      Alert.alert('Booking confirmed');
    } catch (e) {
      Alert.alert('Failed to accept');
    }
  };

  const handleDecline = async (id: string) => {
    try {
      await declineRequest(id, { db });
      Alert.alert('Request declined');
    } catch (e) {
      Alert.alert('Failed to decline');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Driver Console</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>No pending requests</Text>
      ) : (
        items.map((it) => (
          <View key={it.id} style={styles.card}>
            <Text style={styles.cardTitle}>Rider: {it.riderId}</Text>
            <Text style={styles.cardMeta}>Pickup: {it.pickupLabel}</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.accept} onPress={() => handleAccept(it.id)}>
                <Text style={styles.btnText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.decline} onPress={() => handleDecline(it.id)}>
                <Text style={styles.btnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  empty: { color: '#6B7280' },
  card: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginBottom: 12 },
  cardTitle: { fontWeight: '700' },
  cardMeta: { color: '#6B7280', marginTop: 4 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  accept: { backgroundColor: '#16A34A', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  decline: { backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#FFFFFF', fontWeight: '600' }
});

export default DriverConsoleScreen;

