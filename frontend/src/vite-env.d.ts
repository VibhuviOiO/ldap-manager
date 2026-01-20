/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FOOTER_TEXT: string
  readonly VITE_CONTEXT_PATH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.svg' {
  const content: string
  export default content
}

declare module '*.png' {
  const content: string
  export default content
}
