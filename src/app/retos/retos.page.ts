import { Component, OnInit, OnDestroy } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { GeminiService } from '../services/gemini.service';
import { ThemeService } from '../services/theme.service';
import { ProgresoService } from '../services/progreso.service';
import { LocationService, NearbyPOI, GeofenceEvent, UrbanMetrics } from '../services/location.service';
import { EnvironmentService } from '../services/environment.service';
import { IarriService } from '../services/iarri.service';
import { Subscription, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { NotificationsService, AppNotification } from '../services/notifications.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-retos',
  templateUrl: './retos.page.html',
  styleUrls: ['./retos.page.scss'],
  standalone: false,
})
export class RetosPage implements OnInit, OnDestroy {

  isGeneratingAI = false;
  isDarkMode = false;

  // Contexto del usuario
  usuarioMunicipio = 'Cargando...';
  usuarioIARRI = 'Riesgo Moderado';
  private currentWeather: any = null;
  private nearbyPOIs: NearbyPOI[] = [];
  private walkScore = 50;
  private greenScore = 50;

  get puntos_actuales() { return this.progresoService.puntos_actuales; }
  get puntos_meta() { return this.progresoService.puntos_meta; }

  get progresoSemanal(): number {
    return this.progresoService.progresoSemanal;
  }

  get puntosFaltantes(): number {
    return this.progresoService.puntosFaltantes;
  }

  misionFilter = 'pendientes';
  private STORAGE_KEY_RETOS = 'app_retos_list';

  private saveRetosLocally() {
    localStorage.setItem(this.STORAGE_KEY_RETOS, JSON.stringify(this.retos));
  }

  private loadRetosLocally() {
    const stored = localStorage.getItem(this.STORAGE_KEY_RETOS);
    if (stored) {
      try {
        const arr = JSON.parse(stored);
        if (arr && arr.length > 0) {
          this.retos = arr;
        }
      } catch (e) { }
    }
  }

  retos: any[] = [
    { id: 'caminata', title: 'Caminata Exploratoria', desc: 'Camina 5,000 pasos en tu vecindario', icon: 'walk', color: 'success', points: 60, completed: false, en_progreso: false },
    { id: 'huerto', title: 'Huerto Urbano', desc: 'Planta una hierba aromática en tu ventana', icon: 'leaf', color: 'success', points: 100, completed: false, en_progreso: false },
    { id: 'luz_aire', title: 'Luz y Aire', desc: 'Abre 3 ventanas para ventilación cruzada', icon: 'grid', color: 'success', points: 20, completed: false, en_progreso: false }
  ];

  get retosFiltrados() {
    return this.retos.filter(r => this.misionFilter === 'completadas' ? r.completed : !r.completed);
  }

  get insignias() {
    return this.progresoService.insignias;
  }

  selectedBadge: any = null;
  isBadgeModalOpen = false;
  mostrarTodasInsignias = false;

  // ─── Dropdown states ────────────────────────────────────────────────────
  showNotifications = false;
  showProfile = false;
  notifications: AppNotification[] = [];
  userFullName = 'Usuario';
  userTestInterpretation = '';
  userTestScore = 0;
  userTestDate = '';
  userLocationName = 'Desconocida';

  private subs = new Subscription();

  toggleInsignias() {
    this.mostrarTodasInsignias = !this.mostrarTodasInsignias;
  }

  constructor(
    private alertController: AlertController,
    private geminiService: GeminiService,
    private themeService: ThemeService,
    public progresoService: ProgresoService,
    private locationService: LocationService,
    private environmentService: EnvironmentService,
    private iarriService: IarriService,
    public notificationsService: NotificationsService,
    private router: Router,
    private authService: AuthService
  ) { }

  get unreadCount$() { return this.notificationsService.unreadCount$; }

  // ─── Dropdown Handlers ─────────────────────────────────────────────────

  toggleNotifications(event: Event) {
    event.stopPropagation();
    this.showProfile = false;
    this.showNotifications = !this.showNotifications;
  }

  toggleProfile(event: Event) {
    event.stopPropagation();
    this.showNotifications = false;
    this.showProfile = !this.showProfile;
  }

