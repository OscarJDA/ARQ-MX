import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PerfilAmbientalPage } from './perfil-ambiental.page';

describe('PerfilAmbientalPage', () => {
  let component: PerfilAmbientalPage;
  let fixture: ComponentFixture<PerfilAmbientalPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PerfilAmbientalPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
