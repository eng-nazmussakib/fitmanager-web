import { parseFigure } from './count-up.directive';

describe('parseFigure', () => {
    it('splits a figure into prefix, number and suffix', () => {
        expect(parseFigure('1,200+')).toEqual({ prefix: '', target: 1200, suffix: '+', grouped: true });
        expect(parseFigure('+800')).toEqual({ prefix: '+', target: 800, suffix: '', grouped: false });
        expect(parseFigure('96%')).toEqual({ prefix: '', target: 96, suffix: '%', grouped: false });
    });

    it('returns null when there is no number', () => {
        expect(parseFigure('Many')).toBeNull();
    });
});
