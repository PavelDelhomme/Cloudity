import cloudityUiPreset from '../../packages/cloudity-ui/tailwind.preset.js'

/** @type {import('tailwindcss').Config} */
export default {
  presets: [cloudityUiPreset],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../cloudity-web/src/**/*.{js,ts,jsx,tsx}',
    '../../packages/cloudity-ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  plugins: [],
}
