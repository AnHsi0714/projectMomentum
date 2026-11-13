import { defineConfig, type Plugin } from 'vite';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

// 把紀錄存成專案裡的 data/momentum.json（dev 與 preview 都可用）
const DATA_FILE = path.resolve(__dirname, 'data', 'momentum.json');

type Next = () => void;

async function handler(req: IncomingMessage, res: ServerResponse, next: Next) {
  if (req.url?.split('?')[0] !== '/api/data') return next();
  try {
    if (req.method === 'GET') {
      const text = await fs.readFile(DATA_FILE, 'utf8').catch(() => '{}');
      res.setHeader('Content-Type', 'application/json');
      res.end(text);
    } else if (req.method === 'PUT') {
      let body = '';
      for await (const chunk of req) body += chunk;
      JSON.parse(body); // 驗證是合法 JSON
      await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
      const tmp = DATA_FILE + '.tmp';
      await fs.writeFile(tmp, body, 'utf8');
      await fs.rename(tmp, DATA_FILE); // 先寫暫存再改名，避免寫到一半損毀
      res.statusCode = 204;
      res.end();
    } else {
      res.statusCode = 405;
      res.end();
    }
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
}

function dataApi(): Plugin {
  return {
    name: 'momentum-data-api',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

export default defineConfig({ plugins: [dataApi()] });
