import { describe, it, expect } from "vitest";
import { extractJson, firstJsonValue } from "./json.js";

describe("extractJson", () => {
  it("parses a plain object", () => {
    expect(extractJson('{"sameEvent": true}')).toEqual({ sameEvent: true });
  });

  it("parses inside a ```json fence", () => {
    expect(extractJson('```json\n{"sameEvent": false}\n```')).toEqual({ sameEvent: false });
  });

  it("ignores commentary after the object", () => {
    // The shape that failed the 2026-08-11 run: a correct answer, then the
    // model explaining itself. JSON.parse alone throws "Unexpected
    // non-whitespace character after JSON at position 22".
    const reply = '{"sameEvent": false}\n\nThese describe two different summits.';
    expect(extractJson(reply)).toEqual({ sameEvent: false });
  });

  it("ignores a preamble before the object", () => {
    expect(extractJson('Here is the result:\n{"sameEvent": true}')).toEqual({ sameEvent: true });
  });

  it("keeps only the first value when the model answers twice", () => {
    expect(extractJson('{"sameEvent": true}\n{"sameEvent": false}')).toEqual({ sameEvent: true });
  });

  it("parses a top-level array", () => {
    expect(extractJson('[{"id": "a"}] done')).toEqual([{ id: "a" }]);
  });

  it("is not fooled by a brace inside a string", () => {
    const reply = '{"rationale": "the headline read \\"talks resume {sic}\\""} trailing';
    expect(extractJson(reply)).toEqual({ rationale: 'the headline read "talks resume {sic}"' });
  });

  it("throws when the reply holds no JSON at all", () => {
    expect(() => extractJson("I cannot answer that.")).toThrow();
  });

  it("throws when the JSON itself is malformed", () => {
    // Not a parse we should paper over — a truncated object means the reply
    // was cut short, and silently returning half an answer would be worse.
    expect(() => extractJson('{"sameEvent": ')).toThrow();
  });
});

describe("firstJsonValue", () => {
  it("returns null when there is no bracket", () => {
    expect(firstJsonValue("no json here")).toBeNull();
  });

  it("returns null when the value never closes", () => {
    expect(firstJsonValue('{"a": [1, 2')).toBeNull();
  });

  it("handles nesting", () => {
    expect(firstJsonValue('{"a": {"b": [1, {"c": 2}]}} tail')).toBe('{"a": {"b": [1, {"c": 2}]}}');
  });

  it("does not end early on an escaped quote", () => {
    expect(firstJsonValue('{"a": "he said \\"}\\""} tail')).toBe('{"a": "he said \\"}\\""}');
  });
});
