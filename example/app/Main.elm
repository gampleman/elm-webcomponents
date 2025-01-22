module Main exposing (..)

import Browser
import ExampleComponent
import Html exposing (Html)
import Html.Attributes
import Html.Events


main : Program () Model Msg
main =
    Browser.document
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }


type alias Model =
    { a : { value : Float }
    , b : Float
    }


type Msg
    = IncA
    | IncB


init : () -> ( Model, Cmd Msg )
init _ =
    ( { a = { value = 0 }, b = 0 }, Cmd.none )


view : Model -> Browser.Document Msg
view model =
    { title = "test"
    , body =
        [ Html.div []
            [ Html.div []
                [ Html.button [ Html.Events.onClick IncA ] [ Html.text "inc a" ]
                , Html.text "a: "
                , Html.text (String.fromFloat model.a.value)
                ]
            , Html.div [ Html.Attributes.class "red" ]
                [ Html.button [ Html.Events.onClick IncB ] [ Html.text "inc b" ]
                , Html.text "b: "
                , Html.text (String.fromFloat model.b)
                ]
            , Html.text "webcomponent:"
            , ExampleComponent.view []
                { count = model.a
                , content =
                    Html.div []
                        [ Html.text "b: "
                        , Html.text (String.fromFloat model.b)
                        , Html.button [ Html.Events.onClick IncB ] [ Html.text "inner inc b" ]
                        ]
                }
            ]
        ]
    }


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        IncA ->
            ( { model | a = { value = model.a.value + 1 } }, Cmd.none )

        IncB ->
            ( { model | b = model.b + 1 }, Cmd.none )


subscriptions : Model -> Sub Msg
subscriptions _ =
    Sub.none
