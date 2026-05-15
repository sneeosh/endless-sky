# endless-web Worker

Cloudflare Worker that fronts the `endless-web` R2 bucket and serves the web
build that `make deploy` (in the repo root Makefile) uploads.

The bucket layout is:

```
endless-web/
  live/
    index.html
    endless-sky-<hash>.js
    endless-sky-<hash>.wasm
    endless-sky-<hash>.data
    ...
```

The Worker maps `/<path>` to `live/<path>` and `/` to `live/index.html`. It
passes through the `cache-control` and `content-type` stored on the R2 object
(set by `aws s3 sync` during deploy), supports `Range` requests (needed for
the loading mp3), and honours `If-None-Match`.

## Deploy

Install wrangler once:

```sh
npm install -g wrangler
```

Authenticate and deploy:

```sh
cd worker
wrangler login          # or set CLOUDFLARE_API_TOKEN
wrangler deploy
```

Add a custom route in `wrangler.toml` (see commented block) before pointing a
real hostname at the Worker.
