# Elm Webcomponents

Web components have become a standard technology for extending Elm on the client side.
However, there are a few pain points in implementing and maintaining proper interop, which this tool
aims to solve.

We provide a TypeScript library that allows you to describe the desired interface (mostly through types)
that the provided CLI tool can than generate type safe Elm bindings for. This automates some of the
tedium involved in building custom elements.

Let's look at an example of a simple `SizeObserver` web component:

```typescript
import { CustomElement, component, optional } from "elm-webcomponents";

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
```

When you run this tool, you will get the following file generated for you:

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

## The decorators

### `@component`

The first piece of the puzzle is the `@component` decorator. During runtime, its job is to register the class it's decorating as a custom element with a particular tag name. During code generation, we grab this tag name and use for our `Html.node` call.

### `@required` and `@optional`

You use the `@required` and `@optional` decorators to decorate properties of your class. They are implemented identically at runtime, the only difference is that the Elm code generation:

```ts
import {
  component,
  required,
  optional,
  CustomElement,
} from "elm-webcomponents";

@component("my-example")
class MyExample extends CustomElement<{}> {
  @required
  accessor foo: string;

  @optional
  accessor bar: bool = true;
}
```

Generates the following:

```elm
module MyExample exposing (view, bar)

bar : Bool -> Attribute msg

view : List (Attribute msg) -> { foo : String } -> Html msg
```

As you can notice it's impossible to call the `view` function without passing `foo`.

### `accessor` vs `set` vs property

These decorators can be applied to auto-accessors, setters and plain properties:

```ts
@component("my-example")
class MyExample extends CustomElement<{}> {
  @required
  accessor foo: string;

  @required
  set bar(value: string) {
    // do something
  }

  @required
  baz: string;
}
```

We recommend using the `accessor` keyword, since this opts into a nice reactive lifecycle of using the `update` function of the component.

Using the `accessor` is broadly equivalent to:

```ts
@component("my-example")
class MyExample extends CustomElement<{}> {
  #myValue: string = "something";

  get myValue(): string {
    return this.#myValue;
  }

  @required
  set myValue(value: string) {
    this.#myValue = value;
    this.scheduleUpdate();
  }
}
```

This allows you to then react (in a debounced way) to attributes being changed by the Elm runtime and re-rendering the UI all at once,
rather than piece-meal as one property is updated at a time.

> [!WARNING]
> Setters and plain properties won't automatically schedule an update for you. With setters you can schedule an update manually, but with plain properties there is no way to react to the property being set.

### `@lazy`

