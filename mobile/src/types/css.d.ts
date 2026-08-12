declare module '*.css';
declare module '*.css?inline' {
  const content: string;
  export default content;
}
declare module '*.woff2' {
  const url: string;
  export default url;
}
