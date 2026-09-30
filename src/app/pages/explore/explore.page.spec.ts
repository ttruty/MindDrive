import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { ExplorePage } from './explore.page';

describe('ExplorePage', () => {
  let component: ExplorePage;
  let fixture: ComponentFixture<ExplorePage>;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([])] });
    fixture = TestBed.createComponent(ExplorePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('asks to connect when no library is set up', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Connect your library');
  });
});
