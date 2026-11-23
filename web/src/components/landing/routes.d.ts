export const SITE_NAME: string;
export const LANDING_ROUTES: Record<'home' | 'job-seekers' | 'recruiters' | 'public-cv-link', { path: string; title: string; description: string }>;
export function routeFromPath(pathname: string): string | null;
export function isLandingPath(pathname: string): boolean;
export function pathForRoute(id: string): string;
export function applyRouteMeta(id: string): void;
