import { environment } from '@env/environment';

/**
 * Features of the phase 0.5 demo that the API does not have yet (D-070 c): class booking, routines, measurements
 * and trainer pages. They stay in the demo (the mock answers them) and are hidden where the real API is used.
 */
export const LATER_FEATURES = environment.useMockApi;
