import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { ThemeService } from '../services/theme.service';
import { ProgresoService } from '../services/progreso.service';
import { NotificationsService, AppNotification } from '../services/notifications.service';
import { IarriService } from '../services/iarri.service';
import { LocationService, UrbanMetrics } from '../services/location.service';
import { EnvironmentService } from '../services/environment.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-educacion',
  templateUrl: './educacion.page.html',
  styleUrls: ['./educacion.page.scss'],
  standalone: false,
})
export class EducacionPage implements OnInit, OnDestroy {

  isDarkMode = false;
  mostrarTodasInsignias = false;

  // ─── Dropdown states ────────────────────────────────────────────────────
  showNotifications = false;
  showProfile = false;
  notifications: AppNotification[] = [];
  userFullName = 'Usuario';
  userName = 'Usuario';
  userTestInterpretation = '';
  userTestScore = 0;
  userTestDate = '';
  userLocationName = 'Desconocida';

  private subs = new Subscription();

  // --- Quiz Logic ---
  showQuizModal = false;
  currentQuestionIndex = 0;
  quizScore = 0;
  quizCompleted = false;

  // --- Monte Carlo Logic ---
  monteCarloPath = '';
  userPositionX = 50;
  userIarri = 0;
  cityMean = 0;
  cityStdDev = 0;
  userPercentile = 50;
  riesgoLabel = 'Calculando...';

  // --- IARRI real variables (same pipeline as PerfilPage) ---
  private ear = 0.5;
  private ed = 0.1;
  private av = 0.5;
  private im = 0.25;
  private ic = 0.5;
  private denueEar = 0.0;
  private weatherData: any = null;
  private municipiosData: any[] = [];
  private iarriCalculated = false;

  quizQuestions = [
    {
      question: '¿Qué es la resistencia a la insulina?',
      options: [
        'Una alergia a los carbohidratos.',
        'Cuando las células dejan de responder bien a la insulina para absorber glucosa.',
        'La falta total de producción de insulina en el páncreas.',
        'Un aumento repentino de energía por comer azúcar.'
      ],
      answer: 1,
      explanation: 'Es un estado donde el cuerpo necesita más insulina para que la glucosa entre a las células.'
    },
    {
      question: '¿Cómo influye el "Entorno Construido" en tu salud metabólica?',
      options: [
        'Solo importa lo que comes, el entorno no influye.',
        'Las banquetas anchas y parques fomentan el movimiento incidental.',
        'La arquitectura solo sirve para que las casas se vean bonitas.',
        'Solo influye si vives cerca de un hospital.'
      ],
      answer: 1,
      explanation: 'Un entorno caminable reduce el sedentarismo territorial.'
    },
    {
      question: 'En la fórmula del IARRI, ¿qué significa "AV"?',
      options: [
        'Actividad Vecinal.',
        'Acceso a Áreas Verdes.',
        'Arquitectura Vertical.',
        'Agua Vital.'
      ],
      answer: 1,
      explanation: 'El acceso a áreas verdes reduce el cortisol y mejora la sensibilidad a la insulina.'
    }
  ];

  tipsEntorno = [
    { id: 1, title: 'El Método del Plato', desc: 'Divide tu comida en 50% verduras, 25% proteína y 25% carbohidratos.', reqRetos: 1, img: 'assets/curso1.svg', color: 'primary', icon: 'restaurant-outline' },
    { id: 2, title: 'Movimiento Post-Comida', desc: 'Caminar 15 min después de comer reduce el pico de glucosa drásticamente.', reqRetos: 3, img: 'assets/curso2.svg', color: 'secondary', icon: 'walk-outline' },
    { id: 3, title: 'Luz Solar y Metabolismo', desc: 'El sol matutino estabiliza el cortisol, lo que reduce la resistencia a la insulina.', reqRetos: 5, img: 'assets/curso3.svg', color: 'tertiary', icon: 'sunny-outline' },
    { id: 4, title: 'Hidratación Metabólica', desc: 'Beber agua antes de las comidas previene antojos generados por sed confundida.', reqRetos: 8, img: 'assets/curso4.svg', color: 'warning', icon: 'water-outline' }
  ];

