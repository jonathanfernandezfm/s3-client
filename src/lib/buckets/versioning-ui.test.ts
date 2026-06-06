import { describe, expect, test } from "vitest";
import { getVersioningControl } from "./versioning-ui";

describe("getVersioningControl", () => {
  test("offers suspend for editable enabled buckets", () => {
    expect(getVersioningControl("Enabled", true, false)).toEqual({
      label: "Suspend",
      enabled: false,
      disabled: false,
    });
  });

  test("offers enable for editable disabled or suspended buckets", () => {
    expect(getVersioningControl("Disabled", true, false)).toMatchObject({
      label: "Enable",
      enabled: true,
      disabled: false,
    });
    expect(getVersioningControl("Suspended", true, false)).toMatchObject({
      label: "Enable",
      enabled: true,
      disabled: false,
    });
  });

  test("omits the action for read-only users", () => {
    expect(getVersioningControl("Enabled", false, false)).toBeNull();
  });
});
