import { Injectable, EventEmitter } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import {v4 as uuid } from 'uuid'
import {BehaviorSubject} from 'rxjs';

export interface Lobby {
  id: string;
  clients: [{ name: string, ready: boolean, host: boolean }];
}

export interface User {
  name: string, ready: boolean, host: boolean,
}

export interface GameState {
  playerTurn: string,
  activePlayers: [string],
  spectators: [string],
  running: boolean
}

export interface Winner {
  winner: string,
  wordList: [string]
}

@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private socket: Socket;

  public connectionStatus$ = new BehaviorSubject<boolean>(false);

  public errorLobbyNotFound = new EventEmitter<void>();
  public errorNameExists = new EventEmitter<void>();

  public lobbyCreated = new EventEmitter<string>();
  public lobbyUpdate   = new EventEmitter<Lobby>();
  public promoteToHost = new EventEmitter<boolean>();
  public userInfo = new EventEmitter<User>();

  public canStart   = new EventEmitter<boolean>();
  public gameUpdate   = new EventEmitter<GameState>();
  public newWord   = new EventEmitter<string>();
  public changeInput = new EventEmitter<string>();
  public signalTurn = new EventEmitter<[boolean, string[]]>();
  public winnerScreen = new EventEmitter<Winner>();

  constructor() {
    let userid = localStorage.getItem('userid');
    if (!userid) {
      userid = uuid();
      localStorage.setItem('userid', userid);
    }
    //this.socket = io(`${window.location.protocol}//${window.location.hostname}:3002`);
    this.socket = io({
      transports: ['websocket'],
      path: '/socket.io',
      auth: {userid}
    });

    this.connectionStatus$.next(this.socket.connected);

    this.socket.on('connect', () => {
      this.connectionStatus$.next(true);
    });
    this.socket.on('disconnect', () => {
      this.connectionStatus$.next(false);
    });

    this.socket.on('lobby-created', lobbyId => this.lobbyCreated.emit(lobbyId));
    this.socket.on('lobby-update', lobby => this.lobbyUpdate.emit(lobby));
    this.socket.on('promote-to-host', host => this.promoteToHost.emit(host));

    this.socket.on('error-lobby-not-found', () => this.errorLobbyNotFound.emit());
    this.socket.on('error-name-exists', () => this.errorNameExists.emit());
    this.socket.on('take-user-info', user => this.userInfo.emit(user));

    this.socket.on('can-start', canStart => this.canStart.emit(canStart));
    this.socket.on('game-update', gameState => this.gameUpdate.emit(gameState));
    this.socket.on('signal-turn', (turn, guessedWords) => this.signalTurn.emit([turn, guessedWords]));
    this.socket.on('new-word', word => this.newWord.emit(word));
    this.socket.on('change-input', input => this.changeInput.emit(input));
    this.socket.on('winner', winner => this.winnerScreen.emit(winner));
  }

  enterLobby(lobbyId: string, playerName: string) {
    this.socket.emit('join-lobby', { lobbyId, playerName });
  }
  createLobby(playerName: string) {
    this.socket.emit('create-lobby', playerName);
  }
  setPlayerReady(ready: boolean) {
    this.socket.emit('set-player-ready', ready);
  }
  updateLobby() {
    this.socket.emit('update-lobby');
  }
  leaveLobby() {
    this.socket.emit('leave-lobby');
  }
  startGame() {
    this.socket.emit('start-game');
  }
  updateGame() {
    this.socket.emit('update-game');
  }
  submitWord(word: string) {
    this.socket.emit('submit-word', word);
  }
  inputChange(newGuess: string) {
    this.socket.emit('input-change', newGuess);
  }
}
