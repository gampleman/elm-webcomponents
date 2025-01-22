import styles from "./index.css?inline";

const style = new CSSStyleSheet();
style.replaceSync(styles);
document.adoptedStyleSheets = [style];
export default style;
