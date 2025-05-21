import {Component, OnInit} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {ConnectionService, GameState, Lobby, User, Winner} from '../services/connection.service';
import {NgIf, NgStyle} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatFabButton} from '@angular/material/button';
import {MatChipListbox, MatChipOption} from '@angular/material/chips';
import {MatFormField, MatInput, MatLabel} from '@angular/material/input';
import {MatList, MatListItem} from '@angular/material/list';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [FormsModule, MatFabButton, NgStyle, MatChipListbox, MatChipOption, NgIf, MatFormField, MatInput, MatLabel, MatList, MatListItem],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css']
})
export class GameComponent implements OnInit {
  lobbyId: string = "";
  playerName: string = "";
  lobby!: Lobby;
  host: boolean = false;
  ready: boolean = false;
  canStartGame: boolean = false;
  gameRunning: boolean = false;
  gameState!: GameState;

  guess!: string;
  guessedWords: string[] = [];
  newWord: string = "";
  turn: boolean = false;
  get isActivePlayer(): boolean {
    return this.gameState?.activePlayers
      .some(p => p === this.playerName) ?? false;
  }

  winningScreen: boolean = false;
  winner: string = "";
  endWordlist: string[] = [];

  constructor(
    private conn: ConnectionService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  leaveLobby() {
    this.router.navigate(['/lobby']);
  }

  setReady() {
    this.conn.setPlayerReady(!this.ready);
  }

  startGame() {
    this.conn.startGame();
  }

  onGuess() {
    this.conn.submitWord(this.guess);
    if (!(this.guess.trim().replace(/\s+/g, ' ').length > 40)) {
      this.guess = '';
      this.newWord = "";
    }
  }
  onGuessChange(newGuess: string) {
    this.guess = this.guess.toUpperCase();
    this.conn.inputChange(newGuess.toUpperCase());
  }

  ngOnInit(): void {
    this.conn.lobbyUpdate.subscribe((lobby: Lobby) => {
      this.lobby = lobby;
      this.lobbyId = lobby.id;
    });

    this.conn.promoteToHost.subscribe((host) => {
      this.host = host;
    });

    this.conn.errorLobbyNotFound.subscribe(() => {
      this.router.navigate(['/lobby'],
        { queryParams: { error: 'Lobby not found' } }
      );
    });

    this.conn.errorNameExists.subscribe(() => {
      this.router.navigate(['/lobby'],
        { queryParams: { error: 'Name is already taken'} }
      );
    });

    this.conn.userInfo.subscribe((user: User) => {
      if (!user) {
        this.router.navigate(['/lobby']);
        return;
      }
      this.playerName = user.name
      this.host = user.host;
      this.ready = user.ready;
    });

    this.conn.canStart.subscribe((canStart: boolean) => {
      this.canStartGame = canStart;
    });

    this.conn.gameUpdate.subscribe((gameState: GameState) => {
      this.gameRunning = gameState.running;
      this.gameState = gameState;
    });

    this.conn.signalTurn.subscribe(([turn, guessedWords]: [boolean, string[]]) => {
      this.guessedWords = guessedWords;
      if (guessedWords.length > 0) {
        this.newWord = "";
      }
      this.turn = turn;
    });

    this.conn.newWord.subscribe((word : string)=> {
      this.newWord = word;
    });

    this.conn.changeInput.subscribe((word : string)=> {
      this.guess = word;
    });

    this.conn.winnerScreen.subscribe((winner: Winner) => {
      this.gameRunning = false;
      this.winningScreen = true;
      this.winner = winner.winner;
      this.endWordlist = winner.wordList;
    });

    this.conn.updateLobby();
    this.conn.updateGame();
  }

  backToLobby() {
    this.winningScreen = false;
    this.guess = "";
    this.guessedWords = [];
    this.newWord = "";
    this.conn.updateLobby();
  }
}
