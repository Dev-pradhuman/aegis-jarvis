export class ToolValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ToolValidationError';
    this.code = 'TOOL_INPUT_INVALID';
    this.details = details;
  }
}

function validate(value, schema, location, errors) {
  if (!schema || typeof schema !== 'object') { errors.push(`${location}: invalid schema`); return; }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${location}: expected one of ${schema.enum.join(', ')}`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${location}: expected object`); return; }
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${location}.${key}: required`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) validate(item, schema.properties[key], `${location}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${location}.${key}: unexpected property`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) { errors.push(`${location}: expected array`); return; }
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${location}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${location}: too many items`);
    value.forEach((item, index) => validate(item, schema.items || {}, `${location}[${index}]`, errors));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') { errors.push(`${location}: expected string`); return; }
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${location}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${location}: too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${location}: invalid format`);
  } else if (schema.type === 'integer' || schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) { errors.push(`${location}: expected ${schema.type}`); return; }
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${location}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${location}: above maximum`);
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') errors.push(`${location}: expected boolean`);
}

export function validateToolInput(schema, input) {
  const errors = [];
  validate(input, schema, 'input', errors);
  if (errors.length) throw new ToolValidationError('Tool input failed schema validation', errors);
  return input;
}

export function validateToolOutput(schema, output) {
  if (!schema) return output;
  const errors = [];
  validate(output, schema, 'output', errors);
  if (errors.length) { const error = new Error('Tool output failed schema validation'); error.code = 'TOOL_OUTPUT_INVALID'; error.details = errors; throw error; }
  return output;
}
