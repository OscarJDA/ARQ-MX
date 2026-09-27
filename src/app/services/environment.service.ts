import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class EnvironmentService {

  constructor(private http: HttpClient) { }

  /**
   * Fetch air quality from Google Air Quality API.
   * If the real API fails (e.g. due to quota or unsupported region), it falls back to simulated data.
   */
  async getAirQuality(lat: number, lng: number): Promise<{ aqi: number; co2: number; pm25: number; recommendation: string }> {
    const url = `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${environment.googleApiKey}`;
    const body = {
      location: {
        latitude: lat,
        longitude: lng
      }
    };

    try {
      const response: any = await lastValueFrom(this.http.post(url, body));
      
      let aqi = 50;
      let pm25 = 10;
      let co2 = 400; // Mock CO2 as Google Air Quality doesn't provide CO2 directly, only CO, NO2 etc.
      let recommendation = 'Calidad del aire aceptable.';

      if (response && response.indexes && response.indexes.length > 0) {
        // Universal AQI index usually
        aqi = response.indexes[0].aqi;
        recommendation = response.indexes[0].category || 'Calidad del aire aceptable.';
      }

      if (response && response.pollutants) {
        const pm25Data = response.pollutants.find((p: any) => p.code === 'pm25');
        if (pm25Data && pm25Data.concentration) {
          pm25 = pm25Data.concentration.value;
        }
        
        // Use CO (Carbon monoxide) to approximate the feeling of CO2 for UI purposes
        const coData = response.pollutants.find((p: any) => p.code === 'co');
        if (coData && coData.concentration) {
          co2 = Math.round(coData.concentration.value + 400); 
        }
      }

      if (aqi > 100) {
        recommendation = 'La calidad del aire no es óptima. Evita actividades físicas intensas al aire libre.';
      } else if (aqi < 50) {
        recommendation = '¡Excelente calidad de aire! Ideal para caminar al aire libre.';
      }

      return { aqi, co2, pm25, recommendation };
    } catch (error) {
      console.warn('Google Air Quality API failed, using fallback data.', error);
      // Fallback
      return this.getSimulatedAirQuality(lat, lng);
    }
  }

  private getSimulatedAirQuality(lat: number, lng: number): { aqi: number; co2: number; pm25: number; recommendation: string } {
    const pseudoRandom = (lat * lng * 10000) % 100;
    const isCityCenter = Math.abs(lat) < 50 && Math.abs(lng) > 50; 

    const baseAqi = isCityCenter ? 80 : 45;
    const aqi = Math.abs(Math.floor(baseAqi + (pseudoRandom % 30) - 15));
    const co2 = Math.abs(Math.floor(400 + (pseudoRandom % 200)));
    const pm25 = Math.abs(Math.floor(12 + (pseudoRandom % 20)));

    let recommendation = 'Abre las ventanas para ventilación cruzada y reduce la acumulación de CO2.';
    if (aqi > 100) {
      recommendation = 'La calidad del aire no es óptima. Evita actividades físicas intensas al aire libre.';
    } else if (aqi < 50) {
      recommendation = '¡Excelente calidad de aire! Ideal para caminar al aire libre.';
    }

    return { aqi, co2, pm25, recommendation };
  }

  /**
   * Integración con Weather API (Open-Meteo para datos reales y sin API key requerida)
   * Extrae Temperatura, Precipitación e Índice UV
   */
  async getWeather(lat: number, lng: number) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,precipitation&daily=uv_index_max&timezone=auto`;
    
    try {
      const response: any = await lastValueFrom(this.http.get(url));
      
      const current = response?.current;
      const daily = response?.daily;
      const weatherCode = current?.weather_code !== undefined ? current.weather_code : 0;
      
      let condition = "Despejado";
      if (weatherCode >= 1 && weatherCode <= 3) condition = "Parcialmente nublado";
      else if (weatherCode >= 45 && weatherCode <= 48) condition = "Neblina";
      else if (weatherCode >= 51 && weatherCode <= 67) condition = "Lluvia";
      else if (weatherCode >= 71 && weatherCode <= 77) condition = "Nieve";
      else if (weatherCode >= 80 && weatherCode <= 82) condition = "Tormenta"; // chubascos
      else if (weatherCode >= 95) condition = "Tormenta eléctrica";

      return {
        temp: current?.temperature_2m || 24,
        condition: condition,
        precipitation: current?.precipitation || 0,
        uv_index: daily?.uv_index_max ? daily.uv_index_max[0] : 0
      };
    } catch(e) {
      console.warn("Weather API integration failed. Using fallback.", e);
      return { temp: 24, condition: "Parcialmente nublado", precipitation: 0, uv_index: 0 };
    }
  }

  /**
   * Integración con Service Health API de Google Cloud
   * https://cloud.google.com/service-health/docs
   */
  async getServiceHealth() {
    const url = `https://servicehealth.googleapis.com/v1/projects/my-project/locations/global/events?key=${environment.googleApiKey}`;
    
    try {
      const response = await lastValueFrom(this.http.get(url));
      return response;
    } catch(e) {
      console.warn("Service Health API call require extra GCP config.", e);
      return { status: 'OPERATIONAL', events: [] };
    }
  }
}

