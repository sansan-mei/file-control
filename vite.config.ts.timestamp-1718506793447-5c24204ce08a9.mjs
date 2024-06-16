// vite.config.ts
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "file:///D:/code/ChatGPT/file-control/node_modules/.pnpm/vite@5.2.7_@types+node@20.12.2/node_modules/vite/dist/node/index.js";
import vue from "file:///D:/code/ChatGPT/file-control/node_modules/.pnpm/@vitejs+plugin-vue@5.0.4_vite@5.2.7_vue@3.4.21/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import vueJsx from "file:///D:/code/ChatGPT/file-control/node_modules/.pnpm/@vitejs+plugin-vue-jsx@3.1.0_vite@5.2.7_vue@3.4.21/node_modules/@vitejs/plugin-vue-jsx/dist/index.mjs";
import process from "node:process";
var __vite_injected_original_import_meta_url = "file:///D:/code/ChatGPT/file-control/vite.config.ts";
var vite_config_default = defineConfig((env) => {
  const viteEnv = loadEnv(env.mode, process.cwd());
  return {
    plugins: [
      vue(),
      vueJsx()
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
      }
    },
    server: {
      proxy: {
        "/api": {
          target: viteEnv.VITE_APP_API_BASE_URL,
          changeOrigin: true,
          // 允许跨域
          rewrite: (path) => path.replace("/api/", "/")
        }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxjb2RlXFxcXENoYXRHUFRcXFxcZmlsZS1jb250cm9sXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxjb2RlXFxcXENoYXRHUFRcXFxcZmlsZS1jb250cm9sXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9jb2RlL0NoYXRHUFQvZmlsZS1jb250cm9sL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZmlsZVVSTFRvUGF0aCwgVVJMIH0gZnJvbSAnbm9kZTp1cmwnXG5cbmltcG9ydCB7IGRlZmluZUNvbmZpZywgbG9hZEVudiB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgdnVlIGZyb20gJ0B2aXRlanMvcGx1Z2luLXZ1ZSdcbmltcG9ydCB2dWVKc3ggZnJvbSAnQHZpdGVqcy9wbHVnaW4tdnVlLWpzeCdcbmltcG9ydCBwcm9jZXNzIGZyb20gJ25vZGU6cHJvY2Vzcyc7XG5cbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKGVudikgPT4ge1xuICBjb25zdCB2aXRlRW52ID0gbG9hZEVudihlbnYubW9kZSwgcHJvY2Vzcy5jd2QoKSlcbiAgcmV0dXJuIHtcbiAgICBwbHVnaW5zOiBbXG4gICAgICB2dWUoKSxcbiAgICAgIHZ1ZUpzeCgpLFxuICAgIF0sXG4gICAgcmVzb2x2ZToge1xuICAgICAgYWxpYXM6IHtcbiAgICAgICAgJ0AnOiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4vc3JjJywgaW1wb3J0Lm1ldGEudXJsKSlcbiAgICAgIH1cbiAgICB9LFxuICAgIHNlcnZlcjoge1xuICAgICAgcHJveHk6IHtcbiAgICAgICAgJy9hcGknOiB7XG4gICAgICAgICAgdGFyZ2V0OiB2aXRlRW52LlZJVEVfQVBQX0FQSV9CQVNFX1VSTCxcbiAgICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsIC8vIFx1NTE0MVx1OEJCOFx1OERFOFx1NTdERlxuICAgICAgICAgIHJld3JpdGU6IHBhdGggPT4gcGF0aC5yZXBsYWNlKCcvYXBpLycsICcvJyksXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgfVxuICB9XG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE4USxTQUFTLGVBQWUsV0FBVztBQUVqVCxTQUFTLGNBQWMsZUFBZTtBQUN0QyxPQUFPLFNBQVM7QUFDaEIsT0FBTyxZQUFZO0FBQ25CLE9BQU8sYUFBYTtBQUxtSixJQUFNLDJDQUEyQztBQVF4TixJQUFPLHNCQUFRLGFBQWEsQ0FBQyxRQUFRO0FBQ25DLFFBQU0sVUFBVSxRQUFRLElBQUksTUFBTSxRQUFRLElBQUksQ0FBQztBQUMvQyxTQUFPO0FBQUEsSUFDTCxTQUFTO0FBQUEsTUFDUCxJQUFJO0FBQUEsTUFDSixPQUFPO0FBQUEsSUFDVDtBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ0wsS0FBSyxjQUFjLElBQUksSUFBSSxTQUFTLHdDQUFlLENBQUM7QUFBQSxNQUN0RDtBQUFBLElBQ0Y7QUFBQSxJQUNBLFFBQVE7QUFBQSxNQUNOLE9BQU87QUFBQSxRQUNMLFFBQVE7QUFBQSxVQUNOLFFBQVEsUUFBUTtBQUFBLFVBQ2hCLGNBQWM7QUFBQTtBQUFBLFVBQ2QsU0FBUyxVQUFRLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFBQSxRQUM1QztBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
