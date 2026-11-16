// @ts-check
/**
 * ESLint flat config.
 *
 * Every rule from the OMS "Coding Guidelines" README that a machine can check is encoded here.
 * The husky pre-commit hook runs this, so a commit that breaks a rule is rejected (same as OMS/SIB/SPN).
 *
 * Formatting is handled by Prettier, not ESLint (eslint-config-prettier switches off conflicting rules).
 * The old projects ran Prettier *through* ESLint (`prettier/prettier` rule). That is slower and
 * prints formatting noise as lint errors.
 */
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

/*
 * ESLint 10. `defineConfig()` from ESLint core replaces the deprecated `tseslint.config()` helper.
 * eslint-plugin-import does not support ESLint 10, so imports are sorted by eslint-plugin-simple-import-sort
 * (the IB portals' choice: faster, auto-fixable, no resolver setup).
 */
export default defineConfig(
    { ignores: ['dist/**', '.angular/**', 'coverage/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'scripts/**', '*.mjs', 'playwright.config.ts'] },
    {
        files: ['**/*.ts'],
        // *TypeChecked presets (IB portals): they use type information, so they also catch floating promises,
        // unsafe `any` flows and methods passed without their `this`.
        extends: [eslint.configs.recommended, tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked, angular.configs.tsRecommended, prettier],
        processor: angular.processInlineTemplates,
        // Type-aware linting: needed for no-deprecated (and catches more bugs in general).
        languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
        plugins: { 'unused-imports': unusedImports, 'simple-import-sort': simpleImportSort },
        rules: {
            // `fm` for the design system (src/app/shared/ui), `app` for everything else.
            '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: ['app', 'fm'], style: 'camelCase' }],
            '@angular-eslint/component-selector': ['error', { type: 'element', prefix: ['app', 'fm'], style: 'kebab-case' }],
            // No UI component libraries and no CDK (D-007): build it in src/app/shared/ui instead.
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        { group: ['ng-zorro-antd', 'ng-zorro-antd/*'], message: 'No UI component libraries (D-007): use the fm-* kit in @shared/ui.' },
                        { group: ['@ant-design/*'], message: 'No UI component libraries (D-007): use the fm-* kit in @shared/ui.' },
                        { group: ['@angular/cdk', '@angular/cdk/*'], message: 'No @angular/cdk (D-007): use the utilities in @shared/ui.' }
                    ]
                }
            ],
            '@angular-eslint/prefer-on-push-component-change-detection': 'error',
            '@angular-eslint/prefer-signals': 'warn',
            '@angular-eslint/no-empty-lifecycle-method': 'error',

            // Guideline 2.4: every function/method declares its return type.
            '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true, allowTypedFunctionExpressions: true, allowHigherOrderFunctions: true }],

            // Guideline 2.5: never write `public`, it is the default.
            '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],

            // Guidelines 2.2, 2.3, 2.6: camelCase, UPPER_CASE constants, private members start with `_`.
            '@typescript-eslint/naming-convention': [
                'error',
                { selector: 'default', format: ['camelCase'], leadingUnderscore: 'forbid' },
                { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
                { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
                { selector: 'memberLike', modifiers: ['private'], format: ['camelCase'], leadingUnderscore: 'require' },
                { selector: 'classProperty', modifiers: ['static', 'readonly'], format: ['UPPER_CASE', 'camelCase'] },
                { selector: 'enumMember', format: ['UPPER_CASE', 'PascalCase'] },
                { selector: 'typeLike', format: ['PascalCase'] },
                { selector: 'import', format: ['camelCase', 'PascalCase'] },
                // JSON payload keys (snake_case API fields, HTTP headers, UPPER_CASE constant maps) are not ours to rename.
                { selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'], format: null }
            ],

            // Guideline 2.9, updated for signals: fields → constructor → accessors → public → protected → private methods.
            // Signal input()/output() are plain fields now (not @Input decorators), so the old
            // "public fields, private fields, then decorated inputs" split no longer applies. The convention is:
            //   1. private injected deps (`private readonly _http = inject(HttpClient)`)
            //   2. state signals   3. input()/output()/viewChild()   4. computed()s
            '@typescript-eslint/member-ordering': [
                'error',
                {
                    default: [
                        'signature',
                        'static-field',
                        'instance-field',
                        'constructor',
                        ['get', 'set'],
                        'public-instance-method',
                        'protected-instance-method',
                        'private-instance-method'
                    ]
                }
            ],

            // `any` was everywhere in the old projects. Warn so new code is typed and old patterns still compile.
            '@typescript-eslint/no-explicit-any': 'warn',

            // Strip unused imports automatically on commit.
            '@typescript-eslint/no-unused-vars': 'off',
            'unused-imports/no-unused-imports': 'error',
            'unused-imports/no-unused-vars': ['warn', { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' }],

            // Import blocks: side effects → packages (@angular sorts first alphabetically) → @aliases → relative.
            'simple-import-sort/imports': [
                'error',
                { groups: [['^\\u0000'], ['^@angular/', '^@?\\w'], ['^@(core|shared|layout|features|config|env|mock)/'], ['^\\.']] }
            ],
            'simple-import-sort/exports': 'error',

            // Flags any API marked @deprecated in the installed Angular / ng-zorro / RxJS versions.
            // This is how outdated patterns copied from older projects get caught.
            '@typescript-eslint/no-deprecated': 'error',
            // Angular's Validators.required etc. are static and safe to pass unbound.
            '@typescript-eslint/unbound-method': ['error', { ignoreStatic: true }],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            eqeqeq: ['error', 'smart']
        }
    },
    {
        files: ['**/*.html'],
        extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
        rules: {
            '@angular-eslint/template/prefer-control-flow': 'error',
            '@angular-eslint/template/prefer-self-closing-tags': 'error'
        }
    },
    {
        // Specs may use `any` and skip return types.
        files: ['**/*.spec.ts', 'e2e/**/*.ts'],
        rules: {
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off'
        }
    }
);
