# Builtin natives

Plain functions. One default export per file. The registry keys each by `fn.name`.

```js
export default function detect(type, list) { ... }
```

Param names are inferred from the signature (`paramsOf`). Optional JSDoc labels the UI later.

Community / downloaded natives live in `~/.emmi/natives/` and run sandboxed.
