import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface AppNotification {
  id: number;
  title: string;
  body: string;
  date: string; // ISO string for localStorage serialization
  read: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  private STORAGE_KEY = 'app_notifications';

  private notificationsSource = new BehaviorSubject<AppNotification[]>([]);
  public notifications$ = this.notificationsSource.asObservable();

  private unreadCountSource = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSource.asObservable();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const notifs: AppNotification[] = JSON.parse(stored);
        this.notificationsSource.next(notifs);
        this.updateUnreadCount();
      }
    } catch (e) {
      console.warn('[NotificationsService] Error loading from storage:', e);
    }
  }

  private saveToStorage() {
    try {
      const current = this.notificationsSource.getValue();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(current));
    } catch (e) {
      console.warn('[NotificationsService] Error saving to storage:', e);
    }
  }

  addNotification(title: string, body: string) {
    const current = this.notificationsSource.getValue();
    const newNotif: AppNotification = {
      id: new Date().getTime(),
      title,
      body,
      date: new Date().toISOString(),
      read: false
    };
    this.notificationsSource.next([newNotif, ...current]);
    this.updateUnreadCount();
    this.saveToStorage();
  }

  markAsRead(id: number) {
    const current = this.notificationsSource.getValue();
    const idx = current.findIndex(n => n.id === id);
    if (idx !== -1) {
      current[idx].read = true;
      this.notificationsSource.next([...current]);
      this.updateUnreadCount();
      this.saveToStorage();
    }
  }

  markAllAsRead() {
    const current = this.notificationsSource.getValue();
    current.forEach(n => n.read = true);
    this.notificationsSource.next([...current]);
    this.updateUnreadCount();
    this.saveToStorage();
  }

  clearAll() {
    this.notificationsSource.next([]);
    this.unreadCountSource.next(0);
    this.saveToStorage();
  }

  private updateUnreadCount() {
    const current = this.notificationsSource.getValue();
    const unread = current.filter(n => !n.read).length;
    this.unreadCountSource.next(unread);
  }
}
