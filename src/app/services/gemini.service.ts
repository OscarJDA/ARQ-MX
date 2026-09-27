import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { NearbyPOI } from './location.service';

/** Contexto completo para generar un reto con IA */
export interface ChallengeContext {
  iarri: string;
  municipio: string;
  retosPrevios: string[];
  weather?: any;
  nearbyPOIs?: NearbyPOI[];
  walkScore?: number;
  greenScore?: number;
  hora?: number; // 0-23
}

@Injectable({
  providedIn: 'root'
})
export class GeminiService {

  constructor() { }

  /**
   * Genera un reto completamente contextualizado basado en:
   * - Ubicación real (municipio + POIs en 500m)
   * - Clima actual (temp, precipitación, UV)
   * - Hora del día
   * - Walk Score y áreas verdes
   * - Nivel IARRI del usuario
   */
  async generarNuevoReto(
    iarri: string,
    municipio: string,
    retosPrevios: string[],
    weather?: any,
    nearbyPOIs?: NearbyPOI[],
    walkScore?: number,
    greenScore?: number
  ): Promise<any> {
    const apiKey = environment.geminiKey;
    if (!apiKey) {
      throw new Error('El servicio de IA no está configurado (Falta API Key).');
    }

    const context = this.buildContextPrompt({
      iarri,
      municipio,
      retosPrevios,
      weather,
      nearbyPOIs,
      walkScore,
      greenScore,
      hora: new Date().getHours()
    });

    const requestBody = {
      contents: [{
        parts: [{ text: context }]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    // Modelos en orden de preferencia (fallback si el primero está saturado)
    const models = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash'
    ];

    let lastError: any = null;

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      // Hasta 2 reintentos por modelo con backoff exponencial
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) {
            // Esperar antes de reintentar: 1.5s, 3s
            await this.delay(1500 * (attempt + 1));
          }

          console.log(`[GeminiService] Intentando ${model} (intento ${attempt + 1})...`);

          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          const data = await resp.json();

          if (!resp.ok) {
            const errMsg = data.error?.message || `Error ${resp.status}`;
            console.warn(`[GeminiService] ${model} respondió con error: ${errMsg}`);
            lastError = new Error(errMsg);

            // Si es error de rate limit (429) o sobrecarga (503), reintentar
            if (resp.status === 429 || resp.status === 503) {
              continue; // Siguiente intento
            }
            // Otro error (400, 401, etc.) — saltar al siguiente modelo
            break;
          }

          // Éxito: parsear respuesta
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            lastError = new Error('Respuesta vacía del modelo de IA');
            break; // Siguiente modelo
          }

          const retoData = JSON.parse(text);
          retoData.completed = false;
          retoData.en_progreso = false;
          retoData.points = Number(retoData.points);
          retoData.ai_generated = true;
          retoData.generated_at = new Date().toISOString();
          retoData.ai_model = model;

          console.log(`[GeminiService] ✓ Reto generado con ${model}`);
          return retoData;

        } catch (e: any) {
          console.warn(`[GeminiService] ${model} intento ${attempt + 1} falló:`, e.message);
          lastError = e;
        }
      }
    }

    // Si todos los modelos fallaron, generar un reto offline
    console.warn('[GeminiService] Todos los modelos fallaron, generando reto offline...');
    return this.generarRetoOffline(municipio, iarri, nearbyPOIs);
  }

  /**
   * Genera un reto reactivo disparado por una geocerca (notificación proactiva).
   * Recibe el evento completo de geocerca con POIs y métricas.
   */
  async generarRetoGeofence(
    municipio: string,
    iarri: string,
    weather: any,
    nearbyPOIs: NearbyPOI[],
    walkScore: number,
    greenScore: number
  ): Promise<any> {
    return this.generarNuevoReto(
      iarri,
      municipio,
      [], // No filtramos por retos previos en geocercas
      weather,
      nearbyPOIs,
      walkScore,
      greenScore
    );
  }

  /**
   * Construye el prompt completo con todo el contexto del usuario.
   */
  private buildContextPrompt(ctx: ChallengeContext): string {
    const hora = ctx.hora ?? new Date().getHours();
    const prevChallengesText = ctx.retosPrevios.length > 0 ? ctx.retosPrevios.join(', ') : 'Ninguno';

    // === Bloque de horario ===
    let periodoDelDia = '';
    let restriccionesHorario = '';
    if (hora >= 5 && hora < 8) {
      periodoDelDia = 'Madrugada/amanecer (5-8am)';
      restriccionesHorario = 'Es temprano, ideal para ejercicio matutino al aire libre si el clima lo permite.';
    } else if (hora >= 8 && hora < 12) {
      periodoDelDia = 'Mañana (8am-12pm)';
      restriccionesHorario = 'Buena hora para actividades al aire libre.';
    } else if (hora >= 12 && hora < 15) {
      periodoDelDia = 'Mediodía (12-3pm)';
      restriccionesHorario = 'Hora de máximo calor y UV. Prefiere actividades en sombra o interiores si hace calor.';
    } else if (hora >= 15 && hora < 18) {
      periodoDelDia = 'Tarde (3-6pm)';
      restriccionesHorario = 'El calor baja, buena hora para caminar.';
    } else if (hora >= 18 && hora < 21) {
      periodoDelDia = 'Atardecer/noche temprana (6-9pm)';
      restriccionesHorario = 'Última ventana para actividades al aire libre con luz natural.';
    } else {
      periodoDelDia = 'Noche (9pm-5am)';
      restriccionesHorario = 'Es de noche. SOLO sugiere retos de interior: estiramientos, meditación, ventilación de casa, hidratación.';
    }

    // === Bloque de clima ===
    let weatherContext = '';
    if (ctx.weather) {
      const w = ctx.weather;
      weatherContext = `
CLIMA ACTUAL:
- Temperatura: ${w.temp}°C
- Condición: ${w.condition}
- Precipitación: ${w.precipitation}mm
- Índice UV: ${w.uv_index}

REGLAS CLIMÁTICAS ESTRICTAS:
- Si está lloviendo (precipitación > 0) o la condición indica lluvia/tormenta: SOLO retos de interior.
- Si UV > 7 o temperatura > 33°C: NO sugieras caminar al sol ni correr. Sugiere actividades en sombra, en casa, o hidratación.
- Si temperatura < 5°C: Sugiere actividades de abrigo o interiores.`;
    }

    // === Bloque de POIs cercanos (los reales del entorno) ===
    let poisContext = '';
    if (ctx.nearbyPOIs && ctx.nearbyPOIs.length > 0) {
      const poisList = ctx.nearbyPOIs
        .slice(0, 10) // Max 10 para no saturar el prompt
        .map(p => `- ${p.name} (${p.type}, a ${p.distanceM}m — ~${Math.max(1, Math.round(p.distanceM / 80))} min caminando)`)
        .join('\n');

      poisContext = `
LUGARES REALES CERCA DEL USUARIO (radio 500m, datos de OpenStreetMap):
${poisList}

REGLA CRÍTICA: Solo puedes proponer retos que involucren lugares que aparecen en esta lista.
NO inventes nombres de parques, plazas o lugares que no estén aquí.
Si quieres proponer visitar un lugar, DEBES usar el nombre exacto de esta lista.
Si no hay parques en la lista, NO propongas visitar un parque.`;
    } else {
      poisContext = `
No hay datos de lugares cercanos disponibles. Propón un reto genérico que no requiera ir a un lugar específico (caminar por tu calle, estiramientos, ventilación del hogar, hidratación, etc.).`;
    }

    // === Bloque de métricas urbanas ===
    let metricsContext = '';
    if (ctx.walkScore !== undefined || ctx.greenScore !== undefined) {
      metricsContext = `
MÉTRICAS DEL ENTORNO URBANO:
- Walk Score personalizado: ${ctx.walkScore ?? 'N/A'}/100
- Áreas Verdes: ${ctx.greenScore ?? 'N/A'}/100
${(ctx.walkScore ?? 0) < 40 ? '⚠️ Zona de baja caminabilidad. Sugiere rutas alternativas o ejercicio en casa.' : ''}
${(ctx.greenScore ?? 0) > 60 ? '✅ Zona con buenas áreas verdes. Aprovechar para "baños de bosque" o caminatas.' : ''}`;
    }

    let riskInstructions = '';
    const riskLower = ctx.iarri.toLowerCase();
    if (riskLower.includes('alto')) {
      riskInstructions = `- ERES DE ALTO RIESGO. Recomienda retos de habitabilidad y micro-esfuerzos. (Ej: "Elige una ruta plana de 10 minutos", "Aplica el Método del Plato en tu comida", "Camina suave"). DA PUNTOS ALTOS (80-100) POR ESTOS MICRO-ESFUERZOS porque son un gran logro para este usuario.`;
    } else if (riskLower.includes('moderado')) {
      riskInstructions = `- ERES DE RIESGO MODERADO. Enfócate en constancia metabólica. (Ej: "Camina 15 minutos después de comer para evitar picos de glucosa"). ASIGNA PUNTOS MODERADOS (50-80).`;
    } else {
      riskInstructions = `- ERES DE BAJO RIESGO. Retos de exploración intensa y actividad física exigente. (Ej: "Descubre 3 parques hoy", "Ruta de 10,000 pasos", "Ejercicio de fuerza"). DA POCOS PUNTOS (20-40) A ESFUERZOS LEVES Y SOLO DA PUNTOS ALTOS (80-100) A ACTIVIDADES INTENSAS.`;
    }

    return `Eres un experto en urbanismo táctico, prevención de resistencia a la insulina y gamificación de salud metabólica.

CONTEXTO DEL USUARIO:
- Municipio/zona: "${ctx.municipio}"
- Nivel IARRI (Índice de Riesgo): "${ctx.iarri}"
${riskInstructions}
- Retos ya completados (NO repetir): "${prevChallengesText}"

HORARIO:
- Hora actual: ${hora}:00 — ${periodoDelDia}
- ${restriccionesHorario}
${weatherContext}
${poisContext}
${metricsContext}

INSTRUCCIONES:
1. Genera UN reto COMPLETAMENTE NUEVO, realizable AHORA MISMO considerando hora, clima y lugares disponibles.
2. El reto debe ser concreto y accionable en los próximos 15-30 minutos.
3. El reto debe relacionarse con la prevención de resistencia a la insulina o bienestar metabólico.
4. Si mencionas un lugar, DEBE ser uno de la lista de lugares reales cercanos.
5. Adapta los puntos según dificultad: 20-30 pts para retos fáciles (interior), 40-60 para moderados (caminar), 70-100 para desafiantes (ejercicio activo).

Devuelve la respuesta en formato JSON puro con ESTA estructura exacta:
{
  "id": "id_unico_descriptivo",
  "title": "Título corto y motivador",
  "desc": "Descripción breve y específica del reto (mencionar el lugar real si aplica)",
  "icon": "walk|leaf|water|fitness|sunny|home|cafe|map|heart|body",
  "color": "success|warning|primary|tertiary",
  "points": 50,
  "poi_name": "nombre del lugar cercano involucrado o null si es reto de interior",
  "poi_distance_m": 200,
  "reason": "Breve explicación de por qué este reto es bueno para tu salud metabólica"
}`;
  }

  /** Espera N milisegundos (para backoff entre reintentos) */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Genera un reto offline cuando la API de IA no está disponible.
   * Usa el contexto local para crear un reto relevante sin depender de Gemini.
   */
  private generarRetoOffline(municipio: string, iarri: string, nearbyPOIs?: NearbyPOI[]): any {
    const hora = new Date().getHours();
    const isNight = hora >= 22 || hora < 6;
    const isAltoRiesgo = iarri.toLowerCase().includes('alto');
    const isBajoRiesgo = iarri.toLowerCase().includes('bajo');

    // Asymmetric Gamification: Puntos adaptados al riesgo
    const multAlto = isAltoRiesgo ? 3 : (isBajoRiesgo ? 0.5 : 1);

    // Buscar un parque cercano si existe
    const park = nearbyPOIs?.find(p => ['park', 'garden', 'playground', 'plaza'].includes(p.type));

    // Pool de retos offline según contexto
    const retosInterior = [
      { id: 'offline_ventilacion', title: 'Ventilación Cruzada', desc: 'Abre al menos 2 ventanas opuestas durante 10 minutos para renovar el aire de tu hogar', icon: 'home', color: 'primary', points: Math.round(20 * multAlto), reason: 'La ventilación cruzada reduce CO2 interior y mejora tu concentración y metabolismo.' },
      { id: 'offline_estiramiento', title: 'Pausa Activa', desc: 'Realiza 5 minutos de estiramientos: cuello, hombros, espalda y piernas', icon: 'body', color: 'tertiary', points: Math.round(25 * multAlto), reason: 'Las pausas activas reactivan tu circulación y reducen la resistencia a la insulina por sedentarismo.' },
      { id: 'offline_hidratacion', title: 'Hidratación Consciente', desc: 'Bebe 2 vasos de agua en los próximos 30 minutos', icon: 'water', color: 'primary', points: isAltoRiesgo ? 90 : Math.round(15 * multAlto), reason: 'La hidratación adecuada mejora el metabolismo de la glucosa y reduce el estrés oxidativo.' },
      { id: 'offline_respiracion', title: 'Respiración 4-7-8', desc: 'Practica 4 ciclos de respiración: inhala 4s, retén 7s, exhala 8s', icon: 'heart', color: 'success', points: Math.round(20 * multAlto), reason: 'La técnica 4-7-8 reduce cortisol, hormona que aumenta la resistencia a la insulina.' },
    ];

    const retosExterior = [
      { id: 'offline_caminata', title: 'Caminata Metabólica', desc: `Camina 15 minutos por tu colonia en ${municipio}`, icon: 'walk', color: 'success', points: isAltoRiesgo ? 100 : Math.round(40 * multAlto), reason: 'Caminar 15 minutos después de comer reduce los picos de glucosa hasta un 30%.' },
      { id: 'offline_exploracion', title: 'Exploración Urbana', desc: 'Camina por una calle diferente a tu ruta habitual durante 10 minutos', icon: 'map', color: 'warning', points: Math.round(35 * multAlto), reason: 'Explorar rutas nuevas estimula la neuroplasticidad y aumenta tu actividad física diaria.' },
    ];

    let reto: any;

    if (isNight) {
      // De noche: solo retos de interior
      reto = retosInterior[Math.floor(Math.random() * retosInterior.length)];
    } else if (park) {
      // Hay un parque cerca: proponer visitarlo
      const walkMin = Math.max(1, Math.round(park.distanceM / 80));
      reto = {
        id: 'offline_parque',
        title: `Visita ${park.name}`,
        desc: `Estás a ~${walkMin} min de ${park.name}. Camina hasta ahí y pasa al menos 10 minutos al aire libre.`,
        icon: 'leaf',
        color: 'success',
        points: isAltoRiesgo ? 100 : Math.round((park.distanceM < 200 ? 50 : 40) * multAlto),
        poi_name: park.name,
        poi_distance_m: park.distanceM,
        reason: 'Pasar tiempo en áreas verdes reduce cortisol, presión arterial y mejora la sensibilidad a la insulina.'
      };
    } else {
      // Sin parques: mezcla de exterior e interior
      const pool = [...retosExterior, ...retosInterior];
      reto = pool[Math.floor(Math.random() * pool.length)];
    }

    return {
      ...reto,
      completed: false,
      en_progreso: false,
      ai_generated: false,
      ai_model: 'offline',
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Genera un análisis metabólico personalizado de 2-3 párrafos
   * en base a las respuestas del usuario en el test inicial.
   */
  async generarAnalisisPersonalizado(nombre: string, respuestas: any[], interpretacion: string): Promise<string> {
    const apiKey = environment.geminiKey;
    if (!apiKey) {
      return 'No fue posible generar el análisis con IA (falta la clave).';
    }

    const sintomasFilter = respuestas.filter(r => r.category === 'Síntomas físicos' && r.value).map(r => r.text);
    const labFilter = respuestas.filter(r => r.category === 'Indicadores metabólicos' && r.value).map(r => r.text);
    const vidaFilter = respuestas.filter(r => r.category === 'Estilo de vida' && r.value).map(r => r.text);

    const prompt = `Eres un experto endocrinólogo y health coach.
El usuario ${nombre} acaba de tomar un test de resistencia a la insulina. Su resultado fue: ${interpretacion}.

Síntomas que presenta (marcó Sí):
${sintomasFilter.length ? sintomasFilter.join('\\n- ') : 'Ninguno grave.'}

Indicadores clínicos (marcó Sí):
${labFilter.length ? labFilter.join('\\n- ') : 'Ninguno o no sabe.'}

Estilo de vida (marcó Sí):
${vidaFilter.length ? vidaFilter.join('\\n- ') : 'Adecuado.'}

Crea un breve párrafo animador, cálido y personalizado para ${nombre}. Explícale qué significan estos resultados específicos para su estilo de vida y menciona algo particular de los síntomas o hábitos que marcó. Dale ánimo sin que suene genérico. 
Límite: Máximo 3 párrafos cortos (3-4 líneas cada uno). NO escribas "Hola ${nombre}". Empieza directamente con el análisis o una frase impactante y motivadora acompañada de su nombre. Devuelve texto plano (puedes usar un poco de markdown como **negritas**).`;

    const requestBody = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.7
      }
    };

    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      const data = await resp.json();
      if (!resp.ok) return 'Tu perfil preliminar ha sido analizado, te recomendamos empezar a completar algunos retos para mejorar progresivamente tus hábitos.';

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text || 'Tus hábitos nos indican un perfil que puede mejorar con las misiones sugeridas en ARQ-Metabólica.';
    } catch (e) {
      return 'Tus hábitos nos indican un perfil que puede mejorar con las misiones sugeridas en ARQ-Metabólica.';
    }
  }
}
