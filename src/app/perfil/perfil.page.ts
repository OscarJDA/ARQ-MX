import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { IarriService } from '../services/iarri.service';
import { ThemeService } from '../services/theme.service';
import { EnvironmentService } from '../services/environment.service';
import { HealthService } from '../services/health.service';
import { LocationService, LocationCoords, UrbanMetrics, NearbyPOI } from '../services/location.service';
import { NotificationsService, AppNotification } from '../services/notifications.service';
import { ProgresoService } from '../services/progreso.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  standalone: false,
})
export class PerfilPage implements OnInit, OnDestroy {

  userName = 'Usuario';
  userFullName = 'Usuario';
  userLocationName = 'Obteniendo ubicación...';
  isDarkMode = false;

  // IARRI base variables (0–1)
  ear = 0.0;
  ed = 0.0;
  av = 0.0;
  im = 0.0;
  ic = 0.0;
  private denueEar = 0.0; // EAR crudo de DENUE/INEGI

  iarri = 0;
  riesgoLabel = '';
  riesgoColor = '';

  // UI bindings
  caminabilidad = 0;
  conectividad = 0;
  areasVerdes = 0;

  aqi = 0;
  environmentalTip = 'Calculando calidad del aire...';
  dailySteps = 0;

  isLoadingMetrics = false;
  locationError: string | null = null;

  displayCaminabilidad = 0;
  displayConectividad = 0;
  displayAreasVerdes = 0;
  displayIarri = 0;

  walkabilityImpact = 'Analizando entorno...';

  weatherData: any = null;
  isLoadingWeather = true;

  ultimosRetos: any[] = [];

  get currentHour(): number {
    return new Date().getHours();
  }

  getWeatherIcon(): string {
    if (!this.weatherData) return 'cloud-outline';
    const cond = (this.weatherData.condition || '').toLowerCase();
    if (cond.includes('tormenta')) return 'thunderstorm-outline';
    if (cond.includes('lluvia') || cond.includes('chubasco')) return 'rainy-outline';
    if (cond.includes('nieve')) return 'snow-outline';
    if (cond.includes('neblina')) return 'cloud-outline';
    if (cond.includes('nublado')) return 'partly-sunny-outline';
    return 'sunny-outline';
  }

  getWeatherGradient(): string {
    if (!this.weatherData) return 'rgba(234, 247, 237, 1)'; // Fallback tip-card green
    const cond = (this.weatherData.condition || '').toLowerCase();
    const hora = this.currentHour;

    // Tonos pastel muy sutiles para combinar con el diseño blanco/verde
    if (cond.includes('tormenta')) return 'linear-gradient(135deg, #E0E8F5, #CFD9E8)';
    if (cond.includes('lluvia')) return 'linear-gradient(135deg, #E8F0F2, #D4DFE2)';
    if (cond.includes('nieve')) return 'linear-gradient(135deg, #F5F7FA, #E8EDF2)';
    if (cond.includes('nublado') || cond.includes('neblina')) return 'linear-gradient(135deg, #F0F2F5, #E1E5EA)';

    // Despejado
    if (hora >= 6 && hora < 12) return 'linear-gradient(135deg, #FFF6E5, #FFE4B5)';
    if (hora >= 12 && hora < 18) return 'linear-gradient(135deg, #EAF7ED, #D1E8D8)'; // Green tint
    if (hora >= 18 && hora < 20) return 'linear-gradient(135deg, #FFF0E5, #FFDAB9)'; // Peach
    return 'linear-gradient(135deg, #EAF2F8, #D4E6F1)'; // Light blue night
  }

