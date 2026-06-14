/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// 构建时由 vite.config 的 define 注入：内置 release-notes.json 的 version（见 vite.config.ts）
declare const __NOTES_VERSION__: string
