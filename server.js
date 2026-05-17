const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

const ROOM_LAYOUT = [
  { id: 'lobby', name: 'Lobby', x: 1, y: 1, neighbors: ['triage', 'ward-a', 'meeting'] },
  { id: 'triage', name: 'Triage', x: 1, y: 0, neighbors: ['lobby', 'pharmacy', 'laboratory'] },
  { id: 'ward-a', name: 'Ward A', x: 0, y: 1, neighbors: ['lobby', 'ward-b', 'storage'] },
  { id: 'ward-b', name: 'Ward B', x: 0, y: 2, neighbors: ['ward-a', 'isolation', 'meeting'] },
  { id: 'pharmacy', name: 'Pharmacy', x: 2, y: 0, neighbors: ['triage', 'laboratory'] },
  { id: 'laboratory', name: 'Laboratory', x: 2, y: 1, neighbors: ['triage', 'pharmacy', 'storage', 'isolation'] },
  { id: 'storage', name: 'Storage', x: 1, y: 2, neighbors: ['ward-a', 'laboratory', 'meeting'] },
  { id: 'isolation', name: 'Isolation', x: 2, y: 2, neighbors: ['ward-b', 'laboratory'] },
  { id: 'meeting', name: 'Meeting Hall', x: 0, y: 0, neighbors: ['lobby', 'ward-b', 'storage'] }
];

const ROOM_BY_ID = Object.fromEntries(ROOM_LAYOUT.map((room) => [room.id, room]));
const COLORS = ['#e14d4d', '#3c82f6', '#16a34a', '#f59e0b', '#8b5cf6', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#64748b'];
const CORRUPTION_ORDER = ['healthy', 'exposed', 'symptomatic', 'contagious', 'critical'];
const CORRUPTION_DURATION = {
  exposed: 25,
  symptomatic: 30,
  contagious: 45,
  critical: 45
};

const rooms = new Map();
const subscribers = new Set();

function now() {
  return Date.now();
}

function makeCode() {
  let code;
  do {
    code = crypto.randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
  } while (rooms.has(code));
  return code;
}

function id() {
  return crypto.randomUUID();
}

function createRoom() {
  const code = makeCode();
  const room = {
    code,
    phase: 'lobby',
    players: new Map(),
    createdAt: now(),
    matchStartedAt: null,
    matchEndsAt: null,
    endedAt: null,
    winner: null,
    endReason: null,
    fluShots: emptyRoomCounts(),
    contaminatedRooms: {},
    labProgress: 0,
    nextFluSpawnAt: null,
    meetingRequest: null,
    meetingEndsAt: null,
    meetingVotes: {},
    meetingEndVotes: new Set(),
    lastEvent: 'Room created.'
  };
  rooms.set(code, room);
  return room;
}

function emptyRoomCounts() {
  return Object.fromEntries(ROOM_LAYOUT.map((room) => [room.id, 0]));
}

function publicPlayers(room) {
  return [...room.players.values()].map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    roomId: player.roomId,
    connected: player.connected,
    dead: player.dead
  }));
}

function activePlayers(room) {
  return [...room.players.values()].filter((player) => !player.dead);
}

function majorityCount(room) {
  return Math.floor(activePlayers(room).length / 2) + 1;
}

function trueInfectedTargetCount(playerCount) {
  if (playerCount <= 5) return 1;
  if (playerCount <= 8) return 2;
  return 3;
}

function deathLimit(room) {
  return room.players.size <= 6 ? 3 : 4;
}

function publicState(room) {
  return {
    code: room.code,
    phase: room.phase,
    players: publicPlayers(room),
    rooms: ROOM_LAYOUT,
    fluShots: room.fluShots,
    labProgress: room.labProgress,
    matchSecondsLeft: secondsLeft(room.matchEndsAt),
    meetingSecondsLeft: secondsLeft(room.meetingEndsAt),
    meetingRequest: room.meetingRequest
      ? {
          by: room.meetingRequest.by,
          byName: room.players.get(room.meetingRequest.by)?.name || 'Unknown',
          acceptCount: room.meetingRequest.accepts.size,
          needed: majorityCount(room)
        }
      : null,
    meeting: room.phase === 'meeting'
      ? {
          votesCast: Object.keys(room.meetingVotes).length,
          endVotes: room.meetingEndVotes.size,
          needed: majorityCount(room)
        }
      : null,
    maxPlayers: 10,
    minPlayers: 4,
    deathLimit: deathLimit(room),
    deaths: [...room.players.values()].filter((player) => player.dead).length,
    winner: room.winner,
    endReason: room.endReason,
    lastEvent: room.lastEvent
  };
}

