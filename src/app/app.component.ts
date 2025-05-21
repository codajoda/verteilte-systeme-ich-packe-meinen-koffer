import {Component, OnInit} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {ConnectionService} from './services/connection.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  standalone: true,
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'ichPackeMeinenKoffer';
  connectionActive: boolean = false;

  constructor( private connectionService : ConnectionService) {}

  ngOnInit() : void {
    this.connectionService.connectionStatus$
      .subscribe(status => this.connectionActive = status);
    window.addEventListener('popstate', () => {
      history.pushState(null, '', location.href);
    });
  }
}
