'use strict';

const js = require('@eslint/js');
const { defineConfig, globalIgnores } = require('eslint/config');
const globals = require('globals');

module.exports = defineConfig([
  globalIgnores([
    '.homeybuild/**',
    'node_modules/**',
  ]),
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'commonjs',
    },
    rules: {
      'arrow-body-style': 'off',
      'class-methods-use-this': 'off',
      'no-await-in-loop': 'off',
      'no-bitwise': 'off',
      'no-continue': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-param-reassign': 'off',
      'no-plusplus': 'off',
      'no-underscore-dangle': 'off',
      'no-unused-vars': ['error', {
        args: 'none',
        ignoreRestSiblings: true,
        vars: 'all',
      }],
      'prefer-destructuring': ['error', {
        AssignmentExpression: { array: false, object: false },
        VariableDeclarator: { array: false, object: true },
      }, { enforceForRenamedProperties: false }],
      strict: ['error', 'global'],
    },
  },
]);
