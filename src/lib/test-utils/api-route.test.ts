import { test, expect } from "vitest";
import { buildPostRequest, buildAuthUser } from "./api-route";

test("buildPostRequest exposes json() returning the original body", async () => {
  const req = buildPostRequest({ body: { foo: 1 } });
  expect(await req.json()).toEqual({ foo: 1 });
});

test("buildPostRequest exposes nextUrl.searchParams", () => {
  const req = buildPostRequest({ body: {}, url: "http://localhost/api/x?a=1" });
  expect(req.nextUrl.searchParams.get("a")).toBe("1");
});

test("buildAuthUser returns a user with default fields", () => {
  const user = buildAuthUser();
  expect(user.id).toBe("user-1");
  expect(user.email).toBe("test@example.com");
});

test("buildAuthUser applies overrides", () => {
  const user = buildAuthUser({ id: "custom-id", email: "custom@example.com" });
  expect(user.id).toBe("custom-id");
  expect(user.email).toBe("custom@example.com");
});
