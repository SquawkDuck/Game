const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const path = location.pathname;

let state = null;
let source = null;
let busy = false;

const savedPlayerId = localStorage.getItem('hospital-player-id');
const savedRoom = localStorage.getItem('hospital-room-code');

function api(pathname, body) {
  return fetch(pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Request failed.');
    return payload;
  });
}

function html(strings, ...values) {
  return strings.reduce((result, string, index) => result + string + (values[index] ?? ''), '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function fmtTime(seconds) {
  if (seconds == null) return '--:--';
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const rest = String(safe % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function roomName(roomId) {
  return state?.rooms?.find((room) => room.id === roomId)?.name || roomId;
}

function connectEvents(kind, roomCode, playerId) {
  if (source) source.close();
  const query = new URLSearchParams({ kind, room: roomCode });
  if (playerId) query.set('playerId', playerId);
  source = new EventSource(`/events?${query.toString()}`);
  source.onmessage = (event) => {
    state = JSON.parse(event.data);
    render();
  };
  source.onerror = () => {
    console.warn('Event stream disconnected.');
  };
}

function route() {
  if (path.startsWith('/host')) {
    const roomCode = params.get('room');
    if (!roomCode) return renderLanding();
    connectEvents('host', roomCode);
    renderLoading('Opening host screen...');
    return;
  }

  if (path.startsWith('/controller')) {
    const roomCode = params.get('room') || savedRoom;
    const playerId = params.get('playerId') || savedPlayerId;
    if (roomCode && playerId) {
      connectEvents('player', roomCode, playerId);
      renderLoading('Opening controller...');
      return;
    }
    renderControllerJoin(roomCode || '');
    return;
  }

  renderLanding();
}

function render() {
  if (path.startsWith('/host')) renderHost();
  else if (path.startsWith('/controller')) renderController();
  else renderLanding();
}

function renderLoading(message) {
  app.innerHTML = `<section class="landing"><div class="panel">${escapeHtml(message)}</div></section>`;
}

function renderLanding(error = '') {
  app.className = 'app-shell';
  app.innerHTML = html`
    <section class="landing">
      <div class="landing-panel">
        <div class="brand">
          <h1>Hospital Infection</h1>
          <p>Shared-screen hidden infection prototype with phone controllers.</p>
        </div>
        <section class="panel stack">
          <h2>Host a match</h2>
          <p class="muted">Create a room on the big screen, then players join from phones using the room code.</p>
          <button class="primary" data-action="create-room">Create host room</button>
        </section>
        <section class="panel stack">
          <h2>Join by phone</h2>
          <input id="join-code" maxlength="5" placeholder="Room code">
          <input id="join-name" maxlength="18" placeholder="Player name">
          <button data-action="join-room">Join as controller</button>
          ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
        </section>
      </div>
    </section>
  `;
}

function renderControllerJoin(roomCode = '', error = '') {
  app.innerHTML = html`
    <section class="landing">
      <div class="landing-panel">
        <div class="brand">
          <h1>Controller</h1>
          <p>Join the hospital room from this phone.</p>
        </div>
        <section class="panel stack">
          <h2>Join room</h2>
          <input id="join-code" maxlength="5" placeholder="Room code" value="${escapeHtml(roomCode)}">
          <input id="join-name" maxlength="18" placeholder="Player name">
          <button class="primary" data-action="join-room">Join</button>
          ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
        </section>
      </div>
    </section>
  `;
}

function renderHost() {
  if (!state) return renderLoading('Opening host screen...');
  app.className = 'host';
  const joinUrl = `${location.origin}/controller?room=${state.code}`;
  app.innerHTML = html`
    <header class="host-top">
      <div>
        <h1>Hospital Infection</h1>
        <div class="status-line">${escapeHtml(state.lastEvent || '')}</div>
      </div>
      <div class="host-code">
        <span>Room</span>
        <span class="code-pill">${escapeHtml(state.code)}</span>
        <span>${escapeHtml(joinUrl)}</span>
      </div>
    </header>
    <section class="host-body">
      ${renderMap()}
      ${renderHostSide()}
    </section>
  `;
}

function renderMap() {
  const rooms = [...state.rooms].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return html`
    <section class="map">
      ${rooms.map((room) => {
        const players = state.players.filter((player) => player.roomId === room.id);
        const fluCount = state.fluShots?.[room.id] || 0;
        return html`
          <article class="room">
            <h2>${escapeHtml(room.name)}</h2>
            <div class="items">${Array.from({ length: fluCount }, () => '<span class="flu-token">F</span>').join('')}</div>
            <div class="players">
              ${players.map((player) => html`
                <div class="player-token ${player.dead ? 'dead' : ''}" style="background:${player.color}" title="${escapeHtml(player.name)}">
                  ${escapeHtml(player.name.slice(0, 2).toUpperCase())}
                </div>
              `).join('')}
            </div>
          </article>
        `;
      }).join('')}
    </section>
  `;
}

function renderHostSide() {
  const canStart = state.phase === 'lobby' && state.players.length >= state.minPlayers;
  return html`
    <aside class="side">
      <section class="panel ${state.phase === 'ended' ? 'winner' : ''}">
        <h2>${escapeHtml(phaseLabel(state.phase))}</h2>
        ${state.phase === 'ended'
          ? `<p><strong>${escapeHtml(state.winner)} win.</strong></p><p>${escapeHtml(state.endReason)}</p>`
          : `<div class="metric-grid">
              <div class="metric"><span>Match</span><strong>${fmtTime(state.matchSecondsLeft)}</strong></div>
              <div class="metric"><span>Meeting</span><strong>${fmtTime(state.meetingSecondsLeft)}</strong></div>
              <div class="metric"><span>Deaths</span><strong>${state.deaths}/${state.deathLimit}</strong></div>
              <div class="metric"><span>Players</span><strong>${state.players.length}/10</strong></div>
            </div>`}
      </section>
      ${state.phase === 'lobby' ? html`
        <section class="panel stack">
          <h3>Lobby</h3>
          <p class="muted">Players join with the room code. Start when 4-10 players are ready.</p>
          <button class="primary" data-action="start-match" ${canStart ? '' : 'disabled'}>Start match</button>
        </section>
      ` : ''}
      ${state.meetingRequest ? html`
        <section class="panel">
          <h3>Meeting Request</h3>
          <p>${escapeHtml(state.meetingRequest.byName)} requested a meeting.</p>
          <p>${state.meetingRequest.acceptCount}/${state.meetingRequest.needed} accepted</p>
        </section>
      ` : ''}
      <section class="panel">
        <h3>Roster</h3>
        <div class="roster">
          ${state.players.map((player) => html`
            <div class="roster-row">
              <span><span class="dot" style="background:${player.color}"></span> ${escapeHtml(player.name)}</span>
              <span class="muted">${player.dead ? 'out' : roomName(player.roomId)}</span>
            </div>
          `).join('')}
        </div>
      </section>
    </aside>
  `;
}

function phaseLabel(phase) {
  return {
    lobby: 'Lobby',
    playing: 'Live Match',
    'meeting-request': 'Meeting Requested',
    meeting: 'Meeting',
    ended: 'Match Ended'
  }[phase] || phase;
}

function renderController() {
  if (!state || !state.self) return renderLoading('Opening controller...');
  const self = state.self;
  app.className = 'controller';
  app.innerHTML = html`
    <header class="controller-top">
      <h1>${escapeHtml(self.name)}</h1>
      <div class="status-line">Room ${escapeHtml(state.code)} · ${escapeHtml(phaseLabel(state.phase))}</div>
    </header>
    <section class="controller-body">
      ${state.phase === 'ended' ? renderControllerEnd() : ''}
      ${renderPrivateStatus(self)}
      ${state.phase === 'lobby' ? '<section class="panel"><p>Waiting for the host to start the match.</p></section>' : ''}
      ${state.phase === 'playing' ? renderPlayControls(self) : ''}
      ${state.phase === 'meeting-request' ? renderMeetingRequest(self) : ''}
      ${state.phase === 'meeting' ? renderMeetingControls(self) : ''}
    </section>
  `;
}

function renderControllerEnd() {
  return html`
    <section class="panel winner">
      <h2>${escapeHtml(state.winner)} win</h2>
      <p>${escapeHtml(state.endReason)}</p>
    </section>
  `;
}

function renderPrivateStatus(self) {
  const roleText = self.role === 'infected'
    ? self.neutralized ? 'True infected, neutralized' : 'True infected'
    : 'Non-infected';
  return html`
    <section class="private-card stack">
      <div><span class="muted">Private role</span><br><strong>${escapeHtml(roleText)}</strong></div>
      <div><span class="muted">Private condition</span><br><strong>${escapeHtml(self.corruption)}</strong> ${self.corruptionSecondsLeft ? `· ${self.corruptionSecondsLeft}s` : ''}</div>
      <div><span class="muted">Location</span><br>${escapeHtml(self.roomName)}</div>
      <div><span class="muted">Held flu shot</span><br>${self.hasFluShot ? 'Yes' : 'No'}</div>
      ${self.role === 'infected' ? `<div><span class="muted">Active true infected remaining</span><br>${self.activeTrueInfectedRemaining}</div>` : ''}
    </section>
  `;
}

function renderPlayControls(self) {
  return html`
    <section class="panel stack">
      <h2>Move</h2>
      <div class="button-grid">
        ${self.neighbors.map((room) => html`
          <button data-action="move" data-room-id="${room.id}" ${self.canMove ? '' : 'disabled'}>${escapeHtml(room.name)}</button>
        `).join('')}
      </div>
    </section>
    <section class="panel stack">
      <h2>Actions</h2>
      <div class="button-grid">
        <button class="ok" data-action="pickup-flu" ${self.canPickupFluShot ? '' : 'disabled'}>Pick up flu shot</button>
        <button data-action="work-lab" ${self.canWorkLab ? '' : 'disabled'}>Work Laboratory +5s</button>
        <button data-action="request-meeting" ${self.canRequestMeeting ? '' : 'disabled'}>Request meeting</button>
        <button class="danger" data-action="infect-room" ${self.canInfectRoom ? '' : 'disabled'}>Infect this room</button>
      </div>
      ${self.role === 'infected' && self.infectCooldownSeconds > 0 ? `<p class="muted">Room infection cooldown: ${self.infectCooldownSeconds}s</p>` : ''}
    </section>
  `;
}

function renderMeetingRequest(self) {
  const accepted = state.meetingRequest?.acceptCount || 0;
  const needed = state.meetingRequest?.needed || 0;
  return html`
    <section class="panel stack">
      <h2>Meeting requested</h2>
      <p>${accepted}/${needed} players accepted.</p>
      <button class="primary" data-action="accept-meeting" ${self.canAcceptMeeting ? '' : 'disabled'}>Accept meeting</button>
    </section>
  `;
}

function renderMeetingControls(self) {
  return html`
    <section class="panel stack">
      <h2>Meeting</h2>
      <p class="muted">Talk in person. Voting is private on phones. ${fmtTime(state.meetingSecondsLeft)} remaining.</p>
      <div class="stack">
        <label for="vote-target">Flu-shot target</label>
        <select id="vote-target">
          ${self.voteTargets.map((target) => `<option value="${target.id}">${escapeHtml(target.name)}</option>`).join('')}
        </select>
        <button class="primary" data-action="vote-flu">Submit flu-shot vote</button>
        <button data-action="vote-end">Vote to end meeting early</button>
      </div>
    </section>
  `;
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || busy) return;
  busy = true;
  button.disabled = true;
  const action = button.dataset.action;
  try {
    if (action === 'create-room') {
      const payload = await api('/api/rooms');
      location.href = `/host?room=${payload.code}`;
      return;
    }

    if (action === 'join-room') {
      const code = document.getElementById('join-code')?.value.trim().toUpperCase();
      const name = document.getElementById('join-name')?.value.trim();
      const payload = await api(`/api/rooms/${code}/join`, { name });
      localStorage.setItem('hospital-player-id', payload.playerId);
      localStorage.setItem('hospital-room-code', payload.code);
      location.href = `/controller?room=${payload.code}&playerId=${payload.playerId}`;
      return;
    }

    if (action === 'start-match') await api(`/api/rooms/${state.code}/start`);
    if (action === 'move') await playerApi('move', { roomId: button.dataset.roomId });
    if (action === 'infect-room') await playerApi('infect-room');
    if (action === 'pickup-flu') await playerApi('pickup-flu');
    if (action === 'work-lab') await playerApi('work-lab');
    if (action === 'request-meeting') await playerApi('request-meeting');
    if (action === 'accept-meeting') await playerApi('accept-meeting');
    if (action === 'vote-end') await playerApi('vote-end');
    if (action === 'vote-flu') {
      const targetId = document.getElementById('vote-target')?.value;
      await playerApi('vote-flu', { targetId });
    }
  } catch (error) {
    alert(error.message || 'Action failed.');
  } finally {
    busy = false;
    if (button.isConnected) button.disabled = false;
  }
});

function playerApi(action, extra = {}) {
  return api(`/api/rooms/${state.code}/${action}`, {
    playerId: state.self.id,
    ...extra
  });
}

route();
