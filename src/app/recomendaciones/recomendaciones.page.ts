import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { ThemeService } from '../services/theme.service';
import { NotificationsService, AppNotification } from '../services/notifications.service';
import { ProgresoService } from '../services/progreso.service';
import { LocationService, UrbanMetrics } from '../services/location.service';
import { IarriService } from '../services/iarri.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import * as mapboxgl from 'mapbox-gl';
import { environment } from 'src/environments/environment';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-recomendaciones',
  templateUrl: './recomendaciones.page.html',
  styleUrls: ['./recomendaciones.page.scss'],
  standalone: false,
})
export class RecomendacionesPage implements OnInit {

  isDarkMode = false;

  // ─── Dropdown states ────────────────────────────────────────────────────
  showNotifications = false;
  showProfile = false;
  notifications: AppNotification[] = [];
  userFullName = 'Usuario';
  userTestInterpretation = '';
  userTestScore = 0;
  userTestDate = '';
  userLocationName = 'Desconocida';

  // Territorial Metrics
  metrics: UrbanMetrics | null = null;
  earScore = 0.5;
  imScore = 0.1;
  criticalFactor: string | null = null;

  private subs = new Subscription();

  recomendacionesData = [
    {
      id: 'simulador',
      title: 'Planificador de Entorno Activo',
      desc: 'Activa el Modo Simulación para modificar variables del modelo y proyectar cómo mejoras en tu entorno reducirían tu riesgo metabólico.',
      icon: 'options',
      iconColor: '#0A3222',
      iconBg: '#E5EFE9',
      btnColor: '#0A3222',
      btnText: 'ABRIR SIMULADOR',
      requiredRetos: 0,
      relatedFactor: 'none' // never strictly "priority" or locked
    },
    {
      id: 'plato',
      title: 'El Método del Plato',
      desc: 'Divide tus comidas en: 50% verduras, 25% proteína y 25% carbohidratos complejos. Esta proporción ayuda a amortiguar la absorción de glucosa y reduce el impacto metabólico de cada comida.',
      icon: 'restaurant',
      iconColor: '#532E7E',
      iconBg: '#EFE9F6',
      btnColor: '#532E7E',
      btnText: 'JUGAR MINIJUEGO',
      requiredRetos: 0,
      relatedFactor: 'ear'
    },
    {
      id: 'peatonal',
      title: 'Ruta Peatonal Diaria',
      desc: 'Diseña una ruta de 15 min por calles sombreadas y planas cerca de casa. La previsibilidad de la ruta reduce la fricción mental para el ejercicio diario.',
      icon: 'walk',
      iconColor: '#1E408E',
      iconBg: '#E9EEFC',
      btnColor: '#1E408E',
      btnText: 'CAMINATA RECOMENDADA',
      requiredRetos: 2,
      relatedFactor: 'ic'
    },
    {
      id: 'recetario',
      title: 'Recetario Saludable',
      desc: 'Descubre recetas fáciles y rápidas para mejorar tu sensibilidad a la insulina y mantener niveles de glucosa estables.',
      icon: 'nutrition',
      iconColor: '#D32F2F',
      iconBg: '#FFEBEE',
      btnColor: '#D32F2F',
      btnText: 'VER RECETARIO',
      requiredRetos: 3,
      relatedFactor: 'ear'
    },
    {
      id: 'activos',
      title: 'Espacios Activos',
      desc: 'Deja a la vista equipamiento deportivo ligero (pesas, bandas) para fomentar micro-pausas. La visibilidad de las herramientas reduce la fricción mental para el ejercicio.',
      icon: 'barbell',
      iconColor: '#8E441E',
      iconBg: '#FCEFE9',
      btnColor: '#8E441E',
      btnText: 'RUTINA DE EJERCICIO',
      requiredRetos: 5,
      relatedFactor: 'ed'
    },
    {
      id: 'conceptos',
      title: 'Conceptos Importantes',
      desc: 'Entiende cómo funciona tu metabolismo. Aprende sobre la resistencia a la insulina y por qué es crucial cuidar tu entorno y tus hábitos diarios.',
      icon: 'library',
      iconColor: '#E65100',
      iconBg: '#FFF3E0',
      btnColor: '#E65100',
      btnText: 'VER CONCEPTOS',
      requiredRetos: 0,
      relatedFactor: 'av'
    },
    {
      id: 'catchy',
      title: 'Decisiones Rápidas',
      desc: 'Entrena tu cerebro para elegir opciones saludables al instante. ¡Atrapa la comida sana y esquiva la chatarra!',
      icon: 'game-controller',
      iconColor: '#D97706',
      iconBg: '#FEF3C7',
      btnColor: '#D97706',
      btnText: 'JUGAR CATCHY',
      requiredRetos: 0,
      relatedFactor: 'ear'
    }
  ];

