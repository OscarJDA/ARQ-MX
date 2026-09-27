import { Injectable } from '@angular/core';

export interface UserAccount {
  email: string;
  passwordHash: string;
  createdAt: string;
  data: { [key: string]: any }; // all user data stored here
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private ACCOUNTS_KEY = 'hs_accounts';
  private SESSION_KEY = 'hs_session';

  /** All localStorage keys that belong to a user session */
  private USER_DATA_KEYS = [
    'health_baseline',
    'app_progreso',
    'app_retos_list',
    'app_notifications',
    'app_daily_steps',
    'app_steps_date',
    'dark_mode'
  ];

  constructor() {}

  // ─── Simple hash (not crypto-secure but sufficient for local-only storage) ──
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    // Add salt + double hash for slightly better obfuscation
    const salted = `hs_${str}_salt_${hash}`;
    let hash2 = 0;
    for (let i = 0; i < salted.length; i++) {
      const char = salted.charCodeAt(i);
      hash2 = ((hash2 << 5) - hash2) + char;
      hash2 |= 0;
    }
    return `${hash.toString(36)}_${hash2.toString(36)}`;
  }

  private getAccounts(): UserAccount[] {
    try {
      const stored = localStorage.getItem(this.ACCOUNTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveAccounts(accounts: UserAccount[]) {
    localStorage.setItem(this.ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Register a new account. Returns error message or null on success.
   */
  register(email: string, password: string): string | null {
    const normalizedEmail = email.trim().toLowerCase();
    const accounts = this.getAccounts();

    if (accounts.find(a => a.email === normalizedEmail)) {
      return 'Ya existe una cuenta con este correo electrónico.';
    }

    const newAccount: UserAccount = {
      email: normalizedEmail,
      passwordHash: this.simpleHash(password),
      createdAt: new Date().toISOString(),
      data: {}
    };

    accounts.push(newAccount);
    this.saveAccounts(accounts);

    // Auto-login after registration
    this.setSession(normalizedEmail);
    return null;
  }

  /**
   * Login with existing credentials. Returns error message or null on success.
   */
  login(email: string, password: string): string | null {
    const normalizedEmail = email.trim().toLowerCase();
    const accounts = this.getAccounts();
    const account = accounts.find(a => a.email === normalizedEmail);

    if (!account) {
      return 'No existe una cuenta con este correo.';
    }

    if (account.passwordHash !== this.simpleHash(password)) {
      return 'Contraseña incorrecta.';
    }

    // Restore all user data to localStorage
    this.restoreUserData(account);
    this.setSession(normalizedEmail);
    return null;
  }

  /**
   * Save current session data and clear session (logout).
   */
  logout() {
    this.saveCurrentUserData();
    // Clear user-specific data from active localStorage
    this.USER_DATA_KEYS.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(this.SESSION_KEY);
  }

  /**
   * Check if there is an active session.
   */
  isLoggedIn(): boolean {
    return !!localStorage.getItem(this.SESSION_KEY);
  }

  /**
   * Get the current logged-in email.
   */
  getCurrentEmail(): string | null {
    return localStorage.getItem(this.SESSION_KEY);
  }

  /**
   * Check if the current user has completed the initial questionnaire.
   */
  hasCompletedBaseline(): boolean {
    return !!localStorage.getItem('health_baseline');
  }

  /**
   * Persist all current localStorage data into the user's account record.
   * Call this before logout or periodically.
   */
  saveCurrentUserData() {
    const email = this.getCurrentEmail();
    if (!email) return;

    const accounts = this.getAccounts();
    const account = accounts.find(a => a.email === email);
    if (!account) return;

    // Snapshot all user data keys
    account.data = {};
    this.USER_DATA_KEYS.forEach(key => {
      const val = localStorage.getItem(key);
      if (val !== null) {
        account.data[key] = val;
      }
    });

    this.saveAccounts(accounts);
  }

  // ─── Internal helpers ───────────────────────────────────────────────────

  private setSession(email: string) {
    localStorage.setItem(this.SESSION_KEY, email);
  }

  private restoreUserData(account: UserAccount) {
    // Clear existing user data first
    this.USER_DATA_KEYS.forEach(key => localStorage.removeItem(key));

    // Restore from account
    if (account.data) {
      Object.keys(account.data).forEach(key => {
        localStorage.setItem(key, account.data[key]);
      });
    }
  }
}
