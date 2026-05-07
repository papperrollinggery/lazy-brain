export type HttpRouteMethod = 'GET' | 'POST';
export type HttpRouteSurface = 'api' | 'ui' | 'lab' | 'legacy' | 'report';

export interface HttpRouteDefinition {
  method: HttpRouteMethod;
  path: string;
  handler: string;
  surface: HttpRouteSurface;
  description: string;
  public: boolean;
}

interface RouteRegistry {
  get(path: string, handler: string, description: string, surface?: HttpRouteSurface): void;
  post(path: string, handler: string, description: string, surface?: HttpRouteSurface): void;
}

export function defineHttpRoutes(register: (router: RouteRegistry) => void): readonly HttpRouteDefinition[] {
  const routes: HttpRouteDefinition[] = [];
  const addHttpRoute = (
    method: HttpRouteMethod,
    path: string,
    handler: string,
    description: string,
    surface: HttpRouteSurface = path.startsWith('/api/') ? 'api' : 'legacy',
  ): void => {
    routes.push({ method, path, handler, surface, description, public: true });
  };

  register({
    get: (path, handler, description, surface) => addHttpRoute('GET', path, handler, description, surface),
    post: (path, handler, description, surface) => addHttpRoute('POST', path, handler, description, surface),
  });

  return Object.freeze(routes);
}

export function cloneHttpRoutes(routes: readonly HttpRouteDefinition[]): HttpRouteDefinition[] {
  return routes.map(route => ({ ...route }));
}
