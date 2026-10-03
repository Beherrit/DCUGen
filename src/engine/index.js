// The default rules instance built from the bundled data.
import { RAW } from '../generated/rulesdata.js';
import { indexRules } from './rules.js';
export const RULES = indexRules(RAW);
