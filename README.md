# Elm-webcomponents

This is a Typescript library and CLI tool that generates Elm modules for really nice web components interop.

Let's look at an example of a simple SizeObserver web component:

```typescript
import { CustomElement, component, api } from "elm-webcomponents";

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
```

When you run this tool you will get the following file generated for you:

```elm
module SizeObserver exposing (view, debounce)

{-| Observes an element and triggers events whenever the contents size changes.

@docs container, debounce

-}

import Html exposing (Html)
import Html.Attributes exposing (Attribute)
import Html.Events
import Json.Decode as Decode
import Json.Encode as Encode


{-| Number of milliseconds to debounce.
-}
debounce : Float -> Attribute msg
debounce val =
    Html.Attributes.property "debounce" (Encode.float val)


{-| -}
container :
    List (Attribute msg)
    -> { onSizeChange : { width : Float, height : Float } -> msg }
    -> Html msg
    -> Html msg
container attrs req child =
    Html.node "size-observer"
        (Html.Events.on "sizeChange"
            (Decode.map req.onSizeChange
                (Decode.map2 (\width height -> { width = width, height = height })
                    (Decode.field "width" Decode.float)
                    (Decode.field "height" Decode.height)
                )
            )
            :: attrs
        )
        [ child ]

```

As you can see, the Elm module is ready to use with a nice idiomatic API, including documentation comments!

Let's look at how this works:

### `@component`

The first piece of the puzzle is the `@component` decorator. During run time, it's job is to register the class it's decorating as a custom element with a particular tag name. During code generation, we grab this tag name and use for our `Html.node` call.

### `extends CustomElement`

Another important part is extending `CustomElement`. `CustomElement` itself extends `HTMLElement`, so all the familiar APIs there are available, but it adds a couple of (optional) nicieties at runtime (we'll get to these later).

For code generation, the most important feature is its type argument. The type argument contains a good amount of configuration, but the nice thing about having it as a type argument is that it will be completely erased during compilation and won't be shipped to the client at all.

Let's look at the fields:

```typescript
type Config = {
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
   * The name of the view function. Defaults to "view".
   */
  viewFnName?: string;
  /**
   * Used to define the html content of the element.
   * If set to "none", the element does not have any html content and will have no such argument.
   * If set to "single", the element has a single child.
   * If set to "list", the element has a list of children.
   * If set to an object, the view function will take HTML content as part of its required arguments record and will render them as slotted content.
   * Defaults to "none".
   * */
  htmlContent?:
    | "none"
    | "single"
    | "list"
    | {
        [key: string]: {
          mode?: "single" | "list";
          tag?: string;
        };
      };
};
```

One of the runtime nicities we provide is `this.triggerEvent(eventName, eventDetails)` function. It's a pretty shallow wrapper around `this.dispathEvent(new CustomEvent(eventName, eventDetails))`, but with the nice property that it enforces that the event name and event details are correctly encoded in either `requiredEvents` or `optionalEvents`.

### @api()

The final piece is the `@api` decorator for `accessor`, which marks accessors (note class fields are not supported, since decorators can't mess with them, but I am planning another decorator for getter/setter pairs) as interaction points with the outside world. These can have a `{required : true}` argument which affects code generation, but also affects some of the lifecycle calls:

### Lifecycle hooks

You can extend `init` and `render` which are called once after Elm is done setting all the attributes in a single render (so won't be called multiple times) and after all the `required` attributes have been set (so no need to worry about undefined values). `init` will be called once per component being in the DOM, whereas `render` will be called every time the attributes change.

These are all completely optional, and you don't need to implement them, but make integrating with say _React_ very easy:

```typescript
import { createRoot, type Root } from "react-dom/client";

@component("my-thing")
class ReactyThing extends CustomElement {
  @api({required: true})
  accessor foo: string;

  @api({required: true});
  accessor bar: number;

  #root : Root;
  init() {
    this.#root = createRoot(this);
  }

  render() {
    this.#root.render(<MyReactComponent foo={this.foo} bar={this.bar} />);
  }
}
```

### Typescript -> Elm

This codebase works by translating a subset of Typescript types into Elm types/encoders/decoders.
We'll provide some more details on which types are supported or otherwise closer to release.

### Status

At the moment this tool is at a proof of concept stage. Some of the trickiest pieces have been implemented, but there is a fair amount of gruntwork to be done.