  getWeatherAdvice(): string {
    if (!this.weatherData) return 'Obteniendo datos meteorológicos...';
    const w = this.weatherData;
    const condLower = (w.condition || '').toLowerCase();
    const hora = this.currentHour;

    if (condLower.includes('tormenta')) return 'Tormenta activa. Permanece en interior y evita actividades al exterior.';
    if (w.precipitation > 0 || condLower.includes('lluvia')) return 'Está lloviendo. Ideal para retos de interior: estiramientos, meditación o hidratación.';
    if (w.uv_index > 7) return 'UV muy alto. Evita exposición solar directa. Hidrátate constantemente.';
    if (w.temp > 33) return 'Calor extremo. Evita actividad física al exterior. Mantente hidratado.';
    if (w.temp < 5) return 'Frío intenso. Abrígate bien si sales. Preferible ejercicio en interiores.';
    if (hora >= 20 || hora < 6) return 'Es de noche. Aprovecha para retos de interior y prepararte para descansar.';
    if (hora >= 18) return 'Última luz del día. Buen momento para una caminata corta.';
    if (condLower.includes('nublado')) return 'Día nublado, buen clima para caminar sin exposición solar excesiva.';
    return 'Clima favorable para actividades al aire libre. ¡Aprovecha!';
  }

  getAdviceIcon(): string {
    if (!this.weatherData) return 'information-circle-outline';
    const w = this.weatherData;
    const condLower = (w.condition || '').toLowerCase();
    const hora = this.currentHour;

    if (condLower.includes('tormenta')) return 'warning-outline';
    if (w.precipitation > 0 || condLower.includes('lluvia')) return 'water-outline';
    if (w.uv_index > 7) return 'sunny';
    if (w.temp > 33) return 'thermometer-outline';
    if (w.temp < 5) return 'snow-outline';
    if (hora >= 20 || hora < 6) return 'moon-outline';
    if (hora >= 18) return 'walk-outline';
    if (condLower.includes('nublado')) return 'cloud-done-outline';
    return 'checkmark-circle-outline';
  }

  // ─── Dropdown states ────────────────────────────────────────────────────
  showNotifications = false;
  showProfile = false;
  notifications: AppNotification[] = [];

  // User profile data
  userTestScore = 0;
  userTestInterpretation = '';
  userTestDate = '';

  get iarm() { return this.displayIarri; }

  private subs = new Subscription();
  private animFrames: any[] = [];

  constructor(
    private iarriService: IarriService,
    private themeService: ThemeService,
    private environmentService: EnvironmentService,
    private healthService: HealthService,
    private locationService: LocationService,
    public notificationsService: NotificationsService,
    public progresoService: ProgresoService,
    private router: Router,
    private alertController: AlertController,
    private authService: AuthService
  ) { }

  get unreadCount$() { return this.notificationsService.unreadCount$; }

  ngOnInit() {
    this.loadUserData();
    this.loadHealthData();

    this.subs.add(
      this.themeService.isDarkMode$.subscribe(dark => { this.isDarkMode = dark; })
    );

    this.subs.add(
      this.notificationsService.notifications$.subscribe(notifs => {
        this.notifications = notifs;
      })
    );

    this.subs.add(
      this.locationService.locationName$.subscribe(name => {
        this.userLocationName = name;
        // Obtener Índice de Marginación real del municipio detectado
        this.iarriService.getMarginIndex(name).subscribe(val => {
          this.im = val;
          this.calculateIarri();
        });
      })
    );

    this.subs.add(
      this.locationService.isLoading$.subscribe(loading => {
        this.isLoadingMetrics = loading;
      })
    );

    this.subs.add(
      this.locationService.metrics$.subscribe(metrics => {
        if (metrics) {
          this.applyMetrics(metrics);
        }
      })
    );

    this.subs.add(
      this.locationService.coords$.subscribe(coords => {
        if (coords) {
          this.fetchEnvironmentData(coords.lat, coords.lng);
        }
      })
    );

    // POIs reales del mapa → ED y EAR ajustados
    this.subs.add(
      this.locationService.nearbyPOIs$.subscribe(pois => {
        if (pois && pois.length > 0) {
          this.updateFromPOIs(pois);
        }
      })
    );

    this.locationService.startTracking().catch(e => {
      console.error('startTracking error:', e);
    });
  }

  ionViewWillEnter() {
    this.loadUltimosRetos();
  }

