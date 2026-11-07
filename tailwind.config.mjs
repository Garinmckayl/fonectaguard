// Design system: "proofreader". Warm paper, ink outlines, hard shadows, Fonecta-style orange, highlighter yellow.
const warm = { 50: "#FBF8F1", 100: "#F3EDDF", 200: "#E6DECA", 300: "#D3C9AE", 400: "#A59D88", 500: "#6B6455", 600: "#544D40", 700: "#3D372D", 800: "#27231C", 900: "#14110D" };
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF5E9", ink: "#14110D", panel: "#FFFDF8", line: "#E3D9C0",
        brand: { DEFAULT: "#FF5B1F", deep: "#D9430C", soft: "#FFE9DC" },
        hi: "#FFE14D", accent: "#0B7D52",
        slate: warm,
        // The old indigo/violet/fuchsia utilities now render in the brand orange ramp.
        indigo: { 50: "#FFF1E8", 100: "#FFE3D1", 200: "#FFC7A3", 500: "#FF7A3D", 600: "#FF5B1F", 700: "#D9430C", 800: "#A93308" },
        violet: { 500: "#F2490F", 600: "#E2410A" }, fuchsia: { 600: "#C2410C" },
      },
      fontFamily: { display: ["var(--font-display)", "ui-sans-serif", "system-ui"], sans: ["var(--font-body)", "ui-sans-serif", "system-ui"], mono: ["var(--font-mono)", "ui-monospace", "monospace"] },
      boxShadow: { soft: "0 2px 0 0 #14110D", pop: "5px 5px 0 0 #14110D", "pop-sm": "3px 3px 0 0 #14110D" },
      keyframes: { marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } }, scan: { "0%": { transform: "translateY(-10%)" }, "100%": { transform: "translateY(110%)" } } },
      animation: { marquee: "marquee 38s linear infinite", scan: "scan 2.8s ease-in-out infinite alternate" },
    },
  },
  plugins: [],
};
