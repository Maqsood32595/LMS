// vite.config.js
import { defineConfig } from "file:///D:/Mujahid/LMS/frontend/node_modules/vite/dist/node/index.js";
import vue from "file:///D:/Mujahid/LMS/frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import path from "path";
import { VitePWA } from "file:///D:/Mujahid/LMS/frontend/node_modules/vite-plugin-pwa/dist/index.js";
import { viteStaticCopy } from "file:///D:/Mujahid/LMS/frontend/node_modules/vite-plugin-static-copy/dist/index.js";
var __vite_injected_original_dirname = "D:\\Mujahid\\LMS\\frontend";
var FRACTAL_KERNEL_TARGET = process.env.VITE_FRACTAL_KERNEL || "http://localhost:3000";
var vite_config_default = defineConfig(async ({ mode }) => {
  const isDev = mode === "development";
  const frappeui = await importFrappeUIPlugin(isDev);
  const config = {
    define: {
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false"
    },
    plugins: [
      {
        // ── FRACTAL: neutralize frappe-ui's bench socket ─────────────
        // FrappeUI's install() calls its bundled initSocket(), which
        // dials the bench realtime port (:9000) on every page load.
        // Redirect that module to our optional-realtime stub.
        name: "fractal-noop-frappe-socket",
        enforce: "pre",
        resolveId(id, importer) {
          if (importer && importer.includes("frappe-ui") && /utils[/\\]socketio(\.(ts|js))?$/.test(id)) {
            return path.resolve(__vite_injected_original_dirname, "src/stubs/frappe-noop-socket.ts");
          }
          return null;
        }
      },
      frappeui({
        frappeProxy: false,
        // ← no more Frappe bench
        lucideIcons: true,
        jinjaBootData: false
        // ← boot data now comes from /api/v1/auth/user
      }),
      vue(),
      // ── FRACTAL: PWA service worker DISABLED ─────────────────────────
      // A stale bench-era SW kept serving the old bundle. public/sw.js +
      // public/registerSW.js now ship SELF-UNINSTALLING workers instead.
      VitePWA({
        disable: true
      }),
      // pdf.js needs cMaps + standard_fonts as sibling assets or those PDFs
      // render blank. PdfBlock.vue points cMapUrl/standardFontDataUrl at
      // `${BASE_URL}pdfjs/...`.
      viteStaticCopy({
        targets: [
          {
            src: "node_modules/pdfjs-dist/cmaps/*",
            dest: "pdfjs/cmaps"
          },
          {
            src: "node_modules/pdfjs-dist/standard_fonts/*",
            dest: "pdfjs/standard_fonts"
          }
        ]
      })
    ],
    server: {
      host: "0.0.0.0",
      // Accept connections from any network interface
      allowedHosts: true,
      port: 8080,
      proxy: {
        // Fractal Kernel — all backend calls ride on /api/*
        "/api": {
          target: FRACTAL_KERNEL_TARGET,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: "dist",
      // standalone SPA output served by the Kernel
      emptyOutDir: true
    },
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "src")
      },
      // Force one copy of prosemirror; duplicate copies break tiptap's
      // instanceof checks and crash the list buttons.
      dedupe: [
        "prosemirror-model",
        "prosemirror-state",
        "prosemirror-view",
        "prosemirror-transform",
        "vue",
        "frappe-ui"
      ]
    },
    optimizeDeps: {
      include: [
        "feather-icons",
        "tailwind.config.js",
        "highlight.js",
        "plyr"
      ],
      exclude: mode === "production" ? [] : ["frappe-ui"]
    }
  };
  return config;
});
async function importFrappeUIPlugin(isDev) {
  if (isDev) {
    try {
      const module2 = await import("../frappe-ui/vite");
      return module2.default;
    } catch (error) {
      console.warn(
        "Local frappe-ui not found, falling back to npm package:",
        error.message
      );
    }
  }
  const module = await import("file:///D:/Mujahid/LMS/frontend/node_modules/frappe-ui/vite/index.js");
  return module.default;
}
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxNdWphaGlkXFxcXExNU1xcXFxmcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcTXVqYWhpZFxcXFxMTVNcXFxcZnJvbnRlbmRcXFxcdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L011amFoaWQvTE1TL2Zyb250ZW5kL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcclxuaW1wb3J0IHZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnXHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnXHJcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnXHJcbmltcG9ydCB7IHZpdGVTdGF0aWNDb3B5IH0gZnJvbSAndml0ZS1wbHVnaW4tc3RhdGljLWNvcHknXHJcblxyXG4vLyBcdTI1MDBcdTI1MDAgRlJBQ1RBTCBDT05WRVJTSU9OIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4vLyBUaGUgRnJhcHBlIGJlbmNoIHByb3h5IGlzIGdvbmUuIEFsbCAvYXBpIHRyYWZmaWMgaXMgcHJveGllZCB0byB0aGUgbG9jYWxcclxuLy8gRnJhY3RhbCBLZXJuZWwgKHNlcnZlci9pbmRleC5qcykuIEluIHByb2R1Y3Rpb24gdGhlIGJ1aWx0IGRpc3QvIGlzIHNlcnZlZFxyXG4vLyBieSB0aGUgc2FtZSBFeHByZXNzIHByb2Nlc3MuXHJcbmNvbnN0IEZSQUNUQUxfS0VSTkVMX1RBUkdFVCA9XHJcblx0cHJvY2Vzcy5lbnYuVklURV9GUkFDVEFMX0tFUk5FTCB8fCAnaHR0cDovL2xvY2FsaG9zdDozMDAwJ1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKGFzeW5jICh7IG1vZGUgfSkgPT4ge1xyXG5cdGNvbnN0IGlzRGV2ID0gbW9kZSA9PT0gJ2RldmVsb3BtZW50J1xyXG5cdGNvbnN0IGZyYXBwZXVpID0gYXdhaXQgaW1wb3J0RnJhcHBlVUlQbHVnaW4oaXNEZXYpXHJcblxyXG5cdGNvbnN0IGNvbmZpZyA9IHtcclxuXHRcdGRlZmluZToge1xyXG5cdFx0XHRfX1ZVRV9QUk9EX0hZRFJBVElPTl9NSVNNQVRDSF9ERVRBSUxTX186ICdmYWxzZScsXHJcblx0XHR9LFxyXG5cdFx0cGx1Z2luczogW1xyXG5cdFx0XHR7XHJcblx0XHRcdFx0Ly8gXHUyNTAwXHUyNTAwIEZSQUNUQUw6IG5ldXRyYWxpemUgZnJhcHBlLXVpJ3MgYmVuY2ggc29ja2V0IFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG5cdFx0XHRcdC8vIEZyYXBwZVVJJ3MgaW5zdGFsbCgpIGNhbGxzIGl0cyBidW5kbGVkIGluaXRTb2NrZXQoKSwgd2hpY2hcclxuXHRcdFx0XHQvLyBkaWFscyB0aGUgYmVuY2ggcmVhbHRpbWUgcG9ydCAoOjkwMDApIG9uIGV2ZXJ5IHBhZ2UgbG9hZC5cclxuXHRcdFx0XHQvLyBSZWRpcmVjdCB0aGF0IG1vZHVsZSB0byBvdXIgb3B0aW9uYWwtcmVhbHRpbWUgc3R1Yi5cclxuXHRcdFx0XHRuYW1lOiAnZnJhY3RhbC1ub29wLWZyYXBwZS1zb2NrZXQnLFxyXG5cdFx0XHRcdGVuZm9yY2U6ICdwcmUnLFxyXG5cdFx0XHRcdHJlc29sdmVJZChpZCwgaW1wb3J0ZXIpIHtcclxuXHRcdFx0XHRcdGlmIChcclxuXHRcdFx0XHRcdFx0aW1wb3J0ZXIgJiZcclxuXHRcdFx0XHRcdFx0aW1wb3J0ZXIuaW5jbHVkZXMoJ2ZyYXBwZS11aScpICYmXHJcblx0XHRcdFx0XHRcdC91dGlsc1svXFxcXF1zb2NrZXRpbyhcXC4odHN8anMpKT8kLy50ZXN0KGlkKVxyXG5cdFx0XHRcdFx0KSB7XHJcblx0XHRcdFx0XHRcdHJldHVybiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnc3JjL3N0dWJzL2ZyYXBwZS1ub29wLXNvY2tldC50cycpXHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRyZXR1cm4gbnVsbFxyXG5cdFx0XHRcdH0sXHJcblx0XHRcdH0sXHJcblx0XHRcdGZyYXBwZXVpKHtcclxuXHRcdFx0XHRmcmFwcGVQcm94eTogZmFsc2UsIC8vIFx1MjE5MCBubyBtb3JlIEZyYXBwZSBiZW5jaFxyXG5cdFx0XHRcdGx1Y2lkZUljb25zOiB0cnVlLFxyXG5cdFx0XHRcdGppbmphQm9vdERhdGE6IGZhbHNlLCAvLyBcdTIxOTAgYm9vdCBkYXRhIG5vdyBjb21lcyBmcm9tIC9hcGkvdjEvYXV0aC91c2VyXHJcblx0XHRcdH0pLFxyXG5cdFx0XHR2dWUoKSxcclxuXHRcdFx0Ly8gXHUyNTAwXHUyNTAwIEZSQUNUQUw6IFBXQSBzZXJ2aWNlIHdvcmtlciBESVNBQkxFRCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuXHRcdFx0Ly8gQSBzdGFsZSBiZW5jaC1lcmEgU1cga2VwdCBzZXJ2aW5nIHRoZSBvbGQgYnVuZGxlLiBwdWJsaWMvc3cuanMgK1xyXG5cdFx0XHQvLyBwdWJsaWMvcmVnaXN0ZXJTVy5qcyBub3cgc2hpcCBTRUxGLVVOSU5TVEFMTElORyB3b3JrZXJzIGluc3RlYWQuXHJcblx0XHRcdFZpdGVQV0Eoe1xyXG5cdFx0XHRcdGRpc2FibGU6IHRydWUsXHJcblx0XHRcdH0pLFxyXG5cdFx0XHQvLyBwZGYuanMgbmVlZHMgY01hcHMgKyBzdGFuZGFyZF9mb250cyBhcyBzaWJsaW5nIGFzc2V0cyBvciB0aG9zZSBQREZzXHJcblx0XHRcdC8vIHJlbmRlciBibGFuay4gUGRmQmxvY2sudnVlIHBvaW50cyBjTWFwVXJsL3N0YW5kYXJkRm9udERhdGFVcmwgYXRcclxuXHRcdFx0Ly8gYCR7QkFTRV9VUkx9cGRmanMvLi4uYC5cclxuXHRcdFx0dml0ZVN0YXRpY0NvcHkoe1xyXG5cdFx0XHRcdHRhcmdldHM6IFtcclxuXHRcdFx0XHRcdHtcclxuXHRcdFx0XHRcdFx0c3JjOiAnbm9kZV9tb2R1bGVzL3BkZmpzLWRpc3QvY21hcHMvKicsXHJcblx0XHRcdFx0XHRcdGRlc3Q6ICdwZGZqcy9jbWFwcycsXHJcblx0XHRcdFx0XHR9LFxyXG5cdFx0XHRcdFx0e1xyXG5cdFx0XHRcdFx0XHRzcmM6ICdub2RlX21vZHVsZXMvcGRmanMtZGlzdC9zdGFuZGFyZF9mb250cy8qJyxcclxuXHRcdFx0XHRcdFx0ZGVzdDogJ3BkZmpzL3N0YW5kYXJkX2ZvbnRzJyxcclxuXHRcdFx0XHRcdH0sXHJcblx0XHRcdFx0XSxcclxuXHRcdFx0fSksXHJcblx0XHRdLFxyXG5cdFx0c2VydmVyOiB7XHJcblx0XHRcdGhvc3Q6ICcwLjAuMC4wJywgLy8gQWNjZXB0IGNvbm5lY3Rpb25zIGZyb20gYW55IG5ldHdvcmsgaW50ZXJmYWNlXHJcblx0XHRcdGFsbG93ZWRIb3N0czogdHJ1ZSxcclxuXHRcdFx0cG9ydDogODA4MCxcclxuXHRcdFx0cHJveHk6IHtcclxuXHRcdFx0XHQvLyBGcmFjdGFsIEtlcm5lbCBcdTIwMTQgYWxsIGJhY2tlbmQgY2FsbHMgcmlkZSBvbiAvYXBpLypcclxuXHRcdFx0XHQnL2FwaSc6IHtcclxuXHRcdFx0XHRcdHRhcmdldDogRlJBQ1RBTF9LRVJORUxfVEFSR0VULFxyXG5cdFx0XHRcdFx0Y2hhbmdlT3JpZ2luOiB0cnVlLFxyXG5cdFx0XHRcdH0sXHJcblx0XHRcdH0sXHJcblx0XHR9LFxyXG5cdFx0YnVpbGQ6IHtcclxuXHRcdFx0b3V0RGlyOiAnZGlzdCcsIC8vIHN0YW5kYWxvbmUgU1BBIG91dHB1dCBzZXJ2ZWQgYnkgdGhlIEtlcm5lbFxyXG5cdFx0XHRlbXB0eU91dERpcjogdHJ1ZSxcclxuXHRcdH0sXHJcblx0XHRyZXNvbHZlOiB7XHJcblx0XHRcdGFsaWFzOiB7XHJcblx0XHRcdFx0J0AnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnc3JjJyksXHJcblx0XHRcdH0sXHJcblx0XHRcdC8vIEZvcmNlIG9uZSBjb3B5IG9mIHByb3NlbWlycm9yOyBkdXBsaWNhdGUgY29waWVzIGJyZWFrIHRpcHRhcCdzXHJcblx0XHRcdC8vIGluc3RhbmNlb2YgY2hlY2tzIGFuZCBjcmFzaCB0aGUgbGlzdCBidXR0b25zLlxyXG5cdFx0XHRkZWR1cGU6IFtcclxuXHRcdFx0XHQncHJvc2VtaXJyb3ItbW9kZWwnLFxyXG5cdFx0XHRcdCdwcm9zZW1pcnJvci1zdGF0ZScsXHJcblx0XHRcdFx0J3Byb3NlbWlycm9yLXZpZXcnLFxyXG5cdFx0XHRcdCdwcm9zZW1pcnJvci10cmFuc2Zvcm0nLFxyXG5cdFx0XHRcdCd2dWUnLFxyXG5cdFx0XHRcdCdmcmFwcGUtdWknLFxyXG5cdFx0XHRdLFxyXG5cdFx0fSxcclxuXHRcdG9wdGltaXplRGVwczoge1xyXG5cdFx0XHRpbmNsdWRlOiBbXHJcblx0XHRcdFx0J2ZlYXRoZXItaWNvbnMnLFxyXG5cdFx0XHRcdCd0YWlsd2luZC5jb25maWcuanMnLFxyXG5cdFx0XHRcdCdoaWdobGlnaHQuanMnLFxyXG5cdFx0XHRcdCdwbHlyJyxcclxuXHRcdFx0XSxcclxuXHRcdFx0ZXhjbHVkZTogbW9kZSA9PT0gJ3Byb2R1Y3Rpb24nID8gW10gOiBbJ2ZyYXBwZS11aSddLFxyXG5cdFx0fSxcclxuXHR9XHJcblx0cmV0dXJuIGNvbmZpZ1xyXG59KVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gaW1wb3J0RnJhcHBlVUlQbHVnaW4oaXNEZXYpIHtcclxuXHRpZiAoaXNEZXYpIHtcclxuXHRcdHRyeSB7XHJcblx0XHRcdGNvbnN0IG1vZHVsZSA9IGF3YWl0IGltcG9ydCgnLi4vZnJhcHBlLXVpL3ZpdGUnKVxyXG5cdFx0XHRyZXR1cm4gbW9kdWxlLmRlZmF1bHRcclxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XHJcblx0XHRcdGNvbnNvbGUud2FybihcclxuXHRcdFx0XHQnTG9jYWwgZnJhcHBlLXVpIG5vdCBmb3VuZCwgZmFsbGluZyBiYWNrIHRvIG5wbSBwYWNrYWdlOicsXHJcblx0XHRcdFx0ZXJyb3IubWVzc2FnZVxyXG5cdFx0XHQpXHJcblx0XHR9XHJcblx0fVxyXG5cdC8vIEZhbGwgYmFjayB0byBucG0gcGFja2FnZSBpZiBsb2NhbCBpbXBvcnQgZmFpbHNcclxuXHRjb25zdCBtb2R1bGUgPSBhd2FpdCBpbXBvcnQoJ2ZyYXBwZS11aS92aXRlJylcclxuXHRyZXR1cm4gbW9kdWxlLmRlZmF1bHRcclxufVxyXG5cclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUErUCxTQUFTLG9CQUFvQjtBQUM1UixPQUFPLFNBQVM7QUFDaEIsT0FBTyxVQUFVO0FBQ2pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUovQixJQUFNLG1DQUFtQztBQVV6QyxJQUFNLHdCQUNMLFFBQVEsSUFBSSx1QkFBdUI7QUFFcEMsSUFBTyxzQkFBUSxhQUFhLE9BQU8sRUFBRSxLQUFLLE1BQU07QUFDL0MsUUFBTSxRQUFRLFNBQVM7QUFDdkIsUUFBTSxXQUFXLE1BQU0scUJBQXFCLEtBQUs7QUFFakQsUUFBTSxTQUFTO0FBQUEsSUFDZCxRQUFRO0FBQUEsTUFDUCx5Q0FBeUM7QUFBQSxJQUMxQztBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBS0MsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFFBQ1QsVUFBVSxJQUFJLFVBQVU7QUFDdkIsY0FDQyxZQUNBLFNBQVMsU0FBUyxXQUFXLEtBQzdCLGtDQUFrQyxLQUFLLEVBQUUsR0FDeEM7QUFDRCxtQkFBTyxLQUFLLFFBQVEsa0NBQVcsaUNBQWlDO0FBQUEsVUFDakU7QUFDQSxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTO0FBQUEsUUFDUixhQUFhO0FBQUE7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLGVBQWU7QUFBQTtBQUFBLE1BQ2hCLENBQUM7QUFBQSxNQUNELElBQUk7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUlKLFFBQVE7QUFBQSxRQUNQLFNBQVM7QUFBQSxNQUNWLENBQUM7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUlELGVBQWU7QUFBQSxRQUNkLFNBQVM7QUFBQSxVQUNSO0FBQUEsWUFDQyxLQUFLO0FBQUEsWUFDTCxNQUFNO0FBQUEsVUFDUDtBQUFBLFVBQ0E7QUFBQSxZQUNDLEtBQUs7QUFBQSxZQUNMLE1BQU07QUFBQSxVQUNQO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUNBLFFBQVE7QUFBQSxNQUNQLE1BQU07QUFBQTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QsTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBO0FBQUEsUUFFTixRQUFRO0FBQUEsVUFDUCxRQUFRO0FBQUEsVUFDUixjQUFjO0FBQUEsUUFDZjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxPQUFPO0FBQUEsTUFDTixRQUFRO0FBQUE7QUFBQSxNQUNSLGFBQWE7QUFBQSxJQUNkO0FBQUEsSUFDQSxTQUFTO0FBQUEsTUFDUixPQUFPO0FBQUEsUUFDTixLQUFLLEtBQUssUUFBUSxrQ0FBVyxLQUFLO0FBQUEsTUFDbkM7QUFBQTtBQUFBO0FBQUEsTUFHQSxRQUFRO0FBQUEsUUFDUDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLGNBQWM7QUFBQSxNQUNiLFNBQVM7QUFBQSxRQUNSO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsU0FBUyxTQUFTLGVBQWUsQ0FBQyxJQUFJLENBQUMsV0FBVztBQUFBLElBQ25EO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUixDQUFDO0FBRUQsZUFBZSxxQkFBcUIsT0FBTztBQUMxQyxNQUFJLE9BQU87QUFDVixRQUFJO0FBQ0gsWUFBTUEsVUFBUyxNQUFNLE9BQU8sbUJBQW1CO0FBQy9DLGFBQU9BLFFBQU87QUFBQSxJQUNmLFNBQVMsT0FBTztBQUNmLGNBQVE7QUFBQSxRQUNQO0FBQUEsUUFDQSxNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsUUFBTSxTQUFTLE1BQU0sT0FBTyxzRUFBZ0I7QUFDNUMsU0FBTyxPQUFPO0FBQ2Y7IiwKICAibmFtZXMiOiBbIm1vZHVsZSJdCn0K