Finally there is a `@lazy` decorator which generates the same signature as `@required`, but has different runtime semantics. It uses `Html.Lazy` under the hood to only set the property (and run the associated encoder) if the property changed (that is - it isn't reference equal to its previous value). This can be quite good if you have some very large/heavy properties as using this can save on re-rendering.

However, the mechanism used to power `@lazy` itself has some overhead, so it is worth testing if the performance benefits are worth it.

## Classes and type-level configuration

### `CustomElement`

Another important part is extending `CustomElement`. `CustomElement` itself extends `HTMLElement`, so all the familiar APIs there are available, but it adds a couple of (optional) niceties at runtime.

### Lifecycle hooks

`CustomElement` defines the following hooks that you may override:

- `init` is called when the element is added to the DOM. (It is basically just like `connectedCallback`, but there is no need to call `super` and it's a bit shorter/clearer). Use it to do one time setup.

- `update` is called whenever any of the accessors changes (however, it will only be called once after multiple accessors change in a single task). It's useful for updating any UI the custom element is responsible for rendering.

- `tearDown` is called on removal from the DOM. Again it is basically an alias for `disconnectedCallback`.

These are all completely optional, and you don't need to implement them, but you can for instance use them to make your own wrapper for integrating with say React:

```typescript
import { createRoot, type Root, type ReactNode } from "react-dom/client";

export abstract class ReactCustomElement<T> extends CustomElement<T> {
  #root : Root;

  init() {
    this.#root = createRoot(this);
  }

  update(){
    this.#root.render(this.render());
  }

  abstract render() : ReactNode : {}

  tearDown() {
    this.#root.unmount();
  }
}
```

Using it then would be very easy:

```tsx
import React from "react";
import { ReactCustomElement } from "./react-custom-element";
import { component, required, optional } from "elm-webcomponents";

@component("example-react")
class MyComponent extends ReactCustomElement<{}> {
  @required
  accessor someInput: string;

  @optiona
  accessor someOtherInput: boolean;

  render() {
    return (
      <div className={this.someInput}>
        {this.someOtherInput ? <span>Hey!</span> : <b>Hello</b>}
      </div>
    );
  }
}
```

### Type-level configuration

For code generation, the most important feature is its type argument. The type argument contains a good amount of configuration, but the nice thing about having it as a type argument is that it will be **completely erased** during compilation and won't be shipped to the client at all.

Let's look at the fields:

```typescript
type Config = {
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

  /**
   * If the element has no optional attributes/events, set this to false to avoid generating a list of attributes.
   * This will prevent adding class/id attributes to the element.
   * */
  extraAttributes?: boolean;
};
```

### Event handling

For code generation the type parameter has two fields: `requiredEvents` and `optionalEvents`. Both of these are an object mapping the event name (as a string literal type) to a type containing event data.

The difference between them is only that the generated Elm code will enforce that `requiredEvents` are handled, but will generate optional helper functions for the `optionalEvents`.

One of the runtime niceties we provide is `this.triggerEvent(eventName, eventDetails)` function. It's a pretty shallow wrapper around `this.dispathEvent(new CustomEvent(eventName, eventDetails))`, but with the nice property that it enforces that the event name and event details are correctly encoded in either `requiredEvents` or `optionalEvents`.

### Code generation customization

`viewFnName` takes a string literal and allows you to specify what the function that makes the element on the elm side is going to be called. If not specified, it defaults to `"view"`.

`extraAttributes` is only relevant if you don't have any optional attributes or event handlers. In such a case the generated function will still take a `List (Html.Attribute msg)` allowing you to add things like `id` or `class` or other useful attributes. If you don't need that and rather have a simpler API, then passing the literal `false` here will skip generating that argument.

### Child DOM Nodes

HTML elements can also accept child DOM Nodes as part of their input. The `htmlContent` attribute configures how this behaves.

- `"none"` is the default value and will not generate an argument for HTML nodes.
- `"single"` generates a final argument of the type `Html msg` which will be the only child node
- `"list"` generates a final argument of the type `List (Html msg)` which will be the children. This is most like the behavior of elements in elm/html.
- The final option is an object where each key corresponds to a **slot**. Since we can't attach attributes to existing Elm HTML, we wrap the arguments in a `div` by default, but this can be customized by using the `tag` key. The `mode` key (the values `single` and `list` behave as above) customises the type.

```ts
@component("example-component")
class ExampleComponent extends IsolatedComponent<{
  htmlContent: {
    content: { mode: "single"; tag: "div" };
    someList: { mode: "list"; tag: "ul" };
  };
}> {
  // ...
}
```

would generate the following Elm:

```elm
module ExampleComponent exposing (view)

import Html exposing (Attribute, Html)
import Html.Attributes

view : List (Attribute msg) -> { content : Html msg, someList : List (Html msg) } -> Html msg
view attrs req =
    Html.node "example-component"
        attrs
        [ Html.div [ Html.Attributes.attribute "slot" "content" ] [ req.content ]
        , Html.ul [ Html.Attributes.attribute "slot" "someList" ] req.someList
        ]
```

However, slots are only really useful when combined with the Shadow DOM. Using it with Shadow DOM allows you to quite freely mix
a DOM tree managed by Elm with a DOM tree managed by your custom element.

## Shadow DOM and `IsolatedCustomElement`

The final piece of the puzzle this library provides is a subclass of `CustomElement` called `IsolatedCustomElement`,
which works roughly the same but manages a shadow DOM root for you, passing it as an argument to `update` or it being accessible as `this.root`.

### Problems of Shadow DOM and Style Piercing

One of the reasons Shadow DOM is awkward in Elm is that using the Shadow DOM opts you into style isolation, meaning that the DOM
inside the custom element won't have access to the classes you define inside your application. This makes using design systems
or things like Tailwind quite awkward. However, `IsolatedCustomElement` has a nice and performant solution for this problem:

> !NOTE
> The following works in Vite, might need some adjustment in other bundlers:

In `index.ts` instead of the following:

```diff ts
- import 'index.css';
+ import './style';
```

add the following file `style.ts`:

```ts
import styles from "./index.css?inline";

const style = new CSSStyleSheet();
style.replaceSync(styles);
document.adoptedStyleSheets = [style];
export default style;
```

This will cause your stylesheet to be included in your JS bundle instead of a separate CSS file, but it gives a _Constructed StyleSheet_,
which allows nice CSS sharing with Shadow DOM.

Then you can declare your component like so:

```ts
import { component, IsolatedComponent } from "elm-webcomponents";
import style from "./style";

@component("example-component")
class ExampleComponent extends IsolatedComponent<{
  htmlContent: {
    content: { mode: "single"; tag: "div" };
    someList: { mode: "list"; tag: "ul" };
  };
}> {
  adoptedStyles = [style];

  render() {
    this.root.innerHTML = `<div>
      <p>The component can render it's own DOM</p>
      <slot name="content">Your elm content will be inserted inside here!</slot>
      <p>You can have more than one:</p>
      <slot name="someList">interleaved with each other</slot>
    </div>`;
  }
}
```

The `adoptedStyles` property is key, as this will efficiently allow every style declared in your stylesheet to be accessed from inside the Shadow DOM.

## Compatibility

### TypeScript

This library relies on the current experimental TypeScript implementation of the decorator syntax, so you \*_must not_ have `experimentalDecorators` enabled in your `tsconfing.json`. We recommend having `target: "es2015"` or later set as well.

### Web platform

Most of the web component APIs are well supported cross browser. `adoptedStyles` relies on features that are slightly less prevalent, but still about 93% of web users as of writing. Some polyfills may be available.

### TypeScript -> Elm

This codebase works by translating a subset of TypeScript types into Elm types/encoders/decoders.

We don't currently support any form of encoding for custom types on the Elm side, meaning type unions in TypeScript won't work.

We plan to address this in the future. Some more advanced TS type shenanigans will also not work, such as Indexed types and similar. The best supported are things where there is a clear correspondence between Elm and TypeScript types.

Finally, `number` is encoded in Elm as `Float`. At the moment there is no way to encode `Int`, but we also plan to investigate ways to deal with this deficiency.

### Status

This is beta software. Please report issues as you encounter them.
