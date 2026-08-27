const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

async function pushToAllDevices(title, body, tag, type, table) {

    const tokensSnap = await db.collection("fcm_tokens").get();
    const tokens = tokensSnap.docs.map((d) => d.id).filter(Boolean);

    if (tokens.length === 0) {
        console.log("Nessun dispositivo registrato per le notifiche.");
        return;
    }

    const message = {
        notification: { title, body },
        data: {
            tag: String(tag || ""),
            type: String(type || ""),
            table: String(table || "")
        },
        tokens
    };

    const response = await messaging.sendEachForMulticast(message);

    const invalidTokens = [];
    response.responses.forEach((r, idx) => {
        if (!r.success) {
            const code = r.error && r.error.code;
            if (
                code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-registration-token"
            ) {
                invalidTokens.push(tokens[idx]);
            }
        }
    });

    if (invalidTokens.length > 0) {
        await Promise.all(
            invalidTokens.map((t) => db.collection("fcm_tokens").doc(t).delete())
        );
        console.log(`Rimossi ${invalidTokens.length} token non più validi.`);
    }

    console.log(`Push inviato a ${tokens.length - invalidTokens.length} dispositivi: ${title}`);
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

exports.onBookingCreate = onDocumentCreated("bookings/{bookingId}", async (event) => {

    const data = event.data.data();

    if (!data || !data.arrived) return;

    const m = buildArrivedMessage(data);
    await pushToAllDevices(m.title, m.body, m.tag, m.type, data.table);

});
