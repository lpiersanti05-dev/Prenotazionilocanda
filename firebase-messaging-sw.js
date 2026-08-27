importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyAwGEErUuII0YGO9b59xmhfpog_52a26MI",
    projectId: "prenotazionilocanda-7808c",
    messagingSenderId: "407224446329",
    appId: "1:407224446329:web:e213fbaf5aaef702af53a8"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: 'image.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});
