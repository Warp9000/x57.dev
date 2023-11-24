
export interface Env {
    x57_bucket: R2Bucket;
    x57_db: KVNamespace;
}

export default {
    async fetch(
        request: Request,
        env: Env) {
        const url = new URL(request.url);

        switch (request.method) {
            case 'POST':
                let token = url.searchParams.get('token');
                if (token === null) {
                    console.log('no token');
                    return new Response('', { status: 401 });
                }

                let tokencsv = await env.x57_db.get('_tokens');
                if (tokencsv === null) {
                    console.log('no tokens');
                    return new Response('', { status: 500 });
                }

                let tokens = tokencsv.split(',');
                if (!tokens.includes(token)) {
                    console.log('bad token');
                    return new Response('', { status: 401 });
                }


                let rng = crypto.getRandomValues(new Uint8Array(4));
                let rngName = [...new Uint8Array(rng)]
                    .map((b) => b.toString(36).padStart(2, '0'))
                    .join('')
                    .substring(0, 4);

                await env.x57_bucket.put(rngName, request.body);

                let extension = '';
                if (url.searchParams.get('name') !== null) {
                    await env.x57_db.put(rngName, url.searchParams.get('name')!);
                    let split = url.searchParams.get('name')!.split('.');
                    if (split.length > 1) {
                        extension = '.' + split.slice(-1)[0];
                    }
                }

                return new Response(url.origin + '/' + rngName + extension, { status: 201 });

            case 'GET':
                let key = url.pathname.slice(1);
                let split = key.split('.');
                if (split.length > 1) {
                    key = split.slice(0, -1).join('.');
                }
                let object = await env.x57_bucket.get(key);

                if (object === null) {
                    return new Response('', { status: 404 });
                }

                let name = await env.x57_db.get(key);
                if (name === null) {
                    var mime = require('mime-types')
                    var ext = mime.extension(object?.httpMetadata?.contentType)
                    if (ext === false) {
                        name = key
                    }
                    else {
                        name = key + '.' + ext
                    }
                }

                let headers = new Headers();
                object.writeHttpMetadata(headers);
                headers.set('etag', object.httpEtag);
                headers.set('content-disposition', 'inline; filename="' + name + '"');

                return new Response(object.body, {
                    headers: headers,
                    status: 200,
                });

            default:
                return new Response(`${request.method} is not allowed.`, {
                    status: 405,
                    headers: {
                        Allow: 'POST, GET',
                    },
                });
        }
    },
};