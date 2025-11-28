import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { collection, onSnapshot, query, where } from '@firebase/firestore';
import { getFirestoreDb } from '../../../services/firebase';
import { cancelRequest, cancelBooking } from '../api/requests';
import { useDriverStateStore } from '../../../store/useDriverStateStore';

const MyRidesScreen = () => {
  const db = getFirestoreDb();
  const riderId = 'rider-demo';
  const [requests, setRequests] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);

  useEffect(() => {
    const unsub1 = onSnapshot(
      query(collection(db, 'rideRequests'), where('riderId', '==', riderId)),
      (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsub2 = onSnapshot(
      query(collection(db, 'bookings'), where('riderId', '==', riderId)),
      (snap) => setBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [db]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>My Rides</Text>
      <Text style={styles.section}>Requests</Text>
      {requests.map((r) => (
        <View key={r.id} style={styles.card}>
          <Text>Status: {r.status}</Text>
          <Text>Campus: {r.destinationCampus}</Text>
          {r.status === 'pending' && (
            <TouchableOpacity
              style={styles.cancel}
              onPress={async () => {
                await cancelRequest(r.id, { db });
                Alert.alert('Request canceled');
              }}
            >
              <Text style={styles.btnText}>Cancel Request</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      <Text style={styles.section}>Bookings</Text>
      {bookings.map((b) => (
        <View key={b.id} style={styles.card}>
          <Text>Status: {b.status}</Text>
          <Text>Post: {b.postId}</Text>
          {b.status === 'confirmed' && (
            <TouchableOpacity
              style={styles.cancel}
              onPress={async () => {
                await cancelBooking(b.id, { db });
                Alert.alert('Booking canceled');
              }}
            >
              <Text style={styles.btnText}>Cancel Booking</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  section: { marginTop: 16, fontWeight: '700' },
  card: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, marginTop: 8 },
  cancel: { backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 8, marginTop: 8, borderRadius: 8 },
  btnText: { color: '#FFF', fontWeight: '600' }
});

export default MyRidesScreen;
