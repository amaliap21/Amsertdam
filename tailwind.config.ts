/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                "indigo-primary": "#3D42E5",
                "blue-primary": "#587ECE",
                "teal-primary": "#6EAFBB",
                "green-primary": "#84E0A3",
            }
        },
    },
    plugins: [],
};
