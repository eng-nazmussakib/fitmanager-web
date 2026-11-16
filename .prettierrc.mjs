/**
 * Same philosophy as OMS/SIB/SPN: nobody formats by hand — Prettier runs on commit (lint-staged)
 * and on save (.vscode/settings.json).
 * Changes vs. the old projects:
 *  - printWidth 160 instead of 500 so diffs stay reviewable.
 *  - prettier-plugin-tailwindcss sorts utility classes (was installed but never wired in the old projects).
 *  - tailwind plugin must be LAST in the plugin list.
 * @type {import('prettier').Config}
 */
export default {
    singleQuote: true,
    useTabs: false,
    tabWidth: 4,
    printWidth: 160,
    semi: true,
    arrowParens: 'avoid',
    bracketSpacing: true,
    trailingComma: 'none',
    endOfLine: 'lf',
    htmlWhitespaceSensitivity: 'ignore',
    plugins: ['prettier-plugin-organize-attributes', 'prettier-plugin-tailwindcss'],
    tailwindStylesheet: './src/styles.css',
    attributeGroups: [
        '$ANGULAR_STRUCTURAL_DIRECTIVE',
        '$ANGULAR_ELEMENT_REF',
        '$ID',
        '$CLASS',
        '$TYPE',
        '$FOR',
        '$NAME',
        '$DEFAULT',
        '$ANGULAR_ANIMATION',
        '$ANGULAR_ANIMATION_INPUT',
        '$ANGULAR_INPUT',
        '$ANGULAR_TWO_WAY_BINDING',
        '$ANGULAR_OUTPUT'
    ],
    attributeSort: 'ASC',
    overrides: [{ files: '*.html', options: { parser: 'angular' } }]
};
