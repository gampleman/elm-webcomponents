// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- initial eslint integration: disable all existing eslint errors
/// <reference types="vite/client" />

declare module "*.elm";
declare module "*.css?inline" {
  const content: string;
  export default content;
}
