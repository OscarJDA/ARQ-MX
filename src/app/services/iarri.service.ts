import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface HealthVariables {
  areaVerdePorHabitante: number; // m2
  intersecciones: number;        // Normalizado 0-1
  densidadEquipamiento: number;  // Normalizado 0-1
  banquetas: number;             // Normalizado 0-1
  equipamientosDeportivos: number;
  poblacionLocal: number;
  tiendasUltraprocesados: number;
  tiendasTotales: number;
  indiceMarginacion: number;     // Normalizado 0-1 (CONAPO)
}

@Injectable({
  providedIn: 'root'
})
export class IarriService {
  private inegiUrl = 'https://www.inegi.org.mx/app/api/denue/v1/consulta/buscar';

  private foodEnvCache = new Map<string, number>();
  private marginIndexCache = new Map<string, number>();
  private municipiosCache: any[] | null = null;

  constructor(private http: HttpClient) { }

  /**
   * Obtiene datos del DENUE para calcular Entorno Alimentario Riesgoso (EAR)
   * Usa códigos SCIAN para distinguir saludabilidad:
   * 461130: Frutas y verduras (Protector)
   * 722513: Comida rápida (Riesgo)
   * 461110: Abarrotes (Riesgo si es lo único disponible)
   */
  getDetailedFoodEnvironment(lat: number, lng: number, radius: number = 400): Observable<number> {
    // Cache key rounds to ~3 decimals (approx 110m grid) to group nearby queries
    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${radius}`;
    if (this.foodEnvCache.has(cacheKey)) {
      return of(this.foodEnvCache.get(cacheKey)!);
    }

    const codes = ['461130', '722513', '461110'];

    const requests = codes.map(code => {
      const url = `${this.inegiUrl}/${code}/${lat},${lng}/${radius}/${environment.inegiKey}`;
      return this.http.get<any[]>(url).pipe(
        map(res => ({ code, count: Array.isArray(res) ? res.length : 0 })),
        catchError(() => of({ code, count: 0 }))
      );
    });

    return forkJoin(requests).pipe(
      map(results => {
        const healthy = results.find(r => r.code === '461130')?.count || 0;
        const fastFood = results.find(r => r.code === '722513')?.count || 0;
        const abarrotes = results.find(r => r.code === '461110')?.count || 0;

        const total = healthy + fastFood + abarrotes;
        let ear = 0.5; // Neutral si no hay datos
        if (total > 0) {
          // El EAR es alto si hay mucha comida rápida o abarrotes comparado con fruta fresca
          ear = (fastFood + (abarrotes * 0.5)) / total;
        }

        this.foodEnvCache.set(cacheKey, ear);
        return ear;
      })
    );
  }

  /**
   * Obtiene el índice de marginación desde el archivo local de municipios
   */
  getMarginIndex(municipioName: string): Observable<number> {
    const key = municipioName.toLowerCase();
    if (this.marginIndexCache.has(key)) {
      return of(this.marginIndexCache.get(key)!);
    }

    if (this.municipiosCache) {
      return of(this.findMarginIndexFromCache(key));
    }

    return this.http.get<any[]>('assets/data/municipios_puebla.json').pipe(
      map(data => {
        this.municipiosCache = data;
        return this.findMarginIndexFromCache(key);
      }),
      catchError(() => of(0.25))
    );
  }

  private findMarginIndexFromCache(key: string): number {
    const found = this.municipiosCache!.find(m => key.includes(m.municipio.toLowerCase()));
    const im = found ? found.im : 0.25; // Default moderado si no se encuentra
    this.marginIndexCache.set(key, im);
    return im;
  }

  /**
   * Calcula el score IARRI con las ponderaciones de la propuesta académica
   * IARRI = alpha(1-AV) + beta(1-IC) + gamma(1-ED) + delta(EAR) + epsilon(IM)
   */
  calculateIarriScore(variables: any): number {
    const {
      av = 0.5,
      ic = 0.5,
      ed = 0.5,
      ear = 0.5,
      im = 0.1,
      weather
    } = variables;

    // Pesos exactos de la propuesta:
    // AV: 0.20, IC: 0.25, ED: 0.15, EAR: 0.25, IM: 0.15
    const alpha = 0.20;
    const beta = 0.25;
    const gamma = 0.15;
    const delta = 0.25;
    const epsilon = 0.15;

    // 1. Aplicar normalización estricta [0, 1] en límite Inferior y Superior
    const nAV = Math.max(0, Math.min(av, 1));
    const nIC = Math.max(0, Math.min(ic, 1));
    const nED = Math.max(0, Math.min(ed, 1));
    const nEAR = Math.max(0, Math.min(ear, 1));
    const nIM = Math.max(0, Math.min(im, 1));

    let score = (alpha * (1 - nAV)) +
      (beta * (1 - nIC)) +
      (gamma * (1 - nED)) +
      (delta * nEAR) +
      (epsilon * nIM);

    // 2. Límite final y solución a la divergencia de redondeo/clasificación global
    const finalScore = Math.min(1.0, Math.max(0, score));
    return Number(finalScore.toFixed(2));
  }

  /**
   * Implementación de Referencia Exacta del Modelo Integral IARRI (Pdf)
   */
  public calculateRisk(data: HealthVariables): { index: number, classification: string } {
    // 1. Calcular variables con normalización ESTRICTA [0, 1] (Límite Inferior y Superior)
    const rawAV = data.areaVerdePorHabitante / 9.0;
    const AV = Math.max(0, Math.min(rawAV, 1));

    const rawIC = (data.intersecciones + data.densidadEquipamiento + data.banquetas) / 3.0;
    const IC = Math.max(0, Math.min(rawIC, 1));

    const rawED = data.equipamientosDeportivos / (data.poblacionLocal || 1);
    const ED = Math.max(0, Math.min(rawED, 1));

    const rawEAR = data.tiendasTotales > 0 ? (data.tiendasUltraprocesados / data.tiendasTotales) : 0;
    const EAR = Math.max(0, Math.min(rawEAR, 1));

    const IM = Math.max(0, Math.min(data.indiceMarginacion, 1));

    // 2. Aplicar fórmula general con ponderaciones e inversiones de riesgo (IARRI)
    const IARRI = 0.20 * (1 - AV) +
      0.25 * (1 - IC) +
      0.15 * (1 - ED) +
      0.25 * (EAR) +
      0.15 * (IM);

    // 3. Redondear a 2 decimales ANTES de calcular el nivel de riesgo
    const finalizedIndex = Number(IARRI.toFixed(2));

    // 4. Clasificación exacta utilizando el índice de 2 decimales
    let classification = '';
    if (finalizedIndex <= 0.33) {
      classification = 'Bajo';
    } else if (finalizedIndex <= 0.66) {
      classification = 'Medio';
    } else {
      classification = 'Alto';
    }

    return {
      index: finalizedIndex,
      classification: classification
    };
  }
}
