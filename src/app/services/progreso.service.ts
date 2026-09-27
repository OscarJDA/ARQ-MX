import { Injectable } from '@angular/core';
import { NotificationsService } from './notifications.service';

@Injectable({
  providedIn: 'root'
})
export class ProgresoService {
  private STORAGE_KEY = 'app_progreso';

  puntos_actuales = 0; // Puntos de la semana
  puntos_historicos = 0; // Puntos totales acumulados
  puntos_meta = 1000;

  puntosPorDia: number[] = [0, 0, 0, 0, 0, 0, 0]; // 0: Dom, 1: Lun, 2: Mar, 3: Mie, 4: Jue, 5: Vie, 6: Sab
  ultimaSemana: string | null = null;
  ultimoDia: string | null = null;

  stats = {
    retos_completados: 0,
    luz_aire_completados: 0,
    huertos_completados: 0,
    ia_generados: 0,
    quices_completados: 0
  };

  completedRetoIds: string[] = [];
  userProfileImage: string | null = null;

  constructor(private notificationsService: NotificationsService) {
    this.loadFromStorage();
    this.verificarCambioTemporal();
  }

  verificarCambioTemporal() {
    const hoy = new Date();

    // 1. Verificación de cambio de día para reiniciar retos
    const idDia = `${hoy.getFullYear()}-${hoy.getMonth() + 1}-${hoy.getDate()}`;
    if (this.ultimoDia !== idDia) {
      if (this.ultimoDia !== null) {
        // Es un nuevo día, reiniciar retos
        this.completedRetoIds = [];
      }
      this.ultimoDia = idDia;
      this.saveToStorage();
    }

    // 2. Verificación de cambio de semana (Lunes)
    const d = new Date(hoy);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajustar a Lunes
    d.setDate(diff);
    const idSemana = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

    if (this.ultimaSemana !== idSemana) {
      if (this.ultimaSemana !== null) {
        // Solo reiniciar puntos si ya había una semana registrada y cambió
        this.puntos_actuales = 0;
        this.puntosPorDia = [0, 0, 0, 0, 0, 0, 0];
      }
      this.ultimaSemana = idSemana;
      this.saveToStorage();
    }
  }

  insignias = [
    { id: 'puntos_100', name: 'Iniciador', icon: 'star-outline', earned: false, desc: 'Acumula tus primeros 100 puntos.' },
    { id: 'puntos_400', name: 'Meta Semanal', icon: 'flag', earned: false, desc: 'Alcanza la meta de 400 puntos.' },
    { id: 'puntos_1000', name: 'Arquitecto Bioactivo', icon: 'medal', earned: false, desc: 'Acumula 1000 puntos de arquitectura activa.' },
    { id: 'reto_1', name: 'Primer Paso', icon: 'footsteps', earned: false, desc: 'Completa tu primer reto.' },
    { id: 'retos_5', name: 'Entusiasta', icon: 'flame', earned: false, desc: 'Completa 5 retos.' },
    { id: 'retos_10', name: 'Agente Metabólico', icon: 'pulse', earned: false, desc: 'Participa en 10 misiones a escala de colonia.' },
    { id: 'luz_aire_1', name: 'Respiro Profundo', icon: 'cloud-done', earned: false, desc: 'Completa un reto de luz y aire.' },
    { id: 'luz_aire_5', name: 'Diseñador Preventivo', icon: 'compass', earned: false, desc: 'Completa 5 retos de luz y aire preventivos.' },
    { id: 'huerto_1', name: 'Mano Verde', icon: 'leaf', earned: false, desc: 'Completa un reto de huerto urbano.' },
    { id: 'ia_1', name: 'Mente Dinámica', icon: 'sparkles', earned: false, desc: 'Genera tu primer reto con Inteligencia Artificial.' }
  ];

  get progresoSemanal(): number {
    const ratio = this.puntos_actuales / this.puntos_meta;
    return ratio > 1 ? 1 : ratio;
  }

  get puntosFaltantes(): number {
    return Math.max(0, this.puntos_meta - this.puntos_actuales);
  }

  get insigniasObtenidas() {
    return this.insignias.filter(i => i.earned);
  }