  closeDropdowns() {
    this.showNotifications = false;
    this.showProfile = false;
  }

  markNotifAsRead(notif: AppNotification) {
    this.notificationsService.markAsRead(notif.id);
  }

  markAllRead() {
    this.notificationsService.markAllAsRead();
  }

  getTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Ahora';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `Hace ${diffHr}h`;
    const diffDays = Math.floor(diffHr / 24);
    return `Hace ${diffDays}d`;
  }

  getRiskClass(): string {
    const interp = this.userTestInterpretation.toLowerCase();
    if (interp.includes('bajo')) return 'risk-bajo';
    if (interp.includes('moderado')) return 'risk-moderado';
    return 'risk-alto';
  }

  async cerrarSesion() {
    const alert = await this.alertController.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro? Tu progreso se guardará y podrás recuperarlo al iniciar sesión de nuevo.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Sí, cerrar sesión',
          role: 'destructive',
          handler: () => {
            this.authService.logout();
            this.closeDropdowns();
            this.router.navigate(['/auth'], { replaceUrl: true });
          }
        }
      ]
    });
    await alert.present();
  }

  private loadUserData() {
    const stored = localStorage.getItem('health_baseline');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data?.name) this.userFullName = data.name.trim();
        this.userTestScore = data?.score || 0;
        this.userTestInterpretation = data?.interpretation || 'Sin evaluar';
        if (data?.timestamp) {
          const d = new Date(data.timestamp);
          this.userTestDate = d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
        }
      } catch { }
    }
  }

  ngOnInit() {
    this.loadRetosLocally();
    this.loadUserData();

    this.themeService.isDarkMode$.subscribe(dark => {
      this.isDarkMode = dark;
    });

    this.subs.add(
      this.notificationsService.notifications$.subscribe(notifs => {
        this.notifications = notifs;
      })
    );

    this.subs.add(
      this.locationService.locationName$.subscribe(name => {
        if (name && name !== 'Obteniendo ubicación...') {
          this.usuarioMunicipio = name;
        }
      })
    );

    const storedBaseline = localStorage.getItem('health_baseline');
    if (storedBaseline) {
      try {
        const data = JSON.parse(storedBaseline);
        if (data?.interpretation) {
          this.usuarioIARRI = data.interpretation;
        }
      } catch (e) { }
    }

    this.subs.add(
      this.locationService.metrics$.pipe(
        filter((m): m is UrbanMetrics => m !== null)
      ).subscribe(metrics => {
        this.walkScore = metrics.caminabilidad;
        this.greenScore = metrics.areasVerdes;
      })
    );

    this.subs.add(
      this.locationService.nearbyPOIs$.subscribe(pois => {
        this.nearbyPOIs = pois;
      })
    );

    this.subs.add(
      this.locationService.coords$.pipe(
        filter((c): c is NonNullable<typeof c> => c !== null)
      ).subscribe(async coords => {
        try {
          this.currentWeather = await this.environmentService.getWeather(coords.lat, coords.lng);
        } catch (e) {
          console.warn('[RetosPage] Error obteniendo clima:', e);
        }
      })
    );

    this.subs.add(
      this.locationService.geofenceEvent$.subscribe(async (event: GeofenceEvent) => {
        console.log('[RetosPage] Geocerca detectada, generando reto contextual...');
        await this.generarRetoDesdeGeocerca(event);
      })
    );

    // Sync completed state from ProgresoService on init
    this.syncCompletedRetos();
  }

  ionViewWillEnter() {
    // Check for day change when user enters the page
    this.progresoService.verificarCambioTemporal();
    this.syncCompletedRetos();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  private syncCompletedRetos() {
    const completedIds = this.progresoService.completedRetoIds;
    let modified = false;
    for (const reto of this.retos) {
      const shouldBeCompleted = completedIds.includes(reto.id);
      if (reto.completed !== shouldBeCompleted) {
        reto.completed = shouldBeCompleted;
        modified = true;
      }
    }
    if (modified) {
      this.saveRetosLocally();
    }
  }



  toggleTheme() {
    this.themeService.toggleDarkMode();
  }

  misionFilterChanged(event: any) {
    this.misionFilter = event.detail.value;
  }

  openBadgeModal(badge: any) {
    this.selectedBadge = badge;
    this.isBadgeModalOpen = true;
  }

  closeBadgeModal() {
    this.isBadgeModalOpen = false;
  }

  async generarRetoDinamico() {
    this.isGeneratingAI = true;
    try {
      const completedTitles = this.retos.filter(r => r.completed).map(r => r.title);

      const nuevoReto = await this.geminiService.generarNuevoReto(
        this.usuarioIARRI,
        this.usuarioMunicipio,
        completedTitles,
        this.currentWeather,
        this.nearbyPOIs,
        this.walkScore,
        this.greenScore
      );

      this.retos.unshift(nuevoReto);
      this.misionFilter = 'pendientes';
      this.saveRetosLocally();

      this.progresoService.incrementIaGenerados();
      this.verificarInsignias();
    } catch (e: any) {
      const alert = await this.alertController.create({
        header: 'Aviso IA',
        message: 'Detalle del error: ' + (e.message || JSON.stringify(e)),
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isGeneratingAI = false;
    }
  }

  private async generarRetoDesdeGeocerca(event: GeofenceEvent) {
    if (this.isGeneratingAI) return;

    try {
      const nuevoReto = await this.geminiService.generarRetoGeofence(
        this.usuarioMunicipio,
        this.usuarioIARRI,
        this.currentWeather,
        event.pois,
        event.walkScore,
        event.greenScore
      );

      nuevoReto.geofence_triggered = true;

      const isDuplicate = this.retos.some(r => r.title === nuevoReto.title);
      if (!isDuplicate) {
        this.retos.unshift(nuevoReto);
        this.misionFilter = 'pendientes';
        this.saveRetosLocally();

        const alert = await this.alertController.create({
          header: '🌿 ¡Nuevo Reto Disponible!',
          message: `"${nuevoReto.title}" — ${nuevoReto.desc}`,
          buttons: ['¡Vamos!']
        });
        await alert.present();
      }
    } catch (e) {
      console.warn('[RetosPage] Error generando reto desde geocerca:', e);
    }
  }

  async iniciarReto(reto: any) {
    if (reto.completed || reto.en_progreso) return;

    if (reto.id === 'caminata') {
      reto.en_progreso = true;
      setTimeout(() => {
        this.completarReto(reto);
        reto.en_progreso = false;
      }, 4000);

    } else if (reto.id === 'luz_aire') {
      const alert = await this.alertController.create({
        header: 'Sistema de Honor',
        message: '¿Confirmo bajo mi honor que he abierto 3 ventanas para ventilación cruzada?',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Confirmar', handler: () => { this.completarReto(reto); } }
        ]
      });
      await alert.present();

    } else if (reto.id === 'huerto') {
      try {
        const image = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          promptLabelHeader: 'Evidencia fotográfica'
        });
        if (image) {
          this.completarReto(reto);
        }
      } catch (error) {
        console.log('Error o cancelado', error);
      }
    } else {
      const alert = await this.alertController.create({
        header: 'Completar Misión',
        message: `¿Has completado el reto "${reto.title}" y deseas reclamar tus puntos?`,
        buttons: [
          { text: 'Aún no', role: 'cancel' },
          { text: 'Sí, lo hice', handler: () => { this.completarReto(reto); } }
        ]
      });
      await alert.present();
    }
  }

  completarReto(reto: any) {
    reto.completed = true;
    this.saveRetosLocally();
    this.progresoService.addPointsAndStats(reto.points, reto.id);
    this.verificarInsignias();
  }

  async verificarInsignias() {
    let nuevasInsignias = this.progresoService.verificarInsignias();

    if (nuevasInsignias.length > 0) {
      const alert = await this.alertController.create({
        header: '¡Felicidades!',
        message: 'Has desbloqueado nuevas insignias: ' + nuevasInsignias.join(', '),
        buttons: ['¡Genial!']
      });
      await alert.present();
    }
  }

}
