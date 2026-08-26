const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendTableNotification = functions.firestore
  .document("bookings/{bookingId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    let title = "";
    let body = "";

    // Notifica Tavolo Arrivato
    if (after.arrived && !before.arrived) {
      title = "📍 Tavolo Arrivato!";
      body = `Tavolo ${after.table} (${after.name || "Cliente"}) è arrivato in sala!`;
    } 
    // Notifica Pronto per Ordinare
    else if (after.readyToOrder && !before.readyToOrder) {
      title = "🛎️ Pronto per Ordinare!";
      body = `Tavolo ${after.table} (${after.name || "Cliente"}) vuole ordinare!`;
    } 
    // Notifica Priorità Assegnata
    else if (after.priority && !before.priority) {
      title = "⭐ Priorità Alta!";
      body = `Tavolo ${after.table} (${after.name || "Cliente"}) ha priorità in cucina/sala!`;
    } 
    else {
      return null;
    }

    // Recupera tutti i token FCM registrati nell'app
    const tokensSnapshot = await admin.firestore().collection("fcmTokens").get();
    const tokens = tokensSnapshot.docs.map((doc) => doc.id);

    if (tokens.length === 0) {
      console.log("Nessun dispositivo registrato per le notifiche.");
      return null;
    }

    const payload = {
      notification: {
        title: title,
        body: body,
      },
      tokens: tokens,
    };

    try {
      const response = await admin.messaging().sendMulticast(payload);
      console.log("Notifiche inviate con successo:", response.successCount);
      return response;
    } catch (error) {
      console.error("Errore invio notifica push:", error);
      return null;
    }
  });
