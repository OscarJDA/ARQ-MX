import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RetosPage } from './retos.page';

describe('RetosPage', () => {
  let component: RetosPage;
  let fixture: ComponentFixture<RetosPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(RetosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
