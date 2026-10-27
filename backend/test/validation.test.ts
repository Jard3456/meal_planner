import test from 'node:test';
import assert from 'node:assert/strict';
import * as v from '../src/validation.js';

test('Normaliza correo y rechaza un formulario o correo invalido', () => {
  assert.equal(v.email('  PERSONA@Example.test '), 'persona@example.test');
  assert.throws(() => v.email('persona@'));
  assert.throws(() => v.bodyObject([]));
  assert.throws(() => v.bodyObject(null));
});

test('No trunca contrasenas Unicode ni admite cantidades no numericas', () => {
  assert.throws(() => v.password('é'.repeat(37)));
  assert.equal(v.password(' contraseña válida '), ' contraseña válida ');
  assert.throws(() => v.optionalNumber('70', 'Peso', 9999.99));
  assert.throws(() => v.optionalNumber(Number.NaN, 'Peso', 9999.99));
  assert.throws(() => v.optionalNumber(-1, 'Peso', 9999.99));
  assert.equal(v.optionalNumber(null, 'Peso', 9999.99), null);
});