function privateState(room, playerId) {
  const player = room.players.get(playerId);
  const pub = publicState(room);
  if (!player) return { ...pub, self: null };
  const currentRoom = ROOM_BY_ID[player.roomId];
  const trueInfectedAlive = [...room.players.values()].filter((p) => p.role === 'infected' && !p.neutralized && !p.dead).length;
  return {
    ...pub,
    self: {
      id: player.id,
      name: player.name,
      color: player.color,
      role: player.role,
      roomId: player.roomId,
      roomName: currentRoom?.name || player.roomId,
      corruption: player.corruption,
      corruptionSecondsLeft: Math.ceil(player.corruptionRemaining || 0),
      exposureSeconds: Math.floor(player.exposureSeconds || 0),
      hasFluShot: player.hasFluShot,
      dead: player.dead,
      neutralized: player.neutralized,
      infectCooldownSeconds: Math.max(0, Math.ceil((player.infectRoomCooldownUntil - now()) / 1000)),
      canMove: room.phase === 'playing' && !player.dead,
      canRequestMeeting: room.phase === 'playing' && !player.dead,
      canAcceptMeeting: Boolean(room.meetingRequest && !player.dead),
      canInfectRoom: player.role === 'infected' && !player.neutralized && !player.dead && room.phase === 'playing' && player.infectRoomCooldownUntil <= now(),
      canPickupFluShot: room.phase === 'playing' && !player.dead && !player.hasFluShot && room.fluShots[player.roomId] > 0,
      canWorkLab: room.phase === 'playing' && !player.dead && player.roomId === 'laboratory',
      neighbors: currentRoom ? currentRoom.neighbors.map((roomId) => ROOM_BY_ID[roomId]) : [],
      voteTargets: activePlayers(room).map((p) => ({ id: p.id, name: p.name, dead: p.dead })),
      activeTrueInfectedRemaining: player.role === 'infected' ? trueInfectedAlive : undefined
    }
  };
}

function secondsLeft(deadline) {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - now()) / 1000));
}

function sendSse(subscriber, payload) {
  try {
    subscriber.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    subscribers.delete(subscriber);
  }
}

function pushRoom(room) {
  for (const subscriber of subscribers) {
    if (subscriber.roomCode !== room.code) continue;
    const state = subscriber.kind === 'host'
      ? publicState(room)
      : privateState(room, subscriber.playerId);
    sendSse(subscriber, state);
  }
}

function addPlayer(room, name) {
  if (room.players.size >= 10) {
    throw new Error('This room is full.');
  }
  if (room.phase !== 'lobby') {
    throw new Error('This match has already started.');
  }
  const player = {
    id: id(),
    name: cleanName(name, `Player ${room.players.size + 1}`),
    color: COLORS[room.players.size % COLORS.length],
    connected: true,
    role: 'non-infected',
    neutralized: false,
    roomId: 'lobby',
    corruption: 'healthy',
    corruptionRemaining: 0,
    exposureSeconds: 0,
    hasFluShot: false,
    dead: false,
    infectRoomCooldownUntil: 0
  };
  room.players.set(player.id, player);
  room.lastEvent = `${player.name} joined.`;
  pushRoom(room);
  return player;
}

function cleanName(value, fallback) {
  const name = String(value || '').trim().slice(0, 18);
  return name || fallback;
}

