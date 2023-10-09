import electron from "electron";
import { Hono } from "hono";
import { createServer } from "node:https";
import { handleApp } from "./build/handler.js";
import { serve } from "@hono/node-server";
import { createCA, createCert } from "mkcert";

const { BrowserWindow, app: electronApp } = electron;
const app = new Hono();
const ca = await createCA({
  organization: "markerd",
  countryCode: "JP",
  locality: "Chiyoda",
  state: "Tokyo",
  validity: 0,
});
const cert = await createCert({
  ca: { key: ca.key, cert: ca.cert },
  domains: ["localhost"],
  validity: 0,
});
const win = new BrowserWindow({
  width: 800,
  height: 600,
});
let port = 0;

handleApp(app);

electronApp.on(
  "certificate-error",
  (event, _, u, __, certificate, callback) => {
    const url = new URL(u);

    if (
      certificate.validExpiry === certificate.validStart &&
      url.hostname === "localhost" &&
      parseInt(url.port) === port
    ) {
      event.preventDefault();
      callback(true);
    } else {
      callback(false);
    }
  }
);

for (let i = 50000; i < 65535; i++) {
  port = await listen(i);
  if (port) break;
}

win.loadURL("https://localhost:" + port);

function listen(port: number): Promise<number> {
  return new Promise((resolve) => {
    try {
      serve(
        {
          fetch: app.fetch,
          createServer,
          port,
          serverOptions: { key: cert.key, cert: cert.cert },
        },
        (info) => resolve(info.port)
      );
    } catch {
      resolve(0);
    }
  });
}
