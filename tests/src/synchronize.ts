import { it, expect, describe, assert } from "vitest";
import type { GraffitiFactory, GraffitiSession } from "@graffiti-garden/api";
import { randomPutObject, randomString } from "./utils";

export const graffitiSynchronizeTests = (
  useGraffiti: GraffitiFactory,
  useSession1: () => GraffitiSession,
  useSession2: () => GraffitiSession,
) => {
  describe("synchronizeDiscover", () => {
    it("get", async () => {
      const graffiti1 = useGraffiti();
      const session = useSession1();

      const object = randomPutObject();
      const channels = object.channels.slice(1);
      const putted = await graffiti1.put(object, session);

      const graffiti2 = useGraffiti();
      const next = graffiti2.synchronizeDiscover(channels, {}).next();
      const gotten = await graffiti2.get(putted, {}, session);

      const result = (await next).value;
      if (!result || result.error) {
        throw new Error("Error in synchronize");
      }
      expect(result.value.value).toEqual(object.value);
      expect(result.value.channels).toEqual(channels);
      expect(result.value.tombstone).toBe(false);
      expect(result.value.lastModified).toEqual(gotten.lastModified);
    });

    it("put", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const beforeChannel = randomString();
      const afterChannel = randomString();
      const sharedChannel = randomString();

      const oldValue = { hello: "world" };
      const oldChannels = [beforeChannel, sharedChannel];
      const putted = await graffiti.put(
        {
          value: oldValue,
          channels: oldChannels,
        },
        session,
      );

      // Start listening for changes...
      const before = graffiti.synchronizeDiscover([beforeChannel], {}).next();
      const after = graffiti.synchronizeDiscover([afterChannel], {}).next();
      const shared = graffiti.synchronizeDiscover([sharedChannel], {}).next();

      // Replace the object
      const newValue = { goodbye: "world" };
      const newChannels = [afterChannel, sharedChannel];
      await graffiti.put(
        {
          ...putted,
          value: newValue,
          channels: newChannels,
        },
        session,
      );

      const beforeResult = (await before).value;
      const afterResult = (await after).value;
      const sharedResult = (await shared).value;
      if (
        !beforeResult ||
        beforeResult.error ||
        !afterResult ||
        afterResult.error ||
        !sharedResult ||
        sharedResult.error
      ) {
        throw new Error("Error in synchronize");
      }

      expect(beforeResult.value.value).toEqual(oldValue);
      expect(beforeResult.value.channels).toEqual([beforeChannel]);
      expect(beforeResult.value.tombstone).toBe(true);
      expect(afterResult.value.value).toEqual(newValue);
      expect(afterResult.value.channels).toEqual([afterChannel]);
      expect(afterResult.value.tombstone).toBe(false);
      expect(sharedResult.value.value).toEqual(newValue);
      expect(sharedResult.value.channels).toEqual([sharedChannel]);
      expect(sharedResult.value.tombstone).toBe(false);
      expect(beforeResult.value.lastModified).toEqual(
        afterResult.value.lastModified,
      );
      expect(sharedResult.value.lastModified).toEqual(
        afterResult.value.lastModified,
      );
    });

    it("patch", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const beforeChannel = randomString();
      const afterChannel = randomString();
      const sharedChannel = randomString();

      const oldValue = { hello: "world" };
      const oldChannels = [beforeChannel, sharedChannel];
      const putted = await graffiti.put(
        {
          value: oldValue,
          channels: oldChannels,
        },
        session,
      );

      // Start listening for changes...
      const before = graffiti.synchronizeDiscover([beforeChannel], {}).next();
      const after = graffiti.synchronizeDiscover([afterChannel], {}).next();
      const shared = graffiti.synchronizeDiscover([sharedChannel], {}).next();

      await graffiti.patch(
        {
          value: [
            {
              op: "add",
              path: "/something",
              value: "new value",
            },
          ],
          channels: [
            {
              op: "add",
              path: "/-",
              value: afterChannel,
            },
            {
              op: "remove",
              path: `/${oldChannels.indexOf(beforeChannel)}`,
            },
          ],
        },
        putted,
        session,
      );

      const beforeResult = (await before).value;
      const afterResult = (await after).value;
      const sharedResult = (await shared).value;
      if (
        !beforeResult ||
        beforeResult.error ||
        !afterResult ||
        afterResult.error ||
        !sharedResult ||
        sharedResult.error
      ) {
        throw new Error("Error in synchronize");
      }

      const newValue = { ...oldValue, something: "new value" };
      const newChannels = [sharedChannel, afterChannel];
      expect(beforeResult.value.value).toEqual(oldValue);
      expect(beforeResult.value.channels).toEqual([beforeChannel]);
      expect(beforeResult.value.tombstone).toBe(true);
      expect(afterResult.value.value).toEqual(newValue);
      expect(afterResult.value.channels).toEqual([afterChannel]);
      expect(afterResult.value.tombstone).toBe(false);
      expect(sharedResult.value.value).toEqual(newValue);
      expect(sharedResult.value.channels).toEqual([sharedChannel]);
      expect(sharedResult.value.tombstone).toBe(false);
      expect(beforeResult.value.lastModified).toEqual(
        afterResult.value.lastModified,
      );
      expect(sharedResult.value.lastModified).toEqual(
        afterResult.value.lastModified,
      );
    });

    it("delete", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const channels = [randomString(), randomString(), randomString()];

      const oldValue = { hello: "world" };
      const oldChannels = [randomString(), ...channels.slice(1)];
      const putted = await graffiti.put(
        {
          value: oldValue,
          channels: oldChannels,
        },
        session,
      );

      const next = graffiti.synchronizeDiscover(channels, {}).next();

      graffiti.delete(putted, session);

      const result = (await next).value;
      if (!result || result.error) {
        throw new Error("Error in synchronize");
      }
      expect(result.value.tombstone).toBe(true);
      expect(result.value.value).toEqual(oldValue);
      expect(result.value.channels).toEqual(
        channels.filter((c) => oldChannels.includes(c)),
      );
    });

    it("not allowed", async () => {
      const graffiti = useGraffiti();
      const session1 = useSession1();
      const session2 = useSession2();

      const allChannels = [randomString(), randomString(), randomString()];
      const channels = allChannels.slice(1);

      const creatorNext = graffiti
        .synchronizeDiscover(channels, {}, session1)
        .next();
      const allowedNext = graffiti
        .synchronizeDiscover(channels, {}, session2)
        .next();
      const noSession = graffiti.synchronizeDiscover(channels, {}).next();

      const value = {
        hello: "world",
      };
      const allowed = [randomString(), session2.actor];
      await graffiti.put({ value, channels: allChannels, allowed }, session1);

      // Expect no session to time out!
      await expect(
        Promise.race([
          noSession,
          new Promise((resolve, rejects) =>
            setTimeout(rejects, 100, "Timeout"),
          ),
        ]),
      ).rejects.toThrow("Timeout");

      const creatorResult = (await creatorNext).value;
      const allowedResult = (await allowedNext).value;

      if (
        !creatorResult ||
        creatorResult.error ||
        !allowedResult ||
        allowedResult.error
      ) {
        throw new Error("Error in synchronize");
      }

      expect(creatorResult.value.value).toEqual(value);
      expect(creatorResult.value.allowed).toEqual(allowed);
      expect(creatorResult.value.channels).toEqual(allChannels);
      expect(allowedResult.value.value).toEqual(value);
      expect(allowedResult.value.allowed).toEqual([session2.actor]);
      expect(allowedResult.value.channels).toEqual(channels);
    });
  });

  describe("synchronizeGet", () => {
    it("replace, delete", async () => {
      const graffiti = useGraffiti();
      const session = useSession1();

      const object = randomPutObject();
      const putted = await graffiti.put(object, session);

      const iterator = graffiti.synchronizeGet(putted, {});
      const next = iterator.next();

      // Change the object
      const newValue = { goodbye: "world" };
      const putted2 = await graffiti.put(
        {
          ...putted,
          value: newValue,
        },
        session,
      );

      const result = (await next).value;
      assert(result && !result.error);

      expect(result.value.value).toEqual(newValue);
      expect(result.value.actor).toEqual(session.actor);
      expect(result.value.channels).toEqual([]);
      expect(result.value.tombstone).toBe(false);
      expect(result.value.lastModified).toEqual(putted2.lastModified);
      expect(result.value.allowed).toBeUndefined();

      // Delete the object
      const deleted = await graffiti.delete(putted2, session);
      const result2 = (await iterator.next()).value;
      assert(result2 && !result2.error);
      expect(result2.value.tombstone).toBe(true);
      expect(result2.value.lastModified).toEqual(deleted.lastModified);

      // Put something else
      await graffiti.put(randomPutObject(), session);
      await expect(
        Promise.race([
          iterator.next(),
          new Promise((resolve, reject) => setTimeout(reject, 100, "Timeout")),
        ]),
      ).rejects.toThrow("Timeout");
    });

    it("not allowed", async () => {
      const graffiti = useGraffiti();
      const session1 = useSession1();
      const session2 = useSession2();

      const object = randomPutObject();
      const putted = await graffiti.put(object, session1);

      const iterator1 = graffiti.synchronizeGet(putted, {}, session1);
      const iterator2 = graffiti.synchronizeGet(putted, {}, session2);

      const next1 = iterator1.next();
      const next2 = iterator2.next();

      const newValue = { goodbye: "world" };
      const putted2 = await graffiti.put(
        {
          ...putted,
          ...object,
          allowed: [],
          value: newValue,
        },
        session1,
      );
      const result1 = (await next1).value;
      const result2 = (await next2).value;
      assert(result1 && !result1.error);
      assert(result2 && !result2.error);

      expect(result1.value.value).toEqual(newValue);
      expect(result2.value.value).toEqual(object.value);
      expect(result1.value.actor).toEqual(session1.actor);
      expect(result2.value.actor).toEqual(session1.actor);
      expect(result1.value.channels).toEqual(object.channels);
      expect(result2.value.channels).toEqual([]);
      expect(result1.value.tombstone).toBe(false);
      expect(result2.value.tombstone).toBe(true);
      expect(result1.value.lastModified).toEqual(putted2.lastModified);
      expect(result2.value.lastModified).toEqual(putted2.lastModified);
    });
  });
};