  get recomendaciones() {
    return this.recomendacionesData.map(r => ({
      ...r,
      locked: false, // Siempre desbloqueado por solicitud del usuario
      isPriority: r.relatedFactor === this.criticalFactor
    })).sort((a, b) => (a.isPriority === b.isPriority) ? 0 : a.isPriority ? -1 : 1);
  }

  trackByRecId(index: number, rec: any): string {
    return rec.id;
  }

  constructor(
    private themeService: ThemeService,
    public notificationsService: NotificationsService,
    public progresoService: ProgresoService,
    private locationService: LocationService,
    private iarriService: IarriService,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
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

  // ─── Minigame State & Methods ──────────────────────────────────────────

  showPlatoMinigame = false;
  minigameCompleted = false;

  foodsToPlace: any[] = [];
  plateSections: { verdura: any[], proteina: any[], carbohidrato: any[] } = { verdura: [], proteina: [], carbohidrato: [] };
  selectedFood: any = null;

  initialFoods = [
    { id: 1, name: 'Brócoli', type: 'verdura', icon: '🥦', placed: false },
    { id: 2, name: 'Zanahoria', type: 'verdura', icon: '🥕', placed: false },
    { id: 3, name: 'Pollo', type: 'proteina', icon: '🍗', placed: false },
    { id: 4, name: 'Pescado', type: 'proteina', icon: '🐟', placed: false },
    { id: 5, name: 'Arroz', type: 'carbohidrato', icon: '🍚', placed: false },
    { id: 6, name: 'Lentejas', type: 'carbohidrato', icon: '🍲', placed: false },
  ];

  openMinigame(id: string) {
    if (id === 'simulador') {
      this.router.navigate(['/tabs/calculadora']);
    } else if (id === 'plato') {
      this.resetMinigame();
      this.showPlatoMinigame = true;
    } else if (id === 'activos') {
      this.resetRutina();
      this.showRutinaMinigame = true;
    } else if (id === 'peatonal') {
      this.showMapModal = true;
      setTimeout(() => {
        this.initWalkMap();
      }, 300);
    } else if (id === 'recetario') {
      this.selectedReceta = null;
      this.showRecetarioModal = true;
    } else if (id === 'conceptos') {
      this.selectedConcepto = null;
      this.showConceptosModal = true;
    } else if (id === 'catchy') {
      this.showCatchyModal = true;
      this.startCatchyGame();
    } else {
      // Fallback
      this.showAlert('Guía en Desarrollo', 'Esta guía detallada estará disponible en la próxima actualización de la aplicación.');
    }
  }

  async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['ENTENDIDO']
    });
    await alert.present();
  }

  closeMinigame() {
    this.showPlatoMinigame = false;
  }

  resetMinigame() {
    this.minigameCompleted = false;
    this.selectedFood = null;
    this.plateSections = { verdura: [], proteina: [], carbohidrato: [] };
    // deep copy
    this.foodsToPlace = JSON.parse(JSON.stringify(this.initialFoods));
  }

  selectFood(food: any) {
    if (food.placed) return;
    this.selectedFood = food;
  }

  async placeFood(section: 'verdura' | 'proteina' | 'carbohidrato') {
    if (!this.selectedFood) return;

    if (this.selectedFood.type === section) {
      // Correct!
      this.selectedFood.placed = true;
      this.plateSections[section].push(this.selectedFood);

      // Puntos
      this.progresoService.addPointsAndStats(10, 'minijuego_plato_item');
      await this.showToast(`¡Correcto! +10 pts (${this.selectedFood.name})`, 'success');

      this.selectedFood = null;

      // Check completion
      const allPlaced = this.foodsToPlace.every(f => f.placed);
      if (allPlaced) {
        this.minigameCompleted = true;
        this.progresoService.addPointsAndStats(50, 'minijuego_plato_completado'); // Bonus
        await this.showToast(`¡Plato Completado! +50 pts extra`, 'success');
      }
    } else {
      // Incorrect
      await this.showToast(`Ups, ${this.selectedFood.name} no va en la sección de ${section}.`, 'danger');
    }
  }

  async showToast(message: string, color: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'top'
    });
    await toast.present();
  }

  // ─── Rutina Express State & Methods ──────────────────────────────────────

  showRutinaMinigame = false;
  currentExerciseIndex = 0;
  rutinaCompleted = false;

  timerValue = 30;
  timerInterval: any;
  timerRunning = false;

  exercises = [
    { name: 'Sentadillas', duration: '30 seg', icon: 'fitness-outline', desc: 'Mantén la espalda recta y baja controladamente.' },
    { name: 'Lagartijas en pared', duration: '30 seg', icon: 'body-outline', desc: 'Apóyate en la pared, flexiona y empuja.' },
    { name: 'Plancha', duration: '30 seg', icon: 'accessibility-outline', desc: 'Aprieta el abdomen y mantén el cuerpo recto.' }
  ];

  resetRutina() {
    this.currentExerciseIndex = 0;
    this.rutinaCompleted = false;
    this.timerValue = 30;
    this.timerRunning = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  closeRutina() {
    this.showRutinaMinigame = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  startTimer() {
    if (this.timerRunning || this.timerValue <= 0) return;
    this.timerRunning = true;
    this.timerInterval = setInterval(() => {
      if (this.timerValue > 0) {
        this.timerValue--;
      } else {
        clearInterval(this.timerInterval);
        this.timerRunning = false;
      }
    }, 1000);
  }

  async nextExercise() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerValue = 30;
    this.timerRunning = false;

    if (this.currentExerciseIndex < this.exercises.length - 1) {
      this.currentExerciseIndex++;
    } else {
      this.rutinaCompleted = true;
      // Otorgar puntos
      this.progresoService.addPointsAndStats(30, 'minijuego_rutina_completada');
      await this.showToast(`¡Rutina Completada! +30 pts`, 'success');
    }
  }

  // ─── Caminata Recomendada Map Modal ──────────────────────────────────────

  showMapModal = false;
  walkMap: mapboxgl.Map | null = null;
  walkMapCoords: { lat: number, lng: number } = { lat: 19.0414, lng: -98.2063 };
  userMarker: mapboxgl.Marker | null = null;
  liveLocationSub: Subscription | null = null;

  async initWalkMap() {
    (mapboxgl as any).accessToken = environment.mapboxKey;

    if (this.walkMap) {
      try { this.walkMap.remove(); } catch (e) { }
    }

    const container = document.getElementById('walk-map-container');
    if (!container) return;
    container.innerHTML = '';

    this.walkMap = new mapboxgl.Map({
      container: 'walk-map-container',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [this.walkMapCoords.lng, this.walkMapCoords.lat],
      zoom: 14.5
    });

    // Create user marker
    this.userMarker = new mapboxgl.Marker({ color: '#E5A98B' })
      .setLngLat([this.walkMapCoords.lng, this.walkMapCoords.lat])
      .addTo(this.walkMap);

    this.walkMap.on('load', () => {
      if (!this.walkMap) return;
      this.startLiveTracking();
    });
  }

  routeGenerated = false;

  async fetchRealisticRoute(lng: number, lat: number) {
    let destLng = lng + 0.005;
    let destLat = lat + 0.005;

    // Try to find a real park or POI as destination
    try {
      const pois = await this.locationService.discoverNearbyPOIs({ lat, lng });
      const park = pois.find(p => p.type === 'park' || p.type === 'plaza');
      if (park) {
        destLng = park.lng;
        destLat = park.lat;
      } else if (pois.length > 0) {
        destLng = pois[0].lng;
        destLat = pois[0].lat;
      }
    } catch (e) { }

    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${lng},${lat};${destLng},${destLat};${lng},${lat}?geometries=geojson&access_token=${environment.mapboxKey}`;
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0].geometry;
        if (this.walkMap) {
          this.walkMap.addSource('route', {
            'type': 'geojson',
            'data': {
              'type': 'Feature',
              'properties': {},
              'geometry': route
            }
          });
          this.walkMap.addLayer({
            'id': 'route',
            'type': 'line',
            'source': 'route',
            'layout': {
              'line-join': 'round',
              'line-cap': 'round'
            },
            'paint': {
              'line-color': '#1E408E',
              'line-width': 5,
              'line-opacity': 0.8
            }
          });
        }
      }
    } catch (e) {
      console.error('[Map] Error fetching directions', e);
    }
  }

  startLiveTracking() {
    this.liveLocationSub = this.locationService.coords$.subscribe(async coords => {
      if (coords && this.userMarker && this.walkMap) {
        this.userMarker.setLngLat([coords.lng, coords.lat]);
        // Smoothly pan map to user
        this.walkMap.panTo([coords.lng, coords.lat], { duration: 1000 });

        if (!this.routeGenerated) {
          this.routeGenerated = true;
          await this.fetchRealisticRoute(coords.lng, coords.lat);
        }
      }
    });
  }

  closeMapModal() {
    this.showMapModal = false;
    this.routeGenerated = false;
    if (this.liveLocationSub) {
      this.liveLocationSub.unsubscribe();
      this.liveLocationSub = null;
    }
    if (this.userMarker) {
      this.userMarker.remove();
      this.userMarker = null;
    }
    if (this.walkMap) {
      try { this.walkMap.remove(); } catch (e) { }
      this.walkMap = null;
    }
  }

  // ─── Recetario State & Methods ──────────────────────────────────────────

  showRecetarioModal = false;
  selectedReceta: any = null;

  recetasList = [
    {
      id: 1,
      name: 'Ensalada de Quinoa y Aguacate',
      icon: '🥗',
      time: '15 min',
      calories: '320 kcal',
      ingredients: [
        '1 taza de quinoa cocida',
        '1/2 aguacate en cubos',
        'Tomates cherry partidos a la mitad',
        '1 cucharada de aceite de oliva',
        'Jugo de medio limón',
        'Sal y pimienta al gusto'
      ],
      steps: [
        'En un bol grande, mezcla la quinoa ya cocida con el aguacate y los tomates.',
        'Prepara el aderezo mezclando el aceite de oliva, el jugo de limón, la sal y la pimienta.',
        'Vierte el aderezo sobre la ensalada y revuelve suavemente.',
        'Sirve inmediatamente o refrigera para más tarde.'
      ]
    },
    {
      id: 2,
      name: 'Salmón al Horno con Espárragos',
      icon: '🐟',
      time: '25 min',
      calories: '410 kcal',
      ingredients: [
        '1 filete de salmón fresco',
        'Un manojo de espárragos',
        '1 diente de ajo picado',
        'Aceite de oliva extra virgen',
        'Rodajas de limón',
        'Hierbas finas'
      ],
      steps: [
        'Precalienta el horno a 200°C.',
        'Coloca el salmón y los espárragos en una bandeja para hornear.',
        'Rocía con aceite de oliva y esparce el ajo picado y las hierbas finas.',
        'Coloca las rodajas de limón sobre el salmón.',
        'Hornea de 15 a 20 minutos hasta que el salmón esté cocido.'
      ]
    },
    {
      id: 3,
      name: 'Avena Nocturna con Chía',
      icon: '🥣',
      time: '5 min prep',
      calories: '280 kcal',
      ingredients: [
        '1/2 taza de hojuelas de avena',
        '1 cucharada de semillas de chía',
        '3/4 taza de leche de almendras (sin azúcar)',
        '1 puñado de frutos rojos (fresas, arándanos)',
        'Un toque de canela'
      ],
      steps: [
        'En un frasco con tapa, agrega la avena, la chía y la leche de almendras.',
        'Revuelve bien para evitar grumos de chía.',
        'Agrega la canela y los frutos rojos por encima.',
        'Tapa el frasco y refrigéralo durante toda la noche.',
        'Disfrútalo frío a la mañana siguiente.'
      ]
    }
  ];

  closeRecetario() {
    this.showRecetarioModal = false;
    this.selectedReceta = null;
  }

  selectReceta(receta: any) {
    this.selectedReceta = receta;
  }

  // ─── Conceptos State & Methods ──────────────────────────────────────────

  showConceptosModal = false;
  selectedConcepto: any = null;

  conceptosList = [
    {
      id: 1,
      title: '¿Qué es la Resistencia a la Insulina?',
      icon: 'water-outline',
      shortDesc: 'La clave para entender tu metabolismo.',
      content: 'La resistencia a la insulina ocurre cuando las células de tus músculos, grasa e hígado no responden bien a la insulina y no pueden absorber fácilmente la glucosa de la sangre. Como resultado, tu páncreas produce más insulina para ayudar a que la glucosa entre a las células. A largo plazo, esto puede elevar permanentemente los niveles de azúcar.'
    },
    {
      id: 2,
      title: 'El Papel del Entorno Construido',
      icon: 'business-outline',
      shortDesc: 'Cómo tu ciudad afecta tu salud biológica.',
      content: 'Nuestras ciudades a menudo fomentan estilos de vida sedentarios (entornos obesogénicos). La falta de áreas verdes, aceras seguras y el fácil acceso a comida rápida contribuyen directamente al desarrollo de enfermedades metabólicas. Cambiar pequeñas cosas en tu entorno personal y familiar puede contrarrestar estos efectos externos.'
    },
    {
      id: 3,
      title: 'La Importancia de la Masa Muscular',
      icon: 'barbell-outline',
      shortDesc: 'Tus músculos son tus mayores aliados.',
      content: 'El músculo esquelético es el principal tejido encargado de absorber la glucosa de la sangre en respuesta a la insulina. Mantener o aumentar la masa muscular a través de pequeñas rutinas de ejercicio de fuerza mejora drásticamente la sensibilidad a la insulina y previene la diabetes.'
    },
    {
      id: 4,
      title: 'Nutrición Preventiva',
      icon: 'nutrition-outline',
      shortDesc: 'La comida como tu principal medicina.',
      content: 'Evitar los picos altos de glucosa es fundamental. Combinar siempre carbohidratos con fibra, proteína o grasas saludables retrasa su absorción en la sangre. Reducir los alimentos ultraprocesados y priorizar ingredientes frescos disminuye el riesgo metabólico ambiental de manera muy significativa.'
    }
  ];

  closeConceptos() {
    this.showConceptosModal = false;
    this.selectedConcepto = null;
  }

  selectConcepto(concepto: any) {
    this.selectedConcepto = concepto;
  }

  // ─── Catchy Minigame State & Methods ──────────────────────────────────────

  showCatchyModal = false;
  catchyScore = 0;
  catchyPlayerPos = 50; 
  catchyItems: { id: number, x: number, y: number, isGood: boolean, icon: string }[] = [];
  catchyGameInterval: any;
  catchyItemInterval: any;
  catchyGameOver = false;
  catchyWon = false;
  catchyItemId = 0;

  startCatchyGame() {
    this.catchyScore = 0;
    this.catchyPlayerPos = 50;
    this.catchyItems = [];
    this.catchyGameOver = false;
    this.catchyWon = false;
    this.catchyItemId = 0;

    if (this.catchyGameInterval) clearInterval(this.catchyGameInterval);
    if (this.catchyItemInterval) clearInterval(this.catchyItemInterval);

    // Update loop (20 fps)
    this.catchyGameInterval = setInterval(() => {
      this.updateCatchyGame();
    }, 50);

    // Spawn loop (every 1s)
    this.catchyItemInterval = setInterval(() => {
      this.spawnCatchyItem();
    }, 1000);
  }

  spawnCatchyItem() {
    if (this.catchyGameOver || this.catchyWon) return;
    const isGood = Math.random() > 0.4; // 60% chance of good item
    this.catchyItems.push({
      id: this.catchyItemId++,
      x: Math.random() * 80 + 10, // 10% to 90%
      y: -10, // start above view
      isGood: isGood,
      icon: isGood ? '🥗' : '🍔'
    });
  }

  updateCatchyGame() {
    if (this.catchyGameOver || this.catchyWon) return;

    for (let i = this.catchyItems.length - 1; i >= 0; i--) {
      let item = this.catchyItems[i];
      item.y += 3; // fall speed

      // Check collision (Player is at y = 85 to 95)
      if (item.y > 80 && item.y < 95) {
        if (Math.abs(item.x - this.catchyPlayerPos) < 12) { // hit radius
          if (item.isGood) {
            this.catchyScore++;
          } else {
            this.catchyScore--;
            if (this.catchyScore < 0) this.catchyScore = 0;
          }
          this.catchyItems.splice(i, 1);
          
          if (this.catchyScore >= 15) {
            this.catchyWon = true;
            this.progresoService.addPointsAndStats(40, 'minijuego_catchy_completado');
            this.showToast('¡Has ganado 40 puntos!', 'success');
            this.endCatchyGame();
          }
          continue;
        }
      }

      if (item.y > 105) {
        this.catchyItems.splice(i, 1); // delete when out of bounds
      }
    }
  }

  moveCatchyPlayer(dir: 'left' | 'right') {
    if (this.catchyWon || this.catchyGameOver) return;
    if (dir === 'left') {
      this.catchyPlayerPos = Math.max(5, this.catchyPlayerPos - 15);
    } else {
      this.catchyPlayerPos = Math.min(95, this.catchyPlayerPos + 15);
    }
  }

  endCatchyGame() {
    if (this.catchyGameInterval) clearInterval(this.catchyGameInterval);
    if (this.catchyItemInterval) clearInterval(this.catchyItemInterval);
  }

  closeCatchy() {
    this.showCatchyModal = false;
    this.endCatchyGame();
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
    this.locationService.startTracking().catch(e => console.warn('startTracking error:', e));

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

    // 1. Obtener métricas territoriales (OSM + INEGI)
    this.subs.add(
      this.locationService.metrics$.pipe(filter(m => !!m)).subscribe(m => {
        this.metrics = m;
        this.evaluateCriticalFactor();
      })
    );

    this.subs.add(
      this.locationService.coords$.pipe(filter(c => !!c)).subscribe(coords => {
        this.walkMapCoords = { lat: coords!.lat, lng: coords!.lng };
        this.iarriService.getDetailedFoodEnvironment(coords!.lat, coords!.lng).subscribe(ear => {
          this.earScore = ear;
          this.evaluateCriticalFactor();
        });
      })
    );

    this.subs.add(
      this.locationService.locationName$.subscribe(name => {
        this.userLocationName = name;
        this.iarriService.getMarginIndex(name).subscribe(im => {
          this.imScore = im;
          this.evaluateCriticalFactor();
        });
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  /**
   * Identifica qué factor del entorno es el más deficiente para priorizar recomendaciones
   */
  private evaluateCriticalFactor() {
    if (!this.metrics) return;

    const av = this.metrics.areasVerdes / 100;
    const ic = this.metrics.caminabilidad / 100;
    const ed = 0.3; // Placeholder para equipamiento deportivo si no hay metros

    const factors = [
      { id: 'av', val: 1 - av },   // Queremos el que tenga mayor déficit (1 - valor)
      { id: 'ic', val: 1 - ic },
      { id: 'ear', val: this.earScore },
      { id: 'im', val: this.imScore },
      { id: 'ed', val: 1 - ed }
    ];

    // Ordenar para encontrar el peor factor
    factors.sort((a, b) => b.val - a.val);
    this.criticalFactor = factors[0].id;
  }

  toggleTheme() {
    this.themeService.toggleDarkMode();
  }

}