function startMatch(room) {
  if (room.phase !== 'lobby' && room.phase !== 'ended') throw new Error('Match cannot start now.');
  if (room.players.size < 4) throw new Error('At least 4 players are required.');
  resetMatch(room);
  const players = [...room.players.values()];
  const infectedCount = trueInfectedTargetCount(players.length);
  shuffle(players).slice(0, infectedCount).forEach((player) => {
    player.role = 'infected';
  });
  spreadStartingPositions(players);
  room.phase = 'playing';
  room.matchStartedAt = now();
  room.matchEndsAt = now() + 10 * 60 * 1000;
  room.nextFluSpawnAt = now() + 60 * 1000;
  spawnFluShot(room, 'pharmacy');
  room.lastEvent = `Match started with ${infectedCount} true infected.`;
  pushRoom(room);
}

function spreadStartingPositions(players) {
  const gameplayRooms = shuffle(['lobby', 'triage', 'ward-a', 'ward-b', 'pharmacy', 'laboratory', 'storage', 'isolation']);
  const infected = players.filter((player) => player.role === 'infected');
  const nonInfected = players.filter((player) => player.role !== 'infected');
  infected.forEach((player, index) => {
    player.roomId = gameplayRooms[index % gameplayRooms.length];
  });
  const saferRooms = gameplayRooms.slice(Math.min(infected.length, gameplayRooms.length));
  const spawnPool = saferRooms.length ? saferRooms : gameplayRooms;
  nonInfected.forEach((player, index) => {
    player.roomId = spawnPool[index % spawnPool.length];
  });
}

function resetMatch(room) {
  room.phase = 'lobby';
  room.matchStartedAt = null;
  room.matchEndsAt = null;
  room.endedAt = null;
  room.winner = null;
  room.endReason = null;
  room.fluShots = emptyRoomCounts();
  room.contaminatedRooms = {};
  room.labProgress = 0;
  room.nextFluSpawnAt = null;
  room.meetingRequest = null;
  room.meetingEndsAt = null;
  room.meetingVotes = {};
  room.meetingEndVotes = new Set();
  for (const player of room.players.values()) {
    player.role = 'non-infected';
    player.neutralized = false;
    player.roomId = 'lobby';
    player.corruption = 'healthy';
    player.corruptionRemaining = 0;
    player.exposureSeconds = 0;
    player.hasFluShot = false;
    player.dead = false;
    player.infectRoomCooldownUntil = 0;
  }
}

function shuffle(values) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function movePlayer(room, player, roomId) {
  if (room.phase !== 'playing') throw new Error('Movement is locked.');
  if (player.dead) throw new Error('Dead players cannot move.');
  const current = ROOM_BY_ID[player.roomId];
  if (!current || !current.neighbors.includes(roomId)) throw new Error('That room is not adjacent.');
  player.roomId = roomId;
  room.lastEvent = `${player.name} moved to ${ROOM_BY_ID[roomId].name}.`;
  pushRoom(room);
}

function contaminateRoom(room, player) {
  if (room.phase !== 'playing') throw new Error('Room infection is only available during play.');
  if (player.role !== 'infected' || player.neutralized || player.dead) throw new Error('You cannot infect rooms.');
  if (player.infectRoomCooldownUntil > now()) throw new Error('Room infection is on cooldown.');
  room.contaminatedRooms[player.roomId] = now() + 60 * 1000;
  player.infectRoomCooldownUntil = now() + 60 * 1000;
  pushRoom(room);
}

function pickupFluShot(room, player) {
  if (room.phase !== 'playing') throw new Error('Flu shots can only be picked up during play.');
  if (player.dead) throw new Error('Dead players cannot pick up flu shots.');
  if (player.hasFluShot) throw new Error('You can hold only one flu shot.');
  if (room.fluShots[player.roomId] <= 0) throw new Error('No flu shot is available here.');
  room.fluShots[player.roomId] -= 1;
  player.hasFluShot = true;
  room.lastEvent = `${player.name} picked up a flu shot.`;
  pushRoom(room);
}

function workLab(room, player) {
  if (room.phase !== 'playing') throw new Error('The lab can only be worked during play.');
  if (player.dead) throw new Error('Dead players cannot work.');
  if (player.roomId !== 'laboratory') throw new Error('You must be in the Laboratory.');
  room.labProgress = Math.min(20, room.labProgress + 5);
  if (room.labProgress >= 20) {
    room.labProgress = 0;
    spawnFluShot(room, 'laboratory');
    room.lastEvent = 'The Laboratory produced a flu shot.';
  } else {
    room.lastEvent = `${player.name} worked in the Laboratory.`;
  }
  pushRoom(room);
}

