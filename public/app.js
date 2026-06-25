/* OmeTV client — handles camera capture, matchmaking signaling and WebRTC. */

const socket = io();

// --- DOM ---
const remoteVideo = document.getElementById('remote-video');
const localVideo = document.getElementById('local-video');
const overlay = document.getElementById('remote-overlay');
const statusText = document.getElementById('status-text');
const onlineCount = document.getElementById('online-count');
const typingIndicator = document.getElementById('typing-indicator');

const queueBadge = document.getElementById('queue-badge');
const queuePos = document.getElementById('queue-pos');
const queueTotal = document.getElementById('queue-total');

const messagesEl = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

const btnStart = document.getElementById('btn-start');
const btnNext = document.getElementById('btn-next');
const btnStop = document.getElementById('btn-stop');
const btnCam = document.getElementById('btn-cam');
const btnMic = document.getElementById('btn-mic');

// --- State ---
let localStream = null;
let pc = null; // RTCPeerConnection
let isInCall = false;
let isSearching = false;
let typingTimeout = null;

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// --- Helpers ---
function setStatus(text) {
  statusText.textContent = text;
}

function showOverlay(show) {
  overlay.classList.toggle('hidden', !show);
}

function showQueue(show) {
  queueBadge.classList.toggle('hidden', !show);
}

function addMessage(text, type) {
  const el = document.createElement('div');
  el.className = `msg ${type}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function clearMessages() {
  messagesEl.innerHTML = '';
}

function setChatEnabled(enabled) {
  chatInput.disabled = !enabled;
  chatForm.querySelector('button').disabled = !enabled;
}

function showCallControls(inCall) {
  btnStart.classList.toggle('hidden', inCall || isSearching);
  btnNext.classList.toggle('hidden', !inCall && !isSearching);
  btnStop.classList.toggle('hidden', !inCall && !isSearching);
}

// --- Media ---
async function ensureLocalStream() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;
    return localStream;
  } catch (err) {
    setStatus('Kamera/Mikrofon-Zugriff verweigert. Bitte erlauben und neu laden.');
    throw err;
  }
}

// --- WebRTC ---
function createPeerConnection() {
  pc = new RTCPeerConnection(ICE_CONFIG);

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    showOverlay(false);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { type: 'candidate', candidate: event.candidate });
    }
  };

  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      // Connection broke; underlying partner-left will usually fire too.
    }
  };

  return pc;
}

function closePeerConnection() {
  if (pc) {
    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.close();
    pc = null;
  }
  remoteVideo.srcObject = null;
}

async function startCall(initiator) {
  createPeerConnection();
  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { type: 'offer', sdp: offer });
  }
}

// --- Matchmaking flow ---
async function find() {
  await ensureLocalStream();
  isSearching = true;
  isInCall = false;
  clearMessages();
  setChatEnabled(false);
  showOverlay(true);
  showQueue(false);
  setStatus('Suche nach einem Fremden …');
  showCallControls(false);
  socket.emit('find');
}

function stop() {
  socket.emit('stop');
  isSearching = false;
  isInCall = false;
  closePeerConnection();
  setChatEnabled(false);
  showOverlay(true);
  showQueue(false);
  setStatus('Gestoppt. Klicke auf „Start", um wieder zu starten.');
  btnStart.classList.remove('hidden');
  btnNext.classList.add('hidden');
  btnStop.classList.add('hidden');
}

function next() {
  closePeerConnection();
  find();
}

// --- Button wiring ---
function toggleCam() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  btnCam.classList.toggle('off', !track.enabled);
}

function toggleMic() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  btnMic.classList.toggle('off', !track.enabled);
}

btnStart.addEventListener('click', () => find());
btnNext.addEventListener('click', () => next());
btnStop.addEventListener('click', () => stop());
btnCam.addEventListener('click', toggleCam);
btnMic.addEventListener('click', toggleMic);

// --- Keyboard controls ---
// Enter   → Start / Weiter (kontextabhängig)
// Esc     → Weiter (nächster Fremder)
// X       → Stop
// C / M   → Kamera / Mikro umschalten
document.addEventListener('keydown', (e) => {
  // Im Chat-Feld nur Enter zum Senden zulassen, keine globalen Shortcuts.
  if (document.activeElement === chatInput) {
    if (e.key === 'Escape') chatInput.blur();
    return;
  }

  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      if (isInCall || isSearching) next();
      else find();
      break;
    case 'Escape':
      if (isInCall || isSearching) {
        e.preventDefault();
        next();
      }
      break;
    case 'x':
    case 'X':
      if (isInCall || isSearching) {
        e.preventDefault();
        stop();
      }
      break;
    case 'c':
    case 'C':
      toggleCam();
      break;
    case 'm':
    case 'M':
      toggleMic();
      break;
    default:
      break;
  }
});

// --- Chat ---
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !isInCall) return;
  socket.emit('chat', text);
  addMessage(text, 'me');
  chatInput.value = '';
  socket.emit('typing', false);
});

chatInput.addEventListener('input', () => {
  if (!isInCall) return;
  socket.emit('typing', true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit('typing', false), 1200);
});

// --- Socket events ---
socket.on('stats', (data) => {
  onlineCount.textContent = data.online;
});

socket.on('waiting', () => {
  isSearching = true;
  setStatus('Warte auf einen freien Partner …');
});

socket.on('queue', ({ position, total }) => {
  if (!isSearching) return;
  queuePos.textContent = position;
  queueTotal.textContent = total;
  showQueue(true);
  setStatus(
    total <= 1
      ? 'Du bist allein in der Warteschlange – warte auf jemanden …'
      : 'Warte auf einen freien Partner …'
  );
});

socket.on('matched', async ({ initiator }) => {
  isSearching = false;
  isInCall = true;
  showCallControls(true);
  setChatEnabled(true);
  showOverlay(true);
  showQueue(false);
  setStatus('Verbinde …');
  addMessage('Du bist jetzt mit einem Fremden verbunden. Sag Hallo!', 'system');
  try {
    await startCall(initiator);
  } catch (err) {
    console.error('startCall failed', err);
  }
});

socket.on('signal', async (data) => {
  if (!pc) return;
  try {
    if (data.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { type: 'answer', sdp: answer });
    } else if (data.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === 'candidate' && data.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  } catch (err) {
    console.error('signal handling error', err);
  }
});

socket.on('chat', (message) => {
  addMessage(message, 'them');
});

socket.on('typing', (isTyping) => {
  typingIndicator.classList.toggle('hidden', !isTyping);
});

socket.on('partner-left', () => {
  addMessage('Der Fremde hat den Chat verlassen.', 'system');
  typingIndicator.classList.add('hidden');
  closePeerConnection();
  if (isInCall || isSearching) {
    // Auto re-queue for a fresh partner.
    isInCall = false;
    showOverlay(true);
    setStatus('Partner getrennt. Suche neuen Fremden …');
    setChatEnabled(false);
    socket.emit('find');
    isSearching = true;
  }
});

socket.on('disconnect', () => {
  setStatus('Verbindung zum Server verloren. Bitte Seite neu laden.');
  closePeerConnection();
  isInCall = false;
  isSearching = false;
});
