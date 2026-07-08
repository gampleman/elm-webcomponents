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

/**
 * The dimensions of the element being observed.
 */
interface Box {
  width: number;
  height: number;
}

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
        }, this.debounce);
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
module SizeObserver exposing (container, debounce, Box)

{-| Observes an element and triggers events whenever the contents size changes.

@docs container, debounce, Box

-}

import Html exposing (Attribute, Html)
import Html.Attributes
import Html.Events
import Json.Decode as Decode
import Json.Encode as Encode


{-| The dimensions of the element being observed.
-}
type alias Box =
    { width : Float, height : Float }


{-| Number of milliseconds to debounce.
-}
debounce : Float -> Attribute msg
debounce val =
    Html.Attributes.property "debounce" (Encode.float val)


{-| -}
container : List (Attribute msg) -> { onSizeChange : Box -> msg } -> Html msg -> Html msg
container attrs req child =
    Html.node "size-observer"
        (Html.Events.on "sizeChange"
            (Decode.map req.onSizeChange
                (Decode.succeed (\width height -> { width = width, height = height })
                    |> Decode.map2 (|>) (Decode.field "width" Decode.float)
                    |> Decode.map2 (|>) (Decode.field "height" Decode.float)
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
  accessor foo!: string;

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
  accessor foo!: string;

  @required
  set bar(value: string) {
    // do something
  }

  @required
  baz!: string;
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
  accessor someInput!: string;

  @optional
  accessor someOtherInput: boolean = false;

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

## Setup

Getting this working in a real project involves three pieces: installing the package, wiring up code generation, and making your bundler and Elm compiler aware of the generated files. There is also one important bundler gotcha covered at the end.

### 1. Install

```sh
npm install elm-webcomponents
```

The package ships both a runtime (the `CustomElement`/`IsolatedCustomElement` base classes and decorators, which _are_ bundled into your client) and a CLI (`elm-webcomponents`, used only at build time for code generation).

### 2. Author your components

Put your annotated component files somewhere your bundler will include them (e.g. import them from your entry point so they get registered). We recommend keeping them in a dedicated directory — say `src/components/` — because the code generator globs over them.

### 3. Wire up code generation

Run the CLI over your component files, pointing `-o` at an output directory for the generated Elm:

```sh
elm-webcomponents -o generated/elm src/components/*.ts
```

The generated modules are meant to be committed-or-regenerated, not hand-edited. It's convenient to run this as part of your existing codegen step, and to format the output afterwards:

```jsonc
// package.json
{
  "scripts": {
    "codegen": "elm-webcomponents -o generated/elm src/components/*.ts && elm-format generated/elm --yes",
  },
}
```

### 4. Tell Elm about the generated modules

By default the generated modules use **flat module names** (e.g. `SizeObserver`, not `Components.SizeObserver`). Elm requires a module's name to match its path _relative to a source directory_, so the output directory must itself be a source directory. Add it to your `elm.json`:

```jsonc
// elm.json
{
  "source-directories": [
    "src",
    "generated/elm", // <- the -o directory from step 3
  ],
}
```

If you'd rather namespace the generated modules under an existing source directory, pass `--module-prefix` (short `-p`). For example, `elm-webcomponents -o src --module-prefix Components src/components/*.ts` emits `module Components.SizeObserver` into `src/Components/SizeObserver.elm`, so no extra source directory is needed — just make sure the prefix directory sits inside one you already list.

If you use `elm-review`, you'll also want to exclude the generated directory, since the output isn't meant to satisfy every lint (e.g. it may import `Json.Encode` even for a component that only has events):

```elm
-- review/src/ReviewConfig.elm
config =
    [ {- your rules -} ]
        |> List.map (Review.Rule.ignoreErrorsForDirectories [ "generated/elm" ])
```

### 5. Make your bundler transform the decorators

This library uses **standard (TC39) decorators** and the `accessor` keyword. Your bundler must down-level these to something browsers run today — and **not every bundler does**. Two things to watch for:

- **TypeScript config:** you _must not_ enable `experimentalDecorators` (that opts into the old, incompatible decorator semantics). Leave it off. See the [Compatibility](#typescript) section below.
- **The bundler's transformer:** some transformers pass standard decorators through untouched, which then throw in the browser.

`esbuild` (and therefore the default Vite pipeline in most setups) lowers standard decorators correctly when targeting `es2022` or similar — nothing extra is needed there.

> [!WARNING]
> **Vite 8 / Rolldown and `@vitejs/plugin-react` use `oxc`, which (as of writing) does _not_ lower standard decorators** — it only supports the legacy flavor. If your components render but you see raw `@component(...)`/`accessor` in the served/built output, or a `SyntaxError` in the browser, this is why. Setting `esbuild.target` in your Vite config does _not_ help, because `oxc`/`plugin-react` handles `.ts` before esbuild ever runs.
>
> The fix is a small `enforce: "pre"` plugin that runs `esbuild` on your component files _before_ the oxc transform sees them:
>
> ```ts
> // vite.config.ts
> import { transform } from "esbuild";
>
> const ewcDecorators = () => ({
>   name: "ewc-decorators",
>   enforce: "pre" as const,
>   async transform(code: string, id: string) {
>     // scope this to wherever your annotated components live
>     if (!/\/components\/.*\.ts$/.test(id)) return null;
>     const result = await transform(code, {
>       loader: "ts",
>       target: "es2022",
>       sourcefile: id,
>       sourcemap: true,
>     });
>     return { code: result.code, map: result.map };
>   },
> });
>
> export default defineConfig({
>   plugins: [ewcDecorators() /* , react(), ... */],
> });
> ```
>
> Keep the file filter tight (only your component directory) so you don't double-transform the rest of your app.

### 6. Register and use

Import your component files from your entry point so the `@component` decorator runs and registers the custom elements:

```ts
// index.ts
import "./components/size-observer";
```

Then use the generated Elm module as shown throughout this README. If you use the [Shadow DOM style-piercing](#problems-of-shadow-dom-and-style-piercing) approach, also make sure your stylesheet is imported as a constructed stylesheet as described there.

## Compatibility

### TypeScript

This library relies on the current experimental TypeScript implementation of the decorator syntax, so you \*_must not_ have `experimentalDecorators` enabled in your `tsconfing.json`. We recommend having `target: "es2015"` or later set as well.

### Web platform

Most of the web component APIs are well supported cross browser. `adoptedStyles` relies on features that are slightly less prevalent, but still about 93% of web users as of writing. Some polyfills may be available.

### TypeScript -> Elm

This codebase works by translating a subset of TypeScript types into Elm types/encoders/decoders.

Some TypeScript objects can't meaningfully interop with Elm. Generally this means anything that isn't fundamentally composed of primitives, arrays and POJOs (Plain Old JavaScript Object). Think JSON data model. This means that _Classes_ are not supported, nor any built-in classes such as `RegExp` or `Date`, neither with any _Functions_ work, nor any more exotic objects such as `Float32Array` or `Promise`.

This is a pretty fundamental limitation of how Elm works, so this is unlikely to change in the future. The following limitations are more temporary, due to implementation difficulty (but we intend to get these to work eventually, albeit perhaps with limitations of their own):

Union types are supported with the following limitations:

- They must be declared inside a `type` alias; anonymous unions are not supported (as we'd need a name for them in Elm).

  Therefore the following won't work:

  ```ts
  type shape = {
    name: string;
    kind: "square" | "triangle";
  };
  ```

  but the following will:

  ```ts
  type shape =
    | {
        name: string;
        kind: "square";
      }
    | {
        name: string;
        kind: "triangle";
      };
  ```

  even though in some sense they are the identical type in TS and will generate in Elm:

  ```elm
  type Shape
      = Square { name : String }
      | Triangle { name : String }
  ```

- Each member of the union must be either a _string literal type_ or an object type with exactly one string literal property.

  Therefore,

  ```ts
  type Color = "red" | "green" | "blue" | { tag: "Custom"; rgb: string };
  ```

  will work, but

  ```ts
  type Broken = 3 | { tag: "foo"; type: "foo" } | string;
  ```

  won't.

- There is special case support for `undefined | someType`, which will be translated to `Maybe SomeType`. For this to work, you will need `strictNullChecks` enabled in your tsconfig.

Intersections of object types are merged into a single flat Elm record — e.g. `{ a: string } & { b: number }` becomes `{ a : String, b : Float }`. Only object intersections work; intersecting with non-object types, or members with overlapping keys, is not handled.

String-keyed dictionaries are supported: a `Record<string, X>` or an index signature `{ [key: string]: X }` is translated to an Elm `Dict String X` (with the corresponding `Json.Encode`/`Json.Decode` code). This only applies when the type has no named properties as well, since Elm dictionaries are homogeneous.

Enums are supported and become an Elm custom type with one constructor per member (e.g. `enum Color { Red = "red", Green = "green" }` becomes `type Color = Red | Green`). String enums are encoded/decoded by their string value; numeric enums by their numeric value.

Tuples are supported for 2 and 3 elements (e.g. `[string, number]` becomes `( String, Float )`), encoded as a positional JSON array. Elm has no tuples with 4 or more elements, so those are rejected — use a record instead.

Named template literal types with a single `string` or `number` placeholder (e.g. `type ItemId = \`item-${string}\``) map to an opaque Elm type with a `Maybe`-returning smart constructor that validates the pattern when used as a property (outbound), and to a plain `String` when received in an event (inbound), since an opaque value you can't unwrap would be useless there.

By default `number` is encoded in Elm as `Float`. To generate an Elm `Int` instead, use the exported `Int` type, which is a branded `number` — it is `number` at runtime and in arithmetic, but the generator detects the brand and emits `Int` with `Encode.int` / `Decode.int`:

```ts
import { Int } from "elm-webcomponents";

@component("counter-element")
class Counter extends CustomElement<{}> {
  @required
  accessor count!: Int;

  @required
  accessor size!: { width: Int; height: Int };
}
```

Because TypeScript has no distinct integer type, assigning a numeric literal to an `Int` may require a cast, e.g. `this.count = 5 as Int`. The `Int` brand is detected structurally, so it works anywhere a number can appear — nested in records, arrays, tuples, `Dict` values, and so on.

### Custom Elm types

`Int` is really a special case of a general mechanism: you can map any TypeScript type to an Elm type of your choosing with the `ElmType` brand. This lets you plug in Elm types the generator doesn't know about (e.g. `Time.Posix`). You supply the Elm type name, a decoder, an encoder, and the modules the snippets need:

```ts
import { ElmType, component, required, CustomElement } from "elm-webcomponents";

type Posix = ElmType<
  number, // the underlying (runtime) TypeScript type
  "Time.Posix", // the Elm type expression
  "Decode.map Time.millisToPosix Decode.int", // a complete `Decoder Time.Posix`
  "\\p -> Encode.int (Time.posixToMillis p)", // a `Time.Posix -> Encode.Value` function
  ["Time"] // modules the snippets reference
>;

@component("clock-element")
class Clock extends CustomElement<{ requiredEvents: { fire: { at: Posix } } }> {
  @required
  accessor start!: Posix;
}
```

Generates a module that `import Time`, types `start` as `Time.Posix`, encodes it with your function, and decodes the event payload with your decoder. Like `Int`, the brand is a runtime-transparent version of the underlying type (here `number`), is detected structurally so it works when nested, and its imports are collected and deduplicated across the module. Contract details:

- The **decoder** must be a complete `Json.Decode.Decoder` expression for your Elm type (it is emitted verbatim). It's optional — omit it (or pass `""`) for a type that only flows _out_ of Elm (a property). Using such a type in an event payload is then a generation error.
- The **encoder** must be a function from your Elm type to `Json.Encode.Value` (the generator applies it to the value). It's optional in the same way, for a type that only flows _into_ Elm (an event).
- The **modules** field is a tuple of fully-qualified Elm module names (e.g. `["Time"]`); the generator emits `import <Module>` for each, so they're always imported unqualified (avoiding conflicting-alias problems between usages). `Json.Decode as Decode` and `Json.Encode as Encode` are always in scope. Omit the field (`[]`) if no extra modules are needed.

### Status

This is beta software. Please report issues as you encounter them.
