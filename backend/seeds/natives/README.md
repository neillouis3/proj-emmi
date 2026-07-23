# Community natives (`~/.emmi/natives`)

One plain function per file. Export it as the default:

```js
/** @param {string} label */
export default function echo_label(label) {
  return label
}
```

The registry keys the function by `fn.name`. Param names are inferred from the signature.

These run in a Worker (sandboxed). Builtin natives live in `backend/natives/builtin/` and run in-process.
