import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['node_modules/**', '**/.next/**', '.data/**', 'test-results/**', 'playwright-report/**', 'tmp/**', '**/next-env.d.ts'] },
  js.configs.recommended, ...ts.configs.recommended,
  { files:['**/*.cjs'],languageOptions:{sourceType:'commonjs',globals:{exports:'writable'}} },
  { languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', fetch: 'readonly', setTimeout: 'readonly' } }, rules: { 'no-empty': ['error', {allowEmptyCatch:true}], '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } }
);
