const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.notifyNewBooking = functions.firestore
    .document('bookings/{bookingId}')
    .onCreate(async (snap, context) => {
        const newBooking = snap.data();
        
        // Creiamo la notifica chad
        const payload = {
            notification: {
                title: `🪑 Nuovo Tavolo: ${newBooking.table}`,
                body: `${newBooking.name} (${newBooking.people} pax) - Orario: ${newBooking.time}`
            }
        };

        // Andiamo a pescare tutti i token VIP dei camerieri
        const tokensSnap = await admin.firestore().collection('fcm_tokens').get();
        const tokens = tokensSnap.docs.map(doc => doc.id);

        if (tokens.length === 0) {
            console.log("Nessun cameriere registrato, non invio niente.");
            return null;
        }

        // Spariamo la notifica a tutti
        const response = await admin.messaging().sendEachForMulticast({
            tokens: tokens,
            notification: payload.notification
        });

        console.log(`Notifiche inviate: ${response.successCount} andate a buon fine, ${response.failureCount} fallite.`);
        return null;
    });
