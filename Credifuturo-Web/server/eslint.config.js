// Configuración de ESLint 9 (formato "flat").
//
// Sustituye a .eslintrc.json: desde ESLint 9 ese formato ya no se lee, y el
// script `lint` fallaba con "couldn't find an eslint.config.(js|mjs|cjs)" —
// bloqueando el workflow de seguridad en cada PR.
//
// El servidor es CommonJS (require/module.exports), de ahí sourceType
// 'commonjs'; el .eslintrc.json anterior declaraba 'module', que no describe
// este código.

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: [
            'node_modules/**',
            'logs/**',
            // La raíz de server/ acumula ~166 scripts sueltos de migraciones y
            // arreglos de datos ya ejecutados (check_*, audit_*, fix_*, verify_*).
            // CLAUDE.md los documenta como ajenos a la aplicación viva, y su
            // deuda no debe bloquear un despliegue. Se ignoran en bloque y se
            // vuelve a incluir el punto de entrada, que sí es la aplicación.
            '*.js',
            '*.cjs',
            '!server.js',
            'scratch/**',
            'tests/**',
        ],
    },
    js.configs.recommended,
    {
        // Incluye .cjs/.mjs: sin ellos esos archivos se quedaban sin los globals
        // de Node y ESLint reportaba `'console' is not defined`.
        files: ['**/*.{js,cjs,mjs}'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            // La consola ES la estrategia de logging de este servidor: el request
            // logger y securityLogger escriben ahí a propósito, y en Railway es
            // lo que se lee. Avisar de cada llamada convertiría el lint en ruido.
            'no-console': 'off',

            // Ejecución dinámica de código: esto sí bloquea.
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',

            'no-var': 'error',

            // Aviso, no error: hay deuda previa de variables sin usar repartida
            // por el código. El objetivo de esta puerta es frenar errores reales
            // (no-undef, eval), no fallar un despliegue por una importación
            // huérfana. `next` se ignora porque Express exige la firma de cuatro
            // argumentos para reconocer un manejador de errores, aunque no se use.
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_|^next$',
                varsIgnorePattern: '^_',
                caughtErrors: 'none',
            }],
        },
    },
];
