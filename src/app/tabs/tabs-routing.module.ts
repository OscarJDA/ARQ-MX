import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'home',
        loadChildren: () => import('../perfil/perfil.module').then(m => m.PerfilPageModule)
      },
      {
        path: 'map',
        loadChildren: () => import('../mapa/mapa.module').then(m => m.MapaPageModule)
      },
      {
        path: 'challenges',
        loadChildren: () => import('../retos/retos.module').then(m => m.RetosPageModule)
      },
      {
        path: 'recommendations',
        loadChildren: () => import('../recomendaciones/recomendaciones.module').then(m => m.RecomendacionesPageModule)
      },
      {
        path: 'progress',
        loadChildren: () => import('../educacion/educacion.module').then(m => m.EducacionPageModule)
      },
      {
        path: 'calculadora',
        loadChildren: () => import('../calculadora/calculadora.module').then(m => m.CalculadoraPageModule)
      },
      {
        path: '',
        redirectTo: '/tabs/home',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '',
    redirectTo: '/tabs/home',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TabsPageRoutingModule {}
