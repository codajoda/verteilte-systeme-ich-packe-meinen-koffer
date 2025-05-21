const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const app = express();

/*
const fs = require('fs');
const path = require('path');
const https = require('https');
const options = {
  key: fs.readFileSync(path.join(__dirname, 'certs', 'example.key')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'example.crt'))
};
const httpsServer = https.createServer(options, app);
const ioHttps = socketIo(httpsServer);
*/

const httpServer = http.createServer(app);
const ioHttp = socketIo(httpServer);

const DISCONNECT_TIMEOUT = 10 * 1000;
const reconnectTimers = new Map(); // Map<uuid, TimeoutId>

const lobbies    = {};
const gameStates = {};

function updateLobby(socket) {
  const lobby = socket.data.lobby;
  const client = socket.data.user;
  if (lobby) {
    const safeClients = lobby.clients.map(({ name, ready, host }) => ({
      name,
      ready,
      host
    }));
    const safeLobby = {
      id:     lobby.id,
      clients: safeClients
    };
    ioHttp.to(lobby.id).emit('lobby-update', safeLobby);
    const host = lobby.clients.find(client => client.id === lobby.host);
    if (host) {
      ioHttp.to(host.socketId).emit('can-start', (lobby.clients.filter(client => client.ready).length >= 2));
    }
    if (client) {
      const user = {
        name: client.name,
        host: client.host,
        ready: client.ready
      }
      socket.emit('take-user-info', user);
    }
  } else {
    socket.emit('error-lobby-not-found');
  }
}

function updateGame(socket) {
  const lobby = socket.data.lobby;
  if (lobby && gameStates[lobby.id]) {
    const safeGameState = {
      playerTurn: gameStates[lobby.id].activePlayers[gameStates[lobby.id].playerTurn].name,
      activePlayers: gameStates[lobby.id].activePlayers.map(player => player.name),
      spectators: gameStates[lobby.id].spectators.map(player => player.name),
      running: true
    }
    let list;
    if (gameStates[lobby.id].wordList) {
      list = gameStates[lobby.id].wordList.slice(0, gameStates[lobby.id].currentWordListIndex);
    }
    ioHttp.to(gameStates[lobby.id].activePlayers[gameStates[lobby.id].playerTurn].socketId).emit('signal-turn', true, list);
    gameStates[lobby.id].activePlayers.filter((player, idx) => idx !== gameStates[lobby.id].playerTurn).map(player => player.socketId).forEach(id => ioHttp.to(id).emit('signal-turn', false, list));
    gameStates[lobby.id].spectators.map(player => player.socketId).forEach(id => ioHttp.to(id).emit('signal-turn', false, list));
    ioHttp.to(lobby.id).emit('game-update', safeGameState);
  }
}

function leaveLobby(socket) {
  console.log('Disconnecting...')
  const client = socket.data.user;
  const lobby = socket.data.lobby;
  if (!client || !lobby) {
    console.log(`Client disconnected: ${socket.data.userId}`);
    return;
  }
  lobby.clients = lobby.clients.filter(c => c.id !== socket.data.user.id);
  if (gameStates[lobby.id]) {
    gameStates[lobby.id].activePlayers = gameStates[lobby.id].activePlayers.filter(c => c.id !== client.id);
    gameStates[lobby.id].spectators = gameStates[lobby.id].spectators.filter(c => c.id !== client.id);
    if (gameStates[lobby.id].activePlayers.length === 1) {
      gameStates[lobby.id].running = false;
      ioHttp.to(lobby.id).emit('winner',
        {
          winner: gameStates[lobby.id].activePlayers[0].name,
          wordList: gameStates[lobby.id].wordList
        });
      delete gameStates[lobby.id];
      lobby.clients.forEach(client => client.ready = false);
    }
  }
  console.log(`Client ${client.name} (${client.id}) removed from Lobby ${lobby.id}`);

  if (lobby.clients.length === 0) {
    delete lobbies[lobby.id];
    if (gameStates[lobby.id]) {
      delete gameStates[lobby.id];
    }
    console.log(`Delete Lobby ${lobby.id}`);
  } else if (client.host) {
    lobby.host = lobby.clients[0].id;
    lobby.clients[0].host = true;
    ioHttp.to(lobby.clients[0].socketId).emit('promote-to-host', true);
    console.log(`Client ${lobby.clients[0].name} (${lobby.host}) is new Host of lobby: ${lobby.id}`)
  }
  updateLobby(socket);
  updateGame(socket);
  console.log(`Client disconnected: (${socket.data.userId})`);
}