function spawnFluShot(room, preferredRoomId) {
  const eligible = ['pharmacy', 'laboratory', 'storage', 'triage', 'isolation'];
  const roomId = preferredRoomId || eligible[Math.floor(Math.random() * eligible.length)];
  room.fluShots[roomId] += 1;
}

function requestMeeting(room, player) {
  if (room.phase !== 'playing') throw new Error('Meetings can only be requested during play.');
  if (player.dead) throw new Error('Dead players cannot request meetings.');
  room.phase = 'meeting-request';
  room.meetingRequest = {
    by: player.id,
    accepts: new Set([player.id]),
    requestedAt: now()
  };
  room.lastEvent = `${player.name} requested a meeting.`;
  maybeStartMeeting(room);
  pushRoom(room);
}

function acceptMeeting(room, player) {
  if (!room.meetingRequest) throw new Error('No meeting request is active.');
  if (player.dead) throw new Error('Dead players cannot accept meetings.');
  room.meetingRequest.accepts.add(player.id);
  room.lastEvent = `${player.name} accepted the meeting.`;
  maybeStartMeeting(room);
  pushRoom(room);
}

function maybeStartMeeting(room) {
  if (!room.meetingRequest) return;
  if (room.meetingRequest.accepts.size < majorityCount(room)) return;
  room.phase = 'meeting';
  room.meetingEndsAt = now() + 5 * 60 * 1000;
  room.meetingVotes = {};
  room.meetingEndVotes = new Set();
  room.meetingRequest = null;
  for (const player of activePlayers(room)) {
    player.roomId = 'meeting';
  }
  room.lastEvent = 'Meeting accepted. Everyone is gathering at Meeting Hall.';
}

function voteFluShot(room, player, targetId) {
  if (room.phase !== 'meeting') throw new Error('Voting is only open during meetings.');
  if (player.dead) throw new Error('Dead players cannot vote.');
  if (!room.players.has(targetId) || room.players.get(targetId).dead) throw new Error('Invalid vote target.');
  room.meetingVotes[player.id] = targetId;
  room.lastEvent = `${player.name} submitted a flu-shot vote.`;
  pushRoom(room);
}

function voteEndMeeting(room, player) {
  if (room.phase !== 'meeting') throw new Error('The meeting is not active.');
  if (player.dead) throw new Error('Dead players cannot end meetings.');
  room.meetingEndVotes.add(player.id);
  room.lastEvent = `${player.name} voted to end the meeting.`;
  if (room.meetingEndVotes.size >= majorityCount(room)) {
    resolveMeeting(room);
  }
  pushRoom(room);
}

function resolveMeeting(room) {
  if (room.phase !== 'meeting') return;
  const counts = new Map();
  for (const targetId of Object.values(room.meetingVotes)) {
    counts.set(targetId, (counts.get(targetId) || 0) + 1);
  }

  let winnerId = null;
  let winnerVotes = 0;
  let tied = false;
  for (const [targetId, count] of counts.entries()) {
    if (count > winnerVotes) {
      winnerId = targetId;
      winnerVotes = count;
      tied = false;
    } else if (count === winnerVotes) {
      tied = true;
    }
  }

  if (winnerId && !tied && winnerVotes >= majorityCount(room)) {
    const holder = activePlayers(room).find((player) => player.hasFluShot);
    if (holder) {
      holder.hasFluShot = false;
      applyFluShot(room, room.players.get(winnerId));
    } else {
      room.lastEvent = 'The vote passed, but no active player had a flu shot.';
    }
  } else {
    room.lastEvent = 'No majority target was selected. No flu shot was used.';
  }

  if (room.phase !== 'ended') {
    room.phase = 'playing';
    room.meetingEndsAt = null;
    room.meetingVotes = {};
    room.meetingEndVotes = new Set();
    room.meetingRequest = null;
    checkWinConditions(room);
  }
}

