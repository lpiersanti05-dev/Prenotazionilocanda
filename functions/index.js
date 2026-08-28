const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

/**
 * Invia un push a tutti i token registrati e rimuove dal database
 * quelli non più validi (app disinstallata, permesso revocato, ecc.).
 */
async function pushToAllDevices(title, body, tag, type, table) {

    const tokensSnap = await db.collection("fcm_tokens").get();

    // Ogni documento è chiavato per deviceId stabile; il token FCM vero
    // sta nel campo "token" (compatibilità: se un vecchio documento non
    // avesse il campo, usiamo l'ID stesso come fallback).
    const allDevices = tokensSnap.docs
        .map((d) => ({ docId: d.id, token: d.data().token || d.id, updatedAt: d.data().updatedAt }))
        .filter((d) => !!d.token);

    if (allDevices.length === 0) {
        console.log("Nessun dispositivo registrato per le notifiche.");
        return;
    }

    // Deduplica per TOKEN (non per docId): se lo stesso token FCM è salvato
    // sotto più deviceId diversi (es. dopo un reset di localStorage che ha
    // rigenerato il deviceId ma non il token), inviare a entrambi i documenti
    // manderebbe due notifiche identiche allo stesso telefono. Teniamo solo
    // il documento più recente per ciascun token e segnamo gli altri da eliminare.
    const byToken = new Map();
    const staleDocIds = [];

    allDevices.forEach((d) => {
        const existing = byToken.get(d.token);
        if (!existing) {
            byToken.set(d.token, d);
        } else {
            const existingTime = existing.updatedAt && existing.updatedAt.seconds ? existing.updatedAt.seconds : 0;
            const currentTime = d.updatedAt && d.updatedAt.seconds ? d.updatedAt.seconds : 0;
            if (currentTime > existingTime) {
                staleDocIds.push(existing.docId);
                byToken.set(d.token, d);
            } else {
                staleDocIds.push(d.docId);
            }
        }
    });

    if (staleDocIds.length > 0) {
        await Promise.all(
            staleDocIds.map((id) => db.collection("fcm_tokens").doc(id).delete())
        );
        console.log(`Rimossi ${staleDocIds.length} documenti duplicati (stesso token).`);
    }

    const devices = Array.from(byToken.values());
    const tokens = devices.map((d) => d.token);

    const message = {
        // SOLO "data", niente campo "notification": se il payload FCM
        // contiene un campo "notification", il browser può mostrare una
        // notifica automaticamente per conto proprio, in aggiunta a quella
        // che mostriamo esplicitamente noi nel Service Worker — causando
        // un doppione che i nostri log non possono vedere, perché avviene
        // prima e fuori dal nostro codice. Con solo "data", l'unica
        // notifica visualizzata è quella che generiamo noi manualmente.
        data: {
            title: String(title || ""),
            body: String(body || ""),
            tag: String(tag || ""),
            type: String(type || ""),
            table: String(table || "")
        },
        tokens
    };

    const response = await messaging.sendEachForMulticast(message);

    const invalidDocIds = [];
    response.responses.forEach((r, idx) => {
        if (!r.success) {
            const code = r.error && r.error.code;
            if (
                code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-registration-token"
            ) {
                invalidDocIds.push(devices[idx].docId);
            }
        }
    });

    if (invalidDocIds.length > 0) {
        await Promise.all(
            invalidDocIds.map((id) => db.collection("fcm_tokens").doc(id).delete())
        );
        console.log(`Rimossi ${invalidDocIds.length} dispositivi non più validi.`);
    }

    console.log(`Push inviato a ${tokens.length - invalidDocIds.length} dispositivi: ${title}`);
}

function buildArrivedMessage(booking) {
    return {
        title: "🪑 Tavolo Arrivato",
        body: `Tavolo ${booking.table} - ${booking.name || "Cliente"} (${booking.people || 0} persone)`,
        tag: `arrived-${booking.table}-${booking.date}`,
        type: "arrived"
    };
}

function buildReadyMessage(booking) {
    return {
        title: "🛎️ Pronto per Ordinare",
        body: `Tavolo ${booking.table} - ${booking.name || "Cliente"} è pronto per ordinare!`,
        tag: `ready-${booking.table}-${booking.date}`,
        type: "ready"
    };
}

// Caso 1: prenotazione esistente che viene aggiornata
// (es. tasto "Segnala come arrivato" o "Avvisa" pronto ordinare).
exports.onBookingUpdate = onDocumentUpdated("bookings/{bookingId}", async (event) => {

    const before = event.data.before.data();
    const after = event.data.after.data();

    if (!before || !after) return;

    const becameArrived = after.arrived && !before.arrived;
    const becameReady = after.readyToOrder && !before.readyToOrder;

    if (becameArrived) {
        const m = buildArrivedMessage(after);
        await pushToAllDevices(m.title, m.body, m.tag, m.type, after.table);
    }

    if (becameReady) {
        const m = buildReadyMessage(after);
        await pushToAllDevices(m.title, m.body, m.tag, m.type, after.table);
    }

});

// Caso 2: walk-in appena creato, che nasce già con arrived = true
// (il tavolo non prenotato entra ed è "arrivato" fin da subito).
exports.onBookingCreate = onDocumentCreated("bookings/{bookingId}", async (event) => {

    const data = event.data.data();

    if (!data || !data.arrived) return;

    const m = buildArrivedMessage(data);
    await pushToAllDevices(m.title, m.body, m.tag, m.type, data.table);

});
