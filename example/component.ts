import { api, component, CustomElement } from "../src";

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
}> {
  /** Number of milliseconds to debounce.  */
  @api()
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
  @api()
  accessor myProp: string = "default value";

  /** Some comments */
  @api({ required: true, renderAfterSet: false })
  accessor otherProp: Foo;

  render() {
    this.triggerEvent("Rendered", { foo: "bar" });
    console.log("rendered");
  }
}

type PlaceholderType = "slot" | "variable" | "context" | "system" | "local";

interface Placeholder {
  name: string;
  type: string;
  dataType: string;
}

type Root = {
  html: HTMLElement;
};

@component("reacty-thing")
class ReactyThing extends CustomElement<{}> {
  #root: Root;

  @api({ required: true })
  accessor placeholders: Placeholder[];

  @api({ required: true })
  accessor disabled: boolean;

  @api({ required: true })
  accessor value: Placeholder | null;

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
