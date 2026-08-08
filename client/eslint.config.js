import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Destructuring a field out of an object specifically to exclude
      // it via rest-spread (e.g. stripping confirmPassword before an
      // API call) is idiomatic and shouldn't be flagged as unused.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // eslint-plugin-react-hooks v7 flags the standard "fetch on
      // mount" pattern (an effect calling an async loader function
      // that sets a loading flag before its first await) as
      // set-state-in-effect, and flags every Context file that
      // exports both a Provider and its paired hook (the universal
      // React Context pattern) as only-export-components. Both are
      // extremely common, safe, and used throughout this codebase —
      // "fixing" them properly would mean restructuring dozens of
      // data-fetching components and splitting every context file in
      // two, for a dev-only Fast Refresh nicety with no production
      // behavior change. Disabled rather than mass-suppressed inline.
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
])
