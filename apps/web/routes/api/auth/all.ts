import { fromWebHandler } from "nitro/h3";
import { auth } from "../../../src/server/auth.server.ts";

/**
 * `/api/auth/**` — Better Auth's HTTP surface (sign-up/in/out, session,
 * organization + invitation endpoints). Better Auth speaks web
 * Request/Response, so the Nitro event is adapted via `fromWebHandler`.
 */
export default fromWebHandler((request) => auth.handler(request));
