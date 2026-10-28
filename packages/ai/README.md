# @ggraphic/ai

Optional AI helpers for ggraphic. Licensed under the [Mozilla Public License 2.0](./LICENSE).

The package is pure: it builds prompts and JSON schemas and validates what a model answers, but it never talks to a network. The host injects a `CallObject` that does one model round trip per attempt.

`pickAndFill` lets a model choose one of the offered templates and colour worlds for a brief and fill the template's text slots. The model can only answer with ids it was shown; anything else is an error that the host's repair turn quotes back to it.
