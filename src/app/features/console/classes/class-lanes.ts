import type { ClassSession } from '@core/models/class.model';

export interface Lane {
    lane: number;
    of: number;
}

/**
 * Side-by-side lanes for one day's classes: two classes that overlap in time (different rooms) each get a lane,
 * and every class in a cluster of overlapping classes shares the cluster's lane count.
 */
export function lanes(sessions: Pick<ClassSession, 'oid' | 'starts_at' | 'ends_at'>[]): Map<string, Lane> {
    const out = new Map<string, Lane>();
    const sorted = [...sessions].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    let cluster: { oid: string; lane: number }[] = [];
    let laneEnds: number[] = [];
    let clusterEnd = -Infinity;
    const flush = (): void => {
        for (const c of cluster) out.set(c.oid, { lane: c.lane, of: laneEnds.length });
        cluster = [];
        laneEnds = [];
    };
    for (const s of sorted) {
        const start = Date.parse(s.starts_at);
        const end = Date.parse(s.ends_at);
        if (start >= clusterEnd) flush();
        let lane = laneEnds.findIndex(e => e <= start);
        if (lane < 0) lane = laneEnds.push(end) - 1;
        else laneEnds[lane] = end;
        cluster.push({ oid: s.oid, lane });
        clusterEnd = Math.max(start >= clusterEnd ? end : clusterEnd, end);
    }
    flush();
    return out;
}
