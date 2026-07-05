/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    primary: '#166534', // Green-800 — identidad corporativa principal
                    dark: '#052e16',    // Green-950 — fondos profundos y header del sidebar
                    light: '#84cc16',   // Lime-500 — acentos secundarios
                    gold: '#fbbf24',    // Amber-400 — acento dorado corporativo
                    blue: '#1e40af',    // Blue-800 — confianza / info
                },
                ui: {
                    background: '#f3f4f6',
                    surface: '#ffffff',
                    border: '#e5e7eb',
                },
                state: {
                    success: '#22c55e',
                    warning: '#f59e0b',
                    error: '#ef4444',
                    info: '#3b82f6',
                }
            },
            fontFamily: {
                sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
            },
            boxShadow: {
                'card': '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
                'card-hover': '0 8px 25px -8px rgb(22 101 52 / 0.15), 0 2px 8px -2px rgb(0 0 0 / 0.08)',
                'sidebar': '4px 0 24px -4px rgb(5 46 22 / 0.18)',
                'bottom-nav': '0 -2px 20px -2px rgb(0 0 0 / 0.08)',
                'mobile-header': '0 2px 12px -2px rgb(0 0 0 / 0.08)',
            },
            keyframes: {
                'slide-up': {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'scale-in': {
                    '0%': { transform: 'scale(0.96)', opacity: '0' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
            },
            animation: {
                'slide-up': 'slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                'fade-in': 'fade-in 0.2s ease-out',
                'scale-in': 'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            },
            borderRadius: {
                'xl': '0.75rem',
                '2xl': '1rem',
            }
        },
    },
    plugins: [],
}
