import { lanes } from './class-lanes';

const at = (oid: string, from: string, to: string): { oid: string; starts_at: string; ends_at: string } => ({
    oid,
    starts_at: `2026-11-16T${from}:00+06:00`,
    ends_at: `2026-11-16T${to}:00+06:00`
});

describe('lanes', () => {
    it('gives a class alone the whole column', () => {
        expect(lanes([at('a', '07:00', '08:00'), at('b', '08:00', '09:00')])).toEqual(
            new Map([
                ['a', { lane: 0, of: 1 }],
                ['b', { lane: 0, of: 1 }]
            ])
        );
    });

    it('puts overlapping classes side by side (Strength 7:30–8:20, Boxing 8:00–8:50)', () => {
        const l = lanes([at('boxing', '20:00', '20:50'), at('strength', '19:30', '20:20')]);
        expect(l.get('strength')).toEqual({ lane: 0, of: 2 });
        expect(l.get('boxing')).toEqual({ lane: 1, of: 2 });
    });

    it('reuses a lane once it is free, within one cluster', () => {
        const l = lanes([at('a', '07:00', '09:00'), at('b', '07:30', '08:00'), at('c', '08:00', '08:30')]);
        expect(l.get('a')).toEqual({ lane: 0, of: 2 });
        expect(l.get('b')).toEqual({ lane: 1, of: 2 });
        expect(l.get('c')).toEqual({ lane: 1, of: 2 });
    });
});
