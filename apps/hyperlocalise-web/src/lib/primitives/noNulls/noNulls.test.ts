import { describe, expect, it } from "vitest";

import { noNulls } from "./noNulls";

describe("noNulls", () => {
  it("should filter out null values from array", () => {
    const inputArray = [1, 2, null, 3, 4];

    const actualResult = noNulls(inputArray);

    const expectedResult = [1, 2, 3, 4];
    expect(actualResult).toEqual(expectedResult);
  });

  it("should filter out undefined values from array", () => {
    const inputArray = [1, 2, undefined, 3, 4];

    const actualResult = noNulls(inputArray);

    const expectedResult = [1, 2, 3, 4];
    expect(actualResult).toEqual(expectedResult);
  });

  it("should filter out both null and undefined values from array", () => {
    const inputArray = [1, null, 2, undefined, 3, null, undefined, 4];

    const actualResult = noNulls(inputArray);

    const expectedResult = [1, 2, 3, 4];
    expect(actualResult).toEqual(expectedResult);
  });

  it("should return empty array when input contains only null and undefined", () => {
    const inputArray = [null, undefined, null, undefined];

    const actualResult = noNulls(inputArray);

    const expectedResult: unknown[] = [];
    expect(actualResult).toEqual(expectedResult);
  });

  it("should return empty array when input is empty", () => {
    const inputArray: (string | null | undefined)[] = [];

    const actualResult = noNulls(inputArray);

    const expectedResult: string[] = [];
    expect(actualResult).toEqual(expectedResult);
  });

  it("should preserve all values when no null or undefined present", () => {
    const inputArray = [1, 2, 3, 4, 5];

    const actualResult = noNulls(inputArray);

    const expectedResult = [1, 2, 3, 4, 5];
    expect(actualResult).toEqual(expectedResult);
  });

  it("should work with string arrays", () => {
    const inputArray = ["hello", null, "world", undefined, "test"];

    const actualResult = noNulls(inputArray);

    const expectedResult = ["hello", "world", "test"];
    expect(actualResult).toEqual(expectedResult);
  });

  it("should work with object arrays", () => {
    const inputObject1 = { id: 1, name: "John" };
    const inputObject2 = { id: 2, name: "Jane" };
    const inputArray = [inputObject1, null, inputObject2, undefined];

    const actualResult = noNulls(inputArray);

    const expectedResult = [inputObject1, inputObject2];
    expect(actualResult).toEqual(expectedResult);
  });

  it("should preserve falsy values that are not null or undefined", () => {
    const inputArray = [0, false, "", null, undefined, NaN];

    const actualResult = noNulls(inputArray);

    const expectedResult = [0, false, "", NaN];
    expect(actualResult).toEqual(expectedResult);
  });

  it("should maintain array order after filtering", () => {
    const inputArray = ["first", null, "second", undefined, "third", null, "fourth"];

    const actualResult = noNulls(inputArray);

    const expectedResult = ["first", "second", "third", "fourth"];
    expect(actualResult).toEqual(expectedResult);
  });

  it("should work with nested arrays", () => {
    const inputNestedArray1 = [1, 2];
    const inputNestedArray2 = [3, 4];
    const inputArray = [inputNestedArray1, null, inputNestedArray2, undefined];

    const actualResult = noNulls(inputArray);

    const expectedResult = [inputNestedArray1, inputNestedArray2];
    expect(actualResult).toEqual(expectedResult);
  });
});