function applyFluShot(room, target) {
  if (!target || target.dead) return;
  if (target.role === 'infected' && !target.neutralized) {
    target.neutralized = true;
    target.corruption = 'healthy';
    target.corruptionRemaining = 0;
    target.exposureSeconds = 0;
    room.lastEvent = `${target.name} received a flu shot.`;
    checkWinConditions(room);
    return;
  }

  if (target.corruption === 'critical') {
    target.corruption = 'symptomatic';
    target.corruptionRemaining = CORRUPTION_DURATION.symptomatic;
  } else if (target.corruption === 'contagious') {
    target.corruption = 'exposed';
    target.corruptionRemaining = CORRUPTION_DURATION.exposed;
  } else if (target.corruption === 'symptomatic' || target.corruption === 'exposed') {
    target.corruption = 'healthy';
    target.corruptionRemaining = 0;
    target.exposureSeconds = 0;
  }
  room.lastEvent = `${target.name} received a flu shot.`;
}

function tickRoom(room) {
  if (room.phase === 'ended') return;

  if (room.phase === 'meeting' && room.meetingEndsAt && now() >= room.meetingEndsAt) {
    resolveMeeting(room);
  }

  if (room.phase === 'playing') {
    tickContamination(room);
    tickFluShotRespawn(room);
    tickInfection(room);
  }

  if (room.matchEndsAt && now() >= room.matchEndsAt && room.phase !== 'ended') {
    endRoom(room, 'infected', 'Time expired while true infected remained active.');
  }

  checkWinConditions(room);
  pushRoom(room);
}

function tickContamination(room) {
  for (const [roomId, expiresAt] of Object.entries(room.contaminatedRooms)) {
    if (now() >= expiresAt) delete room.contaminatedRooms[roomId];
  }
}

function tickFluShotRespawn(room) {
  if (!room.nextFluSpawnAt || now() < room.nextFluSpawnAt) return;
  const available = Object.values(room.fluShots).reduce((sum, count) => sum + count, 0);
  if (available < 2) {
    spawnFluShot(room);
    room.lastEvent = 'A flu shot respawned somewhere in the hospital.';
  }
  room.nextFluSpawnAt = now() + 60 * 1000;
}

function tickInfection(room) {
  const contagiousRoomIds = new Set(Object.keys(room.contaminatedRooms));
  const contagiousPlayerRooms = new Set(
    [...room.players.values()]
      .filter((player) => !player.dead && isContagiousSource(player))
      .map((player) => player.roomId)
  );

  for (const player of room.players.values()) {
    if (player.dead || player.role === 'infected') continue;

    if (player.corruption === 'healthy') {
      if (contagiousRoomIds.has(player.roomId) || contagiousPlayerRooms.has(player.roomId)) {
        player.exposureSeconds += 1;
      } else {
        player.exposureSeconds = Math.max(0, player.exposureSeconds - 1);
      }
      if (player.exposureSeconds >= 8) {
        player.corruption = 'exposed';
        player.corruptionRemaining = CORRUPTION_DURATION.exposed;
        player.exposureSeconds = 0;
      }
      continue;
    }

    if (player.corruptionRemaining > 0) {
      player.corruptionRemaining -= 1;
    }

    if (player.corruptionRemaining <= 0) {
      advanceCorruption(room, player);
    }
  }
}

function isContagiousSource(player) {
  if (player.role === 'infected' && !player.neutralized) return true;
  return player.corruption === 'contagious' || player.corruption === 'critical';
}

function advanceCorruption(room, player) {
  const index = CORRUPTION_ORDER.indexOf(player.corruption);
  const nextStage = CORRUPTION_ORDER[index + 1];
  if (!nextStage) {
    player.dead = true;
    player.corruption = 'dead';
    player.corruptionRemaining = 0;
    player.hasFluShot = false;
    room.lastEvent = `${player.name} died. Hospital closure risk increased.`;
    checkWinConditions(room);
    return;
  }
  player.corruption = nextStage;
  player.corruptionRemaining = CORRUPTION_DURATION[nextStage] || 0;
}

