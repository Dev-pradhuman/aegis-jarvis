import { ToolRuntimeError } from './toolErrors.js';

function types(schema) { return Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []; }
function actualType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  if (typeof value === 'number') return 'number';
  return typeof value;
}

function validate(value, schema = {}, path = '$') {
  const allowed = types(schema);
  const actual = actualType(value);
  if (allowed.length && !allowed.includes(actual) && !(actual === 'integer' && allowed.includes('number'))) return [`${path} must be ${allowed.join(' or ')}`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path} must be one of: ${schema.enum.join(', ')}`];
  const errors = [];
  if (actual === 'object') {
    const properties = schema.properties || {};
    for (const required of schema.required || []) if (value[required] === undefined) errors.push(`${path}.${required} is required`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) errors.push(`${path}.${key} is not allowed`);
    for (const [key, child] of Object.entries(properties)) if (value[key] !== undefined) errors.push(...validate(value[key], child, `${path}.${key}`));
  }
  if (actual === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} must contain at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} must contain at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, index) => errors.push(...validate(item, schema.items, `${path}[${index}]`)));
  }
  if (actual === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} is too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} is too long`);
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) errors.push(`${path} has an invalid format`);
  }
  if (actual === 'number' || actual === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be at most ${schema.maximum}`);
  }
  return errors;
}

export function validateToolArguments(schema, input) {
  const value = input === undefined ? {} : input;
  const errors = validate(value, schema || { type: 'object' });
  if (errors.length) throw new ToolRuntimeError('INVALID_ARGUMENTS', `Invalid tool arguments: ${errors.join('; ')}`, { details: { fields: errors.slice(0, 20) } });
  return structuredClone(value);
}
