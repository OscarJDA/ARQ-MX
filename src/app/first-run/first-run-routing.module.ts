import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { FirstRunPage } from './first-run.page';

const routes: Routes = [
  {
    path: '',
    component: FirstRunPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FirstRunPageRoutingModule {}
