import {
  required,
  optional,
  lazy,
  component,
  CustomElement,
  IsolatedCustomElement,
  type HtmlContent,
} from "../src";

import style from "./app/styles";

type Int = number;

interface Foo {
  /** bar comment */
  bar: string;
  baz: Int;
}

/** Observes an element and triggers events whenever the contents size changes. */
@component("size-observer")
class SizeObserver extends CustomElement<{
  requiredEvents: {
    sizeChange: { width: number; height: number };
  };
  htmlContent: "single";
  viewFnName: "container";
}> {
  /** Number of milliseconds to debounce.  */
  @optional
  accessor debounce: number = 100;

  #resizeObserver: ResizeObserver;
  #timeout: NodeJS.Timeout | null = null;
  connectedCallback(): void {
    this.#resizeObserver = new ResizeObserver(() => {
      if (this.#timeout == null) {
        this.#timeout = setTimeout(() => {
          this.triggerEvent("sizeChange", {
            width: this.offsetWidth,
            height: this.offsetHeight,
          });
          this.#timeout = null;
        });
      }
    });

    this.#resizeObserver.observe(this);
  }

  disconnectedCallback(): void {
    this.#resizeObserver?.disconnect();
    this.#timeout && clearTimeout(this.#timeout);
  }
}

/**
 * Some doc comment
 */
@component("my-element")
class MyElement extends CustomElement<{
  optionalEvents: {
    /** foo comment */
    Rendered: { foo: string };
  };
  htmlContent: {
    header: { mode: "single" };
  };
}> {
  /** Some more comments */
  @optional
  accessor myProp: string = "default value";

  /** Some comments */
  @required
  accessor otherProp: Foo;

  render() {
    this.triggerEvent("Rendered", { foo: "bar" });
    console.log("rendered");
  }
}

type PlaceholderType = "slot" | "variable" | "context" | "system" | "local";

interface Placeholder<Data> {
  name: string;
  type: string;
  dataType: Data;
}

type Root = {
  html: HTMLElement;
};

@component("reacty-thing")
export class ReactyThing extends CustomElement<{ extraAttributes: false }> {
  #root: Root;

  @required
  accessor placeholders: Placeholder<string>[];

  @required
  accessor disabled: boolean;

  @lazy
  accessor value: Placeholder<number> | null;

  init() {
    this.#root = {
      html: document.createElement("div"),
    };
  }

  render() {
    const div = document.createElement("div");
    div.innerHTML = `${this.disabled}: ${this.placeholders
      .map((p) => p.name)
      .join(", ")}`;
    this.#root.html.appendChild(div);
  }
}

@component("example-component")
class ExampleComponent extends IsolatedCustomElement<{
  htmlContent: { content: { mode: "single"; tag: "div" } };
}> {
  #count: { value: number } = { value: 0 };
  // @lazy
  // accessor count: { value: number } = { value: 0 };

  adoptedStyles = [style];

  update() {
    if (this.#count.value % 2 === 0) {
      this.root.innerHTML = `<div><div class="red">Count: ${
        this.#count.value
      }</div><slot name="content">Fallback</slot></div>`;
    } else {
      this.root.innerHTML = `<div><div>Count: ${this.#count.value}</div></div>`;
    }
  }
}
