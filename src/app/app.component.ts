import { Component } from '@angular/core';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  showSplash = true;

  constructor(private themeService: ThemeService) {
    setTimeout(() => {
      this.showSplash = false;
    }, 2500);
  }
}
