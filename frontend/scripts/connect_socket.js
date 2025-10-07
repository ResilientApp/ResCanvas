// Dev helper moved from src/connect_socket.js
const io = require('socket.io-client');
const token = process.argv[2];
const roomId = process.argv[3]; // optional
if (!token) { console.error('Usage: node scripts/connect_socket.js <TOKEN> [ROOM_ID]'); process.exit(1); }

const { API_BASE } = require('../src/config/apiConfig');

const socket = io(API_BASE, { auth: { token } });

socket.on('connect', () => {
  console.log('socket connected', socket.id);
  if (roomId) {
    console.log('Joining room', roomId);
    socket.emit('join_room', { roomId });
  }
});

socket.on('notification', (n) => {
  console.log('NOTIFICATION:', n);
});

socket.on('stroke', (s) => {
  console.log('STROKE:', JSON.stringify(s).slice(0, 400));
});

socket.on('disconnect', () => console.log('disconnected'));
