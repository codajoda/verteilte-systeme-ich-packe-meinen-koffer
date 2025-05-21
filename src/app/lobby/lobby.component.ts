import { Component, OnInit } from '@angular/core';
import { ConnectionService } from '../services/connection.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {ActivatedRoute, Router} from '@angular/router';
import {take} from 'rxjs';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatFabButton} from '@angular/material/button';
import {MatInput} from '@angular/material/input';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [FormsModule, CommonModule, MatFormFieldModule, MatInput, MatFabButton],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.css']
})
export class LobbyComponent implements OnInit {
  name = '';
  lobbyId = '';
  errorMessage = '';

  constructor(
    private conn: ConnectionService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.errorMessage = this.route.snapshot.queryParamMap.get('error')!;
    if (this.errorMessage) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { error: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
    this.conn.leaveLobby();
  }

  joinLobby() {
    this.errorMessage = '';
    if (!this.name.trim() || !this.lobbyId.trim()) {
      this.errorMessage = 'Name and Lobby Code shall not be empty.';
      return;
    }
    this.conn.enterLobby(this.lobbyId, this.name);
    this.router.navigate(
      ['/game']
    );
  }

  createLobby() {
    this.errorMessage = '';
    if (!this.name.trim()) {
      this.errorMessage = 'Name shall not be empty.';
      return;
    }
    this.conn.createLobby(this.name);
    this.conn.lobbyCreated
      .pipe(take(1))
      .subscribe(lobbyId => {
        this.conn.enterLobby(lobbyId, this.name);
        this.router.navigate(
          ['/game']
        );
    });
  }
}