  loadUltimosRetos() {
    const stored = localStorage.getItem('app_retos_list');
    let allRetos = [];
    if (stored) {
      try {
        allRetos = JSON.parse(stored);
      } catch (e) { }
    }

    if (!allRetos || allRetos.length === 0) {
      allRetos = [
        { id: 'caminata', title: 'Caminata Exploratoria', desc: 'Camina 5,000 pasos en tu vecindario', icon: 'walk', color: 'success', completed: false },
        { id: 'huerto', title: 'Huerto Urbano', desc: 'Planta una hierba aromática en tu ventana', icon: 'leaf', color: 'success', completed: false },
        { id: 'luz_aire', title: 'Luz y Aire', desc: 'Abre 3 ventanas para ventilación cruzada', icon: 'grid', color: 'success', completed: false }
      ];
    }

    // Filtrar los que no están completados
    const pendientes = allRetos.filter((r: any) => !r.completed);
    this.ultimosRetos = pendientes.slice(0, 2);

    // Si no hay pendientes, mostrar los últimos 2 en general
    if (this.ultimosRetos.length === 0) {
      this.ultimosRetos = allRetos.slice(0, 2);
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.locationService.stopTracking();
    this.animFrames.forEach(id => cancelAnimationFrame(id));
  }

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

  verResultadosQuiz() {
    this.closeDropdowns();
    this.router.navigate(['/first-run'], { queryParams: { viewResults: 'true' } });
  }

  async pickProfileImage() {
    try {
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos
      });

      if (image && image.dataUrl) {
        this.progresoService.userProfileImage = image.dataUrl;
        (this.progresoService as any).saveToStorage();
      }
    } catch (e) {
      console.warn('Selección de imagen cancelada o fallida', e);
    }
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

  // ─── Location ──────────────────────────────────────────────────────────

  async getUserLocation() {
    this.userLocationName = 'Buscando ubicación...';
    try {
      this.locationService.stopTracking();
      await this.locationService.startTracking();
    } catch (e) {
      this.userLocationName = 'No se pudo obtener ubicación. Toca para reintentar.';
    }
  }

  async recenterMap() {
    try {
      this.userLocationName = 'Buscando ubicación...';
      await this.locationService.resumeRealLocation();
    } catch (e) {
      this.userLocationName = 'No se pudo obtener ubicación.';
      console.error(e);
    }
  }

  private applyMetrics(metrics: UrbanMetrics) {
    this.caminabilidad = metrics.caminabilidad;
    this.conectividad = metrics.conectividad;
    this.areasVerdes = metrics.areasVerdes;
    this.walkabilityImpact = metrics.walkabilityImpact || 'Analizando entorno...';

    this.ic = metrics.caminabilidad / 100;
    this.av = metrics.areasVerdes / 100;

    this.calculateIarri();
    this.animateBars();
  }

  private animateBars() {
    this.animFrames.forEach(id => cancelAnimationFrame(id));

    const targets = {
      caminabilidad: this.caminabilidad,
      conectividad: this.conectividad,
      areasVerdes: this.areasVerdes,
      iarri: this.iarri
    };

    const duration = 900;
    const start = performance.now();
    const startVals = {
      caminabilidad: this.displayCaminabilidad,
      conectividad: this.displayConectividad,
      areasVerdes: this.displayAreasVerdes,
      iarri: this.displayIarri
    };

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      this.displayCaminabilidad = Math.round(startVals.caminabilidad + (targets.caminabilidad - startVals.caminabilidad) * ease);
      this.displayConectividad = Math.round(startVals.conectividad + (targets.conectividad - startVals.conectividad) * ease);
      this.displayAreasVerdes = Math.round(startVals.areasVerdes + (targets.areasVerdes - startVals.areasVerdes) * ease);
      this.displayIarri = startVals.iarri + (targets.iarri - startVals.iarri) * ease;

      if (t < 1) {
        const id = requestAnimationFrame(tick);
        this.animFrames.push(id);
      }
    };

