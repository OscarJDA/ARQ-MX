import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

import { NotificationsService } from './notifications.service';

const BackgroundGeolocation = registerPlugin<any>('BackgroundGeolocation');

export interface LocationCoords {
  lat: number;
  lng: number;
}

export interface UrbanMetrics {
  caminabilidad: number;  // 0-100
  conectividad: number;   // 0-100
  areasVerdes: number;    // 0-100
  locationName: string;
  walkabilityImpact: string;
}

/** Punto de interés encontrado en el radio de 3km */
export interface NearbyPOI {
  name: string;
  type: 'park' | 'plaza' | 'gym' | 'fastfood' | 'bar' | 'garden' | 'playground' | 'path' | 'other';
  distanceM: number;
  lat: number;
  lng: number;
  /** Tags crudos de OSM para generar descripciones contextuales */
  tags?: Record<string, string>;
}

/** Evento emitido cuando el usuario entra en una zona de interés */
export interface GeofenceEvent {
  pois: NearbyPOI[];
  coords: LocationCoords;
  walkScore: number;
  greenScore: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {

  private _coords = new BehaviorSubject<LocationCoords | null>(null);
  private _metrics = new BehaviorSubject<UrbanMetrics | null>(null);
  private _locationName = new BehaviorSubject<string>('Obteniendo ubicación...');
  private _isLoading = new BehaviorSubject<boolean>(false);
  private _error = new BehaviorSubject<string | null>(null);
  private _nearbyPOIs = new BehaviorSubject<NearbyPOI[]>([]);
  private _geofenceEvent = new Subject<GeofenceEvent>();

  private nativeWatchId: number | null = null;
  private bgWatcherId: string | null = null;
  private lastFetchedAt: LocationCoords | null = null;
  private lastPOIFetchAt: LocationCoords | null = null;
  private trackingStarted = false;
  private lastGeofenceNotification: number = 0;
  private isSimulatingLocation = false;

  coords$: Observable<LocationCoords | null> = this._coords.asObservable();
  metrics$: Observable<UrbanMetrics | null> = this._metrics.asObservable();
  locationName$: Observable<string> = this._locationName.asObservable();
  isLoading$: Observable<boolean> = this._isLoading.asObservable();
  error$: Observable<string | null> = this._error.asObservable();
  nearbyPOIs$: Observable<NearbyPOI[]> = this._nearbyPOIs.asObservable();
  /** Emite cada vez que el usuario entra en una zona relevante (parks, plazas, etc.) */
  geofenceEvent$: Observable<GeofenceEvent> = this._geofenceEvent.asObservable();

  constructor(private http: HttpClient, private ngZone: NgZone, private notificationsService: NotificationsService) { }

  /**
   * Inicia el rastreo. Solo se ejecuta una vez (singleton).
   */
  async startTracking(): Promise<void> {
    if (this.trackingStarted) return;
    this.trackingStarted = true;
    this._isLoading.next(true);
    this._error.next(null);

    console.log('[LocationService] startTracking — intentando obtener ubicación...');

    try {
      // Paso 1: Obtener ubicación inicial
      const coords = await this.getLocationWithRetries();
      console.log('[LocationService] Ubicación obtenida:', coords);

      this._coords.next(coords);
      this._isLoading.next(false);

      // Paso 2: Geocodificación inversa + métricas
      this.reverseGeocode(coords);
      this.refreshMetrics(coords);

      // Paso 3: Descubrir POIs cercanos
      this.discoverNearbyPOIs(coords);

      // Paso 4: Iniciar seguimiento continuo
      this.startContinuousWatch();

      // Paso 5: Geocercas (Geofencing) Proactivas
      this.startBackgroundGeofencing();

    } catch (err: any) {
      console.error('[LocationService] Todos los intentos fallaron:', err);
      this.handleError(err);
    }
  }

  /**
   * Obtiene la ubicación una vez (para refrescar manualmente).
   */
  async fetchOnce(): Promise<LocationCoords> {
    this._isLoading.next(true);
    try {
      const coords = await this.getLocationWithRetries();
      this._coords.next(coords);
      this._isLoading.next(false);
      this.reverseGeocode(coords);
      this.refreshMetrics(coords);
      this.discoverNearbyPOIs(coords);
      return coords;
    } catch (err) {
      this._isLoading.next(false);
      throw err;
    }
  }

  stopTracking(): void {
    if (this.nativeWatchId !== null) {
      navigator.geolocation?.clearWatch(this.nativeWatchId);
      this.nativeWatchId = null;
    }
    if (this.bgWatcherId !== null) {
      BackgroundGeolocation?.removeWatcher({ id: this.bgWatcherId });
      this.bgWatcherId = null;
    }
    this.trackingStarted = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIMULACIÓN DE UBICACIÓN (Para analizar otras zonas en el mapa)
  // ═══════════════════════════════════════════════════════════════════════════

  setSimulatedLocation(lat: number, lng: number) {
    this.isSimulatingLocation = true;
    const coords = { lat, lng };
    this._coords.next(coords);

    this.lastFetchedAt = null;
    this.lastPOIFetchAt = null;

    this.reverseGeocode(coords);
    this.refreshMetrics(coords);
    this.discoverNearbyPOIs(coords);
  }

  async resumeRealLocation() {
    this.isSimulatingLocation = false;
    this.lastFetchedAt = null;
    this.lastPOIFetchAt = null;
    try {
      await this.fetchOnce();
    } catch(e) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OBTENCIÓN DE UBICACIÓN — Múltiples estrategias
  // ═══════════════════════════════════════════════════════════════════════════

  private async getLocationWithRetries(): Promise<LocationCoords> {
    const strategies = [
      { label: 'Capacitor High', fn: () => this.tryCapacitorLocation(true, 8000) },
      { label: 'Capacitor Low', fn: () => this.tryCapacitorLocation(false, 15000) },
      { label: 'Navigator High', fn: () => this.tryNavigatorLocation(true, 10000) },
      { label: 'Navigator Low', fn: () => this.tryNavigatorLocation(false, 20000) },
    ];

    let lastError: any = null;

    for (const strategy of strategies) {
      try {
        console.log(`[LocationService] Intentando: ${strategy.label}`);
        const coords = await strategy.fn();
        if (coords) {
          console.log(`[LocationService] ✓ ${strategy.label} exitoso:`, coords);
          return coords;
        }
      } catch (err) {
        console.warn(`[LocationService] ✗ ${strategy.label} falló:`, err);
        lastError = err;
      }
    }

    throw lastError || new Error('No se pudo obtener la ubicación');
  }

  private async tryCapacitorLocation(highAccuracy: boolean, timeout: number): Promise<LocationCoords | null> {
    let Capacitor: any;
    let Geolocation: any;

    try {
      const core = await import('@capacitor/core');
      Capacitor = core.Capacitor;
    } catch {
      return null;
    }

    if (!Capacitor.isNativePlatform()) {
      return null;
    }

    try {
      const geo = await import('@capacitor/geolocation');
      Geolocation = geo.Geolocation;
    } catch {
      return null;
    }

    try {
      const permStatus = await Geolocation.checkPermissions();
      if (permStatus.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location === 'denied') {
          throw new Error('PERMISSION_DENIED');
        }
      }
    } catch (permErr: any) {
      if (permErr?.message === 'PERMISSION_DENIED') throw permErr;
      console.warn('[LocationService] checkPermissions no soportado, continuando...', permErr);
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: highAccuracy,
      timeout: timeout,
      maximumAge: 60000
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
  }

  private tryNavigatorLocation(highAccuracy: boolean, timeout: number): Promise<LocationCoords> {
    return new Promise((resolve, reject) => {
      if (!navigator?.geolocation) {
        reject(new Error('navigator.geolocation no disponible'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: timeout,
          maximumAge: 60000
        }
      );
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEGUIMIENTO CONTINUO
  // ═══════════════════════════════════════════════════════════════════════════

  private startContinuousWatch(): void {
    if (this.nativeWatchId !== null) {
      navigator.geolocation?.clearWatch(this.nativeWatchId);
    }

    if (!navigator?.geolocation) return;

    this.nativeWatchId = navigator.geolocation.watchPosition(
      (position) => {
        if (this.isSimulatingLocation) return;
        this.ngZone.run(() => {
          const coords: LocationCoords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          this._coords.next(coords);
          this.maybeFetchMetrics(coords);
        });
      },
      (err) => {
        console.warn('[LocationService] watchPosition error:', err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 20000
      }
    );

    console.log('[LocationService] watchPosition iniciado, id:', this.nativeWatchId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GEOFENCING PROACTIVO BACKGROUND
  // ═══════════════════════════════════════════════════════════════════════════

  private async startBackgroundGeofencing(): Promise<void> {
    try {
      if (!Capacitor.isNativePlatform()) return;

      // Solo usar LocalNotifications (no requiere Firebase/google-services.json)
      try {
        await LocalNotifications.requestPermissions();
      } catch (e) {
        console.warn('[LocationService] LocalNotifications permiso warn:', e);
      }

      this.bgWatcherId = await BackgroundGeolocation.addWatcher(
        {
          requestPermissions: true,
          stale: false,
          distanceFilter: 50
        },
        (location: any, error: any) => {
          if (error) return;
          if (!location) return;

          const coords: LocationCoords = { lat: location.latitude, lng: location.longitude };
          this.ngZone.run(() => {
            this._coords.next(coords);
            this.evaluateGeofences(coords);
            this.maybeFetchMetrics(coords);
          });
        }
      );
      console.log('[LocationService] Background Geofencing Iniciado.');
    } catch (err) {
      console.error('[LocationService] Error geofencing start:', err);
    }
  }

  /**
   * Evalúa geocercas con datos REALES del radio de 3km.
   * Descubre POIs cercanos, los evalúa con contexto de hora del día,
   * y emite tanto notificaciones como eventos para el generador de retos.
   */
  private async evaluateGeofences(coords: LocationCoords): Promise<void> {
    const now = Date.now();
    // Cooldown de 5 minutos para evitar spam
    if (now - this.lastGeofenceNotification < 300000) return;

    // Descubrir POIs reales y métricas del entorno
    const [pois, allMetrics] = await Promise.all([
      this.discoverNearbyPOIs(coords),
      this.calcAllMetrics(coords)
    ]);

    const walkData = allMetrics.caminabilidad;
    const greenScore = allMetrics.areasVerdes;

    if (pois.length === 0) return;

    // Filtrar por hora del día — no notificar de noche (22:00-06:00)
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) return;

    // Encontrar el POI más cercano que sea relevante
    const closestPark = pois.find((p: NearbyPOI) => ['park', 'garden', 'playground', 'plaza'].includes(p.type));
    const closestAny = pois[0]; // Ya están ordenados por distancia

    if (closestPark && closestPark.distanceM <= 500) {
      this.lastGeofenceNotification = now;
      const walkMinutes = Math.max(1, Math.round(closestPark.distanceM / 80)); // ~80m/min caminando
      const points = closestPark.distanceM < 200 ? 50 : 30;

      this.triggerPushNotification(
        '🌿 Urbanismo Táctico',
        `Estás a ${walkMinutes} min de ${closestPark.name}. Desvíate, respira aire limpio y gana ${points} puntos de regeneración.`
      );

      // Emitir evento de geocerca para que el generador de retos lo recoja
      const event: GeofenceEvent = {
        pois,
        coords,
        walkScore: walkData.score,
        greenScore,
        timestamp: now
      };
      this._geofenceEvent.next(event);
    } else if (walkData.score > 70 && greenScore > 50) {
      // Zona muy caminable con áreas verdes: sugerir exploración
      this.lastGeofenceNotification = now;
      this.triggerPushNotification(
        '🚶 Zona de Alta Caminabilidad',
        `Tu entorno tiene un Walk Score de ${walkData.score}/100. Excelente momento para una caminata metabólica.`
      );

      const event: GeofenceEvent = {
        pois,
        coords,
        walkScore: walkData.score,
        greenScore,
        timestamp: now
      };
      this._geofenceEvent.next(event);
    }
  }

  private async triggerPushNotification(title: string, body: string): Promise<void> {
    console.log('[LocationService] Enviando Notificación Push:', title);
    this.notificationsService.addNotification(title, body);
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: title,
            body: body,
            id: new Date().getTime(),
            actionTypeId: '',
            extra: null
          }
        ]
      });
    } catch (e) {
      console.warn("Notification error:", e);
    }
  }

  /**
   * Solo re-calcula métricas si el usuario se movió > 200m.
   */
  private maybeFetchMetrics(coords: LocationCoords): void {
    if (!this.lastFetchedAt || this.distanceM(coords, this.lastFetchedAt) > 200) {
      this.reverseGeocode(coords);
      this.refreshMetrics(coords);
      this.discoverNearbyPOIs(coords);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DESCUBRIMIENTO DE POIs REALES (Overpass API)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Busca parques, plazas, gimnasios, cafés, mercados, senderos, etc.
   * en un radio de 3km usando Overpass API.
   * Devuelve una lista ordenada por distancia.
   */
  async discoverNearbyPOIs(coords: LocationCoords): Promise<NearbyPOI[]> {
    // No re-buscar si no nos hemos movido 150m+
    if (this.lastPOIFetchAt && this.distanceM(coords, this.lastPOIFetchAt) < 150) {
      return this._nearbyPOIs.getValue();
    }
    this.lastPOIFetchAt = coords;

    const r = 1200; // Radio de búsqueda en metros
    const query = `[out:json][timeout:90];
(
  node["leisure"~"park|garden|playground|fitness_centre|sports_centre|stadium|pitch|swimming_pool|track"](around:${r},${coords.lat},${coords.lng});
  way["leisure"~"park|garden|playground|recreation_ground|fitness_centre|sports_centre|stadium|pitch|swimming_pool|track"](around:${r},${coords.lat},${coords.lng});
  relation["leisure"~"park|garden|sports_centre|stadium"](around:${r},${coords.lat},${coords.lng});
  node["amenity"~"fast_food|bar|pub|nightclub|gym"](around:${r},${coords.lat},${coords.lng});
  way["amenity"~"fast_food|bar|pub|nightclub|gym"](around:${r},${coords.lat},${coords.lng});
  node["place"="square"](around:${r},${coords.lat},${coords.lng});
  way["highway"="pedestrian"](around:${r},${coords.lat},${coords.lng});
  way["highway"="path"]["foot"!="no"](around:${r},${coords.lat},${coords.lng});
  way["landuse"~"forest|grass|meadow"](around:${r},${coords.lat},${coords.lng});
  node["natural"~"tree|wood"](around:${r},${coords.lat},${coords.lng});
);
out center tags;`;

    try {
      const res: any = await this.overpassQuery(query);
      const elements = res?.elements || [];

      const pois: NearbyPOI[] = [];
      const seenNames = new Set<string>();

      for (const el of elements) {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (!lat || !lng) continue;

        const tags = el.tags || {};
        let name = tags.name || '';
        const leisure = tags.leisure || '';
        const amenity = tags.amenity || '';
        const highway = tags.highway || '';
        const place = tags.place || '';
        const shop = tags.shop || '';

        // Clasificar tipo
        let type: NearbyPOI['type'] = 'other';
        const landuse = tags.landuse || '';
        const natural = tags.natural || '';

        if (leisure === 'park' || leisure === 'garden' || landuse === 'grass' || landuse === 'meadow' || natural === 'wood' || leisure === 'recreation_ground') {
          type = name ? 'park' : 'garden';
          if (!name) {
            if (landuse === 'grass') name = 'Área verde';
            else if (natural === 'wood') name = 'Bosque/Árboles';
            else name = 'Espacio natural';
          }
        } else if (leisure === 'playground') {
          type = 'playground';
          if (!name) name = 'Área recreativa';
        } else if (leisure === 'fitness_centre' || amenity === 'gym' || leisure === 'sports_centre') {
          type = 'gym';
          if (!name) name = leisure === 'sports_centre' ? 'Centro Deportivo' : 'Gimnasio cercano';
        } else if (leisure === 'stadium') {
          type = 'gym';
          if (!name) name = 'Estadio';
        } else if (leisure === 'pitch') {
          type = 'gym';
          if (!name) {
            const sport = tags.sport || '';
            const sportLabels: Record<string, string> = {
              soccer: 'Cancha de Fútbol', basketball: 'Cancha de Basquetbol',
              tennis: 'Cancha de Tenis', volleyball: 'Cancha de Voleibol',
              baseball: 'Campo de Béisbol', multi: 'Cancha Multiusos'
            };
            name = sportLabels[sport] || 'Cancha Deportiva';
          }
        } else if (leisure === 'swimming_pool') {
          type = 'gym';
          if (!name) name = 'Alberca / Piscina';
        } else if (leisure === 'track') {
          type = 'gym';
          if (!name) name = 'Pista de Atletismo';
        } else if (amenity === 'fast_food') {
          type = 'fastfood';
          if (!name) name = 'Comida Rápida';
        } else if (amenity === 'bar' || amenity === 'pub') {
          type = 'bar';
          if (!name) name = amenity === 'pub' ? 'Pub' : 'Bar';
        } else if (amenity === 'nightclub') {
          type = 'bar';
          if (!name) name = 'Antro / Club Nocturno';
        } else if (place === 'square') {
          type = 'plaza';
          if (!name) name = 'Plaza cercana';
        } else if (highway === 'pedestrian' || highway === 'path') {
          type = 'path';
          if (!name) name = 'Sendero peatonal';
        }

        // Descartar elementos no clasificados
        if (type === 'other') continue;

        // Evitar duplicados por nombre
        const key = `${name}_${type}`;
        if (seenNames.has(key)) continue;
        seenNames.add(key);

        const dist = this.distanceM(coords, { lat, lng });

        pois.push({
          name,
          type,
          distanceM: Math.round(dist),
          lat,
          lng,
          tags
        });
      }

      // Ordenar por distancia
      pois.sort((a, b) => a.distanceM - b.distanceM);

      // Separar rutas caminables de las otras categorías
      const paths = pois.filter(p => p.type === 'path');
      const others = pois.filter(p => p.type !== 'path');

      // Limitar solo las rutas caminables a las 15 más cercanas, pero mostrar TODO lo demás sin límite
      const limitedPaths = paths.slice(0, 15);
      const topPOIs = [...others, ...limitedPaths];

      this.ngZone.run(() => this._nearbyPOIs.next(topPOIs));
      console.log(`[LocationService] ${topPOIs.length} POIs encontrados en radio de ${r}m (limitando rutas caminables a ${limitedPaths.length})`);
      return topPOIs;
    } catch (e) {
      console.warn('[LocationService] Error descubriendo POIs:', e);
      this.lastPOIFetchAt = null; // Permitir re-intento desde la misma ubicación
      return this._nearbyPOIs.getValue();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GEOCODIFICACIÓN INVERSA — Colonia, Municipio
  // ═══════════════════════════════════════════════════════════════════════════

  private async reverseGeocode(coords: LocationCoords): Promise<void> {
    try {
      const isInvalid = (t: string) => {
        if (!t) return true;
        const lower = t.toLowerCase().trim();
        return lower === 'ninguno' || lower === 'none' || /^\d{4,5}$/.test(lower);
      };

      // Petición principal: obtener calle, colonia, ciudad y región
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.lng},${coords.lat}.json?access_token=${environment.mapboxKey}&language=es&types=address,neighborhood,locality,place,region`;
      const response = await fetch(url);
      const data = await response.json();

      let street = '';
      let colonia = '';
      let place = '';
      let region = '';

      if (data?.features?.length > 0) {
        for (const feature of data.features) {
          const id = feature.id || '';
          const text = feature.text || '';

          if (isInvalid(text)) continue;

          if (!street && id.startsWith('address')) {
            const num = feature.address || '';
            street = num ? `${text} ${num}` : text;
          }
          if (!colonia && (id.startsWith('neighborhood') || id.startsWith('locality'))) {
            colonia = text;
          }
          if (!place && id.startsWith('place')) {
            place = text;
          }
          if (!region && id.startsWith('region')) {
            region = text;
          }
        }
      }

      // Si no se encontró calle, hacer segunda petición dedicada para la calle más cercana
      if (!street) {
        try {
          const streetUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.lng},${coords.lat}.json?access_token=${environment.mapboxKey}&language=es&types=address&limit=1`;
          const streetRes = await fetch(streetUrl);
          const streetData = await streetRes.json();

          if (streetData?.features?.length > 0) {
            const f = streetData.features[0];
            const text = f.text || '';
            if (!isInvalid(text)) {
              const num = f.address || '';
              street = num ? `${text} ${num}` : text;

              // También extraer colonia del contexto si aún no la tenemos
              if (!colonia && f.context) {
                for (const ctx of f.context) {
                  const ctxId = ctx.id || '';
                  const ctxText = ctx.text || '';
                  if (!isInvalid(ctxText) && (ctxId.startsWith('neighborhood') || ctxId.startsWith('locality'))) {
                    colonia = ctxText;
                    break;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('[LocationService] Fallback de calle falló:', e);
        }
      }

      // Construir nombre en formato "Calle, Colonia"
      let locationName: string;
      if (street && colonia) {
        locationName = `${street}, ${colonia}`;
      } else if (street && place) {
        locationName = `${street}, ${place}`;
      } else if (street) {
        locationName = street;
      } else if (colonia && place && colonia !== place) {
        locationName = `${colonia}, ${place}`;
      } else if (colonia) {
        locationName = colonia;
      } else if (place && region && place !== region) {
        locationName = `${place}, ${region}`;
      } else {
        locationName = place || region || 'Ubicación actual';
      }

      console.log('[LocationService] Geocodificación:', locationName);
      this.ngZone.run(() => this._locationName.next(locationName));
    } catch (e) {
      console.warn('[LocationService] Geocodificación inversa falló:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTRICAS URBANAS (Overpass API)
  // ═══════════════════════════════════════════════════════════════════════════

  async refreshMetrics(coords: LocationCoords): Promise<void> {
    this.lastFetchedAt = coords;

    try {
      const data = await this.calcAllMetrics(coords);

      const metrics: UrbanMetrics = {
        caminabilidad: data.caminabilidad.score,
        conectividad: data.conectividad,
        areasVerdes: data.areasVerdes,
        locationName: this._locationName.getValue(),
        walkabilityImpact: data.caminabilidad.impact
      };

      this.ngZone.run(() => this._metrics.next(metrics));
    } catch (e) {
      console.warn('Failed to calculate metrics', e);
      const fakeMetrics: UrbanMetrics = {
        caminabilidad: this.clampScore(40),
        conectividad: this.clampScore(30),
        areasVerdes: this.clampScore(20),
        locationName: this._locationName.getValue(),
        walkabilityImpact: 'No se pudieron obtener métricas reales.'
      };
      this.ngZone.run(() => this._metrics.next(fakeMetrics));
    }
  }

  private async calcAllMetrics(coords: LocationCoords): Promise<{ caminabilidad: { score: number, impact: string }, conectividad: number, areasVerdes: number }> {
    const r = 800; // Reducido de 3000 a 800 para optimización extrema de tiempo de respuesta (entorno peatonal real)

    const query = `[out:json][timeout:30];
(
  node["highway"="crossing"](around:${r},${coords.lat},${coords.lng});
  way["highway"~"footway|pedestrian|living_street|cycleway|steps"](around:${r},${coords.lat},${coords.lng});
  way["sidewalk"~"yes|both|left|right"](around:${r},${coords.lat},${coords.lng});
  way["foot"~"yes|designated"](around:${r},${coords.lat},${coords.lng});
  way["highway"~"primary|secondary|trunk"](around:${r},${coords.lat},${coords.lng});
  node["highway"="traffic_signals"](around:${r},${coords.lat},${coords.lng});
  way["highway"~"tertiary|residential"](around:${r},${coords.lat},${coords.lng});
  way["leisure"~"park|garden|playground|nature_reserve"](around:${r},${coords.lat},${coords.lng});
  relation["leisure"~"park|garden"](around:${r},${coords.lat},${coords.lng});
  way["landuse"~"forest|grass|recreation_ground|meadow"](around:${r},${coords.lat},${coords.lng});
  node["natural"~"tree|wood"](around:${r},${coords.lat},${coords.lng});
);
out tags;`;

    let pedInfra = 0;
    let heavyTraffic = 0;
    let connectInfra = 0;
    let greenInfra = 0;

    try {
      const res: any = await this.overpassQuery(query);
      const elements = res?.elements || [];

      for (const el of elements) {
        const tags = el.tags || {};
        const highway = tags.highway || '';
        const foot = tags.foot || '';
        const sidewalk = tags.sidewalk || '';
        const leisure = tags.leisure || '';
        const landuse = tags.landuse || '';
        const natural = tags.natural || '';

        if (highway === 'crossing' || ['footway', 'pedestrian', 'living_street', 'cycleway', 'steps'].includes(highway) ||
          ['yes', 'both', 'left', 'right'].includes(sidewalk) || ['yes', 'designated'].includes(foot)) {
          pedInfra++;
        }

        if (['primary', 'secondary', 'trunk'].includes(highway)) {
          heavyTraffic++;
        }

        if (highway === 'traffic_signals' || highway === 'crossing' || ['primary', 'secondary', 'tertiary', 'residential'].includes(highway)) {
          connectInfra++;
        }

        if (['park', 'garden', 'playground', 'nature_reserve'].includes(leisure) ||
          ['forest', 'grass', 'recreation_ground', 'meadow'].includes(landuse) ||
          ['tree', 'wood'].includes(natural)) {
          greenInfra++;
        }
      }
    } catch (e) {
      pedInfra = Math.abs(Math.sin(coords.lat * 127.1) * 100) % 80 + 20;
      heavyTraffic = Math.abs(Math.cos(coords.lng * 311.7) * 100) % 30;
      connectInfra = 50;
      greenInfra = 10;
    }

    const pedNorm = Math.min(pedInfra / 80, 1.5);
    const trafficNorm = Math.min(heavyTraffic / 40, 1.5);
    let walkScore = 35 + (pedNorm * 45) - (trafficNorm * 20);
    walkScore = this.clampScore(Math.max(15, walkScore));

    let impact = '';
    const ratio = pedInfra > 0 ? pedInfra / Math.max(heavyTraffic, 1) : 0;
    if (ratio < 1 && heavyTraffic > 20) {
      impact = "Esta zona tiene alta densidad de tráfico vehicular con poca infraestructura peatonal. Tomar calles paralelas reduce tu estrés y exposición a contaminantes.";
    } else if (ratio >= 1 && heavyTraffic > 20) {
      impact = "A pesar del tráfico vehicular, existe buena infraestructura peatonal. Busca caminar por las banquetas más arboladas para reducir la exposición a emisiones.";
    } else if (pedInfra < 15) {
      impact = "Baja densidad de infraestructura peatonal. Esto dificulta el tránsito a pie y limita la actividad física espontánea; procura planear tu ruta.";
    } else {
      impact = "Excelente caminabilidad. La buena infraestructura peatonal y el bajo tráfico vehicular promueven un entorno metabólicamente sano.";
    }

    const conectividad = this.clampScore(30 + (connectInfra / 150) * 70);
    const areasVerdes = this.clampScore(5 + (greenInfra / 100) * 95);

    return { caminabilidad: { score: walkScore, impact }, conectividad, areasVerdes };
  }

  private async overpassQuery(query: string): Promise<any> {
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://z.overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];

    try {
      const promises = endpoints.map(endpoint =>
        this.http.post(endpoint, query, { responseType: 'json' }).toPromise()
      );

      return await new Promise((resolve, reject) => {
        let rejections = 0;
        for (const p of promises) {
          p.then(resolve).catch(err => {
            rejections++;
            if (rejections === endpoints.length) reject(err);
          });
        }
      });
    } catch (err) {
      console.error('[LocationService] Todos los endpoints de Overpass fallaron.', err);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILIDADES
  // ═══════════════════════════════════════════════════════════════════════════

  private pseudoScore(coords: LocationCoords, seed: number): number {
    const h = Math.abs(Math.sin(coords.lat * 127.1 + coords.lng * 311.7 + seed * 17.3) * 10000) % 100;
    return this.clampScore(25 + h * 0.5);
  }

  private clampScore(v: number): number {
    return Math.min(100, Math.max(0, Math.round(v)));
  }

  distanceM(a: LocationCoords, b: LocationCoords): number {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  private handleError(err: any): void {
    console.error('[LocationService] handleError:', err);
    let msg = 'Ubicación denegada o error';
    if (err?.message === 'PERMISSION_DENIED' || err?.code === 1) {
      msg = 'Permiso de ubicación denegado. Habilítalo en Ajustes.';
    } else if (err?.code === 2) {
      msg = 'GPS no disponible. Activa tu ubicación.';
    } else if (err?.code === 3) {
      msg = 'Ubicación: tiempo de espera agotado';
    }
    this._locationName.next(msg);
    this._error.next(msg);
    this._isLoading.next(false);
    this.trackingStarted = false;
  }
}

