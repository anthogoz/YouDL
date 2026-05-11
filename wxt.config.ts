import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // Exclude non-extension directories from Vite's scanner
  vite: () => ({
    server: {
      watch: {
        ignored: ['**/temp/**', '**/host/**'],
      },
    },
    optimizeDeps: {
      exclude: ['temp', 'host'],
      entries: ['src/entrypoints/**/*.html'],
    },
  }),
  // Suppress Firefox data_collection_permissions warning (we declare it below)
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  manifest: {
    name: 'YouDL',
    description:
      'Download media from virtually any website (YouTube, SoundCloud, etc.) as Audio or Video.',
    permissions: ['activeTab', 'nativeMessaging'],
    browser_specific_settings: {
      gecko: {
        id: 'youdl@lnkhey',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
          optional: [],
        },
      } as any,
    },
  },
});
