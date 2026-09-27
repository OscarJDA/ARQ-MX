import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PerfilAmbientalPageRoutingModule } from './perfil-ambiental-routing.module';

import { PerfilAmbientalPage } from './perfil-ambiental.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PerfilAmbientalPageRoutingModule
  ],
  declarations: [PerfilAmbientalPage]
})
export class PerfilAmbientalPageModule {}
