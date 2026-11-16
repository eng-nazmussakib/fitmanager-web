import { TestBed } from '@angular/core/testing';

import { StorageService } from './storage.service';

/**
 * Also a guard for the test environment: on Node 25+ a native `localStorage` global can shadow jsdom's and break
 * every spec that touches storage (IB pinned Node 24 because of it). These pass on Node 26 + Vitest 5.
 */
describe('StorageService', () => {
    let storage: StorageService;

    beforeEach(() => {
        localStorage.clear();
        storage = TestBed.inject(StorageService);
    });

    it('round-trips JSON values', () => {
        storage.set('k', { a: 1, b: ['x'] });
        expect(storage.get('k')).toEqual({ a: 1, b: ['x'] });
    });

    it('returns null for a missing key or a value that is not JSON', () => {
        localStorage.setItem('broken', '{not json');
        expect(storage.get('missing')).toBeNull();
        expect(storage.get('broken')).toBeNull();
    });

    it('removes a key', () => {
        storage.set('k', 1);
        storage.remove('k');
        expect(storage.get('k')).toBeNull();
    });
});
