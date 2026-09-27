import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-auth',
  templateUrl: './auth.page.html',
  styleUrls: ['./auth.page.scss'],
  standalone: false
})
export class AuthPage {

  mode: 'login' | 'register' = 'register';

  // Form fields
  email = '';
  password = '';
  passwordConfirm = '';
  name = '';

  // UI state
  errorMessage = '';
  isLoading = false;
  showPassword = false;
  showPasswordConfirm = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  toggleMode() {
    this.mode = this.mode === 'login' ? 'register' : 'login';
    this.errorMessage = '';
    this.password = '';
    this.passwordConfirm = '';
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  togglePasswordConfirmVisibility() {
    this.showPasswordConfirm = !this.showPasswordConfirm;
  }

  // ─── Validation ────────────────────────────────────────────────────────

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  private validateRegister(): string | null {
    if (!this.email.trim()) return 'Ingresa tu correo electrónico.';
    if (!this.isValidEmail(this.email)) return 'El formato del correo no es válido.';
    if (!this.password) return 'Ingresa una contraseña.';
    if (this.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    if (this.password !== this.passwordConfirm) return 'Las contraseñas no coinciden.';
    return null;
  }

  private validateLogin(): string | null {
    if (!this.email.trim()) return 'Ingresa tu correo electrónico.';
    if (!this.isValidEmail(this.email)) return 'El formato del correo no es válido.';
    if (!this.password) return 'Ingresa tu contraseña.';
    return null;
  }

  // ─── Actions ───────────────────────────────────────────────────────────

  async onSubmit() {
    this.errorMessage = '';

    if (this.mode === 'register') {
      const validationError = this.validateRegister();
      if (validationError) {
        this.errorMessage = validationError;
        return;
      }

      this.isLoading = true;
      // Small delay for UX feedback
      await new Promise(r => setTimeout(r, 400));

      const error = this.authService.register(this.email, this.password);
      this.isLoading = false;

      if (error) {
        this.errorMessage = error;
        return;
      }

      // Registration successful — go to first-run questionnaire
      this.router.navigate(['/first-run'], { replaceUrl: true });

    } else {
      const validationError = this.validateLogin();
      if (validationError) {
        this.errorMessage = validationError;
        return;
      }

      this.isLoading = true;
      await new Promise(r => setTimeout(r, 400));

      const error = this.authService.login(this.email, this.password);
      this.isLoading = false;

      if (error) {
        this.errorMessage = error;
        return;
      }

      // Login successful
      if (this.authService.hasCompletedBaseline()) {
        // User already did the questionnaire, go to main app
        this.router.navigate(['/'], { replaceUrl: true });
      } else {
        // User registered before but hasn't done the questionnaire
        this.router.navigate(['/first-run'], { replaceUrl: true });
      }
    }
  }
}
