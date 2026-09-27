import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { MapService } from '../services/map.service';
import { LocationService } from '../services/location.service';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { ThemeService } from '../services/theme.service';
import { Subscription } from 'rxjs';
import * as mapboxgl from 'mapbox-gl';
import { NotificationsService, AppNotification } from '../services/notifications.service';
import { ProgresoService } from '../services/progreso.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-mapa',
  templateUrl: './mapa.page.html',
  styleUrls: ['./mapa.page.scss'],
  standalone: false,
})
export class MapaPage implements OnInit, OnDestroy {

  colonia = 'Selecciona una zona';
  isSheetOpen = false;
  selectedZone: any = null;
  isDarkMode = false;

  // Panel de métricas dinámico
  caminabilidadPts = 0;
  areasVerdesPts = 0;
  entornoScore = 0;
  locationLabel = '';

  // ─── Dropdown states ────────────────────────────────────────────────────
  showNotifications = false;
  showProfile = false;
  notifications: AppNotification[] = [];
  userFullName = 'Usuario';
  userTestInterpretation = '';
  userTestScore = 0;
  userTestDate = '';
  userLocationName = 'Desconocida';

  // Marcador del usuario
  private userMarker: mapboxgl.Marker | null = null;
  private nativeWatchId: number | null = null;
  private mapLoaded = false;

  private subs = new Subscription();

  zones: any[] = [];
  private poiMarkers: mapboxgl.Marker[] = [];

  isLoadingMetrics = false;
  private currentUserCoords: any = null;
  isSimulating = false;

