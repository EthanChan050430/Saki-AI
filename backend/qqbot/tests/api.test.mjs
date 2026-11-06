import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apiRequest,
  ApiRequestError,
  MediaFileType,
  uploadC2CMedia,
  uploadGroupMedia,
} from "../dist/src/api.js";

const uploaded = { file_uuid: "uuid", file_info: "info", ttl: 300 };

function mockRequests(t, fetchImpl) {
  const delays = [];
  const setTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, "fetch", fetchImpl);
  t.mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
    // Keep request deadlines real, but avoid waiting for the retry backoff.
    if (delay === 1000 || delay === 2000) {
      delays.push(delay);
      return setTimeout(callback, 0, ...args);
    }
    return setTimeout(callback, delay, ...args);
  });
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  return delays;
}

for (const [scope, upload, status] of [
  ["users", uploadC2CMedia, 502],
  ["groups", uploadGroupMedia, 503],
]) {
  for (const marker of ["400", "401", "Invalid", "timeout", "Timeout", "上传超时"]) {
    test(`${scope}: retries HTTP ${status} when the OpenID contains ${marker}`, async (t) => {
      const openid = `openid-${marker}-suffix`;
      let attempts = 0;
      const delays = mockRequests(t, async (url) => {
        assert.ok(url.endsWith(`/v2/${scope}/${openid}/files`));
        attempts++;
        return attempts === 1
          ? Response.json({ message: "Service unavailable" }, { status })
          : Response.json(uploaded);
      });

      assert.deepEqual(await upload("token", openid, MediaFileType.IMAGE, "https://example.com/image.png"), uploaded);
      assert.equal(attempts, 2);
      assert.deepEqual(delays, [1000]);
    });
  }

  test(`${scope}: response text cannot disable retries and backoff is bounded`, async (t) => {
    let attempts = 0;
    const delays = mockRequests(t, async () => {
      attempts++;
      return Response.json({ message: "Invalid 400 401 timeout Timeout 上传超时" }, { status });
    });

    await assert.rejects(
      upload("token", "ordinary-openid", MediaFileType.IMAGE, "https://example.com/image.png"),
      /API Error/,
    );
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [1000, 2000]);
  });

  test(`${scope}: retries network errors regardless of their message or path`, async (t) => {
    let attempts = 0;
    const delays = mockRequests(t, async () => {
      if (++attempts === 1) throw new TypeError("Invalid 400 401 timeout");
      return Response.json(uploaded);
    });

    assert.deepEqual(
      await upload("token", "openid-400-401-Invalid", MediaFileType.IMAGE, "https://example.com/image.png"),
      uploaded,
    );
    assert.equal(attempts, 2);
    assert.deepEqual(delays, [1000]);
  });

  test(`${scope}: retries transient HTTP errors with a non-JSON body`, async (t) => {
    let attempts = 0;
    const delays = mockRequests(t, async () => {
      attempts++;
      return attempts === 1
        ? new Response("<html>Invalid 400 401 timeout</html>", { status })
        : Response.json(uploaded);
    });

    assert.deepEqual(
      await upload("token", "openid-400-401-Invalid", MediaFileType.IMAGE, "https://example.com/image.png"),
      uploaded,
    );
    assert.equal(attempts, 2);
    assert.deepEqual(delays, [1000]);
  });

  for (const status of [400, 401]) {
    for (const jsonBody of [true, false]) {
      test(`${scope}: HTTP ${status} stops immediately with a ${jsonBody ? "JSON" : "non-JSON"} body`, async (t) => {
        let attempts = 0;
        const delays = mockRequests(t, async () => {
          attempts++;
          return new Response(jsonBody ? '{"message":"Bad request"}' : "Bad request", { status });
        });

        await assert.rejects(
          upload("token", "ordinary-openid", MediaFileType.IMAGE, "https://example.com/image.png"),
          (err) => {
            assert.ok(err instanceof ApiRequestError);
            assert.equal(err.status, status);
            assert.equal(err.isTimeout, false);
            return true;
          },
        );
        assert.equal(attempts, 1);
        assert.deepEqual(delays, []);
      });
    }
  }

  test(`${scope}: aborted uploads stop immediately`, async (t) => {
    let attempts = 0;
    const delays = mockRequests(t, async () => {
      attempts++;
      throw new DOMException("The operation was aborted", "AbortError");
    });

    await assert.rejects(
      upload("token", "ordinary-openid", MediaFileType.IMAGE, "https://example.com/image.png"),
      (err) => {
        assert.ok(err instanceof ApiRequestError);
        assert.equal(err.isTimeout, true);
        assert.match(err.message, /Request timeout/);
        return true;
      },
    );
    assert.equal(attempts, 1);
    assert.deepEqual(delays, []);
  });
}

test("apiRequest marks an expired request deadline as a timeout", async (t) => {
  mockRequests(t, async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));

  await assert.rejects(apiRequest("token", "POST", "/v2/users/openid/files", {}, 1), (err) => {
    assert.ok(err instanceof ApiRequestError);
    assert.equal(err.isTimeout, true);
    assert.equal(err.status, undefined);
    assert.match(err.message, /exceeded 1ms/);
    return true;
  });
});
