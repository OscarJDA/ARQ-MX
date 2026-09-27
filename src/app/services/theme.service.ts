import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'healthscape_dark_mode';
  private darkMode = new BehaviorSubject<boolean>(false);

  isDarkMode$ = this.darkMode.asObservable();

  constructor() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved !== null) {
      this.setDarkMode(saved === 'true');
    }
  }

  get isDarkMode(): boolean {
    return this.darkMode.value;
  }

  toggleDarkMode(): void {
    this.setDarkMode(!this.darkMode.value);
  }

  setDarkMode(dark: boolean): void {
    this.darkMode.next(dark);
    localStorage.setItem(this.STORAGE_KEY, String(dark));

    if (dark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }
}
