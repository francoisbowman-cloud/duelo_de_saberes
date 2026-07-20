const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const requestedServer = new URLSearchParams(location.search).get("server");
if (requestedServer) localStorage.setItem("duelo:serverUrl", requestedServer.replace(/\/$/, ""));
const SERVER_URL = window.DUELO_SERVER_URL || requestedServer || localStorage.getItem("duelo:serverUrl") || (isLocal ? "http://127.0.0.1:3000" : location.origin);

function loadSocketClient() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${SERVER_URL}/socket.io/socket.io.js`;
    script.onload = resolve;
    script.onerror = () => reject(new Error("No se pudo cargar el cliente de la arena"));
    document.head.append(script);
  });
}

async function boot() {
await loadSocketClient();
const socket = io(SERVER_URL, { transports: ["websocket", "polling"], reconnection: true });
const $ = (id) => document.getElementById(id);
let room = null, playerId = null, question = null, clock = null;
const saved = JSON.parse(localStorage.getItem("duelo:session") || "null");

function setConnection(online) { $("connectionText").textContent = online ? "Servidor conectado" : "Sin conexión"; $("connectionText").parentElement.classList.toggle("online", online); }
function showError(message, target = "arenaError") { $(target).textContent = message || ""; }
function persist(session) { localStorage.setItem("duelo:session", JSON.stringify({ code: session.room.code, token: session.sessionToken })); localStorage.setItem("duelo:lastName", $("displayName").value); }
function enterArena(session) { room = session.room; playerId = session.playerId; persist(session); $("entryView").classList.add("hidden"); $("arenaView").classList.remove("hidden"); history.replaceState(null, "", `#room=${room.code}`); renderRoom(); }
function ackHandler(target, done) { return (result) => { if (!result?.ok) return showError(result?.error?.message || "No fue posible completar la acción", target); showError("", target); done(result.data); }; }

socket.on("connect", () => { setConnection(true); $("reconnectBanner").classList.add("hidden"); if (saved && !room) socket.emit("room:rejoin", { code: saved.code, sessionToken: saved.token }, ackHandler("entryError", enterArena)); });
socket.on("disconnect", () => { setConnection(false); if (room) $("reconnectBanner").classList.remove("hidden"); });
socket.on("room:state", (state) => { room = state; renderRoom(); });
socket.on("game:question", (payload) => { question = payload; renderQuestion(); });
socket.on("game:reveal", ({ correct, correctAnswer, fact }) => { $("reveal").classList.remove("hidden"); $("reveal").innerHTML = `<strong>${correct ? "Respuesta correcta" : "Turno cerrado"}.</strong> La respuesta es ${escapeHtml(correctAnswer)}.<br>${escapeHtml(fact)}`; disableAnswers(); });
socket.on("game:finished", (state) => { room = state; renderRoom(); $("phaseLabel").textContent = "PARTIDA FINALIZADA"; $("categoryLabel").textContent = "Marcador final"; $("questionText").textContent = [...room.players].sort((a, b) => b.score - a.score).map((player, index) => `${index + 1}. ${player.displayName}: ${player.score}`).join(" · "); $("statusText").textContent = "Gracias por jugar. Crea otra sala para una revancha."; $("answers").innerHTML = ""; $("wordForm").classList.add("hidden"); });
socket.on("session:replaced", () => { localStorage.removeItem("duelo:session"); socket.disconnect(); showError("Esta sesión se abrió en otra pestaña. Recarga para volver a entrar."); disableAnswers(); });

$("entryForm").addEventListener("submit", (event) => { event.preventDefault(); const code = $("roomCode").value.trim().toUpperCase(); if (!code) return showError("Escribe un código o crea una sala nueva.", "entryError"); socket.emit("room:join", { code, displayName: $("displayName").value }, ackHandler("entryError", enterArena)); });
$("createButton").addEventListener("click", () => socket.emit("room:create", { displayName: $("displayName").value }, ackHandler("entryError", enterArena)));
$("startButton").addEventListener("click", () => socket.emit("game:start", { code: room.code }, ackHandler("arenaError", () => {})));
$("copyButton").addEventListener("click", async () => { const serverQuery = isLocal ? "" : `?server=${encodeURIComponent(SERVER_URL)}`; await navigator.clipboard.writeText(`${location.origin}${location.pathname}${serverQuery}#room=${room.code}`); $("copyButton").textContent = "Copiado"; setTimeout(() => $("copyButton").textContent = "Copiar", 1300); });
$("wordForm").addEventListener("submit", (event) => { event.preventDefault(); submitAnswer($("wordAnswer").value); });

function submitAnswer(answer) { if (!room?.game) return; socket.emit("game:submit-answer", { code: room.code, answer, eventSequence: room.game.eventSequence }, ackHandler("arenaError", disableAnswers)); }
function renderRoom() {
  if (!room) return; $("roomLabel").textContent = room.code; $("playerCount").textContent = `${room.players.length} / ${room.maxPlayers}`;
  $("roster").innerHTML = room.players.map((p) => `<div class="player"><span class="avatar">${escapeHtml(p.displayName[0].toUpperCase())}</span><span class="player-name">${escapeHtml(p.displayName)}${p.id === playerId ? " (tú)" : ""}<small class="player-state">${p.connected ? "En línea" : "Reconectando"}</small></span><strong class="score">${p.score}</strong></div>`).join("");
  $("startButton").classList.toggle("hidden", room.status !== "lobby");
  if (room.game) { $("phaseLabel").textContent = room.game.phase === "steal" ? "ROBO DE TURNO" : room.game.phase.toUpperCase(); renderTurn(); startClock(); }
}
function renderQuestion() {
  if (!question) return; $("categoryLabel").textContent = question.category; $("questionText").textContent = question.prompt; $("reveal").classList.add("hidden");
  $("answers").innerHTML = ""; $("wordForm").classList.toggle("hidden", question.type !== "word");
  if (question.type === "mcq") question.options.forEach((option, index) => { const button = document.createElement("button"); button.className = "answer"; button.textContent = option; button.addEventListener("click", () => submitAnswer(index)); $("answers").append(button); });
  renderTurn();
}
function renderTurn() { if (!room?.game) return; const active = room.players.find((p) => p.id === room.game.activePlayerId); const mine = active?.id === playerId; $("statusText").textContent = mine ? "Tu turno. Elige con cuidado." : active ? `Turno de ${active.displayName}` : "Preparando la siguiente jugada..."; document.querySelectorAll(".answer, #wordAnswer, #wordForm button").forEach((el) => el.disabled = !mine); }
function startClock() { clearInterval(clock); const tick = () => { const left = room?.game?.deadlineAt ? Math.max(0, Date.parse(room.game.deadlineAt) - Date.now()) : 0; $("timerValue").textContent = room?.game?.deadlineAt ? Math.ceil(left / 1000) : "--"; }; tick(); clock = setInterval(tick, 250); }
function disableAnswers() { document.querySelectorAll(".answer, #wordAnswer, #wordForm button").forEach((el) => el.disabled = true); }
function escapeHtml(value) { const node = document.createElement("div"); node.textContent = String(value); return node.innerHTML; }

$("displayName").value = localStorage.getItem("duelo:lastName") || "";
const linkedRoom = new URLSearchParams(location.hash.slice(1)).get("room"); if (linkedRoom) $("roomCode").value = linkedRoom.toUpperCase();
}

boot().catch((error) => {
  document.getElementById("connectionText").textContent = "Servidor no disponible";
  document.getElementById("entryError").textContent = `${error.message}. Verifica la URL de Railway.`;
});
