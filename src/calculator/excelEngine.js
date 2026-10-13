const TOKEN_PATTERN = /\s*(?:([A-Z]{1,3}\$?\d+|\$[A-Z]{1,3}\$?\d+)|("(?:[^"]|"")*")|(\d+(?:\.\d*)?|\.\d+)|([A-Z_][A-Z0-9_]*)|(>=|<=|<>|[=><+\-*/(),]))/iy;
const parsedFormulas = new Map();

function tokenize(formula) {
  const source = formula.startsWith('=') ? formula.slice(1) : formula;
  const tokens = [];
  let offset = 0;
  while (offset < source.length) {
    TOKEN_PATTERN.lastIndex = offset;
    const match = TOKEN_PATTERN.exec(source);
    if (!match) {
      if (/^\s*$/.test(source.slice(offset))) break;
      throw new Error(`Unsupported Excel syntax at ${source.slice(offset, offset + 24)}`);
    }
    offset = TOKEN_PATTERN.lastIndex;
    if (match[1]) tokens.push({ type: 'cell', value: match[1].replaceAll('$', '').toUpperCase() });
    else if (match[2]) tokens.push({ type: 'string', value: match[2].slice(1, -1).replaceAll('""', '"') });
    else if (match[3]) tokens.push({ type: 'number', value: Number(match[3]) });
    else if (match[4]) tokens.push({ type: 'name', value: match[4].toUpperCase() });
    else tokens.push({ type: 'op', value: match[5] });
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

class FormulaParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  peek() { return this.tokens[this.index]; }
  take() { return this.tokens[this.index++]; }
  accept(value) {
    if (this.peek().type === 'op' && this.peek().value === value) { this.take(); return true; }
    return false;
  }
  expect(value) {
    if (!this.accept(value)) throw new Error(`Expected '${value}', got '${this.peek().value}'`);
  }

  parse() {
    const expression = this.parseComparison();
    if (this.peek().type !== 'eof') throw new Error(`Unexpected token '${this.peek().value}'`);
    return expression;
  }

  parseComparison() {
    let left = this.parseAdditive();
    while (this.peek().type === 'op' && ['=', '<>', '>', '<', '>=', '<='].includes(this.peek().value)) {
      const operator = this.take().value;
      left = { type: 'binary', operator, left, right: this.parseAdditive() };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const operator = this.take().value;
      left = { type: 'binary', operator, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const operator = this.take().value;
      left = { type: 'binary', operator, left, right: this.parseUnary() };
    }
    return left;
  }

  parseUnary() {
    if (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const operator = this.take().value;
      return { type: 'unary', operator, value: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.take();
    if (token.type === 'number' || token.type === 'string') return { type: 'literal', value: token.value };
    if (token.type === 'cell') return { type: 'cell', address: token.value };
    if (token.type === 'op' && token.value === '(') {
      const expression = this.parseComparison();
      this.expect(')');
      return expression;
    }
    if (token.type === 'name') {
      if (!this.accept('(')) throw new Error(`Unknown name '${token.value}'`);
      const args = [];
      if (!this.accept(')')) {
        do { args.push(this.parseComparison()); } while (this.accept(','));
        this.expect(')');
      }
      return { type: 'call', name: token.value, args };
    }
    throw new Error(`Unexpected token '${token.value}'`);
  }
}

function parseFormula(formula) {
  if (!parsedFormulas.has(formula)) parsedFormulas.set(formula, new FormulaParser(tokenize(formula)).parse());
  return parsedFormulas.get(formula);
}

function numberValue(value) {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : '#VALUE!';
}

function truthy(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value === null || value === undefined || value === '') return false;
  return true;
}

function compareValues(left, right, operator) {
  let a = left;
  let b = right;
  if (typeof a === 'string' && typeof b === 'string') {
    a = a.toLocaleLowerCase();
    b = b.toLocaleLowerCase();
  }
  switch (operator) {
    case '=': return a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-12);
    case '<>': return !(a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-12));
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    default: throw new Error(`Unsupported comparison ${operator}`);
  }
}

function roundExcel(value, digits, mode) {
  const number = numberValue(value);
  const places = Math.trunc(numberValue(digits));
  if (typeof number !== 'number') return number;
  const factor = 10 ** places;
  const magnitude = Math.abs(number) * factor;
  if (!Number.isFinite(magnitude) || !Number.isFinite(factor) || factor === 0) return number;
  let rounded;
  if (mode === 'up') rounded = Math.ceil(magnitude - Number.EPSILON * Math.max(1, magnitude) * 8);
  else if (mode === 'down') rounded = Math.trunc(magnitude);
  else rounded = Math.floor(magnitude + 0.5 + Number.EPSILON * Math.max(1, magnitude) * 8);
  return Math.sign(number || 1) * rounded / factor;
}

function evaluateNode(node, getCell) {
  switch (node.type) {
    case 'literal': return node.value;
    case 'cell': return getCell(node.address);
    case 'unary': {
      const value = numberValue(evaluateNode(node.value, getCell));
      if (typeof value !== 'number') return value;
      return node.operator === '-' ? -value : value;
    }
    case 'binary': {
      const left = evaluateNode(node.left, getCell);
      const right = evaluateNode(node.right, getCell);
      if (['=', '<>', '>', '<', '>=', '<='].includes(node.operator)) return compareValues(left, right, node.operator);
      const a = numberValue(left);
      const b = numberValue(right);
      if (typeof a !== 'number') return a;
      if (typeof b !== 'number') return b;
      if (node.operator === '+') return a + b;
      if (node.operator === '-') return a - b;
      if (node.operator === '*') return a * b;
      if (node.operator === '/') return b === 0 ? '#DIV/0!' : a / b;
      break;
    }
    case 'call': {
      // Excel IF evaluates only its selected branch; keep that behavior for invalid/unused branches.
      if (node.name === 'IF') {
        if (node.args.length < 2 || node.args.length > 3) throw new Error('IF requires 2 or 3 arguments');
        const condition = evaluateNode(node.args[0], getCell);
        return truthy(condition)
          ? evaluateNode(node.args[1], getCell)
          : (node.args[2] ? evaluateNode(node.args[2], getCell) : false);
      }
      if (node.name === 'AND') return node.args.every((arg) => truthy(evaluateNode(arg, getCell)));
      if (node.name === 'OR') return node.args.some((arg) => truthy(evaluateNode(arg, getCell)));
      const args = node.args.map((arg) => evaluateNode(arg, getCell));
      if (node.name === 'ROUND') return roundExcel(args[0], args[1], 'nearest');
      if (node.name === 'ROUNDUP') return roundExcel(args[0], args[1], 'up');
      if (node.name === 'ROUNDDOWN') return roundExcel(args[0], args[1], 'down');
      if (node.name === 'INT') {
        const n = numberValue(args[0]);
        return typeof n === 'number' ? Math.floor(n) : n;
      }
      throw new Error(`Unsupported Excel function ${node.name}`);
    }
    default: throw new Error(`Unknown formula node ${node.type}`);
  }
  return '#VALUE!';
}

/** Evaluate the actual formula strings extracted from the provided Excel workbook. */
export function calculateWorkbook(workbook, overrides = {}) {
  const memo = new Map();
  const active = new Set();
  const normalizedOverrides = Object.fromEntries(
    Object.entries(overrides).map(([address, value]) => [address.toUpperCase(), value === '' || value == null ? 0 : value]),
  );

  const getCell = (rawAddress) => {
    const address = rawAddress.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(normalizedOverrides, address)) return normalizedOverrides[address];
    if (memo.has(address)) return memo.get(address);
    const cell = workbook.cells[address];
    if (!cell) return 0; // Excel treats an empty cell as zero in arithmetic formulas.
    if (!cell.formula) return cell.value;
    if (active.has(address)) throw new Error(`Circular Excel reference at ${address}`);
    active.add(address);
    const value = evaluateNode(parseFormula(cell.formula), getCell);
    active.delete(address);
    memo.set(address, value);
    return value;
  };

  const values = {};
  for (const [address, cell] of Object.entries(workbook.cells)) {
    if (cell.formula) values[address] = getCell(address);
  }
  return values;
}

export function getWorkbookCellValue(workbook, address, calculated, overrides = {}) {
  const key = address.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key] === '' ? 0 : overrides[key];
  const cell = workbook.cells[key];
  return cell?.formula ? calculated[key] : (cell?.value ?? 0);
}
