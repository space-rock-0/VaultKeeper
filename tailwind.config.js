/** Brand tokens from branding-guidelines_ui.html. */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Poppins", "sans-serif"] },
      colors: { indigo: { 50: "#F5F3FF", 100: "#E8E5FF", 200: "#D4CCF7", 300: "#BBA9EE", 400: "#9B8EDE", 500: "#7044DB", 600: "#5929D0", 700: "#4C23B1", 800: "#3E1B96", 900: "#2F176B", 950: "#201044" } },
    },
  },
  plugins: [],
};
