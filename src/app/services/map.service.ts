import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import * as mapboxgl from 'mapbox-gl';

@Injectable({
  providedIn: 'root'
})
export class MapService {
  mapbox = (mapboxgl as any);
  map: mapboxgl.Map | undefined;
  style = 'mapbox://styles/mapbox/streets-v12';
  lat = 19.0414;
  lng = -98.2063; // Centro de Puebla, MX
  zoom = 12;

  constructor() {
    this.mapbox.accessToken = environment.mapboxKey;
  }

  /**
   * Construye el mapa en el contenedor dado.
   * Si el contenedor ya tiene un canvas de Mapbox (mapa previo), lo destruye limpio
   * para evitar el error "Map already initialized".
   */
  buildMap(containerId: string) {
    // Destruir instancia anterior si existe (evita el error "already initialized")
    if (this.map) {
      try { this.map.remove(); } catch { }
      this.map = undefined;
    }

    // Asegurarse de que el contenedor esté vacío
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';

    this.map = new mapboxgl.Map({
      container: containerId,
      style: this.style,
      zoom: this.zoom,
      center: [this.lng, this.lat]
    });
    this.map.addControl(new mapboxgl.NavigationControl());
  }

  addMarker(lng: number, lat: number, color: string = '#3880ff', onClick?: () => void) {
    if (this.map) {
      const marker = new mapboxgl.Marker({ color })
        .setLngLat([lng, lat])
        .addTo(this.map);
        
      if (onClick) {
        marker.getElement().addEventListener('click', () => onClick());
      }
      return marker;
    }
    return null;
  }
}
