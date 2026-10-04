// "npm run dev" runs the whole atlas with no Vercel account: Vite serves the
// site, and the small plugin below serves /api/* by calling the same handler
// files that Vercel runs in production.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// Vercel hands a handler req.query, a parsed req.body, res.status() and
// res.json(). This gives it the same.
async function prepare(req, res, url) {
  const query = {};
  for (const [key, value] of url.searchParams) {
    if (key in query) query[key] = [].concat(query[key], value);
    else query[key] = value;
  }
  req.query = query;

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    const type = req.headers['content-type'] || '';
    if (!text) req.body = undefined;
    else if (type.includes('application/json')) {
      try {
        req.body = JSON.parse(text);
      } catch {
        // Leave the raw text; the handler answers 400.
        req.body = text;
      }
    } else req.body = text;
  }

  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = body => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = body => {
    if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
    res.end(body);
    return res;
  };
}

function atlasApi() {
  // `load` returns the handler module for a route file.
  const serve = load => async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return next();
    const name = url.pathname.slice('/api/'.length).replace(/\/$/, '');
    const file = path.join(root, 'api', `${name}.js`);
    // Only the route files themselves: nothing under _lib or _fixtures.
    if (!/^[a-z0-9-]+$/.test(name) || !existsSync(file)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: `The atlas server has no route ${url.pathname}.` }));
      return;
    }
    try {
      await prepare(req, res, url);
      const module = await load(name, file);
      await module.default(req, res);
    } catch (error) {
      console.error(`${req.method} ${req.url} failed:`, error);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'The atlas could not answer just now. Try again in a moment.' }));
      }
    }
  };

  return {
    name: 'rare-atlas-api',

    // Server-side settings (the OpenAI key, the Firebase project) come from
    // .env.local. They go into this process only; Vite still exposes nothing
    // to the page unless its name starts with VITE_. A value already set in
    // the shell wins, even an empty one.
    config(_, { mode }) {
      const env = loadEnv(mode, root, '');
      for (const [key, value] of Object.entries(env)) {
        if (!(key in process.env)) process.env[key] = value;
      }
    },

    // In dev the handlers load through Vite, so editing one takes effect on
    // the next request without a restart.
    configureServer(server) {
      server.middlewares.use(serve(name => server.ssrLoadModule(`/api/${name}.js`)));
    },

    // "npm run preview" serves the built site with the same routes.
    configurePreviewServer(server) {
      server.middlewares.use(serve((_, file) => import(pathToFileURL(file).href)));
    },
  };
}

export default defineConfig({
  plugins: [atlasApi()],
});