ioHttp.use((socket, next) => {
  const { userid } = socket.handshake.auth;
  console.log("User-ID:" + userid);
  if (!userid) return next(new Error('No userId'));
  socket.data.userId = userid;
  next();
});

ioHttp.use((socket, next) => {
  const lobby = Object
    .values(lobbies)
    .find(l => l.clients.some(c => c.id === socket.data.userId)
    );
  if (lobby) {
    socket.join(lobby.id);
  }
  next();
});

ioHttp.on('connection', (socket) => {
  console.log(`Client connected: (${socket.data.userId})`);

  socket.use((packet, next) => {
    socket.data.lobby = Object
      .values(lobbies)
      .find(l => l.clients.some(c => c.id === socket.data.userId)
    );
    next();
  });
  socket.use((packet, next) => {
    if (socket.data.lobby) {
      socket.data.user = socket.data.lobby.clients.find(c => c.id === socket.data.userId);
      socket.data.user.socketId = socket.id;
    }
    next();
  });

  if (reconnectTimers.has(socket.data.userId)) {
    clearTimeout(reconnectTimers.get(socket.data.userId));
    reconnectTimers.delete(socket.data.userId);
  }
  socket.on('disconnect', () => {
    console.log(`Socket für UUID ${socket.data.userId} getrennt, starte Timeout-Timer`);
    const timer = setTimeout(() => {
      leaveLobby(socket);
      reconnectTimers.delete(socket.data.userId);
    }, DISCONNECT_TIMEOUT);
    reconnectTimers.set(socket.data.userId, timer);
  });

  socket.on('join-lobby', ({ lobbyId, playerName }) => {
    console.log('Joining Lobby...')
    const lobby = lobbies[lobbyId];
    if (socket.data.lobby) {
      console.log('Already in Lobby');
      return
    }
    if (!lobby) {
      socket.emit('error-lobby-not-found');
      console.log('Lobby not found');
      return
    }
    if (lobby.clients.find(c => c.name === playerName)) {
      socket.emit('error-name-exists');
      console.log('Name already exists in Lobby');
      return;
    }
    socket.join(lobbyId);
    const newUser =       {
      id: socket.data.userId,
      socketId: socket.id,
      name: playerName,
      ready: false,
      host: (lobbies[lobbyId].clients.length === 0)
    }
    lobbies[lobbyId].clients.push(newUser);
    if (gameStates[lobbyId]) {
      gameStates[lobbyId].spectators.push(newUser);
    }
    socket.data.lobby = lobbies[lobbyId];
    socket.data.user = newUser;
    updateLobby(socket);
    console.log(`Client ${playerName} (${socket.data.userId}) joined Lobby: ${lobbyId}`);
  });

  socket.on('create-lobby', () => {
    console.log('Creating Lobby...')
    if (socket.data.lobby) {
      console.log('Already in Lobby');
      return;
    }
    if (lobbies.length >= 9999) {
      return;
    }
    let lobbyId;
    do {
      lobbyId = (Math.floor(1000 + Math.random() * 9000)).toString();
    } while (lobbies[lobbyId])
    socket.join(lobbyId);
    lobbies[lobbyId] = {
      id: lobbyId,
      host: socket.data.userId,
      clients: []
    };
    socket.emit('lobby-created', lobbyId);
    socket.emit('promote-to-host', true);
    console.log(`Lobby created: ${lobbyId}`);
  });

  socket.on('update-lobby', () => {
    updateLobby(socket);
  });

  socket.on('set-player-ready', (ready) => {
    const client = socket.data.user;
    const lobby = socket.data.lobby;
    if (client && lobby) {
      client.ready = ready;
      console.log(`Client ${client.name} (${socket.data.userId}) auf ${ready ? 'Ready' : 'Nicht Ready'} gesetzt`);
      updateLobby(socket);
    }
  });

  socket.on('get-user-info', () => {
    const client = socket.data.user;
    if (client && socket.data.lobby) {
      const user = {
        name: client.name,
        host: client.host,
        ready: client.ready
      }
      socket.emit('take-user-info', user);
    }
  });

  socket.on('leave-lobby', () => {
    leaveLobby(socket);
  });

  socket.on('start-game', () => {
    const lobby = socket.data.lobby;
    if (!(lobby && lobby.host === socket.data.user.id)) {
      console.log(`Client (${socket.data.userId}) has no rights to start the game`);
      return;
    }
    if (!gameStates[lobby.id] && lobby.clients.filter(client => client.ready).length >= 2) {
      gameStates[lobby.id] = {
        wordList: [],
        currentWordListIndex: 0,
        playerTurn: 0,
        waitingForNewWord: false,
        activePlayers: lobby.clients.filter(client => client.ready),
        spectators: lobby.clients.filter(client => !client.ready),
        running: true
      }
      updateGame(socket);
    }
  });

  socket.on('update-game', () => {
      updateGame(socket);
  });

  socket.on('submit-word', word => {
    if (!word) return;
    let guess = word.trim();
    if (!guess) return;
    guess = guess.trim().replace(/\s+/g, ' ');
    if (guess.length > 40) return;
    guess = guess.toUpperCase();
    const client = socket.data.user;
    const lobby = socket.data.lobby;
    if (client && lobby) {
      const gameState = gameStates[lobby.id];
      if (gameState && gameState.activePlayers[gameState.playerTurn].socketId === socket.id) {
        if (gameState.wordList.length === 0) {
          gameState.wordList.push(guess);
          ioHttp.to(lobby.id).emit('new-word', guess);
          gameState.playerTurn++;
        } else if (gameState.waitingForNewWord) {
          gameState.wordList.push(guess);
          gameState.currentWordListIndex = 0;
          ioHttp.to(lobby.id).emit('new-word', guess);
          gameState.waitingForNewWord = false;
          if (gameState.playerTurn === gameState.activePlayers.length-1) {
            gameState.playerTurn = 0;
          } else {
            gameState.playerTurn++;
          }
        }
        else {
          if (gameState.wordList[gameState.currentWordListIndex] === guess) {
            if (gameState.currentWordListIndex === gameState.wordList.length-1) {
              gameState.waitingForNewWord = true;
            }
            gameState.currentWordListIndex++;
          } else {
            gameState.activePlayers = gameState.activePlayers.filter(player => player.id !== client.id);
            gameState.spectators.push(client);
            gameState.currentWordListIndex = 0;
            if (gameState.playerTurn === gameState.activePlayers.length) {
              gameState.playerTurn = 0;
            }
            if (gameState.activePlayers.length === 1) {
              gameState.running = false;
              ioHttp.to(lobby.id).emit('winner',
                {
                  winner: gameState.activePlayers[0].name,
                  wordList: gameState.wordList
                });
              delete gameStates[lobby.id];
              lobby.clients.forEach(client => client.ready = false);
            }
          }
        }
        ioHttp.to(lobby.id).emit('change-input', '');
        updateGame(socket);
      }
    }
  });

  socket.on('input-change', word => {
    const client = socket.data.user;
    const lobby = socket.data.lobby;
    if (client && lobby) {
      const gameState = gameStates[lobby.id];
      if (gameState && gameState.activePlayers[gameState.playerTurn].socketId === socket.id) {
        ioHttp.to(lobby.id).emit('change-input', word);
        updateGame(socket);
      }
    }
  });
});

httpServer.listen(3002, () => console.log('HTTP-Server running Port 3002'));
