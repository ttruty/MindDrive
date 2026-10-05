import { TestBed } from '@angular/core/testing';
import { CurrentCategoryService } from './current-category.service';

describe('CurrentCategoryService', () => {
  beforeEach(() => localStorage.clear());

  it('sets, remembers and clears the current category', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(CurrentCategoryService);
    expect(service.current()).toBeNull();

    service.set({ id: 'sleep', name: 'Sleep' });
    expect(service.isCurrent('sleep')).toBe(true);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(CurrentCategoryService);
    expect(reloaded.current()).toMatchObject({ id: 'sleep', name: 'Sleep' });

    reloaded.clear();
    expect(reloaded.current()).toBeNull();
    expect(localStorage.getItem('md.currentCategory')).toBeNull();
  });
});