function checkWinConditions(room) {
  if (room.phase === 'ended' || !room.matchStartedAt) return;
  const activeTrueInfected = [...room.players.values()].filter((player) => player.role === 'infected' && !player.neutralized && !player.dead);
  if (activeTrueInfected.length === 0) {
    endRoom(room, 'non-infected', 'All starting true infected were neutralized with flu shots.');
    return;
  }
  const deaths = [...room.players.values()].filter((player) => player.dead).length;
  if (deaths >= deathLimit(room)) {
    endRoom(room, 'infected', 'Too many deaths forced the hospital to close down.');
  }
}

function endRoom(room, winner, reason) {
  room.phase = 'ended';
  room.winner = winner;
  room.endReason = reason;
  room.endedAt = now();
  room.meetingRequest = null;
  room.meetingEndsAt = null;
  room.lastEvent = `${winner} win: ${reason}`;
}

function getRoomOrThrow(code) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) throw new Error('Room not found.');
  return room;
}

function getPlayerOrThrow(room, playerId) {
  const player = room.players.get(playerId);
  if (!player) throw new Error('Player not found.');
  return player;
}

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, pathname, parts, query) {
  try {
    if (req.method === 'POST' && pathname === '/api/rooms') {
      const room = createRoom();
      return json(res, 201, { code: room.code });
    }

    if (req.method === 'GET' && pathname === '/events') {
      const room = getRoomOrThrow(query.get('room'));
      const kind = query.get('kind') || 'host';
      const playerId = query.get('playerId') || null;
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-accel-buffering': 'no'
      });
      const subscriber = { res, roomCode: room.code, kind, playerId };
      subscribers.add(subscriber);
      sendSse(subscriber, kind === 'host' ? publicState(room) : privateState(room, playerId));
      req.on('close', () => subscribers.delete(subscriber));
      return;
    }

    if (parts[0] === 'api' && parts[1] === 'rooms' && parts[2]) {
      const room = getRoomOrThrow(parts[2]);
      const action = parts[3];
      const body = req.method === 'POST' ? await parseBody(req) : {};

      if (req.method === 'GET' && !action) {
        return json(res, 200, publicState(room));
      }

      if (req.method === 'POST' && action === 'join') {
        const player = addPlayer(room, body.name);
        return json(res, 201, { playerId: player.id, code: room.code });
      }

      if (req.method === 'POST' && action === 'start') {
        startMatch(room);
        return json(res, 200, publicState(room));
      }

      if (req.method === 'POST' && action === 'reset') {
        resetMatch(room);
        room.lastEvent = 'Match reset to lobby.';
        pushRoom(room);
        return json(res, 200, publicState(room));
      }

      const player = getPlayerOrThrow(room, body.playerId);
      if (req.method === 'POST' && action === 'move') movePlayer(room, player, body.roomId);
      else if (req.method === 'POST' && action === 'infect-room') contaminateRoom(room, player);
      else if (req.method === 'POST' && action === 'pickup-flu') pickupFluShot(room, player);
      else if (req.method === 'POST' && action === 'work-lab') workLab(room, player);
      else if (req.method === 'POST' && action === 'request-meeting') requestMeeting(room, player);
      else if (req.method === 'POST' && action === 'accept-meeting') acceptMeeting(room, player);
      else if (req.method === 'POST' && action === 'vote-flu') voteFluShot(room, player, body.targetId);
      else if (req.method === 'POST' && action === 'vote-end') voteEndMeeting(room, player);
      else throw new Error('Unknown action.');

      return json(res, 200, privateState(room, player.id));
    }

    return json(res, 404, { error: 'Not found.' });
  } catch (error) {
    return json(res, 400, { error: error.message || 'Request failed.' });
  }
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' || !path.extname(pathname)
    ? path.join(PUBLIC_DIR, 'index.html')
    : path.join(PUBLIC_DIR, pathname);
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(safePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': contentType(safePath), 'cache-control': 'no-store' });
    res.end(content);
  });
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const parts = pathname.split('/').filter(Boolean);
  if (pathname.startsWith('/api') || pathname === '/events') {
    handleApi(req, res, pathname, parts, url.searchParams);
    return;
  }
  serveStatic(req, res, pathname);
});

setInterval(() => {
  for (const room of rooms.values()) tickRoom(room);
}, 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hospital Infection Prototype running at http://localhost:${PORT}`);
});
