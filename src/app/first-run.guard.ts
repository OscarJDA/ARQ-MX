import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from './services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class FirstRunGuard implements CanActivate {
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  canActivate(): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
    // 1. Check if user is logged in
    if (!this.authService.isLoggedIn()) {
      return this.router.parseUrl('/auth');
    }

    // 2. Check if user has completed the initial questionnaire
    const healthBaseline = localStorage.getItem('health_baseline');
    if (healthBaseline) {
      return true;
    } else {
      return this.router.parseUrl('/first-run');
    }
  }
}
