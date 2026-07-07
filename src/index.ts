/**
 * Defines how the in Elm the child nodes are going to be passed in.
 */
export type HtmlContent =
  /** No children expected */
  | "none"
  /** A single child node expected */
  | "single"
  /** Accepts a list of children */
  | "list"
  /** Uses slots */
  | {
      [key: string]: {
        mode?: "single" | "list";
        tag?: string;
      };
    };

/**
 * Base class for defining custom elements.
 */
export class CustomElement<
  Config extends {
    /**
     * Used to define events that are required arguments to the view function.
     * Should contain a string literal key with the event name and a value with the type that should be decoded. */
    requiredEvents?: { [eventName: string]: any };
    /**
     * Used to define events that are generated as optional attribute helpers.
     * Should contain a string literal key with the event name
     * and a value with the type that should be decoded.
     * */
    optionalEvents?: { [eventName: string]: any };
    /**
     * Used to define the html content of the element.
     * If set to "none", the element does not have any html content and will have no such argument.
     * If set to "single", the element has a single child.
     * If set to "list", the element has a list of children.
     * If set to an object, the view function will take HTML content as part of its required arguments record and will render them as slotted content.
     * */
    htmlContent?: HtmlContent;

    /**
     * If the element has no optional attributes/events, set this to false to avoid generating a list of attributes.
     * This will prevent adding class/id attributes to the element.
     * */
    extraAttributes?: boolean;
  } = {
    requiredEvents: {};
    optionalEvents: {};
    htmlContent: "none";
    extraAttributes: true;
  }
> extends HTMLElement {
  #updateTask = false;

  connectedCallback() {
    this.init();
    this.scheduleUpdate();
  }

  /** Called when intializing the DOM. No need to call super. */
  init() {}

  /** Called when tearing down the DOM. No need to call super. */
  teardown() {}

  disconnectedCallback() {
    this.teardown();
  }
  /**
   * Call this when something changes and you'd like to call the `update` method.
   *
   * This will schedule an update to be called on the next microtask, so that if multiple
   * things change in the same task, the update will only be called once.
   *
   * This is needed particularly because Elm's VDOM will change one property at a time
   * and we want to batch those changes into a single update.
   */
  scheduleUpdate() {
    if (this.isConnected && hasUpdate<() => void>(this) && !this.#updateTask) {
      window.queueMicrotask(() => {
        this.#updateTask = false;
        this.update();
      });
      this.#updateTask = true;
    }
  }

  /**
   * Send an event to the parent element. Requires the name and payload types to be present
   * in the type definition of the element in either `requiredEvents` or `optionalEvents`.
   *
   * @param name The name of the event.
   * @param data The payload of the event.
   */
  triggerEvent<Name extends string, Data>(
    this: Config["requiredEvents"] & Config["optionalEvents"] extends {
      [Key in Name]: Data;
    }
      ? CustomElement<Config>
      : never,
    name: Name,
    data: Data
  ) {
    this.dispatchEvent(new CustomEvent(name, { detail: data }));
  }
}

function hasUpdate<Sig>(
  t: CustomElement<any>
): t is CustomElement<any> & { update: Sig } {
  return "update" in t && typeof t.update === "function";
}

/**
 * This Decorator registers a custom element with the given tag name and marks it for the CLI to create an Elm module for it.
 *
 * @param tagName The tag name must:
 *  - start with an ASCII lowercase letter (a-z)
 *  - contain a hyphen
 *  - not contain any ASCII uppercase letters
 *  - not be any of "annotation-xml", "color-profile", "font-face", "font-face-src", "font-face-uri", "font-face-format", "font-face-name", or "missing-glyph".
 */
export const component =
  (tagName: string) => (decorated: typeof CustomElement<any>) => {
    window.customElements.define(tagName, decorated);
  };

function decorator<T, V>(
  access: any,
  context:
    | ClassAccessorDecoratorContext<CustomElement<T>, V>
    | ClassSetterDecoratorContext<CustomElement<T>, V>
    | ClassFieldDecoratorContext<CustomElement<T>, V>
): any {
  if (context.kind === "accessor") {
    return {
      set(this: CustomElement<T>, value: V) {
        // `access` is the original auto-accessor's { get, set } pair, invoked
        // with the instance as receiver. (Note: `context.access.set` has the
        // shape `set(instance, value)` and must NOT be used here.)
        access.set.call(this, value);
        this.scheduleUpdate?.();
      },
    };
  }
  if (context.kind !== "setter" && context.kind !== "field") {
    throw new Error(
      "this decorator can only be called on accessors, setters, or fields"
    );
  }
}

/**
 * Decorator. Marks an accessor as optional for the Elm module. Will call `update` after the value is set.
 *
 * @param options.updateAfterSet If set to false, the `update` method will not be called after the value is set.
 */
export const optional = decorator;

/**
 * Decorator. Marks an accessor as required for the Elm module. Will call `update` after the value is set.
 *
 * @param options.updateAfterSet If set to false, the `update` method will not be called after the value is set.
 */
export const required = decorator;

/**
 * Decorator. Marks an accessor as required for the Elm module but wrapped in a way that has the same semantics as `Html.Lazy`.
 * Will call `update` after the value is set.
 *
 * @param options.updateAfterSet If set to false, the `update` method will not be called after the value is set.
 */
export let lazy = <T, V>(
  ...args: Parameters<typeof decorator<T, V>>
): ReturnType<typeof decorator<T, V>> => {
  lazy = decorator;
  if (!window.customElements.get("ewc-value-setter")) {
    window.customElements.define(
      "ewc-value-setter",
      class ValueSetter<T> extends HTMLElement {
        key: string;
        constructor() {
          super();
        }
        connectedCallback(): void {
          this.style.display = "none";
        }
        set value(val: T) {
          const name = this.key;
          if (this.parentElement) {
            let el = this.parentElement as { [key: string]: T } & HTMLElement;
            // ts-ignore because this is a hack
            el[name] = val;
          }
        }
      }
    );
  }
  return decorator(...args);
};

/**
 * This sub class of CustomElement sets up a Shadow DOM for you
 * and includes some utilities for piercing it with styles.
 */
export class IsolatedCustomElement<T> extends CustomElement<T> {
  #updateTask = false;

  /**
   * The root of the Shadow DOM.
   */
  protected root: ShadowRoot;

  /**
   * The styles that are adopted by the Shadow DOM.
   * You may well want to override this with your own styles.
   */
  adoptedStyles: CSSStyleSheet[] = [];

  connectedCallback(): void {
    this.root = this.attachShadow({ mode: "closed" });
    this.root.adoptedStyleSheets = this.adoptedStyles;

    this.init();
    this.scheduleUpdate();
  }

  scheduleUpdate() {
    if (
      this.isConnected &&
      hasUpdate<(root: ShadowRoot) => void>(this) &&
      !this.#updateTask
    ) {
      window.queueMicrotask(() => {
        this.#updateTask = false;
        this.update(this.root);
      });
      this.#updateTask = true;
    }
  }
}
