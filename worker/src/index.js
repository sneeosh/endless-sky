const BUCKET_PREFIX = "live/";

export default {
	async fetch(request, env) {
		if(request.method !== "GET" && request.method !== "HEAD")
			return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });

		const url = new URL(request.url);
		let path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
		if(path === "" || path.endsWith("/"))
			path += "index.html";
		const key = BUCKET_PREFIX + path;

		const range = parseRange(request.headers.get("range"));
		const ifNoneMatch = request.headers.get("if-none-match") ?? undefined;
		const object = await env.BUCKET.get(key, {
			onlyIf: ifNoneMatch ? { etagDoesNotMatch: ifNoneMatch } : undefined,
			range,
		});

		if(!object)
			return new Response("Not Found", { status: 404 });
		// `onlyIf` returns an R2Object (no body) when the precondition fails.
		if(!("body" in object))
			return new Response(null, { status: 304, headers: { etag: object.httpEtag } });

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set("etag", object.httpEtag);
		headers.set("accept-ranges", "bytes");
		if(range && object.range) {
			const { offset, length } = object.range;
			headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
			headers.set("content-length", String(length));
			return new Response(request.method === "HEAD" ? null : object.body, { status: 206, headers });
		}
		headers.set("content-length", String(object.size));
		return new Response(request.method === "HEAD" ? null : object.body, { headers });
	},
};

function parseRange(header) {
	if(!header) return undefined;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if(!match) return undefined;
	const start = match[1] === "" ? undefined : Number(match[1]);
	const end = match[2] === "" ? undefined : Number(match[2]);
	if(start === undefined && end === undefined) return undefined;
	if(start === undefined)
		return { suffix: end };
	if(end === undefined)
		return { offset: start };
	return { offset: start, length: end - start + 1 };
}