  addPointsAndStats(points: number, retoId: string) {
    this.verificarCambioTemporal();

    this.puntos_actuales += points;
    this.puntos_historicos += points;

    // Registrar en el día actual
    const hoy = new Date().getDay(); // 0 es Domingo
    this.puntosPorDia[hoy] += points;

    this.stats.retos_completados++;
    if (retoId === 'luz_aire') {
      this.stats.luz_aire_completados++;
    } else if (retoId === 'huerto') {
      this.stats.huertos_completados++;
    } else if (retoId.startsWith('quiz')) {
      this.stats.quices_completados++;
    }

    if (!this.completedRetoIds.includes(retoId)) {
      this.completedRetoIds.push(retoId);
      this.notificationsService.addNotification('⚡ Puntos ganados', `Has ganado ${points} puntos por completar: ${retoId}`);
    }
    this.saveToStorage();
  }

  incrementIaGenerados() {
    this.stats.ia_generados++;
    this.saveToStorage();
  }

  verificarInsignias(): string[] {
    let nuevasInsignias: string[] = [];

    for (let badge of this.insignias) {
      if (!badge.earned) {
        let earnedNow = false;
        switch (badge.id) {
          case 'puntos_100': earnedNow = this.puntos_historicos >= 100; break;
          case 'puntos_400': earnedNow = this.puntos_historicos >= 400; break;
          case 'puntos_1000': earnedNow = this.puntos_historicos >= 1000; break;
          case 'reto_1': earnedNow = this.stats.retos_completados >= 1; break;
          case 'retos_5': earnedNow = this.stats.retos_completados >= 5; break;
          case 'retos_10': earnedNow = this.stats.retos_completados >= 10; break;
          case 'luz_aire_1': earnedNow = this.stats.luz_aire_completados >= 1; break;
          case 'luz_aire_5': earnedNow = this.stats.luz_aire_completados >= 5; break;
          case 'huerto_1': earnedNow = this.stats.huertos_completados >= 1; break;
          case 'ia_1': earnedNow = this.stats.ia_generados >= 1; break;
        }

        if (earnedNow) {
          badge.earned = true;
          nuevasInsignias.push(badge.name);
          this.notificationsService.addNotification('🏆 Nueva Insignia: ' + badge.name, badge.desc);
        }
      }
    }

    this.saveToStorage();
    return nuevasInsignias;
  }

  // ─── Persistencia en localStorage ──────────────────────────────────────

  private saveToStorage() {
    try {
      const data = {
        puntos_actuales: this.puntos_actuales,
        puntos_historicos: this.puntos_historicos,
        puntosPorDia: this.puntosPorDia,
        ultimaSemana: this.ultimaSemana,
        ultimoDia: this.ultimoDia,
        stats: this.stats,
        completedRetoIds: this.completedRetoIds,
        userProfileImage: this.userProfileImage,
        insignias: this.insignias.map(i => ({ id: i.id, earned: i.earned }))
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[ProgresoService] Error saving to storage:', e);
    }
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.puntos_actuales = data.puntos_actuales || 0;
        this.puntos_historicos = data.puntos_historicos || this.puntos_actuales;
        this.puntosPorDia = data.puntosPorDia || [0, 0, 0, 0, 0, 0, 0];
        this.ultimaSemana = data.ultimaSemana || null;
        this.ultimoDia = data.ultimoDia || null;
        this.stats = { ...this.stats, ...data.stats };
        this.completedRetoIds = data.completedRetoIds || [];
        this.userProfileImage = data.userProfileImage || null;

        // Restaurar insignias ganadas
        if (data.insignias) {
          for (const savedBadge of data.insignias) {
            const badge = this.insignias.find(i => i.id === savedBadge.id);
            if (badge) {
              badge.earned = savedBadge.earned;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[ProgresoService] Error loading from storage:', e);
    }
  }

  /** Reinicia todo el progreso (para cerrar sesión) */
  resetAll() {
    this.puntos_actuales = 0;
    this.puntos_historicos = 0;
    this.puntosPorDia = [0, 0, 0, 0, 0, 0, 0];
    this.ultimaSemana = null;
    this.ultimoDia = null;
    this.stats = {
      retos_completados: 0,
      luz_aire_completados: 0,
      huertos_completados: 0,
      ia_generados: 0,
      quices_completados: 0
    };
    this.completedRetoIds = [];
    this.userProfileImage = null;
    this.insignias.forEach(i => i.earned = false);
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
