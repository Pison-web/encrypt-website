// firebase-messaging-sw.js
importScripts("https://www.gstatic.com/firebasejs/12.3.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.3.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBNp0PBVgtczW5HXK7MbfivIPSgk6w5LqE",
  authDomain: "encrypt-website-b1067.firebaseapp.com",
  projectId: "encrypt-website-b1067",
  storageBucket: "encrypt-website-b1067.firebasestorage.app",
  messagingSenderId: "1035092157297",
  appId: "1:1035092157297:web:ff2b186b957ded99ba0cd0"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("Background message received:", payload);
  const title = payload.notification?.title || "New Encrypt Message 💬";
  const options = {
    body: payload.notification?.body || "You’ve received a new anonymous message.",
    icon: "icon.png"
  };
  self.registration.showNotification(title, options);
});
