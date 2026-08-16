import type { NextConfig } from 'next';

const config: NextConfig = {
  // @gdc/core se publica como TypeScript sin compilar: es la misma fuente que ejecutan
  // el servidor y el simulador, y no queremos un artefacto intermedio que pueda diverger.
  transpilePackages: ['@gdc/core'],
  typedRoutes: true,
};

export default config;
