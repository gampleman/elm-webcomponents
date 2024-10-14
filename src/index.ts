export type HtmlContent =
  | "none"
  | "single"
  | "list"
  | {
      [key: string]: {
        mode?: "single" | "list";
        tag?: string;
      };
    };

export class CustomElement<
  Config extends {
    /**
     * Used to define events that are required arguments to the view function.
     * Should contain a string literal key with the event name and a value with the type that should be decoded. */
    requiredEvents?: {};
    /**
     * Used to define events that are generated as optional attribute helpers.
     * Should contain a string literal key with the event name
     * and a value with the type that should be decoded.
     * */
    optionalEvents?: {};
    /**
     * Used to define the html content of the element.
     * If set to "none", the element does not have any html content and will have no such argument.
     * If set to "single", the element has a single child.
     * If set to "list", the element has a list of children.
     * If set to an object, the view function will take HTML content as part of its required arguments record and will render them as slotted content.
     * */
    htmlContent?: HtmlContent;
  } = {
    requiredEvents: {};
    optionalEvents: {};
    htmlContent: "none";
  }
> extends HTMLElement {
  #renderTask = false;

  scheduleRender() {
    if (hasRender(this) && !this.#renderTask) {
      window.queueMicrotask(() => {
        this.#renderTask = false;
        this.render();
      });
      this.#renderTask = true;
    }
  }

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

function hasRender(
  t: CustomElement<any>
): t is CustomElement<any> & { render: () => void } {
  return "render" in t && typeof t.render === "function";
}

export const component =
  (tagName: string) => (decorated: typeof CustomElement<any>) => {
    window.customElements.define(tagName, decorated);
  };

export const api =
  ({
    renderAfterSet = true,
    required = false,
  }: { renderAfterSet?: boolean; required?: boolean } = {}) =>
  <T extends { scheduleRender?: () => void }, V>(
    access: ClassAccessorDecoratorTarget<T, V>,
    property: unknown
  ): ClassAccessorDecoratorResult<T, V> => {
    return {
      set(this: T, value: V) {
        access.set.call(this, value);
        if (renderAfterSet) this.scheduleRender?.();
      },
    };
  };
