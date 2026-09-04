const DEFAULT_STRING_LIMIT = 240;
const DEFAULT_ARRAY_LIMIT = 500;
const DEFAULT_ABSOLUTE_NUMBER_LIMIT = 1_000_000;

export class WebMCPInputError extends TypeError {
  constructor(issues) {
    const first = issues[0] || { path: '$', message: 'Invalid tool input.' };
    super(`${first.path}: ${first.message}`);
    this.name = 'WebMCPInputError';
    this.code = 'INVALID_TOOL_INPUT';
    this.issues = issues;
  }
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const typeMatches = (type, value) => {
  if (type === 'object') return isObject(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  return true;
};

function inspect(schema, value, path, issues) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.anyOf) {
    const matches = schema.anyOf.some(candidate => {
      const candidateIssues = [];
      inspect({ ...schema, anyOf: undefined, ...candidate }, value, path, candidateIssues);
      return candidateIssues.length === 0;
    });
    if (!matches) issues.push({ path, message: 'must match one of the allowed parameter combinations' });
    return;
  }
  if (schema.type && !typeMatches(schema.type, value)) {
    issues.push({ path, message: `must be ${schema.type}` });
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push({ path, message: `must be one of: ${schema.enum.join(', ')}` });
    return;
  }
  if (schema.type === 'object') {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) issues.push({ path: `${path}.${key}`, message: 'is required' });
    }
    const properties = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) issues.push({ path: `${path}.${key}`, message: 'is not an allowed parameter' });
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) inspect(childSchema, value[key], `${path}.${key}`, issues);
    }
  }
  if (schema.type === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) issues.push({ path, message: `must contain at least ${schema.minItems} item(s)` });
    if (schema.maxItems != null && value.length > schema.maxItems) issues.push({ path, message: `must contain at most ${schema.maxItems} item(s)` });
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) issues.push({ path, message: 'must not contain duplicate items' });
    value.forEach((item, index) => inspect(schema.items, item, `${path}[${index}]`, issues));
  }
  if (schema.type === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) issues.push({ path, message: `must contain at least ${schema.minLength} character(s)` });
    if (schema.maxLength != null && value.length > schema.maxLength) issues.push({ path, message: `must contain at most ${schema.maxLength} character(s)` });
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) issues.push({ path, message: 'has an invalid format' });
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (schema.minimum != null && value < schema.minimum) issues.push({ path, message: `must be at least ${schema.minimum}` });
    if (schema.maximum != null && value > schema.maximum) issues.push({ path, message: `must be at most ${schema.maximum}` });
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) issues.push({ path, message: `must be greater than ${schema.exclusiveMinimum}` });
    if (schema.exclusiveMaximum != null && value >= schema.exclusiveMaximum) issues.push({ path, message: `must be less than ${schema.exclusiveMaximum}` });
  }
}

export function validateWebMCPInput(schema, input) {
  const issues = [];
  inspect(schema, input, '$', issues);
  if (issues.length) throw new WebMCPInputError(issues.slice(0, 20));
  return input;
}

export function hardenWebMCPSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const hardened = { ...schema };
  if (hardened.type === 'object' && hardened.additionalProperties == null) hardened.additionalProperties = false;
  if (hardened.type === 'string') {
    if (hardened.maxLength == null) hardened.maxLength = DEFAULT_STRING_LIMIT;
  }
  if (hardened.type === 'array') {
    if (hardened.maxItems == null) hardened.maxItems = DEFAULT_ARRAY_LIMIT;
    if (hardened.items) hardened.items = hardenWebMCPSchema(hardened.items);
  }
  if (hardened.type === 'number' || hardened.type === 'integer') {
    if (hardened.minimum == null && hardened.exclusiveMinimum == null) hardened.minimum = -DEFAULT_ABSOLUTE_NUMBER_LIMIT;
    if (hardened.maximum == null && hardened.exclusiveMaximum == null) hardened.maximum = DEFAULT_ABSOLUTE_NUMBER_LIMIT;
  }
  if (hardened.properties) hardened.properties = Object.fromEntries(Object.entries(hardened.properties).map(([key, child]) => [key, hardenWebMCPSchema(child)]));
  if (hardened.anyOf) hardened.anyOf = hardened.anyOf.map(hardenWebMCPSchema);
  return hardened;
}

const READ_ONLY_NAMES = /(?:_get_|_list_|_validate_|_compare_|_export_|get_snapshot|get_move_list)/;

export function prepareWebMCPTool(tool) {
  const inputSchema = hardenWebMCPSchema(tool.inputSchema || { type: 'object', properties: {}, additionalProperties: false });
  const readOnlyHint = READ_ONLY_NAMES.test(tool.name);
  return {
    ...tool,
    inputSchema,
    annotations: {
      readOnlyHint,
      destructiveHint: false,
      idempotentHint: readOnlyHint,
      openWorldHint: false,
      ...tool.annotations
    }
  };
}
