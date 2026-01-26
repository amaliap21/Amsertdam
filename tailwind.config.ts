/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                "yellow-primary": "#fca311",
                "yellow-hover": "#ffd966",
            }
        },
    },
    plugins: [],
};
