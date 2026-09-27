import { Component, OnInit, OnDestroy } from '@angular/core';
import { LocationService, UrbanMetrics, NearbyPOI } from '../services/location.service';
import { IarriService } from '../services/iarri.service';
import { EnvironmentService } from '../services/environment.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { NavController, ToastController } from '@ionic/angular';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-perfil-ambiental',
  templateUrl: './perfil-ambiental.page.html',
  styleUrls: ['./perfil-ambiental.page.scss'],
  standalone: false,
})
export class PerfilAmbientalPage implements OnInit, OnDestroy {

  isDarkMode = false;
  locationName = 'Cargando...';
  iarriScore = 0;
  riskLabel = 'Bajo';
  riskColor = 'success';
  
  // Variables IARRI — mismos defaults que perfil.page.ts
  metrics: UrbanMetrics | null = null;
  av = 0.0;
  ic = 0.0;
  ed = 0.0;
  ear = 0.0;
  im = 0.0;
  private denueEar = 0.0; // EAR crudo de DENUE/INEGI
  weather: any = null;

  isLoading = true;
  private subs = new Subscription();
  private dataReady = { metrics: false, ear: false, im: false };

  constructor(
    private locationService: LocationService,
    private iarriService: IarriService,
    private environmentService: EnvironmentService,
    private themeService: ThemeService,
    private navCtrl: NavController,
    private toastCtrl: ToastController
  ) { }

  ngOnInit() {
    this.subs.add(
      this.themeService.isDarkMode$.subscribe(dark => this.isDarkMode = dark)
    );

    this.loadData();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  async loadData() {
    this.isLoading = true;
    console.log('[PerfilAmbiental] Iniciando carga de datos...');
    
    // 1. Asegurar que el tracking esté activo
    this.locationService.startTracking().catch(e => console.warn('Tracking ya activo o error:', e));

    // 2. Ubicación + Marginación (mismo flujo que perfil.page.ts)
    this.subs.add(
      this.locationService.locationName$.subscribe(name => {
        if (name && name !== 'Obteniendo ubicación...') {
          this.locationName = name;
          this.iarriService.getMarginIndex(name).subscribe(val => {
             this.im = val;
             this.dataReady.im = true;
             this.calculateFinalIarri();
          });
        }
      })
    );

    // 3. Métricas territoriales (mismo flujo que perfil.page.ts → applyMetrics)
    this.subs.add(
      this.locationService.metrics$.pipe(filter(m => !!m)).subscribe(metrics => {
        this.metrics = metrics!;
        this.ic = metrics!.caminabilidad / 100;
        this.av = metrics!.areasVerdes / 100;
        this.dataReady.metrics = true;
        this.calculateFinalIarri();
      })
    );

    // 4. Coordenadas → EAR + Weather (mismo flujo que perfil.page.ts → fetchEnvironmentData)
    this.subs.add(
      this.locationService.coords$.pipe(filter(c => !!c)).subscribe(coords => {
        // EAR desde INEGI/DENUE
        this.iarriService.getDetailedFoodEnvironment(coords!.lat, coords!.lng).subscribe(earVal => {
          this.denueEar = earVal;
          this.ear = earVal;
          this.dataReady.ear = true;
          this.calculateFinalIarri();
        });

        // Weather real
        this.environmentService.getWeather(coords!.lat, coords!.lng).then(w => {
          this.weather = w;
          this.calculateFinalIarri();
        }).catch(() => {
          this.weather = null;
        });
      })
    );

    // 5. POIs reales del mapa → ED y EAR ajustados
    this.subs.add(
      this.locationService.nearbyPOIs$.subscribe(pois => {
        if (pois && pois.length > 0) {
          this.updateFromPOIs(pois);
        }
      })
    );

    // Timeout de seguridad para quitar el loading si algo falla
    setTimeout(() => {
      if (this.isLoading) {
        this.isLoading = false;
        this.calculateFinalIarri();
      }
    }, 12000);
  }

  async showErrorMessage(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 3000,
      position: 'bottom',
      color: 'warning'
    });
    toast.present();
  }

  calculateFinalIarri() {
    this.iarriScore = this.iarriService.calculateIarriScore({
      av: this.av,
      ic: this.ic,
      ed: this.ed,
      ear: this.ear,
      im: this.im,
      weather: this.weather
    });

    if (this.iarriScore <= 0.33) {
      this.riskLabel = 'RIESGO BAJO';
      this.riskColor = '#2dd36f';
    } else if (this.iarriScore <= 0.66) {
      this.riskLabel = 'RIESGO MEDIO';
      this.riskColor = '#ffc409';
    } else {
      this.riskLabel = 'RIESGO ALTO';
      this.riskColor = '#eb445a';
    }

    // Quitar loading una vez que tenemos las métricas principales
    if (this.dataReady.metrics && this.dataReady.ear) {
      this.isLoading = false;
    }
  }

  goBack() {
    this.navCtrl.back();
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

    this.calculateFinalIarri();
  }

  getSeverityClass(val: number, inverted: boolean = false): string {
    const v = inverted ? 1 - val : val;
    if (v < 0.4) return 'sev-low';
    if (v < 0.7) return 'sev-med';
    return 'sev-high';
  }

  getImpactMessage(): string {
    if (this.iarriScore > 0.66) {
      return 'Tu entorno actual presenta barreras arquitectónicas y alimentarias significativas que favorecen el sedentarismo y la resistencia a la insulina.';
    } else if (this.iarriScore > 0.33) {
      return 'Vives en un entorno con balance moderado. Existen oportunidades de mejora en la movilidad activa y el acceso a productos frescos.';
    } else {
      return '¡Felicidades! Tu entorno es altamente proactivo y saludable, facilitando el mantenimiento de un metabolismo estable.';
    }
  }
}
