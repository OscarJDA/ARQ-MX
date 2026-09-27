# ARQ-MX: Entorno Urbano y Salud Metabólica

**ARQ-MX** es una aplicación móvil y web multiplataforma (iOS, Android y Web) construida con Ionic y Angular, diseñada para evaluar y visibilizar cómo el entorno urbano y construido impacta la salud metabólica de sus habitantes.

A través de geolocalización, análisis espacial de puntos de interés (POIs), datos socioeconómicos oficiales y evaluaciones personalizadas, la aplicación ayuda a comprender la relación directa entre el diseño de las ciudades y afecciones como la resistencia a la insulina, el estrés crónico (cortisol), la acumulación de grasa visceral y el síndrome metabólico.

---

## 🎯 Objetivos del Proyecto

- **Evaluar:** Calcular un índice de riesgo basado en el entorno alimentario, conectividad peatonal y la disponibilidad de espacios recreativos (Índice de Ambiente Riesgoso / Promotor de Salud - **IARRI**).
- **Educar:** Proveer información contextual en tiempo real sobre cómo lugares específicos (parques, comida rápida, vías caminables) impactan directamente en la biología y metabolismo de las personas.
- **Prevenir:** Fomentar un estilo de vida saludable al visibilizar "islas de bienestar" y desiertos alimentarios o recreativos.
- **Simular:** Ofrecer herramientas de planificación interactiva para proyectar cómo mejoras en la infraestructura urbana transforman la salud comunitaria.

---

## ✨ Características Principales

* 🗺️ **Mapa Interactivo Inteligente:** Renderizado de alto rendimiento con Mapbox GL JS, exploración libre y navegación basada en geolocalización GPS.
* 📍 **Categorización Metabólica de POIs (OpenStreetMap / Overpass API):**
  * 🟢 **Áreas Verdes:** Parques y jardines (reducción de cortisol y fomento de actividad física).
  * 🔵 **Zonas Deportivas:** Gimnasios, canchas e instalaciones deportivas (mejora de la sensibilidad a la insulina).
  * 🟡 **Rutas Caminables:** Vías y corredores peatonales (fomento de movilidad activa).
  * 🔴 **Entornos de Riesgo:** Cadenas de comida rápida, ultraprocesados y bares (factores de riesgo metabólico y adiposidad visceral).
* 📊 **Métricas Urbanas en Tiempo Real:** Cálculo dinámico de caminabilidad (Walk Score), conectividad vial, densidad de áreas verdes y cercanía a servicios esenciales.
* 🥗 **Entorno Alimentario Riesgoso (EAR):** Análisis geoestadístico basado en datos oficiales de unidades económicas de la **API DENUE del INEGI** (códigos SCIAN).
* 🧪 **Simulador de Entorno Activo:** Planificador interactivo para ajustar variables del entorno (áreas verdes, conectividad, oferta de alimentos saludables vs. ultraprocesados) y simular el impacto en el IARRI.
* 🤖 **Retos Gamificados Contextuales con IA:** Generación dinámica de retos de salud y movilidad mediante **Google Gemini**, adaptados al clima en tiempo real, hora del día, ubicación y POIs del usuario.
* 👤 **Evaluación Personalizada:** Cuestionario de perfil inicial para estimar el riesgo metabólico base del usuario con almacenamiento local privado.
* 🌗 **Interfaz Moderna y Accesible:** Soporte completo para Modo Oscuro/Claro, diseño responsivo y microinteracciones fluidas.

---

## 🛠️ Tecnologías Utilizadas

* **Framework Base:** [Ionic 8](https://ionicframework.com/) & [Angular 20](https://angular.dev/)
* **Integración Móvil Nativa:** [Capacitor 8](https://capacitorjs.com/) (Geolocalización, Notificaciones Locales, Haptics)
* **Visualización de Mapas:** [Mapbox GL JS](https://www.mapbox.com/mapbox-gljs)
* **Datos Espaciales y POIs:** [Overpass API](https://overpass-turbo.eu/) / [OpenStreetMap](https://www.openstreetmap.org/)
* **Datos Geoestadísticos y Económicos:** API DENUE de [INEGI](https://www.inegi.org.mx/) y datos de marginación de [CONAPO](https://www.gob.mx/conapo)
* **Inteligencia Artificial:** SDK oficial de `@google/generative-ai` (Google Gemini)

---

## 🚀 Instalación y Uso Local

### Prerrequisitos

Asegúrate de tener instalado en tu equipo:
- [Node.js](https://nodejs.org/) (versión 18 o superior recomendada)
- [Ionic CLI](https://ionicframework.com/docs/intro/cli):
  ```bash
  npm install -g @ionic/cli
  ```

### 1. Clonar el repositorio
```bash
git clone https://github.com/OscarJDA/ARQ-MX.git
cd ARQ-MX
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Copia la plantilla de configuración en los archivos correspondientes:

```bash
cp src/environments/environment.example.ts src/environments/environment.ts
cp src/environments/environment.example.ts src/environments/environment.prod.ts
```

Edita `src/environments/environment.ts` con tus credenciales:
```typescript
export const environment = {
  production: false,
  inegiKey: 'TU_API_KEY_INEGI',       // API DENUE del INEGI
  mapboxKey: 'TU_MAPBOX_PUBLIC_TOKEN', // Token público de Mapbox (pk.ey...)
  geminiKey: 'TU_GEMINI_API_KEY',      // Google Gemini API Key (AIzaSy...)
  googleApiKey: 'TU_GOOGLE_API_KEY'    // Google Cloud API Key (opcional)
};
```

### 4. Ejecutar en desarrollo (Navegador)
```bash
ionic serve
# o bien
npm start
```
La aplicación estará disponible en `http://localhost:8100`.

### 5. Compilación y Ejecución en Dispositivos Móviles (Android)
```bash
# Compilar bundle web
npm run build

# Sincronizar con el proyecto nativo Capacitor
npx cap sync android

# Abrir proyecto en Android Studio
npx cap open android
```

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