  get unlockedTips() {
    return this.tipsEntorno.filter(t => this.progresoService.stats.retos_completados >= t.reqRetos);
  }

  get nextLockedTip() {
    return this.tipsEntorno.find(t => this.progresoService.stats.retos_completados < t.reqRetos);
  }

  constructor(
    private themeService: ThemeService,
    public progresoService: ProgresoService,
    public notificationsService: NotificationsService,
    private iarriService: IarriService,
    private locationService: LocationService,
    private environmentService: EnvironmentService,
    private http: HttpClient,
    private router: Router,
    private alertController: AlertController,
    private authService: AuthService
  ) { }

  get unreadCount$() { return this.notificationsService.unreadCount$; }

  get chartDays() {
    const today = new Date().getDay();
    // DOM=0, LUN=1, ... SAB=6
    const order = [
      { index: 1, label: 'LUN' },
      { index: 2, label: 'MAR' },
      { index: 3, label: 'MIÉ' },
      { index: 4, label: 'JUE' },
      { index: 5, label: 'VIE' },
      { index: 6, label: 'SÁB' },
      { index: 0, label: 'DOM' }
    ];

    // Calculamos el valor máximo de la semana para escalar las barras (mínimo 50 pts para que la escala tenga sentido)
    let maxPts = 50;
    order.forEach(d => {
      const pts = this.progresoService.puntosPorDia[d.index] || 0;
      if (pts > maxPts) maxPts = pts;
    });

    return order.map(d => {
      const pts = this.progresoService.puntosPorDia[d.index] || 0;
      let height = (pts / maxPts) * 100;
      // Para que un día con 0 puntos se note si la barra tiene estilo (opcional), aquí lo dejamos en 0.
      // Pero si queremos que una barra tenga al menos algo si tiene > 0 puntos, garantizamos mínimo 5%.
      if (height < 5 && pts > 0) height = 5;

      return {
        label: d.label,
        isToday: today === d.index,
        height: height + '%'
      };
    });
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

  ngOnInit() {
    this.loadUserData();

    this.subs.add(
      this.themeService.isDarkMode$.subscribe(dark => {
        this.isDarkMode = dark;
      })
    );
    this.subs.add(
      this.notificationsService.notifications$.subscribe(notifs => {
        this.notifications = notifs;
      })
    );

    // ─── Subscribe to real IARRI data pipeline (same as PerfilPage) ────
    this.subs.add(
      this.locationService.locationName$.subscribe(name => {
        this.userLocationName = name;
        // Get real Índice de Marginación from municipios_puebla.json
        this.iarriService.getMarginIndex(name).subscribe(val => {
          this.im = val;
          this.recalculateIarri();
        });
        // Load all municipio data to build the population distribution
        this.loadMunicipioDistribution(name);
      })
    );

    this.subs.add(
      this.locationService.metrics$.subscribe(metrics => {
        if (metrics) {
          this.ic = metrics.caminabilidad / 100;
          this.av = metrics.areasVerdes / 100;
          this.recalculateIarri();
        }
      })
    );

    this.subs.add(
      this.locationService.coords$.subscribe(coords => {
        if (coords) {
          this.fetchFoodEnvironment(coords.lat, coords.lng);
        }
      })
    );

    this.subs.add(
      this.locationService.nearbyPOIs$.subscribe(pois => {
        if (pois && pois.length > 0) {
          this.updateFromPOIs(pois);
        }
      })
    );

    // Start tracking if not already started
    this.locationService.startTracking().catch(e => {
      console.warn('[EducacionPage] Location tracking error:', e);
      // Fallback: generate distribution with defaults
      this.generateMonteCarloDistribution();
    });
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  toggleTheme() {
    this.themeService.toggleDarkMode();
  }

  toggleInsignias() {
    this.mostrarTodasInsignias = !this.mostrarTodasInsignias;
  }

  // --- Quiz Methods ---
  startQuiz() {
    this.showQuizModal = true;
    this.currentQuestionIndex = 0;
    this.quizScore = 0;
    this.quizCompleted = false;
    this.closeDropdowns();
  }

  handleAnswer(optionIndex: number) {
    if (optionIndex === this.quizQuestions[this.currentQuestionIndex].answer) {
      this.quizScore++;
    }

    if (this.currentQuestionIndex < this.quizQuestions.length - 1) {
      this.currentQuestionIndex++;
    } else {
      this.quizCompleted = true;
      if (this.quizScore === this.quizQuestions.length) {
        this.progresoService.addPointsAndStats(50, 'quiz_metabolico');
        this.progresoService.verificarInsignias();
      }
    }
  }

  closeQuiz() {
    this.showQuizModal = false;
  }

  // ─── IARRI Real Data Pipeline ─────────────────────────────────────────

  private async fetchFoodEnvironment(lat: number, lng: number) {
    try {
      const weather = await this.environmentService.getWeather(lat, lng);
      this.weatherData = weather;
    } catch (e) {
      console.warn('[EducacionPage] Weather fetch failed:', e);
    }

    this.iarriService.getDetailedFoodEnvironment(lat, lng).subscribe(earVal => {
      this.denueEar = earVal;
      this.ear = earVal;
      this.recalculateIarri();
    });
  }

  private updateFromPOIs(pois: any[]) {
    const gymPOIs = pois.filter(p => p.type === 'gym');
    this.ed = Math.min(1, gymPOIs.length / 8);

    const harmfulCount = pois.filter(p => p.type === 'fastfood' || p.type === 'bar').length;
    const healthyCount = pois.filter(p =>
      ['park', 'garden', 'playground', 'gym', 'plaza'].includes(p.type)
    ).length;
    const totalRelevant = harmfulCount + healthyCount;

    if (totalRelevant > 0) {
      const osmEar = harmfulCount / totalRelevant;
      this.ear = (this.denueEar * 0.6) + (osmEar * 0.4);
    }

    this.recalculateIarri();
  }

  /**
   * Loads municipios_puebla.json, computes a simulated IARRI for each
   * municipio using its real IM, then derives cityMean & cityStdDev
   * for the user's matched municipality.
   */
  private loadMunicipioDistribution(locationName: string) {
    this.http.get<any[]>('assets/data/municipios_puebla.json').subscribe({
      next: (data) => {
        this.municipiosData = data;
        this.buildPopulationDistribution(locationName);
      },
      error: () => {
        this.generateMonteCarloDistribution();
      }
    });
  }

  /**
   * For each municipio, simulate N people with IARRI scores using
   * the municipio's real IM and plausible variable ranges.
   * This creates a realistic heterogeneous population distribution.
   */
  private buildPopulationDistribution(locationName: string) {
    if (!this.municipiosData || this.municipiosData.length === 0) {
      this.generateMonteCarloDistribution();
      return;
    }

    // Find user's municipio
    const userMunicipio = this.municipiosData.find(m =>
      locationName.toLowerCase().includes(m.municipio.toLowerCase())
    );

    // Use user's municipio IM + population, or fallback to all
    const targetIM = userMunicipio ? userMunicipio.im : 0.25;
    const targetPoblacion = userMunicipio ? userMunicipio.poblacion : 500000;

    // Monte Carlo: simulate IARRI for N inhabitants of the same municipio.
    // Each person has the same IM but different urban environment variables.
    // Variables are drawn from realistic ranges:
    //   AV (áreas verdes):     Normal(0.4, 0.2)  — varies by neighborhood
    //   IC (caminabilidad):    Normal(0.5, 0.2)  — varies by neighborhood
    //   ED (equip. deportivo): Normal(0.3, 0.15) — scarcer
    //   EAR (entorno alim.):   Normal(0.5, 0.2)  — varies widely
    //   IM:                    Fixed per municipio (real CONAPO data)
    const N = 10000;
    const simulatedScores: number[] = [];

    for (let i = 0; i < N; i++) {
      const simAV = this.clamp01(this.boxMullerNormal(0.4, 0.2));
      const simIC = this.clamp01(this.boxMullerNormal(0.5, 0.2));
      const simED = this.clamp01(this.boxMullerNormal(0.3, 0.15));
      const simEAR = this.clamp01(this.boxMullerNormal(0.5, 0.2));
      // IM is fixed for the whole municipio (real data)
      const simIM = targetIM;

      const score = this.iarriService.calculateIarriScore({
        av: simAV, ic: simIC, ed: simED, ear: simEAR, im: simIM
      });
      simulatedScores.push(score);
    }

    // Calculate real statistics
    const sum = simulatedScores.reduce((a, b) => a + b, 0);
    this.cityMean = sum / N;
    const variance = simulatedScores.reduce((a, b) => a + (b - this.cityMean) ** 2, 0) / N;
    this.cityStdDev = Math.sqrt(variance);

    // Calculate user percentile
    if (this.iarriCalculated) {
      const belowUser = simulatedScores.filter(s => s < this.userIarri).length;
      this.userPercentile = Math.round((belowUser / N) * 100);
    }

    this.generateMonteCarloDistribution(simulatedScores);
  }

  /**
   * Recalculates the user's real IARRI using IarriService
   * with the same exact formula as PerfilPage.
   */
  private recalculateIarri() {
    this.userIarri = this.iarriService.calculateIarriScore({
      ear: this.ear,
      ed: this.ed,
      av: this.av,
      im: this.im,
      ic: this.ic,
      weather: this.weatherData
    });
    this.iarriCalculated = true;

    // Update risk label
    if (this.userIarri <= 0.33) {
      this.riesgoLabel = 'Bajo Riesgo';
    } else if (this.userIarri <= 0.66) {
      this.riesgoLabel = 'Riesgo Medio';
    } else {
      this.riesgoLabel = 'Alto Riesgo';
    }

    // Regenerate graph with updated user position
    if (this.municipiosData.length > 0) {
      this.buildPopulationDistribution(this.userLocationName);
    } else {
      this.generateMonteCarloDistribution();
    }
  }

  // --- Monte Carlo Visualization ---

  /**
   * Generates the SVG path for the Gaussian bell curve.
   * If pre-computed scores are provided, uses them;
   * otherwise generates a synthetic distribution.
   */
  generateMonteCarloDistribution(precomputedScores?: number[]) {
    let values: number[];

    if (precomputedScores && precomputedScores.length > 0) {
      values = precomputedScores;
    } else {
      // Fallback synthetic distribution
      values = [];
      const mean = this.cityMean || 0.55;
      const std = this.cityStdDev || 0.15;
      for (let i = 0; i < 10000; i++) {
        values.push(this.clamp01(this.boxMullerNormal(mean, std)));
      }
    }

    // Build histogram
    const bins = 50;
    const counts = new Array(bins).fill(0);
    for (const v of values) {
      const binIndex = Math.min(Math.floor(v * bins), bins - 1);
      counts[binIndex]++;
    }

    // Apply Gaussian smoothing kernel (sigma=1.5 bins) for a smooth bell
    const smoothed = this.gaussianSmooth(counts, 1.5);
    const maxCount = Math.max(...smoothed);

    // Build SVG path
    let path = 'M 0 100 ';
    for (let i = 0; i < bins; i++) {
      const x = (i / (bins - 1)) * 100;
      const y = 100 - ((smoothed[i] / maxCount) * 95); // 95 to leave top margin
      path += `L ${x.toFixed(2)} ${y.toFixed(2)} `;
    }
    path += 'L 100 100 Z';
    this.monteCarloPath = path;

    // Update user X position from real IARRI
    this.userPositionX = Math.max(1, Math.min(99, this.userIarri * 100));

    // Recalculate percentile
    if (this.iarriCalculated && values.length > 0) {
      const belowUser = values.filter(s => s < this.userIarri).length;
      this.userPercentile = Math.round((belowUser / values.length) * 100);
    }
  }

  /** Box-Muller transform for normally distributed random numbers */
  private boxMullerNormal(mean: number, stdDev: number): number {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  /** Clamp a value between 0 and 1 */
  private clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
  }

  /** Simple Gaussian smoothing on an array */
  private gaussianSmooth(data: number[], sigma: number): number[] {
    const size = data.length;
    const result = new Array(size).fill(0);
    const radius = Math.ceil(sigma * 3);

    for (let i = 0; i < size; i++) {
      let sum = 0;
      let weightSum = 0;
      for (let j = -radius; j <= radius; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < size) {
          const weight = Math.exp(-(j * j) / (2 * sigma * sigma));
          sum += data[idx] * weight;
          weightSum += weight;
        }
      }
      result[i] = sum / weightSum;
    }
    return result;
  }

}
