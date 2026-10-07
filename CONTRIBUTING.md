# Contributing to Studio

Start with the [source setup](README.md#try-studio). Small, useful widgets and clear bug reports are welcome.

For a bug, include the browser, Claude version if relevant, expected behavior and what happened. A minimal project JSON helps reproduce issues; remove private text before attaching it. For a new widget, describe the daily problem it solves and which Claude event supplies its data.

## Making a change

- Keep widget behavior in `packages/studio/src/runtime.js` so preview and export share the same logic. This module must remain independent of browser and Claude APIs.
- Validate user input at the project boundary. Labels are data; do not interpolate them into executable source or HTML.
- Put host integration in the static `register.js` template. Preserve the underlying UI, yield in constrained layouts, and distinguish unknown measurements from zero.
- Add focused tests for behavior that could lose a project, corrupt an export, or misrepresent session state. Use Claude's native harness when changing hook behavior.
- Keep the editor usable without accounts, keys or a server. Discuss network or filesystem capabilities before adding them.
- Run `pnpm check`, `pnpm build` and `pnpm test:studio:native`. Check affected browser flows on desktop and a narrow viewport.

See [the Studio guide](docs/studio.md) for boundaries and test instructions. Changes to registry listings follow the separate [submission guide](docs/contributing.md).

Contributions are licensed under MIT, matching the repository.
