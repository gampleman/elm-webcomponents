import { defineConfig } from "vite";

import elm from "vite-plugin-elm";

// https://vitejs.dev/config/
export default defineConfig(({}) => {
  const config = {
    plugins: [
      elm({
        debug: false,
      }),
    ],
  };

  return config;
});
