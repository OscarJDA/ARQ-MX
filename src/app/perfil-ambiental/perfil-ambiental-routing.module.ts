import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PerfilAmbientalPage } from './perfil-ambiental.page';

const routes: Routes = [
  {
    path: '',
    component: PerfilAmbientalPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PerfilAmbientalPageRoutingModule {}
