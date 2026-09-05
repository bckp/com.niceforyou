'use strict';

const js = require('@eslint/js');
const { defineConfig, globalIgnores } = require('eslint/config');
const globals = require('globals');
const tseslint = require('typescript-eslint');

const sharedRules = {
  'arrow-body-style': 'off',
  'class-methods-use-this': 'off',
  'no-await-in-loop': 'off',
  'no-bitwise': 'off',
  'no-continue': 'off',
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-param-reassign': 'off',
  'no-plusplus': 'off',
  'no-underscore-dangle': 'off',
  'prefer-destructuring': ['error', {
    AssignmentExpression: { array: false, object: false },
    VariableDeclarator: { array: false, object: true },
  }, { enforceForRenamedProperties: false }],
};

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
      ...sharedRules,
      'no-unused-vars': ['error', {
        args: 'none',
        ignoreRestSiblings: true,
        vars: 'all',
      }],
      strict: ['error', 'global'],
    },
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      ...sharedRules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': ['error', { allowAsImport: true }],
      '@typescript-eslint/no-unused-vars': ['error', {
        args: 'none',
        ignoreRestSiblings: true,
        vars: 'all',
      }],
    },
  },
]);
