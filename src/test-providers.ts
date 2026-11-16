/**
 * Providers added to EVERY spec by the unit-test builder (angular.json `test.options.providersFile`).
 *
 * Only real app configuration belongs here, never browser fakes (matchMedia, ResizeObserver…): those stay in
 * the spec that needs them, so the assumption is visible where it is made. The UI kit needs no providers (no
 * component library, D-007), and zoneless change detection is the default since Angular 21.
 */
export default [];
