// Playwright instalado en el sistema o en el proyecto.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');
