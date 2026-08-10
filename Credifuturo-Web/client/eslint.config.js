// Configuración de ESLint 9 (formato "flat").
//
// Sustituye a .eslintrc.cjs: desde ESLint 9 ese formato ya no se lee, y el
// script `lint` fallaba con "couldn't find an eslint.config.(js|mjs|cjs)" —
// bloqueando el workflow de seguridad en cada PR. El flag `--ext` del script
// tampoco existe ya: en formato plano el alcance se declara con `files`.

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
    { ignores: ['dist/**', 'node_modules/**'] },
    js.configs.recommended,
    {
        files: ['**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        settings: { react: { version: '18.2' } },
        plugins: {
            react,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...react.configs.recommended.rules,
            ...react.configs['jsx-runtime'].rules,

            // Las dos reglas clásicas de hooks, que es lo que declaraba el
            // .eslintrc.cjs anterior. NO se extiende
            // `reactHooks.configs.recommended`: en la v7 del plugin ese preset
            // incorpora además el conjunto del React Compiler
            // (set-state-in-effect, "Compilation Skipped", …), que marca cientos
            // de patrones en código ya escrito y probado. Adoptarlo es una
            // decisión de refactor propia, no algo que deba entrar de rebote al
            // reparar el pipeline.
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // Prosa en español con apóstrofos y comillas. Es cosmética y no
            // cambia lo que se renderiza, así que avisa en vez de bloquear.
            'react/no-unescaped-entities': 'warn',

            // Este código no usa PropTypes; el contrato de props se documenta en
            // comentarios junto a cada componente.
            'react/prop-types': 'off',

            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

            // Aviso, no error: hay deuda previa en las páginas antiguas que
            // siguen en pages/ (ver CLAUDE.md). La puerta existe para frenar
            // errores reales, no para fallar un despliegue por un import
            // huérfano en un archivo ya superado.
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none',
            }],
        },
    },
];
