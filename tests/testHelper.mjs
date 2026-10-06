import { clearCatalogCache } from '../server/spendPolicy.js';
import { clearToolFilterCache } from '../server/toolFilter.js';

export function resetCaches() {
  clearCatalogCache();
  clearToolFilterCache();
}
