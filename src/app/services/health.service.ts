import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, lastValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class HealthService {
  
  // Usaremos un BehaviorSubject para que la UI pueda escuchar los cambios en tiempo real
  private stepsSubject = new BehaviorSubject<number>(0);
  steps$: Observable<number> = this.stepsSubject.asObservable();
  
  private lastAccel = 0;
  private isTracking = false;
  
  private STORAGE_KEY_STEPS = 'app_daily_steps';
  private STORAGE_KEY_DATE = 'app_steps_date';

  constructor(private http: HttpClient) { }

  /**
   * Obtiene los pasos actuales integrando Google Fitness API (si hay token disponible)
   * o usando el podómetro local de emergencia.
   */
  async getDailySteps(): Promise<number> {
    this.restoreLocalSteps();
    let baselineSteps = 0; 
    
    try {
      baselineSteps = await this.fetchGoogleFitnessSteps();
    } catch(e) {
      console.warn('Google Fitness API require OAuth token context for user data. Falling back to local/default.', e);
    }
    
    // Si es la primera vez que lo llamamos, arrancamos el podómetro
    if (!this.isTracking) {
      if (baselineSteps > this.stepsSubject.getValue()) {
        this.stepsSubject.next(baselineSteps);
        this.saveLocalSteps(baselineSteps);
      }
      this.startLocalPedometer();
    }
    
    return this.stepsSubject.getValue();
  }

  private restoreLocalSteps() {
    const today = new Date().toLocaleDateString('es-MX');
    const storedDate = localStorage.getItem(this.STORAGE_KEY_DATE);
    if (storedDate === today) {
       const steps = parseInt(localStorage.getItem(this.STORAGE_KEY_STEPS) || '0', 10);
       this.stepsSubject.next(steps);
    } else {
       // Nuevo día o primera vez -> reset
       localStorage.setItem(this.STORAGE_KEY_DATE, today);
       localStorage.setItem(this.STORAGE_KEY_STEPS, '0');
       this.stepsSubject.next(0);
    }
  }

  private saveLocalSteps(steps: number) {
    const today = new Date().toLocaleDateString('es-MX');
    localStorage.setItem(this.STORAGE_KEY_DATE, today);
    localStorage.setItem(this.STORAGE_KEY_STEPS, steps.toString());
  }

  /**
   * Integración con la Google Fitness API
   */
  private async fetchGoogleFitnessSteps(): Promise<number> {
    const url = `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate?key=${environment.googleApiKey}`;
    const body = {
      aggregateBy: [{
        dataTypeName: "com.google.step_count.delta",
        dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
      }],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: new Date().setHours(0,0,0,0),
      endTimeMillis: new Date().getTime()
    };

    // Esto lanzará un error 401 si no hay un token Bearer en un entorno real.
    const response: any = await lastValueFrom(this.http.post(url, body));
    
    let totalSteps = 0;
    if (response && response.bucket && response.bucket.length > 0) {
      const bucket = response.bucket[0];
      if (bucket.dataset && bucket.dataset.length > 0) {
         const points = bucket.dataset[0].point;
         if (points && points.length > 0) {
           totalSteps = points.reduce((acc: number, p: any) => acc + (p.value[0].intVal || 0), 0);
         }
      }
    }
    return totalSteps;
  }

  /**
   * Integración con la Google Cloud Healthcare API (Mock de conexión para historia clínica/FHIR)
   */
  async getHealthRecords() {
    const url = `https://healthcare.googleapis.com/v1/projects/my-project/locations/us-central1/datasets/my-dataset/fhirStores/my-fhir-store/fhir/Patient?key=${environment.googleApiKey}`;
    try {
       const response = await lastValueFrom(this.http.get(url));
       return response;
    } catch(e) {
       console.warn('Configuración de Google Health API o permisos insuficientes.', e);
       return null;
    }
  }

  async getActiveCalories(): Promise<number> {
    return Math.floor(this.stepsSubject.getValue() * 0.04);
  }

  /**
   * Podómetro básico en tiempo real que usa el sensor de movimiento físico de tu celular.
   * Cuenta pasos mientras el teléfono se mueva con un patrón de caminata.
   */
  private startLocalPedometer() {
    if (typeof window !== 'undefined' && window.addEventListener) {
      this.isTracking = true;
      
      // Solicitar permiso en iOS 13+ (si aplica)
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        (DeviceMotionEvent as any).requestPermission().catch(console.error);
      }

      window.addEventListener('devicemotion', (event) => {
        const acc = event.accelerationIncludingGravity;
        if (acc && acc.x !== null && acc.y !== null && acc.z !== null) {
           // Calcular la magnitud de la aceleración
           const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
           
           // Si la fuerza del movimiento sobrepasa un umbral (ej. 2.0 m/s^2 de diferencial),
           // se considera un paso/pisada.
           if (this.lastAccel > 0) {
             const delta = Math.abs(magnitude - this.lastAccel);
             if (delta > 2.0 && delta < 15.0) { 
               const currentSteps = this.stepsSubject.getValue();
               this.stepsSubject.next(currentSteps + 1);
               this.saveLocalSteps(currentSteps + 1);
             }
           }
           this.lastAccel = magnitude;
        }
      });
    }
  }
}
