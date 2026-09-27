import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { GeminiService } from '../services/gemini.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-first-run',
  templateUrl: './first-run.page.html',
  styleUrls: ['./first-run.page.scss'],
  standalone: false
})
export class FirstRunPage implements OnInit {

  showResults = false;
  resultadoInterpretacion = '';
  siCount = 0;
  userName = '';
  userPeso: number | null = null;
  userEstatura: number | null = null;
  aiAnalysis = '';
  isGeneratingAI = false;

  preguntas = [
    { text: '¿Sientes cansancio frecuente después de comer?', category: 'Síntomas físicos', value: false },
    { text: '¿Tienes antojos intensos de azúcar o carbohidratos?', category: 'Síntomas físicos', value: false },
    { text: '¿Te cuesta bajar de peso, especialmente en abdomen?', category: 'Síntomas físicos', value: false },
    { text: '¿Presentas grasa abdominal (tipo "panza")?', category: 'Síntomas físicos', value: false },
    { text: '¿Tienes piel oscura en cuello/axilas (acantosis)?', category: 'Síntomas físicos', value: false },
    { text: '¿Sientes hambre constante aunque hayas comido?', category: 'Síntomas físicos', value: false },

    { text: '¿Tienes triglicéridos altos?', category: 'Indicadores metabólicos', value: false },
    { text: '¿Tienes colesterol HDL bajo ("colesterol bueno")?', category: 'Indicadores metabólicos', value: false },
    { text: '¿Te han dicho que tienes glucosa ligeramente elevada?', category: 'Indicadores metabólicos', value: false },
    { text: '¿Tienes presión arterial elevada?', category: 'Indicadores metabólicos', value: false },

    { text: '¿Haces poco o nada de ejercicio?', category: 'Estilo de vida', value: false },
    { text: '¿Consumes bebidas azucaradas frecuentemente?', category: 'Estilo de vida', value: false },
    { text: '¿Duermes menos de 6–7 horas regularmente?', category: 'Estilo de vida', value: false },
    { text: '¿Tienes estrés constante?', category: 'Estilo de vida', value: false }
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private geminiService: GeminiService,
    private authService: AuthService
  ) { }

  get imc(): number {
    if (!this.userPeso || !this.userEstatura) return 0;
    const heightM = this.userEstatura / 100;
    return this.userPeso / (heightM * heightM);
  }

  get imcLabel(): string {
    const bmi = this.imc;
    if (bmi === 0) return '';
    if (bmi < 18.5) return 'Bajo peso';
    if (bmi < 25) return 'Peso normal';
    if (bmi < 30) return 'Sobrepeso';
    return 'Obesidad';
  }

  ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      if (params['viewResults']) {
        const stored = localStorage.getItem('health_baseline');
        if (stored) {
          try {
            const data = JSON.parse(stored);
            this.userName = data.name;
            this.userPeso = data.peso || null;
            this.userEstatura = data.estatura || null;
            this.siCount = data.score;
            this.resultadoInterpretacion = data.interpretation;
            if (data.answers) {
              this.preguntas = data.answers;
            }
            this.showResults = true;
            
            if (data.aiAnalysis) {
              this.aiAnalysis = data.aiAnalysis;
            } else {
              this.isGeneratingAI = true;
              const rawAnalysis = await this.geminiService.generarAnalisisPersonalizado(this.userName, this.preguntas, this.resultadoInterpretacion);
              this.aiAnalysis = rawAnalysis.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
              this.isGeneratingAI = false;
              
              // Guardar el analisis generado en localStorage
              const updatedData = { ...data, aiAnalysis: this.aiAnalysis };
              localStorage.setItem('health_baseline', JSON.stringify(updatedData));
              this.authService.saveCurrentUserData();
            }
          } catch(e) {}
        }
      }
    });
  }

  goBack() {
    // Navigate back or stay (first-run has no real "back")
    window.history.back();
  }

  getCategories(): string[] {
    const categories = new Set(this.preguntas.map(q => q.category));
    return Array.from(categories);
  }

  getQuestionsByCategory(category: string) {
    return this.preguntas.filter(q => q.category === category);
  }

  getProgress(): number {
    const siCount = this.preguntas.filter(p => p.value).length;
    return Math.round((siCount / this.preguntas.length) * 100);
  }

  /** Extract first name from full input */
  private getFirstName(): string {
    return this.userName.trim().split(/\s+/)[0] || 'Usuario';
  }

  async finalizar() {
    if (!this.userName.trim()) return;

    this.siCount = this.preguntas.filter(p => p.value).length;

    if (this.siCount <= 3) {
      this.resultadoInterpretacion = 'Bajo riesgo';
    } else if (this.siCount <= 7) {
      this.resultadoInterpretacion = 'Riesgo moderado';
    } else {
      this.resultadoInterpretacion = 'Alto riesgo (recomienda exámenes médicos)';
    }

    const healthBaseline = {
      name: this.userName.trim(),
      firstName: this.getFirstName(),
      peso: this.userPeso,
      estatura: this.userEstatura,
      imc: this.imc,
      answers: this.preguntas,
      score: this.siCount,
      interpretation: this.resultadoInterpretacion,
      timestamp: new Date().toISOString()
    };

    localStorage.setItem('health_baseline', JSON.stringify(healthBaseline));

    // Mostramos la vista de resultados antes de ir al home
    this.showResults = true;

    // Generar análisis AI personalizado
    this.isGeneratingAI = true;
    const rawAnalysis = await this.geminiService.generarAnalisisPersonalizado(this.userName, this.preguntas, this.resultadoInterpretacion);
    // Parse básico de markdown **negritas** a <strong>
    this.aiAnalysis = rawAnalysis.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    this.isGeneratingAI = false;

    // Actualizar localStorage con el análisis IA
    const updatedData = { ...healthBaseline, aiAnalysis: this.aiAnalysis };
    localStorage.setItem('health_baseline', JSON.stringify(updatedData));
    this.authService.saveCurrentUserData();
  }

  continuar() {
    this.router.navigate(['/'], { replaceUrl: true });
  }

  rehacerCuestionario() {
    this.showResults = false;
    this.siCount = 0;
    // Don't clear name, weight and height so they don't have to retype it
    this.preguntas.forEach(q => q.value = false);
    // Remove viewResults query param
    this.router.navigate(['/first-run'], { replaceUrl: true });
  }
}