    const id = requestAnimationFrame(tick);
    this.animFrames.push(id);
  }

  async fetchEnvironmentData(lat: number, lng: number) {
    this.isLoadingWeather = true;
    try {
      const airQuality = await this.environmentService.getAirQuality(lat, lng);
      this.aqi = airQuality.aqi;
      this.environmentalTip = airQuality.recommendation;

      this.weatherData = await this.environmentService.getWeather(lat, lng);
      this.isLoadingWeather = false;

      // Obtener Entorno Alimentario Riesgoso (EAR) REAL del INEGI (DENUE)
      this.iarriService.getDetailedFoodEnvironment(lat, lng).subscribe(earVal => {
        this.denueEar = earVal;
        this.ear = earVal;
        this.calculateIarri();
      });

    } catch (e) {
      console.error('Error fetching environment data', e);
      this.environmentalTip = 'No hay datos ambientales disponibles.';
      this.isLoadingWeather = false;
    }
  }

  async loadHealthData() {
    try {
      await this.healthService.getDailySteps();

      this.subs.add(
        this.healthService.steps$.subscribe(steps => {
          this.dailySteps = steps;
        })
      );
    } catch (e) {
      console.error('Error fetching health data', e);
    }
  }

  loadUserData() {
    const stored = localStorage.getItem('health_baseline');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data?.name) {
          this.userFullName = data.name.trim();
          this.userName = data.name.trim().split(' ')[0];
        }
        this.userTestScore = data?.score || 0;
        this.userTestInterpretation = data?.interpretation || 'Sin evaluar';
        if (data?.timestamp) {
          const d = new Date(data.timestamp);
          this.userTestDate = d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
        }
      } catch { }
    }
  }

  toggleTheme() {
    this.themeService.toggleDarkMode();
  }

  get personalRiskLevel(): 'low' | 'medium' | 'high' {
    if (!this.userTestInterpretation || this.userTestInterpretation === 'Sin evaluar') return 'low';
    const lower = this.userTestInterpretation.toLowerCase();
    if (lower.includes('moderado') || lower.includes('medio')) return 'medium';
    if (lower.includes('alto')) return 'high';
    return 'low';
  }

  /**
   * Calcula ED y ajusta EAR a partir de los POIs reales que se muestran en el mapa.
   */
  private updateFromPOIs(pois: NearbyPOI[]) {
    // ED: Equipamiento Deportivo — cuenta instalaciones tipo 'gym' (gimnasios, canchas, estadios, piscinas, pistas)
    const gymPOIs = pois.filter(p => p.type === 'gym');
    this.ed = Math.min(1, gymPOIs.length / 8); // 8+ instalaciones en 1.2km = 100%

    // EAR: Combinar dato oficial DENUE con proporción de POIs dañinos del mapa
    const harmfulCount = pois.filter(p => p.type === 'fastfood' || p.type === 'bar').length;
    const healthyCount = pois.filter(p =>
      ['park', 'garden', 'playground', 'gym', 'plaza'].includes(p.type)
    ).length;
    const totalRelevant = harmfulCount + healthyCount;

    if (totalRelevant > 0) {
      const osmEar = harmfulCount / totalRelevant;
      // Ponderar: 60% DENUE (dato oficial) + 40% OSM (coherencia con el mapa)
      this.ear = (this.denueEar * 0.6) + (osmEar * 0.4);
    }

    this.calculateIarri();
  }

  calculateIarri() {
    this.iarri = this.iarriService.calculateIarriScore({
      ear: this.ear,
      ed: this.ed,
      av: this.av,
      im: this.im,
      ic: this.ic,
      weather: this.weatherData
    });

    if (this.iarri <= 0.33) {
      this.riesgoLabel = 'Bajo Riesgo';
      this.riesgoColor = 'success';
    } else if (this.iarri <= 0.66) {
      this.riesgoLabel = 'Riesgo Medio';
      this.riesgoColor = 'warning';
    } else {
      this.riesgoLabel = 'Alto Riesgo';
      this.riesgoColor = 'danger';
    }

    this.animateBars();
  }
}
