import { it, expect, describe } from "vitest";
import {
  type GraffitiFactory,
  type GraffitiSessionBase,
  type GraffitiPatch,
  GraffitiErrorNotFound,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorInvalidSchema,
  GraffitiErrorForbidden,
  GraffitiErrorPatchTestFailed,
  GraffitiErrorPatchError,
} from "../src/index";

export const graffitiCRUDTests = (
  useGraffiti: GraffitiFactory,
  useSession1: () => GraffitiSessionBase,
  useSession2: () => GraffitiSessionBase,
) => {
  describe("CRUD", () => {
    it("put, get, delete", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();
      const value = {
        something: "hello, world~ c:",
      };
      const channels = ["world"];

      // Put the object
      const previous = await graffiti.put({ value, channels }, session);
      expect(previous.value).toEqual({});
      expect(previous.channels).toEqual([]);
      expect(previous.allowed).toBeUndefined();
      expect(previous.actor).toEqual(session.actor);

      // Get it back
      const gotten = await graffiti.get(previous, {});
      expect(gotten.value).toEqual(value);
      expect(gotten.channels).toEqual([]);
      expect(gotten.allowed).toBeUndefined();
      expect(gotten.name).toEqual(previous.name);
      expect(gotten.actor).toEqual(previous.actor);
      expect(gotten.source).toEqual(previous.source);
      expect(gotten.lastModified.getTime()).toEqual(
        previous.lastModified.getTime(),
      );

      // Replace it
      const newValue = {
        something: "goodbye, world~ :c",
      };
      const beforeReplaced = await graffiti.put(
        { ...previous, value: newValue, channels: [] },
        session,
      );
      expect(beforeReplaced.value).toEqual(value);
      expect(beforeReplaced.tombstone).toEqual(true);
      expect(beforeReplaced.name).toEqual(previous.name);
      expect(beforeReplaced.actor).toEqual(previous.actor);
      expect(beforeReplaced.source).toEqual(previous.source);
      expect(beforeReplaced.lastModified.getTime()).toBeGreaterThan(
        gotten.lastModified.getTime(),
      );

      // Get it again
      const afterReplaced = await graffiti.get(previous, {});
      expect(afterReplaced.value).toEqual(newValue);
      expect(afterReplaced.lastModified.getTime()).toEqual(
        beforeReplaced.lastModified.getTime(),
      );
      expect(afterReplaced.tombstone).toEqual(false);

      // Delete it
      const beforeDeleted = await graffiti.delete(afterReplaced, session);
      expect(beforeDeleted.tombstone).toEqual(true);
      expect(beforeDeleted.value).toEqual(newValue);
      expect(beforeDeleted.lastModified.getTime()).toBeGreaterThan(
        beforeReplaced.lastModified.getTime(),
      );

      // Try to get it and fail
      await expect(graffiti.get(afterReplaced, {})).rejects.toThrow(
        GraffitiErrorNotFound,
      );
    });

    it("put, get, delete with wrong actor", async () => {
      const graffiti = useGraffiti();
      const session1 = useSession1();
      const session2 = useSession2();

      await expect(
        graffiti.put(
          { value: {}, channels: [], actor: session2.actor },
          session1,
        ),
      ).rejects.toThrow(GraffitiErrorForbidden);

      await expect(
        graffiti.delete(
          {
            name: "asdf",
            source: "asdf",
            actor: session2.actor,
          },
          session1,
        ),
      ).rejects.toThrow(GraffitiErrorForbidden);

      await expect(
        graffiti.patch(
          {},
          {
            name: "asdf",
            source: "asdf",
            actor: session2.actor,
          },
          session1,
        ),
      ).rejects.toThrow(GraffitiErrorForbidden);
    });

    it("put and get with schema", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const schema = {
        properties: {
          value: {
            properties: {
              something: {
                type: "string",
              },
              another: {
                type: "integer",
              },
            },
          },
        },
      } as const;

      const goodValue = {
        something: "hello",
        another: 42,
      } as const;

      const putted = await graffiti.put<typeof schema>(
        {
          value: goodValue,
          channels: [],
        },
        session,
      );

      const gotten = await graffiti.get(putted, schema);
      expect(gotten.value.something).toEqual(goodValue.something);
      expect(gotten.value.another).toEqual(goodValue.another);
    });

    it("put and get with invalid schema", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const putted = await graffiti.put({ value: {}, channels: [] }, session);
      await expect(
        graffiti.get(putted, {
          properties: {
            value: {
              //@ts-ignore
              type: "asdf",
            },
          },
        }),
      ).rejects.toThrow(GraffitiErrorInvalidSchema);
    });

    it("put and get with wrong schema", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const putted = await graffiti.put(
        {
          value: {
            hello: "world",
          },
          channels: [],
        },
        session,
      );

      await expect(
        graffiti.get(putted, {
          properties: {
            value: {
              properties: {
                hello: {
                  type: "number",
                },
              },
            },
          },
        }),
      ).rejects.toThrow(GraffitiErrorSchemaMismatch);
    });

    it("put and get with empty access control", async () => {
      const graffiti = useGraffiti();
      const session1 = useSession1();
      const session2 = useSession2();

      const value = {
        um: "hi",
      };
      const allowed = ["asdf"];
      const channels = ["helloooo"];
      const putted = await graffiti.put({ value, allowed, channels }, session1);

      // Get it with authenticated session
      const gotten = await graffiti.get(putted, {}, session1);
      expect(gotten.value).toEqual(value);
      expect(gotten.allowed).toEqual(allowed);
      expect(gotten.channels).toEqual(channels);

      // But not without session
      await expect(graffiti.get(putted, {})).rejects.toThrow();

      // Or the wrong session
      await expect(graffiti.get(putted, {}, session2)).rejects.toThrow();
    });

    it("put and get with specific access control", async () => {
      const graffiti = useGraffiti();
      const session1 = useSession1();
      const session2 = useSession2();

      const value = {
        um: "hi",
      };
      const allowed = ["asdf", session2.actor, "1234"];
      const channels = ["helloooo"];
      const putted = await graffiti.put(
        {
          value,
          allowed,
          channels,
        },
        session1,
      );

      // Get it with authenticated session
      const gotten = await graffiti.get(putted, {}, session1);
      expect(gotten.value).toEqual(value);
      expect(gotten.allowed).toEqual(allowed);
      expect(gotten.channels).toEqual(channels);

      // But not without session
      await expect(graffiti.get(putted, {})).rejects.toThrow();

      const gotten2 = await graffiti.get(putted, {}, session2);
      expect(gotten2.value).toEqual(value);
      // They should only see that is is private to them
      expect(gotten2.allowed).toEqual([session2.actor]);
      // And not see any channels
      expect(gotten2.channels).toEqual([]);
    });

    it("patch value", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const value = {
        something: "hello, world~ c:",
      };
      const putted = await graffiti.put({ value, channels: [] }, session);

      const patch: GraffitiPatch = {
        value: [
          { op: "replace", path: "/something", value: "goodbye, world~ :c" },
        ],
      };
      const beforePatched = await graffiti.patch(patch, putted, session);
      expect(beforePatched.value).toEqual(value);
      expect(beforePatched.tombstone).toBe(true);

      const gotten = await graffiti.get(putted, {});
      expect(gotten.value).toEqual({
        something: "goodbye, world~ :c",
      });
      expect(beforePatched.lastModified.getTime()).toBe(
        gotten.lastModified.getTime(),
      );

      await graffiti.delete(putted, session);
    });

    it("deep patch", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const value = {
        something: {
          another: {
            somethingElse: "hello",
          },
        },
      };
      const putted = await graffiti.put(
        { value: value, channels: [] },
        session,
      );

      const beforePatch = await graffiti.patch(
        {
          value: [
            {
              op: "replace",
              path: "/something/another/somethingElse",
              value: "goodbye",
            },
          ],
        },
        putted,
        session,
      );
      const gotten = await graffiti.get(putted, {});

      expect(beforePatch.value).toEqual(value);
      expect(gotten.value).toEqual({
        something: {
          another: {
            somethingElse: "goodbye",
          },
        },
      });
    });

    it("patch channels", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const putted = await graffiti.put(
        { value: {}, channels: ["helloooo"] },
        session,
      );

      const patch: GraffitiPatch = {
        channels: [{ op: "replace", path: "/0", value: "goodbye" }],
      };
      await graffiti.patch(patch, putted, session);
      const gotten = await graffiti.get(putted, {}, session);
      expect(gotten.channels).toEqual(["goodbye"]);
      await graffiti.delete(putted, session);
    });

    it("patch 'increment' with test", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const putted = await graffiti.put(
        {
          value: {
            counter: 1,
          },
          channels: [],
        },
        session,
      );

      const previous = await graffiti.patch(
        {
          value: [
            { op: "test", path: "/counter", value: 1 },
            { op: "replace", path: "/counter", value: 2 },
          ],
        },
        putted,
        session,
      );
      expect(previous.value).toEqual({ counter: 1 });
      const result = await graffiti.get(previous, {
        properties: {
          value: {
            properties: {
              counter: {
                type: "integer",
              },
            },
          },
        },
      });
      expect(result.value.counter).toEqual(2);

      await expect(
        graffiti.patch(
          {
            value: [
              { op: "test", path: "/counter", value: 1 },
              { op: "replace", path: "/counter", value: 3 },
            ],
          },
          putted,
          session,
        ),
      ).rejects.toThrow(GraffitiErrorPatchTestFailed);
    });

    it("invalid patch", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();
      const putted = await graffiti.put(
        {
          value: {},
          channels: [],
        },
        session,
      );

      await expect(
        graffiti.patch(
          {
            value: [
              { op: "add", path: "/root", value: [] },
              { op: "add", path: "/root/2", value: 2 }, // out of bounds
            ],
          },
          putted,
          session,
        ),
      ).rejects.toThrow(GraffitiErrorPatchError);
    });

    it("patch channels to be wrong", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();
      const value = {
        original: "value",
      };
      const channels = ["original-channel"];
      const allowed = ["original-allowed"];
      const putted = await graffiti.put({ value, channels, allowed }, session);

      const patches: GraffitiPatch[] = [
        {
          channels: [{ op: "replace", path: "", value: null }],
        },
        {
          channels: [{ op: "replace", path: "", value: {} }],
        },
        {
          channels: [{ op: "replace", path: "", value: ["hello", ["hi"]] }],
        },
        {
          channels: [{ op: "add", path: "/0", value: 1 }],
        },
        {
          value: [{ op: "replace", path: "", value: "not an object" }],
        },
        {
          value: [{ op: "replace", path: "", value: null }],
        },
        {
          value: [{ op: "replace", path: "", value: [] }],
        },
        {
          allowed: [{ op: "replace", path: "", value: {} }],
        },
        {
          allowed: [{ op: "replace", path: "", value: ["hello", ["hi"]] }],
        },
      ];

      for (const patch of patches) {
        await expect(graffiti.patch(patch, putted, session)).rejects.toThrow(
          GraffitiErrorPatchError,
        );
      }

      const gotten = await graffiti.get(putted, {}, session);
      expect(gotten.value).toEqual(value);
      expect(gotten.channels).toEqual(channels);
      expect(gotten.allowed).toEqual(allowed);
      expect(gotten.lastModified.getTime()).toEqual(
        putted.lastModified.getTime(),
      );
    });
  });
};