  constructor(
    private mapService: MapService,
    private locationService: LocationService,
    private router: Router,
    private themeService: ThemeService,
    private ngZone: NgZone,
    public notificationsService: NotificationsService,
    public progresoService: ProgresoService,
    private alertController: AlertController,
    private authService: AuthService,
    private toastController: ToastController
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
    this.loadUserData();

    this.subs.add(
      this.themeService.isDarkMode$.subscribe(dark => { this.isDarkMode = dark; })
    );

    this.subs.add(
      this.notificationsService.notifications$.subscribe(notifs => {
        this.notifications = notifs;
      })
    );

    this.subs.add(
      this.locationService.metrics$.subscribe(metrics => {
        if (metrics) {
          this.ngZone.run(() => {
            this.caminabilidadPts = Math.round(metrics.caminabilidad * 1.5);
            this.areasVerdesPts = Math.round(metrics.areasVerdes);
            this.entornoScore = Math.round(
              (metrics.caminabilidad + metrics.conectividad + metrics.areasVerdes) / 3
            );
          });
        }
      })
    );

    this.subs.add(
      this.locationService.locationName$.subscribe(name => {
        if (name && name !== 'Obteniendo ubicación...' && name !== 'Buscando ubicación...') {
          this.ngZone.run(() => { this.locationLabel = name; });
        }
      })
    );

    // Suscribirse a POIs (Áreas Verdes reales)
    this.subs.add(
      this.locationService.nearbyPOIs$.subscribe(pois => {
        if (this.mapLoaded && pois && pois.length > 0) {
          this.renderPOIMarkers(pois);
        }
      })
    );

    this.subs.add(
      this.locationService.isLoading$.subscribe(loading => {
        this.isLoadingMetrics = loading;
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.stopWatch();
    this.userMarker?.remove();
    this.userMarker = null;
  }

  ionViewDidEnter() {
    this.initMap();
  }

  ionViewWillLeave() {
    this.stopWatch();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAPA
  // ═══════════════════════════════════════════════════════════════════════════

  private initMap() {
    this.userMarker = null;
    this.mapLoaded = false;

    this.mapService.buildMap('map');
    if (!this.mapService.map) return;

    this.mapService.map.once('load', () => {
      this.mapLoaded = true;
      console.log('[Mapa] Mapa cargado. Buscando áreas verdes...');

      // Forzar rebúsqueda y renderizado de lo que ya tengamos
      const currentPois = (this.locationService as any)._nearbyPOIs?.getValue() || [];
      if (currentPois.length > 0) {
        this.renderPOIMarkers(currentPois);
      }

      this.locationService.fetchOnce().then(coords => {
        this.locationService.discoverNearbyPOIs(coords);
      }).catch(() => {});

      // Obtener ubicación DIRECTAMENTE con navigator.geolocation
      this.getUserLocationDirect();

      // Permitir al usuario simular ubicaciones haciendo clic en el mapa
      this.mapService.map!.on('click', async (e) => {
        this.ngZone.run(async () => {
          this.isSimulating = true;
          const lng = e.lngLat.lng;
          const lat = e.lngLat.lat;
          
          this.placeUserMarker(lat, lng, true);
          this.locationService.setSimulatedLocation(lat, lng);

          const toast = await this.toastController.create({
            message: 'Analizando esta zona...',
            duration: 2000,
            position: 'top',
            color: 'primary',
            cssClass: 'analysis-toast',
            icon: 'location'
          });
          toast.present();
        });
      });
    });
  }


  /** Clasifica un tipo de POI en una de las 4 categorías del IARRI */
  private classifyPOI(type: string): { category: string; color: string; icon: string } {
    switch (type) {
      case 'park':
      case 'garden':
      case 'playground':
      case 'plaza':
        return { category: 'areasVerdes', color: '#2E9E49', icon: 'leaf' };       // Verde
      case 'fastfood':
      case 'bar':
        return { category: 'ultraprocesados', color: '#E53935', icon: 'fast-food' }; // Rojo
      case 'gym':
        return { category: 'deportivos', color: '#1976D2', icon: 'fitness' };     // Azul
      case 'path':
        return { category: 'rutasCaminables', color: '#FBC02D', icon: 'walk' };   // Amarillo
      default:
        return { category: 'areasVerdes', color: '#2E9E49', icon: 'leaf' };
    }
  }

  private renderPOIMarkers(pois: any[]) {
    // Limpiar marcadores anteriores
    this.poiMarkers.forEach(m => m.remove());
    this.poiMarkers = [];

    pois.forEach(poi => {
      const { category, color, icon } = this.classifyPOI(poi.type);

      // SVG icons por categoría
      const svgIcons: Record<string, string> = {
        leaf: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66L7 19c4-1 7-4 8-8l-2 1c-1 2-3 4-5.5 5.5 1-2 2-4.5 3.5-6.5 1.5-2 4-4 6-4.5C19 4 20 2 20 2s-2 2-3 6z"/></svg>`,
        'fast-food': `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
        fitness: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/></svg>`,
        walk: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z"/></svg>`
      };

      const el = document.createElement('div');
      el.className = `poi-marker poi-marker--${category}`;
      el.innerHTML = `
        <div class="poi-pin" style="--pin-color: ${color}">
          <div class="poi-icon" style="background-color: ${color};">
            ${svgIcons[icon] || svgIcons['leaf']}
          </div>
          <div class="poi-shadow"></div>
        </div>
      `;

      const marker = new (mapboxgl as any).Marker({ element: el, anchor: 'bottom' })
        .setLngLat([poi.lng, poi.lat])
        .addTo(this.mapService.map!);

      marker.getElement().addEventListener('click', (e: Event) => {
        e.stopPropagation();
        this.ngZone.run(() => {
          this.selectZone({
            name: poi.name,
            lng: poi.lng,
            lat: poi.lat,
            riskScore: 0.20,
            riskLevel: this.getPOIBadgeLabel(poi.type),
            color: color,
            desc: this.buildPOIDescription(poi),
            isFlatAndShaded: true
          });
        });
      });

      this.poiMarkers.push(marker);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GPS DIRECTO — SIN depender de BehaviorSubject/Observable timing
  // ═══════════════════════════════════════════════════════════════════════════

  private getUserLocationDirect() {
    if (!navigator?.geolocation) {
      console.warn('[Mapa] navigator.geolocation no disponible');
      return;
    }

    console.log('[Mapa] Solicitando getCurrentPosition...');

    // Intento 1: alta precisión
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('[Mapa] getCurrentPosition éxito:', pos.coords.latitude, pos.coords.longitude);
        this.currentUserCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.ngZone.run(() => {
          this.placeUserMarker(pos.coords.latitude, pos.coords.longitude, true);
        });
        // Iniciar watch continuo
        this.startDirectWatch();
      },
      (err1) => {
        console.warn('[Mapa] getCurrentPosition (alta precisión) falló:', err1);
        // Intento 2: baja precisión
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log('[Mapa] getCurrentPosition (baja) éxito:', pos.coords.latitude, pos.coords.longitude);
            this.ngZone.run(() => {
              this.placeUserMarker(pos.coords.latitude, pos.coords.longitude, true);
            });
            this.startDirectWatch();
          },
          (err2) => {
            console.error('[Mapa] Ambos intentos de getCurrentPosition fallaron:', err2);
            // Intento 3: suscribirse al servicio compartido como último recurso
            this.subs.add(
              this.locationService.coords$.subscribe(coords => {
                this.currentUserCoords = coords;
                if (coords && this.mapLoaded) {
                  const shouldFly = !this.userMarker;
                  this.ngZone.run(() => this.placeUserMarker(coords.lat, coords.lng, shouldFly));
                }
              })
            );
          },
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  private startDirectWatch() {
    this.stopWatch();

    if (!navigator?.geolocation) return;

    this.nativeWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Actualizar coordenadas reales siempre en background, 
        // pero no mover el marcador si estamos simulando.
        this.currentUserCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        
        if (this.isSimulating) return;

        this.ngZone.run(() => {
          this.placeUserMarker(pos.coords.latitude, pos.coords.longitude, false);
        });
      },
      (err) => console.warn('[Mapa] watchPosition error:', err),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
  }

  private stopWatch() {
    if (this.nativeWatchId !== null) {
      navigator.geolocation?.clearWatch(this.nativeWatchId);
      this.nativeWatchId = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MARCADOR VERDE
  // ═══════════════════════════════════════════════════════════════════════════

  private placeUserMarker(lat: number, lng: number, flyTo: boolean) {
    if (!this.mapService.map) return;

    if (this.userMarker) {
      this.userMarker.setLngLat([lng, lat]);
    } else {
      const el = document.createElement('div');
      el.className = 'current-location-marker';
      el.innerHTML = `
        <div class="user-dot-wrapper">
          <div class="user-dot"></div>
          <div class="user-dot-pulse"></div>
        </div>
      `;

      this.userMarker = new (mapboxgl as any).Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(this.mapService.map);
    }

    if (flyTo) {
      this.mapService.map!.flyTo({
        center: [lng, lat],
        zoom: 15,
        speed: 1.4,
        curve: 1.2
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERACCIÓN
  // ═══════════════════════════════════════════════════════════════════════════

  selectZone(zone: any) {
    this.colonia = zone.name;
    this.selectedZone = zone;
    this.isSheetOpen = true;
  }

  setSheetOpen(isOpen: boolean) { this.isSheetOpen = isOpen; }

  verEvaluacion() {
    this.setSheetOpen(false);
    this.closeDropdowns();
    this.router.navigate(['/tabs/home']);
  }

  toggleTheme() { this.themeService.toggleDarkMode(); }

  recenterMap() {
    this.isSimulating = false;
    this.locationService.resumeRealLocation();

    if (this.currentUserCoords && this.mapService.map) {
      this.placeUserMarker(this.currentUserCoords.lat, this.currentUserCoords.lng, true);
    } else {
      // Si no hay coordenadas, intentar forzar una actualización
      this.getUserLocationDirect();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DESCRIPCIONES CONTEXTUALES DE POIs
  // ═══════════════════════════════════════════════════════════════════════════

  private getPOIBadgeLabel(type: string): string {
    const labels: Record<string, string> = {
      park: 'PARQUE',
      garden: 'JARDÍN',
      playground: 'ÁREA RECREATIVA',
      plaza: 'PLAZA PÚBLICA',
      path: 'SENDERO PEATONAL',
      gym: 'ZONA DEPORTIVA',
      fastfood: 'COMIDA RÁPIDA',
      bar: 'BAR / ANTRO',
    };
    return labels[type] || 'ÁREA VERDE';
  }

  /**
   * Genera una descripción contextual para un POI basándose en sus datos reales de OSM.
   */
  private buildPOIDescription(poi: any): string {
    const tags = poi.tags || {};
    const parts: string[] = [];

    // ── Frase principal según tipo ────────────────────────────────────────
    switch (poi.type) {
      case 'park':
        parts.push(tags.leisure === 'recreation_ground'
          ? `${poi.name} es un área de recreación pública.`
          : `${poi.name} es un parque público.`);
        break;
      case 'garden':
        if (tags.landuse === 'grass') {
          parts.push(`Zona de área verde abierta con vegetación natural.`);
        } else if (tags.landuse === 'meadow') {
          parts.push(`Pradera natural que contribuye al ecosistema urbano local.`);
        } else if (tags.natural === 'wood') {
          parts.push(`Zona arbolada que funciona como pulmón urbano.`);
        } else if (tags.landuse === 'forest') {
          parts.push(`Área forestal que reduce la isla de calor urbano.`);
        } else {
          parts.push(`${poi.name} es un jardín o espacio verde accesible.`);
        }
        break;
      case 'playground':
        parts.push(`${poi.name} es un área recreativa con instalaciones para actividad física.`);
        break;
      case 'plaza':
        parts.push(`${poi.name} es una plaza pública, punto de encuentro comunitario.`);
        break;
      case 'gym':
        parts.push(`${poi.name} es un espacio deportivo para actividad física. El ejercicio regular mejora la sensibilidad a la insulina, reduce la grasa visceral y fortalece el sistema cardiovascular.`);
        break;
      case 'fastfood':
        parts.push(`${poi.name} es un establecimiento de comida rápida. Los alimentos ultraprocesados con alto contenido calórico y bajo valor nutricional contribuyen al entorno alimentario riesgoso (EAR) y elevan el riesgo de resistencia a la insulina.`);
        break;
      case 'bar':
        parts.push(`${poi.name} es un establecimiento de venta de alcohol. El consumo excesivo de alcohol altera el metabolismo hepático de la glucosa, incrementa la grasa visceral y eleva el riesgo de síndrome metabólico.`);
        break;
      case 'path':
        parts.push(tags.highway === 'pedestrian'
          ? `Calle peatonal que favorece la movilidad activa.`
          : `Sendero peatonal ideal para caminatas.`);
        break;
      default:
        parts.push(`${poi.name} es un espacio urbano de interés.`);
    }

    // ── Detalles extraídos de tags OSM ─────────────────────────────────────

    // Descripción del propio OSM
    if (tags.description) {
      parts.push(tags.description);
    }

    // Superficie
    const surfaceLabels: Record<string, string> = {
      grass: 'pasto', asphalt: 'asfalto', concrete: 'concreto', dirt: 'tierra',
      gravel: 'grava', sand: 'arena', paving_stones: 'adoquines', wood: 'madera',
      earth: 'tierra', compacted: 'compactado', paved: 'pavimentado',
      unpaved: 'sin pavimentar', fine_gravel: 'gravilla'
    };
    if (tags.surface && surfaceLabels[tags.surface]) {
      parts.push(`Superficie: ${surfaceLabels[tags.surface]}.`);
    }

    // Deporte / actividades
    if (tags.sport) {
      const sportLabels: Record<string, string> = {
        soccer: 'fútbol', basketball: 'basquetbol', tennis: 'tenis',
        volleyball: 'voleibol', swimming: 'natación', running: 'correr',
        skateboard: 'skateboarding', cycling: 'ciclismo', fitness: 'fitness',
        baseball: 'béisbol', multi: 'multiusos', gymnastics: 'gimnasia'
      };
      const sports = tags.sport.split(';').map((s: string) => sportLabels[s.trim()] || s.trim());
      parts.push(`Actividades: ${sports.join(', ')}.`);
    }

    // Horario
    if (tags.opening_hours) {
      const hours = tags.opening_hours;
      if (hours === '24/7') {
        parts.push('Abierto las 24 horas.');
      } else {
        parts.push(`Horario: ${hours}.`);
      }
    }

    // Operador / administrador
    if (tags.operator) {
      parts.push(`Administrado por: ${tags.operator}.`);
    }

    // Acceso
    if (tags.access) {
      const accessLabels: Record<string, string> = {
        yes: 'acceso libre', public: 'acceso público', private: 'acceso privado',
        permissive: 'acceso permitido', restricted: 'acceso restringido',
        customers: 'solo clientes'
      };
      if (accessLabels[tags.access]) {
        parts.push(`Acceso: ${accessLabels[tags.access]}.`);
      }
    }

    // Iluminación
    if (tags.lit === 'yes') {
      parts.push('Cuenta con iluminación nocturna.');
    }

    // Si hay cuota
    if (tags.fee === 'yes') {
      parts.push('Requiere pago de entrada.');
    } else if (tags.fee === 'no') {
      parts.push('Entrada gratuita.');
    }

    // Wikipedia / Wikidata como señal de lugar notable
    if (tags.wikipedia || tags.wikidata) {
      parts.push('Lugar de interés registrado en enciclopedias públicas.');
    }

    // ── Distancia & impacto metabólico ────────────────────────────────────
    const distKm = (poi.distanceM / 1000).toFixed(1);
    const walkMin = Math.max(1, Math.round(poi.distanceM / 80));
    parts.push(`A ${distKm} km de tu ubicación (~${walkMin} min caminando). Visitar este espacio contribuye a reducir el cortisol y promover la actividad física.`);

    return parts.join(' ');
  }
}
