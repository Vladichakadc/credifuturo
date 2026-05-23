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
                    primary: '#166534', // Green-800 - Main Corporate
                    dark: '#052e16',    // Green-950 - Deep Backgrounds
                    light: '#84cc16',   // Lime-500 - Accents
                    gold: '#fbbf24',    // Amber-400 - Corporate Secondary
                    blue: '#1e40af',    // Blue-800 - Trust/Info
                },
                ui: {
                    background: '#f3f4f6', // Gray-100
                    surface: '#ffffff',    // White
                    border: '#e5e7eb',     // Gray-200
                },
                state: {
                    success: '#22c55e', // Green-500
                    warning: '#f59e0b', // Amber-500
                    error: '#ef4444',   // Red-500
                    info: '#3b82f6',    // Blue-500
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            boxShadow: {
                'card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
                'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -1px rgb(0 0 0 / 0.06)',
            }
        },
    },
    plugins: [],
}
