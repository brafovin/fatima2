/**
 * OmeTV — random video chat signaling server.
 *
 * Pairs strangers two at a time and relays WebRTC signaling (offer/answer/ICE)
 * plus text-chat messages between the two peers in a room. The actual audio/video
 * stream is peer-to-peer; this server only brokers the connection.
 */

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Sockets waiting to be matched with a partner.
let waitingQueue = [];
// socket.id -> partner socket.id
const partners = new Map();

function onlineCount() {
  return io.of('/').sockets.size;
}

function broadcastStats() {
  io.emit('stats', {
    online: onlineCount(),
    waiting: waitingQueue.length,
  });
}

// Tell every still-waiting socket its 1-based position in the queue and the
// total number of people waiting, so the UI can show "Du bist 2 von 5".
function broadcastQueuePositions() {
  const total = waitingQueue.length;
  waitingQueue.forEach((s, index) => {
    s.emit('queue', { position: index + 1, total });
  });
}

// Try to pair a socket with the first compatible waiting peer.
function tryMatch(socket) {
  // Drop any stale/disconnected sockets from the queue.
  waitingQueue = waitingQueue.filter(
    (s) => s.connected && s.id !== socket.id && !partners.has(s.id)
  );

  const partner = waitingQueue.shift();

  if (partner) {
    partners.set(socket.id, partner.id);
    partners.set(partner.id, socket.id);

    const room = `${socket.id}#${partner.id}`;
    socket.join(room);
    partner.join(room);
    socket.data.room = room;
    partner.data.room = room;

    // The partner who was already waiting initiates the WebRTC offer.
    partner.emit('matched', { room, initiator: true });
    socket.emit('matched', { room, initiator: false });
  } else {
    waitingQueue.push(socket);
    socket.emit('waiting');
  }

  broadcastStats();
  broadcastQueuePositions();
}

// Tear down the current pairing and notify the partner so they can re-queue.
function leavePartner(socket, { notify = true } = {}) {
  const partnerId = partners.get(socket.id);
  if (!partnerId) {
    // Maybe just sitting in the waiting queue.
    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    return;
  }

  partners.delete(socket.id);
  partners.delete(partnerId);

  const room = socket.data.room;
  if (room) {
    socket.leave(room);
    socket.data.room = null;
  }

  const partner = io.sockets.sockets.get(partnerId);
  if (partner) {
    partner.data.room = null;
    partner.leave(room);
    if (notify) partner.emit('partner-left');
  }
}

io.on('connection', (socket) => {
  broadcastStats();

  // Client is ready and asking to be matched.
  socket.on('find', () => {
    leavePartner(socket, { notify: true });
    tryMatch(socket);
  });

  // "Next": leave current partner and immediately look for a new one.
  socket.on('next', () => {
    leavePartner(socket, { notify: true });
    tryMatch(socket);
  });

  // Stop searching / hang up without looking for a new partner.
  socket.on('stop', () => {
    leavePartner(socket, { notify: true });
    broadcastStats();
    broadcastQueuePositions();
  });

  // Relay WebRTC signaling to the current partner only.
  socket.on('signal', (data) => {
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('signal', data);
    }
  });

  // Relay text-chat messages to the current partner only.
  socket.on('chat', (message) => {
    const partnerId = partners.get(socket.id);
    if (partnerId && typeof message === 'string') {
      io.to(partnerId).emit('chat', message.slice(0, 2000));
    }
  });

  // Typing indicator.
  socket.on('typing', (isTyping) => {
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('typing', !!isTyping);
    }
  });

  socket.on('disconnect', () => {
    leavePartner(socket, { notify: true });
    broadcastStats();
    broadcastQueuePositions();
  });
});

server.listen(PORT, () => {
  console.log(`OmeTV signaling server running on http://localhost:${PORT}`);
});
