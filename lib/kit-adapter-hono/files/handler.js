import "SHIMS";
import { serveStatic } from "@hono/node-server/serve-static";
import { getRequest } from "@sveltejs/kit/node";
import { Server } from "SERVER";
import { manifest } from "MANIFEST";
import { env } from "ENV";
import { existsSync } from "node:fs";

/* global ENV_PREFIX */

const server = new Server(manifest);
await server.init({ env: process.env });
const xff_depth = parseInt(env("XFF_DEPTH", "1"));
const address_header = env("ADDRESS_HEADER", "").toLowerCase();

const body_size_limit = parseInt(env("BODY_SIZE_LIMIT", "524288"));

const dir = "./build";
const staticList = ["client", "static", "prerendered"];

/** @type {import("hono").MiddlewareHandler} */
const ssr = async (c, next) => {
  if (staticList.some((x) => c.req.url.startsWith("/" + x))) return next();
  /** @type {Request | undefined} */
  let request;

  try {
    request = await getRequest({
      base: "",
      request: c.req,
      bodySizeLimit: body_size_limit,
    });
  } catch (err) {
    c.status(err.status || 400);
    return c.text("Invalid request body");
  }

  return await server.respond(request, {
    platform: { req: c.req },
    getClientAddress: () => {
      if (address_header) {
        if (!(address_header in req.headers)) {
          throw new Error(
            `Address header was specified with ${
              ENV_PREFIX + "ADDRESS_HEADER"
            }=${address_header} but is absent from request`
          );
        }

        const value = /** @type {string} */ (req.headers[address_header]) || "";

        if (address_header === "x-forwarded-for") {
          const addresses = value.split(",");

          if (xff_depth < 1) {
            throw new Error(
              `${ENV_PREFIX + "XFF_DEPTH"} must be a positive integer`
            );
          }

          if (xff_depth > addresses.length) {
            throw new Error(
              `${ENV_PREFIX + "XFF_DEPTH"} is ${xff_depth}, but only found ${
                addresses.length
              } addresses`
            );
          }
          return addresses[addresses.length - xff_depth].trim();
        }

        return value;
      }

      return (
        req.connection?.remoteAddress ||
        // @ts-expect-error
        req.connection?.socket?.remoteAddress ||
        req.socket?.remoteAddress ||
        // @ts-expect-error
        req.info?.remoteAddress
      );
    },
  });
};

/**
 *
 * @param {import("hono").Hono} app
 */
export const handleApp = (app) => {
  for (let staticDir of staticList) {
    if (existsSync(dir + "/" + staticDir)) {
      app.use("/*", serveStatic({ root: dir + "/" + staticDir + "/" }));
    }
  }

  app.use("*", ssr);
};
