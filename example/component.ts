import {
  required,
  optional,
  lazy,
  component,
  CustomElement,
  IsolatedCustomElement,
  type HtmlContent,
  type Int,
  ElmType,
} from "../src";

import { Foo } from "./related";

import style from "./app/styles";

// interface Foo {
//   /** bar comment */
//   bar: string;
//   baz: Int;
// }

/**
 * The dimensions of the element being observed.
 */
interface Box {
  width: number;
  height: number;
}

type Size = `${number}px`;

type Posix = ElmType<
  number,
  "Time.Posix",
  "Decode.map Time.millisToPosix Decode.int", // a complete `Decoder Time.Posix`
  "\\p -> Encode.int (Time.posixToMillis p)", // a `Time.Posix -> Encode.Value` function
  ["Time"] // imports the snippets need
>;

/** Observes an element and triggers events whenever the contents size changes. */
@component("size-observer")
class SizeObserver extends CustomElement<{
  requiredEvents: {
    sizeChange: Box;
  };
  htmlContent: "single";
  viewFnName: "container";
}> {
  /** Number of milliseconds to debounce.  */
  @optional
  accessor debounce: Int = 100 as Int;

  #resizeObserver!: ResizeObserver;
  #timeout: ReturnType<typeof setTimeout> | null = null;
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
    Rendered: { foo: string; size: Size };
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
  accessor otherProp!: Foo;

  @required
  accessor size!: Size;

  render() {
    this.triggerEvent("Rendered", { foo: "bar", size: this.size });
    console.log("rendered");
  }
}

type PlaceholderType = "slot" | "variable" | "context" | "system" | "local";

interface Placeholder<Data> {
  name: string;
  type: PlaceholderType;
  dataType: Data;
}

type Value =
  | {
      type: "string_value";
      value: string;
    }
  | { type: "int_value"; value: number };

type Root = {
  html: HTMLElement;
};

@component("reacty-thing")
export class ReactyThing extends CustomElement<{
  extraAttributes: false;
  requiredEvents: { click: Value; change: Placeholder<string>[] };
}> {
  #root!: Root;

  @required
  accessor placeholders!: Placeholder<string>[];

  @required
  accessor disabled!: Value;

  @optional
  accessor el: Placeholder<number> | undefined;

  @lazy
  accessor value: Placeholder<number> | undefined;

  @required
  accessor test!: { foo: string } & { bar: number };

  @optional
  accessor time: Posix = 0 as Posix;

  /** A dictionary of arbitrary string-keyed values. */
  @optional
  accessor metadata!: Record<string, string>;

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
