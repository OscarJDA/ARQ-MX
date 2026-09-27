import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EducacionPage } from './educacion.page';

describe('EducacionPage', () => {
  let component: EducacionPage;
  let fixture: ComponentFixture<EducacionPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(EducacionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
