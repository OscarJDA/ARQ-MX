import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { LocationService, UrbanMetrics, NearbyPOI } from '../services/location.service';
import { IarriService } from '../services/iarri.service';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-calculadora',
  templateUrl: './calculadora.page.html',
  styleUrls: ['./calculadora.page.scss'],
  standalone: false,
})
export class CalculadoraPage implements OnInit, OnDestroy {

  isDarkMode = false;
  private subs = new Subscription();

  // Territorial Metrics (real)
  metrics: UrbanMetrics | null = null;
  earScore = 0.0;
  imScore = 0.0;
  userLocationName = 'Desconocida';
  private denueEar = 0.0;

  // ─── Simulator: Planificador de Entorno Activo ────────────────────────
  // Real (current) values 0-1
  realAV = 0.0;
  realIC = 0.0;
  realED = 0.0;
  realEAR = 0.0;
  realIM = 0.0;
  realIarri = 0.0;
  realRiesgo = 'Calculando...';
  // Simulated values (user-adjustable)
  simAV = 0.0;
  simIC = 0.0;
  simED = 0.0;
  simEAR = 0.0;
  simIM = 0.0;
  simIarri = 0.0;
  simRiesgo = 'Calculando...';
  simDelta = 0;
  private simTouched = false; // true una vez que el usuario ajustó manualmente

  constructor(
    private themeService: ThemeService,
    private locationService: LocationService,
    private iarriService: IarriService,
    private router: Router
  ) { }

  ngOnInit() {
    this.subs.add(
      this.themeService.isDarkMode$.subscribe(dark => {
        this.isDarkMode = dark;
      })
    );

    // Fetch real metrics
    this.subs.add(
      this.locationService.metrics$.pipe(filter(m => !!m)).subscribe(m => {
        this.metrics = m;
        this.realIC = m!.caminabilidad / 100;
        this.realAV = m!.areasVerdes / 100;
        this.syncSimFromReal();
        this.recalcRealIarri();
      })
    );

    this.subs.add(
      this.locationService.coords$.pipe(filter(c => !!c)).subscribe(coords => {
        this.iarriService.getDetailedFoodEnvironment(coords!.lat, coords!.lng).subscribe(ear => {
          this.denueEar = ear;
          this.earScore = ear;
          this.realEAR = ear;
          this.syncSimFromReal();
          this.recalcRealIarri();
        });
      })
    );

    this.subs.add(
      this.locationService.locationName$.subscribe(name => {
        this.userLocationName = name;
        this.iarriService.getMarginIndex(name).subscribe(im => {
          this.imScore = im;
          this.realIM = im;
          this.syncSimFromReal();
          this.recalcRealIarri();
        });
      })
    );

    // POIs reales del mapa → realED y realEAR ajustados
    this.subs.add(
      this.locationService.nearbyPOIs$.subscribe(pois => {
        if (pois && pois.length > 0) {
          const gymPOIs = pois.filter((p: NearbyPOI) => p.type === 'gym');
          this.realED = Math.min(1, gymPOIs.length / 8);

          const harmfulCount = pois.filter((p: NearbyPOI) => p.type === 'fastfood' || p.type === 'bar').length;
          const healthyCount = pois.filter((p: NearbyPOI) =>
            ['park', 'garden', 'playground', 'gym', 'plaza'].includes(p.type)
          ).length;
          const totalRelevant = harmfulCount + healthyCount;
          if (totalRelevant > 0) {
            const osmEar = harmfulCount / totalRelevant;
            this.realEAR = (this.denueEar * 0.6) + (osmEar * 0.4);
          }

          this.syncSimFromReal();
          this.recalcRealIarri();
        }
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  goBack() {
    this.router.navigate(['/tabs/recommendations']);
  }

  // ─── Simulator Methods ──────────────────────────────────────────────────

  /** Sync simulator sliders to current real values (only on initial load) */
  private syncSimFromReal() {
    if (this.simTouched) return; // No resetear si el usuario ya ajustó
    this.simAV = this.realAV;
    this.simIC = this.realIC;
    this.simED = this.realED;
    this.simEAR = this.realEAR;
    this.simIM = this.realIM;
    this.recalcSimIarri();
  }

  /** Calculate real IARRI from current real variables */
  private recalcRealIarri() {
    this.realIarri = this.iarriService.calculateIarriScore({
      av: this.realAV, ic: this.realIC, ed: this.realED,
      ear: this.realEAR, im: this.realIM
    });
    if (this.realIarri <= 0.33) this.realRiesgo = 'Bajo Riesgo';
    else if (this.realIarri <= 0.66) this.realRiesgo = 'Riesgo Medio';
    else this.realRiesgo = 'Alto Riesgo';
    
    // Always keep simulation in sync initially
    this.recalcSimIarri();
  }

  /** Called every time a slider moves in simulation mode */
  onSimSliderChange() {
    this.simTouched = true;
    this.recalcSimIarri();
  }

  /** Called when user types a value manually in the input field */
  onSimInputChange(field: 'simAV' | 'simIC' | 'simED' | 'simEAR' | 'simIM', rawValue: number) {
    this.simTouched = true;
    const clamped = Math.min(100, Math.max(0, rawValue || 0)) / 100;
    this[field] = clamped;
    this.recalcSimIarri();
  }

  /** Recalculate the simulated IARRI using the exact same formula */
  private recalcSimIarri() {
    this.simIarri = this.iarriService.calculateIarriScore({
      av: this.simAV, ic: this.simIC, ed: this.simED,
      ear: this.simEAR, im: this.simIM
    });
    if (this.simIarri <= 0.33) this.simRiesgo = 'Bajo Riesgo';
    else if (this.simIarri <= 0.66) this.simRiesgo = 'Riesgo Medio';
    else this.simRiesgo = 'Alto Riesgo';
    this.simDelta = this.realIarri - this.simIarri;
  }

  /** Reset all simulator sliders to real values */
  resetSimulation() {
    this.simTouched = false;
    this.syncSimFromReal();
  }

  /** Get color class based on IARRI value */
  getRiskColorClass(iarri: number): string {
    if (iarri <= 0.33) return 'risk-low';
    if (iarri <= 0.66) return 'risk-mid';
    return 'risk-high';
  }

}
