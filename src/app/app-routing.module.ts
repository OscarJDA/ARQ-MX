import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { FirstRunGuard } from './first-run.guard';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule),
    canActivate: [FirstRunGuard]
  },
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.module').then(m => m.AuthPageModule)
  },
  {
    path: 'first-run',
    loadChildren: () => import('./first-run/first-run.module').then( m => m.FirstRunPageModule)
  },
  {
    path: 'perfil-ambiental',
    loadChildren: () => import('./perfil-ambiental/perfil-ambiental.module').then( m => m.PerfilAmbientalPageModule)
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
