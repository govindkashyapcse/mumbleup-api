const { v4: uuidv4 } = require("uuid");

// Adjective + noun combos for anonymous handles
const ADJECTIVES = [
  "silent", "hollow", "ashen", "void", "neon", "static", "phantom",
  "feral", "masked", "cryptic", "drifting", "wired", "burned", "raw",
  "blurred", "distant", "unnamed", "broken", "stray", "lost"
];

const NOUNS = [
  "signal", "ghost", "wire", "node", "echo", "cipher", "pulse",
  "static", "wave", "trace", "shadow", "byte", "flux", "glitch",
  "vector", "shard", "drift", "null", "void", "mask"
];

// In-memory session store (TTL managed manually)
const sessions = new Map(); // sessionId -> { handle, connectedAt, lastSeen }
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function generateHandle() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const suffix = Math.floor(Math.random() * 900) + 100; // 100-999
  return `${adj}_${noun}_${suffix}`;
}

function createSession() {
  const sessionId = uuidv4();
  const handle = generateHandle();
  const now = Date.now();

  sessions.set(sessionId, {
    handle,
    connectedAt: now,
    lastSeen: now,
  });

  return { sessionId, handle };
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  // Refresh lastSeen
  session.lastSeen = Date.now();
  return session;
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

function getActiveCount() {
  return sessions.size;
}

// Prune expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  let pruned = 0;
  for (const [id, session] of sessions) {
    if (now - session.lastSeen > SESSION_TTL_MS) {
      sessions.delete(id);
      pruned++;
    }
  }
  if (pruned > 0) console.log(`[Sessions] Pruned ${pruned} expired sessions`);
}, 5 * 60 * 1000);

module.exports = { createSession, getSession, deleteSession, getActiveCount };
