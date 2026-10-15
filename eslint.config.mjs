// Lint: npm run lint. Catches names used before they exist or never defined, imports that aren't exported,
// and locals that hide the module-wide state the app's pieces share (W, F).
import globals from 'globals';

const shared = {
  // The bundled browser libraries (src/vendor) and what storage-boot.js and the desktop app add to window.
  peerjs: 'readonly', qrcode: 'readonly', THREE: 'readonly',
};

export default [
  { ignores: ['src/generated/**', 'src/vendor/**', 'node_modules/**', 'desktop/node_modules/**', 'desktop/dist/**', 'DCUGen.html', 'public/**', 'test-results/**', 'playwright-report/**'] },
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...shared } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-use-before-define': ['error', { functions: false, classes: true, variables: false }],
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-cond-assign': ['error', 'except-parens'],
    },
  },
  {
    // W and F are the shared state of the World and Forge pieces: a local by that name would hide it.
    files: ['src/app/world*.js', 'src/app/forge*.js'],
    ignores: ['src/app/world-common.js', 'src/app/forge-common.js'],
    rules: { 'no-restricted-syntax': ['error', { selector: 'VariableDeclarator[id.name=/^[WF]$/], FunctionDeclaration > Identifier.params[name=/^[WF]$/], ArrowFunctionExpression > Identifier.params[name=/^[WF]$/]', message: 'W and F are the World and Forge shared state: use another name.' }] },
  },
  {
    files: ['src/app/storage-boot.js'],
    languageOptions: { sourceType: 'script' },
  },
  {
    files: ['tests/**/*.mjs', 'tools/**/*.mjs', '*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }] },
  },
  {
    files: ['desktop/**/*.cjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-undef': 'error' },
  },
  {
    files: ['desktop/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error' },
  },
];
